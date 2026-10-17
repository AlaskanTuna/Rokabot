import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { type Server, createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parse } from 'dotenv'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MODEL_PROFILES } from '../../../src/agent/llm/profiles.js'
import { loadCharacter } from '../../../src/character/load.js'
import { assembleSystemPrompt } from '../../../src/character/prompt.js'
import { estimateTokens } from '../../../src/utils/tokens.js'
import { type StudioOptions, createApp } from '../app.js'
import { DEFAULT_BASE_URLS } from '../models.js'

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

async function start(overrides: Partial<StudioOptions> = {}): Promise<Studio> {
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
      env: process.env,
      uiDir: join(root, 'ui'),
      templateDir: resolve('studio/template'),
      ...overrides
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

  it('refuses a request addressed to another host name, even with the token', async () => {
    const studio = await start()
    const status = (host: string) =>
      new Promise<number>((done, reject) => {
        request(
          { host: '127.0.0.1', port: studio.port, path: '/api/schema', headers: { host, 'x-studio-token': TOKEN } },
          (res) => {
            res.resume()
            done(res.statusCode ?? 0)
          }
        )
          .on('error', reject)
          .end()
      })
    expect(await status(`rebind.evil.example:${studio.port}`)).toBe(403)
    expect(await status(`localhost:${studio.port}`)).toBe(200)
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
      path: 'statusCycleMs',
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
    expect(byKey.get('DISCORD_TOKEN')).toEqual({
      key: 'DISCORD_TOKEN',
      set: true,
      masked: '••••1234',
      inExample: true,
      description: 'Required secrets (tunables are in config.yml)',
      required: true
    })
    expect(byKey.get('TAVILY_API_KEY')).toMatchObject({ set: true, masked: '••••', inExample: true, required: false })
    expect(byKey.get('GEMINI_API_KEY')).toMatchObject({ set: false, masked: null, inExample: true, required: false })
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
    expect(await deleted.json()).toEqual({
      key: 'EXTRA_THING',
      set: false,
      masked: null,
      inExample: false,
      description: '',
      required: false
    })

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

  it('keeps listing a required key that neither .env nor .env.example names, set or cleared', async () => {
    const studio = await start()
    rmSync(join(studio.root, '.env.example'))
    writeFileSync(join(studio.root, '.env'), 'DISCORD_TOKEN=discord-secret-value-1234\nGEMINI_API_KEY=g-1234\n')
    const keys = async () => (await json<Array<{ key: string }>>(studio.call('/api/secrets'))).map((entry) => entry.key)
    const entries = await json<Array<{ key: string }>>(studio.call('/api/secrets'))
    expect(entries.find((entry) => entry.key === 'DISCORD_CLIENT_ID')).toEqual({
      key: 'DISCORD_CLIENT_ID',
      set: false,
      masked: null,
      inExample: false,
      description: '',
      required: true
    })
    expect(await keys()).toEqual(['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'GEMINI_API_KEY'])

    const cleared = await studio.call('/api/secrets/DISCORD_TOKEN', { method: 'DELETE' })
    expect(await cleared.json()).toMatchObject({ key: 'DISCORD_TOKEN', set: false, required: true })
    expect(await keys()).toEqual(['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'GEMINI_API_KEY'])
    expect(read(studio.root, '.env')).toBe('GEMINI_API_KEY=g-1234\n')
  })

  it('replaces and clears a lowercase key .env already has, in place', async () => {
    const studio = await start()
    writeFileSync(join(studio.root, '.env'), `${ENV_TEXT}https_proxy=http://proxy.example:3128\nno_proxy=localhost\n`)
    const keys = (await json<Array<{ key: string }>>(studio.call('/api/secrets'))).map((entry) => entry.key)
    expect(keys).toEqual(expect.arrayContaining(['https_proxy', 'no_proxy']))

    const replaced = await studio.send('PUT', '/api/secrets/https_proxy', { value: 'http://other.example:8080' })
    expect(replaced.status).toBe(200)
    expect(await replaced.json()).toMatchObject({ key: 'https_proxy', set: true, masked: '••••8080' })
    const cleared = await studio.call('/api/secrets/no_proxy', { method: 'DELETE' })
    expect(cleared.status).toBe(200)
    expect(await cleared.json()).toMatchObject({ key: 'no_proxy', set: false, required: false })
    expect(read(studio.root, '.env')).toBe(`${ENV_TEXT}https_proxy=http://other.example:8080\n`)
  })

  it('refuses a malformed key or a multi-line value without echoing it', async () => {
    const studio = await start()
    // A new key must be capitalised; a key with characters dotenv cannot read is refused for every method.
    const refusals: Array<[string, string]> = [
      ['PUT', 'lower_case'],
      ['PUT', 'BAD-KEY'],
      ['PUT', '1KEY'],
      ['PUT', 'SPACE KEY'],
      ['DELETE', 'A=B']
    ]
    for (const [method, key] of refusals) {
      const response = await studio.send(method, `/api/secrets/${encodeURIComponent(key)}`, { value: 'x' })
      expect(response.status).toBe(400)
      expect((await json<ApiError>(response)).error.message).toBe(
        'Use capital letters, digits and underscores, like MY_API_KEY.'
      )
    }
    const multiLine = await studio.send('PUT', '/api/secrets/DISCORD_TOKEN', { value: 'first\nINJECTED_SECRET=line' })
    expect(multiLine.status).toBe(400)
    expect(await multiLine.text()).not.toContain('INJECTED_SECRET')
    expect((await studio.call('/api/secrets/NOT_THERE', { method: 'DELETE' })).status).toBe(404)
    expect(read(studio.root, '.env')).toBe(ENV_TEXT)
  })
})

describe('Persona Studio secrets metadata', () => {
  it('describes each key by the comment block above its group and marks the required ones', async () => {
    const studio = await start()
    const entries = await json<Array<{ key: string; description: string; required: boolean }>>(
      studio.call('/api/secrets')
    )
    const byKey = new Map(entries.map((entry) => [entry.key, entry]))
    expect(byKey.get('DISCORD_CLIENT_ID')).toMatchObject({
      description: 'Required secrets (tunables are in config.yml)',
      required: true
    })
    expect(byKey.get('GEMINI_API_KEY')?.description).toMatch(/^Required only when a role uses Gemini: .* always needs/)
    expect(byKey.get('TAVILY_API_KEY')?.description).toBe(
      'Optional: Tavily API key for web search (free: 1000 queries/month) Sign up at https://tavily.com to get a key'
    )
    expect(byKey.get('DEEPSEEK_API_KEY')?.description).toBe(byKey.get('OPENROUTER_API_KEY')?.description)
    expect(byKey.get('DEEPSEEK_API_KEY')?.description).toMatch(/^Optional: keys for llm\.models entries/)
    expect(entries.filter((entry) => entry.required).map((entry) => entry.key)).toEqual([
      'DISCORD_TOKEN',
      'DISCORD_CLIENT_ID'
    ])
    expect(byKey.get('EXTRA_THING')).toMatchObject({ description: '', required: false })
  })
})

describe('Persona Studio UI files', () => {
  const INDEX = '<!doctype html><title>Persona Studio</title>'

  function buildUi(root: string): void {
    mkdirSync(join(root, 'ui/assets'), { recursive: true })
    writeFileSync(join(root, 'ui/index.html'), INDEX)
    writeFileSync(join(root, 'ui/assets/app-1a2b.js'), 'console.log(1)')
    writeFileSync(join(root, 'ui/assets/app-1a2b.css'), 'body{}')
    writeFileSync(join(root, 'ui/favicon.svg'), '<svg/>')
    writeFileSync(join(root, 'ui/.hidden'), 'dot-file-content')
  }

  const raw = (port: number, path: string, method = 'GET', host = `127.0.0.1:${port}`) =>
    new Promise<{ status: number; body: string }>((done, reject) => {
      request({ host: '127.0.0.1', port, path, method, headers: { host } }, (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => done({ status: res.statusCode ?? 0, body }))
      })
        .on('error', reject)
        .end()
    })

  it('answers 503 when the UI is not built', async () => {
    const studio = await start()
    const response = await fetch(`http://127.0.0.1:${studio.port}/`)
    expect(response.status).toBe(503)
    expect((await json<ApiError>(response)).error.message).toBe(
      'the Persona Studio UI is not built: run npm run studio'
    )
  })

  it('serves the built files without a token, with their types and cache rules', async () => {
    const studio = await start()
    buildUi(studio.root)
    const base = `http://127.0.0.1:${studio.port}`
    const index = await fetch(`${base}/`)
    expect(index.status).toBe(200)
    expect(await index.text()).toBe(INDEX)
    expect(index.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(index.headers.get('cache-control')).toBe('no-store')

    const script = await fetch(`${base}/assets/app-1a2b.js`)
    expect(await script.text()).toBe('console.log(1)')
    expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(script.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect((await fetch(`${base}/assets/app-1a2b.css`)).headers.get('content-type')).toBe('text/css; charset=utf-8')
    const icon = await fetch(`${base}/favicon.svg`)
    expect(icon.headers.get('content-type')).toBe('image/svg+xml')
    expect(icon.headers.get('cache-control')).toBe('no-store')

    const head = await fetch(`${base}/assets/app-1a2b.js`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe('14')
    expect(await head.text()).toBe('')
  })

  it('answers an app route with index.html and a missing file with 404', async () => {
    const studio = await start()
    buildUi(studio.root)
    const base = `http://127.0.0.1:${studio.port}`
    for (const route of ['/prompts', '/models', '/pack/moods/playful', '/prompts/intro.md', '/moods/playful.md']) {
      const response = await fetch(`${base}${route}`)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(INDEX)
    }
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404)
    expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(405)
  })

  it('serves nothing outside the UI folder, nor a dot-file inside it', async () => {
    const studio = await start()
    buildUi(studio.root)
    for (const path of ['/..%2f.env', '/..%2F..%2Fconfig.yml', '/../.env', '/%2e%2e/.env', '/.hidden', '/a%00.js']) {
      const { status, body } = await raw(studio.port, path)
      expect(status).toBe(404)
      expect(body).not.toContain('DISCORD_TOKEN')
      expect(body).not.toContain('dot-file-content')
    }
  })

  it('refuses a UI request addressed to another host name', async () => {
    const studio = await start()
    buildUi(studio.root)
    expect((await raw(studio.port, '/', 'GET', `rebind.evil.example:${studio.port}`)).status).toBe(403)
    expect((await raw(studio.port, '/', 'GET', `localhost:${studio.port}`)).status).toBe(200)
  })

  it('sends the security headers with UI files and API answers alike', async () => {
    const studio = await start()
    buildUi(studio.root)
    for (const response of [await fetch(`http://127.0.0.1:${studio.port}/`), await studio.call('/api/schema')]) {
      expect(response.headers.get('content-security-policy')).toBe(
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
          "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
      )
      expect(response.headers.get('x-frame-options')).toBe('DENY')
      expect(response.headers.get('referrer-policy')).toBe('no-referrer')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    }
  })
})

interface FilesBody {
  files: string[]
  validation: { ok: boolean; summary: { moods: string[] }; problems: unknown[] }
}

const WISTFUL = [
  '  wistful:',
  '    faces: [soft]',
  '    judge: quiet longing for something gone',
  "    color: '#aabbcc'",
  '    placeholder: https://placehold.co/80x80',
  '    emoji: 🌙',
  '    adjective: wistful',
  '    season: A Wistful Season',
  ''
].join('\n')

describe('Persona Studio multi-file saves', () => {
  const moodsPath = 'characters/roka/moods.yml'
  const wistfulPath = 'characters/roka/prompts/moods/wistful.md'

  it('creates a mood prompt and the mood that uses it in one save, then deletes them together', async () => {
    const studio = await start()
    const moods = read(studio.root, moodsPath)
    const withWistful = moods.replace('\nmoods:\n', `\nmoods:\n${WISTFUL}`)
    const created = await studio.send('PUT', '/api/pack/files', {
      files: [
        { path: moodsPath, text: withWistful },
        { path: wistfulPath, text: '## Current Mood: Wistful\n- Speak softly.\n' }
      ]
    })
    expect(created.status).toBe(200)
    const body = await json<FilesBody>(created)
    expect(body.files).toEqual([moodsPath, wistfulPath])
    expect(body.validation.summary.moods).toContain('wistful')
    expect(read(studio.root, wistfulPath)).toBe('## Current Mood: Wistful\n- Speak softly.\n')
    const roka = loadCharacter(join(studio.root, 'characters/roka'), join(studio.root, 'prompts'))
    expect(roka.moods.wistful.prompt).toContain('Speak softly.')

    const orphaning = await studio.send('PUT', '/api/pack/files', { files: [{ path: wistfulPath, text: null }] })
    expect(orphaning.status).toBe(422)
    expect((await json<ApiError>(orphaning)).error).toMatchObject({
      file: moodsPath,
      path: 'moods.wistful.prompt',
      message: expect.stringContaining('no prompt file "moods/wistful.md"')
    })
    expect(existsSync(join(studio.root, wistfulPath))).toBe(true)

    const removed = await studio.send('PUT', '/api/pack/files', {
      files: [
        { path: moodsPath, text: moods },
        { path: wistfulPath, text: null }
      ]
    })
    expect(removed.status).toBe(200)
    expect(read(studio.root, moodsPath)).toBe(moods)
    expect(existsSync(join(studio.root, wistfulPath))).toBe(false)
  })

  it('writes nothing when any one change breaks the pack', async () => {
    const studio = await start()
    const intro = 'characters/roka/prompts/intro.md'
    const before = { intro: read(studio.root, intro), moods: read(studio.root, moodsPath) }
    const response = await studio.send('PUT', '/api/pack/files', {
      files: [
        { path: intro, text: 'A new intro.\n' },
        { path: 'characters/roka/prompts/extra.md', text: 'Hi {{nope}}\n' },
        { path: moodsPath, text: before.moods.replace('default: playful', 'default: cheerful') }
      ]
    })
    expect(response.status).toBe(422)
    const body = await json<ApiError>(response)
    expect(body.problems).toContainEqual({ file: moodsPath, path: 'default', message: 'unknown mood "cheerful"' })
    expect(read(studio.root, intro)).toBe(before.intro)
    expect(read(studio.root, moodsPath)).toBe(before.moods)
    expect(existsSync(join(studio.root, 'characters/roka/prompts/extra.md'))).toBe(false)
  })

  it('names a new file in the problems when it is the one that breaks', async () => {
    const studio = await start()
    const characterPath = 'characters/roka/character.yml'
    const extra = 'characters/roka/prompts/extra.md'
    const response = await studio.send('PUT', '/api/pack/files', {
      files: [
        { path: characterPath, text: read(studio.root, characterPath).replace('[intro, ', '[intro, extra, ') },
        { path: extra, text: 'Hi {{nope}}\n' }
      ]
    })
    expect(response.status).toBe(422)
    expect((await json<ApiError>(response)).error).toEqual({
      file: extra,
      path: null,
      message: 'unknown macro {{nope}}'
    })
  })

  it('creates or deletes only pack prompts, and refuses anything outside the allow-list', async () => {
    const studio = await start()
    const refused = [
      { path: 'characters/roka/extra.yml', text: 'x: 1\n' },
      { path: 'prompts/new.md', text: 'New.\n' },
      { path: 'characters/roka/prompts/Bad_Name.md', text: 'New.\n' },
      { path: 'characters/roka/prompts/deep/er.md', text: 'New.\n' },
      { path: 'characters/roka/prompts/../../../.env', text: 'X=1\n' },
      { path: '.env', text: 'X=1\n' },
      { path: moodsPath, text: null },
      { path: 'prompts/situation.md', text: null },
      { path: 'characters/roka/prompts/nothing-here.md', text: null }
    ]
    for (const file of refused) {
      const response = await studio.send('PUT', '/api/pack/files', { files: [file] })
      expect(response.status).toBe(404)
      expect((await json<ApiError>(response)).error.file).toBe(file.path)
    }
    expect(read(studio.root, '.env')).toBe(ENV_TEXT)
    expect(existsSync(join(studio.root, 'characters/roka/extra.yml'))).toBe(false)
    expect(existsSync(join(studio.root, 'prompts/new.md'))).toBe(false)
  })

  it('refuses a malformed files list', async () => {
    const studio = await start()
    const intro = { path: 'characters/roka/prompts/intro.md', text: 'Intro.\n' }
    for (const files of [
      [],
      undefined,
      [intro, intro],
      Array.from({ length: 51 }, (_, index) => ({ path: `characters/roka/prompts/p${index}.md`, text: 'x' })),
      [{ path: intro.path, text: 3 }],
      [{ path: intro.path }],
      ['characters/roka/prompts/intro.md']
    ]) {
      expect((await studio.send('PUT', '/api/pack/files', { files })).status).toBe(400)
    }
  })
})

describe('Persona Studio draft validation and preview', () => {
  it('validates drafts without writing, and the saved pack when the list is empty', async () => {
    const studio = await start()
    const moodsPath = 'characters/roka/moods.yml'
    const before = read(studio.root, moodsPath)
    const saved = await studio.send('POST', '/api/pack/validate', { files: [] })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ validation: { ok: true, summary: { id: 'roka' } } })

    const broken = await studio.send('POST', '/api/pack/validate', {
      files: [{ path: moodsPath, text: before.replace('default: playful', 'default: cheerful') }]
    })
    expect(broken.status).toBe(200)
    expect(await broken.json()).toEqual({
      validation: {
        ok: false,
        problems: [{ file: moodsPath, path: 'default', message: 'unknown mood "cheerful"' }]
      }
    })
    const voicePath = 'characters/roka/voice.yml'
    const voice = read(studio.root, voicePath)
    const empty = await studio.send('POST', '/api/pack/validate', {
      files: [{ path: voicePath, text: voice.replace('hardLineFaces: [furious, pouty]', 'hardLineFaces: []') }]
    })
    expect(await empty.json()).toEqual({
      validation: {
        ok: false,
        problems: [{ file: voicePath, path: 'hardLineFaces', message: 'Add at least one item.' }]
      }
    })
    const created = await studio.send('POST', '/api/pack/validate', {
      files: [{ path: 'characters/roka/prompts/moods/new.md', text: 'New.\n' }]
    })
    expect(await created.json()).toMatchObject({ validation: { ok: true } })
    expect(existsSync(join(studio.root, 'characters/roka/prompts/moods/new.md'))).toBe(false)
    expect(read(studio.root, moodsPath)).toBe(before)

    expect((await studio.send('POST', '/api/pack/validate', { files: [{ path: '.env', text: 'X' }] })).status).toBe(404)
    expect((await studio.send('POST', '/api/pack/validate', {})).status).toBe(400)
  })

  it('previews the prompt a draft would assemble, without writing it', async () => {
    const studio = await start()
    const intro = 'characters/roka/prompts/intro.md'
    const before = read(studio.root, intro)
    const response = await studio.send('POST', '/api/preview', {
      files: [{ path: intro, text: 'A drafted intro.\n' }],
      mood: 'playful',
      hour: 21,
      memory: 'full',
      user: 'Adam'
    })
    expect(response.status).toBe(200)
    const body = await json<{ prompt: string; tokens: number }>(response)
    expect(body.prompt.startsWith('A drafted intro.\n\n')).toBe(true)
    expect(body.prompt).toContain('"Adam"')
    expect(body.tokens).toBe(estimateTokens(body.prompt))
    expect(read(studio.root, intro)).toBe(before)

    const broken = await studio.send('POST', '/api/preview', {
      files: [{ path: 'prompts/situation.md', text: '{{nope}}\n' }]
    })
    expect(broken.status).toBe(422)
    expect((await json<ApiError>(broken)).problems).toContainEqual({
      file: 'prompts/situation.md',
      path: null,
      message: 'unknown macro {{nope}}'
    })
    expect((await studio.send('POST', '/api/preview', { files: [], mood: 'grumpy' })).status).toBe(400)
    expect((await studio.send('POST', '/api/preview', { files: [], hour: [] })).status).toBe(400)
  })
})

interface PackView {
  dir: string
  candidates: string[]
  validation: { ok: boolean; summary: { id: string; name: string } }
}

interface NoPack extends ApiError {
  code: string
  configured: string
  candidates: string[]
}

/** A config.yml the bot loads, with a comment on its character line to show the comment survives a switch. */
function commentedConfig(root: string): string {
  const text = read(root, 'config.yml').replace(/^character: .*$/m, 'character: characters/roka # Pack folder')
  writeFileSync(join(root, 'config.yml'), text)
  return text
}

describe('Persona Studio pack switching', () => {
  it('starts without a pack and says which packs exist', async () => {
    const studio = await start({ packDir: join(tmpdir(), 'persona-studio-no-such-pack') })
    mkdirSync(join(studio.root, 'characters/empty'))
    const response = await studio.call('/api/pack')
    expect(response.status).toBe(409)
    const body = await json<NoPack>(response)
    expect(body).toMatchObject({ code: 'no_pack', candidates: ['characters/roka'] })
    expect(body.configured).toBe(join(tmpdir(), 'persona-studio-no-such-pack'))
    expect(body.error.message).toContain('pick one or create one')
    expect((await studio.call('/api/preview')).status).toBe(409)
    expect((await studio.send('POST', '/api/pack/validate', { files: [] })).status).toBe(409)
    expect((await studio.call('/api/schema')).status).toBe(200)
  })

  it('lists the packs to switch to alongside the current one', async () => {
    const studio = await start()
    cpSync('characters/roka', join(studio.root, 'characters/second'), { recursive: true })
    const body = await json<PackView>(studio.call('/api/pack'))
    expect(body.candidates).toEqual(['characters/roka', 'characters/second'])
  })

  it('switches to another pack and points config.yml at it', { timeout: 30_000 }, async () => {
    const studio = await start({ packDir: join(tmpdir(), 'persona-studio-no-such-pack') })
    const before = commentedConfig(studio.root)
    cpSync('characters/roka', join(studio.root, 'characters/second'), { recursive: true })
    expect((await studio.send('POST', '/api/pack/select', { dir: 'characters/nope' })).status).toBe(404)
    expect((await studio.send('POST', '/api/pack/select', { dir: 'studio/template' })).status).toBe(404)

    const response = await studio.send('POST', '/api/pack/select', { dir: 'characters/second' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ dir: 'characters/second', validation: { ok: true } })
    const after = read(studio.root, 'config.yml')
    const line = `character: ${join(studio.root, 'characters/second')} # Pack folder`
    expect(after).toBe(before.replace('character: characters/roka # Pack folder', line))
    expect(await json<PackView>(studio.call('/api/pack'))).toMatchObject({ dir: 'characters/second' })
  })

  it('refuses a pack that does not load and leaves config.yml alone', async () => {
    const studio = await start()
    const before = read(studio.root, 'config.yml')
    mkdirSync(join(studio.root, 'characters/broken'))
    writeFileSync(join(studio.root, 'characters/broken/character.yml'), 'id: broken\n')
    const response = await studio.send('POST', '/api/pack/select', { dir: 'characters/broken' })
    expect(response.status).toBe(422)
    expect((await json<ApiError>(response)).problems).toContainEqual({
      file: 'characters/broken/voice.yml',
      path: null,
      message: 'file is missing'
    })
    expect(read(studio.root, 'config.yml')).toBe(before)
    expect(await json<PackView>(studio.call('/api/pack'))).toMatchObject({ dir: 'characters/roka' })
  })

  it('refuses to switch while CHARACTER_DIR outranks config.yml', async () => {
    const studio = await start({ env: { ...process.env, CHARACTER_DIR: 'characters/roka' } })
    const before = read(studio.root, 'config.yml')
    const response = await studio.send('POST', '/api/pack/select', { dir: 'characters/roka' })
    expect(response.status).toBe(409)
    expect((await json<ApiError>(response)).error.message).toContain('CHARACTER_DIR')
    expect((await studio.send('POST', '/api/pack/create', { id: 'nova' })).status).toBe(409)
    expect(existsSync(join(studio.root, 'characters/nova'))).toBe(false)
    expect(read(studio.root, 'config.yml')).toBe(before)
  })

  it('creates a pack from the template and switches to it', { timeout: 30_000 }, async () => {
    const studio = await start()
    const before = commentedConfig(studio.root)
    expect((await studio.send('POST', '/api/pack/create', { id: 'Bad Id' })).status).toBe(400)
    expect((await studio.send('POST', '/api/pack/create', { id: 'roka' })).status).toBe(409)

    const response = await studio.send('POST', '/api/pack/create', { id: 'nova' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      dir: 'characters/nova',
      candidates: ['characters/nova', 'characters/roka'],
      validation: { ok: true, summary: { id: 'nova', name: 'Aster' } }
    })
    const character = read(studio.root, 'characters/nova/character.yml')
    expect(character).toBe(readFileSync('studio/template/character.yml', 'utf8').replace(/^id: aster #/m, 'id: nova #'))
    const line = `character: ${join(studio.root, 'characters/nova')} # Pack folder`
    expect(read(studio.root, 'config.yml')).toBe(before.replace('character: characters/roka # Pack folder', line))
    expect(loadCharacter(join(studio.root, 'characters/nova'), join(studio.root, 'prompts')).id).toBe('nova')
  })

  it('removes the new pack when config.yml fails its check', { timeout: 30_000 }, async () => {
    const studio = await start()
    const broken = read(studio.root, 'config.yml').replace('statusCycleMs: 900000', 'statusCycleMs: 0')
    writeFileSync(join(studio.root, 'config.yml'), broken)
    const response = await studio.send('POST', '/api/pack/create', { id: 'nova' })
    expect(response.status).toBe(422)
    expect((await json<ApiError>(response)).error.path).toBe('statusCycleMs')
    expect(existsSync(join(studio.root, 'characters/nova'))).toBe(false)
    expect(read(studio.root, 'config.yml')).toBe(broken)
  })
})

describe('Persona Studio config validation', () => {
  it('checks a draft config without writing it', { timeout: 60_000 }, async () => {
    const studio = await start()
    const before = read(studio.root, 'config.yml')
    const fine = await studio.send('POST', '/api/config/validate', {
      text: before.replace('statusCycleMs: 900000', 'statusCycleMs: 600000')
    })
    expect(fine.status).toBe(200)
    expect(await fine.json()).toEqual({ ok: true })

    const broken = await studio.send('POST', '/api/config/validate', {
      text: before.replace('statusCycleMs: 900000', 'statusCycleMs: 0')
    })
    expect(broken.status).toBe(200)
    expect(await broken.json()).toEqual({
      ok: false,
      problem: { file: 'config.yml', path: 'statusCycleMs', message: 'Config value statusCycleMs must be >= 1, got: 0' }
    })
    expect(read(studio.root, 'config.yml')).toBe(before)
  })
})

const MODEL_ENV = [
  'ANTHROPIC_API_KEY=sk-ant-studio-secret-123456',
  'GEMINI_API_KEY=gemini-studio-secret-abcdef',
  'LOCAL_KEY=local-studio-secret-xyz',
  ''
].join('\n')

interface ModelTestBody {
  ok: boolean
  status: number | null
  latencyMs: number | null
  message: string
  modelListed: boolean | null
}

describe('Persona Studio model connection test', () => {
  async function modelStudio(answer: (url: string, init: RequestInit) => Promise<Response>, env = {}) {
    const stub = vi.fn(answer)
    const studio = await start({ env, fetch: stub as unknown as typeof fetch })
    writeFileSync(join(studio.root, '.env'), ENV_TEXT + MODEL_ENV)
    const test = async (body: Record<string, unknown>) => {
      const response = await studio.send('POST', '/api/models/test', body)
      const raw = await response.text()
      for (const secret of Object.values(parse(MODEL_ENV))) expect(raw).not.toContain(secret)
      return { status: response.status, body: JSON.parse(raw) as ModelTestBody }
    }
    return { stub, test }
  }

  const list =
    (body: unknown, status = 200) =>
    async () =>
      new Response(JSON.stringify(body), { status })

  it('lists Anthropic models with the key in x-api-key', async () => {
    const { stub, test } = await modelStudio(list({ data: [{ id: 'claude-haiku-5-5' }], has_more: false }))
    const { status, body } = await test({ provider: 'anthropic', model: 'claude-haiku-5-5' })
    expect(status).toBe(200)
    expect(body).toMatchObject({ ok: true, status: 200, modelListed: true })
    expect(body.message).toMatch(/^Connected in \d+ ms; claude-haiku-5-5 is listed\.$/)
    expect(body.latencyMs).toBeGreaterThanOrEqual(0)
    const [url, init] = stub.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect(init.headers).toEqual({ 'x-api-key': 'sk-ant-studio-secret-123456', 'anthropic-version': '2023-06-01' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('lists Gemini models with the key in x-goog-api-key', async () => {
    const { stub, test } = await modelStudio(list({ models: [{ name: 'models/gemini-3.5-flash-lite' }] }))
    const { body } = await test({ provider: 'gemini', model: 'gemini-3.5-flash-lite' })
    expect(body).toMatchObject({ ok: true, modelListed: true })
    const [url, init] = stub.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000')
    expect(init.headers).toEqual({ 'x-goog-api-key': 'gemini-studio-secret-abcdef' })
  })

  it('reaches a keyless OpenAI-compatible server and says when the model is not listed', async () => {
    const { stub, test } = await modelStudio(list({ object: 'list', data: [{ id: 'llama3' }] }))
    const { body } = await test({
      provider: 'openai-compatible',
      model: 'qwen3:32b',
      baseUrl: 'http://localhost:11434/v1/'
    })
    expect(body).toMatchObject({ ok: true, modelListed: false })
    expect(body.message).toMatch(/^Connected in \d+ ms; qwen3:32b is not listed\.$/)
    expect(stub.mock.calls[0][0]).toBe('http://localhost:11434/v1/models')
    expect(stub.mock.calls[0][1].headers).toEqual({})

    await test({ provider: 'openai-compatible', model: 'x', baseUrl: 'https://llm.example/v1', apiKeyEnv: 'LOCAL_KEY' })
    expect(stub.mock.calls[1][1].headers).toEqual({ authorization: 'Bearer local-studio-secret-xyz' })
  })

  it('names the key when the provider refuses it', async () => {
    const { test } = await modelStudio(list({ error: { message: 'invalid x-api-key' } }, 401))
    const { status, body } = await test({ provider: 'anthropic', model: 'claude-haiku-5-5' })
    expect(status).toBe(200)
    expect(body).toMatchObject({ ok: false, status: 401, modelListed: null })
    expect(body.message).toBe('The server answered 401: check ANTHROPIC_API_KEY.')
  })

  it("caps the provider's error text and masks the key if it is echoed", async () => {
    const echo = `bad key sk-ant-studio-secret-123456 ${'x'.repeat(500)}`
    const { test } = await modelStudio(list({ error: { message: echo } }, 500))
    const { body } = await test({ provider: 'anthropic', model: 'claude-haiku-5-5' })
    expect(body.message.startsWith('The server answered 500: bad key •••• xxx')).toBe(true)
    expect(body.message.length).toBeLessThanOrEqual('The server answered 500: '.length + 200 + 1)
  })

  it('reports a timeout and an unreachable server', async () => {
    const timeout = await modelStudio(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })
    const slow = await timeout.test({ provider: 'openai-compatible', model: 'x', baseUrl: 'http://localhost:11434/v1' })
    expect(slow.body).toEqual({
      ok: false,
      status: null,
      latencyMs: null,
      message: 'No answer within 10 s from http://localhost:11434/v1.',
      modelListed: null
    })
    const refused = await modelStudio(async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    })
    const down = await refused.test({ provider: 'openai-compatible', model: 'x', baseUrl: 'http://localhost:9/v1' })
    expect(down.body.message).toBe(
      'Could not reach http://localhost:9/v1: nothing is listening there; start the server or check the port (ECONNREFUSED).'
    )
  })

  it('says which key is missing without calling the provider, the shell winning over .env', async () => {
    const { stub, test } = await modelStudio(list({ data: [] }), { ANTHROPIC_API_KEY: '' })
    expect((await test({ provider: 'openai', model: 'gpt-6-luna' })).body.message).toBe(
      'OPENAI_API_KEY is not set in .env.'
    )
    expect((await test({ provider: 'anthropic', model: 'claude-haiku-5-5' })).body.message).toBe(
      'ANTHROPIC_API_KEY is not set in .env.'
    )
    expect(stub).not.toHaveBeenCalled()
  })

  it('refuses a malformed request', async () => {
    const { stub, test } = await modelStudio(list({ data: [] }))
    for (const body of [
      { provider: 'azure', model: 'x' },
      { provider: 'openai', model: '' },
      { provider: 'openai', model: 'x', baseUrl: 'ftp://files.example' },
      { provider: 'openai', model: 'x', baseUrl: 'not a url' },
      { provider: 'openai-compatible', model: 'x' },
      { provider: 'openai-compatible', model: 'x', baseUrl: 'http://h/v1', apiKeyEnv: 'lower_case' }
    ]) {
      expect((await test(body)).status).toBe(400)
    }
    expect(stub).not.toHaveBeenCalled()
  })

  it('uses the base URLs the bot uses', { timeout: 30_000 }, async () => {
    const { CHAT_COMPLETIONS_BASE_URLS } = await import('../../../src/agent/llm/chatCompletionsLlm.js')
    expect(CHAT_COMPLETIONS_BASE_URLS).toEqual({
      openai: DEFAULT_BASE_URLS.openai,
      modelscope: DEFAULT_BASE_URLS.modelscope
    })
  })
})

describe('Persona Studio model profiles', () => {
  it('lists the tested built-in profiles with the variable each key is read from', async () => {
    const studio = await start()
    const profiles = await json<Array<{ provider: string; model: string; envVar: string }>>(
      studio.call('/api/models/profiles')
    )
    expect(profiles).toHaveLength(MODEL_PROFILES.filter((profile) => profile.verified).length)
    expect(profiles.find((profile) => profile.model === 'claude-haiku-5-5')).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      envVar: 'ANTHROPIC_API_KEY',
      capabilities: {
        vision: true,
        tools: true,
        structuredOutput: 'forced_tool',
        efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max']
      },
      price: { input: 0.1, output: 0.5, cachedInput: 0.01, cacheWrite: 0.125 }
    })
    expect(profiles.find((profile) => profile.model === 'Qwen/Qwen3.5-122B-A10B')?.envVar).toBe('MODELSCOPE_API_KEY')
    expect(profiles.some((profile) => profile.model === 'gemini-3.8-flash')).toBe(false)
  })
})
