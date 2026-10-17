import { createHash } from 'node:crypto'
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { type Node, parseDocument } from 'yaml'
import { type Path, addItem, deleteNode, removeItem, setNode, setScalar, spellFlow } from '../src/lib/yamlEdit'
import { REPO, sandboxPaths } from './sandbox'

/**
 * Dev-only datasets for break-testing the studio at its data boundary, the files it reads. `worst` fills every value
 * with the longest or busiest thing the schemas accept, `empty` empties every list that may be empty, and `one` leaves
 * one of everything, so counts read 1. Each still loads: the pack and config.yml pass the bot's own checks. Edits go
 * through the studio's own in-place YAML helpers, so comments and layout elsewhere stay as the repo has them.
 */
export const DATASETS = ['worst', 'empty', 'one'] as const
export type Dataset = (typeof DATASETS)[number]

/** The dataset `E2E_DATA` names, or undefined when it is unset. */
export function datasetFromEnv(value = process.env.E2E_DATA): Dataset | undefined {
  if (!value) return undefined
  if (!(DATASETS as readonly string[]).includes(value)) {
    throw new Error(`E2E_DATA must be one of ${DATASETS.join(', ')}, got: ${value}`)
  }
  return value as Dataset
}

type Edit = (text: string) => string

function edit(file: string, ...edits: Edit[]): void {
  writeFileSync(
    file,
    edits.reduce((text, change) => change(text), readFileSync(file, 'utf8'))
  )
}

const read = (text: string) => parseDocument(text).toJS() as Record<string, Record<string, unknown>>

/** Where the top-level block `key` ends: the next line that starts at column 0, before any blank lines. */
function blockRange(text: string, key: string): [number, number] {
  const start = text.search(new RegExp(`^${key}:`, 'm'))
  if (start === -1) throw new Error(`no top-level ${key}`)
  const next = text.slice(start).search(/\n\S/)
  let end = next === -1 ? text.length : start + next + 1
  while (end > start + 1 && text[end - 1] === '\n' && text[end - 2] === '\n') end--
  return [start, end]
}

const appendToBlock =
  (key: string, lines: string[]): Edit =>
  (text) => {
    const [, end] = blockRange(text, key)
    return `${text.slice(0, end)}${lines.join('\n')}\n${text.slice(end)}`
  }

const replaceBlock =
  (key: string, lines: string[]): Edit =>
  (text) => {
    const [start, end] = blockRange(text, key)
    return `${text.slice(0, start)}${lines.join('\n')}\n${text.slice(end)}`
  }

/** Sets the inline comment after the value at `path`, replacing any comment already on that line. */
const setComment =
  (path: Path, comment: string): Edit =>
  (text) => {
    const node = parseDocument(text).getIn(path, true) as Node | undefined
    if (!node?.range) throw new Error(`no value at ${path.join('.')}`)
    const end = text.indexOf('\n', node.range[1])
    return `${text.slice(0, node.range[1]).trimEnd()} # ${comment}${text.slice(end === -1 ? text.length : end)}`
  }

