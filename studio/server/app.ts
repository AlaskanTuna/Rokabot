import type { IncomingMessage, ServerResponse } from 'node:http'
import { readConfig, validateConfig, writeConfig } from './configFile.js'
import { StudioError, fail, readJson, sameToken, sendJson, stringField } from './http.js'
import { modelProfiles, testModel } from './models.js'
import { fileEdits, preview, previewDraft, readPack, validatePackFiles, writePackFile, writePackFiles } from './pack.js'
import { createPack, hasPack, noPack, packCandidates, selectPack } from './packs.js'
import { packSchemas } from './schemas.js'
import { deleteSecret, listSecrets, setSecret } from './secrets.js'
import { serveUi } from './static.js'

export interface StudioOptions {
  token: string
  port: number
  /** API paths are relative to this folder, the repo root. */
  root: string
  /** The pack at startup; /api/pack/select and /api/pack/create switch it while the server runs. */
  packDir: string
  harnessDir: string
  configPath: string
  envPath: string
  envExamplePath: string
  /** The environment the bot would start in, before .env is read. */
  env: NodeJS.ProcessEnv
  /** The built UI, served at every path outside /api. */
  uiDir: string
  /** The pack /api/pack/create copies. */
  templateDir: string
  /** The model connection test's HTTP client; tests pass a stub. */
  fetch?: typeof fetch
}

type Handler = (req: IncomingMessage, url: URL) => unknown

const PREVIEW_FIELDS = ['mood', 'hour', 'memory', 'user'] as const

/** A draft preview's options as GET /api/preview's query, so both routes check them the same way. */
function previewQuery(body: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams()
  for (const name of PREVIEW_FIELDS) {
    const value = body[name]
    if (typeof value === 'string' || typeof value === 'number') query.set(name, String(value))
    else if (value !== undefined && value !== null) throw fail(400, `${name} must be a string or a number`)
  }
  return query
}

/**
 * Routes one request. Every request must name the studio's own host and come from no origin or its own; every /api
 * request must also carry the session token. Other paths serve the built UI.
 */
export function createApp(options: StudioOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const hosts = new Set([`127.0.0.1:${options.port}`, `localhost:${options.port}`])
  const origins = new Set([...hosts].map((host) => `http://${host}`))
  const studio = { ...options }
  const pack = () => {
    if (!hasPack(studio.packDir)) throw noPack(studio)
    return studio
  }
  const packView = () => ({ ...readPack(pack()), candidates: packCandidates(studio.root) })
  const routes: Record<string, Record<string, Handler>> = {
    '/api/pack': { GET: packView },
    '/api/pack/file': {
      PUT: async (req) => {
        const body = await readJson(req)
        return writePackFile(pack(), stringField(body, 'path'), stringField(body, 'text'))
      }
    },
    '/api/pack/files': { PUT: async (req) => writePackFiles(pack(), fileEdits(await readJson(req), 1)) },
    '/api/pack/validate': { POST: async (req) => validatePackFiles(pack(), fileEdits(await readJson(req), 0)) },
    '/api/pack/select': {
      POST: async (req) => {
        studio.packDir = await selectPack(studio, stringField(await readJson(req), 'dir'))
        return packView()
      }
    },
    '/api/pack/create': {
      POST: async (req) => {
        studio.packDir = await createPack(studio, stringField(await readJson(req), 'id'))
        return packView()
      }
    },
    '/api/preview': {
      GET: (_req, url) => preview(pack(), url.searchParams),
      POST: async (req) => {
        const body = await readJson(req)
        return previewDraft(pack(), fileEdits(body, 0), previewQuery(body))
      }
    },
    '/api/schema': { GET: () => packSchemas() },
    '/api/config': {
      GET: () => readConfig(studio),
      PUT: async (req) => writeConfig(studio, stringField(await readJson(req), 'text'))
    },
    '/api/config/validate': { POST: async (req) => validateConfig(studio, stringField(await readJson(req), 'text')) },
    '/api/secrets': { GET: () => listSecrets(studio) },
    '/api/models/profiles': { GET: () => modelProfiles() },
    '/api/models/test': { POST: async (req) => testModel(studio, await readJson(req)) }
  }
  const secretRoutes: Record<string, (req: IncomingMessage, key: string) => unknown> = {
    PUT: async (req, key) => setSecret(studio, key, stringField(await readJson(req), 'value')),
    DELETE: (_req, key) => deleteSecret(studio, key)
  }

  function route(req: IncomingMessage, url: URL): unknown {
    const method = req.method ?? 'GET'
    const secret = /^\/api\/secrets\/([^/]+)$/.exec(url.pathname)
    if (secret) {
      const handler = secretRoutes[method]
      if (!handler) throw fail(405, `${method} is not allowed here`)
      let key: string
      try {
        key = decodeURIComponent(secret[1])
      } catch {
        throw fail(400, 'the key is not valid URL encoding')
      }
      return handler(req, key)
    }
    const methods = routes[url.pathname]
    if (!methods) throw fail(404, `no endpoint ${url.pathname}`)
    const handler = methods[method]
    if (!handler) throw fail(405, `${method} is not allowed here`)
    return handler(req, url)
  }

  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const { host, origin } = req.headers
      // A DNS-rebound page reaches 127.0.0.1 under its own host name, so only the studio's own names are served.
      if (!hosts.has(host ?? '')) throw fail(403, 'requests for another host name are refused')
      if (origin !== undefined && !origins.has(origin)) throw fail(403, 'requests from another origin are refused')
      if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return serveUi(req, res, url, studio.uiDir)
      if (!sameToken(req.headers['x-studio-token'], studio.token)) {
        throw fail(401, 'send the session token printed at startup in the X-Studio-Token header')
      }
      sendJson(res, 200, await route(req, url))
    } catch (error) {
      if (error instanceof StudioError) sendJson(res, error.status, { error: error.body, ...error.extra })
      else sendJson(res, 500, { error: { file: null, path: null, message: (error as Error).message } })
    }
  }
}
