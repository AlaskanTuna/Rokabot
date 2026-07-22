import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import { recordMemoryEvent } from '../../storage/metricsStore.js'
import { getAllUserNames } from '../../storage/userNames.js'
import { estimateTokens } from '../../utils/tokens.js'
import type { ClaimSource, MemoryClaim } from './memoryClaims.js'
import { touchRecalled } from './memoryClaims.js'
import { PREDICATES, type PredicateId, predicateCategory, routeTopics } from './predicates.js'

type ClaimRow = {
  id: number
  guild_id: string
  subject_user_id: string
  predicate: PredicateId
  value: string
  object_kind: 'user' | null
  object_user_id: string | null
  source_kind: ClaimSource
  status: MemoryClaim['status']
  confidence: number
  salience: number
  pinned: number
  needs_review: number
  superseded_by: number | null
  first_seen_at: number
  last_seen_at: number
  last_recalled_at: number | null
}

export type RetrieveForTurnInput = Readonly<{
  guildId: string
  speakerId: string
  participantIds: string[]
  message: string
}>

export type RetrievedClaim = Readonly<{
  claim: MemoryClaim
  score: number
}>

export type RetrievalTrace = Readonly<{
  candidates: Array<{ id: number; score: number }>
  selected: Array<{ id: number; score: number }>
  tokensEst: number
}>

export type RetrievalResult = Readonly<{
  entries: Array<{ person: string; facts: Array<{ key: string; value: string }> }>
  claims: RetrievedClaim[]
  trace: RetrievalTrace
}>

const SOURCE_WEIGHT: Readonly<Record<ClaimSource, number>> = {
  explicit: 1,
  human: 1,
  passive: 0.75,
  legacy: 0.5
}

function mapClaim(row: ClaimRow): MemoryClaim {
  return {
    id: row.id,
    guildId: row.guild_id,
    subjectUserId: row.subject_user_id,
    predicate: row.predicate,
    value: row.value,
    objectKind: row.object_kind,
    objectUserId: row.object_user_id,
    sourceKind: row.source_kind,
    status: row.status,
    confidence: row.confidence,
    salience: row.salience,
    pinned: row.pinned === 1,
    needsReview: row.needs_review === 1,
    supersededBy: row.superseded_by,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastRecalledAt: row.last_recalled_at
  }
}

function getActiveClaims(guildId: string, userIds: string[]): MemoryClaim[] {
  if (userIds.length === 0) return []
  const placeholders = userIds.map(() => '?').join(', ')
  const rows = getDb()
    .prepare(
      `SELECT * FROM memory_claim
       WHERE guild_id = ? AND status = 'active' AND subject_user_id IN (${placeholders})`
    )
    .all(guildId, ...userIds) as ClaimRow[]
  return rows.map(mapClaim)
}

