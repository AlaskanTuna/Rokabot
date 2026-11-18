/** The contract every image-identification backend satisfies for the bake-off. */

export interface ImageCandidate {
  name: string
  confidence?: number
  sourceUrls: string[]
}

export interface IdentifyOutput {
  candidates: ImageCandidate[]
  abstained: boolean
  rawCost: number
}

export interface ImageIdBackend {
  name: string
  identify(imageBytes: Buffer, mime: string): Promise<IdentifyOutput>
}

export interface ExpectedIdentity {
  name: string
  series?: string
  maker?: string
  product?: string
}

export interface PhotoLabel {
  file: string
  expected: ExpectedIdentity | null
}

/** Lowercase alphanumeric only, so casing and punctuation never decide a match. */
export function normalizeIdentity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * An identity counts as exact when the expected name appears in the top candidate and, when a
 * maker is given, one of its tokens shows up in a source URL host. Abstentions never match.
 */
export function exactMatch(output: IdentifyOutput, expected: ExpectedIdentity): boolean {
  if (output.abstained) return false
  const top = output.candidates[0]
  if (!top) return false
  const name = normalizeIdentity(top.name)
  const want = normalizeIdentity(expected.name)
  if (!want || !name.includes(want)) return false
  if (!expected.maker) return true
  const tokens = expected.maker
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
  return top.sourceUrls.some((raw) => {
    let host = ''
    try {
      host = new URL(raw).hostname.toLowerCase().replace(/[^a-z0-9]/g, '')
    } catch {
      return false
    }
    return tokens.some((token) => host.includes(token))
  })
}

/** Percentile over a pre-sorted ascending array; null when empty. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}
