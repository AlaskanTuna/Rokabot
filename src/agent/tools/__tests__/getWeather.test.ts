import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), fatal: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

vi.mock('../../../config.js', () => ({ config: { timezone: undefined } }))

import { getWeather } from '../getWeather.js'

const originalFetch = globalThis.fetch

let fetchMock: ReturnType<typeof vi.fn>

const TOKYO_GEOCODE = {
  results: [{ name: 'Tokyo', latitude: 35.68, longitude: 139.69, country: 'Japan' }]
}

const TOKYO_FORECAST = {
  current: {
    temperature_2m: 22.5,
    apparent_temperature: 20.1,
    relative_humidity_2m: 65,
    weather_code: 2,
    wind_speed_10m: 12.3,
    is_day: 1
  }
}

function respond(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body }
}

describe('getWeather', () => {
  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as never
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('returns ok with the numbers for a successful lookup', async () => {
    fetchMock.mockResolvedValueOnce(respond(TOKYO_GEOCODE)).mockResolvedValueOnce(respond(TOKYO_FORECAST))

    await expect(getWeather({ city: 'Tokyo' })).resolves.toEqual({
      ok: true,
      city: 'Tokyo',
      country: 'Japan',
      temperature: 22.5,
      feelsLike: 20.1,
      humidity: 65,
      condition: 'Partly cloudy',
      windSpeed: 12.3,
      isDay: true
    })
  })

  it('returns no temperature when the forecast omits temperature_2m', async () => {
    const { temperature_2m: _omitted, ...current } = TOKYO_FORECAST.current
    fetchMock.mockResolvedValueOnce(respond(TOKYO_GEOCODE)).mockResolvedValueOnce(respond({ current }))

    const result = await getWeather({ city: 'Tokyo' })

    expect(result.ok).toBe(true)
    expect(result).toHaveProperty('temperature', null)
    expect(result).toMatchObject({ feelsLike: 20.1, humidity: 65 })
  })

  it('returns a failure with no temperature when no city is given and none is configured', async () => {
    const result = await getWeather({ city: '   ' })

    if (result.ok) throw new Error('expected a failure')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('No city provided')
    expect(result).not.toHaveProperty('temperature')
  })

  it('returns a failure when geocoding responds with an error status', async () => {
    fetchMock.mockResolvedValueOnce(respond({}, { ok: false, status: 500 }))

    const result = await getWeather({ city: 'Tokyo' })

    if (result.ok) throw new Error('expected a failure')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('Geocoding failed')
    expect(result).not.toHaveProperty('temperature')
  })

  it('returns a failure when the city is not found', async () => {
    fetchMock.mockResolvedValueOnce(respond({ results: [] }))

    const result = await getWeather({ city: 'Nonexistentville' })

    if (result.ok) throw new Error('expected a failure')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('City not found')
    expect(result).not.toHaveProperty('temperature')
  })

  it('returns a failure when the weather request throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network failure'))

    const result = await getWeather({ city: 'Tokyo' })

    if (result.ok) throw new Error('expected a failure')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('Request failed')
    expect(result).not.toHaveProperty('temperature')
  })
})
