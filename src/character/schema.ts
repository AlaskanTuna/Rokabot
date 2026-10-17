import { z } from 'zod'

const text = z.string().min(1)
const hour = z.number().int().min(0).max(23)
const odds = z.number().min(0).max(1)
const weight = z.number().min(0)
const moodKey = z.string().regex(/^[a-z][a-z0-9_-]*$/, 'expected a lowercase name like "playful"')
const promptName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/, 'expected a prompt name like "intro" or "moods/playful"')

const regexSource = z.string().superRefine((source, context) => {
  try {
    new RegExp(source, 'i')
  } catch (error) {
    context.addIssue({ code: 'custom', message: `invalid regular expression: ${(error as Error).message}` })
  }
})

const differ = [
  ({ from, to }: { from: number; to: number }) => from !== to,
  'from and to must differ; a range may wrap past midnight'
] as const

export const characterFileSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'expected a lowercase id like "roka"'),
  name: text,
  fullName: text,
  world: text,
  triggers: z.strictObject({ names: z.array(text).min(1) }),
  model: z.strictObject({ temperature: z.number().min(0).max(2), topP: z.number().gt(0).max(1) }),
  prompt: z.strictObject({ system: z.array(promptName).min(1) }),
  situation: z.strictObject({
    timeOfDay: z.array(z.strictObject({ from: hour, to: hour, text }).refine(...differ)).min(1)
  }),
  judge: z.strictObject({ lookupQuestion: text, moodQuestion: text })
})

const opener = {
  instruction: text,
  skipMoods: z.array(z.string()).default([]),
  skipOnHardLine: z.boolean().default(false)
}
const wordOpener = z.strictObject({
  ...opener,
  words: z.array(text).min(1),
  moodWords: z.record(z.string(), z.array(text)).default({})
})
const paragraphOdds = z
  .array(z.strictObject({ count: z.union([z.literal(1), z.literal(2), z.literal(3)]), weight }))
  .min(1)
const ending = z.strictObject({ weight, line: text })

export const voiceFileSchema = z.strictObject({
  paragraphs: z.strictObject({ quick: paragraphOdds, ordinary: paragraphOdds, rich: paragraphOdds }),
  lengths: z.strictObject({ 1: text, 2: text, 3: text }),
  openers: z.strictObject({
    content: z.strictObject(opener),
    soft: wordOpener,
    particle: wordOpener,
    gasp: wordOpener,
    comedy: z.strictObject({ ...opener, bits: z.array(text).min(1) }),
    name: z.strictObject(opener)
  }),
  endings: z.strictObject({ statement: ending, question: ending, aside: ending }),
  faces: z.record(z.string(), z.array(text).min(1)),
  hardLineFaces: z.array(z.string()).min(1),
  beats: z
    .array(z.strictObject({ name: text, edges: z.array(z.enum(['none', 'lewd', 'hard'])), line: text }))
    .default([]),
  threats: z.array(z.strictObject({ text, seen: regexSource })).min(1),
  note: z.strictObject({
    header: text,
    intro: text,
    length: text,
    open: text,
    end: text,
    faces: text,
    lewd: text,
    hard: text,
    nameOnce: text
  })
})

const moodSchema = z.strictObject({
  prompt: promptName.optional(),
  faces: z.array(z.string()).min(1),
  beats: z.record(z.string(), odds).default({}),
  judge: text,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a colour like "#ffb3d9"'),
  placeholder: z.url(),
  portraits: z.array(z.string()).default([]),
  emoji: text,
  adjective: text,
  season: text
})

export const moodsFileSchema = z.strictObject({
  default: z.string(),
  safe: z.string(),
  lateNight: z
    .strictObject({ mood: z.string(), from: hour, to: hour })
    .refine(...differ)
    .optional(),
  detection: z
    .array(
      z.strictObject({ mood: z.string(), minMatches: z.number().int().min(1), patterns: z.array(regexSource).min(1) })
    )
    .default([]),
  moods: z.record(moodKey, moodSchema).refine((moods) => Object.keys(moods).length > 0, 'list at least one mood'),
  moodPairs: z.record(z.string(), text).default({}),
  portraitUrls: z.record(z.string(), z.url()).default({})
})

export type CharacterFile = z.output<typeof characterFileSchema>
export type VoiceFile = z.output<typeof voiceFileSchema>
export type MoodsFile = z.output<typeof moodsFileSchema>
