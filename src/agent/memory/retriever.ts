import { config } from '../../config.js'
import { getClaimSourceChannels } from '../../storage/memoryRecallStore.js'
import { recordMemoryEvent } from '../../storage/metricsStore.js'
import { getAllUserNames } from '../../storage/userNames.js'
import { getLocalDate } from '../../utils/timezone.js'
import { estimateTokens } from '../../utils/tokens.js'
import { factKey } from './factSentences.js'
import type { GuildMemoryClaim, UserMemoryClaim } from './memoryClaims.js'
import {
  SOURCE_WEIGHT,
  getActiveClaimsForUsers,
  getActiveGuildClaims,
  searchClaimIds,
  touchRecalled
} from './memoryClaims.js'
import { PREDICATES, type PredicateId, predicateCategory, routeTopics } from './predicates.js'
import { type RecallScope, canRecall } from './privacy.js'

export type RetrieveForTurnInput = Readonly<{
  guildId: string
  speakerId: string
  participantIds: string[]
  message: string
  scope?: RecallScope
}>

export type RetrievedClaim = Readonly<{
  claim: UserMemoryClaim
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

/** At `relaxed` the lookup is skipped entirely so the legacy queries stay byte-identical. */
function withinScope<T extends { id: number }>(items: T[], scope: RecallScope | undefined): T[] {
  if (!scope || config.memory.privacy === 'relaxed') return items
  const sources = getClaimSourceChannels(items.map(({ id }) => id))
  return items.filter((item) => canRecall(sources.get(item.id) ?? [null], scope))
}

function scoreClaim(
  claim: UserMemoryClaim,
  ftsIds: Set<number>,
  routedPredicates: Set<PredicateId>,
  now: number
): number {
  const ageDays = Math.max(0, now - claim.lastSeenAt) / (24 * 60 * 60 * 1000)
  const recency = 1 / (1 + ageDays / 30)
  const decayedSalience = claim.salience * 0.5 ** (ageDays / config.memory.salienceHalfLifeDays)
  const recallIsCoolingDown =
    claim.lastRecalledAt !== null &&
    now - claim.lastRecalledAt <= config.memory.recallCooldownMs &&
    !ftsIds.has(claim.id) &&
    !routedPredicates.has(claim.predicate)

  return (
    decayedSalience * SOURCE_WEIGHT[claim.sourceKind] * 2 +
    claim.confidence +
    recency * 0.5 +
    (claim.pinned ? 1 : 0) +
    (ftsIds.has(claim.id) ? 1.5 : 0) +
    (routedPredicates.has(claim.predicate) ? 1 : 0) +
    (recallIsCoolingDown ? -0.75 : 0)
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
    entry.facts.push({ key: factKey(claim.predicate, claim.period), value: claim.value })
    entries.set(claim.subjectUserId, entry)
  }

  return [...entries.values()]
}

function tokensFor(claims: RetrievedClaim[], names: ReturnType<typeof getAllUserNames>): number {
  return estimateTokens(JSON.stringify(toEntries(claims, names)))
}

/** Retrieve a bounded, guild-scoped memory context without formatting it for the prompt. */
function routedPredicatesFor(message: string): Set<PredicateId> {
  const routedTopics = routeTopics(message)
  return new Set<PredicateId>(
    Object.keys(PREDICATES).filter((predicate): predicate is PredicateId =>
      routedTopics.has(predicateCategory(predicate as PredicateId))
    )
  )
}

/**
 * Same relevance scoring as `retrieveForTurn`, for a single named subject rather than a channel's
 * whole passive envelope — no speaker anchoring, cross-user expansion, or token budget, since
 * `recall_user` targets one person by design. Reused so a fact ranks the same way regardless of
 * which of the two paths surfaced it.
 */
export function retrieveForSubject(
  guildId: string,
  subjectUserId: string,
  message: string,
  limit: number,
  scope?: RecallScope
): RetrievedClaim[] {
  const activeClaims = withinScope(getActiveClaimsForUsers(guildId, [subjectUserId]), scope)
  const ftsIds = searchClaimIds(guildId, [subjectUserId], message)
  const routedPredicates = routedPredicatesFor(message)
  const now = Date.now()
  return activeClaims
    .filter((claim) => !claim.needsReview)
    .map((claim) => ({ claim, score: scoreClaim(claim, ftsIds, routedPredicates, now) }))
    .sort(compareRetrieved)
    .slice(0, limit)
}

export function retrieveForTurn(input: RetrieveForTurnInput): RetrievalResult {
  const startedAt = Date.now()
  const participantIds = [...new Set(input.participantIds.filter((id) => id !== input.speakerId))].slice(
    0,
    config.memory.recentParticipantLimit
  )
  const userIds = [input.speakerId, ...participantIds]
  const activeClaims = withinScope(getActiveClaimsForUsers(input.guildId, userIds), input.scope)
  const ftsIds = searchClaimIds(input.guildId, userIds, input.message)
  const routedPredicates = routedPredicatesFor(input.message)
  const now = Date.now()
  const scoredClaims = activeClaims.map((claim) => ({ claim, score: scoreClaim(claim, ftsIds, routedPredicates, now) }))
  const candidates = scoredClaims.filter(({ claim }) => !claim.needsReview).sort(compareRetrieved)
  const speakerCandidates = scoredClaims.filter(
    ({ claim }) => claim.subjectUserId === input.speakerId && !claim.needsReview
  )
  const speakerAnchorCount = Math.min(
    speakerCandidates.length,
    Math.ceil(config.memory.maxClaimsPerTurn * config.memory.speakerMinShare)
  )
  const anchors = [...speakerCandidates].sort(compareRetrieved).slice(0, speakerAnchorCount)
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

  const addExpansion = (claim: UserMemoryClaim): void => {
    if (claim.period !== 'current') return
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

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const

/**
 * The precision the messages gave, not the precision the expiry can express: a month-only fact
 * expires at the end of its month, so `expires_at - 1` would show it on the wrong day. Legacy rows
 * predate `event_date` and keep the old derivation.
 */
export function formatGuildFactDate(claim: GuildMemoryClaim): string | undefined {
  if (claim.predicate !== 'upcoming_event' && claim.predicate !== 'plan') return undefined
  if (claim.eventDate) {
    const parts = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(claim.eventDate)
    const month = parts ? Number(parts[2]) : 0
    if (parts && month >= 1 && month <= 12) {
      const name = MONTH_NAMES[month - 1]
      return parts[3] ? claim.eventDate : `${name} ${parts[1]}`
    }
  }
  return claim.expiresAt === null ? undefined : getLocalDate(claim.expiresAt - 1)
}

function serializeGuildFact(claim: GuildMemoryClaim): string {
  const eventDate = formatGuildFactDate(claim)
  return JSON.stringify({ predicate: claim.predicate, ...(eventDate ? { date: eventDate } : {}), value: claim.value })
}

export function retrieveGuildFacts(
  guildId: string,
  now: number = Date.now(),
  scope?: RecallScope
): { facts: GuildMemoryClaim[]; tokensEst: number } {
  const facts = withinScope(getActiveGuildClaims(guildId, now), scope)
    .map((fact) => {
      const ageDays = Math.max(0, now - fact.lastSeenAt) / (24 * 60 * 60 * 1000)
      return { fact, score: fact.salience * 0.5 ** (ageDays / config.memory.salienceHalfLifeDays) }
    })
    .sort(
      (left, right) =>
        right.score - left.score || right.fact.lastSeenAt - left.fact.lastSeenAt || left.fact.id - right.fact.id
    )

  const selected: GuildMemoryClaim[] = []
  let tokensEst = 0
  for (const { fact } of facts) {
    const tokens = estimateTokens(serializeGuildFact(fact))
    if (tokensEst + tokens > config.memory.guildFactsTokenBudget) continue
    selected.push(fact)
    tokensEst += tokens
  }

  return { facts: selected, tokensEst }
}
