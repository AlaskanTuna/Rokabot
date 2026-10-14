import { describe, expect, it } from 'vitest'
import { seededRandom } from '../recall-calibration-sample.js'
import { formatKappa, kindStatus, recommend, reportKind } from '../recall-gate-thresholds.js'

const pair = (turn: number, probability: number, relevant: boolean) => ({
  pairId: `t${turn}-${probability}`,
  turnRef: `t${turn}`,
  kind: 'fact',
  probability,
  relevant
})

describe('kindStatus', () => {
  it('confirms a kind at 50 selections over 30 turns with a high bootstrap lower bound', () => {
    const rows = Array.from({ length: 50 }, (_, index) => pair(index % 30, 0.95, index !== 0))
    expect(kindStatus(rows, 0.9, seededRandom(1))).toMatchObject({ selected: 50, turns: 30, status: 'confirmed' })
  })

  it('is provisional at 22 of 25 over 20 turns, and disabled at 21 of 25', () => {
    const make = (wrong: number) => Array.from({ length: 25 }, (_, index) => pair(index % 20, 0.95, index >= wrong))
    expect(kindStatus(make(3), 0.9, seededRandom(1)).status).toBe('provisional')
    expect(kindStatus(make(4), 0.9, seededRandom(1)).status).toBe('disabled')
  })

  it('is disabled below 20 turns whatever the precision', () => {
    const rows = Array.from({ length: 30 }, (_, index) => pair(index % 10, 0.95, true))
    expect(kindStatus(rows, 0.9, seededRandom(1)).status).toBe('disabled')
  })

  it('disables a confirmation-eligible kind whose bootstrap lower bound fails, even at 88% precision', () => {
    // 50 selections over 30 turns: 20 turns hold one pair, 10 turns hold three. Six misses sit in two of the
    // three-pair turns, so precision is 44/50 but resampling turns often draws both bad ones.
    const turnOf = (index: number) => (index < 20 ? index : 20 + Math.floor((index - 20) / 3))
    const rows = Array.from({ length: 50 }, (_, index) => pair(turnOf(index), 0.95, index < 20 || index > 25))
    const result = kindStatus(rows, 0.9, seededRandom(1))
    expect(result).toMatchObject({ selected: 50, turns: 30 })
    expect(result.precision).toBeGreaterThanOrEqual(0.88)
    expect(result.lowerBound).toBeLessThan(0.8)
    expect(result.status).toBe('disabled')
  })

  it('resamples whole turns, so two all-miss turns pull the bound below 80% at about 90% precision', () => {
    // 28 all-hit turns of 3 rows and two all-miss turns of 5 rows: precision 84/94. Resampling rows would give a
    // bound near 0.83; resampling turns draws a bad turn often enough to give 0.75.
    const hits = Array.from({ length: 28 }, (_, turn) => Array.from({ length: 3 }, () => pair(turn, 0.95, true))).flat()
    const misses = [28, 29].flatMap((turn) => Array.from({ length: 5 }, () => pair(turn, 0.95, false)))
    const result = kindStatus([...hits, ...misses], 0.9, seededRandom(1))
    expect(result).toMatchObject({ selected: 94, turns: 30 })
    expect(result.precision).toBeGreaterThanOrEqual(0.88)
    expect(result.lowerBound).toBeLessThan(0.8)
    expect(result.status).toBe('disabled')
  })

  it('stays provisional at 50 selections over 25 turns, because confirmation needs both 50 and 30', () => {
    const rows = Array.from({ length: 50 }, (_, index) => pair(index % 25, 0.95, index > 1))
    expect(kindStatus(rows, 0.9, seededRandom(1))).toMatchObject({ selected: 50, turns: 25, status: 'provisional' })
  })
})