const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`
const pair = (indent: string, key: string, value: unknown) => `${indent}${spellFlow(key)}: ${spellFlow(value)}`

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** Deterministic token-shaped text, so the dataset is the same on every run. */
function token(seed: string, length: number, alphabet = BASE62): string {
  let out = ''
  let block = seed
  while (out.length < length) {
    block = createHash('sha256').update(block).digest('hex')
    for (let index = 0; index < block.length; index += 2) {
      out += alphabet[Number.parseInt(block.slice(index, index + 2), 16) % alphabet.length]
    }
  }
  return out.slice(0, length)
}

const base64url = (text: string) => Buffer.from(text).toString('base64url')

/** A 900-character RS256 JWT, the size a Google service-account assertion reaches. */
function jwt(): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: '7f3a2c91e4b05d18', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: 'aleksandra-bot@northwind-discord-prod.iam.gserviceaccount.example.com',
      sub: 'aleksandra-bot@northwind-discord-prod.iam.gserviceaccount.example.com',
      aud: 'https://oauth2.googleapis.example.com/token',
      scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/generative-language',
      iat: 1792224000,
      exp: 1792227600
    })
  )
  const length = 900 - header.length - payload.length - 2
  return `${header}.${payload}.${token('jwt-signature', length, `${BASE62}-_`)}`
}

const discordToken = () => `${token('discord-id', 26)}.${token('discord-ts', 6)}.${token('discord-hmac', 38)}`

// ---------------------------------------------------------------------------------------------------------------
// worst

const PACK_ID = 'aleksandra-wisniewska-kowalczyk2'
const WISTFUL = 'wistful-but-quietly-hopeful-after-closing-time'
const BEAT = 'tsundere-denial-then-an-immediate-confession'
const MAIN = 'openrouter-qwen3-coder-480b-a35b-instruct'
const FALLBACK = 'deepseek-direct-api-chat-v3'
const LONG_ENV = 'OPENROUTER_ENTERPRISE_EU_WEST_PRODUCTION_FALLBACK_API_KEY'

/** Prompt sections at or near the 48-character limit of the studio's section names and the API's new-file rule. */
const SECTIONS: Record<string, string> = {
  'backstory-growing-up-above-the-family-bakery':
    '{{char}} grew up in the two rooms above her grandmother’s bakery in {{world}}, falling asleep to the sound of the proofing cabinet and waking at four to the smell of the first pączki. She took over the counter at nineteen, the winter her grandmother’s hands stopped cooperating, and has run it ever since with the same flour-dusted ledger, the same brass bell over the door and the same stubborn refusal to raise the price of a drożdżówka by more than ten groszy a year.\n\nShe remembers every regular by their order before their name. She keeps a jar of broken cookies under the counter for children and for anyone who looks like they are having a bad day. She is proud of the shop, a little tired of it, and would never admit either out loud.',
  'polish-diminutives-and-terms-of-endearment':
    'When {{char}} is fond of someone she slips into diminutives: Oleńka, Kasieńka, Tomuś, słoneczko, kochanie. Use at most one per reply, never with someone she has just met, and never in a serious moment.',
  'how-to-answer-questions-about-real-world-news':
    'If someone asks about today’s news, a match result, a price or anything else {{char}} could only know from outside the shop, she says she has not had time to look, then answers from what the lookup returns. She never invents a score or a date.',
  'roleplay-limits-for-nsfw-adjacent-channels':
    'In channels marked as adult, {{char}} still keeps every reply suggestive at most. She plays flustered, changes the subject to pastries, or threatens to make them wash the pączki fryer.',
  'server-inside-jokes-and-running-gags-2026':
    'The server’s running gags: the cursed sourdough starter named Zbigniew, the time the delivery van got stuck in the market square for six hours, and the eternal argument over whether a pączek with rose jam beats one with custard.',
  'anime-after-the-knowledge-cutoff-what-to-say':
    'For a series or episode newer than what she knows, {{char}} admits she is behind, asks what they thought of it, and offers to look up the air date.',
  'name-days-holidays-and-seasonal-shop-events':
    'Name days matter more than birthdays to {{char}}. On Tłusty Czwartek the queue goes round the block; at Christmas she bakes makowiec and piernik for the whole street; in summer the shop smells of strawberries and she complains about the heat from the ovens.',
  'relationships-with-the-other-bots-on-this-server':
    '{{char}} treats the music bot as a noisy neighbour and the moderation bot as the strict aunt everyone is a little afraid of. She never claims to control either one.',
  'discord-formatting-markdown-emoji-and-spoilers':
    'Use Discord markdown sparingly: *italics* for asides, **bold** for one word at most, ||spoilers|| for anything about a plot. No headings, no tables, no code blocks.',
  faq: 'Opening hours, the address of the shop and the price list live in the pinned message in #piekarnia; point people there.'
}

/** A pack prompt that is not in the order yet, so the Prompts screen lists it under Other prompts. */
const UNORDERED = 'notes-from-the-mod-team-not-in-the-prompt-yet'
/** A harness prompt with a 48-character name. */
const HARNESS_EXTRA = 'community-guidelines-for-the-polish-anime-server'

const SOFT_WORDS = [
  'Oh,',
  'Oh?',
  'Hmm,',
  'Well,',
  'Come on,',
  'Now, now,',
  'No cóż,',
  'Ojej,',
  'Ach,',
  'Ech,',
  'Hej,',
  'Słuchaj,',
  'Wiesz co,',
  'No proszę,',
  'Patrzcie państwo,',
  'Ojejku,',
  'O rety,',
  'Kurczę,',
  'No nie,',
  'Serio?',
  'Aha,',
  'Mhm,',
  'No dobrze,',
  'Spokojnie,',
  'Chwileczkę,',
  'Zaraz, zaraz,',
  'Ano,',
  'Ee,',
  'Uhm,',
  'Ah,',
  'Huh,',
  'Right,',
  'Okay,',
  'So,',
  'Look,',
  'Listen,',
  'Honestly,',
  'Goodness,',
  'My, my,',
  'Oh dear,',
  'Ara ara,',
  'Nee,',
  'Ano ne,',
  'Sou ka,'
]

/** 60 kaomoji: ten eye pairs by six mouths, each plain-bracketed as voice.yml asks. */
function celebratingFaces(): string[] {
  const eyes = [
    ['^', '^'],
    ['≧', '≦'],
    ['◕', '◕'],
    ['・', '・'],
    ['´', '｀'],
    ['•̀', '•́'],
    ['◠', '◠'],
    ['⌒', '⌒'],
    ['ᵔ', 'ᵔ'],
    ['˘', '˘']
  ]
  return eyes.flatMap(([left, right]) => ['▽', 'ω', 'ᴗ', '‿', '∀', 'ヮ'].map((mouth) => `(${left}${mouth}${right})`))
}

const DETECTION_PATTERNS = [
  '\\bpamiętasz\\b',
  '\\bwspomnie',
  '\\bdawno temu\\b',
  '\\bkiedyś\\b',
  '\\btęskni',
  '\\bnostalgi',
  '\\bwieczor',
  '\\bzachód słońca\\b',
  '\\bdeszcz',
  '\\bherbat',
  '\\bzamknię',
  '\\bpo pracy\\b',
  '\\bcicho\\b',
  '\\bsamotn',
  '\\bmarzeni',
  '\\bnadziej',
  '\\bjutro\\b',
  '\\bdzieciństw',
  '\\bbabci',
  '\\bdziadk',
  '\\bstare zdjęci',
  '\\balbum',
  '\\bpocztówk',
  '\\bwakacj',
  '\\bmorze\\b',
  '\\bgóry\\b',
  '\\bjesie[nń]\\b',
  '\\bliście\\b',
  '\\bpierwszy śnieg\\b',
  '\\bwigili',
  '\\bkolęd',
  '\\bremember when\\b',
  '\\bback then\\b',
  '\\blong ago\\b',
  '\\bmiss (?:you|those|the old)\\b',
  '\\bold days\\b',
  '\\bgood old\\b',
  '\\bchildhood\\b',
  '\\bgrandma\\b',
  '\\bgrandpa\\b',
  '\\bhometown\\b',
  '\\bused to\\b',
  '\\bthose days\\b',
  '\\bwistful',
  '\\bbittersweet\\b',
  '\\bsunset\\b',
  '\\braining\\b',
  '\\brainy\\b',
  '\\bquiet night\\b',
  '\\bafter closing\\b',
  '\\bempty shop\\b',
  '\\blast customer\\b',
  '\\bhope (?:so|tomorrow)\\b',
  '\\btomorrow will\\b',
  '\\bsomeday\\b',
  '\\bone day\\b',
  '\\bphotos? from\\b',
  '\\bold letters?\\b',
  '\\bmixtape\\b',
  '🌙|🌧️|🍂|📷'
]

const PORTRAITS = [
  'wistful_looking_out_of_the_rain_streaked_window',
  'counting_the_till_after_closing',
  'holding_her_grandmothers_recipe_book',
  'half_asleep_on_the_counter',
  'smiling_at_an_old_photograph',
  'turning_the_open_sign_to_closed',
  'wrapped_in_a_blanket_with_tea',
  'watching_the_last_tram_go_by'
]

const portraitUrl = (name: string) =>
  `https://cdn.northwind-industries-holdings.example.com/characters/${PACK_ID}/expressions/v12/${name}.webp?width=512&quality=85&format=webp`

