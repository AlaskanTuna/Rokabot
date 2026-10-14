/**
 * Blind relevance pairs from the Jev recall gate's shadow rows (#262), read from a COPY of the production database.
 *
 * Usage: npx tsx scripts/recall-gate-sample.ts <db-copy.sqlite> <out-dir>
 *
 * pairs.jsonl goes to the judges and carries no probability; key.jsonl stays with the operator. Both hold chat text:
 * they are written owner-only (0600), and <out-dir> must be a private scratch directory, never inside the repository.
 */
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { seededRandom, turnRef } from './recall-calibration-sample.js'

export type GatePair = Readonly<{
  pairId: string
  turnRef: string
  kind: string
  message: string
  memoryText: string
  probability: number
}>

type Shortlisted = Array<[string, number, number | null]>

/** The shadow row is written when the turn starts and session_history after the reply, so a slow turn lands late. */
const HISTORY_BEFORE_MS = 600_000
const HISTORY_AFTER_MS = 300_000

/** What messageCreate stores for an attachment-only message; there is no text for a judge to read. */
const IMAGE_ONLY = '(shared an image)'

const hash = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16)

/** Saved user rows append media digests after a newline, so the gate's message is the whole row or a prefix of it. */
function messageOf(content: string, messageHash: string): string | undefined {
  if (hash(content) === messageHash) return content
  for (let newline = content.indexOf('\n'); newline !== -1; newline = content.indexOf('\n', newline + 1)) {
    const prefix = content.slice(0, newline)
    if (hash(prefix) === messageHash) return prefix
  }
  return undefined
}

/** The history row whose text the gate judged, nearest the shadow row when the same text was said more than once. */
export function matchGateMessage(
  database: Database.Database,
  channelId: string,
  createdAt: number,
  messageHash: string
): { message: string; timestamp: number } | undefined {
  const candidates = database
    .prepare(
      `SELECT content, timestamp FROM session_history WHERE channel_id = ? AND role = 'user'
       AND timestamp BETWEEN ? AND ? ORDER BY timestamp, rowid`
    )
    .all(channelId, createdAt - HISTORY_BEFORE_MS, createdAt + HISTORY_AFTER_MS) as Array<{
    content: string
    timestamp: number
  }>
  let nearest: { message: string; timestamp: number } | undefined
  for (const { content, timestamp } of candidates) {
    const message = messageOf(content, messageHash)
    if (message === undefined) continue
    if (!nearest || Math.abs(timestamp - createdAt) < Math.abs(nearest.timestamp - createdAt)) {
      nearest = { message, timestamp }
    }
  }
  return nearest
}

function parseGate(detail: string): { messageHash: string; shortlist: Shortlisted } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(detail)
  } catch {
    return null
  }
  const gate = (parsed as { gate?: Record<string, unknown> } | null)?.gate
  if (!gate || gate.v !== 1 || gate.status !== 'ok') return null
  if (typeof gate.messageHash !== 'string' || !Array.isArray(gate.shortlist)) return null
  const shortlist = gate.shortlist.filter(
    (entry): entry is [string, number, number | null] =>
      Array.isArray(entry) &&
      typeof entry[0] === 'string' &&
      Number.isSafeInteger(entry[1]) &&
      (entry[2] === null || typeof entry[2] === 'number')
  )
  return { messageHash: gate.messageHash, shortlist }
}

export function loadGatePairs(dbPath: string): GatePair[] {
  const database = new Database(resolve(dbPath), { readonly: true, fileMustExist: true })
  try {
    const rows = database
      .prepare(
        `SELECT channel_id AS channelId, created_at AS createdAt, detail FROM memory_events
         WHERE kind = 'recall_shadow' AND detail IS NOT NULL AND channel_id IS NOT NULL ORDER BY created_at, id`
      )
      .all() as Array<{ channelId: string; createdAt: number; detail: string }>
    const claim = database.prepare('SELECT predicate, value FROM memory_claim WHERE id = ?')
    const episode = database.prepare('SELECT summary FROM memory_episode WHERE id = ?')
    const media = database.prepare('SELECT summary FROM media_digest WHERE id = ?')
    const memoryText = (kind: string, id: number): string | undefined => {
      if (kind === 'conversation') return (episode.get(id) as { summary: string } | undefined)?.summary
      if (kind === 'media') return (media.get(id) as { summary: string } | undefined)?.summary
      if (kind !== 'fact' && kind !== 'server_fact') return undefined
      const found = claim.get(id) as { predicate: string; value: string } | undefined
      return found ? `${found.predicate}: ${found.value}` : undefined
    }

    const pairs: GatePair[] = []
    for (const row of rows) {
      const gate = parseGate(row.detail)
      if (!gate) continue
      const message = matchGateMessage(database, row.channelId, row.createdAt, gate.messageHash)?.message
      if (message === undefined || message === IMAGE_ONLY) continue
      const ref = turnRef(row.channelId, row.createdAt)
      for (const [kind, id, probability] of gate.shortlist) {
        if (probability === null) continue
        const text = memoryText(kind, id)
        if (text === undefined) continue
        pairs.push({ pairId: `${ref}-${kind}-${id}`, turnRef: ref, kind, message, memoryText: text, probability })
      }
    }
    return pairs
  } finally {
    database.close()
  }
}

/** Shuffled with a fixed seed: the shortlist is in pool-rank order, which would hand the judges a relevance hint. */
function shuffled<T>(values: readonly T[], seed: number): T[] {
  const random = seededRandom(seed)
  const result = values.slice()
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

function writePrivate(path: string, rows: readonly unknown[]): void {
  writeFileSync(path, rows.map((row) => `${JSON.stringify(row)}\n`).join(''), { mode: 0o600 })
  chmodSync(path, 0o600)
}

export function writeGateSample(pairs: readonly GatePair[], outDir: string, seed = 1): void {
  mkdirSync(outDir, { recursive: true, mode: 0o700 })
  const order = shuffled(pairs, seed)
  writePrivate(
    join(outDir, 'pairs.jsonl'),
    order.map(({ pairId, kind, message, memoryText }) => ({ pairId, kind, message, memoryText }))
  )
  writePrivate(
    join(outDir, 'key.jsonl'),
    order.map(({ pairId, turnRef: ref, kind, probability }) => ({ pairId, turnRef: ref, kind, probability }))
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dbPath, outDir] = process.argv.slice(2)
  if (!dbPath || !outDir) throw new Error('Usage: recall-gate-sample <db-copy.sqlite> <out-dir>')
  const pairs = loadGatePairs(dbPath)
  writeGateSample(pairs, outDir)
  console.log(`${pairs.length} pairs from ${new Set(pairs.map(({ turnRef: ref }) => ref)).size} turns`)
}
