import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  proposePredicates: vi.fn(),
  jevConfirm: vi.fn(),
  config: {
    logging: { level: 'silent' },
    memory: {
      maxActiveClaimsPerUser: 20,
      deadClaimRetentionDays: 30,
      verifyThreshold: 0.5,
      privacy: 'relaxed',
      reclassifyMaxPerRun: 20
    }
  }
}))

vi.mock('../../../config.js', () => ({ config: mocks.config }))
vi.mock('../reclassifyModels.js', () => ({
  proposePredicates: mocks.proposePredicates,
  jevConfirm: mocks.jevConfirm
}))

import { closeDb, getDb } from '../../../storage/database.js'
import {
  type UserMemoryClaim,
  assertClaim,
  getActiveClaims,
  pinClaim,
  rejectClaimIdsForSpeaker
} from '../memoryClaims.js'
import type { PredicateId } from '../predicates.js'
import {
  type ReclassifyCandidate,
  findReclassifyCandidates,
  moveClaim,
  reclassifyClaims,
  undoReclassify
} from '../reclassify.js'

const GUILD = 'guild-1'
const USER = 'user-1'

function seedClaim(input: {
  predicate: PredicateId
  value: string
  pinned?: boolean
  firstSeenAt?: number
  userId?: string
  period?: 'current' | 'past'
}): UserMemoryClaim {
  const claim = assertClaim({
    guildId: GUILD,
    subjectUserId: input.userId ?? USER,
    predicate: input.predicate,
    value: input.value,
    sourceKind: input.pinned ? 'explicit' : 'passive',
    channelId: 'channel-1',
    ...(input.period ? { period: input.period } : {})
  })
  if (input.firstSeenAt !== undefined) {
    getDb().prepare('UPDATE memory_claim SET first_seen_at = ? WHERE id = ?').run(input.firstSeenAt, claim.id)
  }
  return claim
}

function row(id: number) {
  return getDb()
    .prepare('SELECT status, end_reason, superseded_by, pinned, first_seen_at FROM memory_claim WHERE id = ?')
    .get(id) as {
    status: string
    end_reason: string | null
    superseded_by: number | null
    pinned: number
    first_seen_at: number
  }
}

function activeRow(input: { predicate: PredicateId; value: string }) {
  return getDb()
    .prepare(
      "SELECT id, status, end_reason, superseded_by, pinned, first_seen_at FROM memory_claim WHERE status = 'active' AND predicate = ? AND value = ?"
    )
    .get(input.predicate, input.value) as {
    id: number
    status: string
    end_reason: string | null
    superseded_by: number | null
    pinned: number
    first_seen_at: number
  }
}

function evidenceCount(id: number): number {
  return (
    getDb().prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(id) as { count: number }
  ).count
}

function memoryEvents(kind: string) {
  return getDb().prepare('SELECT * FROM memory_events WHERE kind = ?').all(kind) as Array<{
    guild_id: string | null
    subject_user_id: string | null
    detail: string | null
  }>
}

function candidateOf(claim: UserMemoryClaim): ReclassifyCandidate {
  return {
    id: claim.id,
    guildId: claim.guildId,
    subjectUserId: claim.subjectUserId,
    predicate: claim.predicate,
    value: claim.value
  }
}