describe('recommend', () => {
  it('recommends the lowest cutoff that holds the best status on the holdout half', () => {
    // Turn refs end in their turn number, so odd turns form the holdout: 30 holdout turns, one relevant pair at 0.85
    // and one irrelevant pair at 0.7 each. 0.7 halves precision; 0.85 keeps it at 100% over 30 selections.
    const rows = Array.from({ length: 60 }, (_, turn) => [pair(turn, 0.85, true), pair(turn, 0.7, false)]).flat()
    expect(recommend(rows, seededRandom(1))).toMatchObject({ cutoff: 0.85, status: 'provisional' })
  })

  it('chooses the cutoff on the development half and reports the holdout status there', () => {
    // Development (even turns): 0.9 is clean, 0.7 adds an irrelevant pair per turn, so development picks 0.9.
    // Holdout (odd turns): two relevant pairs at 0.7 would confirm at 0.7, but the holdout must not steer the cutoff.
    const rows = Array.from({ length: 60 }, (_, turn) =>
      turn % 2 === 0
        ? [pair(turn, 0.9, true), pair(turn, 0.7, false)]
        : [pair(turn, 0.9, true), pair(turn, 0.7, true), pair(turn, 0.7, true)]
    ).flat()
    const holdout = rows.filter(({ turnRef }) => Number(turnRef.slice(1)) % 2 === 1)
    expect(kindStatus(holdout, 0.7, seededRandom(1)).status).toBe('confirmed')
    expect(recommend(rows, seededRandom(1))).toMatchObject({ cutoff: 0.9, status: 'provisional' })
  })

  it('breaks a development tie toward the lowest cutoff', () => {
    // Development: 27 pairs at 0.9 and 3 at 0.8 over 30 turns. Both cutoffs are provisional, and 0.8 is lower.
    const rows = Array.from({ length: 60 }, (_, turn) => pair(turn, turn % 2 === 0 && turn < 6 ? 0.8 : 0.9, true))
    expect(recommend(rows, seededRandom(1))).toMatchObject({ cutoff: 0.8, status: 'provisional' })
  })

  it('returns no cutoff when development qualifies but the holdout is disabled', () => {
    const rows = Array.from({ length: 60 }, (_, turn) => pair(turn, 0.9, turn % 2 === 0 || turn % 4 === 1))
    const development = rows.filter((_, turn) => turn % 2 === 0)
    expect(kindStatus(development, 0.9, seededRandom(1)).status).toBe('provisional')
    expect(recommend(rows, seededRandom(1))).toMatchObject({ cutoff: null, status: 'disabled' })
  })

  it('splits turns by the last hex digit: a is development, b is holdout', () => {
    // 'a' is 10 and 'b' is 11, so base 10 would read neither as an odd digit and put every turn in development.
    // The two halves differ in size, so swapping their roles would show in the holdout count.
    const withRef = (index: number, last: 'a' | 'b') => ({
      ...pair(0, 0.9, true),
      turnRef: `${index.toString(16).padStart(15, '0')}${last}`
    })
    const development = Array.from({ length: 30 }, (_, index) => withRef(index, 'a'))
    const holdout = Array.from({ length: 26 }, (_, index) => withRef(index, 'b'))
    expect(development[0]?.turnRef).toHaveLength(16)
    expect(recommend([...development, ...holdout], seededRandom(1))).toMatchObject({
      cutoff: 0.9,
      status: 'provisional',
      holdout: { selected: 26, turns: 26 }
    })
  })

  it('reports why a kind has no cutoff, in both null cases', () => {
    const rejectedRows = Array.from({ length: 60 }, (_, turn) => pair(turn, 0.9, turn % 2 === 0 || turn % 4 === 1))
    const noCutoff = recommend([], seededRandom(1))
    const rejected = recommend(rejectedRows, seededRandom(1))
    expect(noCutoff).toMatchObject({
      cutoff: null,
      developmentCutoff: null,
      developmentStatus: 'disabled',
      holdout: null
    })
    expect(rejected).toMatchObject({
      cutoff: null,
      developmentCutoff: 0.9,
      developmentStatus: 'provisional',
      holdout: { selected: 30, status: 'disabled' }
    })
  })
})

describe('report', () => {
  it('prints the two null recommendations differently', () => {
    const rejectedRows = Array.from({ length: 60 }, (_, turn) => pair(turn, 0.9, turn % 2 === 0 || turn % 4 === 1))
    const none = reportKind('fact', 0, 0, recommend([], seededRandom(1)))
    const rejected = reportKind('fact', 60, 0, recommend(rejectedRows, seededRandom(1)))
    expect(none).toContain('no development cutoff qualifies')
    expect(rejected).toContain('holdout rejected cutoff 0.9')
    expect(rejected).not.toContain('no development cutoff qualifies')
  })

  it('prints the recommended cutoff with its development and holdout results', () => {
    const rows = Array.from({ length: 60 }, (_, turn) => [pair(turn, 0.85, true), pair(turn, 0.7, false)]).flat()
    const pick = recommend(rows, seededRandom(1))
    const line = reportKind('media', 120, 4, pick)
    expect(line).toContain('media: 120 agreed, 4 disagreed')
    expect(line).toContain('recommend 0.85 (provisional)')
    expect(line).toContain(JSON.stringify(pick.holdout))
  })

  it('prints a null kappa as n/a', () => {
    expect(formatKappa(null)).toBe('n/a')
    expect(formatKappa(0.5)).toBe('0.500')
  })
})
