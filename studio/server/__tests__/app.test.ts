import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { parse } from 'dotenv'
import { afterEach, describe, expect, it } from 'vitest'
import { loadCharacter } from '../../../src/character/load.js'
import { assembleSystemPrompt } from '../../../src/character/prompt.js'
import { estimateTokens } from '../../../src/utils/tokens.js'
import { createApp } from '../app.js'

const TOKEN = 'test-session-token'
const ENV_TEXT = [
  '# Discord bot secrets',
  'DISCORD_TOKEN=discord-secret-value-1234',
  'DISCORD_CLIENT_ID=123456789012345678',
  '',
  '# A short one',
  'TAVILY_API_KEY=q7z',
  'EXTRA_THING=extra-secret-value-9f3a',
  ''
].join('\n')

interface Studio {
  root: string
  port: number
  call(path: string, init?: RequestInit): Promise<Response>
  send(method: string, path: string, body: unknown): Promise<Response>
}

const running: Array<{ server: Server; root: string }> = []
afterEach(async () => {
  for (const { server, root } of running.splice(0)) {
    server.closeAllConnections()
    await new Promise((done) => server.close(done))
    rmSync(root, { recursive: true, force: true })
  }
})

async function start(): Promise<Studio> {
  const root = mkdtempSync(join(tmpdir(), 'persona-studio-test-'))
  cpSync('characters/roka', join(root, 'characters/roka'), { recursive: true })
  cpSync('prompts', join(root, 'prompts'), { recursive: true })
  writeFileSync(join(root, 'config.yml'), readFileSync(process.env.ROKABOT_CONFIG_PATH as string, 'utf8'))
  writeFileSync(join(root, '.env'), ENV_TEXT)
  cpSync('.env.example', join(root, '.env.example'))
  const server = createServer()
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  server.on(
    'request',
    createApp({
      token: TOKEN,
      port,
      root,
      packDir: join(root, 'characters/roka'),
      harnessDir: join(root, 'prompts'),
      configPath: join(root, 'config.yml'),
      envPath: join(root, '.env'),
      envExamplePath: join(root, '.env.example'),
      env: process.env
    })
  )
  running.push({ server, root })
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      ...init,
      headers: { 'x-studio-token': TOKEN, ...(init.headers as Record<string, string>) }
    })
  const send = (method: string, path: string, body: unknown) =>
    call(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { root, port, call, send }
}

const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8')

interface ApiError {
  error: { file: string | null; path: string | null; message: string }
  problems: unknown[]
  moods: string[]
}

interface PackBody {
  dir: string
  files: Array<{ path: string }>
  validation: unknown
}

async function json<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T
}

describe('Persona Studio security', () => {
  it('refuses an /api request without the session token', async () => {
    const studio = await start()
    const missing = await fetch(`http://127.0.0.1:${studio.port}/api/schema`)
    expect(missing.status).toBe(401)
    const wrong = await studio.call('/api/schema', { headers: { 'x-studio-token': 'not-the-token' } })
    expect(wrong.status).toBe(401)
    expect((await json<ApiError>(wrong)).error.message).toContain('X-Studio-Token')
  })

  it('refuses a request from another origin', async () => {
    const studio = await start()
    for (const origin of ['http://evil.example', 'null', 'http://127.0.0.1:1']) {
      expect((await studio.call('/api/schema', { headers: { origin } })).status).toBe(403)
    }
    for (const origin of [`http://127.0.0.1:${studio.port}`, `http://localhost:${studio.port}`]) {
      expect((await studio.call('/api/schema', { headers: { origin } })).status).toBe(200)
    }
  })

  it('refuses a JSON body over 1 MB and writes nothing', async () => {
    const studio = await start()
    const before = read(studio.root, 'config.yml')
    const response = await studio.send('PUT', '/api/config', { text: 'x'.repeat(1024 * 1024) })
    expect(response.status).toBe(413)
    expect(read(studio.root, 'config.yml')).toBe(before)
  })

  it('refuses a pack path outside the allow-list', async () => {
    const studio = await start()
    const outside = `../${basename(studio.root)}-outside.md`
    for (const path of [outside, 'characters/roka/../../.env', '/etc/hostname', 'config.yml', '.env']) {
      const response = await studio.send('PUT', '/api/pack/file', { path, text: 'overwritten' })
      expect(response.status).toBe(404)
    }
    expect(read(studio.root, '.env')).toBe(ENV_TEXT)
    expect(read(studio.root, 'config.yml')).not.toBe('overwritten')
    expect(existsSync(join(studio.root, outside))).toBe(false)
  })
})

