import { describe, expect, it } from 'vitest'

import { type TokenLimits, ceilingsFor, formatReport, mimeForPath, resolveKey } from '../measure.js'

const limits: TokenLimits = { maxAttachmentTokens: 50_000, maxTokensPerMinute: 125_000 }

describe('mimeForPath', () => {
  it.each([
    ['clip.MP4', 'video/mp4'],
    ['doc.pdf', 'application/pdf'],
    ['tune.mp3', 'audio/mpeg']
  ])('reads %s as %s, case-insensitively', (path, expected) => {
    expect(mimeForPath(path)).toBe(expected)
  })

  // Refused rather than guessed. A wrong MIME silently mis-prices the file, and the whole point of the tool
  // is that its numbers can be trusted without re-deriving them.
  it('returns nothing for an extension it does not know', () => {
    expect(mimeForPath('archive.tar.gz')).toBeUndefined()
  })
})

describe('ceilingsFor', () => {
  it('refuses a file over the size limit for its own type, before any token cost matters', () => {
    const ceilings = ceilingsFor(11 * 1024 * 1024, 'video/mp4', 100, limits)

    expect(ceilings[0]).toMatchObject({ name: 'size for this type', ok: false })
  })

  // The finding the tool exists to make visible: a small file can be enormously expensive. 17 KB of PDF
  // measured 28,001 tokens (#136), and size is what people reach for when guessing.
  it('passes a tiny file on size and still refuses it on tokens', () => {
    const ceilings = ceilingsFor(17_000, 'application/pdf', 60_000, limits)

    expect(ceilings[0].ok).toBe(true)
    expect(ceilings[1]).toMatchObject({ name: 'per-turn token cost', ok: false })
  })

  it('reports the share of the minute a turn would reserve', () => {
    const ceilings = ceilingsFor(1_000, 'application/pdf', 25_000, limits)

    expect(ceilings[2]).toMatchObject({ name: 'share of the minute', used: 25_000, limit: 125_000, ok: true })
  })
})

describe('formatReport', () => {
  it('marks a refusing ceiling distinctly from a passing one', () => {
    const report = formatReport(
      '/tmp/big.pdf',
      17_000,
      'application/pdf',
      60_000,
      ceilingsFor(17_000, 'application/pdf', 60_000, limits)
    )

    expect(report).toContain('REFUSE per-turn token cost: 60000 / 50000')
    expect(report).toContain('OK')
  })
})

describe('resolveKey', () => {
  // The boundary, enforced rather than documented. A free call on production's key is still a call on
  // production's key, and "which key is idle" is the wrong question.
  // Asserted on the wording unique to the NAME check, not on the word "production" both messages share.
  // Measured: with a looser matcher, deleting this branch left all twelve tests green, because the by-value
  // check below catches the same fixture and says "production" too. Two guards, one input, one assertion —
  // the assertion has to name which guard it is for.
  it('refuses to run on the production key by name, and says which names to use instead', () => {
    expect(() => resolveKey({ GEMINI_API_KEY: 'prod' }, 'GEMINI_API_KEY')).toThrow(/Name GRAPHIFY_ or DEV_ instead/)
  })

  // The same refusal by value, because a .env where two names hold one key would slip past the name check.
  it('refuses a named key that resolves to production anyway', () => {
    expect(() => resolveKey({ GEMINI_API_KEY: 'same', DEV_GEMINI_API_KEY: 'same' }, 'DEV_GEMINI_API_KEY')).toThrow(
      /production/
    )
  })

  it('defaults to the graphify key rather than requiring the operator to remember', () => {
    expect(resolveKey({ GEMINI_API_KEY: 'prod', GRAPHIFY_GEMINI_API_KEY: 'graphify' }, undefined)).toBe('graphify')
  })

  it('says which name was missing rather than failing anonymously', () => {
    expect(() => resolveKey({}, 'DEV_GEMINI_API_KEY')).toThrow(/DEV_GEMINI_API_KEY/)
  })
})
