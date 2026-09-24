import type { Part } from '@google/genai'
import { config } from '../config.js'
import { GEMINI_IMAGE_TOKENS, processImageForGemini } from '../utils/imageProcessor.js'
import { logger } from '../utils/logger.js'
import { measureAttachmentTokens, needsMeasuring } from './attachmentCost.js'
import { geminiMimeType, sizeLimitFor } from './attachmentLimits.js'
import { isobmffAllowsPrefix, prefixPolicyFor } from './mediaPrefix.js'

export interface ImageAttachment {
  url: string
  contentType: string
  /** Bytes, when the source states them. Discord does on an upload; an embed or a resolved link does not. */
  size?: number
}

// Bounds stalled attachment hosts as well as oversized responses.
const ATTACHMENT_DOWNLOAD_TIMEOUT_MS = 15_000

export function attachmentMarker(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '(an image)'
  if (mimeType.startsWith('audio/')) return '(an audio clip)'
  if (mimeType.startsWith('video/')) return '(a video)'
  return '(a document)'
}

// Stream so missing or understated length headers cannot bypass the byte cap.
async function readWithinLimit(
  response: Response,
  limit: number,
  url: string,
  onOverflow: 'refuse' | 'truncate'
): Promise<Buffer | null> {
  if (!response.body) {
    logger.warn({ url }, 'Attachment response carried no readable body, skipping')
    return null
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  let chunk = await reader.read()
  while (!chunk.done) {
    const overflow = received + chunk.value.byteLength - limit
    if (overflow > 0) {
      // Preserve the allowed prefix when a server ignores Range and returns the full body.
      if (onOverflow === 'truncate') {
        chunks.push(chunk.value.subarray(0, chunk.value.byteLength - overflow))
        await reader.cancel()
        return Buffer.concat(chunks)
      }
      await reader.cancel()
      logger.warn({ url, received, limit }, 'Attachment passed its size limit mid-transfer, aborted')
      return null
    }
    received += chunk.value.byteLength
    chunks.push(chunk.value)
    chunk = await reader.read()
  }

  return Buffer.concat(chunks)
}

/** Download and normalize one attachment. */
async function downloadAttachment(
  attachment: ImageAttachment
): Promise<{ data: string; mimeType: string; tokens: number; truncated: boolean } | null> {
  const { url, contentType } = attachment
  // Keep media admission in Discord to avoid an agent-to-Discord dependency.
  const isImage = contentType.startsWith('image/')
  const limit = sizeLimitFor(contentType)

  // Missing source sizes never trigger prefix truncation.
  const policy = prefixPolicyFor(contentType)
  const wantsPrefix = attachment.size !== undefined && attachment.size > limit && policy !== 'none'

  if (attachment.size !== undefined && attachment.size > limit && policy === 'none') {
    logger.warn({ url, size: attachment.size, limit, contentType }, 'Oversized and not safely prefixable, refusing')
    return null
  }

  try {
    // Streaming enforces the cap when the CDN ignores Range and returns 200.
    const response = await fetch(url, {
      ...(wantsPrefix ? { headers: { Range: `bytes=0-${limit - 1}` } } : {}),
      signal: AbortSignal.timeout(ATTACHMENT_DOWNLOAD_TIMEOUT_MS)
    })
    if (!response.ok) {
      logger.warn({ url, status: response.status }, 'Failed to download attachment')
      return null
    }

    const contentLength = response.headers.get('content-length')
    if (!wantsPrefix && contentLength && parseInt(contentLength, 10) > limit) {
      logger.warn({ url, size: contentLength, limit }, 'Attachment exceeds its size limit, skipping')
      return null
    }

    const buffer = await readWithinLimit(response, limit, url, wantsPrefix ? 'truncate' : 'refuse')
    if (!buffer) return null

    // Refuse video prefixes without an early index so the model can decode them.
    if (wantsPrefix && policy === 'isobmff' && !isobmffAllowsPrefix(buffer)) {
      logger.warn({ url, contentType }, 'Oversized video has no index before its media data, refusing')
      return null
    }

    // Keep non-images byte-identical; Gemini expects MP3 under its own MIME spelling.
    if (!isImage) {
      return {
        data: buffer.toString('base64'),
        mimeType: geminiMimeType(contentType),
        tokens: 0,
        truncated: wantsPrefix
      }
    }

    const processed = await processImageForGemini(buffer)
    return {
      data: processed.data.toString('base64'),
      mimeType: processed.mimeType,
      tokens: GEMINI_IMAGE_TOKENS,
      truncated: wantsPrefix
    }
  } catch (error) {
    logger.warn({ url, error }, 'Error downloading attachment')
    return null
  }
}

export interface PreparedAttachments {
  imageParts: Part[]
  imageTokens: number
  droppedAttachments: number
  truncatedAttachments: number
  refusedAttachments: number
}

export async function prepareAttachments(
  channelId: string,
  imageAttachments?: ImageAttachment[]
): Promise<PreparedAttachments> {
  const imageParts: Part[] = []
  let imageTokens = 0
  let droppedAttachments = 0
  let truncatedAttachments = 0
  if (imageAttachments?.length) {
    const downloads = await Promise.all(imageAttachments.map((img) => downloadAttachment(img)))
    droppedAttachments = downloads.filter((result) => result === null).length
    truncatedAttachments = downloads.filter((result) => result?.truncated).length
    for (const result of downloads) {
      if (result) {
        imageParts.push({ inlineData: { data: result.data, mimeType: result.mimeType } })
        imageTokens += result.tokens
      }
    }
    if (imageParts.length > 0) {
      logger.debug({ imageCount: imageParts.length, imageTokens }, 'Attached images to request')
    }
  }

  // Images have a fixed cost below the ceiling, so only measure other media.
  let refusedAttachments = 0
  if (imageParts.length > 0 && needsMeasuring(imageParts)) {
    const measured = await measureAttachmentTokens(imageParts)
    if (measured !== undefined && measured > config.gemini.maxAttachmentTokens) {
      logger.info(
        { channelId, measured, ceiling: config.gemini.maxAttachmentTokens, count: imageParts.length },
        'Attachments cost more than one turn may spend, refusing them'
      )
      refusedAttachments = imageParts.length
      imageParts.length = 0
      imageTokens = 0
    } else if (measured !== undefined) {
      // Prefer the paid probe to the per-type estimate.
      imageTokens = measured
    }
  }

  return { imageParts, imageTokens, droppedAttachments, truncatedAttachments, refusedAttachments }
}
