import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageAttachment } from '../../attachments.js'
import type { MediaClip, MediaDigest } from '../types.js'

const mocks = vi.hoisted(() => ({
  watch: true,
  prepareAttachments: vi.fn(),
  downloadAttachment: vi.fn(),
  measureAttachmentTokens: vi.fn(),
  watchMedia: vi.fn(),
  countUriTokens: vi.fn(),
  findMediaDigest: vi.fn(),
  saveMediaDigest: vi.fn(),
  recordMediaOccurrence: vi.fn(),
  setMediaDigestEmbedding: vi.fn(),
  embedEpisodeText: vi.fn(),
  streamToFiles: vi.fn(),
  deleteFile: vi.fn(),
  remainingTokensThisMinute: vi.fn(),
  maxLlmCalls: 4,
  watcher: 'gemini' as 'gemini' | 'qwen',
  qwenKey: undefined as string | undefined,
  probeDurationSec: vi.fn(),
  extractFrames: vi.fn(),
  resolveYouTubeStreams: vi.fn(),
  watchFramesWithQwen: vi.fn()
}))

vi.mock('../../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    gemini: {
      maxAttachmentTokens: 50_000,
      get maxLlmCalls() {
        return mocks.maxLlmCalls
      }
    },
    get fallback() {
      return { apiKey: mocks.qwenKey, baseUrl: 'https://modelscope.test/v1' }
    },
    get media() {
      return {
        watch: mocks.watch,
        watcher: mocks.watcher,
        qwen: { model: 'Qwen/test', frames: 4, frameHeight: 360, timeoutMs: 30_000 },
        digestMaxOutputTokens: 3200,
        skimClips: 8,
        skimClipSeconds: 10,
        watchTimeoutMs: 20_000,
        maxStreamedUploadBytes: 52_428_800,
        uploadTimeoutMs: 45_000
      }
    }
  }
}))

vi.mock('../../attachments.js', () => ({
  prepareAttachments: mocks.prepareAttachments,
  downloadAttachment: mocks.downloadAttachment
}))

vi.mock('../../attachmentCost.js', () => ({ measureAttachmentTokens: mocks.measureAttachmentTokens }))

vi.mock('../watch.js', () => ({ watchMedia: mocks.watchMedia, countUriTokens: mocks.countUriTokens }))

vi.mock('../filesUpload.js', () => ({ streamToFiles: mocks.streamToFiles, deleteFile: mocks.deleteFile }))

vi.mock('../frames.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../frames.js')>()),
  probeDurationSec: mocks.probeDurationSec,
  extractFrames: mocks.extractFrames
}))

vi.mock('../youtubeStreams.js', () => ({ resolveYouTubeStreams: mocks.resolveYouTubeStreams }))

vi.mock('../qwenWatch.js', () => ({ watchFramesWithQwen: mocks.watchFramesWithQwen }))

vi.mock('../../../storage/mediaDigestStore.js', () => ({
  findMediaDigest: mocks.findMediaDigest,
  saveMediaDigest: mocks.saveMediaDigest,
  recordMediaOccurrence: mocks.recordMediaOccurrence,
  setMediaDigestEmbedding: mocks.setMediaDigestEmbedding
}))

vi.mock('../../memory/episodeEmbeddings.js', () => ({ embedEpisodeText: mocks.embedEpisodeText }))

vi.mock('../../tokenBudget.js', () => ({ remainingTokensThisMinute: mocks.remainingTokensThisMinute }))

import { prepareTurnMedia } from '../turnMedia.js'

const emptyPrepared = {
  imageParts: [],
  imageTokens: 0,
  droppedAttachments: 0,
  truncatedAttachments: 0,
  refusedAttachments: 0
}

function digestFor(overrides: Partial<MediaDigest> = {}): MediaDigest {
  return {
    kind: 'video',
    label: 'video',
    durationSec: 19,
    mode: 'whole',
    fps: 1,
    bins: [
      { startSec: 0, endSec: 6 },
      { startSec: 6, endSec: 13 },
      { startSec: 13, endSec: 19 }
    ],
    observations: {
      summary: 'A man at a zoo talks about elephants.',
      timeline: [],
      speech: [],
      onScreenText: [],
      uncertainties: []
    },
    incomplete: false,
    ...overrides
  }
}

function okWatch(digest: MediaDigest, calls = 1) {
  return { status: 'ok', digest, promptTokens: 1676, calls, watchMs: 4000 }
}

/** What a watch of one half of a long video returns: its own plan's bins, summarised by where it started. */
function watchedHalf({
  plan,
  window
}: { plan: { bins: MediaClip[]; durationSec: number; fps: number | null }; window?: MediaClip }) {
  return okWatch(
    digestFor({
      mode: 'whole',
      durationSec: plan.durationSec,
      fps: plan.fps,
      bins: plan.bins,
      label: 'YouTube video',
      observations: {
        summary: `Watched from ${Math.round(window?.startSec ?? 0)} s.`,
        timeline: [],
        speech: [],
        onScreenText: [],
        uncertainties: []
      }
    })
  )
}

function mp4WithDuration(seconds: number): Buffer {
  const mvhd = Buffer.alloc(8 + 4 + 16)
  mvhd.writeUInt32BE(mvhd.length, 0)
  mvhd.write('mvhd', 4, 'ascii')
  mvhd.writeUInt32BE(1000, 8 + 4 + 8)
  mvhd.writeUInt32BE(seconds * 1000, 8 + 4 + 12)
  const moov = Buffer.alloc(8)
  moov.writeUInt32BE(8 + mvhd.length, 0)
  moov.write('moov', 4, 'ascii')
  return Buffer.concat([moov, mvhd])
}

const input = (attachments: Parameters<typeof prepareTurnMedia>[0]['attachments']) => ({
  channelId: 'c1',
  attachments,
  focus: 'what is this?',
  mayRetry: () => true
})

