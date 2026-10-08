export type MediaKind = 'audio' | 'video'

export interface MediaClip {
  startSec: number
  endSec: number
}

export type CoveragePlan =
  | { mode: 'whole'; kind: MediaKind; durationSec: number; fps: number | null; estimate: number; bins: MediaClip[] }
  | { mode: 'skim'; kind: 'video'; durationSec: number; clips: MediaClip[]; estimate: number; bins: MediaClip[] }
  | {
      mode: 'focus'
      kind: 'video'
      durationSec: number
      centerSec: number
      clips: MediaClip[]
      estimate: number
      bins: MediaClip[]
    }
  | { mode: 'decline'; kind: MediaKind; durationSec: number | null; reason: 'too_long' | 'unknown_duration' }

export interface MediaObservations {
  summary: string
  timeline: Array<{ bin: number; visual: string; audio: string }>
  speech: Array<{ bin: number; speaker: string | null; quote: string }>
  onScreenText: Array<{ bin: number; text: string }>
  uncertainties: string[]
}

export interface MediaDigest {
  kind: MediaKind
  /** Human label for the source, e.g. "YouTube video", "uploaded video", "voice message". */
  label: string
  durationSec: number
  mode: 'whole' | 'skim' | 'focus' | 'opening'
  fps: number | null
  /** The moment a focused watch was centred on. */
  focusSec?: number
  /** The file had no sound track. */
  silent?: boolean
  bins: MediaClip[]
  observations: MediaObservations
  /** True when validation dropped or truncated anything the model returned. */
  incomplete: boolean
}
