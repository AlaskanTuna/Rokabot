import { TypeSafeClient } from '@typesafe-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { jevConfig } = vi.hoisted(() => ({
  jevConfig: { apiKey: undefined as string | undefined, model: 'jev-1.13.0', timeoutMs: 1200 }
}))

vi.mock('../../../config.js', () => ({ config: { jev: jevConfig } }))

vi.mock('@typesafe-ai/sdk', () => ({
  TypeSafeClient: vi.fn(() => ({ systemOne: vi.fn() }))
}))

import { getJevClient, resetJevClientForTest } from '../client.js'

describe('Jev client', () => {
  beforeEach(() => {
    jevConfig.apiKey = undefined
    jevConfig.model = 'jev-1.13.0'
    jevConfig.timeoutMs = 1200
    vi.mocked(TypeSafeClient).mockClear()
    resetJevClientForTest()
  })

  it('returns null without an API key', () => {
    expect(getJevClient()).toBeNull()
    expect(TypeSafeClient).not.toHaveBeenCalled()
  })

  it('reuses one client instance', () => {
    jevConfig.apiKey = 'test-key'

    expect(getJevClient()).toBe(getJevClient())
    expect(TypeSafeClient).toHaveBeenCalledOnce()
  })

  it('uses the configured model and timeout with retries disabled', () => {
    jevConfig.apiKey = 'test-key'

    getJevClient()

    expect(TypeSafeClient).toHaveBeenCalledWith({
      apiKey: 'test-key',
      defaultModel: 'jev-1.13.0',
      timeout: 1200,
      retry: { maxRetries: 0 },
      logLevel: 'off'
    })
  })
})
