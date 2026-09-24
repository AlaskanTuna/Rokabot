import { type Questions, choice, noul } from '@typesafe-ai/sdk'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { getLocalHour } from '../../utils/timezone.js'
import type { ExtractionOp } from '../memory/extractionSchema.js'
import type { MemoryClaim } from '../memory/memoryClaims.js'
import type { ToneKey } from '../prompts/tones.js'
import { getJevClient } from './client.js'

export type TurnJudgmentInput = {
  speakerName: string
  message: string
  recentLines: string[]
  ambiguous: Array<{ alias: string; candidates: Array<{ userId: string; displayName: string }> }>
  includeTone: boolean
}

export type TurnJudgment = {
  tone: { tone: ToneKey; confidence: number } | null
  referents: Array<{ alias: string; userId: string | null; confidence: number }>
  latencyMs: number
  inputTokens: number
}

export const TONE_CRITERIA = {
  playful: 'casual banter, jokes or light small talk; the default when nothing else fits',
  sincere: 'a real worry, a serious topic, or a request for honest advice',
  domestic: 'food, cooking, meals, chores, home life, or looking after someone',
  flustered: 'a compliment, flirting, romance, or an embarrassing remark aimed at Roka',
  curious: 'something new or interesting is shared, or a topic worth exploring',
  annoyed: 'Roka is being teased, ignored, or treated rudely, or someone repeats something she dislikes',
  tender: 'someone is sad, lonely or hurting, or says something heartfelt and affectionate',
  confident: 'someone asks Roka for help or guidance, or for her to take charge',
  nostalgic: 'memories, the past, old times, or how things have changed',
  mischievous: 'pranks, schemes, dares, or playful plotting',
  sleepy: 'late-night chat, tiredness, or going to bed',
  competitive: 'games, challenges, contests, bets or rivalry'
} satisfies Record<ToneKey, string>

type BoundedAlias = {
  alias: string
  candidates: Array<{ userId: string; displayName: string }>
  members: Array<{ id: string; display_name: string }>
  userIds: Map<string, string>
}

function timeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'late night' {
  if (hour >= 5 && hour <= 11) return 'morning'
  if (hour >= 12 && hour <= 17) return 'afternoon'
  if (hour >= 18 && hour <= 21) return 'evening'
  return 'late night'
}

function boundedAliases(input: TurnJudgmentInput): BoundedAlias[] {
  return input.ambiguous.slice(0, 3).map(({ alias, candidates }, aliasIndex) => {
    const cappedCandidates = candidates.slice(0, 8)
    const userIds = new Map<string, string>()
    const members = cappedCandidates.map((candidate, candidateIndex) => {
      const id = `c${aliasIndex}_${candidateIndex}`
      userIds.set(id, candidate.userId)
      return { id, display_name: candidate.displayName }
    })
    return { alias, candidates: cappedCandidates, members, userIds }
  })
}

function warningDetails(kind: 'turn' | 'extraction', error: unknown) {
  const details = Object(error) as { constructor?: { name?: string }; status?: number }
  return { kind, errorName: details.constructor?.name ?? 'Error', status: details.status }
}

export async function judgeTurn(
  input: TurnJudgmentInput,
  options?: { signal?: AbortSignal }
): Promise<TurnJudgment | null> {
  try {
    if (!input.includeTone && input.ambiguous.length === 0) return null
    const client = getJevClient()
    if (!client) return null

    const aliases = boundedAliases(input)
    const questions: Questions = {}
    if (input.includeTone) {
      questions.tone = choice(
        'Which mood should Roka, a warm and teasing shopkeeper, reply to `message` in, given `recent_messages` and `time_of_day`?',
        TONE_CRITERIA
      )
    }
    for (const [index, alias] of aliases.entries()) {
      const criteria: Record<string, string> = {}
      for (const [candidateIndex, candidate] of alias.candidates.entries()) {
        criteria[`c${index}_${candidateIndex}`] = candidate.displayName
      }
      criteria.none = 'nobody in this server; the word is not a member here'
      criteria.unclear = 'a member is meant but it cannot be told which'
      questions[`referent_${index}`] = choice(
        `In \`message\`, which of the members listed for "${alias.alias}" in \`candidates\` does the speaker mean?`,
        criteria
      )
    }

    const state = {
      speaker: input.speakerName,
      message: input.message,
      recent_messages: input.recentLines.slice(-6),
      time_of_day: timeOfDay(getLocalHour()),
      ...(aliases.length > 0 ? { candidates: aliases.map(({ alias, members }) => ({ alias, members })) } : {})
    }
    const startedAt = performance.now()
    const result = await client.systemOne(
      { state, questions },
      { signal: options?.signal, timeout: config.jev.timeoutMs }
    )
    const latencyMs = performance.now() - startedAt
    const toneAnswer = result.answers.tone
    const tone =
      toneAnswer?.type === 'choice' && toneAnswer.choice in TONE_CRITERIA
        ? { tone: toneAnswer.choice as ToneKey, confidence: toneAnswer.confidence }
        : null
    const referents = aliases.map((alias, index) => {
      const answer = result.answers[`referent_${index}`]
      if (answer?.type !== 'choice') return { alias: alias.alias, userId: null, confidence: 0 }
      return {
        alias: alias.alias,
        userId: alias.userIds.get(answer.choice) ?? null,
        confidence: answer.confidence
      }
    })
    return { tone, referents, latencyMs, inputTokens: result.usage.input_tokens }
  } catch (error) {
    logger.warn(warningDetails('turn', error), 'Jev judgment failed')
    return null
  }
}

