import { existsSync, readFileSync } from 'node:fs'
import * as dotenv from 'dotenv'

const parsed = existsSync('.env') ? dotenv.parse(readFileSync('.env')) : {}

process.env.ROKABOT_DB_PATH = ':memory:'
process.env.DISCORD_TOKEN = 'harness-discord-token'
process.env.DISCORD_CLIENT_ID = 'harness-discord-client-id'

if (process.argv.includes('--live')) {
  const graphifyKey = parsed.GRAPHIFY_GEMINI_API_KEY
  if (!graphifyKey) {
    throw new Error('Missing GRAPHIFY_GEMINI_API_KEY for live harness mode')
  }

  process.env.GEMINI_API_KEY = graphifyKey
  process.env.GOOGLE_GENAI_API_KEY = graphifyKey
} else {
  process.env.GEMINI_API_KEY = 'harness-fake-sentinel'
}

if (process.env.GEMINI_API_KEY === parsed.GEMINI_API_KEY) {
  throw new Error('Harness resolved the production GEMINI_API_KEY')
}
