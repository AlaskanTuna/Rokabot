/**
 * One case that a co-located test cannot cover: the budget reads a route's limits from `config.llm.main`, so the
 * refusal is only real when the Anthropic route *is* the main one. Its own file, with the mock hoisted, because a
 * `doMock` after `budget.js` is already imported would leave that module holding the real config.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: mocks.warn }
}))

vi.mock('../../../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config.js')>()
  const { profileFor } = await import('../../llm/profiles.js')
  const profile = profileFor('anthropic', 'claude-haiku-5-5') ?? actual.config.llm.main.profile
  return {
    ...actual,
    config: {
      ...actual.config,
      llm: {
        ...actual.config.llm,
        // rpm 0: the minute is spent before the search starts, so the budget refuses it rather than the provider.
        main: {
          ...actual.config.llm.main,
          provider: 'anthropic' as const,
          model: 'claude-haiku-5-5',
          profile,
          limits: { rpm: 0 }
        }
      }
    }
  }
})

import { config } from '../../../config.js'
import { closeDb } from '../../../storage/database.js'
import { __resetBudgetsForTest } from '../../llm/budget.js'
import { anthropicNativeSearch } from '../search/nativeAnthropic.js'
import { SEARCH_TEXT } from '../search/types.js'

beforeEach(() => {
  closeDb()
  __resetBudgetsForTest()
  mocks.warn.mockReset()
})

describe('a budget refusal on the main route', () => {
  it('maps a budget refusal to the quota text and calls the provider not at all', async () => {
    const create = vi.fn()
    const client = { messages: { create } } as never

    const outcome = await anthropicNativeSearch(
      config.llm.main,
      { query: 'q', topic: 'general', maxResults: 5, signal: new AbortController().signal },
      client
    )

    expect(outcome).toMatchObject({ answer: SEARCH_TEXT.quota, succeeded: false })
    expect(create).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledOnce()
  })
})
