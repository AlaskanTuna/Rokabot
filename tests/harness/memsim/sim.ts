import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import type { Client, Message } from 'discord.js'
import { makeChannel, makeClient, makeGuild, makeMessage } from '../discordDoubles.js'
import { type CacheMode, MemsimCache, type ProviderBudgets } from './cache.js'
import type { BuilderKey, ParityTurnResult, TurnRecallObservation } from './checks.js'
import { markGenerateReplayCacheReads } from './generate.js'
import {
  PacedGeminiEmbeddingClient,
  type PrivacyMode,
  type StoreMode,
  installSimModelRoutes,
  prepareSimConfigEnv
} from './routes.js'
import type {
  GateStatus,
  GroundTruthFile,
  MemsimReport,
  RestartCheckResult,
  SimEpisodeEvent,
  SimMediaEvent,
  SimOperatorEvent,
  SimRestartEvent,
  SimScenario,
  SimToolEvent
} from './types.js'

const DAY_MS = 24 * 60 * 60 * 1000
const LULL_ADVANCE_MS = 4 * 60 * 1000

export interface MemsimRunOptions {
  mode: CacheMode
  store?: StoreMode
  privacy?: PrivacyMode
  seedDbPath?: string
  cacheDir?: string
  scenarioPath?: string
  groundTruthPath?: string
  maxDays?: number
  dropLegacyAtDay?: number
  scale?: number
  budgets?: Partial<ProviderBudgets>
  pruneUnused?: boolean
  keepTempDb?: boolean
}

function l2Normalize(raw: number[]): Buffer {
  let sumSq = 0
  for (const v of raw) sumSq += v * v
  const norm = Math.sqrt(sumSq) || 1
  const f32 = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) f32[i] = raw[i]! / norm
  return Buffer.from(f32.buffer)
}

function deterministicVectorBlob(seed: number, dim = 768): Buffer {
  const raw: number[] = []
  for (let i = 0; i < dim; i += 1) {
    raw.push(Math.sin(seed * 0.73 + i * 0.17) + Math.cos(seed * 0.29 - i * 0.05))
  }
  return l2Normalize(raw)
}

function deterministicVectorArray(seed: number, dim = 768): number[] {
  const buf = deterministicVectorBlob(seed, dim)
  const f32 = new Float32Array(buf.buffer, buf.byteOffset, dim)
  return Array.from(f32)
}

function maxTimestampInSeedDb(db: Database.Database): number {
  const queries = [
    'SELECT COALESCE(MAX(last_seen_at), 0) AS ts FROM memory_claim',
    'SELECT COALESCE(MAX(ended_at), 0) AS ts FROM memory_episode',
    'SELECT COALESCE(MAX(created_at), 0) AS ts FROM media_digest',
    'SELECT COALESCE(MAX(observed_at), 0) AS ts FROM media_occurrence',
    'SELECT COALESCE(MAX(timestamp), 0) AS ts FROM memory_episode_line'
  ]
  let maxTs = 0
  for (const sql of queries) {
    const row = db.prepare(sql).get() as { ts: number | null } | undefined
    if (row?.ts && row.ts > maxTs) maxTs = row.ts
  }
  return maxTs
}

function verifyDropLegacySupport(day: number): void {
  const scriptSrc = readFileSync(resolve('scripts/migrate-memory-items.ts'), 'utf8')
  if (!scriptSrc.includes('--drop-legacy')) {
    throw new Error(
      `--drop-legacy-at-day ${day} requested, but scripts/migrate-memory-items.ts does not support --drop-legacy yet (Phase 7).`
    )
  }
}

function runDropLegacyMigration(dbPath: string): void {
  const tsxBin = resolve('node_modules/.bin/tsx')
  const backupPath = `${dbPath}.pre-legacy-drop`
  copyFileSync(dbPath, backupPath)
  const result = spawnSync(
    tsxBin,
    [resolve('scripts/migrate-memory-items.ts'), '--drop-legacy', '--backup', backupPath],
    {
      env: { ...process.env, ROKABOT_DB_PATH: dbPath },
      encoding: 'utf8'
    }
  )
  if (result.status !== 0) {
    throw new Error(
      `migrate-memory-items --drop-legacy failed (status ${result.status}): ${result.stderr || result.stdout}`
    )
  }
}

function assertExternalCacheDir(cacheDir: string): void {
  const repoRoot = resolve('.')
  const resolved = resolve(cacheDir)
  if (resolved === repoRoot || resolved.startsWith(`${repoRoot}/`)) {
    throw new Error(`Seeded runs must use a --cache-dir outside the repository (got ${resolved})`)
  }
}

