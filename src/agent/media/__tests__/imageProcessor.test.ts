import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { GEMINI_IMAGE_TOKENS, processImageForGemini } from '../imageProcessor.js'

async function processSupportedImage(buffer: Buffer, mimeType: string) {
  const result = await processImageForGemini(buffer, mimeType)
  if (!result) throw new Error('Expected image processing to return image data')
  return result
}

describe('GEMINI_IMAGE_TOKENS', () => {
  // Measured with countTokens against gemini-3.5-flash-lite on 2026-08-19 (#121). Pinned as a literal
  // because the number is an external fact about the model, not something the code derives: 64x64,
  // 384x384, 512x512 and 1024x1024 all came back at exactly this, which is why no size or aspect-ratio
  // term survives here. An earlier 258-per-tile estimate from older Gemini docs was refuted by that run.
  it('is the measured flat per-image rate', () => {
    expect(GEMINI_IMAGE_TOKENS).toBe(1089)
  })
})

describe('processImageForGemini', () => {
  it('outputs JPEG', async () => {
    const large = await sharp({
      create: { width: 2000, height: 1500, channels: 3, background: { r: 128, g: 64, b: 200 } }
    })
      .png()
      .toBuffer()

    const result = await processSupportedImage(large, 'image/png')

    expect(result.mimeType).toBe('image/jpeg')
  })

  it('compresses below the source size', async () => {
    const large = await sharp({
      create: { width: 2000, height: 1500, channels: 3, background: { r: 128, g: 64, b: 200 } }
    })
      .png()
      .toBuffer()

    const result = await processSupportedImage(large, 'image/png')

    expect(result.data.length).toBeLessThan(large.length)
  })

  it('caps large images at 1024 on the longest side', async () => {
    const large = await sharp({
      create: { width: 2000, height: 1500, channels: 3, background: { r: 128, g: 64, b: 200 } }
    })
      .png()
      .toBuffer()

    const result = await processSupportedImage(large, 'image/png')
    const meta = await sharp(result.data).metadata()

    expect(meta.width ?? 0).toBeLessThanOrEqual(1024)
    expect(meta.height ?? 0).toBeLessThanOrEqual(1024)
  })

  it('upscales small images toward 512 on the shortest side', async () => {
    const small = await sharp({
      create: { width: 100, height: 80, channels: 3, background: { r: 50, g: 150, b: 50 } }
    })
      .png()
      .toBuffer()

    const result = await processSupportedImage(small, 'image/png')
    const meta = await sharp(result.data).metadata()

    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeGreaterThanOrEqual(512)
  })

  it('keeps normal images within 512 to 1024 wide', async () => {
    const normal = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 100, g: 100, b: 100 } }
    })
      .png()
      .toBuffer()

    const result = await processSupportedImage(normal, 'image/png')
    const meta = await sharp(result.data).metadata()

    expect(meta.width ?? 0).toBeGreaterThanOrEqual(512)
    expect(meta.width ?? 0).toBeLessThanOrEqual(1024)
  })

  it('preserves malformed PNG bytes with the PNG MIME type', async () => {
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('garbage')])

    const result = await processSupportedImage(png, 'image/jpeg')

    expect(result.data).toEqual(png)
    expect(result.mimeType).toBe('image/png')
  })

  it('preserves malformed WebP bytes with the WebP MIME type', async () => {
    const webp = Buffer.concat([Buffer.from('RIFFxxxxWEBP'), Buffer.from('garbage')])

    const result = await processSupportedImage(webp, 'image/jpeg')

    expect(result.data).toEqual(webp)
    expect(result.mimeType).toBe('image/webp')
  })

  it('preserves malformed GIF bytes with the GIF MIME type', async () => {
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.from('garbage')])

    const result = await processSupportedImage(gif, 'image/jpeg')

    expect(result.data).toEqual(gif)
    expect(result.mimeType).toBe('image/gif')
  })

  it('drops AVIF bytes when the embed declares PNG', async () => {
    const avif = Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from('ftypavif'), Buffer.alloc(8)])

    const result = await processImageForGemini(avif, 'image/png')

    expect(result).toBeNull()
  })
})
