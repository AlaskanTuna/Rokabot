import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dump, load } from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'

describe('config startup with the real logger', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function importConfigInChild(override: Record<string, Record<string, unknown>>) {
    const base = load(readFileSync(process.env.ROKABOT_CONFIG_PATH as string, 'utf8')) as Record<string, object>
    for (const [section, values] of Object.entries(override)) base[section] = { ...base[section], ...values }
    const dir = mkdtempSync(join(tmpdir(), 'rokabot-config-startup-'))
    tempDirs.push(dir)
    const configPath = join(dir, 'config.yml')
    writeFileSync(configPath, dump(base))

    return spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', "await import('./src/config.ts')"],
      {
        encoding: 'utf8',
        env: { ...process.env, ROKABOT_CONFIG_PATH: configPath, NODE_ENV: 'production' },
        timeout: 10_000
      }
    )
  }

  it('settles and logs the turn deadline warning when gemini.timeout outgrows the deadline budget', () => {
    const result = importConfigInChild({ gemini: { timeout: 25000 } })

    expect(result.stderr).not.toContain('unsettled top-level await')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Turn deadline is smaller than the requiredMs budget')
  }, 15_000)

  it('settles and logs the reminder warning when the stale threshold is below the scheduler interval', () => {
    const result = importConfigInChild({ reminders: { staleThresholdMs: 4000 } })

    expect(result.stderr).not.toContain('unsettled top-level await')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      'Reminder stale threshold can sweep a reminder before any scheduler tick can deliver it'
    )
  }, 15_000)
})
