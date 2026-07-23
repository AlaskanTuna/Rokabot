// Mock jikanThrottle to be a no-op so tests don't hang on fake timers
vi.mock('../tools/jikanThrottle.js', () => ({
  jikanThrottle: vi.fn().mockResolvedValue(undefined)
}))

import { flipCoin } from '../tools/flipCoin.js'
import { getAnimeSchedule } from '../tools/getAnimeSchedule.js'
import { getCurrentTime } from '../tools/getCurrentTime.js'
import { getWeather } from '../tools/getWeather.js'
import { flipCoinTool, getCurrentTimeTool, getWeatherTool, rokaTools, rollDiceTool } from '../tools/index.js'
import { rollDice } from '../tools/rollDice.js'
import { searchAnime } from '../tools/searchAnime.js'

// ── fetch mock setup ──────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch
let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch = vi.fn()
  globalThis.fetch = mockFetch
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-20T12:00:00Z'))
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── utility FunctionTools ────────────────────────────────────────────────────

describe('utility FunctionTools', () => {
  it('registers the four implicit utilities with their input schemas', () => {
    const declarations = new Map(rokaTools.map((tool) => [tool.name, tool._getDeclaration()]))

    expect(rokaTools).toHaveLength(12)
    expect(declarations.get('roll_dice')?.parameters).toMatchObject({
      properties: { count: { type: 'INTEGER' }, sides: { type: 'INTEGER' } }
    })
    expect(declarations.get('flip_coin')?.parameters).toMatchObject({ properties: {} })
    expect(declarations.get('get_current_time')?.parameters).toMatchObject({
      properties: { location: { type: 'STRING' }, format: { type: 'STRING' } }
    })
    expect(declarations.get('get_weather')?.parameters).toMatchObject({ properties: { city: { type: 'STRING' } } })
  })

  it('delegates roll_dice to rollDice', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    await expect(rollDiceTool.runAsync({ args: { count: 2, sides: 8 } })).resolves.toEqual({
      rolls: [1, 1],
      total: 2,
      description: '2d8: [1, 1] = 2'
    })
  })

  it('delegates flip_coin to flipCoin', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    await expect(flipCoinTool.runAsync({ args: {} })).resolves.toEqual({ result: 'heads' })
  })

  it('delegates get_current_time to getCurrentTime', async () => {
    const params = { location: 'Asia/Tokyo', format: '24h' as const }

    await expect(getCurrentTimeTool.runAsync({ args: params })).resolves.toEqual(getCurrentTime(params))
  })

  it('delegates get_weather to getWeather', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ name: 'Tokyo', latitude: 35.68, longitude: 139.69, country: 'Japan' }] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 22.5,
            apparent_temperature: 20.1,
            relative_humidity_2m: 65,
            weather_code: 2,
            wind_speed_10m: 12.3,
            is_day: 1
          }
        })
      })

    await expect(getWeatherTool.runAsync({ args: { city: 'Tokyo' } })).resolves.toEqual({
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
})

// ── rollDice ──────────────────────────────────────────────────────────────────

describe('rollDice', () => {
  it('defaults to 1d6 and returns valid result', () => {
    const result = rollDice({})
    expect(result.rolls).toHaveLength(1)
    expect(result.total).toBe(result.rolls[0])
    expect(result.rolls[0]).toBeGreaterThanOrEqual(1)
    expect(result.rolls[0]).toBeLessThanOrEqual(6)
  })

  it('handles custom params (3d20)', () => {
    const result = rollDice({ count: 3, sides: 20 })
    expect(result.rolls).toHaveLength(3)
    const sum = result.rolls.reduce((a, b) => a + b, 0)
    expect(result.total).toBe(sum)
    for (const roll of result.rolls) {
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(20)
    }
  })

  it('clamps count to 1-10 and sides to 2-100', () => {
    const low = rollDice({ count: -5, sides: 0 })
    expect(low.rolls).toHaveLength(1)
    expect(low.rolls[0]).toBeGreaterThanOrEqual(1)
    expect(low.rolls[0]).toBeLessThanOrEqual(2)

    const high = rollDice({ count: 99, sides: 999 })
    expect(high.rolls).toHaveLength(10)
    for (const roll of high.rolls) {
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(100)
    }
  })

  it('description format matches "NdM: [rolls] = total"', () => {
    const result = rollDice({ count: 2, sides: 8 })
    const pattern = /^2d8: \[\d+, \d+\] = \d+$/
    expect(result.description).toMatch(pattern)
  })
})

