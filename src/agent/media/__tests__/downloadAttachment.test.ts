import sharp from 'sharp'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MAX_IMAGE_SIZE_BYTES } from '../attachmentLimits.js'
import { downloadAttachment } from '../attachments.js'

let png: Buffer

beforeAll(async () => {
  png = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toBuffer()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function imageResponse(): Response {
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: { 'content-type': 'image/png', 'content-length': String(png.length) }
  })
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