beforeEach(() => {
  mocks.watch = true
  mocks.watcher = 'gemini'
  mocks.qwenKey = undefined
  for (const mock of [
    mocks.probeDurationSec,
    mocks.extractFrames,
    mocks.resolveYouTubeStreams,
    mocks.watchFramesWithQwen,
    mocks.findMediaDigest,
    mocks.saveMediaDigest,
    mocks.recordMediaOccurrence,
    mocks.setMediaDigestEmbedding,
    mocks.embedEpisodeText,
    mocks.prepareAttachments,
    mocks.downloadAttachment,
    mocks.measureAttachmentTokens,
    mocks.watchMedia,
    mocks.countUriTokens,
    mocks.streamToFiles,
    mocks.deleteFile,
    mocks.remainingTokensThisMinute
  ]) {
    mock.mockReset()
  }
  mocks.prepareAttachments.mockResolvedValue(emptyPrepared)
  mocks.remainingTokensThisMinute.mockReturnValue(125_000)
  mocks.maxLlmCalls = 4
})

describe('prepareTurnMedia', () => {
  it('sends everything down the direct path when watching is off', async () => {
    mocks.watch = false
    const video = { url: 'https://cdn.discordapp.com/v.mp4', contentType: 'video/mp4', size: 1000 }
    mocks.prepareAttachments.mockResolvedValue({ ...emptyPrepared, imageParts: [{ inlineData: { data: 'x' } }] })

    const result = await prepareTurnMedia(input([video]))

    expect(mocks.prepareAttachments).toHaveBeenCalledWith('c1', [video])
    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(result.directParts).toHaveLength(1)
    expect(result.watcherCalls).toBe(0)
  })

  it('keeps images on the direct path and never watches them', async () => {
    const image = { url: 'https://cdn.discordapp.com/i.png', contentType: 'image/png', size: 10 }
    mocks.prepareAttachments.mockResolvedValue({
      ...emptyPrepared,
      imageParts: [{ inlineData: {} }],
      imageTokens: 1089
    })

    const result = await prepareTurnMedia(input([image]))

    expect(mocks.prepareAttachments).toHaveBeenCalledWith('c1', [image])
    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(result.mediaTokens).toBe(1089)
    expect(result.mediaTextParts).toEqual([])
  })

  it('watches a replied-to voice message from its stated duration without a token count', async () => {
    const voice = { url: 'https://cdn.discordapp.com/v.ogg', contentType: 'audio/ogg', size: 30_000, durationSec: 52 }
    mocks.downloadAttachment.mockResolvedValue({
      data: 'b64',
      mimeType: 'audio/ogg',
      tokens: 0,
      truncated: false,
      bytes: Buffer.alloc(4)
    })
    const digest = digestFor({ kind: 'audio', label: 'voice message', durationSec: 52, fps: null })
    mocks.watchMedia.mockResolvedValue(okWatch(digest))

    const result = await prepareTurnMedia(input([voice]))

    expect(mocks.measureAttachmentTokens).not.toHaveBeenCalled()
    const call = mocks.watchMedia.mock.calls[0][0]
    expect(call.source).toEqual({
      transport: 'inline',
      kind: 'audio',
      mimeType: 'audio/ogg',
      data: 'b64',
      label: 'voice message'
    })
    expect(call.plan).toMatchObject({ mode: 'whole', kind: 'audio', durationSec: 52 })
    expect(result.mediaTextParts).toHaveLength(1)
    expect(result.mediaTextParts[0].text).toContain('A man at a zoo talks about elephants.')
    expect(result.compactDigests).toHaveLength(1)
    expect(result.compactions.get(result.mediaTextParts[0].text as string)).toBe(result.compactDigests[0])
    expect(result.watcherCalls).toBe(1)
    expect(result.mediaTokens).toBe(1676)
  })

  it('reads an uploaded MP4 duration from its header', async () => {
    const video = { url: 'https://cdn.discordapp.com/v.mp4', contentType: 'video/mp4', size: 2000 }
    mocks.downloadAttachment.mockResolvedValue({
      data: 'b64',
      mimeType: 'video/mp4',
      tokens: 0,
      truncated: false,
      bytes: mp4WithDuration(19)
    })
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor()))

    await prepareTurnMedia(input([video]))

    expect(mocks.measureAttachmentTokens).not.toHaveBeenCalled()
    expect(mocks.watchMedia.mock.calls[0][0].plan).toMatchObject({ mode: 'whole', durationSec: 19, fps: 1 })
  })

  it('falls back to a token count when an upload states no duration', async () => {
    const clip = { url: 'https://cdn.discordapp.com/a.mp3', contentType: 'audio/mpeg', size: 2000 }
    mocks.downloadAttachment.mockResolvedValue({
      data: 'b64',
      mimeType: 'audio/mp3',
      tokens: 0,
      truncated: false,
      bytes: Buffer.alloc(4)
    })
    mocks.measureAttachmentTokens.mockResolvedValue(3200)
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor({ kind: 'audio', fps: null })))

    await prepareTurnMedia(input([clip]))

    expect(mocks.watchMedia.mock.calls[0][0].plan).toMatchObject({ mode: 'whole', durationSec: 100 })
  })

  it('watches only the opening of a truncated upload and says so', async () => {
    const video = { url: 'https://cdn.discordapp.com/v.mp4', contentType: 'video/mp4', size: 20_000 }
    const header = mp4WithDuration(200)
    mocks.downloadAttachment.mockResolvedValue({
      data: 'b64',
      mimeType: 'video/mp4',
      tokens: 0,
      truncated: true,
      bytes: Buffer.concat([header, Buffer.alloc(10_000 - header.length)])
    })
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor({ mode: 'opening' })))

    const result = await prepareTurnMedia(input([video]))

    const call = mocks.watchMedia.mock.calls[0][0]
    expect(call.opening).toBe(true)
    expect(call.plan.durationSec).toBe(100)
    expect(result.truncatedAttachments).toBe(1)
  })

  it('counts a failed download as dropped without watching', async () => {
    mocks.downloadAttachment.mockResolvedValue(null)

    const result = await prepareTurnMedia(input([{ url: 'https://x/v.mp4', contentType: 'video/mp4' }]))

    expect(result.droppedAttachments).toBe(1)
    expect(mocks.watchMedia).not.toHaveBeenCalled()
  })

  it('declines an inline video too long to watch whole', async () => {
    const video = { url: 'https://cdn.discordapp.com/v.mp4', contentType: 'video/mp4', size: 9_000_000 }
    mocks.downloadAttachment.mockResolvedValue({
      data: 'b64',
      mimeType: 'video/mp4',
      tokens: 0,
      truncated: false,
      bytes: mp4WithDuration(2700)
    })

    const result = await prepareTurnMedia(input([video]))

    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(result.mediaTextParts[0].text).toBe(
      '[A video was shared, but at about 45:00 it is too long to watch in one go.]'
    )
  })

  it('skims a long YouTube link whose duration comes from a token count', async () => {
    const link = { url: 'https://www.youtube.com/watch?v=abc', contentType: 'video/mp4', transport: 'uri' as const }
    mocks.countUriTokens.mockResolvedValue(Math.round(2700 * 35.3))
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor({ mode: 'skim', label: 'YouTube video' }), 1))

    const result = await prepareTurnMedia(input([link]))

    expect(mocks.countUriTokens).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc', 0.05)
    expect(mocks.downloadAttachment).not.toHaveBeenCalled()
    const call = mocks.watchMedia.mock.calls[0][0]
    expect(call.source).toEqual({
      transport: 'uri',
      kind: 'video',
      fileUri: 'https://www.youtube.com/watch?v=abc',
      mimeType: 'video/mp4',
      label: 'YouTube video'
    })
    expect(call.plan.mode).toBe('skim')
    expect(call.plan.clips).toHaveLength(8)
    expect(result.watcherCalls).toBe(1)
  })

  it('uses a YouTube duration the link lookup already found', async () => {
    const link = {
      url: 'https://www.youtube.com/watch?v=abc',
      contentType: 'video/mp4',
      transport: 'uri' as const,
      durationSec: 213
    }
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor({ label: 'YouTube video' })))

    await prepareTurnMedia(input([link]))

    expect(mocks.countUriTokens).not.toHaveBeenCalled()
    expect(mocks.watchMedia.mock.calls[0][0].plan).toMatchObject({ mode: 'whole', durationSec: 213, fps: 0.25 })
  })

  it('says a YouTube video could not be opened when its length cannot be found', async () => {
    mocks.countUriTokens.mockResolvedValue(undefined)

    const result = await prepareTurnMedia(
      input([{ url: 'https://www.youtube.com/watch?v=abc', contentType: 'video/mp4', transport: 'uri' }])
    )

    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(result.mediaTextParts[0].text).toBe("[A YouTube video was shared, but it couldn't be opened.]")
  })

  it('reports a failed watch honestly and still counts its calls', async () => {
    const voice = { url: 'https://cdn.discordapp.com/v.ogg', contentType: 'audio/ogg', size: 300, durationSec: 5 }
    mocks.downloadAttachment.mockResolvedValue({
      data: 'b64',
      mimeType: 'audio/ogg',
      tokens: 0,
      truncated: false,
      bytes: Buffer.alloc(4)
    })
    mocks.watchMedia.mockResolvedValue({ status: 'failed', reason: 'overloaded', calls: 2, watchMs: 3000 })

    const result = await prepareTurnMedia(input([voice]))

    expect(result.mediaTextParts[0].text).toBe("[A voice message was shared, but it couldn't be watched right now.]")
    expect(result.watchOutcome).toEqual({ status: 'failed', kind: 'audio' })
    expect(result.watcherCalls).toBe(2)
    expect(result.compactDigests).toEqual([])
  })

  it('does not wait on a watch while turns are pinned to the fallback model', async () => {
    const result = await prepareTurnMedia({
      ...input([
        { url: 'https://www.youtube.com/watch?v=abc', contentType: 'video/mp4', transport: 'uri', durationSec: 60 }
      ]),
      geminiUnavailable: true
    })

    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(mocks.countUriTokens).not.toHaveBeenCalled()
    expect(result.mediaTextParts[0].text).toBe("[A YouTube video was shared, but it couldn't be watched right now.]")
    expect(result.watchOutcome).toEqual({ status: 'failed', kind: 'video' })
  })

  it('treats a token count too small for any video as an unknown length', async () => {
    mocks.countUriTokens.mockResolvedValue(70)

    const result = await prepareTurnMedia(
      input([{ url: 'https://www.youtube.com/watch?v=abc', contentType: 'video/mp4', transport: 'uri' }])
    )

    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(result.mediaTextParts[0].text).toBe("[A YouTube video was shared, but it couldn't be opened.]")
  })

  it('charges the tokens a failed watch was billed', async () => {
    mocks.watchMedia.mockResolvedValue({
      status: 'failed',
      reason: 'invalid',
      calls: 1,
      watchMs: 900,
      promptTokens: 4321
    })

    const result = await prepareTurnMedia(
      input([{ url: 'https://www.youtube.com/watch?v=p', contentType: 'video/mp4', transport: 'uri', durationSec: 60 }])
    )

    expect(result.mediaTokens).toBe(4321)
  })

  it('charges the planned estimate when a watch timed out', async () => {
    mocks.watchMedia.mockResolvedValue({ status: 'failed', reason: 'timeout', calls: 1, watchMs: 20_000 })

    const result = await prepareTurnMedia(
      input([{ url: 'https://www.youtube.com/watch?v=p', contentType: 'video/mp4', transport: 'uri', durationSec: 60 }])
    )

    expect(result.mediaTokens).toBe(mocks.watchMedia.mock.calls[0][0].plan.estimate)
  })

  it('says a refused source could not be opened', async () => {
    mocks.watchMedia.mockResolvedValue({ status: 'failed', reason: 'unavailable', calls: 1, watchMs: 900 })

    const result = await prepareTurnMedia(
      input([{ url: 'https://www.youtube.com/watch?v=p', contentType: 'video/mp4', transport: 'uri', durationSec: 60 }])
    )

    expect(result.mediaTextParts[0].text).toBe("[A YouTube video was shared, but it couldn't be opened.]")
  })
})