const LONG_DECLINE =
  'Ojej, ojej~ wszyscy naraz! Daj mi chwilkę, dobrze? Właśnie odpisuję trzem osobom jednocześnie, a do tego ktoś zostawił otwarte drzwi i wiatr rozwiał wszystkie paragony po podłodze. Zaraz wracam, obiecuję: nalej sobie herbaty, usiądź wygodnie i poczekaj na mnie dosłownie minutkę. Mou~ I’m only one shopkeeper, you know! Hold that thought for me, okay? I’ll be right back with you in a moment, I promise~'

/** Exactly 100 characters as written, the most a slash command description may have; {{char}} fills to 102. */
const ASK_100 = 'Ask {{char}} anything: she checks the shop’s notes, the web or the anime schedule when she needs to.'

interface CompatibleModel {
  key: string
  model: string
  baseUrl: string
  apiKeyEnv?: string
  extra?: Record<string, unknown>
  note?: string
}

const MODELS: CompatibleModel[] = [
  {
    key: MAIN,
    model: 'qwen/qwen3-coder-480b-a35b-instruct:nitro',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: LONG_ENV,
    extra: {
      price: { input: 0.22, output: 0.95 },
      limits: { rpm: 60, rpd: 20000, tpm: 400000 },
      capabilities: { structuredOutput: 'json_schema', contextWindow: 262144, maxOutputTokens: 65536 },
      extraBody: { provider: { order: ['Cerebras', 'Together'], allow_fallbacks: false } }
    },
    note: `Needs ${LONG_ENV}; pinned to Cerebras, then Together through provider.order, so a slow route never falls back to a pricier one`
  },
  {
    key: FALLBACK,
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    extra: { price: { input: 0.27, output: 1.1 } }
  },
  {
    key: 'ollama-on-the-living-room-gaming-pc-over-tailscale',
    model: 'hf.co/bartowski/Qwen2.5-32B-Instruct-GGUF:Q4_K_M',
    baseUrl: 'http://gaming-pc.tail7f3a2.ts.net:11434/v1',
    note: 'Keyless; only up while the gaming PC is on, so never make it main or fallback'
  },
  {
    key: 'together-llama-3-3-70b-instruct-turbo',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    baseUrl: 'https://api.together.xyz/v1',
    apiKeyEnv: 'TOGETHER_API_KEY'
  },
  {
    key: 'fireworks-llama-v3p3-70b-instruct',
    model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    apiKeyEnv: 'FIREWORKS_API_KEY'
  },
  {
    key: 'groq-llama-3-3-70b-versatile',
    model: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY'
  },
  {
    key: 'mistral-large-latest-eu',
    model: 'mistral-large-2411',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyEnv: 'MISTRAL_API_KEY'
  },
  {
    key: 'cerebras-qwen-3-235b-a22b-instruct-2507',
    model: 'qwen-3-235b-a22b-instruct-2507',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyEnv: 'CEREBRAS_API_KEY'
  },
  {
    key: 'xai-grok-4-fast-non-reasoning',
    model: 'grok-4-fast-non-reasoning',
    baseUrl: 'https://api.x.ai/v1',
    apiKeyEnv: 'XAI_API_KEY'
  },
  {
    key: 'lm-studio-macbook',
    model: 'lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF',
    baseUrl: 'http://192.168.178.42:1234/v1'
  },
  {
    key: 'northwind-vllm-gateway-eu-west-4-production',
    model: 'northwind/aleksandra-roleplay-qwen2.5-72b-instruct-awq-v12',
    baseUrl: 'https://vllm-gateway.eu-west-4.inference.northwind-industries-holdings.example.com/v1',
    apiKeyEnv: 'NORTHWIND_VLLM_GATEWAY_TOKEN',
    extra: { capabilities: { vision: true, efforts: ['low', 'medium', 'high'] }, effort: 'medium' }
  },
  {
    key: 'gemini-openai-compat-endpoint',
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnv: 'GEMINI_API_KEY'
  }
]

