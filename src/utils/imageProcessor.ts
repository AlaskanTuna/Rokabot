import { GEMINI_IMAGE_TOKENS } from '../agent/attachmentLimits.js'

// Re-exported for the callers that already read it from here. It now lives in attachmentLimits.ts, which
// imports nothing, so config.ts can read it without closing the imageProcessor -> logger -> config cycle.
export { GEMINI_IMAGE_TOKENS }
import sharp from 'sharp'
import { logger } from './logger.js'

const MAX_DIMENSION = 1024
const MIN_DIMENSION = 512
const JPEG_QUALITY = 80

/**
 * Process an image buffer for optimal Gemini vision input.
 * - Resize large images to max 1024px on longest side
 * - Upscale small images to min 512px on shortest side (lanczos3)
 * - Apply sharpening for clarity
 * - Normalize to sRGB color space
 * - Strip EXIF metadata
 * - Output as JPEG at 80% quality
 */
export async function processImageForGemini(buffer: Buffer): Promise<{ data: Buffer; mimeType: string }> {
  try {
    const metadata = await sharp(buffer).metadata()
    const width = metadata.width ?? 0
    const height = metadata.height ?? 0

    let pipeline = sharp(buffer)
      .rotate() // auto-rotate based on EXIF orientation
      .toColorspace('srgb')

    // Resize: cap at MAX_DIMENSION, upscale if below MIN_DIMENSION
    const longest = Math.max(width, height)
    const shortest = Math.min(width, height)

    if (longest > MAX_DIMENSION) {
      pipeline = pipeline.resize({
        width: width >= height ? MAX_DIMENSION : undefined,
        height: height > width ? MAX_DIMENSION : undefined,
        fit: 'inside',
        withoutEnlargement: true
      })
    } else if (shortest < MIN_DIMENSION && shortest > 0) {
      pipeline = pipeline.resize({
        width: width <= height ? MIN_DIMENSION : undefined,
        height: height < width ? MIN_DIMENSION : undefined,
        fit: 'outside',
        kernel: 'lanczos3'
      })
    }

    // Sharpen for clarity (especially after upscale)
    pipeline = pipeline.sharpen({ sigma: 1.0 })

    const result = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()

    logger.debug(
      { originalSize: buffer.length, processedSize: result.length, originalDimensions: `${width}x${height}` },
      'Image processed for Gemini'
    )

    return { data: result, mimeType: 'image/jpeg' }
  } catch (error) {
    logger.warn({ error }, 'Image processing failed, using original')
    return { data: buffer, mimeType: 'image/jpeg' }
  }
}
