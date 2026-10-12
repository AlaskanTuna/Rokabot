/**
 * Interactive CLI chat with Roka.
 * Uses the full prompt pipeline: tone detection -> prompt assembly -> Gemini API.
 *
 * Usage:
 *   npm run test:chat -- [displayName] [--live] [--html <path>]
 *
 * Uses the harness fake key by default. Pass --live to use
 * GRAPHIFY_GEMINI_API_KEY from .env. Pass --html to keep a Discord-style
 * preview of the conversation at <path>; the page reloads itself every 2s.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import * as readline from 'node:readline'
import type { PreviewMessage } from '../tests/harness/preview/render.js'

await import('../tests/harness/env.js')

const { generateResponse } = await import('../src/agent/roka.js')
const { withReplyOutcomes } = await import('../src/agent/replyOutcomes.js')
const { withSearchCitations } = await import('../src/agent/searchCitations.js')
const { guardMarkdown } = await import('../src/discord/markdownGuard.js')
const { buildRokaMessage } = await import('../src/discord/messageBuilder.js')
const { splitResponse } = await import('../src/discord/responses.js')
const { config } = await import('../src/config.js')
const { renderPayload } = await import('../tests/harness/renderPayload.js')
const { renderPreviewPage } = await import('../tests/harness/preview/render.js')
const { rokaAuthor } = await import('../tests/harness/preview/conversation.js')

const args = process.argv.slice(2)
const htmlIndex = args.indexOf('--html')
const htmlPath = htmlIndex >= 0 ? resolve(args[htmlIndex + 1] ?? 'preview-out/chat.html') : null
const displayName =
  args.find(
    (argument, index) => argument !== '--live' && (htmlIndex < 0 || index < htmlIndex || index > htmlIndex + 1)
  ) ?? 'Tester'
const previewMessages: PreviewMessage[] = []
const roka = await rokaAuthor()
const username = displayName.toLowerCase().replaceAll(/\s+/g, '-')
const channelId = 'cli-test-channel'
const guildId = 'cli-test-guild'
const userId = 'cli-test-user'

async function handleInput(line: string, rl: readline.Interface): Promise<void> {
  const trimmed = line.trim()
  if (!trimmed) {
    rl.prompt()
    return
  }

  if (trimmed === 'quit' || trimmed === 'exit') {
    console.log('\nBye bye~ See you next time!')
    rl.close()
    return
  }

  try {
    // Built the way messageCreate builds a reply, so the footer and any follow-up chunks match Discord
    const [[response, sources], replyOutcome] = await withReplyOutcomes(() =>
      withSearchCitations(() =>
        generateResponse({
          channelId,
          guildId,
          userMessage: trimmed,
          displayName,
          username,
          userId,
          memory: true
        })
      )
    )
    const [first = '', ...rest] = splitResponse(guardMarkdown(response.text))
    const payloads = [
      buildRokaMessage(
        first,
        response.tone,
        response.toolsUsed,
        sources,
        { status: 'none' },
        replyOutcome,
        response.watchOutcome
      ),
      ...rest.map((chunk) => buildRokaMessage(chunk, response.tone))
    ]
    for (const payload of payloads) {
      console.log(`${renderPayload({ kind: 'reply', payload, channelId, ts: Date.now() })}\n`)
    }

    if (htmlPath) {
      const now = new Date()
      const user = { name: displayName }
      previewMessages.push(
        { author: user, timestamp: now, payload: trimmed },
        ...payloads.map((payload, index) => ({
          author: roka,
          timestamp: now,
          payload,
          ...(index === 0 ? { replyTo: { author: user, text: trimmed } } : {})
        }))
      )
      await mkdir(dirname(htmlPath), { recursive: true })
      await writeFile(htmlPath, renderPreviewPage(previewMessages, { channelName: 'test-chat', refreshSeconds: 2 }))
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`  [error: ${msg}]\n`)
  }

  rl.prompt()
}

function main(): void {
  console.log('='.repeat(60))
  console.log('  Roka Test Chat')
  console.log('  Talking to Maniwa Roka via the full prompt pipeline.')
  console.log(`  Display name: ${displayName}`)
  console.log(`  History window: ${config.session.windowSize} messages`)
  console.log(`  Log level: ${config.logging.level} (set LOG_LEVEL in .env to change)`)
  if (htmlPath) console.log(`  Discord preview: ${htmlPath}`)
  console.log('  Type "quit" or "exit" to end. Ctrl+C also works.')
  console.log('='.repeat(60))
  console.log()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'You: '
  })

  rl.prompt()

  rl.on('line', (line) => {
    handleInput(line, rl)
  })

  rl.on('close', () => {
    console.log()
    process.exit(0)
  })
}

main()
