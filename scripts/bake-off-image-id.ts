/**
 * Image identification bake-off: runs every configured backend over a folder of labelled photos
 * and writes results.csv plus summary.md to the out folder.
 *
 * Usage:
 *   npx tsx scripts/bake-off-image-id.ts --photos <dir> --out <dir>
 *
 * The photos folder holds image files plus labels.json:
 *   [{ "file": "roka-nendo.jpg", "expected": { "name": "Maniwa Roka", "maker": "Good Smile" } },
 *    { "file": "unknown-plush.jpg", "expected": null }]
 * An expected of null marks an unknown item the backends should abstain on.
 */
import 'dotenv/config'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { processImageForGemini } from '../src/agent/media/imageProcessor.js'
import { cloudVisionKey, createCloudVisionBackend } from './imageId/cloudVision.js'
import { createOwnVisionBackend } from './imageId/ownVision.js'
import { createSerpapiLensBackend, serpapiKey } from './imageId/serpapiLens.js'
import type { ExpectedIdentity, IdentifyOutput, ImageIdBackend, PhotoLabel } from './imageId/types.js'
import { exactMatch, percentile } from './imageId/types.js'

const labelSchema = z.object({
  file: z.string().min(1),
  expected: z
    .object({
      name: z.string().min(1),
      series: z.string().optional(),
      maker: z.string().optional(),
      product: z.string().optional()
    })
    .nullable(),
  url: z.string().url().optional()
})

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

export interface LoadedPhoto {
  file: string
  bytes: Buffer
  mime: string
  expected: ExpectedIdentity | null
  url?: string
}

export interface PhotoResult {
  file: string
  expectedName: string | null
  backend: string
  topCandidate: string | null
  confidence: number | null
  abstained: boolean
  exact: boolean
  latencyMs: number
  costUsd: number
}

export interface BackendSummary {
  backend: string
  photos: number
  precision: number | null
  recall: number | null
  abstentionUnknown: number | null
  p50Ms: number | null
  p95Ms: number | null
  costUsd: number
}

function usageError(message: string): Error {
  return new Error(`${message}\nUsage: npx tsx scripts/bake-off-image-id.ts --photos <dir> --out <dir>`)
}

export function parseArgs(args: string[]): { photosDir: string; outDir: string } {
  let photosDir: string | undefined
  let outDir: string | undefined
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--photos') photosDir = args[++index]
    else if (argument === '--out') outDir = args[++index]
    else throw usageError(`Unknown argument: ${argument}`)
  }
  if (!photosDir) throw usageError('Missing --photos <dir>')
  if (!outDir) throw usageError('Missing --out <dir>')
  return { photosDir, outDir }
}

export async function loadPhotos(photosDir: string): Promise<LoadedPhoto[]> {
  const labels = labelSchema.array().parse(JSON.parse(await readFile(join(photosDir, 'labels.json'), 'utf8')))
  const files = new Set(await readdir(photosDir))
  const photos: LoadedPhoto[] = []
  for (const label of labels satisfies PhotoLabel[]) {
    if (!files.has(label.file)) {
      console.warn(`Skipping ${label.file}: not found in ${photosDir}`)
      continue
    }
    const mime = MIME_BY_EXTENSION[extname(label.file).toLowerCase()]
    if (!mime) {
      console.warn(`Skipping ${label.file}: unsupported extension`)
      continue
    }
    const raw = await readFile(join(photosDir, label.file))
    const processed = await processImageForGemini(raw, mime)
    if (!processed) {
      console.warn(`Skipping ${label.file}: the image processor dropped it`)
      continue
    }
    photos.push({
      file: label.file,
      bytes: processed.data,
      mime: processed.mimeType,
      expected: label.expected,
      ...(label.url ? { url: label.url } : {})
    })
  }
  return photos
}

export async function runBakeOff(photos: LoadedPhoto[], backends: ImageIdBackend[]): Promise<PhotoResult[]> {
  const results: PhotoResult[] = []
  for (const photo of photos) {
    for (const backend of backends) {
      const started = performance.now()
      try {
        const output = await backend.identify(photo.bytes, photo.mime, photo.url)
        results.push(toResult(photo, backend.name, output, started))
      } catch (error) {
        console.warn(`${backend.name} failed on ${photo.file}: ${error instanceof Error ? error.message : error}`)
        results.push(toResult(photo, backend.name, { candidates: [], abstained: true, rawCost: 0 }, started))
      }
    }
  }
  return results
}

