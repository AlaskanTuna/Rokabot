/** Anime schedule lookups via the Jikan (MyAnimeList) API */

import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { jikanThrottle } from './jikanThrottle.js'

export interface GetAnimeScheduleParams {
  scope: 'day' | 'week' | 'season'
  day?: string
  sort_by?: 'score' | 'popularity' | 'members' | 'title'
  limit?: number
  anime?: string
}

export interface ScheduleEntry {
  title: string
  titleJapanese: string | null
  type: string
  episodes: number | null
  status: string
  score: number | null
  members: number | null
  popularityRank: number | null
  broadcastDay: string | null
  broadcastTime: string | null
  broadcastTimezones: Record<string, string> | null
  season: string | null
  year: number | null
  url: string
}

export interface GetAnimeScheduleResult {
  scope: string
  label: string
  entries: ScheduleEntry[]
  total: number
}

interface JikanAnimeEntry {
  title?: string
  title_japanese?: string | null
  type?: string
  episodes?: number | null
  status?: string
  score?: number | null
  members?: number
  popularity?: number
  broadcast?: {
    day?: string | null
    time?: string | null
    timezone?: string | null
    string?: string | null
  }
  season?: string | null
  year?: number | null
  url?: string
}

interface JikanResponse {
  data?: JikanAnimeEntry[]
  pagination?: {
    last_visible_page?: number
    has_next_page?: boolean
    items?: { count?: number; total?: number; per_page?: number }
  }
}

/** Jikan's largest page, so the score sort sees the most entries in the one request each handler makes */
const JIKAN_PAGE_SIZE = 25

const VALID_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

const BROADCAST_TIMEZONES: Record<string, string> = {
  JST: 'Asia/Tokyo',
  EST: 'America/New_York',
  GMT: 'Europe/London',
  CET: 'Europe/Berlin',
  SGT: 'Asia/Singapore'
}

function getTodayName(): string {
  const tz = config.timezone ?? 'UTC'
  const dayName = new Date().toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' })
  return dayName.toLowerCase()
}

