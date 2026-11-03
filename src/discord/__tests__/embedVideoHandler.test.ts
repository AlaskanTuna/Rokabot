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

function videoEmbed(proxyURL: string, thumbnail = 'https://cdn.test/still.jpg') {
  return {
    author: null,
    title: 'A clip',
    description: 'watch this',
    fields: [],
    footer: null,
    video: { url: 'https://video.example/direct.mp4', proxyURL, width: 640, height: 360 },
    image: null,
    thumbnail: { url: thumbnail },
    data: { type: 'video' },
    url: 'https://example.com/post'
  }
}

const PROXY_CLIP = 'https://images-ext-1.discordapp.net/embed_proxy/clip.mp4'

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
      mentions: { has: vi.fn(() => true), repliedUser: null as { id: string } | null },
      components: [],
      reference: null as { messageId: string } | null,
      guild: null,
      guildId: 'guild-1',
      member: { displayName: 'Alice' },
      attachments: new Collection(),
      embeds,
      poll: null,
      flags: undefined as { has: (flag: string) => boolean } | undefined,
      stickers: new Collection(),
      messageSnapshots: new Collection(),
      channel: {
        sendTyping: vi.fn().mockResolvedValue(undefined),
        send: vi.fn(),
        messages: { fetch: vi.fn() }
      },
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

  it("watches a playable video from Discord's proxy embed", async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce({
      url: PROXY_CLIP,
      contentType: 'video/mp4',
      size: 1_000_000
    })
    const { message } = createMessage({ embeds: [videoEmbed(PROXY_CLIP)] })

    const result = await handle(message)

    expect(result.mediaAttachments).toEqual([
      {
        url: PROXY_CLIP,
        contentType: 'video/mp4',
        size: 1_000_000,
        origin: 'link',
        sourceAuthorId: null,
        contentKey: 'embedvideo:images-ext-1.discordapp.net/embed_proxy/clip.mp4'
      }
    ])
    expect(result.userMessage).toContain('watch this')
  })

  it("ignores an embed video whose proxy URL is not Discord's", async () => {
    const { message } = createMessage({ embeds: [videoEmbed('https://proxy.example/clip.mp4')] })

    const result = await handle(message)

    expect(mocks.resolveMediaUrl).not.toHaveBeenCalled()
    expect(result.mediaAttachments).toEqual([{ url: 'https://cdn.test/still.jpg', contentType: 'image/png' }])
  })

  it('stops at the first playable video', async () => {
    const first = 'https://images-ext-1.discordapp.net/embed_proxy/first.mp4'
    const second = 'https://images-ext-2.discordapp.net/embed_proxy/second.mp4'
    mocks.resolveMediaUrl.mockResolvedValueOnce({ url: first, contentType: 'video/mp4', size: 500_000 })
    const { message } = createMessage({ embeds: [videoEmbed(first), videoEmbed(second)] })

    const result = await handle(message)

    expect(mocks.resolveMediaUrl).toHaveBeenCalledTimes(1)
    expect(mocks.resolveMediaUrl).toHaveBeenCalledWith(first)
    expect(result.mediaAttachments).toHaveLength(2)
    expect(result.mediaAttachments[1]).toMatchObject({ url: first, origin: 'link' })
  })

  it('watches no embed video when an upload already fills the timed slot', async () => {
    const { message } = createMessage({ embeds: [videoEmbed(PROXY_CLIP)] })
    message.attachments.set('0', { url: 'https://cdn.test/own.mp4', contentType: 'video/mp4', size: 1_000 })

    const result = await handle(message)

    expect(mocks.resolveMediaUrl).not.toHaveBeenCalledWith(PROXY_CLIP)
    expect(result.mediaAttachments.some((attachment: { origin?: string }) => attachment.origin === 'link')).toBe(false)
  })

  it("watches no embed video when the post's own video won", async () => {
    const postVideoUrl = 'https://video.example/post.mp4'
    mocks.resolveMediaUrl.mockImplementation(async (url: string) =>
      url === postVideoUrl ? { url, contentType: 'video/mp4', size: 800_000 } : { url, contentType: 'image/jpeg' }
    )
    mocks.beginSocialPostLookup.mockResolvedValueOnce({
      status: 'found',
      post: {
        platform: 'x',
        id: '123',
        canonicalUrl: 'https://x.com/i/status/123',
        target: { lookupKey: 'x:123' },
        authorHandle: 'roka',
        authorName: 'Roka',
        createdAt: '2026-10-06',
        text: 'The linked post text',
        quotedText: '',
        quotedAuthorHandle: '',
        photoCount: 0,
        videoCount: 1,
        imageUrl: null,
        externalTitle: '',
        replyCount: null,
        durationSec: null,
        video: { url: postVideoUrl, bytes: 800_000, headers: null, hasAudio: true }
      }
    } as never)
    const { message } = createMessage({
      content: '<@bot-1> look https://x.com/roka/status/123',
      embeds: [videoEmbed(PROXY_CLIP)]
    })

    const result = await handle(message)

    expect(mocks.resolveMediaUrl).not.toHaveBeenCalledWith(PROXY_CLIP)
    expect((result.mediaAttachments ?? []).some((attachment: { url: string }) => attachment.url === PROXY_CLIP)).toBe(
      false
    )
  })

  it('watches no embed video when the attachment list is already full', async () => {
    const { message } = createMessage({ embeds: [videoEmbed(PROXY_CLIP)] })
    for (let index = 0; index < 10; index += 1) {
      message.attachments.set(String(index), {
        url: `https://cdn.test/own-${index}.png`,
        contentType: 'image/png',
        size: 1_000
      })
    }

    const result = await handle(message)

    expect(mocks.resolveMediaUrl).not.toHaveBeenCalled()
    expect(result.mediaAttachments).toHaveLength(10)
  })

  it('takes no embed from a reply to Roka herself', async () => {
    const { message } = createMessage({ content: 'nice one', embeds: [] })
    const referencedMessage = {
      id: 'message-0',
      author: { id: 'bot-1', displayName: 'Roka' },
      member: null,
      content: 'look at this',
      embeds: [videoEmbed(PROXY_CLIP)],
      poll: null,
      components: [],
      stickers: new Collection(),
      attachments: new Collection(),
      messageSnapshots: new Collection()
    }
    message.reference = { messageId: 'message-0' }
    message.mentions = { has: (() => false) as never, repliedUser: { id: 'bot-1' } }
    message.channel.messages = { fetch: vi.fn().mockResolvedValue(referencedMessage) }

    const result = await handle(message)

    expect(mocks.resolveMediaUrl).not.toHaveBeenCalledWith(PROXY_CLIP)
    expect((result.mediaAttachments ?? []).some((attachment: { url: string }) => attachment.url === PROXY_CLIP)).toBe(
      false
    )
  })

  it('keeps the video slot when thumbnails would crowd it out', async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce({ url: PROXY_CLIP, contentType: 'video/mp4', size: 500_000 })
    const { message } = createMessage({ content: '<@bot-1> look https://example.com/clip', embeds: [] })
    for (let index = 0; index < 9; index += 1) {
      message.attachments.set(String(index), {
        url: `https://cdn.test/own-${index}.png`,
        contentType: 'image/png',
        size: 1_000
      })
    }
    setTimeout(() => {
      message.embeds.push(videoEmbed(PROXY_CLIP))
    }, 100)

    const result = await handle(message)

    expect(result.mediaAttachments).toHaveLength(10)
    expect(result.mediaAttachments[9]).toMatchObject({ url: PROXY_CLIP, origin: 'link' })
  })

  it('uses the embed video when her own lookup failed', async () => {
    mocks.beginSocialPostLookup.mockResolvedValueOnce({ status: 'failed', platform: 'reddit', reason: 'http_403' })
    mocks.resolveMediaUrl.mockResolvedValueOnce({
      url: PROXY_CLIP,
      contentType: 'video/mp4',
      size: 800_000
    })
    const { message } = createMessage({
      content: '<@bot-1> what happens? https://www.reddit.com/r/videos/comments/xyz/post/',
      embeds: [videoEmbed(PROXY_CLIP)]
    })

    const result = await handle(message)

    expect(result.mediaAttachments).toEqual([
      {
        url: PROXY_CLIP,
        contentType: 'video/mp4',
        size: 800_000,
        origin: 'link',
        sourceAuthorId: null,
        contentKey: 'embedvideo:images-ext-1.discordapp.net/embed_proxy/clip.mp4'
      }
    ])
    expect(result.userMessage).toContain('(the linked post could not be opened)')
  })

  it('keeps the failure marker exactly once when a failed lookup falls back to the embed', async () => {
    mocks.beginSocialPostLookup.mockResolvedValueOnce({ status: 'failed', platform: 'reddit', reason: 'http_403' })
    mocks.resolveMediaUrl.mockResolvedValueOnce({
      url: PROXY_CLIP,
      contentType: 'video/mp4',
      size: 800_000
    })
    const { message } = createMessage({
      content: '<@bot-1> what happens? https://www.reddit.com/r/videos/comments/xyz/post/',
      embeds: [videoEmbed(PROXY_CLIP)]
    })

    const result = await handle(message)

    expect(result.userMessage.split('(the linked post could not be opened)')).toHaveLength(2)
  })

  it('keeps text and thumbnail when the embed URL is not a video', async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce({
      url: PROXY_CLIP,
      contentType: 'text/html',
      size: 5_000
    })
    const { message } = createMessage({ embeds: [videoEmbed(PROXY_CLIP)] })

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
    const { message } = createMessage({ embeds: [videoEmbed(PROXY_CLIP)] })

    const result = await handle(message)

    expect(result.mediaAttachments).toEqual([{ url: 'https://cdn.test/still.jpg', contentType: 'image/png' }])
  })

  it('sees the video when Discord patches a late embed onto the same message', async () => {
    const late = 'https://images-ext-1.discordapp.net/embed_proxy/late.mp4'
    mocks.resolveMediaUrl.mockResolvedValueOnce({
      url: late,
      contentType: 'video/mp4',
      size: 500_000
    })
    const { message } = createMessage({ content: '<@bot-1> look https://example.com/clip', embeds: [] })
    setTimeout(() => {
      message.embeds.push(videoEmbed(late))
    }, 100)

    const result = await handle(message)

    expect(result.mediaAttachments).toEqual([
      {
        url: late,
        contentType: 'video/mp4',
        size: 500_000,
        origin: 'link',
        sourceAuthorId: null,
        contentKey: 'embedvideo:images-ext-1.discordapp.net/embed_proxy/late.mp4'
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

  it('does not wait when embeds are suppressed on the message', async () => {
    const { message } = createMessage({ content: '<@bot-1> look https://example.com/clip', embeds: [] })
    message.flags = { has: () => true }
    const started = performance.now()

    await handle(message)

    expect(performance.now() - started).toBeLessThan(config.media.embedWaitMs)
    expect(mocks.resolveMediaUrl).not.toHaveBeenCalled()
  })

  it('does not wait when every link is wrapped so Discord never embeds it', async () => {
    const { message } = createMessage({ content: '<@bot-1> look <https://example.com/clip>', embeds: [] })
    const started = performance.now()

    await handle(message)

    expect(performance.now() - started).toBeLessThan(config.media.embedWaitMs)
    expect(mocks.resolveMediaUrl).not.toHaveBeenCalled()
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
