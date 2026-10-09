import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clientAvailable: true,
  generateContent: vi.fn(),
  systemOne: vi.fn(),
  warn: vi.fn()
}))

vi.mock('@google/genai', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent }
  }
}))
vi.mock('@typesafe-ai/sdk', () => ({ noul: vi.fn((instructions) => ({ instructions })) }))
vi.mock('../../jev/client.js', () => ({
  getJevClient: vi.fn(() => (mocks.clientAvailable ? { systemOne: mocks.systemOne } : null))
}))
vi.mock('../../../utils/logger.js', () => ({ logger: { warn: mocks.warn } }))
vi.mock('../../../config.js', () => ({
  config: {
    gemini: { apiKey: 'test-key', timeout: 15_000, extractionModel: 'gemini-extraction-test', safetyThreshold: 'OFF' },
    jev: { memoryTimeoutMs: 5_000 }
  }
}))

import { noul } from '@typesafe-ai/sdk'
import { jevConfirm, proposePredicates } from '../reclassifyModels.js'

const batch = [
  { id: 7, predicate: 'misc' as const, value: 'draws on weekends' },
  { id: 9, predicate: 'misc' as const, value: 'owns a red bike' }
]

beforeEach(() => {
  mocks.clientAvailable = true
  mocks.generateContent.mockReset()
  mocks.systemOne.mockReset()
  mocks.warn.mockReset()
  vi.mocked(noul).mockClear()
})

describe('proposePredicates', () => {
  it('asks one structured question listing every predicate with its category and keywords', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        moves: [
          { id: 7, predicate: 'hobby' },
          { id: 9, predicate: 'keep' }
        ]
      })
    })

    await expect(proposePredicates(batch)).resolves.toEqual([
      { id: 7, predicate: 'hobby' },
      { id: 9, predicate: 'keep' }
    ])

    expect(mocks.generateContent).toHaveBeenCalledOnce()
    const request = mocks.generateContent.mock.calls[0]?.[0]
    expect(request.model).toBe('gemini-extraction-test')
    expect(request.contents).toContain('hobby (interests): hobby, hobbies, pastime, pastimes, craft, crafts')
    expect(request.contents).toContain('draws on weekends')
    const ids = request.config.responseSchema.properties.moves.items.properties.predicate.enum
    expect(ids).toContain('hobby')
    expect(ids).toContain('keep')
    expect(request.config.responseSchema.properties.moves.items.properties.id.type).toBe('INTEGER')
  })

  it('drops proposals for unknown facts or predicates and repeated facts', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        moves: [
          { id: 7, predicate: 'hobby' },
          { id: 7, predicate: 'likes' },
          { id: 9, predicate: 'not_a_predicate' },
          { id: 99, predicate: 'hobby' }
        ]
      })
    })

    await expect(proposePredicates(batch)).resolves.toEqual([{ id: 7, predicate: 'hobby' }])
  })

  it.each([
    ['a failed call', () => mocks.generateContent.mockRejectedValueOnce(new Error('private fact text'))],
    ['an empty reply', () => mocks.generateContent.mockResolvedValueOnce({ text: '' })],
    ['malformed JSON', () => mocks.generateContent.mockResolvedValueOnce({ text: 'not json' })],
    ['the wrong shape', () => mocks.generateContent.mockResolvedValueOnce({ text: '{"moves":"hobby"}' })]
  ])('returns no proposals after %s without logging fact text', async (_name, arrange) => {
    arrange()
    await expect(proposePredicates(batch)).resolves.toEqual([])
    expect(mocks.warn).toHaveBeenCalledOnce()
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('private fact text')
  })

  it('makes no call for an empty batch', async () => {
    await expect(proposePredicates([])).resolves.toEqual([])
    expect(mocks.generateContent).not.toHaveBeenCalled()
  })
})

describe('jevConfirm', () => {
  const moves = [
    { id: 7, value: 'draws on weekends', predicate: 'hobby' as const },
    { id: 9, value: 'plays piano', predicate: 'general_occupation' as const }
  ]

  it('asks whether each value fits the proposed predicate and maps IDs to probabilities', async () => {
    mocks.systemOne.mockResolvedValueOnce({
      answers: { fits_7: { type: 'noul', noul: 0.91 }, fits_9: { type: 'noul', noul: 0.12 } },
      usage: { input_tokens: 10, output_tokens: 2 }
    })

    await expect(jevConfirm(moves)).resolves.toEqual({ 7: 0.91, 9: 0.12 })

    expect(noul).toHaveBeenCalledWith('Is "draws on weekends" this person\'s hobby?')
    expect(noul).toHaveBeenCalledWith('Is "plays piano" this person\'s general occupation?')
    expect(mocks.systemOne).toHaveBeenCalledWith(
      { state: expect.any(Object), questions: { fits_7: expect.any(Object), fits_9: expect.any(Object) } },
      { timeout: 5_000 }
    )
  })

  it('leaves out an answer that is missing or not a probability', async () => {
    mocks.systemOne.mockResolvedValueOnce({
      answers: { fits_7: { type: 'noul', noul: 0.91 }, fits_9: { type: 'noul', noul: 1.5 } },
      usage: { input_tokens: 10, output_tokens: 2 }
    })
    await expect(jevConfirm(moves)).resolves.toEqual({ 7: 0.91 })
  })

  it('returns nothing without a Jev client or moves, and after a failure, without logging fact text', async () => {
    mocks.clientAvailable = false
    await expect(jevConfirm(moves)).resolves.toEqual({})
    mocks.clientAvailable = true
    await expect(jevConfirm([])).resolves.toEqual({})
    expect(mocks.systemOne).not.toHaveBeenCalled()

    mocks.systemOne.mockRejectedValueOnce(new Error('draws on weekends'))
    await expect(jevConfirm(moves)).resolves.toEqual({})
    expect(mocks.warn).toHaveBeenCalledOnce()
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('draws')
  })
})
