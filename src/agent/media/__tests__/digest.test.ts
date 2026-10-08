import { Type } from '@google/genai'
import { describe, expect, it } from 'vitest'
import { MEDIA_DIGEST_UNTRUSTED_DATA_LABEL } from '../../promptSafety.js'
import {
  MEDIA_DIGEST_HEADING,
  MEDIA_OBSERVATIONS_SCHEMA,
  coverageLine,
  formatClock,
  mergeHalves,
  renderCompactDigest,
  renderDigestBlock,
  validateObservations,
  watchOutcomeFor
} from '../digest.js'
import type { MediaClip, MediaDigest, MediaObservations } from '../types.js'

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
      'moments',
      'style',
      'uncertainties'
    ])
    expect(MEDIA_OBSERVATIONS_SCHEMA.properties?.timeline.items?.properties?.bin?.type).toBe(Type.INTEGER)
  })

  it('caps each list at what validation keeps, so the answer ends before the output ceiling', () => {
    const { properties } = MEDIA_OBSERVATIONS_SCHEMA
    expect(properties?.timeline.maxItems).toBe('8')
    expect(properties?.speech.maxItems).toBe('12')
    expect(properties?.onScreenText.maxItems).toBe('8')
    expect(properties?.uncertainties.maxItems).toBe('5')
    expect(properties?.moments.maxItems).toBe('5')
  })
})

// Roka can only talk about what the notes give her; three generic timeline lines read as a guess from the title.
describe('standout moments and style', () => {
  it('keeps the moments with valid bins, up to five, and the style line', () => {
    const result = validateObservations(
      {
        ...rawObservations(),
        moments: [
          { bin: 1, note: 'She pulls a rabbit out of a playing card; the crowd cheers.' },
          { bin: 9, note: 'A bin that does not exist.' },
          ...Array.from({ length: 6 }, (_, index) => ({ bin: 2, note: `Moment ${index}` }))
        ],
        style: 'A fan-made model swap: fast cuts timed to an electronic track.'
      },
      2
    )

    expect(result?.observations.moments).toHaveLength(5)
    expect(result?.observations.moments?.[0]).toEqual({
      bin: 1,
      note: 'She pulls a rabbit out of a playing card; the crowd cheers.'
    })
    expect(result?.observations.style).toBe('A fan-made model swap: fast cuts timed to an electronic track.')
    expect(result?.incomplete).toBe(true)
  })

  it('accepts notes saved before moments existed', () => {
    expect(validateObservations(rawObservations(), 2)).toMatchObject({ incomplete: false })
  })

  it('renders the moments with their times and the style line', () => {
    const rendered = renderDigestBlock(
      digest({
        observations: {
          ...rawObservations(),
          moments: [{ bin: 2, note: 'The train doors close on his bag.' }],
          style: 'Handheld phone footage with no music.'
        }
      })
    )

    expect(rendered).toContain('Standout moments:\n- 0:40–1:15: The train doors close on his bag.')
    expect(rendered).toContain("How it's made: Handheld phone footage with no music.")
  })
})

