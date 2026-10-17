import { parse } from 'dotenv'
import { readText, writeAtomic } from './files.js'
import { fail } from './http.js'

export interface SecretPaths {
  envPath: string
  envExamplePath: string
}

export interface SecretEntry {
  key: string
  set: boolean
  masked: string | null
  inExample: boolean
  /** The comment lines above the key's group in .env.example, joined. */
  description: string
  required: boolean
}

interface ExampleKey {
  description: string
  required: boolean
}

// A new key must look like this; a key already in .env may be anything dotenv reads, such as https_proxy.
const NEW_KEY = /^[A-Z][A-Z0-9_]*$/
const KEY_NAME = /^[\w.-]+$/
const KEY_HINT = 'Use capital letters, digits and underscores, like MY_API_KEY.'
const ENTRY = /^\s*(?:export\s+)?([\w.-]+)\s*=/
// .env.example documents optional keys as commented-out entries, so they count as known keys too.
const EXAMPLE_ENTRY = /^#?\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=/
const SAFE_UNQUOTED = /^[\w@%+,./:~-]*$/
// Shorter values show no tail at all, so the mask never gives away most of one.
const TAIL_FROM_LENGTH = 12
// What src/config.ts reads through requiredEnv whatever config.yml says; other keys depend on the configured roles.
const ALWAYS_REQUIRED: ReadonlySet<string> = new Set(['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'])
const REQUIRED_GROUP = /^Required secrets\b/

function maskSecret(value: string): string {
  return `••••${value.length >= TAIL_FROM_LENGTH ? value.slice(-4) : ''}`
}

function keysIn(text: string, pattern: RegExp): string[] {
  return text.split('\n').flatMap((line) => pattern.exec(line)?.[1] ?? [])
}

/**
 * Every key in .env.example with the comment block directly above it. Keys listed one after another share the block
 * above the first, and the keys under the leading "# Required secrets" block are required.
 */
function exampleKeys(paths: SecretPaths): Map<string, ExampleKey> {
  const keys = new Map<string, ExampleKey>()
  let comments: string[] = []
  let inGroup = false
  for (const line of readText(paths.envExamplePath).split('\n')) {
    const key = EXAMPLE_ENTRY.exec(line)?.[1]
    if (key) {
      const description = comments.join(' ')
      keys.set(key, { description, required: ALWAYS_REQUIRED.has(key) || REQUIRED_GROUP.test(description) })
      inGroup = true
    } else if (line.startsWith('#')) {
      if (inGroup) comments = []
      inGroup = false
      const comment = line.replace(/^#+/, '').trim()
      if (comment) comments.push(comment)
    } else {
      comments = []
      inGroup = false
    }
  }
  return keys
}

function entry(key: string, value: string, example: ReadonlyMap<string, ExampleKey>): SecretEntry {
  return {
    key,
    set: value !== '',
    masked: value === '' ? null : maskSecret(value),
    inExample: example.has(key),
    description: example.get(key)?.description ?? '',
    required: example.get(key)?.required ?? ALWAYS_REQUIRED.has(key)
  }
}

/** What the bot reads for `key`: a variable set in the shell wins, as dotenv leaves one alone, then .env. */
export function envValue(paths: { env: NodeJS.ProcessEnv; envPath: string }, key: string): string | undefined {
  return Object.hasOwn(paths.env, key) ? paths.env[key] : parse(readText(paths.envPath))[key]
}

function checkKey(key: string): void {
  if (!KEY_NAME.test(key)) throw fail(400, KEY_HINT)
}

/** Every key .env.example or .env names, and the always-required ones even when neither file does. */
export function listSecrets(paths: SecretPaths): SecretEntry[] {
  const example = exampleKeys(paths)
  const text = readText(paths.envPath)
  const values = parse(text)
  return [...new Set([...example.keys(), ...ALWAYS_REQUIRED, ...keysIn(text, ENTRY)])].map((key) =>
    entry(key, Object.hasOwn(values, key) ? values[key] : '', example)
  )
}

/** The first spelling dotenv reads back as exactly `value`; single quotes first, since Compose interpolates `$` in others. */
function envLine(key: string, value: string): string {
  const spellings = [SAFE_UNQUOTED.test(value) ? value : undefined, `'${value}'`, `"${value}"`, `\`${value}\``]
  const line = spellings
    .filter((spelling) => spelling !== undefined)
    .map((spelling) => `${key}=${spelling}`)
    .find((candidate) => parse(candidate)[key] === value)
  if (!line) throw fail(400, `${key} mixes quote characters in a way .env cannot hold`)
  return line
}

/** Sets `key` in .env, replacing its line in place or appending one; every other line and comment stays as it was. */
export function setSecret(paths: SecretPaths, key: string, value: string): SecretEntry {
  checkKey(key)
  if (/[\r\n\0]/.test(value)) throw fail(400, `${key} must be a single line`)
  const line = envLine(key, value)
  let found = false
  const lines = readText(paths.envPath)
    .split('\n')
    .map((existing) => {
      if (ENTRY.exec(existing)?.[1] !== key) return existing
      found = true
      return line
    })
  if (!found && !NEW_KEY.test(key)) throw fail(400, KEY_HINT)
  if (!found && lines.at(-1) === '') lines.splice(-1, 0, line)
  else if (!found) lines.push(line, '')
  writeAtomic(paths.envPath, lines.join('\n'), 0o600)
  return entry(key, value, exampleKeys(paths))
}

export function deleteSecret(paths: SecretPaths, key: string): SecretEntry {
  checkKey(key)
  const lines = readText(paths.envPath).split('\n')
  const kept = lines.filter((line) => ENTRY.exec(line)?.[1] !== key)
  if (kept.length === lines.length) throw fail(404, `${key} is not in .env`)
  writeAtomic(paths.envPath, kept.join('\n'), 0o600)
  return entry(key, '', exampleKeys(paths))
}
