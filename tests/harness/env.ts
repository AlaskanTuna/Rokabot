import { existsSync, readFileSync } from 'node:fs'
import * as dotenv from 'dotenv'

const parsed = existsSync('.env') ? dotenv.parse(readFileSync('.env')) : {}

process.env.ROKABOT_DB_PATH = ':memory:'
process.env.DISCORD_TOKEN = 'harness-discord-token'
process.env.DISCORD_CLIENT_ID = 'harness-discord-client-id'

if (process.argv.includes('--live') || process.env.ROKABOT_HARNESS_LIVE === '1') {
  // Which .env key funds a live run. Each key sits in its own Google project with its own daily
  // quota, so exhausting one does not have to stall the gate; name another instead of waiting.
  const keyName = process.env.ROKABOT_HARNESS_KEY ?? 'GRAPHIFY_GEMINI_API_KEY'
  const harnessKey = parsed[keyName]
  if (!harnessKey) {
    throw new Error(`Missing ${keyName} for live harness mode`)
  }

  process.env.GEMINI_API_KEY = harnessKey
  process.env.GOOGLE_GENAI_API_KEY = harnessKey
} else {
  process.env.GEMINI_API_KEY = 'harness-fake-sentinel'
}

if (process.env.GEMINI_API_KEY === parsed.GEMINI_API_KEY) {
  throw new Error('Harness resolved the production GEMINI_API_KEY')
}