describe('Persona Studio pack', () => {
  it('lists every editable file with its text and the validation result', async () => {
    const studio = await start()
    const body = await json<PackBody>(studio.call('/api/pack'))
    const byPath = new Map(body.files.map((file: { path: string }) => [file.path, file]))
    expect(body.dir).toBe('characters/roka')
    for (const path of [
      'characters/roka/character.yml',
      'characters/roka/voice.yml',
      'characters/roka/moods.yml',
      'characters/roka/lines.yml',
      'characters/roka/prompts/intro.md',
      'characters/roka/prompts/moods/playful.md',
      'prompts/situation.md'
    ]) {
      expect(byPath.get(path)).toMatchObject({ text: read(studio.root, path), locked: false })
    }
    expect(byPath.get('prompts/boundaries.md')).toMatchObject({ kind: 'harness', locked: true })
    expect(byPath.get('characters/roka/moods.yml')).toMatchObject({ kind: 'pack' })
    expect(body.validation).toMatchObject({ ok: true, summary: { id: 'roka', name: 'Roka', defaultMood: 'playful' } })
  })

  it('writes nothing and returns the loader error when an edit breaks the pack', async () => {
    const studio = await start()
    const before = read(studio.root, 'characters/roka/moods.yml')
    const response = await studio.send('PUT', '/api/pack/file', {
      path: 'characters/roka/moods.yml',
      text: before.replace('default: playful', 'default: cheerful')
    })
    expect(response.status).toBe(422)
    const body = await json<ApiError>(response)
    expect(body.error).toEqual({
      file: 'characters/roka/moods.yml',
      path: 'default',
      message: 'unknown mood "cheerful"'
    })
    expect(body.problems).toContainEqual(body.error)
    expect(read(studio.root, 'characters/roka/moods.yml')).toBe(before)
  })

  it('writes a valid edit atomically and the next load reads it', async () => {
    const studio = await start()
    const path = 'characters/roka/prompts/intro.md'
    const text = `${read(studio.root, path)}\nStudio was here.\n`
    const response = await studio.send('PUT', '/api/pack/file', { path, text })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ path, validation: { ok: true, summary: { id: 'roka' } } })
    expect(read(studio.root, path)).toBe(text)
    expect(readdirSync(join(studio.root, 'characters/roka/prompts')).sort()).toEqual(
      readdirSync('characters/roka/prompts').sort()
    )
    const roka = loadCharacter(join(studio.root, 'characters/roka'), join(studio.root, 'prompts'))
    expect(roka.prompts.stable.full).toContain('Studio was here.')
  })

  it('validates a harness prompt edit against a copy of the harness', async () => {
    const studio = await start()
    const path = 'prompts/situation.md'
    const before = read(studio.root, path)
    const broken = await studio.send('PUT', '/api/pack/file', { path, text: `${before}{{nope}}\n` })
    expect(broken.status).toBe(422)
    expect((await json<ApiError>(broken)).error).toEqual({ file: path, path: null, message: 'unknown macro {{nope}}' })
    expect(read(studio.root, path)).toBe(before)

    const fine = await studio.send('PUT', '/api/pack/file', { path, text: `${before}- Studio harness edit.\n` })
    expect(fine.status).toBe(200)
    const preview = await json<{ prompt: string }>(studio.call('/api/preview?mood=playful&hour=21'))
    expect(preview.prompt).toContain('- Studio harness edit.')
  })

  it('refuses a pack prompt that overrides a locked harness prompt, as the loader does', async () => {
    const studio = await start()
    const path = 'characters/roka/prompts/boundaries.md'
    writeFileSync(join(studio.root, path), 'Anything goes.\n')
    const response = await studio.send('PUT', '/api/pack/file', { path, text: 'Still anything goes.\n' })
    expect(response.status).toBe(422)
    expect((await json<ApiError>(response)).error).toEqual({
      file: path,
      path: null,
      message: 'boundaries.md is a locked harness prompt; edit prompts/boundaries.md instead'
    })
    expect(read(studio.root, path)).toBe('Anything goes.\n')
  })
})

describe('Persona Studio preview and schema', () => {
  it('assembles the prompt the bot would send for that turn', async () => {
    const studio = await start()
    const response = await studio.call('/api/preview?mood=playful&hour=21&memory=full&user=Adam')
    expect(response.status).toBe(200)
    const roka = loadCharacter('characters/roka', 'prompts')
    const prompt = assembleSystemPrompt(roka, { mood: 'playful', hour: 21, displayName: 'Adam', memory: 'full' })
    expect(await response.json()).toEqual({
      prompt,
      tokens: estimateTokens(prompt),
      stableTokens: estimateTokens(roka.prompts.stable.full)
    })
  })

  it('lists the moods when the mood is unknown', async () => {
    const studio = await start()
    const response = await studio.call('/api/preview?mood=grumpy')
    expect(response.status).toBe(400)
    const body = await json<ApiError>(response)
    expect(body.error.message).toContain('mood must be one of playful')
    expect(body.moods).toEqual(loadCharacter('characters/roka', 'prompts').moodKeys)
    expect((await studio.call('/api/preview?hour=24')).status).toBe(400)
    expect((await studio.call('/api/preview?memory=some')).status).toBe(400)
  })

  it('serves a JSON Schema for each pack file', async () => {
    const studio = await start()
    const body = await json<Record<string, { required: string[] }>>(studio.call('/api/schema'))
    expect(Object.keys(body).sort()).toEqual(['character.yml', 'lines.yml', 'moods.yml', 'voice.yml'])
    for (const schema of Object.values(body)) expect(schema).toMatchObject({ type: 'object' })
    expect(body['character.yml'].required).toContain('name')
  })
})

