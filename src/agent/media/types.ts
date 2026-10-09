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
  /** What a viewer would bring up afterwards. Absent from notes saved before it existed. */
  moments?: Array<{ bin: number; note: string }>
  /** What it asserts or promises, the evidence it shows, and any pitch. Absent from notes saved before it existed. */
  claims?: string[]
  /** How it is made: format, editing, pacing, sound, tone. Absent from notes saved before it existed. */
  style?: string
  uncertainties: string[]
}

/** What the turn's first audio or video item came to, for the reply footer. */
export type WatchOutcome = (
  | { status: 'watched'; kind: MediaKind; coverage: 'whole'; durationSec: number }
  | { status: 'watched'; kind: MediaKind; coverage: 'part'; startSec: number; endSec: number; durationSec: number }
  | { status: 'watched'; kind: MediaKind; coverage: 'skim' }
  | { status: 'remembered' | 'failed'; kind: MediaKind }
) & {
  /** The item was a linked post's own media, so the footer can name it in one label with the post. */
  fromLink?: boolean
}

export interface MediaDigest {
  kind: MediaKind
  /** Human label for the source, e.g. "YouTube video", "uploaded video", "voice message". */
  label: string
  durationSec: number
  mode: 'whole' | 'skim' | 'focus' | 'opening' | 'halves'
  fps: number | null
  /** The moment a focused watch was centred on. */
  focusSec?: number
  /** The file had no sound track. */
  silent?: boolean
  /** Set when the watcher saw single frames rather than video: how many. */
  frames?: number
  /** What was heard, when less than everything: 'speech' is a transcript only, 'none' is nothing at all. */
  heard?: 'speech' | 'none'
  bins: MediaClip[]
  observations: MediaObservations
  /** True when validation dropped or truncated anything the model returned. */
  incomplete: boolean
}
