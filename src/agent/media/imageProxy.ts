/** The longest side an image reaches the model at; imageProcessor resizes to it as well. */
export const VISION_MAX_DIMENSION = 1024

/**
 * Discord's proxy URL for an image, asking Discord to shrink it to the vision size first. The Pi then
 * downloads tens of kilobytes instead of the full upload, so a 10 MB phone photo neither passes the image
 * cap nor outlasts the download timeout on a slow link. Discord resizes only when given both sides, and
 * stretches the image to them, so both are worked out from the stated size to keep the shape. Undefined when
 * the URL is not a Discord proxy host or the size is unknown; the caller then keeps the original URL.
 */
export function proxyResizeUrl(
  proxyUrl: string | null | undefined,
  width: number | null | undefined,
  height: number | null | undefined
): string | undefined {
  if (!proxyUrl || !width || !height || width <= 0 || height <= 0) return undefined
  let url: URL
  try {
    url = new URL(proxyUrl)
  } catch {
    return undefined
  }
  const host = url.hostname.toLowerCase()
  const discordProxy = host === 'media.discordapp.net' || /^images-ext-\d+\.discordapp\.net$/.test(host)
  if (url.protocol !== 'https:' || !discordProxy) return undefined

  const scale = Math.min(1, VISION_MAX_DIMENSION / Math.max(width, height))
  url.searchParams.set('width', String(Math.max(1, Math.round(width * scale))))
  url.searchParams.set('height', String(Math.max(1, Math.round(height * scale))))
  return url.toString()
}