describe('Persona Studio config', () => {
  it('serves config.yml', async () => {
    const studio = await start()
    expect(await (await studio.call('/api/config')).json()).toEqual({
      path: 'config.yml',
      text: read(studio.root, 'config.yml')
    })
  })

  it('saves a config the bot loads', { timeout: 30_000 }, async () => {
    const studio = await start()
    const text = read(studio.root, 'config.yml').replace('statusCycleMs: 900000', 'statusCycleMs: 600000')
    const response = await studio.send('PUT', '/api/config', { text })
    expect(response.status).toBe(200)
    expect(read(studio.root, 'config.yml')).toBe(text)
  })

  it('returns the loader message and writes nothing when the config is broken', { timeout: 30_000 }, async () => {
    const studio = await start()
    const before = read(studio.root, 'config.yml')
    const response = await studio.send('PUT', '/api/config', {
      text: before.replace('statusCycleMs: 900000', 'statusCycleMs: 0')
    })
    expect(response.status).toBe(422)
    expect((await json<ApiError>(response)).error).toEqual({
      file: 'config.yml',
      path: null,
      message: 'Config value statusCycleMs must be >= 1, got: 0'
    })
    expect(read(studio.root, 'config.yml')).toBe(before)
  })
})

describe('Persona Studio secrets', () => {
  it('lists every example key and every extra .env key, masked', async () => {
    const studio = await start()
    const response = await studio.call('/api/secrets')
    const raw = await response.text()
    const entries: Array<{ key: string }> = JSON.parse(raw)
    const byKey = new Map(entries.map((entry) => [entry.key, entry]))
    expect(byKey.get('DISCORD_TOKEN')).toEqual({ key: 'DISCORD_TOKEN', set: true, masked: '••••1234', inExample: true })
    expect(byKey.get('TAVILY_API_KEY')).toEqual({ key: 'TAVILY_API_KEY', set: true, masked: '••••', inExample: true })
    expect(byKey.get('GEMINI_API_KEY')).toEqual({ key: 'GEMINI_API_KEY', set: false, masked: null, inExample: true })
    expect(byKey.get('EXTRA_THING')).toMatchObject({ set: true, inExample: false })
    expect(byKey.get('OPENROUTER_API_KEY')).toMatchObject({ set: false, inExample: true })
    for (const value of Object.values(parse(ENV_TEXT))) expect(raw).not.toContain(value)
  })

  it('sets, replaces and deletes keys while keeping every other line', async () => {
    const studio = await start()
    const values = { GEMINI_API_KEY: "gemini key with spaces #1 and 'quotes'", DISCORD_TOKEN: 'new-discord-token-5678' }
    for (const [key, value] of Object.entries(values)) {
      const response = await studio.send('PUT', `/api/secrets/${key}`, { value })
      expect(response.status).toBe(200)
      const raw = await response.text()
      expect(raw).not.toContain(value)
      expect(JSON.parse(raw)).toMatchObject({ key, set: true, inExample: true })
    }
    const deleted = await studio.call('/api/secrets/EXTRA_THING', { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    expect(await deleted.json()).toEqual({ key: 'EXTRA_THING', set: false, masked: null, inExample: false })

    const text = read(studio.root, '.env')
    expect(parse(text)).toEqual({
      DISCORD_TOKEN: 'new-discord-token-5678',
      DISCORD_CLIENT_ID: '123456789012345678',
      TAVILY_API_KEY: 'q7z',
      GEMINI_API_KEY: values.GEMINI_API_KEY
    })
    expect(text.split('\n').slice(0, 6)).toEqual([
      '# Discord bot secrets',
      'DISCORD_TOKEN=new-discord-token-5678',
      'DISCORD_CLIENT_ID=123456789012345678',
      '',
      '# A short one',
      'TAVILY_API_KEY=q7z'
    ])
  })

  it('refuses a malformed key or a multi-line value without echoing it', async () => {
    const studio = await start()
    for (const key of ['lower_case', 'BAD-KEY', '1KEY']) {
      expect((await studio.send('PUT', `/api/secrets/${key}`, { value: 'x' })).status).toBe(400)
    }
    const multiLine = await studio.send('PUT', '/api/secrets/DISCORD_TOKEN', { value: 'first\nINJECTED_SECRET=line' })
    expect(multiLine.status).toBe(400)
    expect(await multiLine.text()).not.toContain('INJECTED_SECRET')
    expect((await studio.call('/api/secrets/NOT_THERE', { method: 'DELETE' })).status).toBe(404)
    expect(read(studio.root, '.env')).toBe(ENV_TEXT)
  })
})