export async function runMemsim(options: MemsimRunOptions): Promise<MemsimReport> {
  const storeMode: StoreMode = options.store ?? 'dual'
  const privacyMode: PrivacyMode = options.privacy ?? 'balanced'
  if (options.dropLegacyAtDay !== undefined) {
    verifyDropLegacySupport(options.dropLegacyAtDay)
  }
  if (options.seedDbPath) {
    if (!options.cacheDir) {
      throw new Error('Seeded runs require --cache-dir pointing outside the repository')
    }
    assertExternalCacheDir(options.cacheDir)
  }

  const workDir = mkdtempSync(join(tmpdir(), 'roka-memsim-db-'))
  const dbPath = join(workDir, 'sim.db')
  if (options.seedDbPath) {
    if (!existsSync(options.seedDbPath)) {
      throw new Error(`Seed database not found: ${options.seedDbPath}`)
    }
    copyFileSync(options.seedDbPath, dbPath)
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(`${options.seedDbPath}${suffix}`)) {
        copyFileSync(`${options.seedDbPath}${suffix}`, `${dbPath}${suffix}`)
      }
    }
  }

  const cacheDir = resolve(options.cacheDir ?? 'tests/harness/memsim/cache')
  const scenarioPath = resolve(options.scenarioPath ?? 'tests/harness/memsim/scenario.json')
  const groundTruthPath = resolve(options.groundTruthPath ?? 'tests/harness/memsim/ground-truth.json')
  const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8')) as SimScenario
  const groundTruth = JSON.parse(readFileSync(groundTruthPath, 'utf8')) as GroundTruthFile
  const maxDays = options.maxDays ?? scenario.days.length
  if (options.pruneUnused && (options.seedDbPath || maxDays < 30)) {
    throw new Error('--prune-unused is only allowed after a full (>= 30 days) seedless run')
  }

  const cfgEnv = prepareSimConfigEnv({
    dbPath,
    mode: options.mode,
    store: storeMode,
    privacy: privacyMode,
    maxActiveClaimsPerUser: 20
  })

  if (storeMode === 'item') {
    const configModule = await import('../../../src/config.js').catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `--store item is not implemented in this codebase yet (Phase 5 enables memory.store=item): ${msg}`
      )
    })
    if ((configModule.config.memory.store as string) !== 'item') {
      throw new Error('--store item is not implemented in this codebase yet (Phase 5 enables memory.store=item).')
    }
  }

  const {
    WriterTracker,
    checkIntegrityDrift,
    collectDbAuditWriters,
    countPrivateOnlyItemsInDb,
    evaluateGroundTruth,
    extractMemoryBlocksFromSystemPrompt,
    installDbAuditTriggers,
    runPhase4ParityCheck,
    summarizeTimings
  } = await import('./checks.js')
  const { config } = await import('../../../src/config.js')
  const { closeDb, getDb } = await import('../../../src/storage/database.js')
  const {
    resetForTest: resetExtractionScheduler,
    setSerialDrainForTest,
    startExtractionScheduler,
    stopExtractionScheduler,
    waitForInFlightExtractions
  } = await import('../../../src/agent/memory/scheduler.js')
  const { claimNextForGuild, resetStuckProcessing, pruneFailedExtractionJobs } = await import(
    '../../../src/storage/extractionQueue.js'
  )
  const { pruneExtractionSamples } = await import('../../../src/storage/extractionSampleStore.js')
  const { configureMemoryItemProjectionTriggers } = await import('../../../src/storage/memoryItemProjection.js')
  const { fillMemoryItemEmbeddingHashes, sweepMemoryItemIntegrity } = await import(
    '../../../src/storage/memoryItemIntegrity.js'
  )
  const { migrateMemoryItems } = await import('../../../src/storage/memoryItemBackfill.js')
  const { flushEpisode, flushOpenEpisodes, resetEpisodeTrackerForTest, restoreOpenEpisodes } = await import(
    '../../../src/agent/memory/episodeTracker.js'
  )
  const { getMessages: getBufferMessages, resetAllBuffers } = await import('../../../src/agent/memory/passiveBuffer.js')
  const { resetJevClientForTest } = await import('../../../src/agent/jev/client.js')
  const { clearSavedOpenEpisodes, recordOpenEpisodeMessage, saveMemoryEpisode } = await import(
    '../../../src/storage/memoryEpisodeStore.js'
  )
  const { recordMediaOccurrence, saveMediaDigest } = await import('../../../src/storage/mediaDigestStore.js')
  const { markActive, restoreMonitoredChannels } = await import('../../../src/agent/memory/channelMonitor.js')
  const { registerChannelVisibility, resetChannelVisibilityForTest } = await import(
    '../../../src/agent/memory/channelVisibility.js'
  )
  const { pruneEpisodesAndReembed } = await import('../../../src/agent/memory/episodeMaintenance.js')
  const { reclassifyClaims, undoReclassify } = await import('../../../src/agent/memory/reclassify.js')
  const {
    activateClaim,
    assertClaim,
    assertGuildClaim,
    getActiveClaims,
    pinClaim,
    pruneActiveClaimOverflow,
    pruneStaleClaims,
    rejectActiveClaimById,
    rejectActiveGuildClaimById,
    rejectClaimIdsForSpeaker,
    replaceActiveGuildClaim,
    retractClaim,
    unpinClaim
  } = await import('../../../src/agent/memory/memoryClaims.js')
  const { embedPendingFacts } = await import('../../../src/agent/memory/factEmbeddings.js')
  const mediaCache = await import('../../../src/agent/media/mediaCache.js')
  const { forgetUser } = await import('../../../src/agent/tools/forgetUser.js')
  const { recallUser } = await import('../../../src/agent/tools/recallUser.js')
  const { rememberUser } = await import('../../../src/agent/tools/rememberUser.js')
  const { RateLimiter } = await import('../../../src/utils/rateLimiter.js')
  const { destroySession } = await import('../../../src/agent/session.js')
  const { getChannelUsers } = await import('../../../src/storage/sessionStore.js')
  const { createMessageHandler } = await import('../../../src/discord/events/messageCreate.js')
  const { extractCurrentMessageContent } = await import('../../../src/discord/messageContent.js')
  const roka = await import('../../../src/agent/roka.js')
  const { readGuildFacts, readSubjectSnapshot, readTurnSnapshot, selectForSubject, selectForTurn, selectGuildFacts } =
    await import('../../../src/agent/memory/retriever.js')
  const { readRecallableEpisodes, selectEpisodes, selectEpisodesWithinBudget, formatEpisodeRecallBlock } = await import(
    '../../../src/agent/memory/episodeRetriever.js'
  )
  const { readRecallableMedia, selectMedia, formatMediaRecallBlock } = await import(
    '../../../src/agent/memory/mediaRecall.js'
  )
  const {
    itemIdForClaimRef,
    readItemGuildFacts,
    readItemMediaCandidates,
    readItemRecallableEpisodes,
    readItemSubjectSnapshot,
    readItemTurnSnapshot
  } = await import('../../../src/agent/memory/memoryItems.js')
  const { buildFactsEnvelope } = await import('../../../src/agent/promptSafety.js')
  const { formatRecallUserFacts, MAX_RECALLED_FACTS } = await import('../../../src/agent/tools/recallUser.js')
  const { formatGuildFactsBlock } = await import('../../../src/agent/turnContext.js')

  const cache = new MemsimCache({ mode: options.mode, cacheDir, budgets: options.budgets })
  const routesHandle = await installSimModelRoutes(cache)

  const originalDateNow = Date.now
  const simDb = getDb()
  const seedOffsetMs = options.seedDbPath ? Math.max(0, maxTimestampInSeedDb(simDb) + DAY_MS - scenario.baseTimeMs) : 0
  let simNowMs = scenario.baseTimeMs + seedOffsetMs
  Date.now = () => simNowMs

  const isPrivateChannel = (channelId: string | null): boolean =>
    channelId ? (channelVisibilityMap.get(channelId) ?? 'private') !== 'public' : true

  const channelVisibilityMap = new Map<string, 'public' | 'private'>()
  for (const guild of scenario.guilds) {
    for (const ch of guild.channels) channelVisibilityMap.set(ch.id, ch.visibility)
  }
  registerChannelVisibility({
    visibility: (channelId) => channelVisibilityMap.get(channelId) ?? 'private',
    parentOf: () => null
  })

  if (options.seedDbPath) {
    const itemCount = (simDb.prepare('SELECT COUNT(*) AS count FROM memory_item').get() as { count: number }).count
    const claimCount = (simDb.prepare('SELECT COUNT(*) AS count FROM memory_claim').get() as { count: number }).count
    if (claimCount > 0 && itemCount === 0) {
      migrateMemoryItems(simDb)
    }
  }

  let simRandomState = 0x5f3759df
  const simRandom = () => {
    simRandomState = (Math.imul(simRandomState, 1664525) + 1013904223) | 0
    return (simRandomState >>> 0) / 0x1_0000_0000
  }

  configureMemoryItemProjectionTriggers(simDb, storeMode)
  installDbAuditTriggers(simDb, storeMode)
  fillMemoryItemEmbeddingHashes(simDb)
  sweepMemoryItemIntegrity(simDb)
  restoreMonitoredChannels()
  resetStuckProcessing()
  restoreOpenEpisodes()
  setSerialDrainForTest(true)
  startExtractionScheduler()
  simDb.exec('DELETE FROM memsim_writer_events')

  const channelRegistry = new Map<string, ReturnType<typeof makeChannel>>()
  const guildRegistry = new Map<string, ReturnType<typeof makeGuild>>()

  for (const g of scenario.guilds) {
    const guild = makeGuild()
    guildRegistry.set(g.id, guild)
    for (const c of g.channels) {
      const channel = makeChannel({ id: c.id })
      channelRegistry.set(c.id, channel)
    }
  }
  for (const dm of scenario.dmChannels) {
    const dmCh = makeChannel({ id: dm.id })
    channelRegistry.set(dm.id, dmCh)
  }

  const client = makeClient({
    user: { id: scenario.botUserId, username: 'roka', displayName: scenario.botDisplayName, bot: true },
    channels: channelRegistry
  })

  const rateLimiter = new RateLimiter({ rpm: 1000, rpd: 100_000 })
  const handleMessage = createMessageHandler(client as unknown as Client, rateLimiter)

  const writerTracker = new WriterTracker()
  const parityTimingSamples: {
    legacy: Record<BuilderKey, number[]>
    item: Record<BuilderKey, number[]>
  } = {
    legacy: { userFacts: [], guildFacts: [], episodes: [], media: [], recallUser: [] },
    item: { userFacts: [], guildFacts: [], episodes: [], media: [], recallUser: [] }
  }
  let parityTurnsChecked = 0
  let parityMismatches = 0
  const parityMismatchDetails: string[] = []
  const dailyDrifts: Array<{ day: number; fact: number; episode: number; media: number }> = []
  const turnObservations: TurnRecallObservation[] = []
  let messagesProcessed = 0
  const episodesExtractedBeforeStart = (
    getDb()
      .prepare(
        storeMode === 'item'
          ? "SELECT COUNT(*) AS count FROM memory_item WHERE kind = 'episode'"
          : 'SELECT COUNT(*) AS count FROM memory_episode'
      )
      .get() as { count: number }
  ).count

  let restartsTotal = 0
  let crashRestarts = 0
  let gracefulRestarts = 0
  let openLinesBeforeRestart = 0
  let openLinesRestored = 0
  let openLinesFlushed = 0
  let stuckResetTotal = 0

  const perRestartResults: RestartCheckResult[] = []
  let firstEventDrift: { eventId: string; day: number; fact: number; episode: number; media: number } | undefined
  let legacyDropped = false

  const personaById = new Map(scenario.personas.map((p) => [p.id, p]))
  const seededOverflowIds: number[] = []
  let pendingScriptedReply = 'Got it.'
  let activeTurnMeta: {
    day: number
    guildId: string | null
    channelId: string
    expectedGtIds: string[]
    visibility: 'public' | 'private' | 'dm'
    preParity: ParityTurnResult | null
    privateOnlyItemsCount: number
  } | null = null

  roka.__setTestRunTurnFactory((systemPrompt: string) => async () => {
    if (activeTurnMeta) {
      const { memoryBlocksText, headingsFound } = extractMemoryBlocksFromSystemPrompt(systemPrompt)
      const p = activeTurnMeta.preParity
      const bothStoresBlocksText = p
        ? [
            p.legacyUserFactsBlock,
            p.legacyGuildFactsBlock,
            p.legacyEpisodesBlock,
            p.legacyMediaBlock,
            p.legacyRecallBlock,
            p.itemUserFactsBlock,
            p.itemGuildFactsBlock,
            p.itemEpisodesBlock,
            p.itemMediaBlock,
            p.itemRecallBlock
          ]
            .filter(Boolean)
            .join('\n')
        : ''
      turnObservations.push({
        day: activeTurnMeta.day,
        guildId: activeTurnMeta.guildId,
        channelId: activeTurnMeta.channelId,
        visibility: activeTurnMeta.visibility,
        expectedGtIds: activeTurnMeta.expectedGtIds,
        fullSystemPrompt: systemPrompt,
        memoryBlocksText,
        bothStoresBlocksText,
        dmHeadingsFound: headingsFound,
        privateOnlyItemsCount: activeTurnMeta.privateOnlyItemsCount
      })
    }
    return {
      text: pendingScriptedReply,
      hasText: true,
      hasFunctionCall: false,
      tone: 'casual',
      modelCalls: 0,
      usage: { inputTokens: 0, outputTokens: 0, thoughtsTokens: 0, cachedTokens: 0, totalTokens: 0 }
    }
  })

  async function drainExtractionAndEmbeds(): Promise<void> {
    const db = getDb()
    // waitForInFlightExtractions resolves only once nothing is in flight, so a zero count here means nothing is queued.
    let drained = false
    for (let round = 0; round < 2000; round += 1) {
      cache.throwIfFatal()
      await waitForInFlightExtractions()
      cache.throwIfFatal()
      const row = db
        .prepare(
          "SELECT COUNT(*) AS count FROM extraction_queue WHERE status IN ('pending', 'processing') AND available_at <= ?"
        )
        .get(simNowMs) as { count: number }
      if (row.count === 0) {
        drained = true
        break
      }
      await new Promise((r) => setTimeout(r, 15))
    }
    if (!drained) throw new Error('memsim: extraction queue did not drain')
    await waitForInFlightExtractions()
    cache.throwIfFatal()
    await embedPendingFacts({ limit: 100, gapMs: 0 })
    cache.throwIfFatal()
    const { getEmbeddingClient } = await import('../../../src/agent/memory/embeddings/client.js')
    const embedClient = getEmbeddingClient()
    if (embedClient instanceof PacedGeminiEmbeddingClient) {
      await embedClient.waitForIdle()
    }
    cache.throwIfFatal()
  }

  async function destroyTrackedSessions(): Promise<void> {
    for (const chId of channelRegistry.keys()) {
      await destroySession(chId)
    }
  }

  async function runRestart(ev: SimRestartEvent): Promise<void> {
    const db = getDb()
    collectDbAuditWriters(db, writerTracker)

    if (ev.simulateStuckProcessing) {
      await stopExtractionScheduler()
      let pendingRow = db
        .prepare("SELECT id, guild_id FROM extraction_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1")
        .get() as { id: number; guild_id: string } | undefined
      if (!pendingRow) {
        const anyOpenChannel = db
          .prepare('SELECT channel_id FROM memory_episode_line GROUP BY channel_id ORDER BY COUNT(*) ASC LIMIT 1')
          .get() as { channel_id: string } | undefined
        if (anyOpenChannel) {
          flushEpisode(anyOpenChannel.channel_id)
          pendingRow = db
            .prepare("SELECT id, guild_id FROM extraction_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1")
            .get() as { id: number; guild_id: string } | undefined
        }
      }
      if (pendingRow) {
        claimNextForGuild(pendingRow.guild_id)
      }
    }

    const stuckJobsBefore = db.prepare("SELECT id FROM extraction_queue WHERE status = 'processing'").all() as Array<{
      id: number
    }>
    const preOpenRows = db
      .prepare('SELECT channel_id, message_id FROM memory_episode_line ORDER BY timestamp ASC, message_id ASC')
      .all() as Array<{ channel_id: string; message_id: string }>
    const preOpenLines = preOpenRows.length
    const preChannels = [...new Set(preOpenRows.map((r) => r.channel_id))]
    const preMessageIds = preOpenRows.map((r) => r.message_id)
    openLinesBeforeRestart += preOpenLines

    const maxQueueIdBefore = (
      db.prepare('SELECT COALESCE(MAX(id), 0) AS maxId FROM extraction_queue').get() as { maxId: number }
    ).maxId

    let restoredLines = 0
    let flushedLines = 0
    let remainingLinesAfterFlush = 0
    let gracefulPayloads: Array<{ payload: string }> | undefined

    if (ev.mode === 'graceful') {
      gracefulRestarts += 1
      await flushOpenEpisodes()
      gracefulPayloads = db
        .prepare('SELECT payload FROM extraction_queue WHERE id > ?')
        .all(maxQueueIdBefore) as Array<{ payload: string }>
      await drainExtractionAndEmbeds()
      collectDbAuditWriters(db, writerTracker)
      flushedLines = preOpenLines
      openLinesFlushed += flushedLines
      if (preChannels.length > 0) {
        const placeholders = preChannels.map(() => '?').join(', ')
        remainingLinesAfterFlush = (
          db
            .prepare(`SELECT COUNT(*) AS count FROM memory_episode_line WHERE channel_id IN (${placeholders})`)
            .get(...preChannels) as { count: number }
        ).count
      }
    } else {
      crashRestarts += 1
    }

    await stopExtractionScheduler()
    resetAllBuffers()
    resetEpisodeTrackerForTest()
    resetExtractionScheduler()
    await destroyTrackedSessions()
    await resetJevClientForTest()
    closeDb()

    const reopened = getDb()
    configureMemoryItemProjectionTriggers(reopened, storeMode)
    installDbAuditTriggers(reopened, storeMode)
    fillMemoryItemEmbeddingHashes(reopened)
    sweepMemoryItemIntegrity(reopened)
    restoreMonitoredChannels()
    const stuckReset = resetStuckProcessing()
    stuckResetTotal += stuckReset

    collectDbAuditWriters(reopened, writerTracker)
    restoreOpenEpisodes()
    const restoreSeen = collectDbAuditWriters(reopened, writerTracker, 'pipeline')
    if (restoreSeen.has('__internal.open_ep_cursor_synced')) {
      writerTracker.recordPipeline('memoryEpisodeStore.syncOpenEpisodeCursorsToLineCounts')
    }

    if (ev.mode === 'crash') {
      const restoredMsgIds = new Set<string>()
      for (const chId of preChannels) {
        for (const buffered of getBufferMessages(chId)) {
          restoredMsgIds.add(buffered.messageId)
        }
      }
      restoredLines = preMessageIds.filter((id) => restoredMsgIds.has(id)).length
      openLinesRestored += restoredLines

      simNowMs += LULL_ADVANCE_MS
      await flushOpenEpisodes()
      flushedLines = restoredLines
      openLinesFlushed += flushedLines
      if (preChannels.length > 0) {
        const placeholders = preChannels.map(() => '?').join(', ')
        remainingLinesAfterFlush = (
          reopened
            .prepare(`SELECT COUNT(*) AS count FROM memory_episode_line WHERE channel_id IN (${placeholders})`)
            .get(...preChannels) as { count: number }
        ).count
      }
    }

    const newPayloads =
      gracefulPayloads ??
      (reopened.prepare('SELECT payload FROM extraction_queue WHERE id > ?').all(maxQueueIdBefore) as Array<{
        payload: string
      }>)
    // Only episode messages count; a line that reappears as another job's context was not flushed.
    const enqueuedMessageIds = new Set(
      newPayloads.flatMap((r) =>
        (JSON.parse(r.payload) as { messages: Array<{ messageId: string }> }).messages.map((m) => m.messageId)
      )
    )
    const allMessagesEnqueued = preMessageIds.every((msgId) => enqueuedMessageIds.has(msgId))

    startExtractionScheduler()
    await drainExtractionAndEmbeds()
    collectDbAuditWriters(getDb(), writerTracker)

    let stuckJobsCompleted = 0
    if (stuckJobsBefore.length > 0) {
      const placeholders = stuckJobsBefore.map(() => '?').join(', ')
      const stillQueued = (
        getDb()
          .prepare(`SELECT COUNT(*) AS count FROM extraction_queue WHERE id IN (${placeholders})`)
          .get(...stuckJobsBefore.map((j) => j.id)) as { count: number }
      ).count
      stuckJobsCompleted = stuckJobsBefore.length - stillQueued
    }

    restartsTotal += 1
    const restartPassed =
      preOpenLines >= 1 &&
      (ev.mode === 'graceful' || restoredLines === preOpenLines) &&
      remainingLinesAfterFlush === 0 &&
      allMessagesEnqueued &&
      (!ev.simulateStuckProcessing || (stuckReset >= 1 && stuckJobsCompleted >= stuckReset))

    perRestartResults.push({
      id: ev.id,
      mode: ev.mode,
      openLinesBefore: preOpenLines,
      restoredLines,
      flushedLines,
      remainingLinesAfterFlush,
      stuckReset,
      stuckJobsCompleted,
      passed: restartPassed
    })
  }

  async function runEpisode(ep: SimEpisodeEvent, day: number): Promise<void> {
    const channel = channelRegistry.get(ep.channelId)
    if (!channel) throw new Error(`Unknown channel ${ep.channelId}`)
    if (ep.guildId && !ep.isDm) markActive(ep.channelId)

    let msgTime = simNowMs
    for (const msg of ep.messages) {
      msgTime += msg.delayMs
      simNowMs = msgTime
      const persona = personaById.get(msg.userId) ?? { id: msg.userId, username: msg.userId, displayName: msg.userId }

      const isBotTurn = Boolean(msg.rokaReply)
      pendingScriptedReply = msg.rokaReply ?? 'Okay.'

      const message = makeMessage({
        id: msg.id,
        channelId: ep.channelId,
        guildId: ep.guildId,
        guild: ep.guildId ? (guildRegistry.get(ep.guildId) ?? null) : null,
        channel,
        author: { id: persona.id, username: persona.username, displayName: persona.displayName, bot: false },
        content: msg.content,
        createdTimestamp: msgTime,
        mentions: isBotTurn ? [scenario.botUserId] : []
      }) as unknown as Message

      if (isBotTurn) {
        const visibility: 'public' | 'private' | 'dm' =
          ep.isDm || !ep.guildId ? 'dm' : (channelVisibilityMap.get(ep.channelId) ?? 'private')
        let preParity: ParityTurnResult | null = null
        if (ep.guildId && !ep.isDm && !legacyDropped) {
          const channelUsers = getChannelUsers(ep.channelId, config.session.windowSize)
          const recentIds = [...channelUsers.keys()]
          const currentMessage = extractCurrentMessageContent(message, scenario.botUserId, [])
          preParity = await runPhase4ParityCheck(getDb(), {
            guildId: ep.guildId,
            channelId: ep.channelId,
            speakerId: msg.userId,
            message: currentMessage,
            mentionedUserIds: [],
            recentUserIds: recentIds,
            now: simNowMs,
            includeEpisodeRecall: config.memory.privacy !== 'off',
            storeMode
          })
          parityTurnsChecked += 1
          if (preParity.mismatches.length > 0) {
            parityMismatches += 1
            parityMismatchDetails.push(`day ${day} ${ep.channelId}: ${preParity.mismatches.join(',')}`)
          }
          for (const key of ['userFacts', 'guildFacts', 'episodes', 'media', 'recallUser'] as BuilderKey[]) {
            parityTimingSamples.legacy[key].push(preParity.timings.legacy[key])
            parityTimingSamples.item[key].push(preParity.timings.item[key])
          }
        }
        activeTurnMeta = {
          day,
          guildId: ep.guildId,
          channelId: ep.channelId,
          expectedGtIds: msg.expectedRecallGtIds ?? [],
          visibility,
          preParity,
          privateOnlyItemsCount:
            ep.isDm || legacyDropped ? 0 : countPrivateOnlyItemsInDb(getDb(), isPrivateChannel, storeMode)
        }
      } else {
        activeTurnMeta = null
      }

      await handleMessage(message)
      messagesProcessed += 1
      activeTurnMeta = null

      if (isBotTurn && ep.guildId && !ep.isDm) {
        const botReplyMsg = makeMessage({
          id: `${msg.id}-roka-reply`,
          channelId: ep.channelId,
          guildId: ep.guildId,
          guild: guildRegistry.get(ep.guildId) ?? null,
          channel,
          author: { id: scenario.botUserId, username: 'roka', displayName: scenario.botDisplayName, bot: true },
          content: pendingScriptedReply,
          createdTimestamp: msgTime + 1000
        }) as unknown as Message
        await handleMessage(botReplyMsg)
        messagesProcessed += 1
      }
    }

    if (!ep.leaveOpen && ep.guildId && !ep.isDm) {
      simNowMs += LULL_ADVANCE_MS
      flushEpisode(ep.channelId)
      await drainExtractionAndEmbeds()
    }
    collectDbAuditWriters(getDb(), writerTracker)
  }

  async function runMedia(ev: SimMediaEvent): Promise<void> {
    const existingDigest = getDb()
      .prepare(
        storeMode === 'item'
          ? "SELECT COALESCE(legacy_id, id) AS id FROM memory_item WHERE kind = 'media' AND content_key = ? AND guild_id = ?"
          : 'SELECT id FROM media_digest WHERE content_key = ? AND guild_id = ?'
      )
      .get(ev.contentKey, ev.guildId) as { id: number } | undefined
    if (existingDigest) {
      mediaCache.recordShare(
        { guildId: ev.guildId, channelId: ev.channelId, userId: ev.userId, messageId: ev.messageId },
        {
          url: `https://sim.invalid/${ev.label}`,
          contentType: ev.mediaKind === 'video' ? 'video/mp4' : 'image/png',
          size: 4096,
          origin: 'upload'
        },
        existingDigest.id
      )
    } else {
      await mediaCache.remember(
        { guildId: ev.guildId, channelId: ev.channelId, userId: ev.userId, messageId: ev.messageId },
        {
          url: `https://sim.invalid/${ev.label}`,
          contentType: ev.mediaKind === 'video' ? 'video/mp4' : 'image/png',
          size: 4096,
          origin: 'upload'
        },
        ev.contentKey,
        {
          kind: ev.mediaKind === 'audio' ? 'audio' : 'video',
          label: ev.label,
          durationSec: 25,
          mode: 'whole',
          fps: null,
          bins: [],
          observations: {
            summary: ev.summary,
            timeline: [],
            speech: [],
            onScreenText: [],
            uncertainties: []
          },
          incomplete: false
        }
      )
    }
    const { getEmbeddingClient } = await import('../../../src/agent/memory/embeddings/client.js')
    const embedClient = getEmbeddingClient()
    if (embedClient instanceof PacedGeminiEmbeddingClient) {
      await embedClient.waitForIdle()
    }
    collectDbAuditWriters(getDb(), writerTracker, 'pipeline')
  }

  async function runTool(ev: SimToolEvent): Promise<void> {
    collectDbAuditWriters(getDb(), writerTracker, 'pipeline')
    if (ev.action === 'remember_user') {
      rememberUser({
        guild_id: ev.guildId,
        channel_id: ev.channelId,
        user_id: ev.userId,
        fact_key: ev.factKey ?? 'misc',
        fact_value: ev.factValue ?? 'Misc note'
      })
    } else if (ev.action === 'forget_user') {
      forgetUser({
        guild_id: ev.guildId,
        channel_id: ev.channelId,
        user_id: ev.userId,
        query: ev.query ?? ''
      })
    } else if (ev.action === 'recall_user') {
      await recallUser({
        guild_id: ev.guildId,
        channel_id: ev.channelId,
        user_id: ev.userId,
        message: ev.query ?? ''
      })
    }
    collectDbAuditWriters(getDb(), writerTracker, 'scripted')
  }

  function runOperator(ev: SimOperatorEvent): void {
    const db = getDb()
    collectDbAuditWriters(db, writerTracker, 'pipeline')
    if (ev.action === 'seed_aged_throwaways') {
      const savedNow = simNowMs
      try {
        simNowMs = savedNow - 95 * DAY_MS
        const expiredClaim = assertClaim({
          guildId: ev.guildId,
          subjectUserId: ev.userId,
          predicate: 'misc',
          value: 'temporary conference badge pickup',
          sourceKind: 'passive',
          observedAt: simNowMs
        })
        if (storeMode === 'item') {
          const itemId = itemIdForClaimRef(db, expiredClaim.id)
          if (itemId === undefined) throw new Error('Could not resolve the aged claim in memory_item')
          db.prepare('UPDATE memory_item SET valid_until = ? WHERE id = ?').run(savedNow - DAY_MS, itemId)
        } else {
          db.prepare('UPDATE memory_claim SET expires_at = ? WHERE id = ?').run(savedNow - DAY_MS, expiredClaim.id)
        }

        const nextEpId =
          (
            db
              .prepare(
                storeMode === 'item'
                  ? "SELECT COALESCE(MAX(source_job_id), 0) AS maxId FROM memory_item WHERE kind = 'episode'"
                  : 'SELECT COALESCE(MAX(id), 0) AS maxId FROM memory_episode'
              )
              .get() as { maxId: number }
          ).maxId + 1000
        const syntheticVec = {
          values: deterministicVectorArray(77),
          modelId: config.embeddings.model,
          dim: config.embeddings.dim,
          fingerprint: config.embeddings.fingerprint
        }
        saveMemoryEpisode({
          id: nextEpId,
          guildId: ev.guildId,
          channelId: ev.channelId ?? 'sim-north-general',
          startedAt: simNowMs,
          endedAt: simNowMs + 60_000,
          summary: 'Old seasonal check-in ready for episode retention pruning.',
          embedding: syntheticVec
        })

        const agedDigest = saveMediaDigest({
          guildId: ev.guildId,
          contentKey: 'sim:aged:d00-throwaway',
          kind: 'video',
          label: 'old-season-clip.mp4',
          summary: 'Old throwaway video ready for media retention pruning.',
          digestJson: JSON.stringify({ summary: 'Old throwaway video ready for media retention pruning.' }),
          embedding: syntheticVec
        })
        if (agedDigest) {
          recordMediaOccurrence({
            digestId: agedDigest.id,
            guildId: ev.guildId,
            channelId: ev.channelId ?? 'sim-north-general',
            messageId: 'sim-aged-media-msg-1',
            sharedByUserId: ev.userId,
            sourceAuthorId: ev.userId,
            origin: 'upload',
            observedAt: simNowMs
          })
        }

        simNowMs = savedNow
        saveMemoryEpisode({
          id: nextEpId + 1,
          guildId: ev.guildId,
          channelId: ev.channelId ?? 'sim-north-general',
          startedAt: savedNow - 5000,
          endedAt: savedNow - 1000,
          summary: 'Early Day 1 commons greeting before embedding backfill ran.',
          embedding: null
        })
      } finally {
        simNowMs = savedNow
      }
    } else if (ev.action === 'seed_overflow_facts') {
      const existingActive = getActiveClaims(ev.guildId, ev.userId)
      for (const existing of existingActive) {
        if (!existing.pinned) pinClaim(existing.id)
        seededOverflowIds.push(existing.id)
      }
      const targetCount = config.memory.maxActiveClaimsPerUser + 2
      for (let idx = 1; idx <= targetCount; idx += 1) {
        const claimed = assertClaim({
          guildId: ev.guildId,
          subjectUserId: ev.userId,
          predicate: 'hobby',
          value: `Synthetic overflow note number ${idx}`,
          sourceKind: 'passive',
          observedAt: simNowMs + idx
        })
        pinClaim(claimed.id)
        seededOverflowIds.push(claimed.id)
      }
    } else if (ev.action === 'pin_unpin_claim') {
      const target = getActiveClaims(ev.guildId, ev.userId)[0]
      if (target) {
        pinClaim(target.id)
        unpinClaim(target.id)
      }
    } else if (ev.action === 'prune_overflow') {
      for (const id of seededOverflowIds) {
        unpinClaim(id)
      }
      collectDbAuditWriters(db, writerTracker, 'scripted')
      pruneActiveClaimOverflow()
      const seen = collectDbAuditWriters(db, writerTracker, 'scripted')
      if (seen.has('memoryClaims.evictOverflowForAllSubjects')) {
        writerTracker.recordScripted('memoryClaims.pruneActiveClaimOverflow')
      }
      return
    } else if (ev.action === 'activate_candidate') {
      let row = db
        .prepare(
          storeMode === 'item'
            ? "SELECT COALESCE(legacy_id, id) AS id FROM memory_item WHERE kind = 'fact' AND guild_id = ? AND subject_kind = 'user' AND status = 'candidate' LIMIT 1"
            : "SELECT id FROM memory_claim WHERE guild_id = ? AND subject_kind = 'user' AND status = 'candidate' LIMIT 1"
        )
        .get(ev.guildId) as { id: number } | undefined
      if (!row) {
        const seeded = assertClaim({
          guildId: ev.guildId,
          subjectUserId: ev.userId,
          predicate: 'hobby',
          value: 'origami geometry',
          sourceKind: 'passive',
          status: 'candidate',
          needsReview: true,
          observedAt: simNowMs
        })
        row = { id: seeded.id }
      }
      activateClaim(ev.guildId, row.id)
    } else if (ev.action === 'undo_last_reclassify') {
      const row = db
        .prepare(
          storeMode === 'item'
            ? "SELECT COALESCE(legacy_id, id) AS id FROM memory_item WHERE kind = 'fact' AND end_reason = 'reclassified' ORDER BY id DESC LIMIT 1"
            : "SELECT id FROM memory_claim WHERE end_reason = 'reclassified' ORDER BY id DESC LIMIT 1"
        )
        .get() as { id: number } | undefined
      if (row) {
        undoReclassify(row.id)
      }
    } else if (ev.action === 'retract_explicit') {
      assertClaim({
        guildId: ev.guildId,
        subjectUserId: ev.userId,
        predicate: 'hobby',
        value: 'temporary glassblowing experiment',
        sourceKind: 'explicit',
        observedAt: simNowMs - 1000
      })
      collectDbAuditWriters(db, writerTracker, 'scripted')
      retractClaim({
        guildId: ev.guildId,
        subjectUserId: ev.userId,
        predicate: 'hobby',
        value: 'temporary glassblowing experiment'
      })
      const seen = collectDbAuditWriters(db, writerTracker, 'scripted')
      if (seen.has('memoryClaims.rejectActiveClaimById')) {
        writerTracker.recordScripted('memoryClaims.retractClaim')
      }
      return
    } else if (ev.action === 'reject_user_claim') {
      const tmp = assertClaim({
        guildId: ev.guildId,
        subjectUserId: ev.userId,
        predicate: ev.factKey ?? 'misc',
        value: ev.factValue ?? 'temporary operator removal check',
        sourceKind: 'explicit',
        observedAt: simNowMs
      })
      collectDbAuditWriters(db, writerTracker, 'scripted')
      rejectActiveClaimById({ guildId: ev.guildId, subjectUserId: ev.userId, existingId: tmp.id })
    } else if (ev.action === 'replace_guild_claim') {
      const priorGuild = assertGuildClaim({
        guildId: ev.guildId,
        predicate: 'plan',
        value: 'evening studio cleanup',
        expiresAt: simNowMs + DAY_MS,
        eventDate: null,
        sourceKind: 'passive',
        channelId: ev.channelId ?? 'sim-north-general',
        observedAt: simNowMs - 1000
      })
      collectDbAuditWriters(db, writerTracker, 'scripted')
      replaceActiveGuildClaim({
        guildId: ev.guildId,
        existingId: priorGuild.id,
        predicate: 'plan',
        value: ev.factValue ?? 'evening studio cleanup moved to Sunday',
        expiresAt: simNowMs + DAY_MS,
        eventDate: null,
        channelId: ev.channelId ?? 'sim-north-general',
        observedAt: simNowMs
      })
    } else if (ev.action === 'reject_guild_claim') {
      const tmpGuild = assertGuildClaim({
        guildId: ev.guildId,
        predicate: 'plan',
        value: ev.factValue ?? 'temporary cancelled studio picnic',
        expiresAt: simNowMs + DAY_MS,
        sourceKind: 'explicit',
        observedAt: simNowMs
      })
      collectDbAuditWriters(db, writerTracker, 'scripted')
      rejectActiveGuildClaimById({ guildId: ev.guildId, existingId: tmpGuild.id })
    } else if (ev.action === 'clear_saved_open_episodes') {
      recordOpenEpisodeMessage({
        guildId: ev.guildId,
        channelId: ev.channelId ?? 'sim-north-general',
        openedAt: simNowMs,
        line: {
          messageId: `sim-clear-open-ep-${ev.id}`,
          userId: ev.userId,
          displayName: personaById.get(ev.userId)?.displayName ?? ev.userId,
          content: 'Closing temporary cursor state before maintenance.',
          timestamp: simNowMs,
          isBot: false
        }
      })
      collectDbAuditWriters(db, writerTracker, 'scripted')
      clearSavedOpenEpisodes()
      const seen = collectDbAuditWriters(db, writerTracker, 'scripted')
      if (seen.has('__internal.open_ep_line_deleted') || seen.has('__internal.open_ep_cursor_cleared')) {
        writerTracker.recordScripted('memoryEpisodeStore.clearSavedOpenEpisodes')
      }
      return
    }
    collectDbAuditWriters(db, writerTracker, 'scripted')
  }

  try {
    for (const dayPlan of scenario.days.slice(0, maxDays)) {
      const dayStartMs = scenario.baseTimeMs + seedOffsetMs + (dayPlan.day - 1) * DAY_MS
      for (const ev of dayPlan.events) {
        simNowMs = dayStartMs + ev.offsetMs
        if (ev.kind === 'episode') await runEpisode(ev, dayPlan.day)
        else if (ev.kind === 'media') await runMedia(ev)
        else if (ev.kind === 'tool') await runTool(ev)
        else if (ev.kind === 'operator') runOperator(ev)
        else if (ev.kind === 'restart') await runRestart(ev)

        if (!legacyDropped) {
          const evDrift = checkIntegrityDrift(getDb(), storeMode)
          if (evDrift.total > 0 && !firstEventDrift) {
            firstEventDrift = {
              eventId: ev.id,
              day: dayPlan.day,
              fact: evDrift.fact,
              episode: evDrift.episode,
              media: evDrift.media
            }
          }
        }
      }

      if (options.dropLegacyAtDay !== undefined && dayPlan.day === options.dropLegacyAtDay && !legacyDropped) {
        await stopExtractionScheduler()
        resetAllBuffers()
        resetEpisodeTrackerForTest()
        resetExtractionScheduler()
        await destroyTrackedSessions()
        await resetJevClientForTest()
        closeDb()
        runDropLegacyMigration(dbPath)
        legacyDropped = true
        const reopenedAfterDrop = getDb()
        configureMemoryItemProjectionTriggers(reopenedAfterDrop, storeMode)
        installDbAuditTriggers(reopenedAfterDrop, storeMode)
        fillMemoryItemEmbeddingHashes(reopenedAfterDrop)
        sweepMemoryItemIntegrity(reopenedAfterDrop)
        restoreMonitoredChannels()
        restoreOpenEpisodes()
        startExtractionScheduler()
      }

      // Daily maintenance at end of simulated day
      simNowMs = dayStartMs + 22 * 60 * 60 * 1000
      await drainExtractionAndEmbeds()
      const db = getDb()
      // Item-native maintenance continues to run after the legacy tables are dropped.
      collectDbAuditWriters(db, writerTracker, 'pipeline')
      pruneStaleClaims(config.memory.claimRetentionDays, scenario.botUserId)
      collectDbAuditWriters(db, writerTracker, 'pipeline')

      await reclassifyClaims(simRandom)
      const recSeen = collectDbAuditWriters(db, writerTracker, 'pipeline')
      if (recSeen.has('reclassify.moveClaim')) {
        writerTracker.recordPipeline('reclassify.reclassifyClaims')
      }

      pruneFailedExtractionJobs(config.memory.failedExtractionRetentionDays)
      await pruneEpisodesAndReembed(simNowMs)
      pruneExtractionSamples()
      fillMemoryItemEmbeddingHashes(db)

      const beforeMaxEventId = (
        db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM memory_events WHERE kind = 'item_integrity'").get() as {
          id: number
        }
      ).id
      sweepMemoryItemIntegrity(db)
      const integrityRow = db
        .prepare("SELECT detail FROM memory_events WHERE kind = 'item_integrity' AND id > ? ORDER BY id DESC LIMIT 1")
        .get(beforeMaxEventId) as { detail: string } | undefined
      if (!integrityRow) {
        throw new Error(`sweepMemoryItemIntegrity did not write an item_integrity row on day ${dayPlan.day}`)
      }
      const drift = JSON.parse(integrityRow.detail) as { fact: number; episode: number; media: number }
      dailyDrifts.push({ day: dayPlan.day, fact: drift.fact, episode: drift.episode, media: drift.media })
      collectDbAuditWriters(db, writerTracker, 'pipeline')
    }

    const db = getDb()
    fillMemoryItemEmbeddingHashes(db)
    const finalDriftRaw = legacyDropped
      ? { fact: 0, episode: 0, media: 0, total: 0 }
      : checkIntegrityDrift(db, storeMode)
    const finalDrift = { fact: finalDriftRaw.fact, episode: finalDriftRaw.episode, media: finalDriftRaw.media }
    const triggerSummary = writerTracker.summary()
    const quality = evaluateGroundTruth(db, groundTruth, turnObservations, isPrivateChannel, storeMode)

    // Optional --scale N benchmark
    let scale10k: MemsimReport['performance']['scale10k']
    if (options.scale && options.scale > 0) {
      const currentItems = (db.prepare('SELECT COUNT(*) AS count FROM memory_item').get() as { count: number }).count
      const toAdd = Math.max(0, options.scale - currentItems)
      if (toAdd > 0) {
        const claimCount = Math.floor(toAdd * 0.8)
        const episodeCount = Math.floor(toAdd * 0.15)
        const mediaCount = toAdd - claimCount - episodeCount
        const insClaim = db.prepare(
          `INSERT INTO memory_claim (guild_id, subject_kind, subject_user_id, predicate, value, period, source_kind, status, needs_review, confidence, salience, first_seen_at, last_seen_at, embedding, embedding_text, embedding_model_id, embedding_dim, embedding_fingerprint)
           VALUES (?, 'user', ?, 'hobby', ?, 'current', 'passive', 'active', 0, 0.9, 1.0, ?, ?, ?, ?, 'gemini-embedding-2', 768, ?)`
        )
        const insEv = db.prepare(
          'INSERT INTO memory_evidence (claim_id, source_kind, observed_at, channel_id) VALUES (?, ?, ?, ?)'
        )
        const insEp = db.prepare(
          `INSERT INTO memory_episode (guild_id, channel_id, started_at, ended_at, summary, embedding, embedding_model_id, embedding_dim, embedding_fingerprint, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'gemini-embedding-2', 768, ?, ?)`
        )
        const insMedia = db.prepare(
          `INSERT INTO media_digest (guild_id, content_key, kind, label, summary, digest_json, created_at, embedding, embedding_model_id, embedding_dim, embedding_fingerprint)
           VALUES (?, ?, 'video', ?, ?, '{}', ?, ?, 'gemini-embedding-2', 768, ?)`
        )
        const insMediaOcc = db.prepare(
          `INSERT INTO media_occurrence (digest_id, guild_id, channel_id, message_id, shared_by_user_id, origin, observed_at)
           VALUES (?, ?, ?, ?, ?, 'upload', ?)`
        )

        const fp = config.embeddings.fingerprint
        db.transaction(() => {
          for (let i = 0; i < claimCount; i += 1) {
            const uid = `scale-user-${i % 200}`
            const val = `Synthetic scaled hobby ${i}`
            const res = insClaim.run(
              'sim-guild-north',
              uid,
              val,
              simNowMs - 1000,
              simNowMs,
              deterministicVectorBlob(i + 1),
              `Synthetic scaled hobby ${i}`,
              fp
            )
            insEv.run(Number(res.lastInsertRowid), 'passive', simNowMs, 'sim-north-general')
          }
          for (let i = 0; i < episodeCount; i += 1) {
            insEp.run(
              'sim-guild-north',
              'sim-north-general',
              simNowMs - 5000,
              simNowMs - 1000,
              `Scaled conversation episode summary ${i}`,
              deterministicVectorBlob(20_000 + i),
              fp,
              simNowMs
            )
          }
          for (let i = 0; i < mediaCount; i += 1) {
            const mres = insMedia.run(
              'sim-guild-north',
              `scale:media:${i}`,
              `scale-${i}.png`,
              `Scaled media digest summary ${i}`,
              simNowMs,
              deterministicVectorBlob(40_000 + i),
              fp
            )
            insMediaOcc.run(
              Number(mres.lastInsertRowid),
              'sim-guild-north',
              'sim-north-general',
              `scale-msg-${i}`,
              'scale-user-0',
              simNowMs
            )
          }
        })()
        fillMemoryItemEmbeddingHashes(db)
      }

      const scaleLegacy: Record<BuilderKey, number[]> = {
        userFacts: [],
        guildFacts: [],
        episodes: [],
        media: [],
        recallUser: []
      }
      const scaleItem: Record<BuilderKey, number[]> = {
        userFacts: [],
        guildFacts: [],
        episodes: [],
        media: [],
        recallUser: []
      }
      const queryVec = deterministicVectorArray(999)
      const scaleScope = { guildId: 'sim-guild-north', channelId: 'sim-north-general' }

      for (let t = 0; t < 25; t += 1) {
        const uid = `scale-user-${t % 50}`
        const turnIn = {
          guildId: 'sim-guild-north',
          speakerId: uid,
          participantIds: [uid],
          message: 'Tell me about hobbies and pottery events',
          scope: scaleScope
        }

        let s = performance.now()
        const lu = selectForTurn(readTurnSnapshot(turnIn, [uid]), turnIn, simNowMs)
        buildFactsEnvelope(lu.entries)
        scaleLegacy.userFacts.push(performance.now() - s)

        s = performance.now()
        const iu = selectForTurn(readItemTurnSnapshot(db, turnIn, [uid]), turnIn, simNowMs)
        buildFactsEnvelope(iu.entries)
        scaleItem.userFacts.push(performance.now() - s)

        s = performance.now()
        formatGuildFactsBlock(selectGuildFacts(readGuildFacts('sim-guild-north', simNowMs, scaleScope), simNowMs).facts)
        scaleLegacy.guildFacts.push(performance.now() - s)

        s = performance.now()
        formatGuildFactsBlock(
          selectGuildFacts(readItemGuildFacts(db, 'sim-guild-north', simNowMs, scaleScope), simNowMs).facts
        )
        scaleItem.guildFacts.push(performance.now() - s)

        s = performance.now()
        formatEpisodeRecallBlock(
          selectEpisodesWithinBudget(
            selectEpisodes(readRecallableEpisodes('sim-guild-north', scaleScope), queryVec),
            config.memory.episodeRecallK,
            config.memory.episodeTokenBudget
          )
        )
        scaleLegacy.episodes.push(performance.now() - s)

        s = performance.now()
        formatEpisodeRecallBlock(
          selectEpisodesWithinBudget(
            selectEpisodes(readItemRecallableEpisodes(db, 'sim-guild-north', scaleScope), queryVec),
            config.memory.episodeRecallK,
            config.memory.episodeTokenBudget
          )
        )
        scaleItem.episodes.push(performance.now() - s)

        s = performance.now()
        formatMediaRecallBlock(selectMedia(readRecallableMedia('sim-guild-north', scaleScope), queryVec))
        scaleLegacy.media.push(performance.now() - s)

        s = performance.now()
        formatMediaRecallBlock(selectMedia(readItemMediaCandidates(db, 'sim-guild-north', scaleScope), queryVec))
        scaleItem.media.push(performance.now() - s)

        s = performance.now()
        formatRecallUserFacts(
          selectForSubject(
            readSubjectSnapshot('sim-guild-north', uid, 'hobbies', scaleScope),
            'hobbies',
            MAX_RECALLED_FACTS,
            simNowMs
          )
        )
        scaleLegacy.recallUser.push(performance.now() - s)

        s = performance.now()
        formatRecallUserFacts(
          selectForSubject(
            readItemSubjectSnapshot(db, 'sim-guild-north', uid, 'hobbies', scaleScope),
            'hobbies',
            MAX_RECALLED_FACTS,
            simNowMs
          )
        )
        scaleItem.recallUser.push(performance.now() - s)
      }

      const actualItems = (db.prepare('SELECT COUNT(*) AS count FROM memory_item').get() as { count: number }).count
      scale10k = {
        targetItems: options.scale,
        actualItems,
        legacy: {
          userFacts: summarizeTimings(scaleLegacy.userFacts),
          guildFacts: summarizeTimings(scaleLegacy.guildFacts),
          episodes: summarizeTimings(scaleLegacy.episodes),
          media: summarizeTimings(scaleLegacy.media),
          recallUser: summarizeTimings(scaleLegacy.recallUser)
        },
        item: {
          userFacts: summarizeTimings(scaleItem.userFacts),
          guildFacts: summarizeTimings(scaleItem.guildFacts),
          episodes: summarizeTimings(scaleItem.episodes),
          media: summarizeTimings(scaleItem.media),
          recallUser: summarizeTimings(scaleItem.recallUser)
        }
      }
    }

    const integrityStatus: GateStatus = legacyDropped
      ? 'skipped'
      : !firstEventDrift &&
          dailyDrifts.every((d) => d.fact === 0 && d.episode === 0 && d.media === 0) &&
          finalDrift.fact === 0 &&
          finalDrift.episode === 0 &&
          finalDrift.media === 0
        ? 'passed'
        : 'failed'
    const integritySkipReason = legacyDropped ? 'Legacy tables dropped by --drop-legacy-at-day' : undefined

    const triggerStatus: GateStatus = maxDays < 30 ? 'skipped' : triggerSummary.passed ? 'passed' : 'failed'
    const triggerSkipReason = maxDays < 30 ? `Requires >= 30 simulated days (ran ${maxDays})` : undefined

    const parityStatus: GateStatus = storeMode !== 'dual' ? 'skipped' : parityMismatches === 0 ? 'passed' : 'failed'
    const paritySkipReason = storeMode !== 'dual' ? `Requires store=dual (got ${storeMode})` : undefined

    const publicTurnsChecked = turnObservations.filter((o) => o.visibility === 'public').length
    const privacyStatus: GateStatus =
      publicTurnsChecked > 0 &&
      quality.dmTurnsChecked >= 3 &&
      quality.privateOnlyItemsCount >= 4 &&
      quality.privateTokensLeaked === 0 &&
      quality.dmMemoryBlockLeaks === 0
        ? 'passed'
        : 'failed'

    const crashStatus: GateStatus =
      maxDays < 29
        ? 'skipped'
        : restartsTotal >= 4 &&
            crashRestarts >= 1 &&
            perRestartResults.length === restartsTotal &&
            perRestartResults.every((r) => r.passed) &&
            perRestartResults.some((r) => r.stuckReset >= 1 && r.stuckJobsCompleted >= r.stuckReset)
          ? 'passed'
          : 'failed'
    const crashSkipReason = maxDays < 29 ? `Requires >= 29 simulated days (ran ${maxDays})` : undefined

    const failures: string[] = []
    if (integrityStatus === 'failed') {
      failures.push(
        firstEventDrift
          ? `item_integrity drift after event ${firstEventDrift.eventId} (day ${firstEventDrift.day}): ${JSON.stringify(firstEventDrift)}`
          : `item_integrity drift detected (final=${JSON.stringify(finalDrift)})`
      )
    }
    if (triggerStatus === 'failed') failures.push(`missing writer triggers: ${triggerSummary.missing.join(', ')}`)
    if (parityStatus === 'failed')
      failures.push(`phase 4 parity mismatches (${parityMismatches}): ${parityMismatchDetails.slice(0, 3).join('; ')}`)
    if (privacyStatus === 'failed') {
      failures.push(
        `privacy gate failed (privateOnlyItems=${quality.privateOnlyItemsCount}, publicTurns=${publicTurnsChecked}, leaks=${quality.privateTokensLeaked}, dmTurns=${quality.dmTurnsChecked}, dmBlockLeaks=${quality.dmMemoryBlockLeaks})`
      )
    }
    if (crashStatus === 'failed') {
      const failedIds = perRestartResults.filter((r) => !r.passed).map((r) => r.id)
      failures.push(
        `crash safety failed (restarts=${restartsTotal}, crash=${crashRestarts}, stuckReset=${stuckResetTotal}, failedRestarts=${failedIds.join(',') || 'missing_stuck_job'})`
      )
    }
    for (const [name, st, reason] of [
      ['integrity', integrityStatus, integritySkipReason],
      ['triggerCoverage', triggerStatus, triggerSkipReason],
      ['phase4Parity', parityStatus, paritySkipReason],
      ['crashSafety', crashStatus, crashSkipReason]
    ] as const) {
      const expectedSkip = (name === 'integrity' && legacyDropped) || (name === 'phase4Parity' && storeMode === 'item')
      if (st === 'skipped' && !expectedSkip) {
        failures.push(`${name} skipped: ${reason}`)
      }
    }

    const claimsTable = storeMode === 'item' ? 'memory_item' : 'memory_claim'
    const claimKindFilter = storeMode === 'item' ? " WHERE kind = 'fact'" : ''
    const claimStats = db
      .prepare(
        `SELECT
          SUM(CASE WHEN subject_kind='user' AND status='active' AND period='current' THEN 1 ELSE 0 END) AS activeUser,
          SUM(CASE WHEN subject_kind='user' AND period='past' THEN 1 ELSE 0 END) AS pastUser,
          SUM(CASE WHEN subject_kind='user' AND status='rejected' THEN 1 ELSE 0 END) AS rejectedUser,
          SUM(CASE WHEN subject_kind='user' AND end_reason='retracted' THEN 1 ELSE 0 END) AS retractedUser,
          SUM(CASE WHEN subject_kind='guild' AND status='active' THEN 1 ELSE 0 END) AS activeGuild
        FROM ${claimsTable}${claimKindFilter}`
      )
      .get() as {
      activeUser: number
      pastUser: number
      rejectedUser: number
      retractedUser: number
      activeGuild: number
    }
    const epTotal = (
      db
        .prepare(
          storeMode === 'item'
            ? "SELECT COUNT(*) AS count FROM memory_item WHERE kind = 'episode'"
            : 'SELECT COUNT(*) AS count FROM memory_episode'
        )
        .get() as { count: number }
    ).count
    const mediaTotal = (
      db
        .prepare(
          storeMode === 'item'
            ? "SELECT COUNT(*) AS count FROM memory_item WHERE kind = 'media'"
            : 'SELECT COUNT(*) AS count FROM media_digest'
        )
        .get() as { count: number }
    ).count

    if (options.pruneUnused) {
      const genReplayCache = new MemsimCache({ mode: 'replay', cacheDir, budgets: options.budgets })
      await markGenerateReplayCacheReads(genReplayCache)
      cache.mergeAccessedPaths(genReplayCache.getAccessedPaths())
      cache.pruneUnused()
    }

    const cacheStats = cache.stats()
    const requiredGateStatuses = [triggerStatus, privacyStatus, crashStatus]
    if (!legacyDropped) requiredGateStatuses.push(integrityStatus)
    if (storeMode !== 'item') requiredGateStatuses.push(parityStatus)
    const gatesPassed = requiredGateStatuses.every((status) => status === 'passed')
    return {
      version: 1,
      mode: options.mode,
      store: storeMode,
      privacy: privacyMode,
      seeded: Boolean(options.seedDbPath),
      daysSimulated: maxDays,
      dropLegacyAtDay: options.dropLegacyAtDay ?? null,
      providerCalls: {
        river: {
          hits: cacheStats.hits.river,
          live: cacheStats.liveCalls.river,
          total: cacheStats.totalCalls.river,
          budget: cacheStats.budgets.river
        },
        embeddings: {
          hits: cacheStats.hits.embeddings,
          live: cacheStats.liveCalls.embeddings,
          total: cacheStats.totalCalls.embeddings,
          budget: cacheStats.budgets.embeddings
        },
        typesafe: {
          hits: cacheStats.hits.typesafe,
          live: cacheStats.liveCalls.typesafe,
          total: cacheStats.totalCalls.typesafe,
          budget: cacheStats.budgets.typesafe
        }
      },
      integrity: {
        status: integrityStatus,
        ...(integritySkipReason ? { skipReason: integritySkipReason } : {}),
        dailyDrifts,
        ...(firstEventDrift ? { firstEventDrift } : {}),
        finalDrift,
        passed: integrityStatus === 'passed'
      },
      triggerCoverage: {
        status: triggerStatus,
        ...(triggerSkipReason ? { skipReason: triggerSkipReason } : {}),
        ...triggerSummary,
        passed: triggerStatus === 'passed'
      },
      phase4Parity: {
        status: parityStatus,
        ...(paritySkipReason ? { skipReason: paritySkipReason } : {}),
        turnsChecked: parityTurnsChecked,
        mismatches: parityMismatches,
        passed: parityStatus === 'passed'
      },
      privacyGate: {
        status: privacyStatus,
        publicTurnsChecked,
        dmTurnsChecked: quality.dmTurnsChecked,
        privateOnlyItemsCount: quality.privateOnlyItemsCount,
        privateTokensLeaked: quality.privateTokensLeaked,
        dmMemoryBlockLeaks: quality.dmMemoryBlockLeaks,
        passed: privacyStatus === 'passed'
      },
      crashSafety: {
        status: crashStatus,
        ...(crashSkipReason ? { skipReason: crashSkipReason } : {}),
        restartsTotal,
        crashRestarts,
        gracefulRestarts,
        openLinesBeforeRestart,
        openLinesRestored,
        openLinesFlushed,
        stuckResetTotal,
        perRestart: perRestartResults,
        passed: crashStatus === 'passed'
      },
      quality,
      performance: {
        turnCount: parityTurnsChecked,
        builders: {
          legacy: {
            userFacts: summarizeTimings(parityTimingSamples.legacy.userFacts),
            guildFacts: summarizeTimings(parityTimingSamples.legacy.guildFacts),
            episodes: summarizeTimings(parityTimingSamples.legacy.episodes),
            media: summarizeTimings(parityTimingSamples.legacy.media),
            recallUser: summarizeTimings(parityTimingSamples.legacy.recallUser)
          },
          item: {
            userFacts: summarizeTimings(parityTimingSamples.item.userFacts),
            guildFacts: summarizeTimings(parityTimingSamples.item.guildFacts),
            episodes: summarizeTimings(parityTimingSamples.item.episodes),
            media: summarizeTimings(parityTimingSamples.item.media),
            recallUser: summarizeTimings(parityTimingSamples.item.recallUser)
          }
        },
        ...(scale10k ? { scale10k } : {})
      },
      counts: {
        messagesProcessed,
        episodesExtracted: epTotal - episodesExtractedBeforeStart,
        activeUserClaims: claimStats.activeUser ?? 0,
        pastUserClaims: claimStats.pastUser ?? 0,
        rejectedUserClaims: claimStats.rejectedUser ?? 0,
        retractedUserClaims: claimStats.retractedUser ?? 0,
        activeGuildClaims: claimStats.activeGuild ?? 0,
        episodesStored: epTotal,
        mediaDigestsStored: mediaTotal
      },
      gatesPassed,
      failures
    }
  } finally {
    Date.now = originalDateNow
    roka.__resetTestRunTurnFactory()
    resetChannelVisibilityForTest()
    await stopExtractionScheduler()
    resetEpisodeTrackerForTest()
    resetExtractionScheduler()
    setSerialDrainForTest(false)
    await destroyTrackedSessions()
    closeDb()
    await routesHandle.restore()
    cfgEnv.cleanup()
    if (!options.keepTempDb) {
      rmSync(workDir, { recursive: true, force: true })
    }
  }
}
