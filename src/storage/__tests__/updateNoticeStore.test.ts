import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }))

import { closeDb, getDb } from '../database.js'
import { markUpdateNotified, wasUpdateNotified } from '../updateNoticeStore.js'

beforeEach(() => closeDb())
afterEach(() => closeDb())

describe('updateNoticeStore', () => {
  it('creates the update_notices table keyed by tag', () => {
    const columns = getDb().prepare("PRAGMA table_info('update_notices')").all() as Array<{ name: string; pk: number }>

    expect(columns.map((column) => column.name)).toEqual(['tag', 'notified_at'])
    expect(columns.filter((column) => column.pk > 0).map((column) => column.name)).toEqual(['tag'])
  })

  it('reports a tag as notified only after it is marked', () => {
    expect(wasUpdateNotified('v0.3.0')).toBe(false)

    markUpdateNotified('v0.3.0', 1000)

    expect(wasUpdateNotified('v0.3.0')).toBe(true)
    expect(wasUpdateNotified('v0.4.0')).toBe(false)
  })

  it('keeps the first notice time when a tag is marked twice', () => {
    markUpdateNotified('v0.3.0', 1000)
    markUpdateNotified('v0.3.0', 2000)

    expect(getDb().prepare('SELECT notified_at FROM update_notices WHERE tag = ?').get('v0.3.0')).toEqual({
      notified_at: 1000
    })
  })
})
