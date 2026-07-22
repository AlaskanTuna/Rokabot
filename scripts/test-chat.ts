/**
 * Interactive CLI chat with Roka.
 * Uses the full prompt pipeline: tone detection -> prompt assembly -> Gemini API.
 *
 * Usage:
 *   npm run test:chat -- [displayName] [--live]
 *
 * Uses the harness fake key by default. Pass --live to use
 * GRAPHIFY_GEMINI_API_KEY from .env.
 */

import * as readline from 'node:readline'

await import('../tests/harness/env.js')

const { generateResponse } = await import('../src/agent/roka.js')
const { buildRokaMessage } = await import('../src/discord/messageBuilder.js')
const { config } = await import('../src/config.js')
const { renderPayload } = await import('../tests/harness/renderPayload.js')

const displayName = process.argv.slice(2).find((argument) => argument !== '--live') ?? 'Tester'
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
    const response = await generateResponse({
      channelId,
      guildId,
      userMessage: trimmed,
      displayName,
      username,
      userId
    })

    console.log(
      `${renderPayload({
        kind: 'reply',
        payload: buildRokaMessage(response.text, response.tone),
        channelId,
        ts: Date.now()
      })}\n`
    )
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
