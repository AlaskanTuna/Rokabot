import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

// Taken before src/character/paths.ts loads .env, so the config check reads .env as it is then, not at startup.
const shellEnv = { ...process.env }
if (process.env.STUDIO_ENV_PATH) process.env.DOTENV_CONFIG_PATH ??= process.env.STUDIO_ENV_PATH
const { HARNESS_DIR, REPO_ROOT, resolveCharacterDir } = await import('../../src/character/paths.js')
const { createApp } = await import('./app.js')

const port = Number(process.env.STUDIO_PORT || 5174)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`STUDIO_PORT must be a port number from 1 to 65535, got: ${process.env.STUDIO_PORT}`)
  process.exit(1)
}
const token = randomBytes(24).toString('base64url')
const app = createApp({
  token,
  port,
  root: REPO_ROOT,
  packDir: resolveCharacterDir(),
  harnessDir: HARNESS_DIR,
  configPath: resolve(process.env.ROKABOT_CONFIG_PATH || join(REPO_ROOT, 'config.yml')),
  envPath: process.env.STUDIO_ENV_PATH ? resolve(process.env.STUDIO_ENV_PATH) : join(REPO_ROOT, '.env'),
  envExamplePath: join(REPO_ROOT, '.env.example'),
  env: shellEnv
})

createServer(app)
  .on('error', (error) => {
    console.error(`Persona Studio could not start: ${error.message}`)
    process.exit(1)
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`Persona Studio API at http://127.0.0.1:${port}/api with X-Studio-Token: ${token}`)
    console.log('The Persona Studio UI ships after its design is approved; until then, call this JSON API directly.')
  })
