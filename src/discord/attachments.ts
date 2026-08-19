import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
/** Shared image-attachment policy for both surfaces Roka can be handed a file on. */

/** Types Gemini accepts and this bot forwards; anything else is unsupported and earns a nudge. */
export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

/**
 * Documents Gemini reads natively: 258 tokens a page, and text already embedded in the PDF is extracted
 * without being charged, so a text-layer document is close to free. Kept separate from the image set because
 * the two take different paths — an image is re-encoded by sharp, a document must reach the model untouched.
 */
export const ALLOWED_DOCUMENT_TYPES = new Set(['application/pdf'])

export function isSupportedDocument(attachment: { contentType: string | null }): boolean {
  return attachment.contentType !== null && ALLOWED_DOCUMENT_TYPES.has(attachment.contentType)
}

/**
 * Audio Gemini hears natively, at 32 tokens a second. `audio/mpeg` is admitted alongside `audio/mp3` because
 * it is the registered type for an MP3 and the name Discord actually reports; it is renamed for the API at
 * the download boundary, in `geminiMimeType`.
 */
export const ALLOWED_AUDIO_TYPES = new Set([
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac'
])

export function isSupportedAudio(attachment: { contentType: string | null }): boolean {
  return attachment.contentType !== null && ALLOWED_AUDIO_TYPES.has(attachment.contentType)
}

/** Anything she can be handed and actually read, whichever path it takes once inside. */
export function isSupportedMedia(attachment: { contentType: string | null }): boolean {
  return isSupportedImage(attachment) || isSupportedDocument(attachment) || isSupportedAudio(attachment)
}

/** Per-turn ceiling across every kind of attachment. Both the mention path and /ask derive their limit from this. */
export const MAX_ATTACHMENTS = 3

export function isSupportedImage(attachment: { contentType: string | null }): boolean {
  return attachment.contentType !== null && ALLOWED_IMAGE_TYPES.has(attachment.contentType)
}

/**
 * Discord has no multi-attachment option type, so /ask exposes one option per slot. Named for attachments
 * rather than images because the slots take PDFs too — see ALLOWED_DOCUMENT_TYPES — and numbered from 1
 * so the list reads evenly instead of the first slot carrying a different shape from the rest.
 */
export function attachmentOptionName(index: number): string {
  return `attachment_${index + 1}`
}

// The Pi fetches these itself and sits on a private Tailnet, so a user-supplied URL is an SSRF vector: a
// pasted link would have the bot probe the tailnet on the poster's behalf. Checked against the addresses a
// hostname RESOLVES to, never the hostname text — `localtest.me` is a real registered name that answers
// ::1, and a name pointing at 100.64.0.0/10 needs nothing but a DNS record, so a string test guards nothing.
const PRIVATE_ADDRESS_PATTERNS = [
  /^0\./,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 — CGNAT, which is Tailscale's range
  /^::1$/,
  /^f[cd][0-9a-f]{2}:/i, // unique local
  /^fe80:/i // link local
]

/** Does this IP address sit in a range that is not publicly routable? Takes an address, never a hostname. */
export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '')
  return PRIVATE_ADDRESS_PATTERNS.some((pattern) => pattern.test(bare))
}

/**
 * Resolve a hostname and refuse it if ANY answer is private — a name with several A records could be
 * connected to either. Fails closed when resolution fails, and rejects `localhost` by name because it need
 * not appear in DNS at all.
 */
export async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  if (/^localhost$/i.test(hostname) || /\.localhost$/i.test(hostname)) return false

  const bare = hostname.replace(/^\[|\]$/g, '')
  if (isIP(bare)) return !isPrivateAddress(bare)

  const answers = await lookup(hostname, { all: true }).catch(() => [])
  return answers.length > 0 && answers.every(({ address }) => !isPrivateAddress(address))
}

/**
 * Turn a user-supplied URL into something the vision path can take, or null. The Content-Type is read from a
 * HEAD rather than guessed from the path, because an extension proves nothing about what a server returns.
 * Redirects are followed here so the *resolved* URL is what gets handed on and re-checked — the later GET in
 * roka.ts follows redirects of its own, so validating only the typed hostname would guard nothing.
 */
export async function resolveImageUrl(raw: string): Promise<{ url: string; contentType: string } | null> {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  if (!(await resolvesToPublicAddress(parsed.hostname))) return null

  const response = await fetch(parsed, { method: 'HEAD', redirect: 'follow' }).catch(() => null)
  if (!response?.ok) return null

  const landed = new URL(response.url || parsed.toString())
  if (landed.hostname !== parsed.hostname && !(await resolvesToPublicAddress(landed.hostname))) return null

  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) return null

  return { url: landed.toString(), contentType }
}
