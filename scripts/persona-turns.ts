/**
 * Picks real chat turns out of a COPY of the production database for persona replays and reports: each assistant
 * reply with the user message it answered and the channel history production showed the model at the time.
 * Shared by scripts/persona-replay.ts and scripts/persona-report.ts (docs/research/roka-voice-v3.md).
 */

import type Database from 'better-sqlite3'
import { messageEdge } from '../src/agent/replyShape.js'

export type Window = Readonly<{ name: string; from: number; to: number; count?: number }>
export type Message = Readonly<{ role: 'user' | 'assistant'; content: string }>
export type Turn = Readonly<{
  id: string
  window: string
  /** The model production answered with, from `response_events.model_id`. */
  model: string | null
  tone: string
  kinds: TurnKind[]
  hour: number
  displayName: string
  user: string
  /** What production actually replied. */
  reply: string
  messages: Message[]
}>
export type TurnKind = 'chat' | 'tool' | 'reply' | 'edgy'

/** A reply's response event lands within a couple of seconds of it; two minutes allows for slow turns. */
const EVENT_WINDOW_MS = 120_000
/** Production rehydrates at most 20 messages; the current user message is the twentieth. */
const HISTORY_ROWS = 19
const HISTORY_SPAN_MS = 30 * 60_000
const REPLY_BLOCK = /^\s*\[Replying to[^\n]*\[Container:/i
const TOOL_MESSAGE =
  /\[Watched media|\bLinked post\b|https?:\/\/\S+|\b(?:explain|what[- ]is|what's|verify|fact[- ]?check|summari[sz]e)\b/i

export function turnKinds(message: string, toolsUsed: string | null): TurnKind[] {
  const kinds: TurnKind[] = []
  const reply = REPLY_BLOCK.test(message)
  const ownMessage = reply ? message.slice(message.indexOf(']') + 1) : message
  const tool =
    Boolean(toolsUsed && toolsUsed !== '[]' && JSON.parse(toolsUsed).includes('search_web')) ||
    TOOL_MESSAGE.test(ownMessage)
  if (tool) kinds.push('tool')
  if (reply) kinds.push('reply')
  if (messageEdge(message) !== 'none') kinds.push('edgy')
  if (!tool && !reply && !kinds.includes('edgy')) kinds.push('chat')
  return kinds
}

export function parseWindow(spec: string): Window {
  const match = /^([^=]+)=([^.]+)\.\.([^:]+(?::\d\d){0,2}Z?)(?::(\d+))?$/.exec(spec)
  if (!match) throw new Error(`--window must look like name=<from ISO>..<to ISO>[:count], got: ${spec}`)
  const from = Date.parse(match[2])
  const to = Date.parse(match[3])
  if (Number.isNaN(from) || Number.isNaN(to)) throw new Error(`--window has an unreadable date: ${spec}`)
  if (to < from) throw new Error(`--window ${match[1]} ends before it starts`)
  return match[4] === undefined ? { name: match[1], from, to } : { name: match[1], from, to, count: Number(match[4]) }
}

export function localHour(ms: number, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(ms))
  return Number(hour)
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sample<T>(items: readonly T[], count: number, seed: number): T[] {
  const pool = [...items]
  const rand = mulberry32(seed)
  for (let index = pool.length - 1; index > 0; index--) {
    const swap = Math.floor(rand() * (index + 1))
    ;[pool[index], pool[swap]] = [pool[swap], pool[index]]
  }
  return pool.slice(0, count)
}

function mergeRoles(messages: readonly Message[]): Message[] {
  const out: Message[] = []
  for (const message of messages) {
    const last = out.at(-1)
    if (last && last.role === message.role)
      out[out.length - 1] = { ...last, content: `${last.content}\n\n${message.content}` }
    else out.push(message)
  }
  while (out[0]?.role === 'assistant') out.shift()
  return out
}

export function chatTurns(
  db: Database.Database,
  windows: readonly Window[],
  options: Readonly<{ seed: number; timeZone: string }>
): Turn[] {
  const replies = db
    .prepare(
      "SELECT rowid, channel_id, content, timestamp FROM session_history WHERE role = 'assistant' ORDER BY timestamp, rowid"
    )
    .all() as Array<{ rowid: number; channel_id: string; content: string; timestamp: number }>
  const eventFor = db.prepare(
    'SELECT model_id, tone, tools_used FROM response_events WHERE channel_id = ? AND abs(created_at - ?) <= ? ORDER BY abs(created_at - ?) LIMIT 1'
  )
  const userFor = db.prepare(
    "SELECT display_name, content, timestamp FROM session_history WHERE channel_id = ? AND role = 'user' AND timestamp <= ? ORDER BY timestamp DESC LIMIT 1"
  )
  const historyFor = db.prepare(
    'SELECT role, display_name, content FROM session_history WHERE channel_id = ? AND timestamp < ? AND timestamp > ? ORDER BY timestamp DESC LIMIT ?'
  )

  const byWindow = new Map<string, Turn[]>(windows.map((window) => [window.name, []]))
  for (const reply of replies) {
    const window = windows.find((candidate) => reply.timestamp >= candidate.from && reply.timestamp < candidate.to)
    if (!window) continue
    const event = eventFor.get(reply.channel_id, reply.timestamp, EVENT_WINDOW_MS, reply.timestamp) as
      | { model_id: string | null; tone: string | null; tools_used: string | null }
      | undefined
    if (!event) continue
    const user = userFor.get(reply.channel_id, reply.timestamp) as
      | { display_name: string; content: string; timestamp: number }
      | undefined
    if (!user) continue
    const kinds = turnKinds(user.content, event.tools_used)
    const history = (
      historyFor.all(reply.channel_id, user.timestamp, user.timestamp - HISTORY_SPAN_MS, HISTORY_ROWS) as Array<{
        role: string
        display_name: string
        content: string
      }>
    )
      .reverse()
      .map(
        (row): Message =>
          row.role === 'user'
            ? { role: 'user', content: `[${row.display_name}]: ${row.content}` }
            : { role: 'assistant', content: row.content }
      )
    byWindow.get(window.name)?.push({
      id: `chat:${reply.rowid}`,
      window: window.name,
      model: event.model_id,
      tone: event.tone ?? 'playful',
      kinds,
      hour: localHour(user.timestamp, options.timeZone),
      displayName: user.display_name,
      user: user.content,
      reply: reply.content,
      messages: mergeRoles([...history, { role: 'user', content: `[${user.display_name}]: ${user.content}` }])
    })
  }

  return windows.flatMap((window, index) => {
    const turns = byWindow.get(window.name) ?? []
    if (window.count === undefined) return turns
    return sample(turns, window.count, options.seed + index).sort((a, b) =>
      a.id.localeCompare(b.id, 'en', { numeric: true })
    )
  })
}
