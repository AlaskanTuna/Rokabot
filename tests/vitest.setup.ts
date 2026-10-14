import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { threadId } from 'node:worker_threads'
import { dump, load } from 'js-yaml'

// Tests pin the legacy route on the shipped settings, so they read config.yml without the deployer's llm: block
const { llm: _deployerLlm, ...shipped } = load(readFileSync('config.yml', 'utf8')) as Record<string, unknown>
const testConfigPath = join(tmpdir(), `rokabot-vitest-config-${process.pid}-${threadId}.yml`)
writeFileSync(testConfigPath, dump(shipped))
process.env.ROKABOT_CONFIG_PATH = testConfigPath

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
process.env.EMBEDDINGS_PROVIDER = ''
process.env.ANTHROPIC_API_KEY = ''
process.env.OPENAI_API_KEY = ''
process.env.LLM_MAIN = ''
process.env.LLM_FALLBACK = ''
