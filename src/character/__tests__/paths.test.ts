import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT, resolveCharacterDir } from '../paths.js'

describe('resolveCharacterDir', () => {
  it('prefers CHARACTER_DIR, then config.yml, then Roka, resolving against the repo root', () => {
    const configPath = join(tmpdir(), `rokabot-character-config-${process.pid}.yml`)
    writeFileSync(configPath, 'character: tests/fixtures/characters/minimal\n')
    expect(resolveCharacterDir({ CHARACTER_DIR: 'packs/mina', ROKABOT_CONFIG_PATH: configPath })).toBe(
      resolve(REPO_ROOT, 'packs/mina')
    )
    expect(resolveCharacterDir({ ROKABOT_CONFIG_PATH: configPath })).toBe(
      resolve(REPO_ROOT, 'tests/fixtures/characters/minimal')
    )
    writeFileSync(configPath, 'timezone: UTC\n')
    expect(resolveCharacterDir({ ROKABOT_CONFIG_PATH: configPath })).toBe(resolve(REPO_ROOT, 'characters/roka'))
    writeFileSync(configPath, 'character: 3\n')
    expect(() => resolveCharacterDir({ ROKABOT_CONFIG_PATH: configPath })).toThrow('character must be the path')
  })
})

describe('packaging', () => {
  it('ships the character packs and the harness prompts in the Docker image', () => {
    const ignored = readFileSync('.dockerignore', 'utf8').split('\n')
    expect(ignored.indexOf('!characters/**')).toBeGreaterThan(ignored.indexOf('*.md'))
    expect(ignored.indexOf('!prompts/**')).toBeGreaterThan(ignored.indexOf('*.md'))
    const dockerfile = readFileSync('Dockerfile', 'utf8')
    expect(dockerfile).toContain('COPY characters/ characters/')
    expect(dockerfile).toContain('COPY prompts/ prompts/')
  })

  it('keeps Prettier away from the model-facing Markdown', () => {
    const ignored = readFileSync('.prettierignore', 'utf8').split('\n')
    expect(ignored).toEqual(expect.arrayContaining(['characters/**/*.md', 'prompts/**/*.md']))
  })
})
