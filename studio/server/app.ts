import type { IncomingMessage, ServerResponse } from 'node:http'
import { readConfig, writeConfig } from './configFile.js'
import { StudioError, fail, readJson, sameToken, sendJson, stringField } from './http.js'
import { preview, readPack, writePackFile } from './pack.js'
import { packSchemas } from './schemas.js'
import { deleteSecret, listSecrets, setSecret } from './secrets.js'

export interface StudioOptions {
  token: string
  port: number
  /** API paths are relative to this folder, the repo root. */
  root: string
  packDir: string
  harnessDir: string
  configPath: string
  envPath: string
  envExamplePath: string
  /** The environment the bot would start in, before .env is read. */
  env: NodeJS.ProcessEnv
}

type Handler = (req: IncomingMessage, url: URL) => unknown

/** Routes one request; every /api request must carry the session token and come from no origin or the studio's own. */
export function createApp(options: StudioOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const hosts = new Set([`127.0.0.1:${options.port}`, `localhost:${options.port}`])
  const origins = new Set([...hosts].map((host) => `http://${host}`))
  const routes: Record<string, Record<string, Handler>> = {
    '/api/pack': { GET: () => readPack(options) },
    '/api/pack/file': {
      PUT: async (req) => {
        const body = await readJson(req)
        return writePackFile(options, stringField(body, 'path'), stringField(body, 'text'))
      }
    },
    '/api/preview': { GET: (_req, url) => preview(options, url.searchParams) },
    '/api/schema': { GET: () => packSchemas() },
    '/api/config': {
      GET: () => readConfig(options),
      PUT: async (req) => writeConfig(options, stringField(await readJson(req), 'text'))
    },
    '/api/secrets': { GET: () => listSecrets(options) }
  }
  const secretRoutes: Record<string, (req: IncomingMessage, key: string) => unknown> = {
    PUT: async (req, key) => setSecret(options, key, stringField(await readJson(req), 'value')),
    DELETE: (_req, key) => deleteSecret(options, key)
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
      if (!url.pathname.startsWith('/api/')) throw fail(404, 'the Persona Studio UI ships after its design is approved')
      const { host, origin } = req.headers
      // A DNS-rebound page reaches 127.0.0.1 under its own host name, so only the studio's own names are served.
      if (!hosts.has(host ?? '')) throw fail(403, 'requests for another host name are refused')
      if (origin !== undefined && !origins.has(origin)) throw fail(403, 'requests from another origin are refused')
      if (!sameToken(req.headers['x-studio-token'], options.token)) {
        throw fail(401, 'send the session token printed at startup in the X-Studio-Token header')
      }
      sendJson(res, 200, await route(req, url))
    } catch (error) {
      if (error instanceof StudioError) sendJson(res, error.status, { error: error.body, ...error.extra })
      else sendJson(res, 500, { error: { file: null, path: null, message: (error as Error).message } })
    }
  }
}
