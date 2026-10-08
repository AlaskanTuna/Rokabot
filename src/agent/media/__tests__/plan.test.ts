import { describe, expect, it } from 'vitest'
import { estimateMediaTokens, planCoverage, planFocus, planHalves } from '../plan.js'

describe('estimateMediaTokens', () => {
  it('applies frame, audio, headroom and media-part costs', () => {
    expect(estimateMediaTokens({ frames: 1, audioSec: 1, parts: 1 })).toBe(177)
  })
})

describe('planCoverage', () => {
  const defaults = {
    budgetTokens: 50_000,
    canSkim: false,
    skimClips: 8,
    skimClipSeconds: 10
  }

  it.each([
    [19, 1],
    [120, 1],
    [121, 0.25],
    [600, 0.25],
    [601, 0.1]
  ])('uses the preferred frame density for a %i second video', (durationSec, fps) => {
    const plan = planCoverage({ ...defaults, kind: 'video', durationSec })

    expect(plan).toMatchObject({ mode: 'whole', kind: 'video', fps })
  })

  it('watches a 19 second video whole at one frame per second with three bins', () => {
    const plan = planCoverage({ ...defaults, kind: 'video', durationSec: 19 })

    expect(plan).toMatchObject({ mode: 'whole', fps: 1, durationSec: 19 })
    if (plan.mode === 'whole') {
      expect(plan.bins).toHaveLength(3)
      expect(plan.bins[0].startSec).toBe(0)
      expect(plan.estimate).toBeLessThan(defaults.budgetTokens)
    }
  })

  it('reduces a 20 minute video to 0.05 fps when 0.1 fps exceeds budget', () => {
    const plan = planCoverage({ ...defaults, kind: 'video', durationSec: 1200 })

    expect(plan).toMatchObject({ mode: 'whole', fps: 0.05, durationSec: 1200, estimate: 46_924 })
    if (plan.mode === 'whole') expect(plan.bins).toHaveLength(8)
  })

  it('skims an over-budget 45 minute video when it comes from a URI', () => {
    const plan = planCoverage({ ...defaults, kind: 'video', durationSec: 2700, canSkim: true })

    expect(plan).toMatchObject({ mode: 'skim', kind: 'video', durationSec: 2700, estimate: 9488 })
    if (plan.mode === 'skim') {
      expect(plan.clips).toHaveLength(8)
      expect(plan.clips[0].startSec).toBe(0)
      expect(plan.clips[7].endSec).toBe(2700)
      expect(plan.bins).toEqual(plan.clips)
      expect(plan.clips.every((clip, index, clips) => index === 0 || clip.startSec > clips[index - 1].startSec)).toBe(
        true
      )
    }
  })

  it('declines an over-budget 45 minute inline video', () => {
    expect(planCoverage({ ...defaults, kind: 'video', durationSec: 2700 })).toEqual({
      mode: 'decline',
      kind: 'video',
      durationSec: 2700,
      reason: 'too_long'
    })
  })

  it('declines when the skim estimate exceeds the budget', () => {
    expect(
      planCoverage({ ...defaults, kind: 'video', durationSec: 2700, canSkim: true, budgetTokens: 1000 })
    ).toMatchObject({ mode: 'decline', reason: 'too_long' })
  })

  it('declines an unknown or invalid duration', () => {
    for (const durationSec of [null, Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(planCoverage({ ...defaults, kind: 'audio', durationSec })).toEqual({
        mode: 'decline',
        kind: 'audio',
        durationSec: null,
        reason: 'unknown_duration'
      })
    }
  })

  it('creates three bins for a 19 second video and eight bins for a 20 minute video', () => {
    const shortPlan = planCoverage({ ...defaults, kind: 'video', durationSec: 19 })
    const longPlan = planCoverage({ ...defaults, kind: 'video', durationSec: 1200 })

    expect(shortPlan.mode === 'whole' && shortPlan.bins).toHaveLength(3)
    expect(longPlan.mode === 'whole' && longPlan.bins).toHaveLength(8)
  })

  it('distributes eight skim clips from the beginning through the end', () => {
    const plan = planCoverage({ ...defaults, kind: 'video', durationSec: 2700, canSkim: true })

    if (plan.mode !== 'skim') throw new Error('Expected a skim plan')

    expect(plan.clips[0].startSec).toBe(0)
    expect(plan.clips[7].endSec).toBe(2700)
    expect(plan.clips.every((clip, index, clips) => index === 0 || clip.startSec > clips[index - 1].startSec)).toBe(
      true
    )
  })

  it('watches 20 minute audio whole without skimming', () => {
    const plan = planCoverage({ ...defaults, kind: 'audio', durationSec: 1200, canSkim: true })

    expect(plan).toMatchObject({ mode: 'whole', kind: 'audio', durationSec: 1200, fps: null, estimate: 42_304 })
  })

  it('declines 40 minute audio even when skimming is available', () => {
    expect(planCoverage({ ...defaults, kind: 'audio', durationSec: 2400, canSkim: true })).toEqual({
      mode: 'decline',
      kind: 'audio',
      durationSec: 2400,
      reason: 'too_long'
    })
  })
})

describe('planFocus', () => {
  it('watches from 30 s before the timestamp to 90 s after it at full density', () => {
    expect(planFocus({ durationSec: 1200, startSec: 754, budgetTokens: 50_000 })).toEqual({
      mode: 'focus',
      kind: 'video',
      durationSec: 1200,
      centerSec: 754,
      clips: [{ startSec: 724, endSec: 844 }],
      estimate: estimateMediaTokens({ frames: 120, audioSec: 120, parts: 1 }),
      bins: [{ startSec: 724, endSec: 844 }]
    })
  })

  it('clamps the window to the start of the video', () => {
    expect(planFocus({ durationSec: 1200, startSec: 10, budgetTokens: 50_000 })).toMatchObject({
      clips: [{ startSec: 0, endSec: 100 }]
    })
  })

  it('clamps a timestamp past the end to the closing stretch', () => {
    expect(planFocus({ durationSec: 600, startSec: 900, budgetTokens: 50_000 })).toMatchObject({
      centerSec: 600,
      clips: [{ startSec: 570, endSec: 600 }]
    })
  })

  it('declines when even the window does not fit the budget', () => {
    expect(planFocus({ durationSec: 1200, startSec: 754, budgetTokens: 1000 })).toMatchObject({
      mode: 'decline',
      reason: 'too_long'
    })
  })
})

describe('planHalves', () => {
  it('plans a 35 minute video as two whole halves at one frame rate, with bins in full-video positions', () => {
    const halves = planHalves({ durationSec: 2100, budgetTokens: 43_478 })

    expect(halves).not.toBeNull()
    if (!halves) return
    const [first, second] = halves.halves
    const estimate = estimateMediaTokens({ frames: 53, audioSec: 1050, parts: 1 })
    expect(halves.halfEstimate).toBe(estimate)
    expect(first).toEqual({
      plan: {
        mode: 'whole',
        kind: 'video',
        durationSec: 2100,
        fps: 0.05,
        estimate,
        bins: [
          { startSec: 0, endSec: 131 },
          { startSec: 131, endSec: 263 },
          { startSec: 263, endSec: 394 },
          { startSec: 394, endSec: 525 },
          { startSec: 525, endSec: 656 },
          { startSec: 656, endSec: 788 },
          { startSec: 788, endSec: 919 },
          { startSec: 919, endSec: 1050 }
        ]
      },
      window: { startSec: 0, endSec: 1050 }
    })
    expect(second.plan).toMatchObject({ mode: 'whole', durationSec: 2100, fps: 0.05, estimate })
    expect(second.plan.bins).toEqual([
      { startSec: 1050, endSec: 1181 },
      { startSec: 1181, endSec: 1313 },
      { startSec: 1313, endSec: 1444 },
      { startSec: 1444, endSec: 1575 },
      { startSec: 1575, endSec: 1706 },
      { startSec: 1706, endSec: 1838 },
      { startSec: 1838, endSec: 1969 },
      { startSec: 1969, endSec: 2100 }
    ])
    expect(second.window).toEqual({ startSec: 1050, endSec: 2100 })
  })

  it('returns null when either half cannot be watched whole', () => {
    expect(planHalves({ durationSec: 2100, budgetTokens: 20_000 })).toBeNull()
  })
})
