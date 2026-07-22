/**
 * Buddy pet system — daily hatchable companion collection.
 * Each user can hatch one buddy per day, building a collection over time.
 * Generation is deterministic from userId + date seed via Mulberry32 PRNG.
 * Buddies are persistent via SQLite.
 */

import { config } from '../config.js'
import { getDb } from '../storage/database.js'
import { getTodayDate, getYesterdayDate } from '../utils/timezone.js'
import {
  type BuddyRarity,
  EYE_STYLES,
  HAT_STYLES,
  RARITY_STAT_RANGE,
  RARITY_WEIGHTS,
  SPECIES,
  STAT_NAMES,
  type SpeciesInfo
} from './data/buddySpecies.js'

// Re-export for backward compatibility with existing importers
export { getTodayDate }

// ── PRNG ──

/** Mulberry32 — a fast, seedable 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash a string to a 32-bit integer seed. */
export function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    hash = ((hash << 5) - hash + ch) | 0
  }
  return hash
}

// ── Data model ──

export interface BuddyData {
  userId: string
  species: string
  rarity: BuddyRarity
  shiny: boolean
  eyes: string
  hat: string
  name: string | null
  personality: string | null
  stats: Record<string, number>
  hatchedAt: number
}

type DailyBuddyHatch =
  | { alreadyHatched: true; buddy: BuddyData | null; msUntilNext: number }
  | { alreadyHatched: false; buddy: BuddyData; count: number; streak: number; adopted: boolean }

const HATCH_COOLDOWN_MS = 24 * 60 * 60 * 1000
const STREAK_GRACE_MS = 48 * 60 * 60 * 1000

// ── Name / personality generation ──

const NAME_PREFIXES = [
  'Luna',
  'Hoshi',
  'Yume',
  'Sora',
  'Hana',
  'Kaze',
  'Mizu',
  'Kumo',
  'Tsuki',
  'Niji',
  'Aki',
  'Fuyu',
  'Natsu',
  'Haru'
]
const NAME_SUFFIXES = ['maru', 'chan', 'ko', 'chi', 'mi', 'ta', 'ri', 'ne', 'ka', 'ra', 'no', 'zu']

function generateName(rng: () => number): string {
  const prefix = NAME_PREFIXES[Math.floor(rng() * NAME_PREFIXES.length)]
  const suffix = NAME_SUFFIXES[Math.floor(rng() * NAME_SUFFIXES.length)]
  return `${prefix}${suffix}`
}

/** Personality archetypes keyed by dominant stat. */
const PERSONALITY_TEMPLATES: Record<string, string[]> = {
  charm: [
    'Wins everyone over with a single glance and knows it~',
    'Could charm the stars right out of the sky~',
    'Has an irresistible aura that makes everyone smile~'
  ],
  wit: [
    'Always has a clever comeback ready before you finish talking~',
    'Sees through every trick and loves to explain why~',
    'The kind of companion who finishes your sentences (correctly)~'
  ],
  dere: [
    'Gets flustered easily but shows affection through small gifts~',
    'Secretly writes poetry about their favorite person~',
    'Pretends not to care but always remembers your birthday~'
  ],
  drama: [
    'Turns every moment into a dramatic scene worthy of a finale~',
    'Lives life like the protagonist of a VN with maximum intensity~',
    'Has a flair for the theatrical that makes everything exciting~'
  ],
  luck: [
    'Stumbles into good fortune like it is a daily routine~',
    'Has the kind of plot armor that would make any protagonist jealous~',
    "Everything just works out somehow, much to everyone else's disbelief~"
  ]
}

function generatePersonality(stats: Record<string, number>, speciesInfo: SpeciesInfo, rng: () => number): string {
  // Find the dominant stat
  let maxStat = ''
  let maxVal = -1
  for (const { key } of STAT_NAMES) {
    if (stats[key] > maxVal) {
      maxVal = stats[key]
      maxStat = key
    }
  }

  const templates = PERSONALITY_TEMPLATES[maxStat] ?? PERSONALITY_TEMPLATES.charm
  const template = templates[Math.floor(rng() * templates.length)]
  return `A ${speciesInfo.rarity} ${speciesInfo.name} who ${template.charAt(0).toLowerCase()}${template.slice(1)}`
}

// ── Deterministic buddy generation ──

/** Pick a rarity tier using the PRNG based on weighted distribution. */
function rollRarity(rng: () => number): BuddyRarity {
  const totalWeight = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
  const roll = rng() * totalWeight
  let cumulative = 0
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS) as [BuddyRarity, number][]) {
    cumulative += weight
    if (roll < cumulative) return rarity
  }
  return 'common'
}

