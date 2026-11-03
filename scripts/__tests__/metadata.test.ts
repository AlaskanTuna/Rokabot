import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { labelsFor, loadVocabulary, parseTitle, pullRequestProblems } from '../metadata.js'

const vocabulary = { types: ['feat', 'fix', 'docs', 'chore'], scopes: ['agent', 'main'] }

describe('parseTitle', () => {
  it('parses scoped, unscoped and breaking titles', () => {
    expect(parseTitle('fix(agent): keep it', vocabulary)).toEqual({ type: 'fix', scope: 'agent' })
    expect(parseTitle('docs: tidy', vocabulary)).toEqual({ type: 'docs', scope: null })
    expect(parseTitle('feat(agent)!: drop it', vocabulary)).toEqual({ type: 'feat', scope: 'agent' })
  })

  it('rejects unknown types, unknown scopes and non-conventional titles', () => {
    expect(parseTitle('enhancement(discord): x', vocabulary)).toBeNull()
    expect(parseTitle('fix(nope): x', vocabulary)).toBeNull()
    expect(parseTitle('Safety regeneration spends a retry', vocabulary)).toBeNull()
  })

  it('treats quotes, backticks and command substitution as data', () => {
    expect(parseTitle('fix(agent): $(rm -rf /) `x` "y"', vocabulary)).toEqual({ type: 'fix', scope: 'agent' })
  })
})

describe('labelsFor', () => {
  it('maps a scope to its area label and a missing scope to area:repo', () => {
    expect(labelsFor({ type: 'fix', scope: 'agent' })).toEqual(['type:fix', 'area:agent'])
    expect(labelsFor({ type: 'docs', scope: null })).toEqual(['type:docs', 'area:repo'])
  })
})

describe('pullRequestProblems', () => {
  const good = { title: 'fix(agent): x', labels: ['type:fix', 'area:agent'], assignees: ['a'], headRef: 'fix/x' }

  it('accepts a well-formed pull request', () => {
    expect(pullRequestProblems(good, vocabulary)).toEqual([])
  })

  it('flags a missing assignee or a missing type or area label', () => {
    expect(pullRequestProblems({ ...good, assignees: [] }, vocabulary)).toHaveLength(1)
    expect(pullRequestProblems({ ...good, labels: ['area:agent'] }, vocabulary)).toHaveLength(1)
    expect(pullRequestProblems({ ...good, labels: ['type:fix'] }, vocabulary)).toHaveLength(1)
  })

  it('flags a bad or overlong title', () => {
    expect(pullRequestProblems({ ...good, title: 'bad title' }, vocabulary).length).toBeGreaterThan(0)
    expect(pullRequestProblems({ ...good, title: `fix: ${'x'.repeat(100)}` }, vocabulary).length).toBeGreaterThan(0)
  })

  it('exempts release-please branches', () => {
    const release = { title: 'bad', labels: [], assignees: [], headRef: 'release-please--branches--main' }
    expect(pullRequestProblems(release, vocabulary)).toEqual([])
  })
})

describe('labels.yml', () => {
  it('covers the commitlint vocabulary', async () => {
    const live = await loadVocabulary()
    const raw = readFileSync(new URL('../../.github/labels.yml', import.meta.url), 'utf8')
    const labels = yaml.load(raw) as { name: string; color: string; description: string }[]
    const names = new Set(labels.map((label) => label.name))
    for (const type of live.types) expect(names.has(`type:${type}`)).toBe(true)
    for (const scope of live.scopes) {
      if (scope !== 'main') expect(names.has(`area:${scope}`)).toBe(true)
    }
    expect(names.has('area:repo')).toBe(true)
    expect(names.has('autorelease: pending')).toBe(true)
    expect(names.has('autorelease: tagged')).toBe(true)
    expect(names.has('needs-triage')).toBe(true)
  })
})

describe('main', () => {
  it('falls back to AlaskanTuna without leaking the title into gh arguments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rokabot-metadata-'))
    try {
      const argsFile = join(dir, 'gh-args.txt')
      writeFileSync(
        join(dir, 'gh'),
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$GH_ARGS_FILE"\ncase "$*" in\n*assignees/unassignable*) exit 1 ;;\nesac\nexit 0\n',
        { mode: 0o755 }
      )
      chmodSync(join(dir, 'gh'), 0o755)
      const title = 'fix(agent): handle `backticks` "quotes" $(evil)'
      const eventPath = join(dir, 'event.json')
      writeFileSync(
        eventPath,
        JSON.stringify({ issue: { number: 7, title, labels: [], assignees: [], user: { login: 'unassignable' } } })
      )
      execFileSync('node', [fileURLToPath(new URL('../metadata.ts', import.meta.url))], {
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH ?? ''}`,
          GH_ARGS_FILE: argsFile,
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_EVENT_NAME: 'issues',
          GITHUB_REPOSITORY: 'octo/repo'
        }
      })
      const recorded = readFileSync(argsFile, 'utf8')
      expect(recorded).toContain('type:fix')
      expect(recorded).toContain('area:agent')
      expect(recorded).toContain('AlaskanTuna')
      for (const line of recorded.trim().split('\n')) {
        expect(line).not.toContain(title)
        expect(line).not.toContain('$(evil)')
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
