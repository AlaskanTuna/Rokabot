import type { CoveragePlan, MediaClip, MediaKind } from './types.js'

const FPS_LADDER = [1, 0.5, 0.25, 0.1, 0.05] as const

function preferredFps(durationSec: number): number {
  if (durationSec <= 120) return 1
  if (durationSec <= 600) return 0.25
  return 0.1
}

export function estimateMediaTokens({
  frames,
  audioSec,
  parts
}: { frames: number; audioSec: number; parts: number }): number {
  const mediaTokens = 70 * frames + 32 * audioSec
  return Math.ceil(mediaTokens + mediaTokens / 10) + 64 * parts
}

function equalBins(durationSec: number): MediaClip[] {
  const count = Math.min(8, Math.max(3, Math.ceil(durationSec / 120)))
  const width = durationSec / count
  return Array.from({ length: count }, (_, i) => ({
    startSec: Math.round(i * width),
    endSec: i === count - 1 ? Math.round(durationSec) : Math.round((i + 1) * width)
  }))
}

export function planCoverage(input: {
  kind: MediaKind
  durationSec: number | null
  budgetTokens: number
  /** URI sources can be clipped without resending bytes; inline sources cannot. */
  canSkim: boolean
  skimClips: number
  skimClipSeconds: number
}): CoveragePlan {
  const { kind, durationSec, budgetTokens } = input
  if (durationSec === null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return { mode: 'decline', kind, durationSec: null, reason: 'unknown_duration' }
  }
  if (kind === 'audio') {
    const estimate = estimateMediaTokens({ frames: 0, audioSec: durationSec, parts: 1 })
    return estimate <= budgetTokens
      ? { mode: 'whole', kind, durationSec, fps: null, estimate, bins: equalBins(durationSec) }
      : { mode: 'decline', kind, durationSec, reason: 'too_long' }
  }
  const start = FPS_LADDER.indexOf(preferredFps(durationSec) as (typeof FPS_LADDER)[number])
  const floor = durationSec <= 120 ? start : FPS_LADDER.length - 1
  for (let i = start; i <= floor; i++) {
    const fps = FPS_LADDER[i]
    const estimate = estimateMediaTokens({ frames: Math.ceil(durationSec * fps), audioSec: durationSec, parts: 1 })
    if (estimate <= budgetTokens)
      return { mode: 'whole', kind, durationSec, fps, estimate, bins: equalBins(durationSec) }
  }
  if (!input.canSkim) return { mode: 'decline', kind, durationSec, reason: 'too_long' }
  const count = Math.min(input.skimClips, Math.max(3, Math.ceil(durationSec / 120)))
  const length = Math.min(input.skimClipSeconds, durationSec / count)
  const clips = Array.from({ length: count }, (_, i) => {
    const startSec = Math.round((i * (durationSec - length)) / (count - 1))
    return { startSec, endSec: Math.round(startSec + length) }
  })
  const estimate = estimateMediaTokens({ frames: Math.ceil(count * length), audioSec: count * length, parts: count })
  if (estimate > budgetTokens) return { mode: 'decline', kind, durationSec, reason: 'too_long' }
  return { mode: 'skim', kind: 'video', durationSec, clips, estimate, bins: clips }
}

// Between these lengths a video fits whole in two halves but not in one watch; see `planHalves`.
export const HALVES_MIN_DURATION_SEC = 1200
export const HALVES_MAX_DURATION_SEC = 2400

// A timestamp on a link points at a moment, so the watch spends its budget densely around it rather than
// thinly across the whole video.
const FOCUS_BEFORE_SEC = 30
const FOCUS_AFTER_SEC = 90

/** The stretch watched around a linked timestamp: from 30 s before it to 90 s after. */
export function focusWindow(durationSec: number, startSec: number): MediaClip {
  const centerSec = Math.min(Math.max(0, startSec), durationSec)
  return {
    startSec: Math.round(Math.max(0, centerSec - FOCUS_BEFORE_SEC)),
    endSec: Math.round(Math.min(durationSec, centerSec + FOCUS_AFTER_SEC))
  }
}

export function planFocus(input: { durationSec: number; startSec: number; budgetTokens: number }): CoveragePlan {
  const { durationSec, budgetTokens } = input
  const centerSec = Math.min(Math.max(0, input.startSec), durationSec)
  const clip = focusWindow(durationSec, input.startSec)
  const length = clip.endSec - clip.startSec
  const estimate = estimateMediaTokens({ frames: Math.ceil(length), audioSec: length, parts: 1 })
  if (length <= 0 || estimate > budgetTokens) return { mode: 'decline', kind: 'video', durationSec, reason: 'too_long' }
  return { mode: 'focus', kind: 'video', durationSec, centerSec, clips: [clip], estimate, bins: [clip] }
}

export type WatchWindow = MediaClip & {
  /** The last half runs to the real end, which an estimated duration may put early or late. */
  openEnd?: true
}

export interface HalfWatch {
  plan: Extract<CoveragePlan, { mode: 'whole' }>
  /** The part of the full video this watch covers; its plan's bins are already positions in the full video. */
  window: WatchWindow
}

export interface HalvesPlan {
  halves: [HalfWatch, HalfWatch]
  halfEstimate: number
}

/**
 * Two whole watches over consecutive halves of one video, each planned as a whole video of its own length. Null
 * when a half would not fit whole, so the caller keeps its single plan.
 */
export function planHalves(input: { durationSec: number; budgetTokens: number }): HalvesPlan | null {
  const durationSec = Math.round(input.durationSec)
  const halfSec = durationSec / 2
  const half = planCoverage({
    kind: 'video',
    durationSec: halfSec,
    budgetTokens: input.budgetTokens,
    canSkim: false,
    skimClips: 0,
    skimClipSeconds: 0
  })
  if (half.mode !== 'whole') return null

  const secondBins = half.bins.map((bin, index, bins) => ({
    startSec: Math.round(bin.startSec + halfSec),
    endSec: index === bins.length - 1 ? durationSec : Math.round(bin.endSec + halfSec)
  }))
  return {
    halves: [
      { plan: { ...half, durationSec }, window: { startSec: 0, endSec: halfSec } },
      {
        plan: { ...half, durationSec, bins: secondBins },
        window: { startSec: halfSec, endSec: durationSec, openEnd: true }
      }
    ],
    halfEstimate: half.estimate
  }
}
