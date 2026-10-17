import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

/** Writes through a temp file in the same folder and a rename, so a reader never sees half a file. */
export function writeAtomic(file: string, text: string, newFileMode = 0o644): void {
  const mode = existsSync(file) ? statSync(file).mode & 0o777 : newFileMode
  const temp = join(dirname(file), `.${basename(file)}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    writeFileSync(temp, text, { mode })
    renameSync(temp, file)
  } finally {
    rmSync(temp, { force: true })
  }
}

export function readText(file: string): string {
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/** The path the API shows for a file: relative to the repo root with forward slashes, or absolute outside it. */
export function apiPath(root: string, file: string): string {
  const fromRoot = relative(root, file)
  return fromRoot.startsWith('..') || isAbsolute(fromRoot) ? file : fromRoot.split(sep).join('/')
}