function getCurrentSeason(): { season: string; year: number } {
  const tz = config.timezone ?? 'UTC'
  const now = new Date()
  const month = parseInt(now.toLocaleDateString('en-US', { timeZone: tz, month: 'numeric' }), 10)
  const year = parseInt(now.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric' }), 10)
  if (month >= 1 && month <= 3) return { season: 'winter', year }
  if (month >= 4 && month <= 6) return { season: 'spring', year }
  if (month >= 7 && month <= 9) return { season: 'summer', year }
  return { season: 'fall', year }
}

/** Convert a JST broadcast time (HH:MM) to multiple timezone equivalents */
function convertBroadcastTime(time: string | null): Record<string, string> | null {
  if (!time) return null

  const match = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null

  const hour = parseInt(match[1], 10)
  const minute = parseInt(match[2], 10)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null

  const base = new Date()
  const jstDateStr = base.toLocaleDateString('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const [m, d, y] = jstDateStr.split('/')
  const isoBase = `${y}-${m}-${d}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`

  const jstOffset = 9 * 60
  const parsed = new Date(isoBase)
  const utcMs = parsed.getTime() + parsed.getTimezoneOffset() * 60_000 - jstOffset * 60_000

  const utcDate = new Date(utcMs)

  const result: Record<string, string> = {}
  for (const [label, tz] of Object.entries(BROADCAST_TIMEZONES)) {
    const formatted = utcDate.toLocaleTimeString('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
    result[label] = formatted
  }

  return result
}

function mapEntry(entry: JikanAnimeEntry): ScheduleEntry {
  return {
    title: entry.title ?? 'Unknown',
    titleJapanese: entry.title_japanese ?? null,
    type: entry.type ?? 'Unknown',
    episodes: entry.episodes ?? null,
    status: entry.status ?? 'Unknown',
    score: entry.score ?? null,
    members: entry.members ?? null,
    popularityRank: entry.popularity ?? null,
    broadcastDay: entry.broadcast?.day ?? null,
    broadcastTime: entry.broadcast?.time ?? null,
    broadcastTimezones: convertBroadcastTime(entry.broadcast?.time ?? null),
    season: entry.season ?? null,
    year: entry.year ?? null,
    url: entry.url ?? ''
  }
}

function sortEntries(entries: ScheduleEntry[], sortBy: string): ScheduleEntry[] {
  return [...entries].sort((a, b) => {
    switch (sortBy) {
      case 'score':
        return (b.score ?? 0) - (a.score ?? 0)
      case 'popularity':
        return (a.popularityRank ?? 99999) - (b.popularityRank ?? 99999)
      case 'members':
        return (b.members ?? 0) - (a.members ?? 0)
      case 'title':
        return a.title.localeCompare(b.title)
      default:
        return (b.score ?? 0) - (a.score ?? 0)
    }
  })
}

function clampLimit(limit: number | undefined): number {
  if (limit == null) return 5
  return Math.max(1, Math.min(25, limit))
}

/** Fetch from Jikan API with rate-limit throttling */
async function fetchJikan(url: string): Promise<JikanResponse | null> {
  try {
    await jikanThrottle()

    const response = await fetch(url)
    if (!response.ok) {
      logger.warn({ status: response.status, url }, 'Jikan API error')
      return null
    }

    return (await response.json()) as JikanResponse
  } catch (error) {
    logger.error({ error, url }, 'Failed to fetch from Jikan API')
    return null
  }
}

async function handleAnimeLookup(anime: string): Promise<GetAnimeScheduleResult> {
  const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(anime)}&limit=1&sfw=true`
  const body = await fetchJikan(url)

  if (!body?.data?.length) {
    return { scope: 'anime', label: anime, entries: [], total: 0 }
  }

  const entries = body.data.map(mapEntry)
  return { scope: 'anime', label: entries[0].title, entries, total: 1 }
}

async function handleDay(day: string | undefined, sortBy: string, limit: number): Promise<GetAnimeScheduleResult> {
  const resolved = day?.toLowerCase().trim() || getTodayName()
  const label = resolved.charAt(0).toUpperCase() + resolved.slice(1)

  if (!VALID_DAYS.includes(resolved as (typeof VALID_DAYS)[number])) {
    logger.warn({ day: resolved }, 'Invalid day name for anime schedule')
    return { scope: 'day', label, entries: [], total: 0 }
  }

  const url = `https://api.jikan.moe/v4/schedules?filter=${encodeURIComponent(resolved)}&sfw=true&limit=${JIKAN_PAGE_SIZE}`
  const body = await fetchJikan(url)

  if (!body?.data) {
    return { scope: 'day', label, entries: [], total: 0 }
  }

  const total = body.pagination?.items?.total ?? body.data.length
  const entries = sortEntries(body.data.map(mapEntry), sortBy).slice(0, limit)
  return { scope: 'day', label, entries, total }
}

async function handleWeek(sortBy: string, limit: number): Promise<GetAnimeScheduleResult> {
  const url = `https://api.jikan.moe/v4/schedules?sfw=true&limit=${JIKAN_PAGE_SIZE}`
  const body = await fetchJikan(url)

  if (!body?.data) {
    return { scope: 'week', label: 'This Week', entries: [], total: 0 }
  }

  const total = body.pagination?.items?.total ?? body.data.length
  const entries = sortEntries(body.data.map(mapEntry), sortBy).slice(0, limit)
  return { scope: 'week', label: 'This Week', entries, total }
}

async function handleSeason(sortBy: string, limit: number): Promise<GetAnimeScheduleResult> {
  const { season, year } = getCurrentSeason()
  const label = `${season.charAt(0).toUpperCase() + season.slice(1)} ${year}`

  const url = `https://api.jikan.moe/v4/seasons/now?sfw=true&limit=${JIKAN_PAGE_SIZE}`
  const body = await fetchJikan(url)

  if (!body?.data) {
    return { scope: 'season', label, entries: [], total: 0 }
  }

  const total = body.pagination?.items?.total ?? body.data.length
  const entries = sortEntries(body.data.map(mapEntry), sortBy).slice(0, limit)
  return { scope: 'season', label, entries, total }
}

/** Fetch anime airing schedule by scope or specific anime name */
export async function getAnimeSchedule(params: GetAnimeScheduleParams): Promise<GetAnimeScheduleResult> {
  const { scope, day, sort_by = 'score', anime } = params
  const limit = clampLimit(params.limit)

  try {
    if (anime) {
      return await handleAnimeLookup(anime)
    }

    switch (scope) {
      case 'day':
        return await handleDay(day, sort_by, limit)
      case 'week':
        return await handleWeek(sort_by, limit)
      case 'season':
        return await handleSeason(sort_by, limit)
      default:
        logger.warn({ scope }, 'Unknown anime schedule scope, falling back to day')
        return await handleDay(day, sort_by, limit)
    }
  } catch (error) {
    logger.error({ error, scope, anime }, 'Unexpected error in getAnimeSchedule')
    return { scope: anime ? 'anime' : scope, label: anime ?? scope, entries: [], total: 0 }
  }
}
