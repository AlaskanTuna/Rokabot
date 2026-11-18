import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { config } from '../../../config.js'
import { closeDb, getDb } from '../../../storage/database.js'
import { billingMonthKey, cachedLens, lensAllowed, lensCacheKey, recordLensSearch, storeLens } from './lensLedger.js'

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('lens ledger caps', () => {
  it('refuses automatic lookups past the daily cap but keeps model lookups', () => {
    const now = Date.UTC(2026, 5, 15, 12)
    for (let index = 0; index < config.imageId.autoDailyCap; index++) recordLensSearch('auto', now)
    expect(lensAllowed('auto', now)).toBe(false)
    expect(lensAllowed('model', now)).toBe(true)
  })

  it('refuses everything past the shared monthly cap', () => {
    const now = Date.UTC(2026, 5, 15, 12)
    for (let index = 0; index < config.imageId.monthlyCap; index++) recordLensSearch('model', now)
    expect(lensAllowed('model', now)).toBe(false)
    expect(lensAllowed('auto', now)).toBe(false)
  })

  it('rolls the month over on the reset day', () => {
    const lastDay = Date.UTC(2026, 0, 31, 23)
    for (let index = 0; index < config.imageId.monthlyCap; index++) recordLensSearch('model', lastDay)
    expect(lensAllowed('model', lastDay)).toBe(false)
    expect(lensAllowed('model', Date.UTC(2026, 1, 1, 1))).toBe(true)
  })

  it('keys the billing month to resetDay', () => {
    expect(billingMonthKey(Date.UTC(2026, 1, 5, 12), 10)).toBe('2026-01')
    expect(billingMonthKey(Date.UTC(2026, 1, 10, 0), 10)).toBe('2026-02')
    expect(billingMonthKey(Date.UTC(2026, 0, 5, 12), 10)).toBe('2025-12')
  })
})

describe('lens cache', () => {
  it('keys Discord CDN urls by attachment id and falls back to the whole url', () => {
    expect(lensCacheKey('https://cdn.discordapp.com/attachments/123/456/photo.png')).toBe('456')
    expect(lensCacheKey('https://media.discordapp.net/attachments/123/456/photo.png?ex=1&width=100')).toBe('456')
    expect(lensCacheKey('https://example.com/x.jpg')).toBe('https://example.com/x.jpg')
  })

  it('returns stored results and drops entries past 24 h', () => {
    const stored = Date.UTC(2026, 5, 15, 12)
    const dayMs = 24 * 60 * 60 * 1000
    storeLens('abc', 'cached hints', stored)
    expect(cachedLens('abc', stored)).toBe('cached hints')
    expect(cachedLens('abc', stored + dayMs)).toBe('cached hints')
    expect(cachedLens('abc', stored + dayMs + 1)).toBeUndefined()
    expect(cachedLens('abc', stored)).toBeUndefined()
  })
})
