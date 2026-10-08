import { describe, expect, it, vi } from 'vitest'
import { withReplyOutcomes } from '../../replyOutcomes.js'
import { MEMORY_TOOL_NAMES, readRepliesTool, rokaTools } from '../index.js'
import { readReplies } from '../readReplies.js'

const FOUND = {
  status: 'found' as const,
  platform: 'x' as const,
  total: 3,
  replies: [{ author: 'fan', text: 'agreed', likes: 9 }]
}

describe('readReplies', () => {
  it('refuses an unsupported link without reading anything', async () => {
    const reader = { read: vi.fn() }

    expect(await readReplies({ url: 'https://example.com/post/1' }, reader)).toEqual({
      replies: 'That is not a supported post link.'
    })
    expect(reader.read).not.toHaveBeenCalled()
  })

  // Review Focus 1: models wrap links in angle brackets, add trailing punctuation, or keep tracking params.
  it.each([
    '<https://x.com/roka/status/123>',
    'https://x.com/roka/status/123.',
    'https://x.com/roka/status/123)',
    'https://x.com/roka/status/123?s=20&t=abc'
  ])('resolves %s to the same post', async (url) => {
    const reader = { read: vi.fn(async () => FOUND) }

    await readReplies({ url }, reader)

    expect(reader.read).toHaveBeenCalledWith(expect.objectContaining({ platform: 'x', id: '123' }))
  })

  it('returns the formatted replies and records the outcome for the footer', async () => {
    const reader = { read: vi.fn(async () => FOUND) }

    const [result, outcome] = await withReplyOutcomes(() =>
      readReplies({ url: 'https://x.com/roka/status/123' }, reader)
    )

    expect(result.replies).toContain('1. @fan (9 likes): "agreed"')
    expect(outcome).toBe('found')
  })

  it('records a failed outcome', async () => {
    const reader = {
      read: vi.fn(async () => ({ status: 'failed' as const, platform: 'x' as const, reason: 'timeout' }))
    }

    const [, outcome] = await withReplyOutcomes(() => readReplies({ url: 'https://x.com/roka/status/123' }, reader))

    expect(outcome).toBe('failed')
  })
})

describe('read_replies registration', () => {
  it('is offered to every turn, including /ask, and steers away from search_web', () => {
    expect(rokaTools).toContain(readRepliesTool)
    expect(MEMORY_TOOL_NAMES).not.toContain('read_replies')
    expect(readRepliesTool.description).toContain('instead of search_web')
    expect(readRepliesTool.description).toContain('Never call it just because a post was linked')
  })
})
