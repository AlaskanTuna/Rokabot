import { resolve } from 'node:path'
import { config } from '../config.js'

describe('Vitest environment', () => {
  it('does not load credentials from the developer dotenv file', () => {
    expect(process.env.DOTENV_CONFIG_PATH).toBe(resolve('tests/vitest-empty.env'))
    expect(process.env.DISCORD_TOKEN).toBe('vitest-discord-token')
    expect(process.env.GEMINI_API_KEY).toBe('vitest-gemini-token')
    expect(process.env.ROKABOT_DB_PATH).toBe(':memory:')
    expect(process.env.MODELSCOPE_API_KEY).toBe('')
    expect(process.env.TYPESAFE_API_KEY).toBe('')
    expect(process.env.TAVILY_API_KEY).toBe('')
    expect(config.fallback.apiKey).toBeUndefined()
    expect(config.jev.apiKey).toBeUndefined()
  })
})
