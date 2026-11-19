/** Anime search via the Jikan (MyAnimeList) API */

import { logger } from '../../utils/logger.js'
import { jikanThrottle } from './jikanThrottle.js'

/** MyAnimeList genre ids sent as `genres=<id>` on /v4/anime */
export const GENRE_IDS = {
  action: 1,
  adventure: 2,
  comedy: 4,
  drama: 8,
  fantasy: 10,
  horror: 14,
  mecha: 18,
  music: 19,
  mystery: 7,
  psychological: 40,
  romance: 22,
  'sci-fi': 24,
  'slice of life': 36,
  sports: 30,
  supernatural: 37,
  suspense: 41
} as const

export type AnimeGenre = keyof typeof GENRE_IDS

export interface SearchAnimeParams {
  query?: string
  limit?: number // 1-25, default 5
  sort_by?: 'score' | 'popularity' | 'members' | 'title' | 'start_date'
  type?: 'tv' | 'movie' | 'ova' | 'special' | 'ona' | 'music'
  status?: 'airing' | 'complete' | 'upcoming'
  genre?: AnimeGenre
}

export interface AnimeResult {
  title: string
  titleJapanese: string | null
  type: string
  episodes: number | null
  status: string
  score: number | null
  members: number | null
  synopsis: string | null
  url: string
}

export interface SearchAnimeResult {
  results: AnimeResult[]
  query: string
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
  synopsis?: string | null
  url?: string
}

interface JikanResponse {
  pagination?: { items?: { total?: number } }
  data?: JikanAnimeEntry[]
}

/** Search for anime by title or keyword with optional filters and sorting */
export async function searchAnime(params: SearchAnimeParams): Promise<SearchAnimeResult> {
  const query = (params.query ?? '').trim()
  const hasFilters = params.sort_by || params.type || params.status || params.genre

  if (!query && !hasFilters) {
    return { results: [], query, total: 0 }
  }

  const limit = Math.min(Math.max(params.limit ?? 5, 1), 25)

  try {
    await jikanThrottle()

    const urlParams = [`limit=${limit}`, 'sfw=true']

    if (query) urlParams.push(`q=${encodeURIComponent(query)}`)

    if (params.sort_by) {
      const orderBy = params.sort_by === 'start_date' ? 'start_date' : params.sort_by
      urlParams.push(`order_by=${orderBy}`)
      urlParams.push(`sort=${params.sort_by === 'title' || params.sort_by === 'start_date' ? 'asc' : 'desc'}`)
    }
    if (params.type) urlParams.push(`type=${params.type}`)
    if (params.status) urlParams.push(`status=${params.status}`)
    if (params.genre) urlParams.push(`genres=${GENRE_IDS[params.genre]}`)

    const url = `https://api.jikan.moe/v4/anime?${urlParams.join('&')}`
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })

    if (!response.ok) {
      logger.warn({ status: response.status, url }, 'Jikan API error')
      return { results: [], query, total: 0 }
    }

    const body = (await response.json()) as JikanResponse
    const data = body.data ?? []
    const total = body.pagination?.items?.total ?? data.length

    const results: AnimeResult[] = data.map((entry) => ({
      title: entry.title ?? 'Unknown',
      titleJapanese: entry.title_japanese ?? null,
      type: entry.type ?? 'Unknown',
      episodes: entry.episodes ?? null,
      status: entry.status ?? 'Unknown',
      score: entry.score ?? null,
      members: entry.members ?? null,
      synopsis: entry.synopsis ?? null,
      url: entry.url ?? ''
    }))

    return { results, query, total }
  } catch (error) {
    logger.error(
      {
        errorName: error instanceof Error ? error.name : 'Error',
        errorMessage: error instanceof Error ? error.message : String(error),
        query
      },
      'Failed to search anime'
    )
    return { results: [], query, total: 0 }
  }
}
