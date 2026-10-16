import { describe, expect, it } from 'vitest'
import {
  SearchCache,
  appendReplyShape,
  parseArm,
  parsePromptSource,
  promptSourcePath,
  resumeKey
} from '../persona-replay.js'

describe('parseArm', () => {
  it('reads a name, prompt source and production model setting', () => {
    expect(parseArm('v3=ref:main@haiku:low')).toEqual({
      name: 'v3',
      source: { kind: 'ref', ref: 'main' },
      model: 'haiku:low'
    })
    expect(parseArm('current=worktree@gemini').model).toBe('gemini')
  })

  it('rejects malformed arm specifications', () => {
    expect(() => parseArm('oops@sonnet:high')).toThrow('arm')
  })
})

describe('parsePromptSource', () => {
  it('resolves worktree and git ref source forms', () => {
    expect(parsePromptSource('worktree')).toEqual({ kind: 'worktree' })
    expect(parsePromptSource('ref:main')).toEqual({ kind: 'ref', ref: 'main' })
    expect(() => parsePromptSource('ref:')).toThrow('prompt source')
  })
})

describe('promptSourcePath', () => {
  it('points to the current agent tree or the exported ref tree', () => {
    expect(promptSourcePath({ kind: 'worktree' }, '/repo')).toBe('/repo/src/agent')
    expect(promptSourcePath({ kind: 'ref', ref: 'main' }, '/repo', '/tmp/export')).toBe('/tmp/export/src/agent')
  })
})

describe('appendReplyShape', () => {
  it('matches turnContext spacing', () => {
    expect(appendReplyShape('system', '## Reply Shape')).toBe('system\n\n## Reply Shape')
  })
})

describe('resumeKey', () => {
  it('keys each arm, turn and trial', () => {
    expect(resumeKey({ arm: 'a', turnId: 'chat:1', trial: 2 })).toBe('a|chat:1|2')
  })
})

describe('SearchCache', () => {
  it('shares a fetched result per turn and query', async () => {
    const cache = new SearchCache()
    let calls = 0
    const fetcher = async () => ({ answer: String(++calls) })
    await expect(cache.get('turn-1', 'query', fetcher)).resolves.toEqual({ answer: '1' })
    await expect(cache.get('turn-1', 'query', fetcher)).resolves.toEqual({ answer: '1' })
    await expect(cache.get('turn-1', 'another query', fetcher)).resolves.toEqual({ answer: '2' })
    expect(calls).toBe(2)
  })
})
