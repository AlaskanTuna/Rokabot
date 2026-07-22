import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import './env.js'
import { createCaptureSink } from './captureSink.js'
import { makeClient, makeGuild, makeInteraction, makeMessage } from './discordDoubles.js'
import { renderPayload } from './renderPayload.js'
import {
  type TurnTiming,
  finishLlmTiming,
  finishTurnTiming,
  renderTimingTable,
  startLlmTiming,
  startTurnTiming
} from './timing.js'

export interface TranscriptAttachment {
  url: string
  contentType?: string | null
}

export interface TranscriptLine {
  kind: 'message' | 'slash'
  guildId: string
  channelId: string
  userId: string
  displayName: string
  content: string
  replyToId?: string
  attachments?: TranscriptAttachment[]
}

export interface TranscriptTurn {
  line: TranscriptLine
  rendered: string[]
  timing: TurnTiming
}

export interface TranscriptReport {
  turns: TranscriptTurn[]
  output: string
}

export interface RunTranscriptOptions {
  live?: boolean
}

function parseTranscriptLine(raw: string, lineNumber: number): TranscriptLine {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Transcript line ${lineNumber} is not valid JSON`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Transcript line ${lineNumber} must be an object`)
  }

  const line = parsed as Partial<TranscriptLine>
  if (line.kind !== 'message' && line.kind !== 'slash') {
    throw new Error(`Transcript line ${lineNumber} has an invalid kind`)
  }

  for (const field of ['guildId', 'channelId', 'userId', 'displayName', 'content'] as const) {
    if (typeof line[field] !== 'string' || line[field].length === 0) {
      throw new Error(`Transcript line ${lineNumber} requires a non-empty ${field}`)
    }
  }

  if (line.replyToId !== undefined && typeof line.replyToId !== 'string') {
    throw new Error(`Transcript line ${lineNumber} has an invalid replyToId`)
  }
  if (line.attachments !== undefined && !Array.isArray(line.attachments)) {
    throw new Error(`Transcript line ${lineNumber} has invalid attachments`)
  }

  return line as TranscriptLine
}

export async function loadTranscript(path: string): Promise<TranscriptLine[]> {
  const contents = await readFile(path, 'utf8')
  return contents
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => parseTranscriptLine(line, index + 1))
}

function fixturePath(args: readonly string[]): string {
  const fixture = args.find((arg) => arg !== '--live')
  if (!fixture) {
    throw new Error('Usage: npm run harness -- [--live] <transcript.jsonl>')
  }
  return resolve(fixture)
}

/** Drive one JSONL transcript through the real Discord handlers without connecting to Discord. */
export async function runTranscript(path: string, options: RunTranscriptOptions = {}): Promise<TranscriptReport> {
  const live = options.live ?? process.argv.includes('--live')
  const [{ config }, roka, messageEvents, interactionEvents, { RateLimiter }] = await Promise.all([
    import('../../src/config.js'),
    import('../../src/agent/roka.js'),
    import('../../src/discord/events/messageCreate.js'),
    import('../../src/discord/events/interactionCreate.js'),
    import('../../src/utils/rateLimiter.js')
  ])
  const lines = await loadTranscript(path)
  const client = makeClient()
  const rateLimiter = new RateLimiter({
    rpm: Math.max(config.rateLimit.rpm, lines.length + 1),
    rpd: config.rateLimit.rpd
  })
  const handleMessageCreate = messageEvents.createMessageHandler(client as never, rateLimiter)
  const handleInteractionCreate = interactionEvents.createInteractionHandler(rateLimiter)
  const channelIds = new Set<string>()
  const turns: TranscriptTurn[] = []
  let scriptedReply = ''
  let activeTiming: ReturnType<typeof startTurnTiming> | undefined
  ;(config.memory as { extractionInterval: number }).extractionInterval = Number.MAX_SAFE_INTEGER

  if (!live) {
    roka.__setTestRunTurnFactory(() => async () => {
      if (!activeTiming) throw new Error('Fake model invoked outside a transcript turn')
      startLlmTiming(activeTiming)
      try {
        return { text: scriptedReply, hasText: true, hasFunctionCall: false }
      } finally {
        finishLlmTiming(activeTiming)
      }
    })
  }

  try {
    for (const [index, line] of lines.entries()) {
      const sink = createCaptureSink()
      const guild = makeGuild({ me: { displayName: client.user?.displayName } })
      scriptedReply = `Harness reply ${index + 1}: ${line.content}`
      activeTiming = startTurnTiming()
      channelIds.add(line.channelId)

      if (line.kind === 'message') {
        const referencedMessages = line.replyToId
          ? {
              [line.replyToId]: makeMessage({
                author: {
                  id: client.user?.id,
                  bot: true,
                  username: client.user?.username,
                  displayName: client.user?.displayName
                },
                content: 'Previous Roka reply',
                guildId: line.guildId,
                guild
              })
            }
          : undefined
        const message = makeMessage({
          author: { id: line.userId, username: line.displayName.toLowerCase(), displayName: line.displayName },
          mentions:
            line.content.includes(`<@${client.user?.id}>`) || line.content.includes(`<@!${client.user?.id}>`)
              ? [client.user!.id]
              : [],
          channelId: line.channelId,
          guildId: line.guildId,
          guild,
          member: { displayName: line.displayName },
          content: line.content,
          reference: line.replyToId,
          referencedMessages,
          attachments: line.attachments,
          sink
        })
        await handleMessageCreate(message as never)
      } else {
        const interaction = makeInteraction({
          channelId: line.channelId,
          guildId: line.guildId,
          member: { displayName: line.displayName },
          user: { id: line.userId, username: line.displayName.toLowerCase(), displayName: line.displayName },
          stringOptions: { message: line.content },
          attachmentOptions: line.attachments?.[0] ? { image: line.attachments[0] } : undefined,
          sink
        })
        await handleInteractionCreate(interaction as never)
      }

      const records = sink.all()
      const timing = finishTurnTiming(activeTiming, records)
      const rendered = records.map((record, recordIndex) => renderPayload(record, recordIndex, records))
      turns.push({ line, rendered, timing })
      activeTiming = undefined
    }
  } finally {
    roka.__resetTestRunTurnFactory()
    await Promise.all([...channelIds].map((channelId) => roka.destroySession(channelId)))
  }

  const output = [
    `Transcript: ${path}`,
    ...turns.flatMap((turn, index) => [
      '',
      `Turn ${index + 1}: ${turn.line.kind} ${turn.line.guildId}/${turn.line.channelId} (${turn.line.displayName})`,
      ...turn.rendered
    ]),
    '',
    'Timing',
    renderTimingTable(turns.map((turn, index) => ({ turn: index + 1, kind: turn.line.kind, timing: turn.timing })))
  ].join('\n')

  return { turns, output }
}

async function main(): Promise<void> {
  const path = fixturePath(process.argv.slice(2))
  const report = await runTranscript(path)
  console.log(report.output)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
