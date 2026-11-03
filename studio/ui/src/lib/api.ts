import type {
  FileEdit,
  ModelProfile,
  ModelTest,
  Pack,
  Preview,
  PreviewParams,
  Problem,
  Secret,
  TestModelRequest,
  Validation
} from '../../../shared/contract'

export type {
  FileEdit,
  MemoryMode,
  ModelCapabilities,
  ModelPrice,
  ModelProfile,
  ModelTest,
  Pack,
  PackFile,
  PackSummary,
  Preview,
  PreviewParams,
  Problem,
  Secret,
  TestModelRequest,
  Validation
} from '../../../shared/contract'

/** A refused or failed API call, carrying the server's `{ error: { file, path, message } }` and any extra fields. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
    readonly body: Record<string, unknown> = {}
  ) {
    super(problem.message)
  }

  get problems(): Problem[] {
    const list = this.body.problems
    return Array.isArray(list) && list.length > 0 ? (list as Problem[]) : [this.problem]
  }

  get code(): string | undefined {
    return typeof this.body.code === 'string' ? this.body.code : undefined
  }
}

const TOKEN_KEY = 'studio.token'

/** Takes the session token from the `#token=` link the terminal printed, then drops it from the address bar. */
export function readToken(): string | null {
  const match = /(?:^#|&)token=([^&]+)/.exec(window.location.hash)
  if (match) {
    const token = decodeURIComponent(match[1])
    try {
      sessionStorage.setItem(TOKEN_KEY, token)
    } catch {}
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    return token
  }
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

let token: string | null = null

export function setToken(value: string | null): void {
  token = value
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: {
        'x-studio-token': token ?? '',
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch {
    throw new ApiError(0, {
      file: null,
      path: null,
      message: 'Persona Studio is not answering. Check that npm run studio is still running.'
    })
  }
  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const record = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
    const error = (record.error ?? {}) as Partial<Problem>
    throw new ApiError(
      response.status,
      {
        file: error.file ?? null,
        path: error.path ?? null,
        message:
          error.message ??
          `The studio answered ${response.status}. Try again, or check the terminal running npm run studio.`
      },
      record
    )
  }
  return data as T
}

const query = (params: PreviewParams) =>
  new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]]))
  ).toString()

export const api = {
  pack: () => call<Pack>('GET', '/api/pack'),
  savePackFiles: (files: FileEdit[]) =>
    call<{ files: string[]; validation: Validation }>('PUT', '/api/pack/files', { files }),
  validatePack: (files: FileEdit[]) => call<{ validation: Validation }>('POST', '/api/pack/validate', { files }),
  validateConfig: (text: string) =>
    call<{ ok: true } | { ok: false; problem: Problem }>('POST', '/api/config/validate', { text }),
  selectPack: (dir: string) => call<Pack>('POST', '/api/pack/select', { dir }),
  createPack: (id: string) => call<Pack>('POST', '/api/pack/create', { id }),
  preview: (params: PreviewParams) => call<Preview>('GET', `/api/preview?${query(params)}`),
  previewDrafts: (files: FileEdit[], params: PreviewParams) =>
    call<Preview>('POST', '/api/preview', { files, ...params }),
  schema: () => call<Record<string, unknown>>('GET', '/api/schema'),
  config: () => call<{ path: string; text: string }>('GET', '/api/config'),
  saveConfig: (text: string) => call<{ path: string; ok: true }>('PUT', '/api/config', { text }),
  secrets: () => call<Secret[]>('GET', '/api/secrets'),
  setSecret: (key: string, value: string) => call<Secret>('PUT', `/api/secrets/${encodeURIComponent(key)}`, { value }),
  deleteSecret: (key: string) => call<Secret>('DELETE', `/api/secrets/${encodeURIComponent(key)}`),
  modelProfiles: () => call<ModelProfile[]>('GET', '/api/models/profiles'),
  testModel: (entry: TestModelRequest) => call<ModelTest>('POST', '/api/models/test', entry)
}
