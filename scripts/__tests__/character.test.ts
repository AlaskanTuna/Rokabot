import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { main } from '../character.js'

const copies: string[] = []
afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function run(...argv: string[]): { code: number; output: string } {
  const lines: string[] = []
  const code = main(argv, (text) => lines.push(text))
  return { code, output: lines.join('\n') }
}

describe('character CLI', () => {
  it('checks a valid pack and summarises it', () => {
    const { code, output } = run('check', 'characters/roka')
    expect(code).toBe(0)
    expect(output).toContain('Roka (roka) from characters/roka')
    expect(output).toContain('12 moods: playful, sincere')
    expect(output).toMatch(/Stable prompt tokens by memory mode: full ~\d+, forget ~\d+, none ~\d+/)
  })

  it('fails a broken pack and names the problem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rokabot-character-cli-'))
    copies.push(dir)
    cpSync('characters/roka', dir, { recursive: true })
    const moods = join(dir, 'moods.yml')
    writeFileSync(moods, readFileSync(moods, 'utf8').replace('default: playful', 'default: cheerful'))
    const { code, output } = run('check', dir)
    expect(code).toBe(1)
    expect(output).toContain('is not a valid character pack')
    expect(output).toContain('moods.yml: default: unknown mood "cheerful"')
  })

  it('previews the system prompt for one turn', () => {
    const { code, output } = run('preview', 'characters/roka', '--mood', 'sleepy', '--hour', '2', '--memory', 'none')
    expect(code).toBe(0)
    expect(output).toContain('## Current Mood: Sleepy')
    expect(output).toContain("It's currently late night")
    expect(output).not.toContain('remember_user')
  })

  it('rejects an unknown mood or command', () => {
    expect(run('preview', 'characters/roka', '--mood', 'grumpy').output).toContain('--mood must be one of playful')
    expect(run('lint').code).toBe(1)
  })
})