/** About 200 characters each: the inline comments that become the longest help lines on the config screens. */
const LONG_COMMENTS: [Path, string][] = [
  [
    ['rateLimit', 'rpm'],
    'Requests per minute across every model call this bot makes; the Gemini free tier allows 15, a paid tier 2,000, and OpenRouter bills per token instead, so raise this only after checking your plan'
  ],
  [
    ['discord', 'maxMessageLength'],
    'Characters per reply before the bot splits it into a second message; Discord caps plain messages at 2,000 and Components V2 text at 4,000, minus the tool-disclosure footer under each reply'
  ],
  [
    ['memory', 'bufferSize'],
    'Messages kept per channel in the passive ring buffer, in memory only; on the Pi 5 every 10 extra messages across 40 monitored channels cost about 1.5 MB of RSS, so measure before raising it'
  ],
  [
    ['session', 'windowSize'],
    'Messages kept in each channel’s ADK session history and rehydrated from SQLite after a restart; a larger window gives the model more context, but every extra message is re-sent on every turn'
  ]
]

const envFile = (lines: string[]) => `${lines.join('\n')}\n`

/** 30 keys: every .env.example key a deployer fills, a 57-character key name, a 900-character JWT, lowercase proxy keys. */
function worstEnv(): string {
  const key = (seed: string, prefix: string, length: number) => `${prefix}${token(seed, length - prefix.length)}`
  return envFile([
    '# Required secrets (tunables are in config.yml)',
    `DISCORD_TOKEN=${discordToken()}`,
    'DISCORD_CLIENT_ID=1284567890123456789',
    `GEMINI_API_KEY=AIza${token('gemini', 35)}`,
    `GRAPHIFY_GEMINI_API_KEY=AIza${token('graphify', 35)}`,
    'DEV_GEMINI_API_KEY=',
    'ROKABOT_DB_PATH=data/aleksandra-wisniewska-kowalczyk2/rokabot.db',
    `TAVILY_API_KEY=${key('tavily', 'tvly-dev-', 41)}`,
    'YOUTUBE_API_KEY=',
    `MODELSCOPE_API_KEY=ms-${token('modelscope', 8).toLowerCase()}-${token('modelscope-2', 4).toLowerCase()}-${token('modelscope-3', 20).toLowerCase()}`,
    `ANTHROPIC_API_KEY=${key('anthropic', 'sk-ant-api03-', 108)}`,
    `OPENAI_API_KEY=${key('openai', 'sk-proj-', 164)}`,
    `OPENROUTER_API_KEY=${key('openrouter', 'sk-or-v1-', 73)}`,
    `${LONG_ENV}=${key('openrouter-enterprise', 'sk-or-v1-', 73)}`,
    `DEEPSEEK_API_KEY=${key('deepseek', 'sk-', 35)}`,
    `TYPESAFE_API_KEY=${key('typesafe', 'ts_live_', 48)}`,
    '# Keys for the openai-compatible entries; Together and Cerebras were never filled in',
    'TOGETHER_API_KEY=',
    `export GROQ_API_KEY=${key('groq', 'gsk_', 56)}`,
    'CEREBRAS_API_KEY=',
    `NORTHWIND_VLLM_GATEWAY_TOKEN=${token('northwind', 64).toLowerCase()}`,
    `GOOGLE_SERVICE_ACCOUNT_JWT=${jwt()}`,
    `LANGFUSE_PUBLIC_KEY=pk-lf-${token('langfuse-public', 36).toLowerCase()}`,
    `LANGFUSE_SECRET_KEY=sk-lf-${token('langfuse-secret', 36).toLowerCase()}`,
    'ROKA_TAG=v0.3',
    'COMPOSE_PROFILES=autoupdate,local-embeddings',
    'MEDIA_TRANSCRIBER_URL=http://asr.internal.northwind-industries-holdings.example.com:8000',
    'UPDATES_NOTIFY=false',
    'TZ=Europe/Warsaw',
    '# The office proxy; lowercase is what curl and most CLIs read',
    'https_proxy=http://proxy.northwind-industries-holdings.example.com:3128',
    'no_proxy=localhost,127.0.0.1,.ts.net,.internal.northwind-industries-holdings.example.com',
    `SENTRY_DSN=https://${token('sentry', 32).toLowerCase()}@o4507.ingest.de.sentry.example.com/4508123456789`
  ])
}

