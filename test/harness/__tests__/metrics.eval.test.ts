import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../env.js'
import { resetMonitor } from '../../../src/agent/channelMonitor.js'
import { resetCounters } from '../../../src/agent/memoryExtractor.js'
import { resetAllBuffers } from '../../../src/agent/passiveBuffer.js'
import { __resetTestRunTurnFactory, __setTestRunTurnFactory, destroySession } from '../../../src/agent/roka.js'
import { config } from '../../../src/config.js'
import { createMessageHandler } from '../../../src/discord/events/messageCreate.js'
import { getDb } from '../../../src/storage/database.js'
import { RateLimiter } from '../../../src/utils/rateLimiter.js'
import { createCaptureSink } from '../captureSink.js'
import { makeClient, makeGuild, makeMessage } from '../discordDoubles.js'
import { loadTranscript, runTranscript } from '../run.js'

const mocks = vi.hoisted(() => ({ generateContent: vi.fn() }))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent }
  }
}))

const transcript = resolve('test/harness/transcripts/metrics.jsonl')
const memoryConfig = config.memory as { extractionInterval: number; extractionGapMs: number }
const defaultExtractionInterval = memoryConfig.extractionInterval
const defaultExtractionGapMs = memoryConfig.extractionGapMs

interface ResponseEventRow {
  guild_id: string
  channel_id: string
  user_id: string
  trigger: 'mention' | 'reply' | 'name_keyword' | 'slash'
  tone: string
  outcome: string
  e2e_ms: number
  generate_ms: number
  llm_ms: number
  tokens_in_est: number
  tokens_out_est: number
}

function responseRows(): ResponseEventRow[] {
  return getDb()
    .prepare(
      'SELECT guild_id, channel_id, user_id, trigger, tone, outcome, e2e_ms, generate_ms, llm_ms, tokens_in_est, tokens_out_est FROM response_events ORDER BY id'
    )
    .all() as ResponseEventRow[]
}

afterEach(async () => {
  __resetTestRunTurnFactory()
  memoryConfig.extractionInterval = defaultExtractionInterval
  memoryConfig.extractionGapMs = defaultExtractionGapMs
  resetCounters()
  resetAllBuffers()
  resetMonitor()
  getDb().prepare('DELETE FROM response_events').run()
  getDb().prepare('DELETE FROM extraction_events').run()
  await Promise.all([
    destroySession('tea-room'),
    destroySession('reading-nook'),
    destroySession('metrics-early-exit-channel')
  ])
  mocks.generateContent.mockReset()
})

describe('harness metrics evaluation', () => {
  it('records one correctly attributed response event for every LLM transcript turn', async () => {
    const lines = await loadTranscript(transcript)
    const report = await runTranscript(transcript)
    const rows = responseRows()

    expect(report.turns).toHaveLength(lines.length)
    expect(rows).toHaveLength(lines.length)
    expect(rows).toEqual(
      lines.map((line, index) =>
        expect.objectContaining({
          guild_id: line.guildId,
          channel_id: line.channelId,
          user_id: line.userId,
          trigger: ['mention', 'reply', 'name_keyword', 'slash'][index],
          tone: 'playful',
          outcome: 'ok'
        })
      )
    )

    for (const row of rows) {
      expect(row.e2e_ms).toBeGreaterThan(0)
      expect(row.generate_ms).toBeGreaterThanOrEqual(0)
      expect(row.llm_ms).toBeGreaterThanOrEqual(0)
      expect(row.e2e_ms).toBeGreaterThanOrEqual(row.generate_ms)
      expect(row.generate_ms).toBeGreaterThanOrEqual(row.llm_ms)
      expect(row.tokens_in_est).toBeGreaterThan(0)
      expect(row.tokens_out_est).toBeGreaterThan(0)
    }

    expect(rows.map((row) => row.guild_id)).toEqual(['guild-garden', 'guild-library', 'guild-garden', 'guild-library'])
  })

  it('excludes busy and intercepted turns while recording mocked extraction events', async () => {
    memoryConfig.extractionInterval = 1
    memoryConfig.extractionGapMs = 0
    mocks.generateContent.mockResolvedValue({ text: '[]' })

    const client = makeClient()
    const guild = makeGuild({ me: { displayName: 'Roka' } })
    const handler = createMessageHandler(client as never, new RateLimiter({ rpm: 10, rpd: 10 }))
    const sink = createCaptureSink()
    let resolveFirstTurn!: () => void
    const firstTurnStarted = new Promise<void>((resolve) => {
      __setTestRunTurnFactory(
        () => async () =>
          new Promise((resolveTurn) => {
            resolveFirstTurn = () =>
              resolveTurn({ text: 'First metrics response~', hasText: true, hasFunctionCall: false })
            resolve()
          })
      )
    })

    const firstTurn = handler(
      makeMessage({
        author: { id: 'mio', username: 'mio', displayName: 'Mio' },
        mentions: ['roka'],
        guildId: 'guild-extraction',
        guild,
        channelId: 'metrics-early-exit-channel',
        content: '<@roka> Tell me about tea and coffee.',
        sink
      }) as never
    )
    await firstTurnStarted

    await handler(
      makeMessage({
        author: { id: 'ren', username: 'ren', displayName: 'Ren' },
        mentions: ['roka'],
        guildId: 'guild-extraction',
        guild,
        channelId: 'metrics-early-exit-channel',
        content: '<@roka> Can you wait?',
        sink
      }) as never
    )

    resolveFirstTurn()
    await firstTurn

    await handler(
      makeMessage({
        author: { id: 'mio', username: 'mio', displayName: 'Mio' },
        mentions: ['roka'],
        guildId: 'guild-extraction',
        guild,
        channelId: 'metrics-early-exit-channel',
        content: 'gacha',
        sink
      }) as never
    )

    expect(responseRows()).toHaveLength(1)
    expect(sink.all()).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'reply' })]))

    await vi.waitFor(() => {
      const extractionRows = getDb()
        .prepare('SELECT guild_id, channel_id, duration_ms, outcome FROM extraction_events')
        .all() as Array<{ guild_id: string; channel_id: string; duration_ms: number; outcome: string }>

      expect(extractionRows.length).toBeGreaterThan(0)
      expect(extractionRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            guild_id: 'guild-extraction',
            channel_id: 'metrics-early-exit-channel',
            outcome: 'no_facts'
          })
        ])
      )
      expect(extractionRows.every((row) => row.duration_ms >= 0)).toBe(true)
    })
    expect(mocks.generateContent).toHaveBeenCalled()
  })
})
