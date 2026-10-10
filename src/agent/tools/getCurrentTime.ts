import { config } from '../../config.js'

export interface GetCurrentTimeParams {
  location?: string
  format?: '12h' | '24h'
}

export interface GetCurrentTimeFound {
  ok: true
  location: string
  time: string
  date: string
  day: string
  timezone: string
}

export interface GetCurrentTimeUnknown {
  ok: false
  reason: 'unknown location'
  location: string
}

export type GetCurrentTimeResult = GetCurrentTimeFound | GetCurrentTimeUnknown

const cityToTimezone: Record<string, string> = {
  // UTC / GMT
  utc: 'UTC',
  gmt: 'GMT',

  // Southeast Asia
  singapore: 'Asia/Singapore',
  'kuala lumpur': 'Asia/Kuala_Lumpur',
  kualalumpur: 'Asia/Kuala_Lumpur',
  malaysia: 'Asia/Kuala_Lumpur',
  penang: 'Asia/Kuala_Lumpur',
  'johor bahru': 'Asia/Kuala_Lumpur',
  johorbahru: 'Asia/Kuala_Lumpur',
  ipoh: 'Asia/Kuala_Lumpur',
  bangkok: 'Asia/Bangkok',
  'chiang mai': 'Asia/Bangkok',
  chiangmai: 'Asia/Bangkok',
  phuket: 'Asia/Bangkok',
  jakarta: 'Asia/Jakarta',
  bali: 'Asia/Makassar',
  manila: 'Asia/Manila',
  cebu: 'Asia/Manila',
  davao: 'Asia/Manila',
  'ho chi minh city': 'Asia/Ho_Chi_Minh',
  'ho chi minh': 'Asia/Ho_Chi_Minh',
  hochiminh: 'Asia/Ho_Chi_Minh',
  hanoi: 'Asia/Ho_Chi_Minh',
  'phnom penh': 'Asia/Phnom_Penh',
  phnompenh: 'Asia/Phnom_Penh',
  yangon: 'Asia/Yangon',
  vientiane: 'Asia/Vientiane',
  brunei: 'Asia/Brunei',

  // Japan
  tokyo: 'Asia/Tokyo',
  osaka: 'Asia/Tokyo',
  kyoto: 'Asia/Tokyo',
  yokohama: 'Asia/Tokyo',
  sapporo: 'Asia/Tokyo',
  nagoya: 'Asia/Tokyo',
  kobe: 'Asia/Tokyo',
  fukuoka: 'Asia/Tokyo',
  sendai: 'Asia/Tokyo',
  hiroshima: 'Asia/Tokyo',
  nara: 'Asia/Tokyo',
  okinawa: 'Asia/Tokyo',
  akihabara: 'Asia/Tokyo',
  shibuya: 'Asia/Tokyo',
  shinjuku: 'Asia/Tokyo',

  // East Asia
  seoul: 'Asia/Seoul',
  busan: 'Asia/Seoul',
  beijing: 'Asia/Shanghai',
  shanghai: 'Asia/Shanghai',
  shenzhen: 'Asia/Shanghai',
  guangzhou: 'Asia/Shanghai',
  'hong kong': 'Asia/Hong_Kong',
  hongkong: 'Asia/Hong_Kong',
  taipei: 'Asia/Taipei',
  kaohsiung: 'Asia/Taipei',

  // South Asia & Middle East
  mumbai: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  dubai: 'Asia/Dubai',

  // Europe
  london: 'Europe/London',
  paris: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  madrid: 'Europe/Madrid',
  rome: 'Europe/Rome',
  amsterdam: 'Europe/Amsterdam',
  brussels: 'Europe/Brussels',
  vienna: 'Europe/Vienna',
  zurich: 'Europe/Zurich',
  stockholm: 'Europe/Stockholm',
  oslo: 'Europe/Oslo',
  copenhagen: 'Europe/Copenhagen',
  helsinki: 'Europe/Helsinki',
  warsaw: 'Europe/Warsaw',
  prague: 'Europe/Prague',
  budapest: 'Europe/Budapest',
  bucharest: 'Europe/Bucharest',
  athens: 'Europe/Athens',
  istanbul: 'Europe/Istanbul',
  lisbon: 'Europe/Lisbon',
  dublin: 'Europe/Dublin',
  moscow: 'Europe/Moscow',

  // Americas
  'new york': 'America/New_York',
  newyork: 'America/New_York',
  'los angeles': 'America/Los_Angeles',
  losangeles: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
  sanfrancisco: 'America/Los_Angeles',
  chicago: 'America/Chicago',
  denver: 'America/Denver',
  toronto: 'America/Toronto',
  vancouver: 'America/Vancouver',
  'mexico city': 'America/Mexico_City',
  mexicocity: 'America/Mexico_City',
  'sao paulo': 'America/Sao_Paulo',
  saopaulo: 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires',
  buenosaires: 'America/Argentina/Buenos_Aires',

  // Oceania & Africa
  sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne',
  auckland: 'Pacific/Auckland',
  cairo: 'Africa/Cairo',
  johannesburg: 'Africa/Johannesburg',
  nairobi: 'Africa/Nairobi'
}

/** Resolve a location string to an IANA timezone */
function resolveTimezone(location?: string): string {
  if (!location) {
    return config.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  }

  if (location.includes('/')) {
    return location
  }

  return cityToTimezone[location.toLowerCase().trim()] ?? location
}

/** Get the current time, date, and weekday for a location */
export function getCurrentTime(params: GetCurrentTimeParams): GetCurrentTimeResult {
  const timezone = resolveTimezone(params.location)
  const use12h = params.format === '12h'
  const now = new Date()

  try {
    const time = now.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour12: use12h,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })

    const date = now.toLocaleDateString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    const day = now.toLocaleDateString('en-US', {
      timeZone: timezone,
      weekday: 'long'
    })

    const location = params.location ?? 'local'

    return { ok: true, location, time, date, day, timezone }
  } catch {
    if (params.location) {
      return { ok: false, reason: 'unknown location', location: params.location }
    }
    throw new Error(`Invalid timezone: ${timezone}`)
  }
}
