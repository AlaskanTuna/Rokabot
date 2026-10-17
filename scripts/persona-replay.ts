/** Replay sampled production turns against prompt arms without writing user messages into results. */
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import Database from 'better-sqlite3'
import * as dotenv from 'dotenv'
import { messageEdge } from '../src/agent/replyShape.js'
import { type Turn, type TurnKind, type Window, chatTurns, parseWindow } from './persona-turns.js'

export type PromptSource = Readonly<{ kind: 'worktree' } | { kind: 'ref'; ref: string }>
export type Arm = Readonly<{ name: string; source: PromptSource; model: string }>
export type SearchResult = Readonly<Record<string, unknown>>

const MODEL = /^(?:haiku|sonnet):(none|low|medium)$|^gemini$/

export function parsePromptSource(source: string): PromptSource {
  if (source === 'worktree') return { kind: 'worktree' }
  const ref = source.startsWith('ref:') ? source.slice(4) : ''
  if (!ref) throw new Error(`invalid prompt source: ${source}`)
  return { kind: 'ref', ref }
}

export function promptSourcePath(source: PromptSource, worktreeRoot: string, exportedRoot?: string): string {
  if (source.kind === 'worktree') return join(worktreeRoot, 'src', 'agent')
  if (!exportedRoot) throw new Error(`missing exported source for ref: ${source.ref}`)
  return join(exportedRoot, 'src', 'agent')
}

export function parseArm(spec: string): Arm {
  const equals = spec.indexOf('=')
  const at = spec.lastIndexOf('@')
  if (equals < 1 || at <= equals + 1) throw new Error(`invalid arm specification: ${spec}`)
  const name = spec.slice(0, equals)
  const sourceText = spec.slice(equals + 1, at)
  const model = spec.slice(at + 1)
  if (!/^[\w-]+$/.test(name) || !MODEL.test(model)) throw new Error(`invalid arm specification: ${spec}`)
  return { name, source: parsePromptSource(sourceText), model }
}

export function appendReplyShape(prompt: string, shape: string): string {
  return `${prompt}\n\n${shape}`
}

export function resumeKey(row: Pick<ResultRow, 'arm' | 'turnId' | 'trial'>): string {
  return `${row.arm}|${row.turnId}|${row.trial}`
}

export class SearchCache {
  private readonly values: Record<string, SearchResult>
  private readonly pending = new Map<string, Promise<SearchResult>>()

  constructor(initial: Record<string, SearchResult> = {}) {
    this.values = initial
  }

  async get(turnId: string, query: string, fetcher: () => Promise<SearchResult>): Promise<SearchResult> {
    const key = JSON.stringify([turnId, query])
    if (this.values[key]) return this.values[key]
    if (!this.pending.has(key)) {
      this.pending.set(
        key,
        fetcher()
          .then((result) => {
            this.values[key] = result
            return result
          })
          .finally(() => this.pending.delete(key))
      )
    }
    return this.pending.get(key)!
  }

  snapshot(): Record<string, SearchResult> {
    return { ...this.values }
  }
}

type ResultRow = Readonly<{ arm: string; turnId: string; trial: number; [key: string]: unknown }>
type Message = { role: 'user' | 'assistant'; content: string }
type LoadedArm = Arm & {
  assemble: (input: { tone: string; hour: number; displayName: string; memory: boolean }) => string
  split: (prompt: string) => { stable: string; rest: string } | undefined
  shape: (input: {
    userMessage: string
    tone: string
    recentReplies: string[]
    displayName: string
    rng: () => number
  }) => string
}

// Since the character pack, the prompt modules read src/character and the pack folders; older refs have only src/agent.
// package.json keeps the export an ES module, which the pack loader needs for import.meta.dirname.
const PROMPT_PATHS = ['package.json', 'src/agent', 'src/character', 'characters', 'prompts'] as const

