import { lstatSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { SECURITY_HEADERS, fail } from './http.js'

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8'
}

// Vite names every file under assets/ by its content hash, so a changed file always gets a new URL.
const IMMUTABLE = 'public, max-age=31536000, immutable'

// The app's own routes, which may end in a file name such as /prompts/intro.md, always get index.html.
const APP_ROUTES = new Set([
  'identity',
  'prompts',
  'voice',
  'moods',
  'lines',
  'models',
  'memory',
  'limits',
  'discord',
  'secrets'
])

/** A symlink is not a file here, so nothing outside the UI folder is served through one. */
function isFile(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false })?.isFile() === true
}

/**
 * Serves the built UI from `uiDir`. A path with no extension, or under one of the app's routes, gets index.html;
 * a dot-file, a path that leaves the folder or a missing file with an extension is not found.
 */
export function serveUi(req: IncomingMessage, res: ServerResponse, url: URL, uiDir: string): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw fail(405, `${req.method} is not allowed here`)
  const root = resolve(uiDir)
  const index = join(root, 'index.html')
  if (!isFile(index)) throw fail(503, 'the Persona Studio UI is not built: run npm run studio')
  let path: string
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    throw fail(400, 'the path is not valid URL encoding')
  }
  const file = join(root, path)
  const inside = relative(root, file)
  const outside = path.includes('\0') || inside.startsWith('..') || isAbsolute(inside)
  if (outside || inside.split(sep).some((part) => part.startsWith('.'))) throw fail(404, `no file ${url.pathname}`)
  const route = APP_ROUTES.has(path.split('/')[1] ?? '')
  const target = isFile(file) ? file : extname(path) === '' || route ? index : undefined
  if (!target) throw fail(404, `no file ${url.pathname}`)
  const body = readFileSync(target)
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'content-type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': relative(root, target).split(sep)[0] === 'assets' ? IMMUTABLE : 'no-store'
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}
