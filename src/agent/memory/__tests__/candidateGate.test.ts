import { describe, expect, it } from 'vitest'
import type { BufferedMessage } from '../../passiveBuffer.js'
import { shouldExtract } from '../candidateGate.js'

function message(content: string): BufferedMessage {
  return {
    displayName: 'Alice',
    username: 'alice',
    userId: 'user-1',
    content,
    timestamp: 0
  }
}

describe('shouldExtract', () => {
  it('skips batches containing only greetings, emoji, reactions, and links', () => {
    const result = shouldExtract(
      [message('hello!'), message('😂'), message('https://example.com'), message('+1')],
      new Set()
    )

    expect(result).toEqual({ extract: false, reason: 'trivial batch' })
  })

  it('selects a novel predicate keyword as an extraction candidate', () => {
    const result = shouldExtract([message('I love playing anime games with my cat')], new Set())

    expect(result.extract).toBe(true)
    expect(result.reason).toMatch(/^novel keyword: (pets|favorite_anime|favorite_game|likes)$/)
  })

  it('skips a keyword signal already represented by a known claim and selects a new one', () => {
    expect(shouldExtract([message('I love this anime')], new Set(['likes', 'favorite_anime']))).toEqual({
      extract: false,
      reason: 'known claim keywords only'
    })

    expect(
      shouldExtract([message('I love this anime and I have a dog')], new Set(['likes', 'favorite_anime']))
    ).toEqual({ extract: true, reason: 'novel keyword: pets' })
  })

  it('skips sensitive disclosures before they can reach extraction', () => {
    const result = shouldExtract(
      [message('My full name is Alice Example and my email is alice@example.com')],
      new Set()
    )

    expect(result).toEqual({ extract: false, reason: 'sensitive content' })
  })

  it('is deterministic and does not mutate its inputs', () => {
    const batch = [message('I prefer vegan food')]
    const knownClaimKeys = new Set<string>()

    const first = shouldExtract(batch, knownClaimKeys)
    const second = shouldExtract(batch, knownClaimKeys)

    expect(second).toEqual(first)
    expect(batch).toEqual([message('I prefer vegan food')])
    expect(knownClaimKeys).toEqual(new Set())
  })
})