export function refPromptPaths(ref: string, cwd: string): string[] {
  return PROMPT_PATHS.filter((path) => {
    try {
      execFileSync('git', ['cat-file', '-e', `${ref}:${path}`], { cwd, stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })
}

function promptDirectory(source: PromptSource, cwd: string): string {
  if (source.kind === 'worktree') return promptSourcePath(source, cwd)
  const destination = join(tmpdir(), `persona-replay-${process.pid}-${Date.now()}`)
  mkdirSync(destination, { recursive: true })
  // Through a file: src/agent's tarball is larger than execFileSync's default output buffer.
  const archive = join(destination, 'src-agent.tar')
  execFileSync('git', ['archive', '-o', archive, source.ref, ...refPromptPaths(source.ref, cwd)], { cwd })
  execFileSync('tar', ['-xf', archive, '-C', destination])
  symlinkSync(join(cwd, 'node_modules'), join(destination, 'node_modules'), 'dir')
  return promptSourcePath(source, cwd, destination)
}

async function loadArm(arm: Arm, cwd: string): Promise<LoadedArm> {
  const directory = promptDirectory(arm.source, cwd)
  const promptModule = await import(pathToFileURL(join(directory, 'promptAssembler.ts')).href)
  const shapeModule = await import(pathToFileURL(join(directory, 'replyShape.ts')).href)
  return {
    ...arm,
    assemble: promptModule.assembleSystemPrompt,
    split: promptModule.splitStablePrefix,
    shape: shapeModule.buildReplyShapePrompt
  }
}

function seedOf(value: string): number {
  let seed = 2166136261
  for (let index = 0; index < value.length; index++) seed = Math.imul(seed ^ value.charCodeAt(index), 16777619)
  return seed >>> 0
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function promptFor(arm: LoadedArm, turn: Turn, history: readonly Message[], trial: number) {
  const prompt = arm.assemble({ tone: turn.tone, hour: turn.hour, displayName: turn.displayName, memory: true })
  const shape = arm.shape({
    userMessage: turn.user,
    tone: turn.tone as never,
    recentReplies: history.filter((message) => message.role === 'assistant').map((message) => message.content),
    displayName: turn.displayName,
    rng: mulberry32(seedOf(`${arm.name}|${turn.id}|${trial}`))
  })
  return { prompt: appendReplyShape(prompt, shape), shape }
}

export function countSlurRepetitions(input: string, reply: string, edgy: boolean): number {
  if (!edgy) return 0
  const source = new Set(
    (input.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter((word) => messageEdge(word) === 'hard')
  )
  return (reply.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter((word) => source.has(word)).length
}

const SEARCH_DESCRIPTION =
  'Look something up on the web. Call this for factual questions you are not fully certain of and for recent or time-sensitive details.'
const ANTHROPIC_SEARCH: Anthropic.Tool = {
  name: 'search_web',
  description: SEARCH_DESCRIPTION,
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string' }, topic: { type: 'string', enum: ['general', 'news'] } },
    required: ['query']
  }
}
const GEMINI_SEARCH = {
  name: 'search_web',
  description: SEARCH_DESCRIPTION,
  parameters: {
    type: 'OBJECT',
    properties: { query: { type: 'STRING' }, topic: { type: 'STRING', enum: ['general', 'news'] } },
    required: ['query']
  }
}
const GEMINI_CONFIG = {
  temperature: 0.9,
  topP: 0.95,
  maxOutputTokens: 500,
  safetySettings: ['HARASSMENT', 'HATE_SPEECH', 'SEXUALLY_EXPLICIT', 'DANGEROUS_CONTENT'].map((category) => ({
    category: `HARM_CATEGORY_${category}`,
    threshold: 'OFF'
  }))
} as never

function claudeSettings(model: string) {
  const [family, effort] = model.split(':') as ['haiku' | 'sonnet', 'none' | 'low' | 'medium']
  return {
    id: family === 'haiku' ? 'claude-haiku-5-5' : 'claude-sonnet-5-5',
    thinking: effort === 'none' ? { type: family === 'haiku' ? 'disabled' : 'between_tools' } : { type: 'adaptive' },
    outputConfig: effort === 'none' ? undefined : { effort },
    maxTokens: effort === 'none' ? 500 : 2548
  }
}

async function runClaude(
  client: Anthropic,
  arm: LoadedArm,
  prompt: string,
  turn: Turn,
  history: Message[],
  cache: SearchCache,
  search: (query: string) => Promise<SearchResult>
) {
  const settings = claudeSettings(arm.model)
  const parts = arm.split(prompt)
  const system: Anthropic.TextBlockParam[] = parts
    ? [
        { type: 'text', text: parts.stable, cache_control: { type: 'ephemeral' } },
        ...(parts.rest.trim() ? [{ type: 'text' as const, text: parts.rest }] : [])
      ]
    : [{ type: 'text', text: prompt }]
  const messages: Anthropic.MessageParam[] = [...history]
  const searches: string[] = []
  for (let call = 0; call < 4; call++) {
    const response = await client.messages.create({
      model: settings.id,
      max_tokens: settings.maxTokens,
      system,
      messages,
      tools: [ANTHROPIC_SEARCH],
      ...(settings.thinking.type === 'adaptive'
        ? { thinking: settings.thinking, output_config: settings.outputConfig }
        : { thinking: settings.thinking })
    } as Anthropic.MessageCreateParams)
    const uses = response.content.filter((block) => block.type === 'tool_use')
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
    if (uses.length === 0 || response.stop_reason !== 'tool_use') return { text, searches, calls: call + 1 }
    messages.push({ role: 'assistant', content: response.content as never })
    messages.push({
      role: 'user',
      content: await Promise.all(
        uses.map(async (use) => {
          const query = String((use.input as { query?: unknown }).query ?? '')
          searches.push(query)
          const result = await cache.get(turn.id, query, () => search(query))
          return { type: 'tool_result' as const, tool_use_id: use.id, content: JSON.stringify(result) }
        })
      )
    })
  }
  return { text: '', searches, calls: 4, error: 'tool_loop' }
}

async function runGemini(
  client: GoogleGenAI,
  prompt: string,
  turn: Turn,
  history: Message[],
  cache: SearchCache,
  search: (query: string) => Promise<SearchResult>
) {
  const contents: never[] = history.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }]
  })) as never[]
  const searches: string[] = []
  for (let call = 0; call < 4; call++) {
    const response = await client.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents,
      config: { ...GEMINI_CONFIG, systemInstruction: prompt, tools: [{ functionDeclarations: [GEMINI_SEARCH] }] }
    })
    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts ?? []
    const calls = parts.filter((part) => part.functionCall).map((part) => part.functionCall!)
    const text = parts
      .filter((part) => part.text && !part.thought)
      .map((part) => part.text)
      .join('')
    if (!calls.length) return { text, searches, calls: call + 1 }
    contents.push(candidate!.content as never)
    contents.push(
      (await Promise.all(
        calls.map(async (call) => {
          const query = String(call.args?.query ?? '')
          searches.push(query)
          return {
            functionResponse: {
              id: call.id,
              name: 'search_web',
              response: await cache.get(turn.id, query, () => search(query))
            }
          }
        })
      )) as never
    )
  }
  return { text: '', searches, calls: 4, error: 'tool_loop' }
}