/** Generate a fully deterministic buddy from a userId and date seed. */
export function generateBuddy(userId: string, dateSeed?: string): BuddyData {
  const dateStr = dateSeed ?? getTodayDate()
  const rng = mulberry32(hashString(userId + ':' + dateStr))

  const rarity = rollRarity(rng)

  // Filter species by rarity, pick one
  const speciesPool = SPECIES.filter((s) => s.rarity === rarity)
  const speciesInfo = speciesPool[Math.floor(rng() * speciesPool.length)]

  // Shiny chance from config
  const shiny = rng() < config.games.shinyChance

  // Cosmetics
  const eyes = EYE_STYLES[Math.floor(rng() * EYE_STYLES.length)]
  const hat = HAT_STYLES[Math.floor(rng() * HAT_STYLES.length)]

  // Stats — floor to max based on rarity
  const range = RARITY_STAT_RANGE[rarity]
  const stats: Record<string, number> = {}
  for (const { key } of STAT_NAMES) {
    stats[key] = range.floor + Math.floor(rng() * (range.max - range.floor + 1))
  }

  // Generate name and personality
  const name = generateName(rng)
  const personality = generatePersonality(stats, speciesInfo, rng)

  return {
    userId,
    species: speciesInfo.id,
    rarity,
    shiny,
    eyes,
    hat,
    name,
    personality,
    stats,
    hatchedAt: Date.now()
  }
}

// ── SQLite persistence ──

interface BuddyRow {
  id: number
  user_id: string
  species: string
  rarity: string
  shiny: number
  eyes: string
  hat: string
  name: string | null
  personality: string | null
  stats_json: string
  hatched_at: number
}

/** Convert a database row to a BuddyData object. */
function rowToBuddy(row: BuddyRow): BuddyData {
  return {
    userId: row.user_id,
    species: row.species,
    rarity: row.rarity as BuddyRarity,
    shiny: row.shiny === 1,
    eyes: row.eyes,
    hat: row.hat,
    name: row.name,
    personality: row.personality,
    stats: JSON.parse(row.stats_json),
    hatchedAt: row.hatched_at
  }
}

/** Save a buddy to SQLite. Returns the inserted row id. */
export function saveBuddy(buddy: BuddyData): number {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO buddy (user_id, species, rarity, shiny, eyes, hat, name, personality, stats_json, hatched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      buddy.userId,
      buddy.species,
      buddy.rarity,
      buddy.shiny ? 1 : 0,
      buddy.eyes,
      buddy.hat,
      buddy.name,
      buddy.personality,
      JSON.stringify(buddy.stats),
      buddy.hatchedAt
    )
  return Number(result.lastInsertRowid)
}

/** Load the latest (most recent) buddy for a user, or null if none. */
export function getBuddy(userId: string): BuddyData | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM buddy WHERE user_id = ? ORDER BY hatched_at DESC LIMIT 1').get(userId) as
    | BuddyRow
    | undefined
  if (!row) return null
  return rowToBuddy(row)
}

/** Get all buddies for a user, most recent first. */
export function getBuddyCollection(userId: string): BuddyData[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM buddy WHERE user_id = ? ORDER BY hatched_at DESC').all(userId) as BuddyRow[]
  return rows.map(rowToBuddy)
}

/** Count total buddies for a user. */
export function getBuddyCount(userId: string): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as cnt FROM buddy WHERE user_id = ?').get(userId) as { cnt: number }
  return row.cnt
}

interface DailyHatchRow {
  last_draw_date: string | null
  streak: number
  last_hatch_at: number | null
}

function getDailyHatchRow(userId: string): DailyHatchRow | undefined {
  const db = getDb()
  return db.prepare('SELECT last_draw_date, streak, last_hatch_at FROM gacha_daily WHERE user_id = ?').get(userId) as
    | DailyHatchRow
    | undefined
}

function msUntilNextLocalDay(): number {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23'
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]))
  return (
    (23 - values.hour) * 60 * 60 * 1000 +
    (59 - values.minute) * 60 * 1000 +
    (59 - values.second) * 1000 +
    (1000 - now.getMilliseconds())
  )
}

/** Return the remaining cooldown in milliseconds, or zero when a hatch is available. */
export function msUntilNextHatch(userId: string): number {
  const row = getDailyHatchRow(userId)
  if (!row) return 0
  if (row.last_hatch_at !== null) return Math.max(0, HATCH_COOLDOWN_MS - (Date.now() - row.last_hatch_at))
  return row.last_draw_date === getTodayDate() ? msUntilNextLocalDay() : 0
}

