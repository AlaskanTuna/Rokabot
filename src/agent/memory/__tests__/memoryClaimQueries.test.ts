import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    memory: {
      maxActiveClaimsPerUser: 2,
      stableClaimRetentionDays: 180,
      claimRetentionDays: 30,
      transientClaimRetentionDays: 14,
      deadClaimRetentionDays: 30,
      maxClaimsPerTurn: 10
    }
  }
}))

import { closeDb, getDb } from '../../../storage/database.js'
import {
  SOURCE_WEIGHT,
  activeNicknameClaims,
  findReclassifiedClaim,
  findUserClaimStatus,
  getActiveClaimsForUsers,
  priorClaimStatus,
  searchClaimIds
} from '../memoryClaims.js'

const NOW = Date.UTC(2026, 6, 23, 12)

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  vi.restoreAllMocks()
})

function insertClaim({
  id,
  guildId = 'guild-1',
  subjectKind = 'user',
  userId = 'user-1',
  predicate = 'likes',
  value = 'tea',
  sourceKind = 'explicit',
  status = 'active',
  period = 'current',
  needsReview = 0,
  endReason = null
}: {
  id?: number
  guildId?: string
  subjectKind?: 'user' | 'guild'
  userId?: string | null
  predicate?: string
  value?: string
  sourceKind?: string
  status?: string
  period?: string
  needsReview?: number
  endReason?: string | null
} = {}): number {
  const columns = [
    'guild_id',
    'subject_kind',
    'subject_user_id',
    'predicate',
    'value',
    'source_kind',
    'status',
    'salience',
    'needs_review',
    'first_seen_at',
    'last_seen_at',
    'period',
    'end_reason'
  ]
  const params = [
    guildId,
    subjectKind,
    userId ?? null,
    predicate,
    value,
    sourceKind,
    status,
    0.5,
    needsReview,
    NOW,
    NOW,
    period,
    endReason
  ]
  if (id !== undefined) {
    columns.unshift('id')
    params.unshift(id)
  }
  const placeholders = params.map(() => '?').join(', ')
  getDb()
    .prepare(`INSERT INTO memory_claim (${columns.join(', ')}) VALUES (${placeholders})`)
    .run(...params)
  return (getDb().prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id
}

describe('memory claim queries', () => {
  it('leaves out claims whose status is not active', () => {
    insertClaim({ userId: 'user-1', value: 'tea', status: 'active' })
    insertClaim({ userId: 'user-1', value: 'coffee', status: 'superseded' })
    insertClaim({ userId: 'user-1', value: 'cake', status: 'candidate' })

    expect(getActiveClaimsForUsers('guild-1', ['user-1']).map((claim) => claim.value)).toEqual(['tea'])
  })

  it('leaves out claims flagged needs_review from full-text search', () => {
    const visible = insertClaim({ userId: 'user-1', value: 'blueberry pancakes', needsReview: 0 })
    insertClaim({ userId: 'user-1', value: 'blueberry waffles', needsReview: 1 })

    expect(searchClaimIds('guild-1', ['user-1'], 'blueberry')).toEqual(new Set([visible]))
  })

  it('keeps the exact source weights', () => {
    expect(SOURCE_WEIGHT).toEqual({ explicit: 1, human: 1, passive: 0.75, legacy: 0.5 })
  })

  it('returns nickname claims in id order', () => {
    const first = insertClaim({ userId: 'user-2', predicate: 'nickname', value: 'Rin' })
    const second = insertClaim({ userId: 'user-1', predicate: 'nickname', value: 'Rinnie' })
    const third = insertClaim({ userId: 'user-3', predicate: 'nickname', value: 'Rinny' })
    // Without ORDER BY SQLite walks rows in storage order, so flip the scan to prove the sort is real.
    getDb().exec('PRAGMA reverse_unordered_selects = ON')

    expect(activeNicknameClaims('guild-1')).toEqual([
      { id: first, user_id: 'user-2', value: 'Rin' },
      { id: second, user_id: 'user-1', value: 'Rinnie' },
      { id: third, user_id: 'user-3', value: 'Rinny' }
    ])
  })

  it('does not match a claim from a different period', () => {
    insertClaim({ userId: 'user-1', value: 'tea', period: 'past', status: 'active' })
    expect(findUserClaimStatus('guild-1', 'user-1', 'likes', 'tea')).toBeUndefined()

    insertClaim({ userId: 'user-1', value: 'cake', period: 'current', status: 'active' })
    expect(findUserClaimStatus('guild-1', 'user-1', 'likes', 'cake')).toEqual({
      status: 'active',
      end_reason: null
    })
  })

  it('does not match a claim with a different end_reason', () => {
    const removed = insertClaim({ userId: 'user-1', value: 'tea', status: 'rejected', endReason: 'removed' })
    expect(findReclassifiedClaim(removed)).toBeUndefined()

    const reclassified = insertClaim({
      userId: 'user-1',
      value: 'cake',
      status: 'rejected',
      endReason: 'reclassified'
    })
    expect(findReclassifiedClaim(reclassified)).toEqual({
      guild_id: 'guild-1',
      subject_user_id: 'user-1',
      superseded_by: null
    })
  })

  it('finds a user claim only under the matching user', () => {
    insertClaim({ userId: 'user-1', value: 'tea', status: 'active', period: 'current' })

    expect(priorClaimStatus('guild-1', { kind: 'user', userId: 'user-1' }, 'likes', 'tea', 'current')).toBe('active')
    expect(priorClaimStatus('guild-1', { kind: 'user', userId: 'user-2' }, 'likes', 'tea', 'current')).toBeUndefined()
  })

  it('finds a guild claim under the guild subject', () => {
    insertClaim({ subjectKind: 'guild', userId: null, predicate: 'running_joke', value: 'Monday meeting' })

    expect(priorClaimStatus('guild-1', { kind: 'guild' }, 'running_joke', 'Monday meeting', 'current')).toBe('active')
    expect(
      priorClaimStatus('guild-1', { kind: 'user', userId: 'user-1' }, 'running_joke', 'Monday meeting', 'current')
    ).toBeUndefined()
  })
})
