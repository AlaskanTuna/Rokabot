import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageAttachment } from '../../attachments.js'
import type { MediaDigest } from '../types.js'

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
  deleteFile: vi.fn()
}))

vi.mock('../../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    gemini: { maxAttachmentTokens: 50_000 },
    get media() {
      return {
        watch: mocks.watch,
        skimClips: 8,
        skimClipSeconds: 10,
        watchTimeoutMs: 20_000,
        maxStreamedUploadBytes: 52_428_800
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

vi.mock('../../../storage/mediaDigestStore.js', () => ({
  findMediaDigest: mocks.findMediaDigest,
  saveMediaDigest: mocks.saveMediaDigest,
  recordMediaOccurrence: mocks.recordMediaOccurrence,
  setMediaDigestEmbedding: mocks.setMediaDigestEmbedding
}))

vi.mock('../../memory/episodeEmbeddings.js', () => ({ embedEpisodeText: mocks.embedEpisodeText }))

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
  for (const mock of [
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
    mocks.deleteFile
  ]) {
    mock.mockReset()
  }
  mocks.prepareAttachments.mockResolvedValue(emptyPrepared)
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

  it('serves a remembered digest even while watching is unavailable', async () => {
    mocks.findMediaDigest.mockReturnValue(stored(digestFor()))

    const result = await prepareTurnMedia({ ...input([youtube]), memoryScope: scope, geminiUnavailable: true })

    expect(result.mediaTextParts[0].text).toContain('A man at a zoo talks about elephants.')
  })

  it('saves, records and embeds a newly watched item', async () => {
    const digest = digestFor({ label: 'YouTube video' })
    mocks.findMediaDigest.mockReturnValue(null)
    mocks.watchMedia.mockResolvedValue(okWatch(digest))
    mocks.saveMediaDigest.mockReturnValue(stored(digest))

    await prepareTurnMedia({ ...input([youtube]), memoryScope: scope })
    await new Promise((resolve) => setImmediate(resolve))

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
      deadlineMs: 20_000
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
