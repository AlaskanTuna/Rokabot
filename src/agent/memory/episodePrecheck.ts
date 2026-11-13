import type { ExtractionEpisode } from '../../storage/extractionQueue.js'

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi
const DISCORD_TOKEN_PATTERN = /<a?:\w+:\d+>|<#\d+>|<@[!&]?\d+>/g
const GREETING_PATTERN = /^(?:hi|hello|hey|yo|howdy|good morning|good afternoon|good evening)[!?.\s]*$/i
const REACTION_PATTERN = /^(?:\+1|lol|lmao|haha+|thanks|thx|ok(?:ay)?|yes|no|nice|cool|same|agree)[!?.\s]*$/i
const EMOJI_PATTERN =
  /^(?:(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\u200d|\ufe0f)|[\s!?.])*$/u
export type SensitivePatternName =
  | 'email'
  | 'phone'
  | 'credential'
  | 'name'
  | 'age'
  | 'address'
  | 'workplace'
  | 'health'
  | 'social'

const SENSITIVE_PATTERNS: readonly { name: SensitivePatternName; pattern: RegExp }[] = [
  { name: 'email', pattern: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/i },
  {
    name: 'phone',
    pattern:
      /\b(?!\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?\b)(?!\d{1,3}(?:,\d{3})+(?!\d))(?!\d{1,3}(?: \d{3})+(?!\d)(?!\s+\d))(?:\+?\d[\d().\s-]{7,}\d)\b/
  },
  {
    name: 'credential',
    pattern: /\b(?:password|passcode|credential|credit card|debit card|bank account|social security)\b/i
  },
  { name: 'name', pattern: /\b(?:my |full |real |legal )(?:full |real |legal )?name\s+(?:is|:)/i },
  {
    name: 'age',
    pattern:
      /\b(?:i am|i'm|im|my age is)\s+\d{1,3}(?=\s*(?:$|[.!?,;:]|years old\b|yo\b|y\/o\b))|\b(?:my birthday|birthday is|born on|date of birth)\b/i
  },
  {
    name: 'address',
    pattern: /\b(?:address|postal code|postcode|zip code)\b|\b(?:i live|i'm living|im living|my home is)\s+(?:at|in)\b/i
  },
  { name: 'workplace', pattern: /\b(?:my (?:school|workplace|company|employer) (?:is|at)|i (?:work|study) at)\b/i },
  {
    name: 'health',
    pattern:
      /\b(?:medical condition|diagnosed|diagnosis|medication|chronic|disability|pregnant|depression|anxiety|cancer|diabetes)\b/i
  },
  { name: 'social', pattern: /\b(?:my )?(?:instagram|twitter|tiktok|facebook|reddit|youtube)\s*(?:is|:|@)/i }
]

function normalize(content: string): string {
  return content.replace(URL_PATTERN, '').replace(DISCORD_TOKEN_PATTERN, '').replace(/\s+/g, ' ').trim()
}

function isTrivial(content: string): boolean {
  return !content || GREETING_PATTERN.test(content) || REACTION_PATTERN.test(content) || EMOJI_PATTERN.test(content)
}

export function precheckEpisode(
  episode: ExtractionEpisode
): { outcome: 'sensitive'; pattern: SensitivePatternName } | { outcome: 'trivial'; pattern: null } | null {
  const messages = episode.messages.map(({ content }) => normalize(content))
  for (const content of messages) {
    const match = SENSITIVE_PATTERNS.find(({ pattern }) => pattern.test(content))
    if (match) return { outcome: 'sensitive', pattern: match.name }
  }
  if (messages.length === 0 || messages.every(isTrivial)) return { outcome: 'trivial', pattern: null }
  return null
}
