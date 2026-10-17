import type { Problem } from '../../lib/api'

/** Mirrors the bot's macro pattern in src/character/load.ts. */
export const MACRO = /\{\{([^{}]*)\}\}/g

/** The macros every line may use; the loader fills them from character.yml. */
export const STATIC_SLOTS = ['char', 'char_full', 'world'] as const

export function slotsIn(text: string): string[] {
  return [...new Set([...text.matchAll(MACRO)].map((match) => match[1]))]
}

export interface Slot {
  name: string
  used: boolean
  /** Why the slot exists: a static fill or the comment that names it. */
  source: 'static' | 'comment' | 'rejected' | 'used'
}

/**
 * The slots a line accepts: the static ones, any named in the comments on its key or the keys above it (the file's
 * own convention), and any it uses that the bot's check did not reject.
 */
export function slotsFor(text: string, comments: string[], problems: Problem[]): Slot[] {
  const used = slotsIn(text)
  const named = comments.flatMap(slotsIn)
  const rejected = new Set(
    problems.flatMap((problem) =>
      [...problem.message.matchAll(/unknown macro \{\{([^{}]*)\}\}/g)].map((match) => match[1])
    )
  )
  const slots = new Map<string, Slot>()
  const add = (name: string, source: Slot['source']) => {
    if (!slots.has(name)) slots.set(name, { name, used: used.includes(name), source })
  }
  for (const name of STATIC_SLOTS) add(name, 'static')
  for (const name of named) add(name, 'comment')
  for (const name of used) add(name, rejected.has(name) ? 'rejected' : 'used')
  return [...slots.values()]
}