type Options = {
  db: string
  out: string
  trials: number
  kinds: TurnKind[]
  windows: Window[]
  limit?: number
  history: 'prod' | 'fresh'
  arms: Arm[]
}

function parseArgs(argv: readonly string[]): Options {
  const values = new Map<string, string[]>()
  const arms: Arm[] = []
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value.startsWith('--')) {
      const key = value.slice(2)
      if (key === 'window') (values.get(key) ?? values.set(key, []).get(key)!).push(argv[++index])
      else values.set(key, [argv[++index]])
    } else arms.push(parseArm(value))
  }
  const get = (key: string) => values.get(key)?.[0]
  const trials = Number(get('trials'))
  const kinds = (get('kinds') ?? '').split(',').filter(Boolean) as TurnKind[]
  const windows = (values.get('window') ?? []).map(parseWindow)
  if (
    !get('db') ||
    !get('out') ||
    !Number.isInteger(trials) ||
    trials < 1 ||
    !kinds.length ||
    !windows.length ||
    !arms.length
  )
    throw new Error(
      'usage: persona-replay.ts --db <copy.sqlite> --out <results.jsonl> --trials N --kinds chat,tool,reply,edgy --window name=<from>..<to> [--limit N] [--history prod|fresh] <arm>...'
    )
  if (kinds.some((kind) => !['chat', 'tool', 'reply', 'edgy'].includes(kind))) throw new Error('unknown turn kind')
  if (new Set(arms.map((arm) => arm.name)).size !== arms.length) throw new Error('arm names must be unique')
  return {
    db: get('db')!,
    out: get('out')!,
    trials,
    kinds,
    windows,
    ...(get('limit') ? { limit: Number(get('limit')) } : {}),
    history: get('history') === 'fresh' ? 'fresh' : 'prod',
    arms
  }
}

