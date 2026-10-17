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
}

const KEY = /^[A-Z][A-Z0-9_]*$/
const ENTRY = /^\s*(?:export\s+)?([\w.-]+)\s*=/
// .env.example documents optional keys as commented-out entries, so they count as known keys too.
const EXAMPLE_ENTRY = /^#?\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=/
const SAFE_UNQUOTED = /^[\w@%+,./:~-]*$/
// Shorter values show no tail at all, so the mask never gives away most of one.
const TAIL_FROM_LENGTH = 12

function maskSecret(value: string): string {
  return `••••${value.length >= TAIL_FROM_LENGTH ? value.slice(-4) : ''}`
}

function keysIn(text: string, pattern: RegExp): string[] {
  return text.split('\n').flatMap((line) => pattern.exec(line)?.[1] ?? [])
}

function exampleKeys(paths: SecretPaths): Set<string> {
  return new Set(keysIn(readText(paths.envExamplePath), EXAMPLE_ENTRY))
}

function entry(key: string, value: string, example: ReadonlySet<string>): SecretEntry {
  return { key, set: value !== '', masked: value === '' ? null : maskSecret(value), inExample: example.has(key) }
}

function checkKey(key: string): void {
  if (!KEY.test(key)) throw fail(400, `a key must match ${KEY.source}`)
}

export function listSecrets(paths: SecretPaths): SecretEntry[] {
  const example = exampleKeys(paths)
  const text = readText(paths.envPath)
  const values = parse(text)
  return [...new Set([...example, ...keysIn(text, ENTRY)])].map((key) =>
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
