import { describe, expect, it } from 'vitest'
import { estimateMediaTokens, planCoverage } from '../plan.js'

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
