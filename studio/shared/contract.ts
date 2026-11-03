/**
 * The studio API's request and response shapes, shared by the server handlers and the UI client. Both sides import
 * only the types, so a server change that drifts from the UI fails `npm run typecheck` instead of the browser.
 */
export interface Problem {
  file: string | null
  path: string | null
  message: string
}

export type MemoryMode = 'full' | 'forget' | 'none'

export interface PackSummary {
  id: string
  name: string
  moods: readonly string[]
  defaultMood: string
  stableTokens: Record<MemoryMode, number>
}

export type Validation = { ok: true; summary: PackSummary } | { ok: false; problems: Problem[] }

export interface PackFile {
  path: string
  kind: 'pack' | 'harness'
  locked: boolean
  text: string
}

export interface Pack {
  dir: string
  harnessDir: string
  files: PackFile[]
  validation: Validation
  candidates?: string[]
}

export interface Preview {
  prompt: string
  tokens: number
  stableTokens: number
}

export interface Secret {
  key: string
  set: boolean
  masked: string | null
  inExample: boolean
  description: string
  required: boolean
}

export interface ModelCapabilities {
  vision: boolean
  tools: boolean
  structuredOutput: string
  efforts: readonly string[]
}

export interface ModelPrice {
  input: number
  output: number
  cachedInput?: number
  cacheWrite?: number
}

export interface ModelProfile {
  provider: string
  model: string
  envVar: string | null
  capabilities: ModelCapabilities
  price: ModelPrice
}

export interface ModelTest {
  ok: boolean
  status: number | null
  latencyMs: number | null
  message: string
  modelListed: boolean | null
}

/** A pack file's new text, or null to delete it. */
export interface FileEdit {
  path: string
  text: string | null
}

export interface PreviewParams {
  mood?: string
  hour?: number
  memory?: MemoryMode
  user?: string
}

export interface TestModelRequest {
  provider: string
  model: string
  baseUrl?: string
  apiKeyEnv?: string
}