function toResult(photo: LoadedPhoto, backend: string, output: IdentifyOutput, started: number): PhotoResult {
  const top = output.candidates[0] ?? null
  return {
    file: photo.file,
    expectedName: photo.expected?.name ?? null,
    backend,
    topCandidate: top?.name ?? null,
    confidence: top?.confidence ?? null,
    abstained: output.abstained,
    exact: photo.expected ? exactMatch(output, photo.expected) : false,
    latencyMs: Math.round(performance.now() - started),
    costUsd: output.rawCost
  }
}

export function summarize(results: PhotoResult[], backends: ImageIdBackend[]): BackendSummary[] {
  return backends.map((backend) => {
    const rows = results.filter((row) => row.backend === backend.name)
    const known = rows.filter((row) => row.expectedName !== null)
    const unknown = rows.filter((row) => row.expectedName === null)
    const predicted = known.filter((row) => !row.abstained)
    const exact = known.filter((row) => row.exact).length
    const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b)
    return {
      backend: backend.name,
      photos: rows.length,
      precision: predicted.length === 0 ? null : exact / predicted.length,
      recall: known.length === 0 ? null : exact / known.length,
      abstentionUnknown: unknown.length === 0 ? null : unknown.filter((row) => row.abstained).length / unknown.length,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      costUsd: rows.reduce((sum, row) => sum + row.costUsd, 0)
    }
  })
}

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildCsv(results: PhotoResult[]): string {
  const header = 'file,expected,backend,topCandidate,confidence,abstained,exact,latencyMs,costUsd'
  const lines = results.map((row) =>
    [
      row.file,
      row.expectedName,
      row.backend,
      row.topCandidate,
      row.confidence,
      row.abstained,
      row.exact,
      row.latencyMs,
      row.costUsd.toFixed(4)
    ]
      .map(csvCell)
      .join(',')
  )
  return `${header}\n${lines.join('\n')}\n`
}

function rate(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(2)
}

function ms(value: number | null): string {
  return value === null ? 'n/a' : String(value)
}

export function buildSummary(summaries: BackendSummary[], skipped: string[]): string {
  const lines = [
    '# Image Identification Bake-Off',
    '',
    '| Backend | Photos | Precision | Recall | Abstention on Unknowns | p50 ms | p95 ms | Cost USD |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  ]
  for (const summary of summaries) {
    lines.push(
      `| ${summary.backend} | ${summary.photos} | ${rate(summary.precision)} | ${rate(summary.recall)} | ` +
        `${rate(summary.abstentionUnknown)} | ${ms(summary.p50Ms)} | ${ms(summary.p95Ms)} | ` +
        `${summary.costUsd.toFixed(4)} |`
    )
  }
  lines.push('')
  lines.push(
    'Precision is exact IDs over known photos the backend answered; recall over all known photos; ' +
      'ownVision bills the configured main-model budget, so its cost reads 0 here.'
  )
  for (const name of skipped) lines.push(`- Skipped ${name}: key not set.`)
  lines.push('')
  return `${lines.join('\n')}`
}

export function selectBackends(): { backends: ImageIdBackend[]; skipped: string[] } {
  const backends: ImageIdBackend[] = [createOwnVisionBackend()]
  const skipped: string[] = []
  if (cloudVisionKey()) backends.push(createCloudVisionBackend())
  else {
    skipped.push('cloudVision')
    console.log('Skipping cloudVision: GCP_API_KEY is not set')
  }
  if (serpapiKey()) backends.push(createSerpapiLensBackend())
  else {
    skipped.push('serpapiLens')
    console.log('Skipping serpapiLens: SERPAPI_API_KEY is not set')
  }
  return { backends, skipped }
}

async function main(args: string[]): Promise<void> {
  const { photosDir, outDir } = parseArgs(args)
  const photos = await loadPhotos(resolve(photosDir))
  if (photos.length === 0) throw new Error(`No labelled photos found in ${photosDir}`)
  const { backends, skipped } = selectBackends()
  const results = await runBakeOff(photos, backends)
  const summaries = summarize(results, backends)
  await mkdir(resolve(outDir), { recursive: true })
  await writeFile(join(resolve(outDir), 'results.csv'), buildCsv(results))
  await writeFile(join(resolve(outDir), 'summary.md'), buildSummary(summaries, skipped))
  for (const summary of summaries) {
    console.log(
      `${summary.backend}: precision ${rate(summary.precision)} recall ${rate(summary.recall)} ` +
        `abstention-unknown ${rate(summary.abstentionUnknown)} p50 ${ms(summary.p50Ms)}ms ` +
        `p95 ${ms(summary.p95Ms)}ms cost $${summary.costUsd.toFixed(4)}`
    )
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
