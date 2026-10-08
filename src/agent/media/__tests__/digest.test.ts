import { Type } from '@google/genai'
import { describe, expect, it } from 'vitest'
import { MEDIA_DIGEST_UNTRUSTED_DATA_LABEL } from '../../promptSafety.js'
import {
  MEDIA_DIGEST_HEADING,
  MEDIA_OBSERVATIONS_SCHEMA,
  coverageLine,
  formatClock,
  renderCompactDigest,
  renderDigestBlock,
  validateObservations
} from '../digest.js'
import type { MediaDigest, MediaObservations } from '../types.js'

function rawObservations(): MediaObservations {
  return {
    summary: 'A person walks through a station.',
    timeline: [{ bin: 1, visual: 'A person enters.', audio: 'Announcements play.' }],
    speech: [{ bin: 1, speaker: null, quote: 'The train is here.' }],
    onScreenText: [{ bin: 1, text: 'Platform 4' }],
    uncertainties: ['The announcement is muffled.']
  }
}

function digest(overrides: Partial<MediaDigest> = {}): MediaDigest {
  return {
    kind: 'video',
    label: 'uploaded video',
    durationSec: 75,
    mode: 'whole',
    fps: 1,
    bins: [
      { startSec: 0, endSec: 40 },
      { startSec: 40, endSec: 75 }
    ],
    observations: rawObservations(),
    incomplete: false,
    ...overrides
  }
}

describe('MEDIA_OBSERVATIONS_SCHEMA', () => {
  it('declares the observation fields and integer bin numbers', () => {
    expect(MEDIA_OBSERVATIONS_SCHEMA.type).toBe(Type.OBJECT)
    expect(MEDIA_OBSERVATIONS_SCHEMA.required).toEqual([
      'summary',
      'timeline',
      'speech',
      'onScreenText',
      'uncertainties'
    ])
    expect(MEDIA_OBSERVATIONS_SCHEMA.properties?.timeline.items?.properties?.bin?.type).toBe(Type.INTEGER)
  })
})

describe('validateObservations', () => {
  it('keeps all valid observation fields without marking them incomplete', () => {
    expect(validateObservations(rawObservations(), 3)).toEqual({ observations: rawObservations(), incomplete: false })
  })

  it('returns null for non-objects or a missing, blank or non-string summary', () => {
    for (const raw of [null, [], 'summary', {}, { summary: '  ' }, { summary: 4 }]) {
      expect(validateObservations(raw, 3)).toBeNull()
    }
  })

  it('trims summary to 500 characters and marks the result incomplete', () => {
    const summary = `  ${'s'.repeat(510)}  `
    const result = validateObservations({ ...rawObservations(), summary }, 3)

    expect(result?.observations.summary).toBe('s'.repeat(500))
    expect(result?.incomplete).toBe(true)
  })

  it('drops entries outside the available bin range', () => {
    const result = validateObservations(
      { ...rawObservations(), timeline: [...rawObservations().timeline, { bin: 9, visual: 'extra', audio: 'extra' }] },
      3
    )

    expect(result?.observations.timeline).toHaveLength(1)
    expect(result?.incomplete).toBe(true)
  })

  it('drops entries with non-integer bins and entries with non-string required fields', () => {
    const result = validateObservations(
      {
        ...rawObservations(),
        timeline: [
          { bin: 1.5, visual: 'invalid bin', audio: 'sound' },
          { bin: 2, visual: 4, audio: 'sound' },
          { bin: 3, visual: 'valid', audio: 'sound' }
        ],
        speech: [
          { bin: 1, speaker: 4, quote: 'valid quote' },
          { bin: 2, speaker: null, quote: 5 }
        ],
        onScreenText: [{ bin: 1, text: false }],
        uncertainties: ['clear', 10]
      },
      3
    )

    expect(result?.observations.timeline).toEqual([{ bin: 3, visual: 'valid', audio: 'sound' }])
    expect(result?.observations.speech).toEqual([{ bin: 1, speaker: null, quote: 'valid quote' }])
    expect(result?.observations.onScreenText).toEqual([])
    expect(result?.observations.uncertainties).toEqual(['clear'])
    expect(result?.incomplete).toBe(true)
  })

  it('trims string fields to their limits and applies the array limits', () => {
    const result = validateObservations(
      {
        summary: 'summary',
        timeline: Array.from({ length: 9 }, (_, bin) => ({
          bin: (bin % 3) + 1,
          visual: 'v'.repeat(350),
          audio: 'a'.repeat(350)
        })),
        speech: Array.from({ length: 13 }, (_, bin) => ({
          bin: (bin % 3) + 1,
          speaker: 's'.repeat(350),
          quote: 'q'.repeat(250)
        })),
        onScreenText: Array.from({ length: 9 }, (_, bin) => ({ bin: (bin % 3) + 1, text: 't'.repeat(350) })),
        uncertainties: Array.from({ length: 6 }, () => 'u'.repeat(350))
      },
      3
    )

    expect(result?.observations.timeline).toHaveLength(8)
    expect(result?.observations.timeline[0]).toEqual({ bin: 1, visual: 'v'.repeat(300), audio: 'a'.repeat(300) })
    expect(result?.observations.speech).toHaveLength(12)
    expect(result?.observations.speech[0]).toEqual({ bin: 1, speaker: 's'.repeat(300), quote: 'q'.repeat(200) })
    expect(result?.observations.onScreenText).toHaveLength(8)
    expect(result?.observations.onScreenText[0].text).toBe('t'.repeat(300))
    expect(result?.observations.uncertainties).toHaveLength(5)
    expect(result?.observations.uncertainties[0]).toBe('u'.repeat(300))
    expect(result?.incomplete).toBe(true)
  })

  it('marks missing observation arrays incomplete and normalizes them to empty arrays', () => {
    const result = validateObservations({ summary: 'summary' }, 3)

    expect(result).toEqual({
      observations: { summary: 'summary', timeline: [], speech: [], onScreenText: [], uncertainties: [] },
      incomplete: true
    })
  })
})

