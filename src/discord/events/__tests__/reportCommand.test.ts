import { InteractionContextType, MessageFlags } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), mkdir: vi.fn(), rm: vi.fn(), writeFile: vi.fn() }))

vi.mock('../../../config.js', () => ({
  config: {
    report: { maxPerUserPerHour: 5, maxAttachmentBytes: 8, historyMessages: 20, historyMaxAgeMs: 7_200_000 },
    gemini: { model: 'gemini-test' },
    fallback: { model: 'fallback-test' }
  }
}))
vi.mock('../../../utils/logger.js', () => ({ logger: { info: mocks.info, warn: mocks.warn } }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, mkdir: mocks.mkdir, rm: mocks.rm, writeFile: mocks.writeFile }
})

import { closeDb, getDb } from '../../../storage/database.js'
import { handleReportCommand } from '../reportCommand.js'

function makeInteraction(
  options: {
    context?: InteractionContextType
    guildId?: string | null
    channelId?: string | null
    userId?: string
    attachment?: null | { name: string; contentType: string | null; size: number; url: string }
  } = {}
) {
  const {
    context = InteractionContextType.Guild,
    guildId = 'guild-1',
    channelId = 'channel-1',
    userId = 'user-1',
    attachment = null
  } = options
  return {
    context,
    guildId,
    channelId,
    id: `interaction-${userId}-${Math.random()}`,
    locale: 'en-US',
    member: guildId ? { displayName: 'Guild Alice' } : null,
    user: { id: userId, username: 'alice', displayName: 'Alice' },
    options: {
      getString: vi.fn((name: string) =>
        name === 'type' ? 'bug' : name === 'message' ? 'The answer was wrong' : null
      ),
      getAttachment: vi.fn(() => attachment)
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined)
  }
}

beforeEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
  vi.clearAllMocks()
  mocks.mkdir.mockResolvedValue(undefined)
  mocks.rm.mockResolvedValue(undefined)
  mocks.writeFile.mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('/report handler', () => {
  it.each([
    { context: InteractionContextType.Guild, guildId: 'guild-1', expected: 'guild' },
    { context: InteractionContextType.BotDM, guildId: null, expected: 'bot_dm' },
    { context: InteractionContextType.PrivateChannel, guildId: null, expected: 'private_channel' }
  ] as const)('stores the $expected context with the correct guild id', async ({ context, guildId, expected }) => {
    const interaction = makeInteraction({ context, guildId })

    await handleReportCommand(interaction as never)

    const row = getDb()
      .prepare('SELECT context, guild_id, channel_id FROM bug_reports WHERE interaction_id = ?')
      .get(interaction.id)
    expect(row).toEqual({ context: expected, guild_id: guildId, channel_id: 'channel-1' })
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringMatching(/report #\d+ is filed/) })
    )
  })

  it('stores nothing and replies ephemerally when the user is over the hourly limit', async () => {
    for (let index = 0; index < 5; index++) {
      await handleReportCommand(makeInteraction() as never)
    }
    const overLimit = makeInteraction()

    await handleReportCommand(overLimit as never)

    expect(getDb().prepare('SELECT COUNT(*) AS count FROM bug_reports').get()).toEqual({ count: 5 })
    expect(overLimit.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
    expect(overLimit.editReply).toHaveBeenCalledWith({ content: expect.stringMatching(/try again later/i) })
  })

  it('keeps oversized attachment metadata and records why the copy was skipped', async () => {
    const attachment = {
      name: 'too-large.png',
      contentType: 'image/png',
      size: 9,
      url: 'https://cdn.discordapp.com/attachments/1/2/too-large.png'
    }

    await handleReportCommand(makeInteraction({ attachment }) as never)

    const row = getDb()
      .prepare(
        'SELECT attachment_name, attachment_content_type, attachment_size, attachment_path, attachment_error FROM bug_reports'
      )
      .get() as Record<string, unknown>
    expect(row).toMatchObject({
      attachment_name: 'too-large.png',
      attachment_content_type: 'image/png',
      attachment_size: 9,
      attachment_path: null,
      attachment_error: expect.any(String)
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('saves a small attachment from a Discord CDN host under a sanitized report path', async () => {
    const url = 'https://cdn.discordapp.com/attachments/1/2/photo.png'
    vi.mocked(fetch).mockResolvedValue(new Response(Uint8Array.of(1, 2, 3)))
    const attachment = { name: '../bad name.png', contentType: 'image/png', size: 3, url }

    await handleReportCommand(makeInteraction({ attachment }) as never)

    const row = getDb().prepare('SELECT attachment_path, attachment_error FROM bug_reports').get()
    expect(fetch).toHaveBeenCalledWith(url, { redirect: 'error' })
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/data\/reports\/1-bad_name\.png$/),
      Buffer.from([1, 2, 3])
    )
    expect(row).toEqual({ attachment_path: 'data/reports/1-bad_name.png', attachment_error: null })
  })

  it('stops reading a response when its streamed body exceeds the copy limit', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(9))
        controller.close()
      }
    })
    vi.mocked(fetch).mockResolvedValue(new Response(body))
    const attachment = {
      name: 'lying-size.png',
      contentType: 'image/png',
      size: 1,
      url: 'https://media.discordapp.net/attachments/1/2/lying-size.png'
    }

    await handleReportCommand(makeInteraction({ attachment }) as never)

    const row = getDb().prepare('SELECT attachment_path, attachment_error FROM bug_reports').get() as Record<
      string,
      unknown
    >
    expect(row).toMatchObject({ attachment_path: null, attachment_error: expect.stringContaining('exceeded') })
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('files the report when a channel snapshot query fails', async () => {
    getDb().exec('DROP TABLE response_events')
    const interaction = makeInteraction()

    await expect(handleReportCommand(interaction as never)).resolves.toBeUndefined()

    expect(getDb().prepare('SELECT COUNT(*) AS count FROM bug_reports').get()).toEqual({ count: 1 })
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'channel-1', section: 'recentResponses' }),
      'Failed to capture bug report context snapshot'
    )
  })
})
