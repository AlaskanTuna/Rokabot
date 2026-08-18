import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    memory: { maxActiveClaimsPerUser: 20, maxFactsPerUser: 20 }
  }
}))

import { closeDb, getDb } from '../../../storage/database.js'
import { rememberUser } from '../../tools/rememberUser.js'
import { assertClaim, getActiveClaims } from '../memoryClaims.js'
import { sensitiveFactReason } from '../privacyGuard.js'

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  vi.restoreAllMocks()
})

/** The calibration corpus. The point of the guard is what it lets through, so this half is the half that
 * fails if someone tightens it: every entry is a fact the controlled vocabulary exists to hold. */
const LEGITIMATE: Array<[string, string]> = [
  ['favorite_anime', 'Frieren'],
  ['nickname', 'Sora-chan'],
  ['diet', 'allergic to peanuts'],
  ['general_occupation', 'works night shifts as a nurse'],
  ['birthday', 'March 15'],
  ['age', '24'],
  ['hobby', 'learning the shamisen'],
  ['daily_routine', 'only online after midnight'],
  ['pets', 'two cats called Mugi and Nori'],
  ['strong_opinion', 'the 1990-2000 era was the best'],
  ['misc', 'born in 1998'],
  ['complains_about', 'the 3.30 pm train'],
  ['misc', 'has 3 cats and 12 fish'],
  ['recommends', 'Mushishi, all 26 episodes'],
  ['misc', 'lives in Tokyo'],
  ['misc', 'PB is 1500-2000 damage per run']
]

const SENSITIVE: Array<[string, string, string]> = [
  ['email', 'redacted', 'sensitive_key'],
  ['home_address', '12 Sakura Lane', 'sensitive_key'],
  ['homeAddress', 'redacted', 'sensitive_key'],
  ['Home Address', 'redacted', 'sensitive_key'],
  ['password', 'hunter2', 'sensitive_key'],
  ['apiKey', 'redacted', 'sensitive_key'],
  ['salary', '50000', 'sensitive_key'],
  ['passport_number', 'redacted', 'sensitive_key'],
  ['misc', 'reach me at sora@example.com', 'email'],
  ['misc', 'call me on +81 90-1234-5678', 'phone'],
  ['misc', 'my number is 555-123-4567', 'phone'],
  ['misc', 'card 4111 1111 1111 1111', 'account_number'],
  ['misc', 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5', 'credential']
]

describe('sensitiveFactReason', () => {
  it.each(LEGITIMATE)('keeps the fact the vocabulary exists to hold: %s', (key, value) => {
    expect(sensitiveFactReason(key, value)).toBeUndefined()
  })

  it.each(SENSITIVE)('refuses %s / %s as %s', (key, value, reason) => {
    expect(sensitiveFactReason(key, value)).toBe(reason)
  })
})

describe('remember_user privacy floor', () => {
  it('reports the refusal instead of claiming it remembered something it dropped', () => {
    const result = rememberUser({
      user_id: 'user-1',
      guild_id: 'guild-1',
      fact_key: 'phone_number',
      fact_value: '555-123-4567'
    })

    expect(result.success).toBe(false)
    expect(result.message).not.toMatch(/^Remembered/)
    expect(getActiveClaims('guild-1', 'user-1')).toHaveLength(0)
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM user_memory').get()).toEqual({ n: 0 })
  })

  // Separate from the privacy floor: the prompt-safety guard drops the fact too, and saveFact's boolean
  // used to be discarded, so this path answered "Remembered" about a fact that reached neither store.
  it('reports failure when the injection guard drops the fact', () => {
    const result = rememberUser({
      user_id: 'user-1',
      guild_id: 'guild-1',
      fact_key: 'misc',
      fact_value: '<script>alert(1)</script>'
    })

    expect(result.success).toBe(false)
    expect(result.message).not.toMatch(/^Remembered/)
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM user_memory').get()).toEqual({ n: 0 })
    expect(getActiveClaims('guild-1', 'user-1')).toHaveLength(0)
  })

  it('still stores an ordinary fact', () => {
    const result = rememberUser({
      user_id: 'user-1',
      guild_id: 'guild-1',
      fact_key: 'favorite_anime',
      fact_value: 'Frieren'
    })

    expect(result.success).toBe(true)
    expect(getActiveClaims('guild-1', 'user-1')).toHaveLength(1)
  })
})

describe('claim-level privacy floor', () => {
  it('refuses a sensitive value filed under an innocent predicate', () => {
    expect(() =>
      assertClaim({
        guildId: 'guild-1',
        subjectUserId: 'user-1',
        predicate: 'misc',
        value: 'reach me at sora@example.com',
        sourceKind: 'passive'
      })
    ).toThrow('Claim value is unsafe')
  })

  // The extractor skips an unsafe op by matching this message exactly (extractor.ts isUnsafeClaimError).
  // Reword either side and a single sensitive value stops being skipped and aborts the whole batch, taking
  // every good claim in it down with one bad one — silently, since the batch runs in the background.
  it('refuses with the exact message the extractor skips on', () => {
    let message: string | undefined
    try {
      assertClaim({
        guildId: 'guild-1',
        subjectUserId: 'user-1',
        predicate: 'misc',
        value: 'card 4111 1111 1111 1111',
        sourceKind: 'passive'
      })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toBe('Claim value is unsafe')
  })
})
