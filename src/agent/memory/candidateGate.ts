import type { BufferedMessage } from '../passiveBuffer.js'
import { PREDICATES } from './predicates.js'

export interface CandidateGateResult {
  extract: boolean
  reason: string
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi
const GREETING_PATTERN = /^(?:hi|hello|hey|yo|howdy|good morning|good afternoon|good evening)[!?.\s]*$/i
const REACTION_PATTERN = /^(?:\+1|lol|lmao|haha+|thanks|thx|ok(?:ay)?|yes|no|nice|cool|same|agree)[!?.\s]*$/i
const EMOJI_PATTERN =
  /^(?:(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\u200d|\ufe0f)|[\s!?.])*$/u
const PERSONAL_SIGNAL_PATTERN =
  /\b(?:i|im|i'm|my|mine|we|our)\b.*\b(?:am|like|love|hate|prefer|enjoy|play|watch|have|own|keep|work|speak|live|date|call|remember|used to)\b/i
const REMEMBER_INTENT_PATTERN = /\b(?:remember|dont forget|don't forget|keep in mind)\b/i
const CORRECTION_PATTERN = /\b(?:actually|correction|i mean|rather than|not .+ but)\b/i
const SENSITIVE_PATTERNS = [
  /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/i,
  /\b(?:\+?\d[\d().\s-]{7,}\d)\b/,
  /\b(?:password|passcode|credential|credit card|debit card|bank account|social security)\b/i,
  /\b(?:my |full |real |legal )(?:full |real |legal )?name\s+(?:is|:)/i,
  /\b(?:i am|i'm|im|my age is)\s+\d{1,3}\b|\b(?:date of birth|birthday)\b/i,
  /\b(?:address|postal code|postcode|zip code)\b|\b(?:i live|i'm living|im living|my home is)\s+(?:at|in)\b/i,
  /\b(?:my (?:school|workplace|company|employer) (?:is|at)|i (?:work|study) at)\b/i,
  /\b(?:medical condition|diagnosed|diagnosis|medication|chronic|disability|pregnant|depression|anxiety|cancer|diabetes)\b/i,
  /\b(?:my )?(?:instagram|twitter|tiktok|facebook|reddit|youtube)\s*(?:is|:|@)/i
]

function normalize(content: string): string {
  return content.replace(URL_PATTERN, '').replace(/\s+/g, ' ').trim()
}

function isTrivial(content: string): boolean {
  return !content || GREETING_PATTERN.test(content) || REACTION_PATTERN.test(content) || EMOJI_PATTERN.test(content)
}

function isSensitive(content: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(content))
}

function hasKeyword(content: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(content)
}

function knownKeys(keys: Set<string>): Set<string> {
  return new Set([...keys].map((key) => key.trim().toLowerCase()))
}

/** Decides whether a buffered conversation has a safe, durable memory signal worth extracting. */
export function shouldExtract(batch: BufferedMessage[], knownClaimKeys: Set<string>): CandidateGateResult {
  const messages = batch.map((message) => normalize(message.content))

  if (messages.some(isSensitive)) return { extract: false, reason: 'sensitive content' }
  if (messages.length === 0 || messages.every(isTrivial)) return { extract: false, reason: 'trivial batch' }

  const known = knownKeys(knownClaimKeys)
  const matchedPredicates = new Set<string>()

  for (const content of messages) {
    for (const [predicate, definition] of Object.entries(PREDICATES)) {
      if (definition.keywords.some((keyword) => hasKeyword(content, keyword))) matchedPredicates.add(predicate)
    }
  }

  const novelPredicate = [...matchedPredicates].find((predicate) => !known.has(predicate))
  if (novelPredicate) return { extract: true, reason: `novel keyword: ${novelPredicate}` }
  if (matchedPredicates.size > 0) return { extract: false, reason: 'known claim keywords only' }

  if (messages.some((content) => PERSONAL_SIGNAL_PATTERN.test(content))) {
    return { extract: true, reason: 'novel personal signal' }
  }
  if (messages.some((content) => REMEMBER_INTENT_PATTERN.test(content))) {
    return { extract: true, reason: 'explicit remember intent' }
  }
  if (messages.some((content) => CORRECTION_PATTERN.test(content))) {
    return { extract: true, reason: 'correction signal' }
  }

  return { extract: false, reason: 'no personal signal' }
}