function applyWorst(root: string): void {
  const { packDir, harnessDir, configPath, envPath } = sandboxPaths(root)
  const prompts = join(packDir, 'prompts')
  const sections = Object.keys(SECTIONS)

  edit(
    join(packDir, 'character.yml'),
    (text) => setScalar(text, ['id'], PACK_ID),
    (text) => setScalar(text, ['name'], 'Aleksandra'),
    (text) => setScalar(text, ['fullName'], 'Aleksandra Małgorzata Wiśniewska-Kowalczyk'),
    (text) => setScalar(text, ['world'], 'Szczebrzeszyn, powiat zamojski, województwo lubelskie'),
    (text) =>
      setNode(
        text,
        ['triggers', 'names'],
        ['aleksandra', 'ola', 'oleńka', 'pani wiśniewska', 'アレクサンドラ', 'александра']
      ),
    (text) => setScalar(text, ['model', 'temperature'], 2),
    (text) => setScalar(text, ['model', 'topP'], 1),
    (text) =>
      setNode(
        text,
        ['prompt', 'system'],
        [
          'intro',
          'who-you-are',
          sections[0],
          'how-you-speak',
          sections[1],
          'answering',
          sections[2],
          'images',
          'audio-video',
          'tools',
          'boundaries',
          ...sections.slice(3),
          'speech'
        ]
      ),
    (text) =>
      setScalar(
        text,
        ['situation', 'timeOfDay', 0, 'text'],
        'wczesny poranek — the ovens have been on since four, the first trays of pączki are cooling on the counter, flour is everywhere, and you are pretending to be awake for the delivery driver who always arrives too early'
      ),
    (text) =>
      setScalar(
        text,
        ['judge', 'lookupQuestion'],
        'Does answering `message` need a specific, niche, recent or real-world fact Aleksandra would not reliably know from behind the counter of a family bakery in Szczebrzeszyn, such as today’s news, a release date, a price or a score?'
      ),
    (text) =>
      setScalar(
        text,
        ['judge', 'moodQuestion'],
        'Which mood should Aleksandra, a warm, teasing and now and then melancholic baker who has run her grandmother’s shop since she was nineteen, reply to `message` in, given `recent_messages` and `time_of_day`?'
      )
  )
  for (const [name, body] of Object.entries(SECTIONS)) {
    const title = name.split('-').join(' ')
    writeFileSync(join(prompts, `${name}.md`), `## ${title.charAt(0).toUpperCase()}${title.slice(1)}\n\n${body}\n`)
  }
  writeFileSync(
    join(prompts, `${UNORDERED}.md`),
    '## Notes From the Mod Team\n\nDraft: how {{char}} should react when someone posts in the wrong channel. Not wired into the order until the mods agree on the wording.\n'
  )
  writeFileSync(
    join(harnessDir, `${HARNESS_EXTRA}.md`),
    '## Community Guidelines\n\nThe server rules every character follows: no spoilers outside spoiler tags, no politics, and English or Polish only in the main channels.\n'
  )

  edit(
    join(packDir, 'voice.yml'),
    (text) => setNode(text, ['openers', 'soft', 'words'], SOFT_WORDS),
    (text) =>
      setNode(text, ['openers', 'soft', 'moodWords'], {
        sleepy: ['Nn...', 'Ziew...', 'Mmh...'],
        [WISTFUL]: ['Wiesz,', 'Pamiętasz,', 'Hmm...']
      }),
    (text) => setNode(text, ['openers', 'particle', 'skipMoods'], ['sincere', 'tender', 'nostalgic', WISTFUL]),
    (text) =>
      addItem(
        text,
        ['openers', 'comedy', 'bits'],
        'a full-blown courtroom drama in which you prosecute them for crimes against sweets, call your own grandmother as a surprise witness, object to everything they say, and then sentence them to a lifetime of washing the mochi mortar, all in one breath'
      ),
    (text) => setNode(text, ['faces', 'celebrating'], celebratingFaces()),
    appendToBlock('beats', [
      `  - name: ${BEAT}`,
      '    edges: [none, lewd]',
      `    line: ${quoted('- Deny caring about them in one sentence, then give yourself away completely in the very next one.')}`
    ]),
    (text) =>
      addItem(text, ['threats'], {
        text: 'zmywanie wszystkich garnków po Wigilii dla całej rodziny',
        seen: 'wigili|garnk'
      }),
    (text) =>
      addItem(text, ['threats'], {
        text: 'a strongly worded letter to their grandmother, in Polish, with every diacritic',
        seen: 'letter|grandmother|babci'
      })
  )

  edit(
    join(packDir, 'moods.yml'),
    (text) => setScalar(text, ['default'], WISTFUL),
    (text) => setScalar(text, ['safe'], WISTFUL),
    (text) => setScalar(text, ['lateNight', 'mood'], WISTFUL),
    appendToBlock('detection', [
      `  - mood: ${WISTFUL}`,
      '    minMatches: 3',
      '    patterns:',
      ...DETECTION_PATTERNS.map((pattern) => `      - ${quoted(pattern)}`)
    ]),
    appendToBlock('moods', [
      `  ${WISTFUL}:`,
      pair('    ', 'prompt', `moods/${WISTFUL}`),
      pair('    ', 'faces', ['soft', 'sad', 'happy', 'teasing', 'smug', 'surprised', 'celebrating', 'flustered']),
      pair('    ', 'beats', { flirt: 0.15, oneesan: 0.1, drama: 0.05, [BEAT]: 0.35 }),
      pair(
        '    ',
        'judge',
        'a quiet, reflective message late in the day: memories, missing someone or somewhere, rain on the window, the shop after closing, or a hope that tomorrow goes better; not sadness that needs real comfort'
      ),
      pair('    ', 'color', '#7a8cc2'),
      pair('    ', 'placeholder', 'https://placehold.co/80x80/7A8CC2/white?text=%E2%98%BE'),
      pair('    ', 'portraits', PORTRAITS),
      pair('    ', 'emoji', '🌙'),
      pair('    ', 'adjective', 'wistful'),
      pair('    ', 'season', 'Długie wieczory po zamknięciu sklepu, kiedy deszcz bębni o szyby')
    ]),
    (text) =>
      setNode(
        text,
        ['moodPairs', `${WISTFUL}:sincere`],
        'Długie wieczory po zamknięciu sklepu, kiedy deszcz bębni o szyby, a herbata dawno wystygła'
      ),
    (text) => setNode(text, ['moodPairs', `playful:${WISTFUL}`], 'A Little Rain Between the Jokes'),
    ...PORTRAITS.map((name) => (text: string) => setNode(text, ['portraitUrls', name], portraitUrl(name)))
  )
  writeFileSync(
    join(prompts, 'moods', `${WISTFUL}.md`),
    '## Mood: Wistful\n\n{{char}} is quieter than usual: the shop is closed, the till is counted, and she lets herself remember. She answers warmly and a little slowly, drifts into a memory if one fits, and ends on something hopeful about tomorrow. No big jokes, no drama.\n'
  )

  edit(
    join(packDir, 'lines.yml'),
    (text) => addItem(text, ['replies', 'decline'], LONG_DECLINE),
    (text) => setScalar(text, ['commands', 'ask'], ASK_100)
  )

  // Other packs to switch to, with folder names at the API's 32-character limit and below.
  for (const folder of ['ola-wisniewska-polish-translated', 'roka-backup-2026-10-17', 'jo']) {
    cpSync(join(REPO, 'studio', 'template'), join(root, 'characters', folder), { recursive: true })
  }

  edit(
    configPath,
    (text) => setScalar(text, ['llm', 'main'], MAIN),
    (text) => setScalar(text, ['llm', 'fallback'], FALLBACK),
    (text) => setNode(text, ['llm', 'monthlyBudgetUsd', 'openai-compatible'], 1284.5),
    ...MODELS.flatMap(({ key, model, baseUrl, apiKeyEnv, extra, note }): Edit[] => [
      (text) =>
        setNode(text, ['llm', 'models', key], {
          provider: 'openai-compatible',
          model,
          baseUrl,
          ...(apiKeyEnv ? { apiKeyEnv } : {}),
          ...extra
        }),
      ...(note ? [setComment(['llm', 'models', key], note)] : [])
    ]),
    ...LONG_COMMENTS.map(([path, text]) => setComment(path, text)),
    (text) =>
      setScalar(text, ['updates', 'repo'], 'northwind-industries-holdings/aleksandra-wisniewska-kowalczyk-discord-bot'),
    (text) => setScalar(text, ['timezone'], 'Europe/Warsaw')
  )

  writeFileSync(envPath, worstEnv(), { mode: 0o600 })
}

