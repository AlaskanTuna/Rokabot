import type { WindowMessage } from '../session/types.js'
import type { ToneKey } from './prompts/tones.js'

/** Rule-based tone detection via keyword pattern matching */

interface ToneRule {
  tone: ToneKey
  patterns: RegExp[]
  minMatches: number
}

const TONE_PATTERNS: ToneRule[] = [
  {
    tone: 'flustered',
    minMatches: 2,
    patterns: [
      /\blove\b/i,
      /\bcrush\b/i,
      /\bdate\b/i,
      /\bkiss\b/i,
      /\bcute\b/i,
      /\bhandsome\b/i,
      /\bpretty\b/i,
      /\bbeautiful\b/i,
      /\bheart\b/i,
      /\bblush\b/i,
      /\bflirt/i,
      /\bromantic/i,
      /\bmarry/i,
      /\bgirlfriend\b/i,
      /\bboyfriend\b/i,
      /\bconfess/i,
      /\bwife\b/i,
      /\bhusband\b/i,
      /❤|💕|💗|😘|😍|🥰/
    ]
  },
  {
    tone: 'tender',
    minMatches: 2,
    patterns: [
      /\bmiss\b/i,
      /\bworried\b/i,
      /\bscared\b/i,
      /\balone\b/i,
      /\bthank you\b/i,
      /\bgrateful\b/i,
      /\bmean.* a lot\b/i,
      /\bimportant to me\b/i,
      /\bgoodnight\b/i,
      /\bsweet dreams\b/i,
      /\btake care\b/i,
      /\bstay safe\b/i,
      /\balways\b/i,
      /\bpromise\b/i,
      /\btogether\b/i
    ]
  },
  {
    tone: 'curious',
    minMatches: 2,
    patterns: [
      /\bwhat\b/i,
      /\bhow\b/i,
      /\bwhy\b/i,
      /\bexplain\b/i,
      /\btell me about\b/i,
      /\binteresting\b/i,
      /\bwonder\b/i,
      /\bcurious\b/i,
      /\blearn\b/i,
      /\bthink about\b/i,
      /\btheory\b/i
    ]
  },
  {
    tone: 'annoyed',
    minMatches: 2,
    patterns: [
      /\bwon't\b/i,
      /\brefuse\b/i,
      /\bdon't want to\b/i,
      /\bno way\b/i,
      /\bnot fair\b/i,
      /\bskipped? (?:lunch|dinner|breakfast|meal)/i,
      /\bdidn't eat\b/i,
      /\bstayed up\b/i,
      /\ball.?nighter\b/i,
      /\bold\b/i,
      /\bobaa?san\b/i,
      /\bgranny\b/i,
      /\bboring\b/i,
      /\bwhatever\b/i,
      /\bdon't care\b/i
    ]
  },
  {
    tone: 'sleepy',
    minMatches: 2,
    patterns: [
      /\bsleepy\b/i,
      /\btired\b/i,
      /\byawn\b/i,
      /\bbed\b/i,
      /\bcan't sleep\b/i,
      /\bdrowsy\b/i,
      /\bnap\b/i,
      /\bexhausted\b/i,
      /\brest\b/i,
      /\bzzz\b/i,
      /💤/,
      /😴/
    ]
  },
  {
    tone: 'sincere',
    minMatches: 2,
    patterns: [
      /\bsad\b/i,
      /\blonely\b/i,
      /\btired\b/i,
      /\bstress/i,
      /\banxious/i,
      /\bsorry\b/i,
      /\bhurt\b/i,
      /\bcrying\b/i,
      /\bdepressed/i,
      /\bfail/i,
      /\bfrustrat/i,
      /\boverwel/i,
      /\bafraid/i,
      /\bexhaust/i,
      /😢|😭|🥺|💔/
    ]
  },
  {
    tone: 'nostalgic',
    minMatches: 2,
    patterns: [
      /\bremember\b/i,
      /\bmemories\b/i,
      /\bback then\b/i,
      /\bpast\b/i,
      /\bchildhood\b/i,
      /\bnostalgia\b/i,
      /\bused to\b/i,
      /\bold days\b/i,
      /\bthose days\b/i,
      /\blong ago\b/i,
      /\bwhen I was\b/i,
      /\bmiss those\b/i
    ]
  },
  {
    tone: 'domestic',
    minMatches: 2,
    patterns: [
      /\bfood\b/i,
      /\bcook/i,
      /\brecipe/i,
      /\btea\b/i,
      /\bbreakfast\b/i,
      /\blunch\b/i,
      /\bdinner\b/i,
      /\bsleep/i,
      /\bmorning\b/i,
      /\bweather\b/i,
      /\brain\b/i,
      /\bcold\b/i,
      /\bwarm\b/i,
      /\bhungry/i,
      /\bhome\b/i,
      /\bsnack/i,
      /\bcoffee\b/i,
      /\bclean/i,
      /🍵|🍳|🏠|☔|🌸/
    ]
  },
  {
    tone: 'mischievous',
    minMatches: 2,
    patterns: [
      /\bdare\b/i,
      /\bprank\b/i,
      /\bsecret\b/i,
      /\bbet\b/i,
      /\bsneak\b/i,
      /\bscheme\b/i,
      /\btrick\b/i,
      /\bsurprise\b/i,
      /\bplot\b/i,
      /\bplan something\b/i,
      /\blet's do something\b/i,
      /\bidea\b/i
    ]
  },
  {
    tone: 'competitive',
    minMatches: 2,
    patterns: [
      /\bgame\b/i,
      /\bwin\b/i,
      /\blose\b/i,
      /\bscore\b/i,
      /\bmatch\b/i,
      /\bversus\b/i,
      /\bchallenge\b/i,
      /\bbeat\b/i,
      /\blet's play\b/i,
      /\bcompete\b/i,
      /\btournament\b/i,
      /\brematch\b/i,
      /🏆/,
      /🎮/
    ]
  },
  {
    tone: 'confident',
    minMatches: 2,
    patterns: [
      /\bleave it to me\b/i,
      /\bdon't worry\b/i,
      /\bi've got this\b/i,
      /\btrust me\b/i,
      /\badvice\b/i,
      /\bhelp me with\b/i,
      /\bwhat should I\b/i,
      /\brecommend\b/i,
      /\bhow do I\b/i,
      /\bteach me\b/i,
      /\bshow me\b/i,
      /\bneed your help\b/i,
      /\bcan you help\b/i
    ]
  }
]

/** Scan the last 3 messages for keyword patterns and return the best-matching tone
 * @param messages - Recent conversation messages
 * @param hour - Current hour (0-23) for time-based tone triggers
 * @returns Matched tone key, or 'playful' as default
 */
export function detectTone(messages: WindowMessage[], hour?: number): ToneKey {
  const recentMessages = messages.slice(-3)
  const text = recentMessages.map((m) => m.content).join(' ')

  for (const { tone, patterns, minMatches } of TONE_PATTERNS) {
    const matchCount = patterns.filter((p) => p.test(text)).length

    // Sleepy triggers with 1 match during late night (22:00-04:00)
    if (tone === 'sleepy' && matchCount >= 1 && matchCount < minMatches && hour !== undefined) {
      const isLateNight = hour >= 22 || hour <= 4
      if (isLateNight) return 'sleepy'
    }

    if (matchCount >= minMatches) return tone
  }

  return 'playful'
}
