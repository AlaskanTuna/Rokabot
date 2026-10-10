import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config.js', () => ({
  config: { timezone: 'Asia/Singapore' }
}))

import { getCurrentTime } from '../getCurrentTime.js'

// 04:00 UTC is 12:00 in Singapore (the configured zone) and 13:00 in Tokyo.
const NOW = new Date('2026-10-10T04:00:00Z')

describe('getCurrentTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports an unmapped city as unknown instead of giving the configured zone time', () => {
    const result = getCurrentTime({ location: 'Atlantis' })

    expect(result).toEqual({ ok: false, reason: 'unknown location', location: 'Atlantis' })
    expect(JSON.stringify(result)).not.toContain('12:00')
  })

  it('reports an invalid IANA-looking zone as unknown', () => {
    expect(getCurrentTime({ location: 'Mars/Olympus' })).toEqual({
      ok: false,
      reason: 'unknown location',
      location: 'Mars/Olympus'
    })
  })

  it('resolves a mapped city', () => {
    expect(getCurrentTime({ location: 'Tokyo' })).toMatchObject({
      ok: true,
      location: 'Tokyo',
      timezone: 'Asia/Tokyo',
      time: '13:00:00'
    })
  })

  it('resolves a mapped city written with its country', () => {
    expect(getCurrentTime({ location: 'Tokyo, Japan' })).toMatchObject({
      ok: true,
      location: 'Tokyo, Japan',
      timezone: 'Asia/Tokyo',
      time: '13:00:00'
    })
  })

  it('keeps an unmapped city with a country as unknown', () => {
    expect(getCurrentTime({ location: 'Atlantis, Nowhere' })).toEqual({
      ok: false,
      reason: 'unknown location',
      location: 'Atlantis, Nowhere'
    })
  })

  it('resolves an IANA timezone name', () => {
    expect(getCurrentTime({ location: 'Asia/Tokyo' })).toMatchObject({
      ok: true,
      timezone: 'Asia/Tokyo',
      time: '13:00:00'
    })
  })

  it('falls back to the configured zone when no location is given', () => {
    expect(getCurrentTime({})).toMatchObject({
      ok: true,
      location: 'local',
      timezone: 'Asia/Singapore',
      time: '12:00:00'
    })
  })
})
