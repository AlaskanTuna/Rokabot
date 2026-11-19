import sharp from 'sharp'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MAX_IMAGE_SIZE_BYTES } from '../attachmentLimits.js'
import { downloadAttachment, prepareAttachments } from '../attachments.js'

let png: Buffer
let gif: Buffer

beforeAll(async () => {
  png = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toBuffer()
  gif = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .gif()
    .toBuffer()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function mediaResponse(buffer: Buffer, contentType: string): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: { 'content-type': contentType, 'content-length': String(buffer.length) }
  })
}

function imageResponse(): Response {
  return mediaResponse(png, 'image/png')
}

function largeGif(): Buffer {
  return Buffer.concat([gif, Buffer.alloc(9_800_000 - gif.length)])
}

const oversized = MAX_IMAGE_SIZE_BYTES * 2

describe('downloadAttachment', () => {
  it('downloads a proxy-resized image even when the original is over the image cap', async () => {
    const fetch = vi.fn().mockResolvedValue(imageResponse())
    vi.stubGlobal('fetch', fetch)

    const result = await downloadAttachment({
      url: 'https://media.discordapp.net/attachments/1/2/big.png?width=472&height=1024',
      contentType: 'image/png',
      size: oversized,
      proxyResized: true
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(result?.mimeType).toBe('image/jpeg')
  })

  it('still refuses an oversized image the proxy did not resize, without downloading it', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    const result = await downloadAttachment({
      url: 'https://cdn.test/big.png',
      contentType: 'image/png',
      size: oversized
    })

    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('downloads a 9.8 MB GIF above the regular image limit', async () => {
    const bytes = largeGif()
    const fetch = vi.fn().mockResolvedValue(mediaResponse(bytes, 'image/gif'))
    vi.stubGlobal('fetch', fetch)

    const result = await downloadAttachment({
      url: 'https://cdn.test/large.gif',
      contentType: 'image/gif',
      size: bytes.length
    })

    expect(result?.mimeType).toBe('image/jpeg')
    expect(result?.data.length).toBeLessThan(bytes.length)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('refuses GIFs larger than 16 MiB without downloading them', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    const result = await downloadAttachment({
      url: 'https://cdn.test/too-large.gif',
      contentType: 'image/gif',
      size: 16_777_217
    })

    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('drops AVIF bytes when the embed declares PNG', async () => {
    const avif = Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from('ftypavif'), Buffer.alloc(8)])
    const fetch = vi.fn().mockResolvedValue(mediaResponse(avif, 'image/png'))
    vi.stubGlobal('fetch', fetch)

    const result = await downloadAttachment({ url: 'https://cdn.test/mislabeled.png', contentType: 'image/png' })

    expect(result).toBeNull()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('processes GIF downloads one at a time', async () => {
    let releaseFirst!: (response: Response) => void
    const firstResponse = new Promise<Response>((resolve) => {
      releaseFirst = resolve
    })
    const fetch = vi.fn().mockReturnValueOnce(firstResponse).mockResolvedValue(mediaResponse(gif, 'image/gif'))
    vi.stubGlobal('fetch', fetch)

    const pending = prepareAttachments('channel', [
      { url: 'https://cdn.test/first.gif', contentType: 'image/gif', size: gif.length },
      { url: 'https://cdn.test/second.gif', contentType: 'image/gif', size: gif.length }
    ])
    await Promise.resolve()
    const fetchesBeforeFirstCompletes = fetch.mock.calls.length
    releaseFirst(mediaResponse(gif, 'image/gif'))

    await pending

    expect(fetchesBeforeFirstCompletes).toBe(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('tries once more after the connection drops', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue(imageResponse())
    vi.stubGlobal('fetch', fetch)

    const pending = downloadAttachment({ url: 'https://cdn.test/a.png', contentType: 'image/png', size: png.length })
    await vi.runAllTimersAsync()

    expect((await pending)?.mimeType).toBe('image/jpeg')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up after the second dropped connection', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetch)

    const pending = downloadAttachment({ url: 'https://cdn.test/a.png', contentType: 'image/png', size: png.length })
    await vi.runAllTimersAsync()

    expect(await pending).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry a timeout, which would only spend the same wait again', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    vi.stubGlobal('fetch', fetch)

    expect(await downloadAttachment({ url: 'https://cdn.test/a.png', contentType: 'image/png' })).toBeNull()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('does not retry a refusal from the host', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetch)

    expect(await downloadAttachment({ url: 'https://cdn.test/a.png', contentType: 'image/png' })).toBeNull()
    expect(fetch).toHaveBeenCalledOnce()
  })
})
