export interface FeatureExtractor {
  (texts: string[], options: { pooling: 'mean'; normalize: true }): Promise<{ tolist(): unknown }>
  tokenizer: { encode(text: string): number[] }
}

export interface Embedder {
  embed(texts: string[]): Promise<{ vectors: number[][]; tokenCounts: number[] }>
}

export function createEmbedder(extractor: FeatureExtractor): Embedder {
  return {
    async embed(texts) {
      // The pipeline truncates to the model limit by itself; counting first is the only way to report a cut.
      const tokenCounts = texts.map((text) => extractor.tokenizer.encode(text).length)
      const output = await extractor(texts, { pooling: 'mean', normalize: true })
      return { vectors: output.tolist() as number[][], tokenCounts }
    }
  }
}