describe('linked video details', () => {
  it('watches around a YouTube timestamp instead of skimming the whole video', async () => {
    mocks.watchMedia.mockResolvedValue({
      status: 'ok',
      digest: digestFor({ mode: 'focus' }),
      promptTokens: 9000,
      calls: 1,
      watchMs: 4000
    })

    await prepareTurnMedia(
      input([
        {
          url: 'https://www.youtube.com/watch?v=abc',
          contentType: 'video/mp4',
          transport: 'uri',
          durationSec: 1200,
          startSec: 754
        }
      ])
    )

    expect(mocks.watchMedia.mock.calls[0][0].plan).toMatchObject({ mode: 'focus', centerSec: 754 })
  })

  it('watches a short video whole even when its link has a timestamp', async () => {
    mocks.watchMedia.mockResolvedValue({
      status: 'ok',
      digest: digestFor(),
      promptTokens: 1000,
      calls: 1,
      watchMs: 2000
    })

    await prepareTurnMedia(
      input([
        {
          url: 'https://www.youtube.com/watch?v=abc',
          contentType: 'video/mp4',
          transport: 'uri',
          durationSec: 60,
          startSec: 30
        }
      ])
    )

    expect(mocks.watchMedia.mock.calls[0][0].plan).toMatchObject({ mode: 'whole' })
  })

  it('tells the watcher a linked stream has no sound', async () => {
    mocks.downloadAttachment.mockResolvedValue({
      data: 'b64',
      mimeType: 'video/mp4',
      tokens: 0,
      truncated: false,
      bytes: Buffer.alloc(4)
    })
    mocks.measureAttachmentTokens.mockResolvedValue(1236)
    mocks.watchMedia.mockResolvedValue({
      status: 'ok',
      digest: digestFor(),
      promptTokens: 900,
      calls: 1,
      watchMs: 2000
    })

    await prepareTurnMedia(
      input([
        {
          url: 'https://v.redd.it/abc/DASH_240.mp4',
          contentType: 'video/mp4',
          size: 892_001,
          durationSec: 12,
          silent: true
        }
      ])
    )

    expect(mocks.watchMedia.mock.calls[0][0].source).toMatchObject({ transport: 'inline', silent: true })
  })
})