describe('validateObservations', () => {
  it('does not count trimmed whitespace as cut text', () => {
    const raw = { ...rawObservations(), summary: '  A person walks through a station.\n' }

    expect(validateObservations(raw, 3)).toEqual({ observations: rawObservations(), incomplete: false })
  })

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

// The footer reports what she actually watched, so a reader can tell a watch from a guess (and a part from the whole).
describe('watchOutcomeFor', () => {
  it('reports a whole watch with its length', () => {
    expect(watchOutcomeFor(digest())).toEqual({ status: 'watched', kind: 'video', coverage: 'whole', durationSec: 75 })
  })

  it('reports two halves that cover the video as whole, and one surviving half as a part', () => {
    const halves = digest({
      mode: 'halves',
      durationSec: 1305,
      bins: [
        { startSec: 0, endSec: 653 },
        { startSec: 653, endSec: 1305 }
      ]
    })

    expect(watchOutcomeFor(halves)).toEqual({ status: 'watched', kind: 'video', coverage: 'whole', durationSec: 1305 })
    expect(watchOutcomeFor({ ...halves, bins: [{ startSec: 653, endSec: 1305 }] })).toEqual({
      status: 'watched',
      kind: 'video',
      coverage: 'part',
      startSec: 653,
      endSec: 1305
    })
  })

  it('reports a focused watch and an opening as the span watched, and a skim as a skim', () => {
    expect(
      watchOutcomeFor(digest({ mode: 'focus', focusSec: 300, bins: [{ startSec: 240, endSec: 360 }] }))
    ).toMatchObject({
      coverage: 'part',
      startSec: 240,
      endSec: 360
    })
    expect(
      watchOutcomeFor(digest({ mode: 'opening', durationSec: 60, bins: [{ startSec: 0, endSec: 60 }] }))
    ).toMatchObject({
      coverage: 'part',
      startSec: 0,
      endSec: 60
    })
    expect(watchOutcomeFor(digest({ mode: 'skim', durationSec: 2400 }))).toEqual({
      status: 'watched',
      kind: 'video',
      coverage: 'skim'
    })
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

describe('focus and silent coverage lines', () => {
  it('says where a focused watch looked', () => {
    expect(
      coverageLine(
        digest({ mode: 'focus', fps: null, durationSec: 1200, focusSec: 754, bins: [{ startSec: 724, endSec: 844 }] })
      )
    ).toBe('around 12:34: watched 12:04–14:04')
  })

  it('says a silent video had no sound', () => {
    expect(coverageLine(digest({ mode: 'whole', fps: 1, durationSec: 12, silent: true }))).toBe(
      'whole video, 0:12, a frame every second, no sound'
    )
  })
})

function halfOf(bins: MediaClip[], overrides: Partial<MediaDigest> = {}): MediaDigest {
  return digest({ durationSec: 2100, mode: 'whole', fps: 0.05, bins, ...overrides })
}

const FIRST_BINS: MediaClip[] = [
  { startSec: 0, endSec: 525 },
  { startSec: 525, endSec: 1050 }
]
const SECOND_BINS: MediaClip[] = [
  { startSec: 1050, endSec: 1575 },
  { startSec: 1575, endSec: 2100 }
]

describe('mergeHalves', () => {
  const first = halfOf(FIRST_BINS, {
    observations: {
      summary: 'Dimitri walks in.',
      timeline: [{ bin: 1, visual: 'A hall', audio: 'Music' }],
      speech: [{ bin: 2, speaker: 'Roka', quote: 'Hello' }],
      onScreenText: [{ bin: 1, text: 'Title' }],
      uncertainties: ['The sign is blurred.']
    }
  })
  const second = halfOf(SECOND_BINS, {
    observations: {
      summary: 'He leaves.',
      timeline: [
        { bin: 1, visual: 'Empty hall', audio: 'Silence' },
        { bin: 2, visual: 'Door closes', audio: 'A click' }
      ],
      speech: [{ bin: 1, speaker: null, quote: 'Bye' }],
      onScreenText: [{ bin: 2, text: 'The end' }],
      uncertainties: ['The sign is blurred.', 'Captions are unclear.']
    }
  })

  it('joins two watched halves into one digest with the second half renumbered after the first', () => {
    expect(mergeHalves(first, second, 2100)).toEqual({
      kind: 'video',
      label: 'uploaded video',
      durationSec: 2100,
      mode: 'halves',
      fps: 0.05,
      bins: [...FIRST_BINS, ...SECOND_BINS],
      observations: {
        summary: 'Dimitri walks in. He leaves.',
        timeline: [
          { bin: 1, visual: 'A hall', audio: 'Music' },
          { bin: 3, visual: 'Empty hall', audio: 'Silence' },
          { bin: 4, visual: 'Door closes', audio: 'A click' }
        ],
        speech: [
          { bin: 2, speaker: 'Roka', quote: 'Hello' },
          { bin: 3, speaker: null, quote: 'Bye' }
        ],
        onScreenText: [
          { bin: 1, text: 'Title' },
          { bin: 4, text: 'The end' }
        ],
        uncertainties: ['The sign is blurred.', 'Captions are unclear.']
      },
      incomplete: false
    })
  })

  it("keeps both halves' standout moments, renumbered, and both style lines", () => {
    const merged = mergeHalves(
      {
        ...first,
        observations: { ...first.observations, moments: [{ bin: 2, note: 'He trips.' }], style: 'Slow pans.' }
      },
      {
        ...second,
        observations: { ...second.observations, moments: [{ bin: 1, note: 'The door slams.' }], style: 'Quick cuts.' }
      },
      2100
    )

    expect(merged?.observations.moments).toEqual([
      { bin: 2, note: 'He trips.' },
      { bin: 3, note: 'The door slams.' }
    ])
    expect(merged?.observations.style).toBe('Slow pans. Quick cuts.')
  })

  it('keeps both halves in the joined summary within 500 characters', () => {
    const long = (word: string) =>
      halfOf(FIRST_BINS, { observations: { ...first.observations, summary: `${word} `.repeat(83).trim() } })

    const merged = mergeHalves(long('alpha'), long('omega'), 2100)
    const summary = merged?.observations.summary ?? ''

    expect(summary.length).toBeLessThanOrEqual(500)
    expect(summary).toContain('alpha')
    expect(summary).toContain('omega')
    expect(summary).not.toMatch(/\b(alph|omeg)\b/)
  })

  it('caps the merged uncertainties at five', () => {
    const many = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix} ${i}`)
    const a = halfOf(FIRST_BINS, { observations: { ...first.observations, uncertainties: many('a', 4) } })
    const b = halfOf(SECOND_BINS, { observations: { ...second.observations, uncertainties: many('b', 4) } })

    expect(mergeHalves(a, b, 2100)?.observations.uncertainties).toEqual(['a 0', 'a 1', 'a 2', 'a 3', 'b 0'])
  })

  it('marks the merge incomplete and silent when either half was', () => {
    const merged = mergeHalves(first, halfOf(SECOND_BINS, { incomplete: true, silent: true }), 2100)

    expect(merged).toMatchObject({ incomplete: true, silent: true })
  })

  it('keeps only the watched half when the other failed, and says so', () => {
    expect(mergeHalves(first, null, 2100)).toEqual({
      kind: 'video',
      label: 'uploaded video',
      durationSec: 2100,
      mode: 'halves',
      fps: 0.05,
      bins: FIRST_BINS,
      observations: {
        ...first.observations,
        uncertainties: ['The sign is blurred.', 'The other half of the video could not be watched.']
      },
      incomplete: true
    })
  })

  it('keeps the second half at its own bin numbers when only it was watched', () => {
    const merged = mergeHalves(null, second, 2100)

    expect(merged?.bins).toEqual(SECOND_BINS)
    expect(merged?.observations.timeline).toEqual(second.observations.timeline)
    expect(merged?.observations.speech).toEqual(second.observations.speech)
    expect(merged?.incomplete).toBe(true)
    expect(merged?.observations.uncertainties.at(-1)).toBe('The other half of the video could not be watched.')
  })

  it('returns null when neither half was watched', () => {
    expect(mergeHalves(null, null, 2100)).toBeNull()
  })
})

describe('coverage of two halves', () => {
  const halves = (bins: MediaClip[], overrides: Partial<MediaDigest> = {}) =>
    halfOf(bins, { mode: 'halves', ...overrides })

  it('says a video watched in two halves covered the whole video with its frame interval', () => {
    expect(coverageLine(halves([...FIRST_BINS, ...SECOND_BINS]))).toBe(
      'whole video in two halves, 35:00, a frame every 20 s, full sound'
    )
  })

  it('says a silent video watched in two halves had no sound', () => {
    expect(coverageLine(halves([...FIRST_BINS, ...SECOND_BINS], { silent: true }))).toBe(
      'whole video in two halves, 35:00, a frame every 20 s, no sound'
    )
  })

  it('names the span actually watched when one half is missing', () => {
    expect(coverageLine(halves(SECOND_BINS))).toBe(
      'only 17:30–35:00 of 35:00 was watched, a frame every 20 s, full sound'
    )
    expect(coverageLine(halves(FIRST_BINS))).toBe(
      'only 0:00–17:30 of 35:00 was watched, a frame every 20 s, full sound'
    )
  })
})
