import { config } from '../../config.js'
import { getLocalDate, localDateStartEpoch } from '../../utils/timezone.js'
import type { GuildFactDate } from './extractionSchema.js'

type CalendarDate = { year: number; month: number; day: number }
type CalendarMonth = { year: number; month: number }

const WEEKDAY_INDEX = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6
} as const

function isoMonth(month: CalendarMonth): string {
  return `${String(month.year).padStart(4, '0')}-${String(month.month).padStart(2, '0')}`
}

function isoDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

function parseIsoDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText] = match
  const date = { year: Number(yearText), month: Number(monthText), day: Number(dayText) }
  const candidate = new Date(0)
  candidate.setUTCFullYear(date.year, date.month - 1, date.day)
  candidate.setUTCHours(0, 0, 0, 0)
  if (
    candidate.getUTCFullYear() !== date.year ||
    candidate.getUTCMonth() !== date.month - 1 ||
    candidate.getUTCDate() !== date.day
  ) {
    return null
  }
  return date
}

function addDays(date: CalendarDate, days: number): CalendarDate | null {
  const candidate = new Date(0)
  candidate.setUTCFullYear(date.year, date.month - 1, date.day + days)
  candidate.setUTCHours(0, 0, 0, 0)
  const result = { year: candidate.getUTCFullYear(), month: candidate.getUTCMonth() + 1, day: candidate.getUTCDate() }
  return result.year >= 1 && result.year <= 9999 ? result : null
}

function addMonths(month: CalendarMonth, months: number): CalendarMonth | null {
  const candidate = new Date(0)
  candidate.setUTCFullYear(month.year, month.month - 1 + months, 1)
  candidate.setUTCHours(0, 0, 0, 0)
  const result = { year: candidate.getUTCFullYear(), month: candidate.getUTCMonth() + 1 }
  return result.year >= 1 && result.year <= 9999 ? result : null
}

function weekdayOf(date: CalendarDate): number {
  const candidate = new Date(0)
  candidate.setUTCFullYear(date.year, date.month - 1, date.day)
  candidate.setUTCHours(0, 0, 0, 0)
  return (candidate.getUTCDay() + 6) % 7
}

function dateForMonthDay(month: number, day: number, today: CalendarDate): CalendarDate | null {
  const validInLeapYear = parseIsoDate(isoDate({ year: 2000, month, day }))
  if (!validInLeapYear) return null

  for (let year = today.year; year <= 9999; year++) {
    const candidate = parseIsoDate(isoDate({ year, month, day }))
    if (candidate && isoDate(candidate) >= isoDate(today)) return candidate
  }
  return null
}

/** A yearless month takes its next occurrence, so a month already past this year means the same month next year. */
function monthForMonth(month: number, today: CalendarDate): CalendarMonth | null {
  if (month < 1 || month > 12) return null
  const thisYear = { year: today.year, month }
  return isoMonth(thisYear) >= isoMonth(today) ? thisYear : addMonths(thisYear, 12)
}

type ResolvedFactDate =
  | Readonly<{ precision: 'day'; date: CalendarDate; eventDate: string }>
  | Readonly<{ precision: 'month'; date: CalendarMonth; eventDate: string }>

function resolveDayPrecision(date: GuildFactDate, today: CalendarDate): CalendarDate | null {
  const hasYear = date.year !== undefined
  const hasMonth = date.month !== undefined
  const hasDay = date.day !== undefined
  const hasCalendarComponent = hasYear || hasMonth || hasDay
  const hasRelative = date.relative !== undefined
  if (!hasCalendarComponent && !hasRelative && !date.weekday) return null

  let resolved: CalendarDate | null = null
  if (date.relative === 'today' || date.relative === 'tomorrow') {
    if (hasCalendarComponent) return null
    resolved = date.relative === 'today' ? today : addDays(today, 1)
  } else if (date.relative === 'this_week' || date.relative === 'next_week') {
    if (hasCalendarComponent || !date.weekday) return null
    const weekday = WEEKDAY_INDEX[date.weekday]
    const monday = addDays(today, -weekdayOf(today))
    const weekOffset = date.relative === 'next_week' ? 7 : 0
    resolved = monday ? addDays(monday, weekOffset + weekday) : null
  } else if (hasRelative) {
    return null
  } else if (hasYear) {
    if (!hasMonth || !hasDay) return null
    resolved = parseIsoDate(
      isoDate({ year: date.year as number, month: date.month as number, day: date.day as number })
    )
  } else if (hasMonth || hasDay) {
    if (!hasMonth || !hasDay) return null
    resolved = dateForMonthDay(date.month, date.day, today)
  }

  if (!resolved || isoDate(resolved) < isoDate(today)) return null
  if (date.weekday && weekdayOf(resolved) !== WEEKDAY_INDEX[date.weekday]) return null
  return resolved
}

function resolveMonthPrecision(date: GuildFactDate, today: CalendarDate): CalendarMonth | null {
  if (date.day !== undefined) return null
  if (date.weekday !== undefined) return null
  if (date.relative === 'this_month' || date.relative === 'next_month') {
    if (date.month !== undefined) return null
    const offset = date.relative === 'next_month' ? 1 : 0
    return addMonths({ year: today.year, month: today.month }, offset)
  }
  if (date.relative !== undefined) return null
  if (date.month === undefined) return null
  if (date.year === undefined) return monthForMonth(date.month, today)
  const named = { year: date.year, month: date.month }
  return named.month < 1 || named.month > 12 || named.year < 1 ? null : named
}

function resolveFactDate(date: GuildFactDate, today: CalendarDate): ResolvedFactDate | null {
  const day = resolveDayPrecision(date, today)
  if (day) return { precision: 'day', date: day, eventDate: isoDate(day) }
  if (date.day !== undefined) return null

  const month = resolveMonthPrecision(date, today)
  if (!month) return null
  if (isoMonth(month) < isoMonth(today)) return null
  return { precision: 'month', date: month, eventDate: isoMonth(month) }
}

export function resolveGuildFactDate(
  date: GuildFactDate,
  now: number = Date.now(),
  timezone: string | undefined = config.timezone
): { localDate: string; eventDate: string; expiresAt: number } | null {
  const today = parseIsoDate(getLocalDate(now, timezone))
  if (!today) return null
  const resolved = resolveFactDate(date, today)
  if (!resolved) return null

  if (resolved.precision === 'day') {
    const nextDay = addDays(resolved.date, 1)
    if (!nextDay) return null
    return {
      localDate: isoDate(resolved.date),
      eventDate: resolved.eventDate,
      expiresAt: localDateStartEpoch(isoDate(nextDay), timezone)
    }
  }

  const nextMonth = addMonths(resolved.date, 1)
  if (!nextMonth) return null
  return {
    localDate: isoDate({ year: resolved.date.year, month: resolved.date.month, day: 1 }),
    eventDate: resolved.eventDate,
    expiresAt: localDateStartEpoch(isoDate({ year: nextMonth.year, month: nextMonth.month, day: 1 }), timezone)
  }
}