describe('remembering watched media in a server', () => {
  const scope = { guildId: 'guild-1', channelId: 'c1', messageId: 'trigger-1', userId: 'asker-1' }
  const youtube = {
    url: 'https://www.youtube.com/watch?v=abc',
    contentType: 'video/mp4',
    transport: 'uri' as const,
    durationSec: 60,
    origin: 'link' as const,
    sourceAuthorId: null,
    contentKey: 'youtube:abc'
  }
  const stored = (digest: MediaDigest) => ({
    id: 7,
    guildId: 'guild-1',
    contentKey: 'youtube:abc',
    kind: 'video',
    label: 'YouTube video',
    summary: digest.observations.summary,
    digestJson: JSON.stringify(digest),
    embedding: null,
    createdAt: 1,
    lastSharedAt: 1
  })

  beforeEach(() => {
    mocks.embedEpisodeText.mockResolvedValue(new Array(768).fill(0.1))
  })

  it('reuses a digest already watched in this server without watching again', async () => {
    const digest = digestFor({ label: 'YouTube video' })
    mocks.findMediaDigest.mockReturnValue(stored(digest))

    const result = await prepareTurnMedia({ ...input([youtube]), memoryScope: scope })

    expect(mocks.findMediaDigest).toHaveBeenCalledWith('guild-1', 'youtube:abc')
    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(result.watcherCalls).toBe(0)
    expect(result.mediaTextParts[0].text).toContain('A man at a zoo talks about elephants.')
    expect(mocks.recordMediaOccurrence).toHaveBeenCalledWith({
      digestId: 7,
      guildId: 'guild-1',
      channelId: 'c1',
      messageId: 'trigger-1',
      sharedByUserId: 'asker-1',
      sourceAuthorId: null,
      origin: 'link'
    })
  })

  it('watches again rather than reuse a stored skim that a later share could watch in two halves', async () => {
    mocks.findMediaDigest.mockReturnValue(
      stored(digestFor({ mode: 'skim', durationSec: 1800, label: 'YouTube video' }))
    )
    mocks.watchMedia.mockImplementation(async (call) => watchedHalf(call))

    const result = await prepareTurnMedia({ ...input([{ ...youtube, durationSec: 1800 }]), memoryScope: scope })

    expect(mocks.watchMedia).toHaveBeenCalledTimes(2)
    expect(result.digests[0]).toMatchObject({ mode: 'halves' })
  })

  it('reuses a stored skim of a video too long for halves at the estimated-duration budget', async () => {
    mocks.findMediaDigest.mockReturnValue(
      stored(digestFor({ mode: 'skim', durationSec: 2350, label: 'YouTube video' }))
    )

    await prepareTurnMedia({ ...input([{ ...youtube, durationSec: 2350 }]), memoryScope: scope })

    expect(mocks.watchMedia).not.toHaveBeenCalled()
  })

  it('reuses a stored skim of a video too short for halves', async () => {
    mocks.findMediaDigest.mockReturnValue(
      stored(digestFor({ mode: 'skim', durationSec: 1150, label: 'YouTube video' }))
    )

    await prepareTurnMedia({ ...input([{ ...youtube, durationSec: 1150 }]), memoryScope: scope })

    expect(mocks.watchMedia).not.toHaveBeenCalled()
  })

  it('serves a remembered digest even while watching is unavailable', async () => {
    mocks.findMediaDigest.mockReturnValue(stored(digestFor()))

    const result = await prepareTurnMedia({ ...input([youtube]), memoryScope: scope, geminiUnavailable: true })

    expect(result.mediaTextParts[0].text).toContain('A man at a zoo talks about elephants.')
    expect(result.watchOutcome).toEqual({ status: 'remembered', kind: 'video' })
  })

  it('saves, records and embeds a newly watched item', async () => {
    const digest = digestFor({ label: 'YouTube video' })
    mocks.findMediaDigest.mockReturnValue(null)
    mocks.watchMedia.mockResolvedValue(okWatch(digest))
    mocks.saveMediaDigest.mockReturnValue(stored(digest))

    const result = await prepareTurnMedia({ ...input([youtube]), memoryScope: scope })
    await new Promise((resolve) => setImmediate(resolve))

    expect(result.watchOutcome).toEqual({ status: 'watched', kind: 'video', coverage: 'whole', durationSec: 19 })

    expect(mocks.saveMediaDigest).toHaveBeenCalledWith({
      guildId: 'guild-1',
      contentKey: 'youtube:abc',
      kind: 'video',
      label: 'YouTube video',
      summary: 'A man at a zoo talks about elephants.',
      digestJson: JSON.stringify(digest)
    })
    expect(mocks.recordMediaOccurrence).toHaveBeenCalledWith(expect.objectContaining({ digestId: 7, origin: 'link' }))
    expect(mocks.embedEpisodeText).toHaveBeenCalledWith({
      text: 'A man at a zoo talks about elephants.',
      role: 'RETRIEVAL_DOCUMENT'
    })
    expect(mocks.setMediaDigestEmbedding).toHaveBeenCalledWith({
      guildId: 'guild-1',
      id: 7,
      summary: 'A man at a zoo talks about elephants.',
      embedding: expect.any(Array)
    })
  })

  it.each([
    ['only its opening was watched', { mode: 'opening' as const }],
    ['some of its notes were unreadable', { incomplete: true }]
  ])('watches again when the remembered digest is partial because %s', async (_reason, partial) => {
    mocks.findMediaDigest.mockReturnValue(stored(digestFor(partial)))
    mocks.watchMedia.mockResolvedValue(
      okWatch(digestFor({ observations: { ...digestFor().observations, summary: 'Fresh.' } }))
    )

    const result = await prepareTurnMedia({ ...input([youtube]), memoryScope: scope })

    expect(mocks.watchMedia).toHaveBeenCalledTimes(1)
    expect(result.mediaTextParts[0].text).toContain('Fresh.')
  })

  it('watches again instead of failing the turn when a remembered digest no longer renders', async () => {
    const malformed = {
      ...stored(digestFor()),
      digestJson: JSON.stringify({ ...digestFor(), timeline: undefined, observations: { summary: 'Old.' } })
    }
    mocks.findMediaDigest.mockReturnValue(malformed)
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor()))

    const result = await prepareTurnMedia({ ...input([youtube]), memoryScope: scope })

    expect(mocks.watchMedia).toHaveBeenCalledTimes(1)
    expect(result.mediaTextParts[0].text).toContain('A man at a zoo talks about elephants.')
  })

  it('keys a re-uploaded file by its bytes and credits the replied-to author', async () => {
    const voice = {
      url: 'https://cdn.discordapp.com/v.ogg',
      contentType: 'audio/ogg',
      size: 300,
      durationSec: 5,
      origin: 'reply' as const,
      sourceMessageId: 'reference-1',
      sourceAuthorId: 'poster-1'
    }
    mocks.downloadAttachment.mockResolvedValue({
      data: 'b64',
      mimeType: 'audio/ogg',
      tokens: 0,
      truncated: false,
      bytes: Buffer.from('same bytes')
    })
    mocks.findMediaDigest.mockReturnValue(stored(digestFor({ kind: 'audio', label: 'voice message' })))

    await prepareTurnMedia({ ...input([voice]), memoryScope: scope })

    expect(mocks.findMediaDigest.mock.calls[0][1]).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(mocks.recordMediaOccurrence).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'reference-1', sourceAuthorId: 'poster-1', origin: 'reply' })
    )
  })

  it('remembers nothing outside a server', async () => {
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor()))

    await prepareTurnMedia({ ...input([youtube]), memoryScope: null })

    expect(mocks.findMediaDigest).not.toHaveBeenCalled()
    expect(mocks.saveMediaDigest).not.toHaveBeenCalled()
  })

  it('still answers from a fresh watch when the store fails', async () => {
    mocks.findMediaDigest.mockImplementation(() => {
      throw new Error('database is locked')
    })
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor()))
    mocks.saveMediaDigest.mockImplementation(() => {
      throw new Error('database is locked')
    })

    const result = await prepareTurnMedia({ ...input([youtube]), memoryScope: scope })

    expect(result.mediaTextParts[0].text).toContain('A man at a zoo talks about elephants.')
  })
})

