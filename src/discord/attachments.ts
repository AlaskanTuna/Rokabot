/** Shared image-attachment policy for both surfaces Roka can be handed a file on. */

/** Types Gemini accepts and this bot forwards; anything else is unsupported and earns a nudge. */
export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

/** Per-turn ceiling. Both the mention path and /ask's option list derive their limit from this. */
export const MAX_IMAGE_ATTACHMENTS = 3

export function isSupportedImage(attachment: { contentType: string | null }): boolean {
  return attachment.contentType !== null && ALLOWED_IMAGE_TYPES.has(attachment.contentType)
}

/**
 * Discord has no multi-attachment option type, so /ask exposes one option per slot. The first keeps the
 * original name so existing usage still resolves; the rest are numbered.
 */
export function imageOptionName(index: number): string {
  return index === 0 ? 'image' : `image${index + 1}`
}