// ---------------------------------------------------------------------------------------------------------------
// empty

/** Top-level config blocks the bot fills with its defaults when they are missing. */
const OPTIONAL_BLOCKS = [
  'jev',
  'gemini',
  'fallback',
  'rateLimit',
  'session',
  'socialPosts',
  'media',
  'memory',
  'embeddings',
  'metrics',
  'report',
  'emoji',
  'reminders',
  'games',
  'updates',
  'logging'
]

/** The fewest keys the bot starts with: Discord's two, and Gemini's for the default media watcher and embeddings. */
const MINIMAL_ENV = () =>
  envFile([
    `DISCORD_TOKEN=${discordToken()}`,
    'DISCORD_CLIENT_ID=1284567890123456789',
    `GEMINI_API_KEY=AIza${token('gemini', 35)}`
  ])

function applyEmpty(root: string): void {
  const { packDir, configPath, envPath, envExamplePath } = sandboxPaths(root)
  const styles = Object.keys(read(readFileSync(join(packDir, 'voice.yml'), 'utf8')).openers)
  const moods = Object.keys(read(readFileSync(join(packDir, 'moods.yml'), 'utf8')).moods)

  edit(
    join(packDir, 'voice.yml'),
    replaceBlock('beats', ['beats: []']),
    ...styles.flatMap((style): Edit[] =>
      ['skipMoods', 'skipOnHardLine', 'moodWords'].map((key) => (text) => {
        const opener = read(text).openers[style] as Record<string, unknown>
        return key in opener ? deleteNode(text, ['openers', style, key]) : text
      })
    )
  )

  edit(
    join(packDir, 'moods.yml'),
    (text) => deleteNode(text, ['lateNight']),
    replaceBlock('detection', ['detection: []']),
    replaceBlock('moodPairs', [
      'moodPairs: {} # /stats season title for a dominant:runner-up pair; a mood’s season covers every other pair'
    ]),
    replaceBlock('portraitUrls', ['portraitUrls: {} # Image for each portrait a mood names']),
    ...moods.flatMap((mood): Edit[] =>
      ['beats', 'portraits'].map((key) => (text) => {
        const entry = read(text).moods[mood] as Record<string, unknown>
        return key in entry ? deleteNode(text, ['moods', mood, key]) : text
      })
    )
  )

  edit(
    configPath,
    ...OPTIONAL_BLOCKS.map((block) => (text: string) => deleteNode(text, [block])),
    replaceBlock('llm', [
      'llm:',
      '  main: local # Required; a key under llm.models (LLM_MAIN overrides)',
      '  monthlyBudgetUsd: {} # Local monthly spend cap per paid provider',
      '  models:',
      "    local: { provider: openai-compatible, model: 'qwen3:32b', baseUrl: 'http://localhost:11434/v1' }"
    ]),
    (text) => text.replace(/\n{3,}/g, '\n\n')
  )

  rmSync(envExamplePath, { force: true })
  writeFileSync(envPath, MINIMAL_ENV(), { mode: 0o600 })
}