const MB = 1024 * 1024
const bigUpload = (overrides: Partial<ImageAttachment> = {}): ImageAttachment => ({
  url: 'https://cdn.discordapp.com/attachments/1/2/v.mp4?ex=65f&hm=abc',
  contentType: 'video/mp4',
  size: 20 * MB,
  ...overrides
})
const uploaded = (
  overrides: Partial<{ name: string; uri: string; mimeType: string; durationSec: number | null }> = {}
) => ({
  name: 'files/abc',
  uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc',
  mimeType: 'video/mp4',
  durationSec: 120,
  ...overrides
})

describe('uploads too big to buffer', () => {
  it('streams a 20 MB MP4 into Files and watches it whole', async () => {
    mocks.streamToFiles.mockResolvedValue(uploaded())
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor()))

    const result = await prepareTurnMedia(input([bigUpload()]))

    expect(mocks.downloadAttachment).not.toHaveBeenCalled()
    expect(mocks.streamToFiles).toHaveBeenCalledWith({
      sourceUrl: bigUpload().url,
      mimeType: 'video/mp4',
      size: 20 * MB,
      deadlineMs: 45_000
    })
    const call = mocks.watchMedia.mock.calls[0][0]
    expect(call.source).toEqual({
      transport: 'files',
      kind: 'video',
      fileUri: uploaded().uri,
      mimeType: 'video/mp4',
      label: 'video'
    })
    expect(call.plan).toMatchObject({ mode: 'whole', durationSec: 120, fps: 1 })
    expect(call.opening).toBe(false)
    expect(result.truncatedAttachments).toBe(0)
    expect(result.digests).toHaveLength(1)
    expect(mocks.deleteFile).toHaveBeenCalledWith('files/abc')
  })

  it('counts the length of a video Files cannot state, from its own URI', async () => {
    mocks.streamToFiles.mockResolvedValue(uploaded({ durationSec: null }))
    mocks.countUriTokens.mockResolvedValue(Math.round(120 * 35.3))
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor()))

    await prepareTurnMedia(input([bigUpload()]))

    expect(mocks.countUriTokens).toHaveBeenCalledWith(uploaded().uri, 0.05, 'video/mp4')
    expect(mocks.watchMedia.mock.calls[0][0].plan).toMatchObject({ mode: 'whole' })
  })

  it('counts the length of an audio upload as audio, from its own URI', async () => {
    mocks.streamToFiles.mockResolvedValue(uploaded({ mimeType: 'audio/mp3', durationSec: null }))
    mocks.countUriTokens.mockResolvedValue(3200)
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor({ kind: 'audio', fps: null })))

    await prepareTurnMedia(input([bigUpload({ contentType: 'audio/mpeg' })]))

    expect(mocks.countUriTokens).toHaveBeenCalledWith(uploaded().uri, 0.05, 'audio/mp3')
    expect(mocks.watchMedia.mock.calls[0][0].plan).toMatchObject({ mode: 'whole', kind: 'audio', durationSec: 100 })
  })

  it('counts an upload that fails to stream as dropped, without watching it', async () => {
    mocks.streamToFiles.mockResolvedValue(null)

    const result = await prepareTurnMedia(input([bigUpload()]))

    expect(result.droppedAttachments).toBe(1)
    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(mocks.deleteFile).not.toHaveBeenCalled()
  })

  it('deletes the upload when its plan declines it', async () => {
    // Audio cannot skim, so a clip too long to watch whole is declined rather than cut down.
    mocks.streamToFiles.mockResolvedValue(uploaded({ mimeType: 'audio/mp3', durationSec: 2700 }))

    const result = await prepareTurnMedia(input([bigUpload({ contentType: 'audio/mpeg' })]))

    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(result.mediaTextParts[0].text).toBe(
      '[An audio clip was shared, but at about 45:00 it is too long to watch in one go.]'
    )
    expect(mocks.deleteFile).toHaveBeenCalledWith('files/abc')
  })

  it('deletes the upload when its watch fails', async () => {
    mocks.streamToFiles.mockResolvedValue(uploaded())
    mocks.watchMedia.mockResolvedValue({ status: 'failed', reason: 'timeout', calls: 1, watchMs: 20_000 })

    const result = await prepareTurnMedia(input([bigUpload()]))

    expect(result.mediaTextParts[0].text).toBe("[A video was shared, but it couldn't be watched right now.]")
    expect(mocks.deleteFile).toHaveBeenCalledWith('files/abc')
  })

  it('deletes the upload even when its watch throws', async () => {
    mocks.streamToFiles.mockResolvedValue(uploaded())
    mocks.watchMedia.mockRejectedValue(new Error('socket hang up'))

    await expect(prepareTurnMedia(input([bigUpload()]))).rejects.toThrow('socket hang up')
    expect(mocks.deleteFile).toHaveBeenCalledWith('files/abc')
  })

  it('keeps an upload within the inline cap on the inline path', async () => {
    mocks.downloadAttachment.mockResolvedValue({
      data: 'b64',
      mimeType: 'video/mp4',
      tokens: 0,
      truncated: false,
      bytes: mp4WithDuration(19)
    })
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor()))

    await prepareTurnMedia(input([bigUpload({ size: 10 * MB })]))

    expect(mocks.streamToFiles).not.toHaveBeenCalled()
    expect(mocks.downloadAttachment).toHaveBeenCalled()
  })

  it('keeps an upload above the streaming limit on the inline opening path', async () => {
    const header = mp4WithDuration(200)
    mocks.downloadAttachment.mockResolvedValue({
      data: 'b64',
      mimeType: 'video/mp4',
      tokens: 0,
      truncated: true,
      bytes: Buffer.concat([header, Buffer.alloc(10_000 - header.length)])
    })
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor({ mode: 'opening' })))

    await prepareTurnMedia(input([bigUpload({ size: 60 * MB })]))

    expect(mocks.streamToFiles).not.toHaveBeenCalled()
    expect(mocks.watchMedia.mock.calls[0][0].opening).toBe(true)
  })
})

