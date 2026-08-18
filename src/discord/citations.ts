/** Renders the sources a reply was built on as one compact small-text row. */

const MAX_CITATIONS = 3

/** Cites the domain rather than the page title: it is far shorter, and it is what signals source authority. */
function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
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
export function fitCitations(sources: ReadonlyArray<{ url: string }>, budget: number): string {
  const cites = sources
    .slice(0, MAX_CITATIONS)
    .map((source, index) => `${index + 1}. [${sourceHost(source.url)}](<${source.url}>)`)
  while (cites.length > 0) {
    const line = `-# 🔗 ${cites.join('  ·  ')}`
    if (line.length <= budget) return line
    cites.pop()
  }
  return ''
}
