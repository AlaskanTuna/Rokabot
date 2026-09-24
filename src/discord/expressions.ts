import type { ToneKey } from '../agent/prompts/tones.js'
import { logger } from '../utils/logger.js'

/** Tone-to-expression mapping for character portraits */
const TONE_EXPRESSIONS: Record<ToneKey, string[]> = {
  playful: ['smile', 'cheerful'],
  sincere: ['sad', 'pained', 'sorrowful'],
  domestic: ['content', 'gentle_smile', 'relieved'],
  flustered: ['flustered', 'nervous', 'awkward'],
  curious: ['thinking', 'surprised', 'blank_stare'],
  annoyed: ['exasperated', 'dissatisfied', 'dissatisfied_2'],
  tender: ['worried', 'troubled', 'anxious'],
  confident: ['composed', 'base', 'explaining'],
  nostalgic: ['melancholy', 'downcast', 'somber'],
  mischievous: ['delighted', 'attentive'],
  sleepy: ['serene', 'resigned'],
  competitive: ['frustrated', 'dissatisfied_3', 'uncertain']
}

const EXPRESSION_URLS: Record<string, string> = {
  anxious: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/anxious.webp',
  attentive: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/attentive.webp',
  awkward: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/awkward.webp',
  base: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/base.webp',
  blank_stare: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/blank_stare.webp',
  cheerful: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/cheerful.webp',
  composed: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/composed.webp',
  content: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/content.webp',
  delighted: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/delighted.webp',
  dissatisfied: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/dissatisfied.webp',
  dissatisfied_2: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/dissatisfied_2.webp',
  dissatisfied_3: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/dissatisfied_3.webp',
  downcast: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/downcast.webp',
  exasperated: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/exasperated.webp',
  explaining: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/explaining.webp',
  flustered: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/flustered.webp',
  frustrated: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/frustrated.webp',
  gentle_smile: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/gentle_smile.webp',
  melancholy: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/melancholy.webp',
  nervous: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/nervous.webp',
  pained: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/pained.webp',
  relieved: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/relieved.webp',
  resigned: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/resigned.webp',
  sad: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/sad.webp',
  serene: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/serene.webp',
  smile: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/smile.webp',
  somber: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/somber.webp',
  sorrowful: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/sorrowful.webp',
  surprised: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/surprised.webp',
  thinking: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/thinking.webp',
  troubled: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/troubled.webp',
  uncertain: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/uncertain.webp',
  worried: 'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/worried.webp'
}

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