// ---------------------------------------------------------------------------------------------------------------
// one

const KEEP_MOOD = 'playful'

function applyOne(root: string): void {
  const { packDir, configPath, envPath, envExamplePath } = sandboxPaths(root)
  const voice = read(readFileSync(join(packDir, 'voice.yml'), 'utf8')) as {
    openers: Record<string, Record<string, unknown>>
    faces: Record<string, string[]>
  }
  const moods = Object.keys(read(readFileSync(join(packDir, 'moods.yml'), 'utf8')).moods)
  const replies = read(readFileSync(join(packDir, 'lines.yml'), 'utf8')).replies as Record<string, string[]>

  edit(
    join(packDir, 'character.yml'),
    (text) => setScalar(text, ['id'], 'jo'),
    (text) => setScalar(text, ['name'], 'Jo'),
    (text) => setScalar(text, ['fullName'], 'Jo'),
    (text) => setNode(text, ['triggers', 'names'], ['jo']),
    (text) => setNode(text, ['prompt', 'system'], ['who-you-are']),
    // One band cannot cover the day: from and to must differ, so two is the fewest.
    (text) =>
      text.replace(
        /^( {2}timeOfDay:.*\n)(?: {4}- .*\n)+/m,
        '$1    - { from: 6, to: 22, text: daytime — the shop is open }\n    - { from: 22, to: 6, text: night — the shop is closed }\n'
      )
  )

  edit(
    join(packDir, 'voice.yml'),
    ...Object.entries(voice.openers).flatMap(([style, opener]): Edit[] =>
      ['skipMoods', 'moodWords']
        .filter((key) => key in opener)
        .map((key) => (text: string) => deleteNode(text, ['openers', style, key]))
    ),
    (text) => setNode(text, ['openers', 'soft', 'words'], ['Oh,']),
    (text) => setNode(text, ['openers', 'particle', 'words'], ['Ara~']),
    (text) => setNode(text, ['openers', 'gasp', 'words'], ['Huh?']),
    replaceBlock('beats', [
      'beats:',
      '  - name: flirt',
      '    edges: [none, lewd]',
      "    line: '- Slip in one line that is plainly sweet on them or teasingly suggestive, then play it off.'"
    ]),
    (text) => setNode(text, ['hardLineFaces'], ['furious']),
    ...Object.entries(voice.faces).map(
      ([group, faces]) =>
        (text: string) =>
          setNode(text, ['faces', group], faces.slice(0, 1))
    ),
    replaceBlock('threats', ['threats:', "  - { text: Dad's broom, seen: 'broom' }"])
  )
  edit(join(packDir, 'voice.yml'), (text) => {
    const bits = (read(text).openers.comedy as { bits: string[] }).bits
    return bits.slice(1).reduce((next) => removeItem(next, ['openers', 'comedy', 'bits'], 1), text)
  })

  edit(
    join(packDir, 'moods.yml'),
    ...moods.filter((mood) => mood !== KEEP_MOOD).map((mood) => (text: string) => deleteNode(text, ['moods', mood])),
    (text) => setScalar(text, ['safe'], KEEP_MOOD),
    (text) => setScalar(text, ['lateNight', 'mood'], KEEP_MOOD),
    replaceBlock('detection', [
      'detection:',
      `  - mood: ${KEEP_MOOD}`,
      '    minMatches: 1',
      '    patterns:',
      "      - '\\bhaha\\b'"
    ]),
    (text) => setNode(text, ['moods', KEEP_MOOD, 'faces'], ['happy']),
    (text) => setNode(text, ['moods', KEEP_MOOD, 'beats'], { flirt: 0.55 }),
    (text) => setNode(text, ['moods', KEEP_MOOD, 'portraits'], ['smile']),
    replaceBlock('moodPairs', ['moodPairs: {} # /stats season title for a dominant:runner-up pair']),
    (text) => {
      const smile = (read(text).portraitUrls as Record<string, string>).smile
      return replaceBlock('portraitUrls', [
        'portraitUrls: # Image for each portrait a mood names',
        `  smile: ${smile}`
      ])(text)
    }
  )
  const moodPrompts = join(packDir, 'prompts', 'moods')
  for (const file of readdirSync(moodPrompts)) if (basename(file, '.md') !== KEEP_MOOD) rmSync(join(moodPrompts, file))

  edit(
    join(packDir, 'lines.yml'),
    ...Object.entries(replies).map(
      ([pool, values]) =>
        (text: string) =>
          values.slice(1).reduce((next) => removeItem(next, ['replies', pool], 1), text)
    ),
    replaceBlock('status', [
      'status: # The bot’s Discord status by hour; the bands must cover all 24 hours',
      '  - from: 6',
      '    to: 22',
      '    lines:',
      '      - Minding the shop~ 🍡',
      '  - from: 22',
      '    to: 6',
      '    lines:',
      '      - Closed for the night 🌙'
    ])
  )

  edit(
    configPath,
    replaceBlock('llm', [
      'llm:',
      '  main: flash # Required; a key under llm.models (LLM_MAIN overrides)',
      '  stickyMs: 60000 # After the main model fails and the fallback answers, later turns start on the fallback this long',
      '  monthlyBudgetUsd: # Local monthly spend cap per paid provider',
      '    openai: 1',
      '  models:',
      '    flash: { provider: gemini, model: gemini-3.5-flash-lite }'
    ])
  )

  rmSync(envExamplePath, { force: true })
  writeFileSync(envPath, MINIMAL_ENV(), { mode: 0o600 })
}

/** Rewrites the freshly reset sandbox at `root` into `kind`. Call it right after `resetSandbox(root)`. */
export function applyDataset(root: string, kind: Dataset): void {
  if (kind === 'worst') applyWorst(root)
  else if (kind === 'empty') applyEmpty(root)
  else applyOne(root)
}