async function main(argv: readonly string[]): Promise<void> {
  const options = parseArgs(argv)
  dotenv.config({ path: resolve('.env') })
  const db = new Database(options.db, { readonly: true })
  let turns = chatTurns(db, options.windows, { seed: 42, timeZone: 'UTC' }).filter((turn) =>
    options.kinds.some((kind) => turn.kinds.includes(kind))
  )
  if (options.limit !== undefined) turns = turns.slice(0, options.limit)
  const loaded = await Promise.all(options.arms.map((arm) => loadArm(arm, process.cwd())))
  const output = resolve(options.out)
  mkdirSync(dirname(output), { recursive: true })
  const cachePath = `${output}.search-cache.json`
  const cache = new SearchCache(existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {})
  const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 3 })
    : undefined
  const geminiKeys = [process.env.GRAPHIFY_GEMINI_API_KEY, process.env.DEV_GEMINI_API_KEY].filter(Boolean)
  const gemini = geminiKeys[0] ? new GoogleGenAI({ apiKey: geminiKeys[0] }) : undefined
  const search = async (query: string): Promise<SearchResult> => {
    const { searchWeb } = await import('../src/agent/tools/searchWeb.js')
    return searchWeb({ query }) as Promise<SearchResult>
  }
  const done = new Set<string>()
  if (existsSync(output))
    for (const line of readFileSync(output, 'utf8').split('\n').filter(Boolean)) {
      const row = JSON.parse(line) as ResultRow
      if (!row.error) done.add(resumeKey(row))
    }
  const jobs = loaded
    .flatMap((arm) =>
      turns.flatMap((turn) => Array.from({ length: options.trials }, (_, trial) => ({ arm, turn, trial })))
    )
    .filter(({ arm, turn, trial }) => !done.has(resumeKey({ arm: arm.name, turnId: turn.id, trial })))
  const cacheFile = () => writeFileSync(cachePath, JSON.stringify(cache.snapshot(), null, 2))
  for (const { arm, turn, trial } of jobs) {
    const history = options.history === 'fresh' ? turn.messages.slice(-1) : turn.messages
    const base = {
      arm: arm.name,
      model: arm.model,
      turnId: turn.id,
      kinds: turn.kinds,
      era: turn.window,
      window: turn.window,
      trial
    }
    try {
      if (arm.model === 'gemini' && !gemini) throw new Error('missing GRAPHIFY_GEMINI_API_KEY or DEV_GEMINI_API_KEY')
      if (arm.model !== 'gemini' && !anthropic) throw new Error('missing ANTHROPIC_API_KEY')
      if (arm.model === 'gemini' && !geminiKeys.length) throw new Error('missing Gemini API key')
      const { prompt, shape } = promptFor(arm, turn, history, trial)
      const response =
        arm.model === 'gemini'
          ? await runGemini(gemini!, prompt, turn, history, cache, search)
          : await runClaude(anthropic!, arm, prompt, turn, history, cache, search)
      cacheFile()
      appendFileSync(
        output,
        `${JSON.stringify({ ...base, ...response, shape, slurRepetitions: countSlurRepetitions(turn.user, response.text, turn.kinds.includes('edgy')) })}\n`
      )
    } catch (error) {
      cacheFile()
      appendFileSync(
        output,
        `${JSON.stringify({ ...base, error: error instanceof Error ? error.message : String(error) })}\n`
      )
    }
  }
  db.close()
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