describe('remembering streamed uploads in a server', () => {
  const scope = { guildId: 'guild-1', channelId: 'c1', messageId: 'trigger-1', userId: 'asker-1' }
  const key = 'discord:/attachments/1/2/v.mp4'

  beforeEach(() => {
    mocks.embedEpisodeText.mockResolvedValue(new Array(768).fill(0.1))
  })

  it('keeps no memory of a streamed file from outside Discord, whose path alone names nothing', async () => {
    mocks.streamToFiles.mockResolvedValue(uploaded())
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor()))

    await prepareTurnMedia({
      ...input([bigUpload({ url: 'https://media.example.com/attachments/1/2/v.mp4' })]),
      memoryScope: scope
    })

    expect(mocks.findMediaDigest).not.toHaveBeenCalled()
    expect(mocks.saveMediaDigest).not.toHaveBeenCalled()
  })

  it('reuses a remembered upload without uploading it again', async () => {
    const digest = digestFor({ label: 'video' })
    mocks.findMediaDigest.mockReturnValue({
      id: 9,
      guildId: 'guild-1',
      contentKey: key,
      kind: 'video',
      label: 'video',
      summary: digest.observations.summary,
      digestJson: JSON.stringify(digest),
      embedding: null,
      createdAt: 1,
      lastSharedAt: 1
    })

    const result = await prepareTurnMedia({ ...input([bigUpload()]), memoryScope: scope })

    expect(mocks.findMediaDigest).toHaveBeenCalledWith('guild-1', key)
    expect(mocks.streamToFiles).not.toHaveBeenCalled()
    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(result.mediaTextParts[0].text).toContain('A man at a zoo talks about elephants.')
  })

  it('saves a streamed watch under its Discord path key', async () => {
    mocks.findMediaDigest.mockReturnValue(null)
    mocks.streamToFiles.mockResolvedValue(uploaded())
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor()))

    await prepareTurnMedia({ ...input([bigUpload()]), memoryScope: scope })

    expect(mocks.saveMediaDigest).toHaveBeenCalledWith(expect.objectContaining({ guildId: 'guild-1', contentKey: key }))
    expect(mocks.deleteFile).toHaveBeenCalledWith('files/abc')
  })
})

