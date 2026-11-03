import { Collection } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SocialPostLookup } from '../../agent/social/types.js'

const mocks = vi.hoisted(() => ({
  generateResponse: vi.fn(),
  startTurnEntryWork: vi.fn(),
  cancelTurnEntryWork: vi.fn(),
  recordResponseEvent: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  isChannelBusy: vi.fn(() => false),
  isMonitored: vi.fn(() => false),
  markActive: vi.fn(),
  tryConsume: vi.fn(() => true),
  recordEpisodeMessage: vi.fn(),
  canAffordAttachments: vi.fn(() => true),
  tryReserve: vi.fn(() => true),
  release: vi.fn(),
  splitResponse: vi.fn((response: string) => [response]),
  beginSocialPostLookup: vi.fn((_texts: string[], _later: Promise<string[]>) =>
    Promise.resolve({ status: 'none' } as SocialPostLookup)
  ),
  resolveMediaUrl: vi.fn(
    async (url: string): Promise<{ url: string; contentType: string; size?: number } | null> => ({
      url,
      contentType: 'image/jpeg'
    })
  )
}))

vi.mock('../../agent/roka.js', () => ({ generateResponse: mocks.generateResponse }))
vi.mock('../../agent/memory/channelMonitor.js', () => ({
  isMonitored: mocks.isMonitored,
  markActive: mocks.markActive
}))
vi.mock('../../agent/memory/episodeTracker.js', () => ({ recordEpisodeMessage: mocks.recordEpisodeMessage }))
vi.mock('../../agent/turnContext.js', () => ({ startTurnEntryWork: mocks.startTurnEntryWork }))
vi.mock('../../agent/llm/tokenBudget.js', () => ({ canAffordAttachments: mocks.canAffordAttachments }))
vi.mock('../../storage/metricsStore.js', () => ({ recordResponseEvent: mocks.recordResponseEvent }))
vi.mock('../../storage/userNames.js', () => ({ upsertUserName: vi.fn() }))
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: mocks.info, warn: mocks.warn }
}))
vi.mock('../concurrency.js', () => ({ isChannelBusy: mocks.isChannelBusy, markBusy: vi.fn(), markFree: vi.fn() }))
vi.mock('../byteBudget.js', () => ({
  fitAttachmentsToTurn: vi.fn((attachments: unknown[]) => ({ kept: attachments, skipped: 0 })),
  release: mocks.release,
  reservationFor: vi.fn(() => 0),
  tryReserve: mocks.tryReserve
}))
vi.mock('../emojiReactor.js', () => ({ shouldReact: () => null }))
vi.mock('../../agent/media/mediaRules.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agent/media/mediaRules.js')>()
  return { ...actual, resolveMediaUrl: mocks.resolveMediaUrl }
})
vi.mock('../../agent/social/service.js', () => ({
  beginSocialPostLookup: mocks.beginSocialPostLookup,
  socialPostTexts: (message: { content?: string; embeds?: Array<{ url?: string; description?: string }> }) => [
    message.content ?? '',
    ...(message.embeds ?? []).flatMap((embed) => [embed.url ?? '', embed.description ?? ''])
  ],
  socialPostSnapshotTexts: () => []
}))
vi.mock('../errorHandler.js', () => ({ isIgnorableDiscordError: () => false }))
vi.mock('../responses.js', () => ({
  getRandomBusy: () => 'busy',
  getRandomDecline: () => 'decline',
  getRandomError: () => 'error',
  getRandomUnsupportedAttachment: () => "I couldn't open that file~",
  getRandomPartialAttachment: () => 'I only got through the beginning of that~',
  getRandomSkippedAttachments: () => 'I looked at the first ones; send the rest separately~',
  splitResponse: mocks.splitResponse
}))
vi.mock('../events/gachaMention.js', () => ({ handleGachaMention: vi.fn() }))

import { config } from '../../config.js'
import { createMessageHandler } from '../events/messageCreate.js'

const metrics = {
  generateMs: 1,
  llmMs: 0,
  retryLatencyMs: 0,
  retries: 0,
  outcome: 'ok',
  kind: 'ok',
  tokensInEst: 20,
  tokensOutEst: 10
}

