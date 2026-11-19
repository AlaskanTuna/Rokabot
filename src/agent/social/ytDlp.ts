import { spawn } from 'node:child_process'
import { lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const MAX_YTDLP_STDOUT_BYTES = 2 * 1024 * 1024

export function buildYtDlpArgs(url: string, timeoutMs: number, extraArgs: readonly string[] = []): string[] {
  return [
    '--ignore-config',
    '--no-plugin-dirs',
    '--no-cache-dir',
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout',
    String(Math.max(1, Math.ceil(timeoutMs / 1000))),
    '--retries',
    '0',
    '--extractor-retries',
    '0',
    '--js-runtimes',
    'node',
    '--dump-json',
    '--skip-download',
    ...extraArgs,
    url
  ]
}

function isolatedEnvironment(home: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '',
    HOME: home,
    XDG_CACHE_HOME: home,
    XDG_CONFIG_HOME: home,
    TMPDIR: home
  }
}

async function readMatchingPages(home: string, pattern: RegExp): Promise<string[]> {
  const names = (await readdir(home)).filter((name) => name.search(pattern) !== -1).sort()
  const pages: string[] = []
  for (const name of names) {
    const filePath = join(home, name)
    const info = await lstat(filePath)
    if (!info.isFile() || info.size > MAX_YTDLP_STDOUT_BYTES) continue
    pages.push(await readFile(filePath, 'utf8'))
  }
  return pages
}

export async function runYtDlp(
  binaryPath: string,
  url: string,
  timeoutMs: number,
  extraArgs: readonly string[] = [],
  options: { keepPages?: RegExp } = {}
): Promise<{ metadata: unknown } | { reason: string; pages?: string[] }> {
  const args = options.keepPages ? [...extraArgs, '--write-pages'] : extraArgs
  const home = await mkdtemp(join(tmpdir(), 'rokabot-social-'))
  try {
    return await new Promise((resolve) => {
      const child = spawn(binaryPath, buildYtDlpArgs(url, timeoutMs, args), {
        cwd: home,
        env: isolatedEnvironment(home),
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      const output: Buffer[] = []
      let outputBytes = 0
      let failure: string | null = null
      let settled = false
      const finish = (result: { metadata: unknown } | { reason: string; pages?: string[] }) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }
      const timer = setTimeout(() => {
        failure = 'timeout'
        child.kill('SIGKILL')
      }, timeoutMs)

      child.stdout?.on('data', (chunk: Buffer) => {
        outputBytes += chunk.byteLength
        if (outputBytes > MAX_YTDLP_STDOUT_BYTES) {
          failure = 'output_too_large'
          child.kill('SIGKILL')
          return
        }
        output.push(chunk)
      })
      child.once('error', (error: NodeJS.ErrnoException) => {
        finish({ reason: error.code === 'ENOENT' ? 'binary_missing' : 'spawn_error' })
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        if (failure) {
          finish({ reason: failure })
          return
        }
        if (code !== 0) {
          const reason = `exit_${code ?? 'unknown'}`
          if (!options.keepPages) {
            finish({ reason })
            return
          }
          void readMatchingPages(home, options.keepPages).then(
            (pages) => finish(pages.length > 0 ? { reason, pages } : { reason }),
            () => finish({ reason })
          )
          return
        }

        const line = Buffer.concat(output).toString('utf8').trim().split(/\r?\n/, 1)[0]
        if (!line) {
          finish({ reason: 'empty_output' })
          return
        }
        try {
          finish({ metadata: JSON.parse(line) as unknown })
        } catch {
          finish({ reason: 'invalid_json' })
        }
      })
    })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

export async function isYtDlpAvailable(binaryPath: string, timeoutMs = 10_000): Promise<boolean> {
  const home = await mkdtemp(join(tmpdir(), 'rokabot-social-check-'))
  try {
    return await new Promise((resolve) => {
      const child = spawn(binaryPath, ['--version'], {
        cwd: home,
        env: isolatedEnvironment(home),
        shell: false,
        stdio: 'ignore'
      })
      let settled = false
      const finish = (available: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(available)
      }
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish(false)
      }, timeoutMs)
      child.once('error', () => finish(false))
      child.once('close', (code) => finish(code === 0))
    })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}