export async function judgeEpisodeAdmission(input: {
  lines: string[]
}): Promise<{ noul: number; confidence: null; latencyMs: number; inputTokens: number } | null> {
  try {
    const client = getJevClient()
    if (!client) return null

    const startedAt = performance.now()
    const result = await client.systemOne(
      {
        state: { messages: input.lines },
        questions: {
          lasting_fact: noul(
            'Do `messages` state a lasting fact about a member — their likes, life, work, relationships, plans or nickname — or a fact about the group such as an event, a plan, a place or a running joke, or correct something said earlier? Jokes, questions, greetings and passing moods do not count.'
          )
        }
      },
      { timeout: config.jev.memoryTimeoutMs }
    )
    const latencyMs = performance.now() - startedAt
    const answer = result.answers.lasting_fact
    if (answer?.type !== 'noul') return null
    return { noul: answer.noul, confidence: null, latencyMs, inputTokens: result.usage.input_tokens }
  } catch (error) {
    logger.warn(warningDetails('extraction', error), 'Jev judgment failed')
    return null
  }
}

export type MemoryVerification = {
  answers: Record<string, { noul: number; confidence: null }>
  latencyMs: number
  inputTokens: number
}

export async function judgeEpisodeOperations(input: {
  lines: string[]
  ops: readonly ExtractionOp[]
  existing: readonly MemoryClaim[]
}): Promise<MemoryVerification | null> {
  try {
    const client = getJevClient()
    if (!client) return null

    const questions: Questions = {}
    const questionKeys: string[] = []
    for (const [index, op] of input.ops.entries()) {
      if (op.op === 'noop') continue
      const durableKey = `durable_${index}`
      const attributedKey = `attributed_${index}`
      questions[durableKey] = noul(
        'Is this operation a lasting trait, preference, relationship or plan rather than a momentary state or an event that has already happened?'
      )
      questions[attributedKey] = noul(
        'Do the episode messages attribute this fact to the named user, rather than quoting, addressing or joking about them?'
      )
      questionKeys.push(durableKey, attributedKey)

      if (op.op === 'add') {
        const claims = input.existing.filter(
          (claim) => claim.subjectUserId === op.subject.userId && claim.predicate === op.predicate
        )
        for (const [claimIndex, claim] of claims.entries()) {
          const key = `same_as_${index}_${claimIndex}`
          questions[key] = noul(
            `Do the episode messages state the same fact about ${op.subject.userId} as existing claim #${claim.id}: ${claim.value}?`
          )
          questionKeys.push(key)
        }
      }
    }
    if (questionKeys.length === 0) return null

    const startedAt = performance.now()
    const result = await client.systemOne(
      {
        state: {
          messages: input.lines,
          operations: input.ops.map((op) => (op.op === 'noop' ? { ...op } : { ...op, subject: { ...op.subject } })),
          existing: input.existing.map(({ id, subjectUserId, predicate, value }) => ({
            id,
            subjectUserId,
            predicate,
            value
          }))
        },
        questions
      },
      { timeout: config.jev.memoryTimeoutMs }
    )
    const latencyMs = performance.now() - startedAt
    const answers: MemoryVerification['answers'] = {}
    for (const key of questionKeys) {
      const answer = result.answers[key]
      if (answer?.type !== 'noul' || !Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1) return null
      answers[key] = { noul: answer.noul, confidence: null }
    }
    return { answers, latencyMs, inputTokens: result.usage.input_tokens }
  } catch (error) {
    logger.warn(warningDetails('extraction', error), 'Jev judgment failed')
    return null
  }
}
