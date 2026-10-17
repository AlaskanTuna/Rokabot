import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { browserCommands, openBrowser } from '../browser.js'

const URL_TEXT = 'http://127.0.0.1:5174/#token=abc'

describe('Persona Studio browser opener', () => {
  it('picks the command for each platform, wslview first on WSL', () => {
    expect(browserCommands(URL_TEXT, 'darwin', false)).toEqual([['open', [URL_TEXT]]])
    expect(browserCommands(URL_TEXT, 'win32', false)).toEqual([['cmd', ['/c', 'start', '""', `"${URL_TEXT}"`]]])
    expect(browserCommands(URL_TEXT, 'linux', false)).toEqual([['xdg-open', [URL_TEXT]]])
    expect(browserCommands(URL_TEXT, 'linux', true)).toEqual([
      ['wslview', [URL_TEXT]],
      ['xdg-open', [URL_TEXT]]
    ])
  })

  it('falls through commands that are missing or fail, and reports once when none works', async () => {
    const failed = await new Promise<number>((done) => {
      let calls = 0
      openBrowser(
        URL_TEXT,
        () => {
          calls += 1
          setTimeout(() => done(calls), 200)
        },
        [
          ['persona-studio-no-such-command', []],
          [process.execPath, ['-e', 'process.exit(3)']]
        ]
      )
    })
    expect(failed).toBe(1)
  })

  it('stops at the first command that exits cleanly', async () => {
    let failed = false
    await new Promise<void>((done) => {
      openBrowser(
        URL_TEXT,
        () => {
          failed = true
        },
        [
          [process.execPath, ['-e', '']],
          [process.execPath, ['-e', 'process.exit(3)']]
        ]
      )
      setTimeout(done, 1500)
    })
    expect(failed).toBe(false)
  })
})

const children: ChildProcess[] = []
afterEach(() => {
  for (const child of children.splice(0)) child.kill()
})

function freePort(): Promise<number> {
  return new Promise((done) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => done(port))
    })
  })
}

function startMain(env: Record<string, string>) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'studio/server/main.ts'], {
    env: { ...process.env, STUDIO_NO_OPEN: '1', ...env }
  })
  children.push(child)
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  return {
    exited: new Promise<number | null>((done) => child.on('exit', done)),
    line: () =>
      new Promise<string>((done) => {
        const check = () => (stdout.includes('\n') ? done(stdout.split('\n')[0]) : setTimeout(check, 50))
        check()
      }),
    stderr: () => stderr
  }
}

describe('Persona Studio start-up', () => {
  it('refuses a STUDIO_TOKEN that is too short', { timeout: 30_000 }, async () => {
    const main = startMain({ STUDIO_TOKEN: 'too-short' })
    expect(await main.exited).toBe(1)
    expect(main.stderr()).toContain('STUDIO_TOKEN must be at least 24 characters')
  })

  it('prints the URL with the token from STUDIO_TOKEN, which the API then accepts', { timeout: 30_000 }, async () => {
    const port = await freePort()
    const token = 'e2e-token-0123456789abcdefghij'
    const main = startMain({ STUDIO_TOKEN: token, STUDIO_PORT: String(port) })
    expect(await main.line()).toBe(`Persona Studio: http://127.0.0.1:${port}/#token=${token}`)
    const response = await fetch(`http://127.0.0.1:${port}/api/schema`, { headers: { 'x-studio-token': token } })
    expect(response.status).toBe(200)
  })
})
