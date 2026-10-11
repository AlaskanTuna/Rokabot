import { env, pipeline } from '@huggingface/transformers'
import { type Embedder, type FeatureExtractor, createEmbedder } from './embedder.js'

export interface ModelSettings {
  modelDir: string
  model: string
}

export async function loadEmbedder(settings: ModelSettings): Promise<Embedder> {
  // The files are baked into the image; a missing file must fail startup, never trigger a download.
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = settings.modelDir
  env.useFSCache = false
  const extractor = await pipeline('feature-extraction', settings.model, {
    dtype: 'q8',
    device: 'cpu',
    local_files_only: true,
    session_options: { intraOpNumThreads: 1, interOpNumThreads: 1, executionMode: 'sequential' }
  })
  return createEmbedder(extractor as unknown as FeatureExtractor)
}
