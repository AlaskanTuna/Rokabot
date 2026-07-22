/**
 * A deterministic offline estimator: whitespace-normalized characters divided by four, rounded up.
 * Use the harness's optional --live models.countTokens cross-check when ground-truth Gemini counts are needed.
 */
export function estimateTokens(value: string): number {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized === '' ? 0 : Math.ceil(normalized.length / 4)
}
