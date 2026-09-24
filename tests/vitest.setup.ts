import { resolve } from 'node:path'

process.env.DOTENV_CONFIG_PATH = resolve('tests/vitest-empty.env')
process.env.DISCORD_TOKEN = 'vitest-discord-token'
process.env.DISCORD_CLIENT_ID = 'vitest-discord-client-id'
process.env.GEMINI_API_KEY = 'vitest-gemini-token'
process.env.ROKABOT_DB_PATH = ':memory:'
process.env.GRAPHIFY_GEMINI_API_KEY = ''
process.env.DEV_GEMINI_API_KEY = ''
process.env.TAVILY_API_KEY = ''
process.env.MODELSCOPE_API_KEY = ''
process.env.TYPESAFE_API_KEY = ''