// ── flipCoin ──────────────────────────────────────────────────────────────────

describe('flipCoin', () => {
  it('returns either heads or tails', () => {
    const result = flipCoin()
    expect(['heads', 'tails']).toContain(result.result)
  })

  it('produces both heads and tails over multiple calls', () => {
    const results = new Set<string>()
    for (let i = 0; i < 20; i++) {
      results.add(flipCoin().result)
    }
    expect(results.has('heads')).toBe(true)
    expect(results.has('tails')).toBe(true)
  })
})

// ── getCurrentTime ────────────────────────────────────────────────────────────

describe('getCurrentTime', () => {
  it('returns correct timezone name for explicit IANA timezone', () => {
    const result = getCurrentTime({ location: 'Asia/Tokyo' })
    expect(result.timezone).toBe('Asia/Tokyo')
    expect(result.time).toBeDefined()
    expect(result.date).toBeDefined()
    expect(result.day).toBeDefined()
  })

  it('returns a result with time/date/day fields when no params given', () => {
    const result = getCurrentTime({})
    expect(result.time).toBeTruthy()
    expect(result.date).toBeTruthy()
    expect(result.day).toBeTruthy()
    expect(result.timezone).toBeTruthy()
  })

  it('includes AM or PM when using 12h format', () => {
    const result = getCurrentTime({ format: '12h', location: 'America/New_York' })
    expect(result.time).toMatch(/AM|PM/)
  })

  it('does not include AM/PM when using 24h format', () => {
    const result = getCurrentTime({ format: '24h', location: 'America/New_York' })
    expect(result.time).not.toMatch(/AM|PM/)
  })
})

// ── searchAnime ───────────────────────────────────────────────────────────────

describe('searchAnime', () => {
  it('parses a successful Jikan response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pagination: { items: { total: 1 } },
        data: [
          {
            title: 'Naruto',
            title_japanese: 'ナルト',
            type: 'TV',
            episodes: 220,
            status: 'Finished Airing',
            score: 8.0,
            members: 500000,
            synopsis: 'A ninja story...',
            url: 'https://myanimelist.net/anime/20'
          }
        ]
      })
    })

    const result = await searchAnime({ query: 'Naruto' })
    expect(result.query).toBe('Naruto')
    expect(result.total).toBe(1)
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toEqual({
      title: 'Naruto',
      titleJapanese: 'ナルト',
      type: 'TV',
      episodes: 220,
      status: 'Finished Airing',
      score: 8.0,
      members: 500000,
      synopsis: 'A ninja story...',
      url: 'https://myanimelist.net/anime/20'
    })
  })

  it('returns empty results for empty data array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pagination: { items: { total: 0 } }, data: [] })
    })

    const result = await searchAnime({ query: 'xyznonexistent' })
    expect(result.results).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('handles API errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await searchAnime({ query: 'Naruto' })
    expect(result.results).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('passes sort_by and type params to Jikan', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pagination: { items: { total: 0 } }, data: [] })
    })

    await searchAnime({ query: 'test', sort_by: 'score', type: 'tv', status: 'airing' })
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('order_by=score')
    expect(calledUrl).toContain('sort=desc')
    expect(calledUrl).toContain('type=tv')
    expect(calledUrl).toContain('status=airing')
  })
})

// ── getAnimeSchedule ──────────────────────────────────────────────────────────