describe('watching a 20 to 40 minute video in two halves', () => {
  const longLink = { url: 'https://www.youtube.com/watch?v=long', contentType: 'video/mp4', transport: 'uri' as const }
  // Counts to 35 minutes at the 0.05 fps the duration estimate uses, so the halves get the headroom-reduced budget.
  const countedAs35Minutes = Math.round(2100 * 35.3)

  it('watches a 35 minute YouTube video whole in two parallel halves and merges them into one digest', async () => {
    mocks.countUriTokens.mockResolvedValue(countedAs35Minutes)
    let started = 0
    let bothStarted!: () => void
    const bothStartedSignal = new Promise<void>((resolve) => {
      bothStarted = resolve
    })
    mocks.watchMedia.mockImplementation(async (call) => {
      started += 1
      if (started === 2) bothStarted()
      await bothStartedSignal
      return watchedHalf(call)
    })

    const result = await prepareTurnMedia(input([longLink]))

    expect(mocks.watchMedia).toHaveBeenCalledTimes(2)
    const [first, second] = mocks.watchMedia.mock.calls.map(([call]) => call)
    expect(first.source).toMatchObject({ transport: 'uri', fileUri: longLink.url })
    expect(first.plan).toMatchObject({ mode: 'whole', fps: 0.05 })
    expect(first.window).toEqual({ startSec: 0, endSec: 1050 })
    expect(second.window).toEqual({ startSec: 1050, endSec: 2100, openEnd: true })
    expect(first.mayRetry()).toBe(false)
    expect(second.mayRetry()).toBe(false)

    expect(result.watcherCalls).toBe(2)
    expect(result.mediaTokens).toBe(2 * 1676)
    expect(result.digests).toHaveLength(1)
    expect(result.digests[0]).toMatchObject({ mode: 'halves', fps: 0.05 })
    expect(result.digests[0].bins).toHaveLength(16)
    expect(result.digests[0].bins[8]).toEqual({ startSec: 1050, endSec: 1181 })
    expect(result.mediaTextParts).toHaveLength(1)
    expect(result.mediaTextParts[0].text).toContain('whole video in two halves, 35:00, a frame every 20 s, full sound]')
  })

  it('skims the same video when the minute cannot afford two halves', async () => {
    mocks.countUriTokens.mockResolvedValue(countedAs35Minutes)
    mocks.remainingTokensThisMinute.mockReturnValue(80_000)
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor({ mode: 'skim', label: 'YouTube video' })))

    const result = await prepareTurnMedia(input([longLink]))

    expect(mocks.watchMedia).toHaveBeenCalledTimes(1)
    expect(mocks.watchMedia.mock.calls[0][0].plan).toMatchObject({ mode: 'skim' })
    expect(result.watcherCalls).toBe(1)
  })

  it('skims instead of splitting when the turn could not leave Gemini two calls after the watches', async () => {
    mocks.countUriTokens.mockResolvedValue(countedAs35Minutes)
    mocks.maxLlmCalls = 3
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor({ mode: 'skim', label: 'YouTube video' })))

    await prepareTurnMedia(input([longLink]))

    expect(mocks.watchMedia).toHaveBeenCalledTimes(1)
    expect(mocks.watchMedia.mock.calls[0][0].plan).toMatchObject({ mode: 'skim' })
  })

  it('keeps the half that was watched and says the other could not be watched', async () => {
    mocks.countUriTokens.mockResolvedValue(countedAs35Minutes)
    mocks.watchMedia.mockImplementation(async (call) =>
      call.window.startSec === 0
        ? { status: 'failed', reason: 'timeout', calls: 1, watchMs: 20_000 }
        : watchedHalf(call)
    )

    const result = await prepareTurnMedia(input([longLink]))

    expect(result.watcherCalls).toBe(2)
    // The timed-out half may have been billed in full, so it is charged its planned estimate.
    expect(result.mediaTokens).toBe(1676 + 41105)
    expect(result.digests[0]).toMatchObject({ mode: 'halves', incomplete: true })
    expect(result.digests[0].bins).toHaveLength(8)
    expect(result.digests[0].observations.uncertainties).toEqual(['The other half of the video could not be watched.'])
    expect(result.mediaTextParts).toHaveLength(1)
  })

  it('says the video could not be watched when both halves fail', async () => {
    mocks.countUriTokens.mockResolvedValue(countedAs35Minutes)
    mocks.watchMedia.mockResolvedValue({ status: 'failed', reason: 'overloaded', calls: 1, watchMs: 300 })

    const result = await prepareTurnMedia(input([longLink]))

    expect(result.watcherCalls).toBe(2)
    expect(result.digests).toEqual([])
    expect(result.mediaTextParts[0].text).toBe("[A YouTube video was shared, but it couldn't be watched right now.]")
  })

  it('watches a 35 minute upload in two halves and deletes the upload afterwards', async () => {
    mocks.streamToFiles.mockResolvedValue(uploaded({ durationSec: 2100 }))
    mocks.watchMedia.mockImplementation(async (call) => watchedHalf(call))

    const result = await prepareTurnMedia(input([bigUpload()]))

    expect(mocks.watchMedia).toHaveBeenCalledTimes(2)
    expect(mocks.watchMedia.mock.calls[0][0].source).toMatchObject({ transport: 'files' })
    expect(mocks.watchMedia.mock.calls[0][0].plan).toMatchObject({ mode: 'whole', fps: 0.1 })
    expect(result.mediaTextParts[0].text).toContain('whole video in two halves, 35:00, a frame every 10 s, full sound]')
    expect(mocks.deleteFile).toHaveBeenCalledWith('files/abc')
  })
})

