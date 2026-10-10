import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { CaptureRecord } from '../captureSink.js'
import type { TranscriptLine } from '../run.js'
import type { PreviewAuthor, PreviewMessage } from './render.js'

export interface TranscriptTurnRecords {
  line: TranscriptLine
  records: readonly CaptureRecord[]
}

const TURN_GAP_MS = 60_000

/** Roka as she appears in the channel, with the app icon as her avatar when the repo's assets are present. */
export async function rokaAuthor(): Promise<PreviewAuthor> {
  const avatar = await readFile(resolve('assets/app-icon.jpg')).catch(() => null)
  return {
    name: 'Roka',
    bot: true,
    avatarUrl: avatar ? `data:image/jpeg;base64,${avatar.toString('base64')}` : undefined
  }
}

/** Lay a harness transcript out as the Discord channel would show it: each user line, then what Roka sent back. */
export function transcriptMessages(
  turns: readonly TranscriptTurnRecords[],
  roka: PreviewAuthor,
  start: Date
): PreviewMessage[] {
  const messages: PreviewMessage[] = []

  turns.forEach(({ line, records }, index) => {
    const timestamp = new Date(start.getTime() + index * TURN_GAP_MS)
    const user: PreviewAuthor = { name: line.displayName }
    const userMessage: PreviewMessage | null =
      line.kind === 'message' ? { author: user, timestamp, payload: line.content } : null
    if (userMessage) messages.push(userMessage)

    let interactionReply: PreviewMessage | null = null
    for (const record of records) {
      if (record.kind === 'typing') continue
      if (record.kind === 'react') {
        if (userMessage) {
          userMessage.reactions ??= []
          userMessage.reactions.push({ emoji: String(record.payload), count: 1, me: true })
        }
        continue
      }

      const reply: PreviewMessage = { author: roka, timestamp, payload: record.payload }
      if (line.kind === 'slash' && (record.kind === 'reply' || record.kind === 'editReply')) {
        reply.interaction = { user, command: 'ask' }
        // An edit replaces the deferred or earlier response in place rather than posting a new message.
        if (interactionReply) {
          interactionReply.payload = record.payload
          continue
        }
        interactionReply = reply
      } else if (record.kind === 'reply' && userMessage) {
        reply.replyTo = { author: user, text: line.content }
      }
      messages.push(reply)
    }
  })

  return messages
}