// One database for the whole file: the metrics store keeps a prepared statement bound to the connection it first saw.
beforeAll(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

beforeEach(() => {
  getDb().exec('DELETE FROM memory_events; DELETE FROM memory_evidence; DELETE FROM memory_claim;')
  mocks.proposePredicates.mockReset()
  mocks.proposePredicates.mockResolvedValue([])
  mocks.jevConfirm.mockReset()
  mocks.jevConfirm.mockResolvedValue({})
  mocks.config.memory.maxActiveClaimsPerUser = 20
  mocks.config.memory.reclassifyMaxPerRun = 20
  mocks.config.memory.privacy = 'relaxed'
})

afterAll(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('reclassifyClaims', () => {
  it('moves a misc fact Jev confirms, keeping its pin, evidence and first-seen time', async () => {
    const old = seedClaim({ predicate: 'misc', value: 'draws on weekends', pinned: true, firstSeenAt: 1_000 })
    mocks.proposePredicates.mockResolvedValue([{ id: old.id, predicate: 'hobby' }])
    mocks.jevConfirm.mockResolvedValue({ [old.id]: 0.9 })
    expect(await reclassifyClaims()).toBe(1)
    const moved = activeRow({ predicate: 'hobby', value: 'draws on weekends' })
    expect(moved).toMatchObject({ pinned: 1, first_seen_at: 1_000 })
    expect(evidenceCount(moved.id)).toBe(evidenceCount(old.id))
    expect(row(old.id)).toMatchObject({ status: 'rejected', end_reason: 'reclassified', superseded_by: moved.id })
    expect(memoryEvents('claim_reclassified')).toHaveLength(1)
    expect(JSON.stringify(memoryEvents('claim_reclassified'))).not.toContain('draws')
  })

  it('keeps the confirmed side of a cross-category duplicate and retires the other', async () => {
    const misc = seedClaim({ predicate: 'misc', value: 'Japanese' })
    const language = seedClaim({ predicate: 'language_spoken', value: 'Japanese' })
    mocks.proposePredicates.mockResolvedValue([{ id: misc.id, predicate: 'language_spoken' }])
    mocks.jevConfirm.mockResolvedValue({ [misc.id]: 0.9 })
    await reclassifyClaims()
    expect(row(misc.id)).toMatchObject({ end_reason: 'reclassified', superseded_by: language.id })
    expect(row(language.id)).toMatchObject({ status: 'active' })
  })

  it('leaves a fact alone when Jev does not confirm the move or the model says keep', async () => {
    const keep = seedClaim({ predicate: 'misc', value: 'owns a red bike' })
    const doubtful = seedClaim({ predicate: 'misc', value: 'likes rain' })
    mocks.proposePredicates.mockResolvedValue([
      { id: keep.id, predicate: 'keep' },
      { id: doubtful.id, predicate: 'likes' }
    ])
    mocks.jevConfirm.mockResolvedValue({ [doubtful.id]: 0.3 })
    expect(await reclassifyClaims()).toBe(0)
    expect(row(keep.id)).toMatchObject({ status: 'active' })
    expect(row(doubtful.id)).toMatchObject({ status: 'active' })
    expect(mocks.jevConfirm).toHaveBeenCalledWith([{ id: doubtful.id, value: 'likes rain', predicate: 'likes' }])
  })

  it('does not ask Jev about a fact the model proposes to leave under the same predicate', async () => {
    const same = seedClaim({ predicate: 'misc', value: 'owns a red bike' })
    mocks.proposePredicates.mockResolvedValue([{ id: same.id, predicate: 'misc' }])
    expect(await reclassifyClaims()).toBe(0)
    expect(mocks.jevConfirm).not.toHaveBeenCalled()
  })

  it('ignores a proposal for a fact that was not offered to the model', async () => {
    const offered = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    const stranger = seedClaim({ predicate: 'likes', value: 'tea' })
    mocks.proposePredicates.mockResolvedValue([{ id: stranger.id, predicate: 'hobby' }])
    mocks.jevConfirm.mockResolvedValue({ [stranger.id]: 0.9 })
    expect(await reclassifyClaims()).toBe(0)
    expect(row(offered.id)).toMatchObject({ status: 'active' })
    expect(row(stranger.id)).toMatchObject({ status: 'active' })
  })

  it('stops at the per-run cap, is off at 0 and under privacy off', async () => {
    mocks.config.memory.reclassifyMaxPerRun = 1
    const first = seedClaim({ predicate: 'misc', value: 'a' })
    const second = seedClaim({ predicate: 'misc', value: 'b' })
    mocks.proposePredicates.mockResolvedValue([
      { id: first.id, predicate: 'hobby' },
      { id: second.id, predicate: 'hobby' }
    ])
    mocks.jevConfirm.mockResolvedValue({ [first.id]: 0.9, [second.id]: 0.9 })
    expect(await reclassifyClaims()).toBe(1)
    mocks.config.memory.reclassifyMaxPerRun = 0
    expect(await reclassifyClaims()).toBe(0)
    mocks.config.memory.reclassifyMaxPerRun = 20
    mocks.config.memory.privacy = 'off'
    expect(await reclassifyClaims()).toBe(0)
    expect([first, second].filter(({ id }) => row(id).status === 'active')).toHaveLength(1)
  })

  it('asks Jev about no more moves than the per-run cap', async () => {
    mocks.config.memory.reclassifyMaxPerRun = 2
    const claims = ['a', 'b', 'c', 'd', 'e'].map((value) => seedClaim({ predicate: 'misc', value }))
    mocks.proposePredicates.mockResolvedValue(claims.map(({ id }) => ({ id, predicate: 'hobby' })))
    mocks.jevConfirm.mockImplementation(async (moves: Array<{ id: number }>) =>
      Object.fromEntries(moves.map(({ id }) => [id, 0.9]))
    )

    expect(await reclassifyClaims()).toBe(2)

    expect(mocks.jevConfirm).toHaveBeenCalledOnce()
    const asked = mocks.jevConfirm.mock.calls[0]?.[0] as Array<{ id: number }>
    expect(asked).toHaveLength(2)
    expect(asked.every(({ id }) => claims.some((claim) => claim.id === id))).toBe(true)
  })

  it('does not move a fact again after its move was undone', async () => {
    const old = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    mocks.proposePredicates.mockResolvedValue([{ id: old.id, predicate: 'hobby' }])
    mocks.jevConfirm.mockResolvedValue({ [old.id]: 0.9 })
    expect(await reclassifyClaims()).toBe(1)
    expect(undoReclassify(old.id)).toBe(true)
    mocks.proposePredicates.mockClear()

    expect(await reclassifyClaims()).toBe(0)

    expect(mocks.proposePredicates).not.toHaveBeenCalled()
    expect(row(old.id)).toMatchObject({ status: 'active', end_reason: null, superseded_by: null })
    expect(activeRow({ predicate: 'hobby', value: 'draws on weekends' })).toBeUndefined()
  })

  it('makes no model call when the cap is 0 or privacy is off', async () => {
    seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    mocks.config.memory.reclassifyMaxPerRun = 0
    await reclassifyClaims()
    mocks.config.memory.reclassifyMaxPerRun = 20
    mocks.config.memory.privacy = 'off'
    await reclassifyClaims()
    expect(mocks.proposePredicates).not.toHaveBeenCalled()
    expect(mocks.jevConfirm).not.toHaveBeenCalled()
  })

  it('still reviews facts behind ones the model keeps in misc, so they cannot starve the rest', async () => {
    mocks.config.memory.reclassifyMaxPerRun = 2
    const kept = [
      seedClaim({ predicate: 'misc', value: 'owns a red bike' }),
      seedClaim({ predicate: 'misc', value: 'x1' })
    ]
    const later = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    mocks.proposePredicates.mockResolvedValue([
      ...kept.map(({ id }) => ({ id, predicate: 'keep' })),
      { id: later.id, predicate: 'hobby' }
    ])
    mocks.jevConfirm.mockResolvedValue({ [later.id]: 0.9 })
    expect(await reclassifyClaims()).toBe(1)
    expect(row(later.id)).toMatchObject({ end_reason: 'reclassified' })
  })

  it('skips a move whose target value the member told her to forget and keeps the original', async () => {
    const forgotten = seedClaim({ predicate: 'hobby', value: 'draws on weekends' })
    expect(rejectClaimIdsForSpeaker(GUILD, USER, [forgotten.id])).toBe(true)
    const old = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    mocks.proposePredicates.mockResolvedValue([{ id: old.id, predicate: 'hobby' }])
    mocks.jevConfirm.mockResolvedValue({ [old.id]: 0.9 })
    expect(await reclassifyClaims()).toBe(0)
    expect(row(old.id)).toMatchObject({ status: 'active', end_reason: null, superseded_by: null })
    expect(row(forgotten.id)).toMatchObject({ status: 'rejected', end_reason: 'forgotten' })
    expect(memoryEvents('claim_reclassified')).toHaveLength(0)
  })

  it('carries on after one move fails', async () => {
    const forgotten = seedClaim({ predicate: 'hobby', value: 'draws on weekends' })
    rejectClaimIdsForSpeaker(GUILD, USER, [forgotten.id])
    const blocked = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    const fine = seedClaim({ predicate: 'misc', value: 'plays chess' })
    mocks.proposePredicates.mockResolvedValue([
      { id: blocked.id, predicate: 'hobby' },
      { id: fine.id, predicate: 'hobby' }
    ])
    mocks.jevConfirm.mockResolvedValue({ [blocked.id]: 0.9, [fine.id]: 0.9 })
    expect(await reclassifyClaims()).toBe(1)
    expect(row(fine.id)).toMatchObject({ end_reason: 'reclassified' })
  })
})

describe('moveClaim', () => {
  it('does not evict an unrelated fact when the member is at the active-claim cap', () => {
    mocks.config.memory.maxActiveClaimsPerUser = 3
    const old = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    getDb().prepare('UPDATE memory_claim SET salience = 0.9 WHERE id = ?').run(old.id)
    const others = [seedClaim({ predicate: 'likes', value: 'tea' }), seedClaim({ predicate: 'likes', value: 'manga' })]
    expect(getActiveClaims(GUILD, USER)).toHaveLength(3)

    const movedId = moveClaim(candidateOf(old), 'hobby', 0.9)

    expect(row(movedId)).toMatchObject({ status: 'active' })
    expect(row(old.id)).toMatchObject({ end_reason: 'reclassified', superseded_by: movedId })
    for (const other of others) expect(row(other.id)).toMatchObject({ status: 'active' })
    expect(getActiveClaims(GUILD, USER)).toHaveLength(3)
  })

  it('keeps the pin of a fact someone pinned by hand', () => {
    const old = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    pinClaim(old.id)
    const movedId = moveClaim(candidateOf(old), 'hobby', 0.9)
    expect(row(movedId)).toMatchObject({ status: 'active', pinned: 1 })
  })

  it('will not replace a different fact in a single-valued predicate', () => {
    const existing = seedClaim({ predicate: 'pronouns', value: 'she/her' })
    const old = seedClaim({ predicate: 'misc', value: 'he/him' })

    expect(() => moveClaim(candidateOf(old), 'pronouns', 0.9)).toThrow()

    expect(row(existing.id)).toMatchObject({ status: 'active' })
    expect(row(old.id)).toMatchObject({ status: 'active', end_reason: null, superseded_by: null })
    expect(activeRow({ predicate: 'pronouns', value: 'he/him' })).toBeUndefined()
    expect(memoryEvents('claim_reclassified')).toHaveLength(0)
  })

  it('records only IDs, predicates and the probability in the audit event', () => {
    const old = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    const movedId = moveClaim(candidateOf(old), 'hobby', 0.9)
    const [event] = memoryEvents('claim_reclassified')
    expect(event).toMatchObject({ guild_id: GUILD, subject_user_id: USER })
    expect(JSON.parse(event?.detail as string)).toEqual({
      oldId: old.id,
      newId: movedId,
      from: 'misc',
      to: 'hobby',
      probability: 0.9,
      created: true
    })
  })

  it('refuses a fact that is no longer active and changes nothing', () => {
    const old = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    getDb().prepare("UPDATE memory_claim SET status = 'rejected', end_reason = 'removed' WHERE id = ?").run(old.id)
    expect(() => moveClaim(candidateOf(old), 'hobby', 0.9)).toThrow()
    expect(activeRow({ predicate: 'hobby', value: 'draws on weekends' })).toBeUndefined()
    expect(memoryEvents('claim_reclassified')).toHaveLength(0)
  })
})

describe('undoReclassify', () => {
  it('undoes a move', async () => {
    const old = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    const movedId = moveClaim({ ...candidateOf(old) }, 'hobby', 0.9)
    expect(undoReclassify(old.id)).toBe(true)
    expect(row(old.id)).toMatchObject({ status: 'active', end_reason: null, superseded_by: null })
    expect(row(movedId)).toMatchObject({ status: 'rejected', end_reason: 'removed' })
  })

  it('leaves a claim that already existed active when a duplicate-pair move is undone', () => {
    const misc = seedClaim({ predicate: 'misc', value: 'Japanese' })
    const language = seedClaim({ predicate: 'language_spoken', value: 'Japanese' })
    expect(moveClaim(candidateOf(misc), 'language_spoken', 0.9)).toBe(language.id)
    expect(JSON.parse(memoryEvents('claim_reclassified')[0]?.detail as string)).toMatchObject({ created: false })

    expect(undoReclassify(misc.id)).toBe(true)

    expect(row(misc.id)).toMatchObject({ status: 'active', end_reason: null, superseded_by: null })
    expect(row(language.id)).toMatchObject({ status: 'active' })
  })

  it('retires a replacement the move revived from an ended row', () => {
    const ended = seedClaim({ predicate: 'hobby', value: 'draws on weekends' })
    getDb()
      .prepare("UPDATE memory_claim SET status = 'rejected', end_reason = 'evicted', ended_at = 1 WHERE id = ?")
      .run(ended.id)
    const old = seedClaim({ predicate: 'misc', value: 'draws on weekends' })

    expect(moveClaim(candidateOf(old), 'hobby', 0.9)).toBe(ended.id)
    expect(row(ended.id)).toMatchObject({ status: 'active' })
    expect(undoReclassify(old.id)).toBe(true)

    expect(row(old.id)).toMatchObject({ status: 'active' })
    expect(row(ended.id)).toMatchObject({ status: 'rejected', end_reason: 'removed' })
  })

  it('has nothing to undo for a claim that was never reclassified', () => {
    const plain = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    const removed = seedClaim({ predicate: 'misc', value: 'plays chess' })
    getDb().prepare("UPDATE memory_claim SET status = 'rejected', end_reason = 'removed' WHERE id = ?").run(removed.id)
    expect(undoReclassify(plain.id)).toBe(false)
    expect(undoReclassify(removed.id)).toBe(false)
    expect(undoReclassify(9_999)).toBe(false)
    expect(row(plain.id)).toMatchObject({ status: 'active' })
  })

  it('cannot undo the same move twice', () => {
    const old = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    moveClaim(candidateOf(old), 'hobby', 0.9)
    expect(undoReclassify(old.id)).toBe(true)
    expect(undoReclassify(old.id)).toBe(false)
  })
})

describe('findReclassifyCandidates', () => {
  it('returns active current misc facts and the weaker side of a cross-category duplicate', () => {
    const misc = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    const likes = seedClaim({ predicate: 'likes', value: 'Tea' })
    const hobby = seedClaim({ predicate: 'hobby', value: 'tea' })
    getDb().prepare('UPDATE memory_claim SET salience = 0.9 WHERE id = ?').run(hobby.id)
    seedClaim({ predicate: 'likes', value: 'manga' })
    seedClaim({ predicate: 'misc', value: 'owned a bike', period: 'past' })
    const other = seedClaim({ predicate: 'misc', value: 'plays chess', userId: 'user-2' })
    const gone = seedClaim({ predicate: 'misc', value: 'is gone' })
    getDb().prepare("UPDATE memory_claim SET status = 'rejected' WHERE id = ?").run(gone.id)

    const all = findReclassifyCandidates(10).sort((left, right) => left.id - right.id)
    expect(all).toEqual([candidateOf(misc), candidateOf(likes), candidateOf(other)])
    const limited = findReclassifyCandidates(2).map(({ id }) => id)
    expect(limited).toHaveLength(2)
    expect(new Set(limited).size).toBe(2)
    expect(limited.every((id) => [misc.id, likes.id, other.id].includes(id))).toBe(true)
  })

  it('draws the pool at random, so the same lowest IDs are not reviewed every run', () => {
    const claims = Array.from({ length: 30 }, (_, index) => seedClaim({ predicate: 'misc', value: `fact ${index}` }))
    const lowestFive = new Set(claims.slice(0, 5).map(({ id }) => id))
    const seen = new Set<number>()
    for (let run = 0; run < 20; run += 1) {
      const pool = findReclassifyCandidates(5)
      expect(new Set(pool.map(({ id }) => id)).size).toBe(5)
      for (const { id } of pool) seen.add(id)
    }
    expect([...seen].some((id) => !lowestFive.has(id))).toBe(true)
    expect(seen.size).toBeGreaterThan(5)
  })

  it('leaves out a fact whose reclassification was undone', () => {
    const undone = seedClaim({ predicate: 'misc', value: 'draws on weekends' })
    const untouched = seedClaim({ predicate: 'misc', value: 'plays chess' })
    moveClaim(candidateOf(undone), 'hobby', 0.9)
    expect(undoReclassify(undone.id)).toBe(true)
    expect(row(undone.id)).toMatchObject({ status: 'active' })

    expect(findReclassifyCandidates(10).map(({ id }) => id)).toEqual([untouched.id])
  })

  it('files the misc side of a duplicate as the candidate, whatever the salience', () => {
    const misc = seedClaim({ predicate: 'misc', value: 'Japanese' })
    const language = seedClaim({ predicate: 'language_spoken', value: 'Japanese' })
    getDb().prepare('UPDATE memory_claim SET salience = 0.1 WHERE id = ?').run(language.id)
    expect(findReclassifyCandidates(10).map(({ id }) => id)).toEqual([misc.id])
  })

  it('does not pair facts across members or periods', () => {
    seedClaim({ predicate: 'likes', value: 'Tea' })
    seedClaim({ predicate: 'hobby', value: 'tea', userId: 'user-2' })
    seedClaim({ predicate: 'dislikes', value: 'tea', period: 'past' })
    expect(findReclassifyCandidates(10)).toEqual([])
  })
})
