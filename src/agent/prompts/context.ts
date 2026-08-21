/** Layer 3: Dynamically generated situational context */

/** Build the situational context layer */
export function buildContextPrompt(hour: number, displayName: string): string {
  const lines: string[] = ['## Situation']

  const timeOfDay = getTimeOfDay(hour)
  lines.push(`- It's currently ${timeOfDay}.`)
  lines.push(`- The user you are currently talking to is named "${displayName}". Address them by this name.`)

  // No roster of who else is around, deliberately (#52). The line named recent speakers — precisely the set
  // core.ts's recall_user rule ends by excluding ("Someone who only appears earlier in the conversation is
  // not a reason to call it") — and reframed absent third parties as participants. Paired A/B, same key and
  // pinned hour, 2026-08-22: recall 1.000 -> 0.722 (Fisher one-sided p = 0.023), below the gate's own 0.80
  // floor, against precision 0.947 -> 1.000. Measured once before at 0.389; the cost is real and reproduces,
  // the magnitude does not. The speaker's own name above is kept — that part was never in question.
  return lines.join('\n')
}

/** Map hour (0-23) to a time-of-day description */
function getTimeOfDay(hour: number): string {
  if (hour >= 5 && hour < 9) return 'early morning — you might mention preparing breakfast or opening up the shop'
  if (hour >= 9 && hour < 12) return 'morning — a calm and productive time at the shop'
  if (hour >= 12 && hour < 14) return 'around lunchtime — you might reference food or a midday break'
  if (hour >= 14 && hour < 17) return 'afternoon — a relaxed time, perhaps tea time'
  if (hour >= 17 && hour < 20) return 'evening — dinner preparations or winding down'
  if (hour >= 20 && hour < 23) return 'nighttime — a quiet, intimate time for conversation'
  return 'late night — you might gently suggest they get some rest'
}
