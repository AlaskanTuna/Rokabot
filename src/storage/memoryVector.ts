import type { EmbeddingVector } from './memoryEpisodeStore.js'

export function encodeFloat32Embedding(vector: EmbeddingVector, label = 'Episode'): Buffer {
  const { values, dim } = vector
  if (
    !Number.isInteger(dim) ||
    dim <= 0 ||
    values.length !== dim ||
    values.some((value) => !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))
  ) {
    throw new Error(`${label} embedding must contain ${dim} finite values`)
  }

  const bytes = Buffer.allocUnsafe(dim * 4)
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4))
  return bytes
}

export function vectorParams(
  vector: EmbeddingVector | null | undefined,
  label?: string
): [Buffer | null, string | null, number | null, string | null] {
  return vector
    ? [encodeFloat32Embedding(vector, label), vector.modelId, vector.dim, vector.fingerprint]
    : [null, null, null, null]
}
