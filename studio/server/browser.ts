import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

export type Command = [command: string, args: string[]]

function isWsl(): boolean {
  if (process.env.WSL_DISTRO_NAME) return true
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf8'))
  } catch {
    return false
  }
}

/** The commands that open `url` in the default browser, best first; on WSL, wslview reaches the Windows browser. */
export function browserCommands(url: string, platform: NodeJS.Platform = process.platform, wsl = isWsl()): Command[] {
  if (platform === 'darwin') return [['open', [url]]]
  // start takes its first quoted argument as a window title, hence the empty one.
  if (platform === 'win32') return [['cmd', ['/c', 'start', '""', `"${url}"`]]]
  return wsl
    ? [
        ['wslview', [url]],
        ['xdg-open', [url]]
      ]
    : [['xdg-open', [url]]]
}

/** Best effort: tries each command until one exits cleanly, and calls `failed` once if none does. Never throws. */
export function openBrowser(
  url: string,
  failed: () => void,
  commands: readonly Command[] = browserCommands(url)
): void {
  const [next, ...rest] = commands
  if (!next) {
    failed()
    return
  }
  let settled = false
  const tryNext = () => {
    if (settled) return
    settled = true
    openBrowser(url, failed, rest)
  }
  // Detached, so stopping the studio with Ctrl+C does not also close a browser it started.
  const child = spawn(next[0], next[1], {
    stdio: 'ignore',
    detached: process.platform !== 'win32',
    windowsVerbatimArguments: true
  })
  child.on('error', tryNext)
  child.on('exit', (code) => {
    if (code === 0) settled = true
    else tryNext()
  })
  child.unref()
}
