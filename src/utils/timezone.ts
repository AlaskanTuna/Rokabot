/** Shared timezone utilities — single source of truth for all date/time helpers */

import { config } from '../config.js'
import { logger } from './logger.js'

/** Get the current hour (0-23) in the configured timezone */
export function getLocalHour(): number {
  // Harness-only, and the live gate is the whole reason it exists. `hour` reaches the prompt twice — the
  // context layer's time-of-day sentence and detectTone's isLateNight, which step at 05:00 and 05:00 — so a
  // 15-minute case set that straddles a boundary scores two different prompts and calls the result one
  // number. Measured: one gate run crossed 04:59 -> 05:00 partway through, and its own log carries both
  // sentences. Production keeps reading the clock, which is the point of the layer; only a run that has to
  // hold the prompt still for its whole length pins it.
  const raw = process.env.ROKABOT_HARNESS_LIVE === '1' ? process.env.ROKABOT_FIXED_HOUR?.trim() : undefined
  // `raw` is checked for emptiness before Number(), because Number('') is 0 — a legal hour. An unset-but-
  // present variable would otherwise pin every run to midnight, which is inside isLateNight and would have
  // been the quietest possible way to get this wrong.
  const pinned = raw ? Number(raw) : Number.NaN
  if (Number.isInteger(pinned) && pinned >= 0 && pinned <= 23) return pinned

  const tz = config.timezone
  if (!tz) return new Date().getHours()
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz })
    return parseInt(formatter.format(new Date()), 10)
  } catch {
    logger.warn({ timezone: tz }, 'Invalid timezone in config, falling back to system time')
    return new Date().getHours()
  }
}

/** Get today's date string (YYYY-MM-DD) in the configured timezone */
export function getTodayDate(): string {
  const tz = config.timezone ?? undefined
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: tz })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/** Get yesterday's date string (YYYY-MM-DD) in the configured timezone */
export function getYesterdayDate(): string {
  const tz = config.timezone ?? undefined
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  try {
    return yesterday.toLocaleDateString('en-CA', { timeZone: tz })
  } catch {
    return yesterday.toISOString().slice(0, 10)
  }
}

/** Get the UTC offset label (e.g., "GMT+8") for the configured timezone */
export function getTimezoneLabel(): string {
  const tz = config.timezone
  if (!tz) return 'UTC'
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    const parts = formatter.formatToParts(new Date())
    const tzPart = parts.find((p) => p.type === 'timeZoneName')
    return tzPart?.value ?? tz
  } catch {
    return tz
  }
}

/** Format a timestamp as a readable time string in the configured timezone */
export function formatTime(timestamp: number): string {
  const tz = config.timezone ?? undefined
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz
    })
    return formatter.format(new Date(timestamp))
  } catch {
    return new Date(timestamp).toLocaleTimeString()
  }
}
