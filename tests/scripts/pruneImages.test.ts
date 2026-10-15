import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = resolve('scripts/prune-images.sh')

/** A fake `docker` that lists images newest-first and records every `rmi`. */
function fakeDocker(tags: string[]): { dir: string; removed: () => string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'prune-'))
  const log = join(dir, 'rmi.log')
  writeFileSync(log, '')
  writeFileSync(
    join(dir, 'docker'),
    `#!/usr/bin/env bash
if [ "$1" = "image" ] && [ "$2" = "ls" ]; then printf '%s\\n' ${tags.map((t) => `'${t}'`).join(' ')}; exit 0; fi
if [ "$1" = "rmi" ]; then shift; printf '%s\\n' "$@" >> '${log}'; exit 0; fi
exit 1
`
  )
  chmodSync(join(dir, 'docker'), 0o755)
  return { dir, removed: () => readFileSync(log, 'utf8').split('\n').filter(Boolean) }
}

function run(dir: string, ...args: string[]) {
  execFileSync('bash', [SCRIPT, ...args], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } })
}

describe('prune-images.sh', () => {
  it('keeps the running tag and the newest other sha tag, and removes the rest', () => {
    const repo = 'ghcr.io/alaskantuna/rokabot'
    const docker = fakeDocker([`${repo}:sha-ccccccc`, `${repo}:sha-bbbbbbb`, `${repo}:sha-aaaaaaa`, `${repo}:edge`])

    run(docker.dir, repo, 'sha-ccccccc')

    expect(docker.removed()).toEqual([`${repo}:sha-aaaaaaa`])
  })

  it('keeps the previous image when the running tag is not the newest', () => {
    const repo = 'ghcr.io/alaskantuna/rokabot-asr'
    const docker = fakeDocker([`${repo}:sha-ccccccc`, `${repo}:sha-bbbbbbb`, `${repo}:sha-aaaaaaa`])

    run(docker.dir, repo, 'sha-aaaaaaa')

    expect(docker.removed()).toEqual([`${repo}:sha-bbbbbbb`])
  })

  it('succeeds with no sha tags at all', () => {
    const repo = 'ghcr.io/alaskantuna/rokabot'
    const docker = fakeDocker([`${repo}:stable`])

    run(docker.dir, repo, 'sha-ccccccc')

    expect(docker.removed()).toEqual([])
  })

  it('removes nothing with two or fewer sha tags', () => {
    const repo = 'ghcr.io/alaskantuna/rokabot'
    const docker = fakeDocker([`${repo}:sha-bbbbbbb`, `${repo}:sha-aaaaaaa`])

    run(docker.dir, repo, 'sha-bbbbbbb')

    expect(docker.removed()).toEqual([])
  })
})
