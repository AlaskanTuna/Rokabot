const SEPARATOR = /[_.\-/]/
const LAST_SEPARATOR = /[_.\-/](?=[^_.\-/]*$)/

/**
 * Splits a long name into a head that may shrink to an ellipsis and a tail of about `keep` characters that always
 * shows, so the name keeps its start and end when it cannot fit, e.g. OPENROUTER_ENTERPRISE_EU…FALLBACK_API_KEY. When
 * it fits, the two parts read as one. The tail starts after the nearest separator; null for a short name.
 */
export function middleSplit(text: string, keep = 16): [string, string] | null {
  if (text.length <= keep + 8) return null
  const target = text.length - keep
  for (let distance = 0; distance <= keep / 2; distance++) {
    for (const at of [target - distance, target + distance]) {
      if (SEPARATOR.test(text[at] ?? '')) return [text.slice(0, at + 1), text.slice(at + 1)]
    }
  }
  return [text.slice(0, target), text.slice(target)]
}

/** `text` cut to at most `max` characters with an ellipsis between whole words, for places that take a string. */
export function middleEllipsis(text: string, max: number): string {
  if (text.length <= max) return text
  const split = middleSplit(text)
  const tail = split && split[1].length <= max - 10 ? split[1] : text.slice(-Math.floor(max / 2))
  const head = text.slice(0, max - tail.length - 1)
  const word = head.search(LAST_SEPARATOR)
  return `${word >= head.length / 2 ? head.slice(0, word) : head}…${tail}`
}
