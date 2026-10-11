import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clientAvailable: true,
  generateObject: vi.fn(),
  systemOne: vi.fn(),
  warn: vi.fn(),
  judgeWithModel: vi.fn(),
  config: {
    gemini: { apiKey: 'test-key', timeout: 15_000, extractionModel: 'gemini-extraction-test', safetyThreshold: 'OFF' },
    jev: { memoryTimeoutMs: 5_000 },
    memory: { judge: 'none' as string }
  }
}))

vi.mock('../../llm/generateObject.js', () => ({ generateObject: mocks.generateObject }))
vi.mock('@typesafe-ai/sdk', () => ({ noul: vi.fn((instructions) => ({ instructions })) }))
vi.mock('../../jev/client.js', () => ({
  getJevClient: vi.fn(() => (mocks.clientAvailable ? { systemOne: mocks.systemOne } : null))
}))
vi.mock('../../../utils/logger.js', () => ({ logger: { warn: mocks.warn } }))
vi.mock('../../../config.js', () => ({ config: mocks.config }))
vi.mock('../../jev/modelJudge.js', () => ({ judgeWithModel: mocks.judgeWithModel }))

import { noul } from '@typesafe-ai/sdk'
import { z } from 'zod'
import { PREDICATES, type PredicateId, isMoveTarget } from '../predicates.js'
import { jevConfirm, proposePredicates } from '../reclassifyModels.js'

const batch = [
  { id: 7, predicate: 'misc' as const, value: 'draws on weekends' },
  { id: 9, predicate: 'misc' as const, value: 'owns a red bike' }
]

beforeEach(() => {
  mocks.clientAvailable = true
  mocks.config.memory.judge = 'none'
  mocks.judgeWithModel.mockReset()
  mocks.generateObject.mockReset()
  mocks.systemOne.mockReset()
  mocks.warn.mockReset()
  vi.mocked(noul).mockClear()
})

function proposal(moves: Array<{ id: number; predicate: string }>) {
  return {
    value: { moves },
    provider: 'gemini',
    model: 'gemini-extraction-test',
    usage: {
      provider: 'gemini',
      model: 'gemini-extraction-test',
      workload: 'reclassify',
      inputTokens: 40,
      outputTokens: 12
    }
  }
}

describe('proposePredicates', () => {
  it('asks one structured question listing every predicate with its category and keywords', async () => {
    mocks.generateObject.mockResolvedValueOnce(
      proposal([
        { id: 7, predicate: 'hobby' },
        { id: 9, predicate: 'keep' }
      ])
    )

    await expect(proposePredicates(batch)).resolves.toEqual([
      { id: 7, predicate: 'hobby' },
      { id: 9, predicate: 'keep' }
    ])

    expect(mocks.generateObject).toHaveBeenCalledOnce()
    const request = mocks.generateObject.mock.calls[0]?.[0]
    expect(request).toMatchObject({ workload: 'reclassify', maxOutputTokens: 100 + batch.length * 40 })
    expect(request.prompt).toContain('hobby (interests): hobby, hobbies, pastime, pastimes, craft, crafts')
    expect(request.prompt).toContain('draws on weekends')
    expect(request.legacyResponseSchema).toEqual({
      type: 'OBJECT',
      properties: {
        moves: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              id: { type: 'INTEGER' },
              predicate: {
                type: 'STRING',
                enum: [...(Object.keys(PREDICATES) as PredicateId[]).filter(isMoveTarget), 'keep']
              }
            },
            required: ['id', 'predicate']
          }
        }
      },
      required: ['moves']
    })
  })

  it('offers exactly the registry move targets plus keep', async () => {
    mocks.generateObject.mockResolvedValueOnce(proposal([]))
    await proposePredicates(batch)

    const schema = mocks.generateObject.mock.calls[0]?.[0].schema
    const item = (
      z.toJSONSchema(schema) as unknown as {
        properties: { moves: { items: { properties: { id: { type: string }; predicate: { enum: string[] } } } } }
      }
    ).properties.moves.items.properties
    expect(item.predicate.enum).toEqual([...(Object.keys(PREDICATES) as PredicateId[]).filter(isMoveTarget), 'keep'])
    expect(item.id.type).toBe('integer')
    expect(schema.safeParse({ moves: [{ id: 7, predicate: 'not_a_predicate' }] }).success).toBe(false)
  })

  it('drops proposals for facts outside the batch and repeated facts', async () => {
    mocks.generateObject.mockResolvedValueOnce(
      proposal([
        { id: 7, predicate: 'hobby' },
        { id: 7, predicate: 'likes' },
        { id: 99, predicate: 'hobby' }
      ])
    )

    await expect(proposePredicates(batch)).resolves.toEqual([{ id: 7, predicate: 'hobby' }])
  })

  it('returns no proposals after a failed call without logging fact text', async () => {
    mocks.generateObject.mockRejectedValueOnce(new Error('private fact text'))

    await expect(proposePredicates(batch)).resolves.toEqual([])
    expect(mocks.warn).toHaveBeenCalledOnce()
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('private fact text')
  })

  it('makes no call for an empty batch', async () => {
    await expect(proposePredicates([])).resolves.toEqual([])
    expect(mocks.generateObject).not.toHaveBeenCalled()
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

  it('confirms moves with the main model when there is no Jev key', async () => {
    mocks.clientAvailable = false
    mocks.config.memory.judge = 'model'
    mocks.judgeWithModel.mockResolvedValueOnce({
      answers: { fits_7: 0.91, fits_9: 0.12 },
      latencyMs: 10,
      inputTokens: 60,
      judge: 'anthropic:claude-haiku-5-5'
    })

    await expect(jevConfirm(moves)).resolves.toEqual({ 7: 0.91, 9: 0.12 })
    expect(mocks.judgeWithModel).toHaveBeenCalledWith({
      workload: 'verification',
      state: { facts: moves.map(({ id, predicate, value }) => ({ id, predicate, value })) },
      questions: {
        fits_7: 'Is "draws on weekends" this person\'s hobby?',
        fits_9: 'Is "plays piano" this person\'s general occupation?'
      }
    })
  })
})
