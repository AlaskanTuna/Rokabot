import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '../env.js'
import { assertClaim } from '../../../src/agent/memory/memoryClaims.js'
import { recallUser } from '../../../src/agent/tools/recallUser.js'
import { closeDb, getDb } from '../../../src/storage/database.js'

/**
 * Deterministic A/B fixture for #25 Phase 1, modelled on production: 11 of 24 (guild, subject)
 * pairs sit at the 20-claim ceiling with `pinned = 0` everywhere and 60% of salience floor-bunched,
 * so ranking with no relevance signal collapses to recency for the bulk. Each case seeds exactly
 * `maxActiveClaimsPerUser` (20) active claims so no eviction fires, with one target fact made old
 * enough to fall outside MAX_RECALLED_FACTS (15) under recency alone.
 *
 * `recall_user` now threads the turn's message into `retrieveForSubject` (src/agent/memory/retriever.ts),
 * so the A/B is same code path, two inputs: an irrelevant/absent message reproduces the pre-Phase-1 gap
 * (the regression guard), and the case's query surfaces the target fact (the fix this phase delivers).
 *
 * No model calls: recallUser is a pure function over SQLite, so pass/fail is "does the returned
 * fact string contain the target value" — exact and free to run every time.
 */

const DAY = 24 * 60 * 60 * 1000
const GUILD = 'ab-guild'

type Case = Readonly<{
  id: string
  targetPredicate: string
  targetValue: string
  noisePredicate: string
  query: string
}>

// noisePredicate is deliberately from a different predicate category than targetPredicate (see
// predicates.ts) — routeTopics grants a routed-predicate bonus per category, so same-category noise
// would earn the identical bonus as the target and cancel the discrimination the case is testing.
const CASES: readonly Case[] = [
  {
    id: 'occupation-buried-by-recency',
    targetPredicate: 'general_occupation', // lifestyle
    targetValue: 'the town librarian',
    noisePredicate: 'likes', // interests
    query: 'what does she do for work?'
  },
  {
    id: 'hobby-buried-by-recency',
    targetPredicate: 'hobby', // interests
    targetValue: 'restoring old clocks',
    noisePredicate: 'friend_group', // social, multi-cardinality — single would collapse 19 distinct values to 1
    query: 'does she have any hobbies?'
  },
  {
    id: 'pet-buried-by-recency',
    targetPredicate: 'pets', // lifestyle
    targetValue: 'a tabby cat named Mochi',
    noisePredicate: 'currently_watching', // interests
    query: 'has she mentioned any pets?'
  },
  {
    // 'misc' has no category-mate and its only keyword is 'misc', so routeTopics grants no bonus to
    // either side here — this case can only pass via literal FTS token matching on the claim value,
    // isolating that mechanism from the routed-predicate bonus the three cases above rely on.
    id: 'fts-only-match-isolated-from-routing',
    targetPredicate: 'misc',
    targetValue: 'volunteers at the animal shelter on weekends',
    noisePredicate: 'misc',
    query: 'what does she do at the shelter?'
  }
]

function seedSubject(subjectUserId: string, testCase: Case, now: number): void {
  assertClaim({
    guildId: GUILD,
    subjectUserId,
    predicate: testCase.targetPredicate,
    value: testCase.targetValue,
    sourceKind: 'explicit',
    observedAt: now - 40 * DAY
  })
  for (let i = 0; i < 19; i++) {
    assertClaim({
      guildId: GUILD,
      subjectUserId,
      predicate: testCase.noisePredicate,
      value: `noise item ${i}`,
      sourceKind: 'explicit',
      observedAt: now - (19 - i) * DAY
    })
  }
}

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('recall relevance A/B (issue #25 phase 1 baseline)', () => {
  it('seeds exactly the storage ceiling with no eviction (premise check)', () => {
    const now = Date.now()
    seedSubject('premise-user', CASES[0], now)
    const count = (
      getDb().prepare("SELECT COUNT(*) AS n FROM memory_claim WHERE guild_id = ? AND status = 'active'").get(GUILD) as {
        n: number
      }
    ).n
    expect(count).toBe(20)
  })

  it.each(CASES)('BEFORE: with no relevant message, "$id" still falls outside the top 15', (testCase) => {
    const now = Date.now()
    const subjectUserId = `before-${testCase.id}`
    seedSubject(subjectUserId, testCase, now)

    const result = recallUser({ user_id: subjectUserId, guild_id: GUILD, message: '' })

    // Regression guard for the pre-Phase-1 gap: with no relevance signal, ranking collapses to
    // recency and the buried fact stays buried. Proves the fix is the message, not a general
    // loosening of the cap.
    expect(result.facts).not.toContain(testCase.targetValue)
    expect(result.factCount).toBe(15)
  })

  it.each(CASES)('AFTER: the query in "$id" surfaces the target fact past the recency cap', (testCase) => {
    const now = Date.now()
    const subjectUserId = `after-${testCase.id}`
    seedSubject(subjectUserId, testCase, now)

    const result = recallUser({ user_id: subjectUserId, guild_id: GUILD, message: testCase.query })

    expect(result.facts).toContain(testCase.targetValue)
  })

  it('excludes a needs_review claim even when the message matches it exactly', () => {
    const now = Date.now()
    const subjectUserId = 'needs-review-user'
    assertClaim({
      guildId: GUILD,
      subjectUserId,
      predicate: 'misc',
      value: 'an unverified rumour about her past',
      sourceKind: 'passive',
      needsReview: true,
      observedAt: now
    })

    const result = recallUser({
      user_id: subjectUserId,
      guild_id: GUILD,
      message: 'tell me about her unverified rumour'
    })

    expect(result.facts).not.toContain('unverified rumour about her past')
    expect(result.factCount).toBe(0)
  })
})