// Qwen watches from sampled frames on ModelScope; whichever of the two is not configured as the watcher is the backup.
describe('the qwen watcher', () => {
  const upload = { url: 'https://cdn.discordapp.com/clip.mp4', contentType: 'video/mp4', size: 300, durationSec: 40 }
  const youtube = {
    url: 'https://www.youtube.com/watch?v=abc',
    contentType: 'video/mp4',
    transport: 'uri' as const,
    origin: 'link' as const,
    sourceAuthorId: null,
    contentKey: 'youtube:abc'
  }
  const qwenDigest = (overrides: Partial<MediaDigest> = {}): MediaDigest =>
    digestFor({ fps: null, frames: 4, heard: 'none', durationSec: 40, ...overrides })

  beforeEach(() => {
    mocks.qwenKey = 'ms-key'
    mocks.extractFrames.mockImplementation(async (_source: unknown, timestamps: number[]) =>
      timestamps.map((atSec) => ({ atSec, jpeg: Buffer.from([0xff, 0xd8]) }))
    )
    mocks.probeDurationSec.mockResolvedValue(40)
    mocks.watchFramesWithQwen.mockResolvedValue({ status: 'ok', digest: qwenDigest(), watchMs: 6000 })
  })

  it('falls back to Qwen frames when the Gemini watch fails', async () => {
    mocks.downloadAttachment.mockResolvedValue({
      data: 'b64',
      mimeType: 'video/mp4',
      tokens: 0,
      truncated: false,
      bytes: Buffer.alloc(4)
    })
    mocks.watchMedia.mockResolvedValue({ status: 'failed', reason: 'overloaded', calls: 1, watchMs: 2000 })

    const result = await prepareTurnMedia(input([upload]))

    expect(mocks.extractFrames).toHaveBeenCalledWith(
      { input: 'https://cdn.discordapp.com/clip.mp4', headers: null },
      [5, 15, 25, 35],
      expect.objectContaining({ height: 360 })
    )
    expect(result.mediaTextParts).toHaveLength(1)
    expect(result.mediaTextParts[0].text).toContain('4 frames, no sound heard')
    expect(result.mediaTextParts[0].text).not.toContain("couldn't be watched")
    expect(result.watchOutcome).toMatchObject({ status: 'watched', heard: 'none' })
    expect(result.watcherCalls).toBe(1)
  })

  it('watches a YouTube link with Qwen first when it is the configured watcher, naming things from the title', async () => {
    mocks.watcher = 'qwen'
    mocks.resolveYouTubeStreams.mockResolvedValue({
      durationSec: 186,
      title: 'Castorice as Aeon Aha',
      description: 'Model swap',
      video: { url: 'https://rr1.googlevideo.com/v', headers: { 'User-Agent': 'x' } },
      audio: null
    })

    await prepareTurnMedia(input([youtube]))

    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(mocks.countUriTokens).not.toHaveBeenCalled()
    expect(mocks.resolveYouTubeStreams).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc')
    expect(mocks.extractFrames.mock.calls[0][0]).toEqual({
      input: 'https://rr1.googlevideo.com/v',
      headers: { 'User-Agent': 'x' }
    })
    expect(mocks.watchFramesWithQwen.mock.calls[0][0]).toMatchObject({
      durationSec: 186,
      mode: 'whole',
      label: 'YouTube video',
      context: 'Castorice as Aeon Aha — Model swap'
    })
    expect(mocks.watchFramesWithQwen.mock.calls[0][1]).toMatchObject({ apiKey: 'ms-key', model: 'Qwen/test' })
  })

  it('watches around a YouTube timestamp with Qwen', async () => {
    mocks.watcher = 'qwen'
    mocks.resolveYouTubeStreams.mockResolvedValue({
      durationSec: 1800,
      title: '',
      description: '',
      video: { url: 'https://rr1.googlevideo.com/v', headers: null },
      audio: null
    })

    await prepareTurnMedia(input([{ ...youtube, startSec: 600 }]))

    expect(mocks.watchFramesWithQwen.mock.calls[0][0]).toMatchObject({
      mode: 'focus',
      focusSec: 600,
      bins: [
        { startSec: 570, endSec: 600 },
        { startSec: 600, endSec: 630 },
        { startSec: 630, endSec: 660 },
        { startSec: 660, endSec: 690 }
      ]
    })
  })

  it('falls back to Gemini when the Qwen watch fails', async () => {
    mocks.watcher = 'qwen'
    mocks.watchFramesWithQwen.mockResolvedValue({ status: 'failed', reason: 'overloaded', watchMs: 1000 })
    mocks.downloadAttachment.mockResolvedValue({
      data: 'b64',
      mimeType: 'video/mp4',
      tokens: 0,
      truncated: false,
      bytes: Buffer.alloc(4)
    })
    mocks.watchMedia.mockResolvedValue(okWatch(digestFor()))

    const result = await prepareTurnMedia(input([upload]))

    expect(mocks.watchMedia).toHaveBeenCalledTimes(1)
    expect(result.watchOutcome).toMatchObject({ status: 'watched', coverage: 'whole' })
    expect(result.watchOutcome).not.toHaveProperty('heard')
  })

  it('watches with Qwen while turns are pinned to the fallback model instead of skipping the video', async () => {
    const result = await prepareTurnMedia({ ...input([upload]), geminiUnavailable: true })

    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(mocks.watchFramesWithQwen).toHaveBeenCalledTimes(1)
    expect(result.mediaTextParts[0].text).not.toContain("couldn't be watched")
  })

  it('gives the notice when neither can watch: an audio clip while Gemini is unavailable', async () => {
    const voice = { url: 'https://cdn.discordapp.com/v.ogg', contentType: 'audio/ogg', size: 300, durationSec: 5 }

    const result = await prepareTurnMedia({ ...input([voice]), geminiUnavailable: true })

    expect(mocks.watchFramesWithQwen).not.toHaveBeenCalled()
    expect(result.mediaTextParts[0].text).toBe("[A voice message was shared, but it couldn't be watched right now.]")
    expect(result.watchOutcome).toEqual({ status: 'failed', kind: 'audio' })
  })

  it('fails over when too few frames could be taken', async () => {
    mocks.extractFrames.mockImplementation(async (_source: unknown, timestamps: number[]) => [
      { atSec: timestamps[0], jpeg: Buffer.from([0xff, 0xd8]) }
    ])

    const result = await prepareTurnMedia({ ...input([upload]), geminiUnavailable: true })

    expect(mocks.watchFramesWithQwen).not.toHaveBeenCalled()
    expect(result.mediaTextParts[0].text).toBe("[A video was shared, but it couldn't be watched right now.]")
  })

  it('does not remember a frame watch that heard nothing', async () => {
    const scope = { guildId: 'guild-1', channelId: 'c1', messageId: 'trigger-1', userId: 'asker-1' }
    mocks.findMediaDigest.mockReturnValue(null)

    await prepareTurnMedia({
      ...input([{ ...upload, contentKey: 'post:x:1:0' }]),
      memoryScope: scope,
      geminiUnavailable: true
    })

    expect(mocks.watchFramesWithQwen).toHaveBeenCalledTimes(1)
    expect(mocks.saveMediaDigest).not.toHaveBeenCalled()
  })
})
