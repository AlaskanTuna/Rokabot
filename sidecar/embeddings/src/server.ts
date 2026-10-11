import { createServer } from 'node:http'
import { type Log, createHandler } from './handler.js'
import { loadEmbedder } from './model.js'

const log: Log = (level, message, fields = {}) => {
  console.log(JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...fields }))
}

const port = Number(process.env.EMBEDDINGS_PORT ?? 8080)
const model = process.env.EMBEDDINGS_MODEL ?? 'Xenova/multilingual-e5-small'
const revision = process.env.EMBEDDINGS_REVISION ?? ''
const modelDir = process.env.EMBEDDINGS_MODEL_DIR ?? '/models'
if (!revision) throw new Error('EMBEDDINGS_REVISION is required')
// The bot fingerprints vectors by this id, so another revision or quantisation is another embedding space.
const modelId = `${model}@${revision.slice(0, 8)}-q8`

const embedder = await loadEmbedder({ modelDir, model })
// Warm up before listening, so /health answers only once a request would be served at full speed.
const { vectors } = await embedder.embed(['passage: warm-up'])
const dim = vectors[0]?.length ?? 0

createServer(createHandler({ embedder, model: modelId, dim, log })).listen(port, () => {
  log('info', 'Embedding sidecar ready', { model: modelId, dim, port })
})
