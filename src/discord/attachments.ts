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

// The Pi fetches these itself and sits on a private Tailnet, so a user-supplied URL is an SSRF vector: a
// pasted `http://100.64.0.1/` would have the bot probe the tailnet on the poster's behalf. Hosts that are
// not publicly routable are refused before any request is made.
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /^0\./,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 — CGNAT, which is Tailscale's range
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i, // unique local
  /^\[?fe80:/i // link local
]

export function isPubliclyRoutableHost(hostname: string): boolean {
  return !PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
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
  if (!isPubliclyRoutableHost(parsed.hostname)) return null

  const response = await fetch(parsed, { method: 'HEAD', redirect: 'follow' }).catch(() => null)
  if (!response?.ok) return null

  const landed = new URL(response.url || parsed.toString())
  if (!isPubliclyRoutableHost(landed.hostname)) return null

  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) return null

  return { url: landed.toString(), contentType }
}
