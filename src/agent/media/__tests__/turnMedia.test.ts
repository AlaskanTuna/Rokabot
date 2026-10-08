import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaDigest } from '../types.js'

const mocks = vi.hoisted(() => ({
  watch: true,
  prepareAttachments: vi.fn(),
  downloadAttachment: vi.fn(),
  measureAttachmentTokens: vi.fn(),
  watchMedia: vi.fn(),
  countUriTokens: vi.fn()
}))

vi.mock('../../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    gemini: { maxAttachmentTokens: 50_000 },
    get media() {
      return { watch: mocks.watch, skimClips: 8, skimClipSeconds: 10 }
    }
  }
}))

vi.mock('../../attachments.js', () => ({
  prepareAttachments: mocks.prepareAttachments,
  downloadAttachment: mocks.downloadAttachment
}))

vi.mock('../../attachmentCost.js', () => ({ measureAttachmentTokens: mocks.measureAttachmentTokens }))

vi.mock('../watch.js', () => ({ watchMedia: mocks.watchMedia, countUriTokens: mocks.countUriTokens }))

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
    mocks.prepareAttachments,
    mocks.downloadAttachment,
    mocks.measureAttachmentTokens,
    mocks.watchMedia,
    mocks.countUriTokens
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

  it('says a refused source could not be opened', async () => {
    mocks.watchMedia.mockResolvedValue({ status: 'failed', reason: 'unavailable', calls: 1, watchMs: 900 })

    const result = await prepareTurnMedia(
      input([{ url: 'https://www.youtube.com/watch?v=p', contentType: 'video/mp4', transport: 'uri', durationSec: 60 }])
    )

    expect(result.mediaTextParts[0].text).toBe("[A YouTube video was shared, but it couldn't be opened.]")
  })
})
