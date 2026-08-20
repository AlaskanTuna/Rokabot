import { existsSync, readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'

import { GoogleGenAI } from '@google/genai'
import * as dotenv from 'dotenv'

import { sizeLimitFor } from '../../src/agent/attachmentLimits.js'

/**
 * `npm run measure -- path/to/file [...]` — what one attachment costs, and which ceilings it meets.
 *
 * Every token figure this project relies on came from a script that was written, used once and deleted: the
 * per-page PDF cost behind `maxAttachmentTokens`, the per-second audio and video rates in the TRD, the
 * numbers in #136, #144, #148 and #153. The scripts are gone and the numbers justify config values, so
 * nobody can re-derive them without rebuilding a `countTokens` harness from scratch — which happened twice in
 * one night, the second time failing on module resolution because it was written outside the project tree
 * (#156).
 *
 * Lives under `tests/harness/` rather than `scripts/` deliberately: `scripts/**` is in neither
 * `tsconfig.test.json`'s `include` nor vitest's, so a tool placed there is unchecked and untested — the exact
 * gap #151 closed for `tests/`. A measurement instrument nobody type-checks is how you get a wrong number.
 *
 * Costs no generate quota: `countTokens` does not draw on it, verified twice against keys whose 500 RPD was
 * exhausted and which still answered here normally.
 */

/** Extension to the MIME type Gemini is asked about. Explicit rather than a lookup library, because the set
 * of things this bot can be sent is small and closed, and a wrong guess here silently mis-prices a file. */
const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm'
}

export function mimeForPath(path: string): string | undefined {
  return MIME_BY_EXTENSION[extname(path).toLowerCase()]
}

export interface Ceiling {
  name: string
  used: number
  limit: number
  ok: boolean
}

/**
 * The ceilings a turn carrying this file would be judged against, in the order they are applied in
 * production: size first (before anything is downloaded), then the measured per-turn token cost, then what
 * it reserves of the minute.
 */
export function ceilingsFor(bytes: number, contentType: string, tokens: number, limits: TokenLimits): Ceiling[] {
  return [
    {
      name: 'size for this type',
      used: bytes,
      limit: sizeLimitFor(contentType),
      ok: bytes <= sizeLimitFor(contentType)
    },
    {
      name: 'per-turn token cost',
      used: tokens,
      limit: limits.maxAttachmentTokens,
      ok: tokens <= limits.maxAttachmentTokens
    },
    {
      name: 'share of the minute',
      used: tokens,
      limit: limits.maxTokensPerMinute,
      ok: tokens <= limits.maxTokensPerMinute
    }
  ]
}

export interface TokenLimits {
  maxAttachmentTokens: number
  maxTokensPerMinute: number
}

export function formatReport(
  path: string,
  bytes: number,
  contentType: string,
  tokens: number,
  ceilings: Ceiling[]
): string {
  const lines = [`${basename(path)}  ${contentType}  ${(bytes / 1024 / 1024).toFixed(2)} MB  ${tokens} tokens`]
  for (const ceiling of ceilings) {
    const pct = ((ceiling.used / ceiling.limit) * 100).toFixed(1)
    lines.push(`  ${ceiling.ok ? 'OK    ' : 'REFUSE'} ${ceiling.name}: ${ceiling.used} / ${ceiling.limit}  (${pct}%)`)
  }
  return lines.join('\n')
}

/**
 * Which key funds the measurement. Never the bot's own.
 *
 * `GEMINI_API_KEY` belongs to production and is not ours to spend — a free call on it is still a call on it,
 * and "which key is idle" is the wrong question when the question is which key is ours. Mirrors the guard in
 * `tests/harness/env.ts` rather than trusting the operator to pass the right name.
 */
export function resolveKey(parsed: Record<string, string>, requested: string | undefined): string {
  const name = requested ?? 'GRAPHIFY_GEMINI_API_KEY'
  if (name === 'GEMINI_API_KEY') {
    throw new Error("Refusing to measure on GEMINI_API_KEY: that key is production's. Name GRAPHIFY_ or DEV_ instead.")
  }
  const key = parsed[name]
  if (!key) throw new Error(`Missing ${name} in .env`)
  if (key === parsed.GEMINI_API_KEY) {
    throw new Error(`${name} resolves to the same key as GEMINI_API_KEY — refusing to spend production's.`)
  }
  return key
}

async function main(): Promise<void> {
  const paths = process.argv.slice(2)
  if (paths.length === 0) {
    console.error('usage: npm run measure -- path/to/file [...]')
    process.exitCode = 1
    return
  }

  const parsed = existsSync('.env') ? dotenv.parse(readFileSync('.env')) : {}
  const client = new GoogleGenAI({ apiKey: resolveKey(parsed, process.env.ROKABOT_HARNESS_KEY) })
  const { config } = await import('../../src/config.js')

  for (const path of paths) {
    if (!existsSync(path)) {
      console.error(`${path}: no such file`)
      process.exitCode = 1
      continue
    }
    const contentType = mimeForPath(path)
    if (!contentType) {
      console.error(`${path}: unrecognised extension, so nothing can price it`)
      process.exitCode = 1
      continue
    }

    const bytes = readFileSync(path)
    const response = await client.models.countTokens({
      model: config.gemini.model,
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: contentType, data: bytes.toString('base64') } }] }]
    })
    const tokens = response.totalTokens ?? 0
    console.log(
      formatReport(
        path,
        bytes.length,
        contentType,
        tokens,
        ceilingsFor(bytes.length, contentType, tokens, config.gemini)
      )
    )
  }
}

// Only when run as a command; the exports above are imported by its tests.
if (process.argv[1]?.endsWith('measure.ts')) await main()