function videoEmbed(url: string, thumbnail = 'https://cdn.test/still.jpg') {
  return {
    author: null,
    title: 'A clip',
    description: 'watch this',
    fields: [],
    footer: null,
    video: { url, proxyURL: url, width: 640, height: 360 },
    image: null,
    thumbnail: { url: thumbnail },
    data: { type: 'video' },
    url: 'https://example.com/post'
  }
}

function gifvEmbed() {
  return {
    author: null,
    title: null,
    description: null,
    fields: [],
    footer: null,
    video: { url: 'https://media.tenor.com/abc/roka-wink.mp4', width: 480, height: 270 },
    image: null,
    thumbnail: { url: 'https://media.tenor.com/abc/still.png' },
    data: { type: 'gifv' },
    url: 'https://tenor.com/view/abc'
  }
}

function createMessage({ content = '<@bot-1> look', embeds = [] as object[], fetchFresh = null as object | null }) {
  const reply = vi.fn().mockResolvedValue({ delete: vi.fn().mockResolvedValue(undefined) })
  return {
    message: {
      author: { id: 'user-1', bot: false, displayName: 'Alice', username: 'alice' },
      id: 'message-1',
      createdTimestamp: 1_000,
      channelId: 'channel-1',
      content,
      mentions: { has: vi.fn(() => true), repliedUser: null },
      components: [],
      reference: null,
      guild: null,
      guildId: 'guild-1',
      member: { displayName: 'Alice' },
      attachments: new Collection(),
      embeds,
      poll: null,
      stickers: new Collection(),
      messageSnapshots: new Collection(),
      channel: { sendTyping: vi.fn().mockResolvedValue(undefined), send: vi.fn() },
      reply
    },
    reply
  }
}

const turnEntryWork = { judgment: Promise.resolve(null), cancel: mocks.cancelTurnEntryWork }

function resetMocks() {
  vi.clearAllMocks()
  mocks.isChannelBusy.mockReturnValue(false)
  mocks.isMonitored.mockReturnValue(false)
  mocks.tryConsume.mockReturnValue(true)
  mocks.beginSocialPostLookup.mockResolvedValue({ status: 'none' })
  mocks.resolveMediaUrl.mockImplementation(async (url: string) => ({ url, contentType: 'image/jpeg' }))
  mocks.startTurnEntryWork.mockReturnValue(turnEntryWork)
  mocks.generateResponse.mockResolvedValue({
    text: 'Hello~',
    tone: 'playful',
    toolsUsed: [],
    metrics,
    droppedAttachments: 0,
    truncatedAttachments: 0
  })
}

async function handle(message: object) {
  await createMessageHandler(
    { user: { id: 'bot-1' } } as never,
    {
      canAdmitCalls: () => true,
      reserveCalls: () => ({ release: () => {} }),
      remainingRpm: 14,
      remainingRpd: 499
    } as never
  )(message as never)
  return mocks.generateResponse.mock.calls[0][0]
}

