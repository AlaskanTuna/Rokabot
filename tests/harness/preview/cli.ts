import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import '../env.js'
import type { ToneKey } from '../../../src/agent/prompts/tones.js'
import { rokaAuthor, transcriptMessages } from './conversation.js'
import { type PreviewAuthor, type PreviewMessage, type PreviewPageOptions, renderPreviewPage } from './render.js'

const USAGE = `Usage: npm run preview -- [reply text] [options]

Input (pick one):
  <reply text>               Roka's reply, built with the real buildRokaMessage
  --file <path>              read the reply text from a file
  --payload <path.json>      render raw Discord message payloads (an object or an array)
  --transcript <path.jsonl>  run a harness transcript through the real Discord handlers
                             (offline model; a line's "reply" field scripts its answer)

Reply options:
  --tone <tone>              tone accent and expression (default: playful)
  --all-tones                render the reply once per tone
  --tools <a,b>              tool names for the footer, e.g. search_web,get_weather
  --sources <url,url>        citation links
  --prompt <text>            show a user message before the reply
  --user <name>              the user's display name (default: Tester)

Output:
  --out <path>               HTML file to write (default: preview-out/preview.html)
  --theme <dark|ash|onyx|light>
  --open                     open the file in the default browser`

function list(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : []
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      file: { type: 'string' },
      payload: { type: 'string' },
      transcript: { type: 'string' },
      tone: { type: 'string', default: 'playful' },
      'all-tones': { type: 'boolean', default: false },
      tools: { type: 'string' },
      sources: { type: 'string' },
      prompt: { type: 'string' },
      user: { type: 'string', default: 'Tester' },
      out: { type: 'string', default: 'preview-out/preview.html' },
      theme: { type: 'string', default: 'dark' },
      open: { type: 'boolean', default: false },
      live: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  })

  if (values.help) {
    console.log(USAGE)
    return
  }

  const [{ buildRokaMessage }, { TONE_PROMPTS }] = await Promise.all([
    import('../../../src/discord/messageBuilder.js'),
    import('../../../src/agent/prompts/tones.js')
  ])
  const tones = Object.keys(TONE_PROMPTS) as ToneKey[]
  const roka = await rokaAuthor()
  const user: PreviewAuthor = { name: values.user }
  const start = new Date()
  const messages: PreviewMessage[] = []
  let channelName = 'roka-preview'

  if (values.transcript) {
    const { runTranscript } = await import('../run.js')
    const report = await runTranscript(resolve(values.transcript), { live: values.live })
    messages.push(...transcriptMessages(report.turns, roka, start))
    channelName = 'harness'
  } else if (values.payload) {
    const parsed: unknown = JSON.parse(await readFile(resolve(values.payload), 'utf8'))
    for (const payload of Array.isArray(parsed) ? parsed : [parsed]) {
      messages.push({ author: roka, timestamp: start, payload })
    }
  } else {
    const text = values.file ? await readFile(resolve(values.file), 'utf8') : positionals.join(' ')
    if (!text.trim()) throw new Error(`Nothing to preview.\n\n${USAGE}`)
    if (!values['all-tones'] && !tones.includes(values.tone as ToneKey)) {
      throw new Error(`Unknown tone "${values.tone}". Pick one of: ${tones.join(', ')}`)
    }
    const sources = list(values.sources).map((url) => ({ url }))
    const chosen = values['all-tones'] ? tones : [values.tone as ToneKey]
    chosen.forEach((tone, index) => {
      // Eight minutes apart, so Discord's seven-minute grouping gives each tone its own header.
      const timestamp = new Date(start.getTime() + index * 8 * 60_000)
      const prompt = values['all-tones'] ? `${values.prompt ?? 'tone'}: ${tone}` : values.prompt
      const userMessage: PreviewMessage | null = prompt ? { author: user, timestamp, payload: prompt } : null
      if (userMessage) messages.push(userMessage)
      messages.push({
        author: roka,
        timestamp,
        payload: buildRokaMessage(text.trimEnd(), tone, list(values.tools), sources),
        replyTo: userMessage ? { author: user, text: prompt ?? '' } : undefined
      })
    })
  }

  const options: PreviewPageOptions = {
    channelName,
    theme: values.theme as PreviewPageOptions['theme'],
    mentions: { users: { roka: 'Roka' } }
  }
  const out = resolve(values.out)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, renderPreviewPage(messages, options))
  console.log(`Preview written to ${out}`)

  if (values.open) execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [out])
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
