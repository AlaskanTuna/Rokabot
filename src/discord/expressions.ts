import type { ToneKey } from '../agent/prompts/tones.js'
import { character } from '../character/index.js'
import { logger } from '../utils/logger.js'

/** Tone-to-expression mapping for character portraits */
const TONE_EXPRESSIONS: Readonly<Record<ToneKey, readonly string[]>> = Object.fromEntries(
  character.moodKeys.map((mood) => [mood, character.moods[mood].portraits])
)

const EXPRESSION_URLS = character.portraitUrls

const lastExpressionByTone = new Map<string, string>()

/** Get a random expression URL for the given tone */
export function getExpressionUrl(tone: ToneKey, opts?: { rng?: () => number }): string {
  const pool = TONE_EXPRESSIONS[tone]
  if (!pool || pool.length === 0) {
    logger.debug({ expression: 'base', tone, method: 'fallback' }, 'Expression selected')
    return EXPRESSION_URLS['base'] ?? ''
  }

  const lastExpression = lastExpressionByTone.get(tone)
  const availableExpressions =
    pool.length > 1 && lastExpression ? pool.filter((expression) => expression !== lastExpression) : pool
  const random = (opts?.rng ?? Math.random)()
  const index = Math.min(Math.max(Math.floor(random * availableExpressions.length), 0), availableExpressions.length - 1)
  const picked = availableExpressions[index]
  lastExpressionByTone.set(tone, picked)
  logger.debug({ expression: picked, tone, method: 'tone-pool' }, 'Expression selected')
  return EXPRESSION_URLS[picked] ?? ''
}

export function __resetExpressionState(): void {
  lastExpressionByTone.clear()
}