function searchClaimIds(guildId: string, userIds: string[], message: string): Set<number> {
  const terms = [...new Set(message.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].slice(0, 12)
  if (userIds.length === 0 || terms.length === 0) return new Set()

  const placeholders = userIds.map(() => '?').join(', ')
  const query = terms.map((term) => `"${term}"`).join(' OR ')
  const rows = getDb()
    .prepare(
      `SELECT memory_claim.id FROM memory_claim
       JOIN memory_claim_fts ON memory_claim.id = memory_claim_fts.rowid
       WHERE memory_claim.guild_id = ? AND memory_claim.status = 'active'
         AND memory_claim.needs_review = 0 AND memory_claim.subject_user_id IN (${placeholders})
         AND memory_claim_fts MATCH ?
       ORDER BY bm25(memory_claim_fts), memory_claim.salience DESC
       LIMIT ?`
    )
    .all(guildId, ...userIds, query, config.memory.maxClaimsPerTurn * 3) as Array<{ id: number }>
  return new Set(rows.map(({ id }) => id))
}

function scoreClaim(claim: MemoryClaim, ftsIds: Set<number>, routedPredicates: Set<PredicateId>, now: number): number {
  const ageDays = Math.max(0, now - claim.lastSeenAt) / (24 * 60 * 60 * 1000)
  const recency = 1 / (1 + ageDays / 30)

  // Score combines durable importance with turn relevance; deterministic tie-breaks appear below.
  return (
    claim.salience * SOURCE_WEIGHT[claim.sourceKind] * 2 +
    claim.confidence +
    recency * 0.5 +
    (claim.pinned ? 1 : 0) +
    (ftsIds.has(claim.id) ? 1.5 : 0) +
    (routedPredicates.has(claim.predicate) ? 1 : 0)
  )
}

function compareRetrieved(left: RetrievedClaim, right: RetrievedClaim): number {
  return (
    right.score - left.score ||
    right.claim.salience - left.claim.salience ||
    right.claim.lastSeenAt - left.claim.lastSeenAt ||
    left.claim.id - right.claim.id
  )
}

function toEntries(claims: RetrievedClaim[], names: ReturnType<typeof getAllUserNames>): RetrievalResult['entries'] {
  const entries = new Map<string, { person: string; facts: Array<{ key: string; value: string }> }>()

  for (const { claim } of claims) {
    const person = names.get(claim.subjectUserId)?.displayName ?? claim.subjectUserId
    const entry = entries.get(claim.subjectUserId) ?? { person, facts: [] }
    entry.facts.push({ key: claim.predicate, value: claim.value })
    entries.set(claim.subjectUserId, entry)
  }

  return [...entries.values()]
}

function tokensFor(claims: RetrievedClaim[], names: ReturnType<typeof getAllUserNames>): number {
  return estimateTokens(JSON.stringify(toEntries(claims, names)))
}

/** Retrieve a bounded, guild-scoped memory context without formatting it for the prompt. */
export function retrieveForTurn(input: RetrieveForTurnInput): RetrievalResult {
  const startedAt = Date.now()
  const participantIds = [...new Set(input.participantIds.filter((id) => id !== input.speakerId))].slice(
    0,
    config.memory.recentParticipantLimit
  )
  const userIds = [input.speakerId, ...participantIds]
  const activeClaims = getActiveClaims(input.guildId, userIds)
  const ftsIds = searchClaimIds(input.guildId, userIds, input.message)
  const routedTopics = routeTopics(input.message)
  const routedPredicates = new Set<PredicateId>(
    Object.keys(PREDICATES).filter((predicate): predicate is PredicateId =>
      routedTopics.has(predicateCategory(predicate as PredicateId))
    )
  )
  const now = Date.now()
  const scoredClaims = activeClaims.map((claim) => ({ claim, score: scoreClaim(claim, ftsIds, routedPredicates, now) }))
  const candidates = scoredClaims.filter(({ claim }) => !claim.needsReview).sort(compareRetrieved)
  const speakerCandidates = scoredClaims.filter(({ claim }) => claim.subjectUserId === input.speakerId)
  const speakerAnchorCount = Math.min(
    speakerCandidates.length,
    Math.ceil(config.memory.maxClaimsPerTurn * config.memory.speakerMinShare)
  )
  const anchors = [...speakerCandidates]
    .sort((left, right) => right.claim.salience - left.claim.salience || compareRetrieved(left, right))
    .slice(0, speakerAnchorCount)
  const names = getAllUserNames()
  const selected: RetrievedClaim[] = []
  const selectedIds = new Set(selected.map(({ claim }) => claim.id))
  const add = (candidate: RetrievedClaim): boolean => {
    if (selectedIds.has(candidate.claim.id) || selected.length >= config.memory.maxClaimsPerTurn) return false
    const next = [...selected, candidate]
    if (tokensFor(next, names) > config.memory.retrievalTokenBudget) return false
    selected.push(candidate)
    selectedIds.add(candidate.claim.id)
    return true
  }

  const addExpansion = (claim: MemoryClaim): void => {
    if (claim.objectKind !== 'user' || !claim.objectUserId || !participantIds.includes(claim.objectUserId)) return
    const expansion = candidates.find(({ claim: candidate }) => candidate.subjectUserId === claim.objectUserId)
    if (expansion) add(expansion)
  }

  for (const anchor of anchors) {
    if (add(anchor)) addExpansion(anchor.claim)
  }

  for (const candidate of candidates) {
    if (add(candidate)) addExpansion(candidate.claim)
  }

  const entries = toEntries(selected, names)
  const tokensEst = estimateTokens(JSON.stringify(entries))
  touchRecalled(selected.map(({ claim }) => claim.id))
  recordMemoryEvent({
    kind: 'retrieval',
    guildId: input.guildId,
    subjectUserId: input.speakerId,
    durationMs: Date.now() - startedAt,
    nCandidates: candidates.length,
    nSelected: selected.length,
    tokensEst
  })

  return {
    entries,
    claims: selected,
    trace: {
      candidates: candidates.map(({ claim, score }) => ({ id: claim.id, score })),
      selected: selected.map(({ claim, score }) => ({ id: claim.id, score })),
      tokensEst
    }
  }
}
