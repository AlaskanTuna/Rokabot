import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MemsimBudgetExceededError, MemsimCache, MemsimLiveCallError, hashRequest } from '../memsim/cache.js'

describe('MemsimCache live recording', () => {
  let cacheDir: string

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'memsim-cache-'))
  })

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true })
  })

  it('retries a failing live call until it succeeds, then caches the response', async () => {
    const cache = new MemsimCache({ mode: 'record', cacheDir, retryBaseMs: 0 })
    const liveFn = vi
      .fn<() => Promise<{ ok: number }>>()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockResolvedValue({ ok: 1 })

    const result = await cache.getOrRecord('river', { q: 'retry' }, liveFn)

    expect(result).toEqual({ value: { ok: 1 }, cached: false })
    expect(liveFn).toHaveBeenCalledTimes(3)
    expect(cache.stats().liveCalls.river).toBe(3)
    expect(existsSync(join(cacheDir, 'river', `${hashRequest('river', { q: 'retry' })}.json`))).toBe(true)
  })

  it('throws MemsimLiveCallError after four rejected attempts, writes nothing, and goes fatal', async () => {
    const cache = new MemsimCache({ mode: 'record', cacheDir, retryBaseMs: 0 })
    const liveFn = vi.fn(async () => ({ status: 500 }))
    const shouldCache = vi.fn(() => false)

    const call = cache.getOrRecord('typesafe', { q: 'rejected' }, liveFn, shouldCache)

    await expect(call).rejects.toBeInstanceOf(MemsimLiveCallError)
    await expect(call).rejects.toMatchObject({ provider: 'typesafe', attempts: 4 })
    expect(liveFn).toHaveBeenCalledTimes(4)
    expect(cache.stats().liveCalls.typesafe).toBe(4)
    expect(existsSync(join(cacheDir, 'typesafe', `${hashRequest('typesafe', { q: 'rejected' })}.json`))).toBe(false)
    expect(() => cache.throwIfFatal()).toThrow(MemsimLiveCallError)
  })

  it('stops retrying when the provider budget runs out', async () => {
    const cache = new MemsimCache({ mode: 'record', cacheDir, budgets: { river: 2 }, retryBaseMs: 0 })
    const liveFn = vi.fn<() => Promise<never>>(async () => {
      throw new Error('always failing')
    })

    await expect(cache.getOrRecord('river', { q: 'budget' }, liveFn)).rejects.toBeInstanceOf(MemsimBudgetExceededError)
    expect(liveFn).toHaveBeenCalledTimes(2)
    expect(cache.stats().liveCalls.river).toBe(2)
    expect(() => cache.throwIfFatal()).toThrow(MemsimBudgetExceededError)
  })
})
