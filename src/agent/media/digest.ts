import { type Schema, Type } from '@google/genai'
import { MEDIA_DIGEST_UNTRUSTED_DATA_LABEL } from '../promptSafety.js'
import type { MediaDigest, MediaObservations } from './types.js'

export const MEDIA_DIGEST_HEADING = '[Watched media'

export const MEDIA_OBSERVATIONS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    timeline: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { bin: { type: Type.INTEGER }, visual: { type: Type.STRING }, audio: { type: Type.STRING } },
        required: ['bin', 'visual', 'audio']
      }
    },
    speech: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          bin: { type: Type.INTEGER },
          speaker: { type: Type.STRING, nullable: true },
          quote: { type: Type.STRING }
        },
        required: ['bin', 'speaker', 'quote']
      }
    },
    onScreenText: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { bin: { type: Type.INTEGER }, text: { type: Type.STRING } },
        required: ['bin', 'text']
      }
    },
    uncertainties: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: ['summary', 'timeline', 'speech', 'onScreenText', 'uncertainties']
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(value: unknown, limit: number, markIncomplete: () => void): string | null {
  if (typeof value !== 'string') return null
  const bounded = value.trim().slice(0, limit)
  if (bounded !== value) markIncomplete()
  return bounded
}

function validBin(value: unknown, binCount: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= binCount
}

function renderSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
}

export function validateObservations(
  raw: unknown,
  binCount: number
): { observations: MediaObservations; incomplete: boolean } | null {
  if (!isRecord(raw) || typeof raw.summary !== 'string' || !raw.summary.trim()) return null

  let incomplete = false
  const markIncomplete = () => {
    incomplete = true
  }
  const summary = boundedString(raw.summary, 500, markIncomplete)
  if (summary === null) return null

  const timeline: MediaObservations['timeline'] = []
  if (!Array.isArray(raw.timeline)) {
    markIncomplete()
  } else {
    for (const value of raw.timeline) {
      if (!isRecord(value) || !validBin(value.bin, binCount)) {
        markIncomplete()
        continue
      }
      const visual = boundedString(value.visual, 300, markIncomplete)
      const audio = boundedString(value.audio, 300, markIncomplete)
      if (visual === null || audio === null) {
        markIncomplete()
        continue
      }
      if (timeline.length >= 8) {
        markIncomplete()
        continue
      }
      timeline.push({ bin: value.bin, visual, audio })
    }
  }

  const speech: MediaObservations['speech'] = []
  if (!Array.isArray(raw.speech)) {
    markIncomplete()
  } else {
    for (const value of raw.speech) {
      if (!isRecord(value) || !validBin(value.bin, binCount)) {
        markIncomplete()
        continue
      }
      const quote = boundedString(value.quote, 200, markIncomplete)
      if (quote === null) {
        markIncomplete()
        continue
      }
      let speaker: string | null = null
      if (value.speaker === null) {
        speaker = null
      } else if (typeof value.speaker === 'string') {
        speaker = boundedString(value.speaker, 300, markIncomplete)
      } else {
        markIncomplete()
      }
      if (speech.length >= 12) {
        markIncomplete()
        continue
      }
      speech.push({ bin: value.bin, speaker, quote })
    }
  }

  const onScreenText: MediaObservations['onScreenText'] = []
  if (!Array.isArray(raw.onScreenText)) {
    markIncomplete()
  } else {
    for (const value of raw.onScreenText) {
      if (!isRecord(value) || !validBin(value.bin, binCount)) {
        markIncomplete()
        continue
      }
      const text = boundedString(value.text, 300, markIncomplete)
      if (text === null) {
        markIncomplete()
        continue
      }
      if (onScreenText.length >= 8) {
        markIncomplete()
        continue
      }
      onScreenText.push({ bin: value.bin, text })
    }
  }

  const uncertainties: string[] = []
  if (!Array.isArray(raw.uncertainties)) {
    markIncomplete()
  } else {
    for (const value of raw.uncertainties) {
      const text = boundedString(value, 300, markIncomplete)
      if (text === null) {
        markIncomplete()
        continue
      }
      if (uncertainties.length >= 5) {
        markIncomplete()
        continue
      }
      uncertainties.push(text)
    }
  }

  return { observations: { summary, timeline, speech, onScreenText, uncertainties }, incomplete }
}