describe('getAnimeSchedule', () => {
  it('returns schedule entries for a given day', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pagination: { items: { total: 1 } },
        data: [
          {
            title: 'One Piece',
            title_japanese: 'ONE PIECE',
            type: 'TV',
            episodes: null,
            status: 'Currently Airing',
            score: 8.7,
            members: 2600000,
            popularity: 5,
            broadcast: { day: 'Sundays', time: '09:30', timezone: 'Asia/Tokyo', string: 'Sundays at 09:30 (JST)' },
            season: 'fall',
            year: 1999,
            url: 'https://myanimelist.net/anime/21'
          }
        ]
      })
    })

    const result = await getAnimeSchedule({ scope: 'day', day: 'sunday' })
    expect(result.scope).toBe('day')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].title).toBe('One Piece')
    expect(result.entries[0].broadcastDay).toBe('Sundays')
    expect(result.entries[0].broadcastTimezones).toBeTruthy()
  })

  it('defaults to today when no day param is provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pagination: { items: { total: 0 } }, data: [] })
    })

    const result = await getAnimeSchedule({ scope: 'day' })

    // 2026-03-20T12:00:00Z is a Friday
    expect(result.label.toLowerCase()).toContain('friday')
  })

  it('looks up a specific anime when anime param is provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            title: 'Frieren',
            title_japanese: '葬送のフリーレン',
            type: 'TV',
            episodes: 28,
            status: 'Currently Airing',
            score: 9.33,
            members: 430000,
            popularity: 50,
            broadcast: { day: 'Fridays', time: '23:30', timezone: 'Asia/Tokyo', string: 'Fridays at 23:30 (JST)' },
            season: 'fall',
            year: 2023,
            url: 'https://myanimelist.net/anime/52991'
          }
        ]
      })
    })

    const result = await getAnimeSchedule({ scope: 'day', anime: 'Frieren' })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].title).toBe('Frieren')
    expect(result.entries[0].broadcastTime).toBe('23:30')
  })

  it('sorts entries by score descending by default', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pagination: { items: { total: 3 } },
        data: [
          { title: 'Low', score: 5.0, members: 100, popularity: 300 },
          { title: 'High', score: 9.0, members: 500, popularity: 10 },
          { title: 'Mid', score: 7.5, members: 300, popularity: 100 }
        ]
      })
    })

    const result = await getAnimeSchedule({ scope: 'day', day: 'monday' })
    expect(result.entries[0].title).toBe('High')
    expect(result.entries[1].title).toBe('Mid')
    expect(result.entries[2].title).toBe('Low')
  })
})

// ── getWeather ────────────────────────────────────────────────────────────────

describe('getWeather', () => {
  it('returns weather data for a successful lookup', async () => {
    // geocoding call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ name: 'Tokyo', latitude: 35.68, longitude: 139.69, country: 'Japan', country_code: 'JP' }]
      })
    })
    // forecast call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 22.5,
          apparent_temperature: 20.1,
          relative_humidity_2m: 65,
          weather_code: 2,
          wind_speed_10m: 12.3,
          is_day: 1
        }
      })
    })

    const result = await getWeather({ city: 'Tokyo' })
    expect(result.city).toBe('Tokyo')
    expect(result.country).toBe('Japan')
    expect(result.temperature).toBe(22.5)
    expect(result.feelsLike).toBe(20.1)
    expect(result.humidity).toBe(65)
    expect(result.condition).toBe('Partly cloudy')
    expect(result.windSpeed).toBe(12.3)
    expect(result.isDay).toBe(true)
  })

  it('handles city not found from geocoding', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] })
    })

    const result = await getWeather({ city: 'Nonexistentville' })
    expect(result.city).toBe('Nonexistentville')
    expect(result.condition).toBe('City not found')
    expect(result.temperature).toBe(0)
  })

  it('handles weather API fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'))

    const result = await getWeather({ city: 'Tokyo' })
    expect(result.city).toBe('Tokyo')
    expect(result.condition).toBe('Request failed')
    expect(result.temperature).toBe(0)
  })
})
