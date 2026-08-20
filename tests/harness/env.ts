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

  // Holds the prompt still for the length of the run. Without it a case set that happens to straddle 05:00
  // scores one prompt for its first cases and a different one for the rest, and two runs at different hours
  // are not comparable at all — which is what made "two green runs" read as reproducibility while delivering
  // a coin flip. 14 is an unremarkable hour: mid-afternoon, no time-of-day boundary within hours of it, and
  // outside detectTone's isLateNight window, so nothing about the pin is itself a special case.
  process.env.ROKABOT_FIXED_HOUR ??= '14'
} else {
  process.env.GEMINI_API_KEY = 'harness-fake-sentinel'
}

if (process.env.GEMINI_API_KEY === parsed.GEMINI_API_KEY) {
  throw new Error('Harness resolved the production GEMINI_API_KEY')
}
