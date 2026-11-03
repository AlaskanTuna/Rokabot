/** Renders the sources a reply was built on as one compact small-text row. */

const MAX_CITATIONS = 3

/** Gemini returns every grounded source behind this redirector, which hides the site each result came from. */
const GEMINI_REDIRECT_HOST = 'vertexaisearch.cloud.google.com'
const DOMAIN_SHAPED = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i

/** Cites the domain rather than the page title: it is far shorter, and it is what signals source authority. */
function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** The label and dedupe key for one source: the host, or a Gemini redirect's own domain-shaped title. */
function sourceLabel(url: string, title: string | undefined): string {
  const host = sourceHost(url)
  if (host !== GEMINI_REDIRECT_HOST) return host
  return title !== undefined && DOMAIN_SHAPED.test(title) ? title : host
}

export function clampToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text
  if (budget <= 1) return ''
  return `${text.slice(0, budget - 1).trimEnd()}…`
}

/**
 * One small-text line of numbered domain citations. Citations are dropped whole rather than truncated —
 * half a URL is a broken link, not a shorter one — and the row is omitted entirely when nothing fits.
 *
 * Targets are wrapped in angle brackets so a URL containing ')' does not close the link early: Wikipedia
 * disambiguation suffixes like /Frieren_(character) are common for this bot's subject matter, and the bare
 * form would render a link to '…/Frieren_(character' with a stray ')' after it. It also keeps the row from
 * expanding into link embeds. The label is the host, which cannot contain the ']' that would break it.
 */
export function fitCitations(sources: ReadonlyArray<{ url: string; title?: string }>, budget: number): string {
  // The label is the site, so a second page from one site would only repeat it.
  const sites = new Map<string, string>()
  for (const { url, title } of sources) {
    const label = sourceLabel(url, title)
    if (!sites.has(label)) sites.set(label, url)
  }
  const cites = [...sites].slice(0, MAX_CITATIONS).map(([host, url]) => `[${host}](<${url}>)`)
  while (cites.length > 0) {
    const line = `-# 🔗 ${cites.join('  ·  ')}`
    if (line.length <= budget) return line
    cites.pop()
  }
  return ''
}