export function formatClock(seconds: number): string {
  const wholeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0
  const second = wholeSeconds % 60
  const totalMinutes = Math.floor(wholeSeconds / 60)
  const minute = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  const pad = (value: number) => String(value).padStart(2, '0')

  return hours > 0 ? `${hours}:${pad(minute)}:${pad(second)}` : `${totalMinutes}:${pad(second)}`
}

export function coverageLine(digest: MediaDigest): string {
  if (digest.mode === 'opening')
    return `only the opening was available, about ${formatClock(digest.durationSec)} of a longer file`
  if (digest.mode === 'focus') {
    const window = digest.bins[0]
    const watched = window ? `${formatClock(window.startSec)}–${formatClock(window.endSec)}` : 'around it'
    const sound = digest.silent ? ', no sound' : ''
    return `around ${formatClock(digest.focusSec ?? window?.startSec ?? 0)}: watched ${watched}${sound}`
  }
  if (digest.mode === 'skim') {
    const firstClip = digest.bins[0]
    const clipLength = firstClip ? Math.round(firstClip.endSec - firstClip.startSec) : 0
    const sound = digest.silent ? 'no sound' : 'sound only within the clips'
    return `skimmed: ${digest.bins.length} clips of ${clipLength} s spread across ${formatClock(digest.durationSec)}, ${sound}`
  }
  if (digest.kind === 'audio') return `whole audio, ${formatClock(digest.durationSec)}`
  const frameInterval =
    digest.fps === 1 ? 'a frame every second' : `a frame every ${digest.fps === null ? 'unknown' : 1 / digest.fps} s`
  return `whole video, ${formatClock(digest.durationSec)}, ${frameInterval}, ${digest.silent ? 'no sound' : 'full sound'}`
}

export function renderDigestBlock(digest: MediaDigest): string {
  const { observations } = digest
  const lines = [
    MEDIA_DIGEST_UNTRUSTED_DATA_LABEL,
    `${MEDIA_DIGEST_HEADING} — ${renderSingleLine(digest.label)}, ${coverageLine(digest)}]`,
    `Summary: ${renderSingleLine(observations.summary)}`
  ]
  const timeline = observations.timeline.flatMap(({ bin, visual, audio }) => {
    const clip = digest.bins[bin - 1]
    return clip
      ? [
          `- ${formatClock(clip.startSec)}–${formatClock(clip.endSec)}: ${renderSingleLine(visual)} / ${renderSingleLine(audio)}`
        ]
      : []
  })
  if (timeline.length > 0) lines.push('Timeline:', ...timeline)

  const quotes = observations.speech.flatMap(({ bin, speaker, quote }) => {
    const clip = digest.bins[bin - 1]
    return clip ? [`- ${formatClock(clip.startSec)}: ${speaker ?? 'someone'}: "${renderSingleLine(quote)}"`] : []
  })
  if (quotes.length > 0) lines.push('Quotes:', ...quotes)

  const onScreen = observations.onScreenText.flatMap(({ bin, text }) => {
    const clip = digest.bins[bin - 1]
    return clip ? [`- ${formatClock(clip.startSec)}: ${renderSingleLine(text)}`] : []
  })
  if (onScreen.length > 0) lines.push('On screen:', ...onScreen)
  if (observations.uncertainties.length > 0) {
    lines.push(`Unsure about: ${observations.uncertainties.map(renderSingleLine).join('; ')}`)
  }
  if (digest.incomplete) lines.push('(Some of the watch notes were unreadable and left out.)')

  return lines.join('\n')
}

export function renderCompactDigest(digest: MediaDigest): string {
  return `${MEDIA_DIGEST_HEADING} — ${renderSingleLine(digest.label)}, ${coverageLine(digest)}] ${renderSingleLine(digest.observations.summary)}`.slice(
    0,
    700
  )
}
