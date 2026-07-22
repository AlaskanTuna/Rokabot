import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  applicationCommands: vi.fn((clientId: string) => `/applications/${clientId}/commands`),
  applicationGuildCommands: vi.fn(
    (clientId: string, guildId: string) => `/applications/${clientId}/guilds/${guildId}/commands`
  ),
  put: vi.fn(),
  setToken: vi.fn(),
  startStatusCycler: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  config: {
    discord: {
      token: 'test-token',
      clientId: 'test-client-id',
      devGuildId: undefined as string | undefined
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
    applicationCommands: mocks.applicationCommands,
    applicationGuildCommands: mocks.applicationGuildCommands
  }
}))

vi.mock('../../../config.js', () => ({ config: mocks.config }))
vi.mock('../../../utils/logger.js', () => ({ logger: { info: mocks.info, error: mocks.error } }))
vi.mock('../../commands/chat.js', () => ({ chatCommand: { toJSON: () => ({ name: 'chat' }) } }))
vi.mock('../../commands/games.js', () => ({ gameCommands: [] }))
vi.mock('../../commands/tools.js', () => ({ toolCommands: [] }))
vi.mock('../../statusCycler.js', () => ({ startStatusCycler: mocks.startStatusCycler }))

import { handleReady } from '../ready.js'

describe('handleReady', () => {
  beforeEach(() => {
    mocks.applicationCommands.mockClear()
    mocks.applicationGuildCommands.mockClear()
    mocks.put.mockResolvedValue(undefined)
    mocks.put.mockClear()
    mocks.setToken.mockClear()
    mocks.startStatusCycler.mockClear()
    mocks.info.mockClear()
    mocks.error.mockClear()
    mocks.config.discord.devGuildId = undefined
  })

  it('registers global commands when no development guild is configured', async () => {
    await handleReady({ user: { tag: 'Roka#0001' } } as never)

    expect(mocks.applicationCommands).toHaveBeenCalledWith('test-client-id')
    expect(mocks.applicationGuildCommands).not.toHaveBeenCalled()
    expect(mocks.put).toHaveBeenCalledWith('/applications/test-client-id/commands', {
      body: [{ name: 'chat' }]
    })
  })

  it('registers commands in the configured development guild', async () => {
    mocks.config.discord.devGuildId = 'test-guild-id'

    await handleReady({ user: { tag: 'Roka#0001' } } as never)

    expect(mocks.applicationGuildCommands).toHaveBeenCalledWith('test-client-id', 'test-guild-id')
    expect(mocks.applicationCommands).not.toHaveBeenCalled()
    expect(mocks.put).toHaveBeenCalledWith('/applications/test-client-id/guilds/test-guild-id/commands', {
      body: [{ name: 'chat' }]
    })
  })
})
