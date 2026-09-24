import type { ExtractionEpisode } from '../../storage/extractionQueue.js'

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi
const GREETING_PATTERN = /^(?:hi|hello|hey|yo|howdy|good morning|good afternoon|good evening)[!?.\s]*$/i
const REACTION_PATTERN = /^(?:\+1|lol|lmao|haha+|thanks|thx|ok(?:ay)?|yes|no|nice|cool|same|agree)[!?.\s]*$/i
const EMOJI_PATTERN =
  /^(?:(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\u200d|\ufe0f)|[\s!?.])*$/u
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

export function precheckEpisode(episode: ExtractionEpisode): 'sensitive' | 'trivial' | null {
  const messages = episode.messages.map(({ content }) => normalize(content))
  if (messages.some((content) => SENSITIVE_PATTERNS.some((pattern) => pattern.test(content)))) return 'sensitive'
  if (messages.length === 0 || messages.every(isTrivial)) return 'trivial'
  return null
}
