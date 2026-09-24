import { TypeSafeClient } from '@typesafe-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { jevConfig } = vi.hoisted(() => ({
  jevConfig: { apiKey: undefined as string | undefined, model: 'jev-1.13.0', timeoutMs: 1200 }
}))
const undiciMocks = vi.hoisted(() => ({
  Agent: vi.fn(() => ({ close: vi.fn() })),
  close: vi.fn(),
  fetch: vi.fn()
}))

vi.mock('../../../config.js', () => ({ config: { jev: jevConfig } }))

vi.mock('@typesafe-ai/sdk', () => ({
  TypeSafeClient: vi.fn(() => ({ systemOne: vi.fn() }))
}))

vi.mock('undici', () => ({ Agent: undiciMocks.Agent, fetch: undiciMocks.fetch }))

import { Agent, fetch as undiciFetch } from 'undici'
import { getJevClient, resetJevClientForTest } from '../client.js'

describe('Jev client', () => {
  beforeEach(async () => {
    await resetJevClientForTest()
    jevConfig.apiKey = undefined
    jevConfig.model = 'jev-1.13.0'
    jevConfig.timeoutMs = 1200
    vi.mocked(TypeSafeClient).mockClear()
    vi.mocked(Agent)
      .mockClear()
      .mockImplementation(() => ({ close: undiciMocks.close }) as never)
    undiciMocks.close.mockReset().mockImplementation(async () => undefined)
    vi.mocked(undiciFetch)
      .mockReset()
      .mockResolvedValue({} as Awaited<ReturnType<typeof undiciFetch>>)
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
      logLevel: 'off',
      fetch: expect.any(Function)
    })
  })

  it('passes a reused keep-alive fetch to TypeSafeClient', async () => {
    jevConfig.apiKey = 'test-key'
    getJevClient()
    const options = vi.mocked(TypeSafeClient).mock.calls[0]?.[0] as { fetch: typeof fetch }

    await options.fetch('https://typesafe.test')
    await options.fetch('https://typesafe.test')

    expect(Agent).toHaveBeenCalledOnce()
    expect(Agent).toHaveBeenCalledWith({ keepAliveTimeout: 60_000 })
    expect(undiciFetch).toHaveBeenCalledTimes(2)
    await resetJevClientForTest()
    expect(undiciMocks.close).toHaveBeenCalledOnce()
  })
})