describe('formatClock', () => {
  it('uses minute and hour clock formats', () => {
    expect(formatClock(75)).toBe('1:15')
    expect(formatClock(3725)).toBe('1:02:05')
  })
})

describe('coverageLine', () => {
  it('describes whole video coverage with its frame interval and full sound', () => {
    expect(coverageLine(digest())).toBe('whole video, 1:15, a frame every second, full sound')
    expect(coverageLine(digest({ fps: 0.25 }))).toBe('whole video, 1:15, a frame every 4 s, full sound')
  })

  it('describes whole audio coverage', () => {
    expect(coverageLine(digest({ kind: 'audio', mode: 'whole', fps: null }))).toBe('whole audio, 1:15')
  })

  it('describes the number, length and spread of skimmed clips', () => {
    expect(
      coverageLine(
        digest({
          mode: 'skim',
          fps: null,
          durationSec: 2700,
          bins: [
            { startSec: 0, endSec: 10 },
            { startSec: 1345, endSec: 1355 },
            { startSec: 2690, endSec: 2700 }
          ]
        })
      )
    ).toBe('skimmed: 3 clips of 10 s spread across 45:00, sound only within the clips')
  })

  it('describes opening-only coverage', () => {
    expect(coverageLine(digest({ mode: 'opening', durationSec: 20 }))).toBe(
      'only the opening was available, about 0:20 of a longer file'
    )
  })
})

describe('renderDigestBlock', () => {
  it('renders the untrusted label, coverage, observations and uncertainty marker', () => {
    const rendered = renderDigestBlock(
      digest({
        label: 'YouTube video',
        observations: {
          summary: 'A person walks through a station.',
          timeline: [{ bin: 1, visual: 'A person enters.', audio: 'Announcements play.' }],
          speech: [{ bin: 1, speaker: null, quote: 'The train is here.' }],
          onScreenText: [{ bin: 2, text: 'Platform 4' }],
          uncertainties: ['The announcement is muffled.', 'The speaker is unclear.']
        },
        incomplete: true
      })
    )

    expect(rendered).toBe(
      [
        MEDIA_DIGEST_UNTRUSTED_DATA_LABEL,
        `${MEDIA_DIGEST_HEADING} — YouTube video, whole video, 1:15, a frame every second, full sound]`,
        'Summary: A person walks through a station.',
        'Timeline:',
        '- 0:00–0:40: A person enters. / Announcements play.',
        'Quotes:',
        '- 0:00: someone: "The train is here."',
        'On screen:',
        '- 0:40: Platform 4',
        'Unsure about: The announcement is muffled.; The speaker is unclear.',
        '(Some of the watch notes were unreadable and left out.)'
      ].join('\n')
    )
  })

  it('omits empty observation sections', () => {
    const rendered = renderDigestBlock(
      digest({
        observations: { summary: 'A quiet room.', timeline: [], speech: [], onScreenText: [], uncertainties: [] }
      })
    )

    expect(rendered).not.toContain('Timeline:')
    expect(rendered).not.toContain('Quotes:')
    expect(rendered).not.toContain('On screen:')
    expect(rendered).not.toContain('Unsure about:')
  })
})

describe('renderCompactDigest', () => {
  it('renders a single line no longer than 700 characters', () => {
    const rendered = renderCompactDigest(digest({ observations: { ...rawObservations(), summary: 'A'.repeat(1000) } }))

    expect(rendered).toContain(
      `${MEDIA_DIGEST_HEADING} — uploaded video, whole video, 1:15, a frame every second, full sound]`
    )
    expect(rendered).toHaveLength(700)
    expect(rendered).not.toMatch(/[\r\n]/)
  })
})