/** Check whether the user is still inside their hatch cooldown. */
export function hasHatchedToday(userId: string): boolean {
  return msUntilNextHatch(userId) > 0
}

/** Mark that the user has hatched and update their streak. */
export function markDailyHatch(userId: string): void {
  const db = getDb()
  const today = getTodayDate()
  const yesterday = getYesterdayDate()
  const now = Date.now()

  const row = getDailyHatchRow(userId)

  const continuesStreak =
    row?.last_hatch_at != null ? now - row.last_hatch_at <= STREAK_GRACE_MS : row?.last_draw_date === yesterday
  const newStreak = continuesStreak ? (row?.streak ?? 0) + 1 : 1

  db.prepare(
    'INSERT OR REPLACE INTO gacha_daily (user_id, last_draw_date, streak, last_hatch_at) VALUES (?, ?, ?, ?)'
  ).run(userId, today, newStreak, now)
}

function matchesGeneratedBuddy(stored: BuddyData, generated: BuddyData): boolean {
  return (
    stored.species === generated.species &&
    stored.rarity === generated.rarity &&
    stored.shiny === generated.shiny &&
    stored.eyes === generated.eyes &&
    stored.hat === generated.hat &&
    stored.name === generated.name &&
    stored.personality === generated.personality &&
    JSON.stringify(stored.stats) === JSON.stringify(generated.stats)
  )
}

/** Hatch today's buddy, atomically adopting a matching row left by a failed attempt. */
export function hatchDailyBuddy(userId: string): DailyBuddyHatch {
  const db = getDb()
  return db.transaction((): DailyBuddyHatch => {
    const msUntilNext = msUntilNextHatch(userId)
    if (msUntilNext > 0) {
      return { alreadyHatched: true, buddy: getBuddy(userId), msUntilNext }
    }

    const generated = generateBuddy(userId)
    const latest = getBuddy(userId)
    const adopted = latest !== null && matchesGeneratedBuddy(latest, generated)
    const buddy = adopted ? latest : generated

    if (!adopted) saveBuddy(buddy)
    markDailyHatch(userId)

    return {
      alreadyHatched: false,
      buddy,
      count: getBuddyCount(userId),
      streak: getStreak(userId),
      adopted
    }
  })()
}

/** Get the current hatch streak for a user. */
export function getStreak(userId: string): number {
  const today = getTodayDate()
  const yesterday = getYesterdayDate()
  const row = getDailyHatchRow(userId)

  if (!row) return 0
  if (row.last_hatch_at !== null) return Date.now() - row.last_hatch_at <= STREAK_GRACE_MS ? (row.streak ?? 0) : 0
  if (row.last_draw_date === today || row.last_draw_date === yesterday) return row.streak ?? 0
  return 0
}

/** Update a buddy's name and personality (updates the latest buddy). */
export function updateBuddyName(userId: string, name: string, personality: string): void {
  const db = getDb()
  db.prepare(
    `UPDATE buddy SET name = ?, personality = ? WHERE id = (
      SELECT id FROM buddy WHERE user_id = ? ORDER BY hatched_at DESC LIMIT 1
    )`
  ).run(name, personality, userId)
}

/** Get the top buddies by total stat sum, for leaderboard. Ranks by best single buddy per user. */
export function getTopBuddies(limit: number = 10): BuddyData[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM buddy ORDER BY hatched_at ASC').all() as BuddyRow[]

  // Group by user, keep only the best buddy per user (highest total stats)
  const bestByUser = new Map<string, BuddyData>()
  for (const row of rows) {
    const buddy = rowToBuddy(row)
    const totalStats = Object.values(buddy.stats).reduce((s, v) => s + v, 0)
    const existing = bestByUser.get(buddy.userId)
    if (!existing) {
      bestByUser.set(buddy.userId, buddy)
    } else {
      const existingTotal = Object.values(existing.stats).reduce((s, v) => s + v, 0)
      if (totalStats > existingTotal) {
        bestByUser.set(buddy.userId, buddy)
      }
    }
  }

  const buddies = Array.from(bestByUser.values())

  // Sort by total stat sum descending
  buddies.sort((a, b) => {
    const sumA = Object.values(a.stats).reduce((s, v) => s + v, 0)
    const sumB = Object.values(b.stats).reduce((s, v) => s + v, 0)
    return sumB - sumA
  })

  return buddies.slice(0, limit)
}

/** Look up SpeciesInfo by species id. */
export function getSpeciesInfo(speciesId: string): SpeciesInfo | undefined {
  return SPECIES.find((s) => s.id === speciesId)
}
