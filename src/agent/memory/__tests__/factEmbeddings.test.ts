import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  embedEpisodeText: vi.fn(),
  listActiveClaimsForEmbedding: vi.fn(),
  setClaimEmbedding: vi.fn(),
  logger: { warn: vi.fn() }
}))

vi.mock('../episodeEmbeddings.js', () => ({ embedEpisodeText: mocks.embedEpisodeText }))
vi.mock('../../../storage/memoryRecallStore.js', () => ({
  listActiveClaimsForEmbedding: mocks.listActiveClaimsForEmbedding,
  setClaimEmbedding: mocks.setClaimEmbedding
}))
vi.mock('../../../utils/logger.js', () => ({ logger: mocks.logger }))

import { embedPendingFacts } from '../factEmbeddings.js'

describe('embedPendingFacts', () => {
  beforeEach(() => {
    mocks.embedEpisodeText.mockReset()
    mocks.listActiveClaimsForEmbedding.mockReset()
    mocks.setClaimEmbedding.mockReset()
    mocks.logger.warn.mockClear()
  })

  it('embeds facts with no embedding or a stale sentence, and skips current ones', async () => {
    mocks.listActiveClaimsForEmbedding.mockReturnValue([
      {
        id: 1,
        subjectKind: 'user',
        predicate: 'hobby',
        value: 'chess',
        eventDate: null,
        embeddingText: null,
        hasEmbedding: false
      },
      {
        id: 2,
        subjectKind: 'user',
        predicate: 'hobby',
        value: 'go',
        eventDate: null,
        embeddingText: "This person's hobby: chess.",
        hasEmbedding: true
      },
      {
        id: 3,
        subjectKind: 'user',
        predicate: 'hobby',
        value: 'shogi',
        eventDate: null,
        embeddingText: "This person's hobby: shogi.",
        hasEmbedding: true
      }
    ])
    mocks.embedEpisodeText.mockResolvedValue(Array(768).fill(0.1))
    mocks.setClaimEmbedding.mockReturnValue(true)

    await expect(embedPendingFacts()).resolves.toEqual({ embedded: 2, failed: 0 })
    expect(mocks.embedEpisodeText).toHaveBeenCalledWith({
      text: "This person's hobby: chess.",
      role: 'RETRIEVAL_DOCUMENT'
    })
    expect(mocks.setClaimEmbedding.mock.calls.map(([call]) => call.id)).toEqual([1, 2])
  })

  it('respects the limit and counts failures without throwing', async () => {
    mocks.listActiveClaimsForEmbedding.mockReturnValue([
      {
        id: 1,
        subjectKind: 'user',
        predicate: 'hobby',
        value: 'chess',
        eventDate: null,
        embeddingText: null,
        hasEmbedding: false
      },
      {
        id: 2,
        subjectKind: 'user',
        predicate: 'pet',
        value: 'cat',
        eventDate: null,
        embeddingText: null,
        hasEmbedding: false
      }
    ])
    mocks.embedEpisodeText.mockRejectedValue(new Error('quota'))

    await expect(embedPendingFacts({ limit: 1 })).resolves.toEqual({ embedded: 0, failed: 1 })
    expect(mocks.embedEpisodeText).toHaveBeenCalledTimes(1)
    expect(mocks.setClaimEmbedding).not.toHaveBeenCalled()
  })

  it('resolves instead of rejecting when the facts cannot be listed', async () => {
    mocks.listActiveClaimsForEmbedding.mockImplementation(() => {
      throw new Error('database is locked')
    })
    await expect(embedPendingFacts()).resolves.toEqual({ embedded: 0, failed: 0 })
  })

  it('does not start a second sweep while one is running', async () => {
    mocks.listActiveClaimsForEmbedding.mockReturnValue([
      {
        id: 1,
        subjectKind: 'user',
        predicate: 'hobby',
        value: 'chess',
        eventDate: null,
        embeddingText: null,
        hasEmbedding: false
      }
    ])
    mocks.embedEpisodeText.mockResolvedValue(Array(768).fill(0.1))
    mocks.setClaimEmbedding.mockReturnValue(true)

    const [first, second] = await Promise.all([embedPendingFacts(), embedPendingFacts()])

    expect(first).toEqual({ embedded: 1, failed: 0 })
    expect(second).toBe(first)
    expect(mocks.embedEpisodeText).toHaveBeenCalledTimes(1)
  })
})