describe('embed video on the mention path', () => {
  beforeEach(resetMocks)

  it('watches a playable video from an embed on any host', async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce({
      url: 'https://video.example/clip.mp4',
      contentType: 'video/mp4',
      size: 1_000_000
    })
    const { message } = createMessage({ embeds: [videoEmbed('https://video.example/clip.mp4')] })

    const result = await handle(message)

    expect(result.mediaAttachments).toEqual([
      {
        url: 'https://video.example/clip.mp4',
        contentType: 'video/mp4',
        size: 1_000_000,
        origin: 'link',
        sourceAuthorId: null
      }
    ])
    expect(result.userMessage).toContain('watch this')
  })

  it('uses the embed video when her own lookup failed', async () => {
    mocks.beginSocialPostLookup.mockResolvedValueOnce({ status: 'failed', platform: 'reddit', reason: 'http_403' })
    mocks.resolveMediaUrl.mockResolvedValueOnce({
      url: 'https://v.redd.it/abc/DASH_240.mp4',
      contentType: 'video/mp4',
      size: 800_000
    })
    const { message } = createMessage({
      content: '<@bot-1> what happens? https://www.reddit.com/r/videos/comments/xyz/post/',
      embeds: [videoEmbed('https://v.redd.it/abc/DASH_240.mp4')]
    })

    const result = await handle(message)

    expect(result.mediaAttachments).toEqual([
      {
        url: 'https://v.redd.it/abc/DASH_240.mp4',
        contentType: 'video/mp4',
        size: 800_000,
        origin: 'link',
        sourceAuthorId: null
      }
    ])
    expect(result.userMessage).toContain('(the linked post could not be opened)')
  })

  it('keeps text and thumbnail when the embed URL is not a video', async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce({
      url: 'https://www.youtube.com/embed/abc',
      contentType: 'text/html',
      size: 5_000
    })
    const { message } = createMessage({ embeds: [videoEmbed('https://www.youtube.com/embed/abc')] })

    const result = await handle(message)

    expect(result.mediaAttachments).toEqual([{ url: 'https://cdn.test/still.jpg', contentType: 'image/png' }])
    expect(result.userMessage).toContain('watch this')
  })

  it('leaves gifv embeds as text and never watches them', async () => {
    const { message } = createMessage({ embeds: [gifvEmbed()] })

    const result = await handle(message)

    expect(mocks.resolveMediaUrl).not.toHaveBeenCalled()
    expect(result.userMessage).toContain('animated GIF')
    expect(result.mediaAttachments).toEqual([
      { url: 'https://media.tenor.com/abc/still.png', contentType: 'image/png' }
    ])
  })

  it('keeps the thumbnail when the address checks refuse the video', async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce(null)
    const { message } = createMessage({ embeds: [videoEmbed('https://video.example/private.mp4')] })

    const result = await handle(message)

    expect(result.mediaAttachments).toEqual([{ url: 'https://cdn.test/still.jpg', contentType: 'image/png' }])
  })

  it('sees the video when Discord patches a late embed onto the same message', async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce({
      url: 'https://video.example/late.mp4',
      contentType: 'video/mp4',
      size: 500_000
    })
    const { message } = createMessage({ content: '<@bot-1> look https://example.com/clip', embeds: [] })
    setTimeout(() => {
      message.embeds.push(videoEmbed('https://video.example/late.mp4'))
    }, 100)

    const result = await handle(message)

    expect(result.mediaAttachments).toEqual([
      {
        url: 'https://video.example/late.mp4',
        contentType: 'video/mp4',
        size: 500_000,
        origin: 'link',
        sourceAuthorId: null
      }
    ])
  })

  it('gives up on a late embed at the configured wait', async () => {
    const { message } = createMessage({ content: '<@bot-1> look https://example.com/clip', embeds: [] })
    const started = performance.now()

    await handle(message)

    const elapsed = performance.now() - started
    expect(elapsed).toBeGreaterThanOrEqual(config.media.embedWaitMs - 50)
    expect(elapsed).toBeLessThan(config.media.embedWaitMs + 1000)
    expect(mocks.resolveMediaUrl).not.toHaveBeenCalled()
  })

  it('does not wait for an embed on a message with no link', async () => {
    const { message } = createMessage({ content: '<@bot-1> hello there', embeds: [] })
    const started = performance.now()

    await handle(message)

    expect(performance.now() - started).toBeLessThan(config.media.embedWaitMs)
  })

  it('keeps the text and thumbnail of a late embed with no playable video', async () => {
    const { message } = createMessage({ content: '<@bot-1> look https://example.com/clip', embeds: [] })
    setTimeout(() => {
      message.embeds.push({
        title: 'A late title',
        fields: [],
        image: { url: 'https://images.example/still.png' },
        data: { type: 'rich' }
      })
    }, 100)

    const result = await handle(message)

    expect(result.userMessage).toContain('A late title')
    expect(result.mediaAttachments).toEqual([{ url: 'https://images.example/still.png', contentType: 'image/png' }])
  })
})
