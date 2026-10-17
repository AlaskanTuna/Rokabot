import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

// Taken before src/character/paths.ts loads .env, so the config check reads .env as it is then, not at startup.
const shellEnv = { ...process.env }
if (process.env.STUDIO_ENV_PATH) process.env.DOTENV_CONFIG_PATH ??= process.env.STUDIO_ENV_PATH
const { HARNESS_DIR, REPO_ROOT, resolveCharacterDir } = await import('../../src/character/paths.js')
const { createApp } = await import('./app.js')
const { openBrowser } = await import('./browser.js')

// The token travels in a URL fragment and a request header, so it keeps to characters that need no escaping in either.
const TOKEN = /^[\w-]{24,}$/

const port = Number(process.env.STUDIO_PORT || 5174)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`STUDIO_PORT must be a port number from 1 to 65535, got: ${process.env.STUDIO_PORT}`)
  process.exit(1)
}
const token = process.env.STUDIO_TOKEN || randomBytes(24).toString('base64url')
if (!TOKEN.test(token)) {
  console.error('STUDIO_TOKEN must be at least 24 characters, each a letter, a digit, - or _')
  process.exit(1)
}
let packDir: string
try {
  packDir = resolveCharacterDir()
} catch (error) {
  console.error(`Persona Studio could not start: ${(error as Error).message}`)
  process.exit(1)
}
const app = createApp({
  token,
  port,
  root: REPO_ROOT,
  packDir,
  harnessDir: HARNESS_DIR,
  configPath: resolve(process.env.ROKABOT_CONFIG_PATH || join(REPO_ROOT, 'config.yml')),
  envPath: process.env.STUDIO_ENV_PATH ? resolve(process.env.STUDIO_ENV_PATH) : join(REPO_ROOT, '.env'),
  envExamplePath: join(REPO_ROOT, '.env.example'),
  env: shellEnv,
  uiDir: resolve(REPO_ROOT, process.env.STUDIO_UI_DIR || 'studio/ui/dist'),
  templateDir: join(REPO_ROOT, 'studio', 'template')
})

createServer(app)
  .on('error', (error) => {
    console.error(`Persona Studio could not start: ${error.message}`)
    process.exit(1)
  })
  .listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/#token=${token}`
    console.log(`Persona Studio: ${url}`)
    if (process.env.STUDIO_NO_OPEN !== '1') {
      openBrowser(url, () => console.log('Could not open a browser; open the URL above by hand.'))
    }
  })
