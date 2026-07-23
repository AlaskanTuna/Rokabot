import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applicationCommands: vi.fn((clientId: string) => `/applications/${clientId}/commands`),
  put: vi.fn(),
  setToken: vi.fn(),
  startStatusCycler: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  config: {
    discord: {
      token: 'test-token',
      clientId: 'test-client-id'
    }
  }
}))

vi.mock('discord.js', () => ({
  REST: class {
    setToken(token: string) {
      mocks.setToken(token)
      return this
    }

    put = mocks.put
  },
  Routes: {
    applicationCommands: mocks.applicationCommands
  }
}))

vi.mock('../../../config.js', () => ({ config: mocks.config }))
vi.mock('../../../utils/logger.js', () => ({ logger: { info: mocks.info, error: mocks.error } }))
vi.mock('../../commands/chat.js', () => ({ chatCommand: { toJSON: () => ({ name: 'chat' }) } }))
vi.mock('../../commands/games.js', () => ({ gameCommands: [{ toJSON: () => ({ name: 'game' }) }] }))
vi.mock('../../commands/stats.js', () => ({ statsCommand: { toJSON: () => ({ name: 'stats' }) } }))
vi.mock('../../commands/tools.js', () => ({ toolCommands: [{ toJSON: () => ({ name: 'tool' }) }] }))
vi.mock('../../statusCycler.js', () => ({ startStatusCycler: mocks.startStatusCycler }))

import { handleReady } from '../ready.js'

describe('handleReady', () => {
  beforeEach(() => {
    mocks.applicationCommands.mockClear()
    mocks.put.mockResolvedValue(undefined)
    mocks.put.mockClear()
    mocks.setToken.mockClear()
    mocks.startStatusCycler.mockClear()
    mocks.info.mockClear()
    mocks.error.mockClear()
  })

  it('registers the complete command body globally', async () => {
    await handleReady({ user: { tag: 'Roka#0001' } } as never)

    expect(mocks.applicationCommands).toHaveBeenCalledWith('test-client-id')
    expect(mocks.put).toHaveBeenCalledWith('/applications/test-client-id/commands', {
      body: [{ name: 'chat' }, { name: 'tool' }, { name: 'game' }, { name: 'stats' }]
    })
  })
})
