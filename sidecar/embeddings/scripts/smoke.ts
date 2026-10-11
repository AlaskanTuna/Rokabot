import { strict as assert } from 'node:assert'
import { readFile, writeFile } from 'node:fs/promises'

type EmbedReply = { model: string; dim: number; vectors: number[][]; truncated: boolean[] }

const url = process.argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:8080'
const record = process.argv.includes('--record')
const goldenPath = new URL('../golden.json', import.meta.url)

async function embed(texts: string[], role: 'document' | 'query'): Promise<EmbedReply> {
  const response = await fetch(`${url}/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texts, role })
  })
  assert.equal(response.status, 200, `POST /embed returned ${response.status}`)
  return (await response.json()) as EmbedReply
}

const dot = (left: number[], right: number[]) =>
  left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0)

assert.equal((await fetch(`${url}/health`)).status, 200, '/health is not ready')
const documents = await embed(
  [
    'The group planned a picnic by the river on Saturday.',
    'Someone shared a ramen recipe with extra garlic.',
    'word '.repeat(700)
  ],
  'document'
)
const query = await embed(['Where are we going for the picnic?'], 'query')
const [picnic, ramen] = documents.vectors
const [question] = query.vectors
assert.ok(picnic && ramen && question, 'missing vectors')
assert.equal(documents.dim, 384)
for (const vector of [...documents.vectors, ...query.vectors]) {
  assert.equal(vector.length, 384)
  assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-3, 'vector is not unit length')
}
assert.ok(dot(question, picnic) > dot(question, ramen), 'the related passage does not outrank the unrelated one')
assert.deepEqual(documents.truncated, [false, false, true])

const golden = { model: documents.model, picnic: picnic.slice(0, 8), question: question.slice(0, 8) }
if (record) {
  await writeFile(goldenPath, `${JSON.stringify(golden, null, 2)}\n`)
  console.log(`Recorded ${goldenPath.pathname}`)
} else {
  const saved = JSON.parse(await readFile(goldenPath, 'utf8')) as typeof golden
  assert.equal(saved.model, golden.model)
  for (const key of ['picnic', 'question'] as const) {
    saved[key].forEach((value, index) => {
      assert.ok(
        Math.abs(value - (golden[key][index] ?? Number.NaN)) < 1e-4,
        `${key}[${index}] drifted from golden.json`
      )
    })
  }
}
console.log('Embedding sidecar smoke test passed', { model: documents.model, dim: documents.dim })
