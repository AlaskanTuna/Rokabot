/** Background memory extraction from passive conversation buffers */

import { GoogleGenAI } from '@google/genai'
import { config } from '../config.js'
import { getFacts, saveFact } from '../storage/userMemory.js'
import { logger } from '../utils/logger.js'
import { getSharedRateLimiter } from '../utils/rateLimiter.js'
import { classifyGeminiFailure, computeBackoff } from './geminiReliability.js'
import { type BufferedMessage, getMessages } from './passiveBuffer.js'
import { isShuttingDown } from './shutdownSignal.js'

const messageCounts = new Map<string, number>() // channelId → messages since last extraction

let lastExtractionTime = 0
let genaiClient: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!genaiClient) {
    genaiClient = new GoogleGenAI({ apiKey: config.gemini.apiKey })
  }
  return genaiClient
}

const EXTRACTION_PROMPT = `You are a fact extractor. Given a conversation, extract personal details and behavioral signals about the USERS (not the bot/assistant).

Extract generously — even small or indirect clues count. Categories:
- Identity: nicknames, gender, height, nationality, language spoken
- Lifestyle: pets, daily routine, diet
- Interests: games, anime, music, shows, hobbies, sports, things they mention enjoying or disliking
- Social: relationships, who they hang out with, friend groups, how they talk to others
- Personality: humor style, catchphrases, recurring jokes, teasing habits, communication style
- Opinions: strong likes/dislikes, preferences, things they recommend or complain about

NEVER extract sensitive personal information:
- Real names, full names, or legal names
- Age, date of birth, or birthday
- Home address, city, postal code, or specific location of residence
- Phone numbers, email addresses, or social media handles
- School or workplace names
- Financial information, passwords, or credentials
- Medical conditions or health details

Guidelines:
- Infer from context: "I just got home from work" → general_occupation: office worker (NOT the company name)
- Capture opinions: "ugh I hate horror games" → dislikes: horror games
- Capture habits: if someone always greets in Japanese → communication_style: uses Japanese greetings
- SKIP momentary/temporary states that will be irrelevant tomorrow: "going to sleep", "going home", "feeling bored", "using Instagram right now", "experiencing a tech issue", current moods, what someone is doing at this exact moment
- SKIP single-use reactions to the conversation itself
- SKIP facts about the bot/assistant
- Only extract things that would still be true or relevant a week from now
- Each fact: user's display name (from [Name] prefix), a descriptive snake_case key, and the value
- When uncertain, still extract with the value reflecting the uncertainty ("probably a student")

Return ONLY a JSON array:
[{"userId":"Alice","key":"currently_watching","value":"Dandadan"},{"userId":"Bob","key":"dislikes","value":"horror games"}]
Or if none: []

Conversation:
`

interface ExtractedFact {
  userId: string
  key: string
  value: string
}

/** Increment message counter and trigger extraction when threshold is reached */
export function maybeExtractFromBuffer(channelId: string, botUserId?: string, guildId?: string): void {
  if (isShuttingDown()) return

  const count = (messageCounts.get(channelId) ?? 0) + 1
  messageCounts.set(channelId, count)

  if (count < config.memory.extractionInterval) return

  const now = Date.now()
  if (now - lastExtractionTime < config.memory.extractionGapMs) {
    logger.debug({ channelId }, 'Memory extraction skipped (too recent)')
    return
  }

  messageCounts.set(channelId, 0)
  lastExtractionTime = now

  const messages = [...getMessages(channelId)]
  void runBufferExtraction(channelId, messages, botUserId, guildId).catch((error) => {
    logger.warn({ channelId, error }, 'Passive buffer memory extraction failed')
  })
}

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

async function generateExtraction(channelId: string, prompt: string): Promise<string | undefined> {
  const limiter = getSharedRateLimiter(config.rateLimit)

  for (let attempt = 0; attempt <= config.gemini.extractionMaxRetries; attempt++) {
    if (isShuttingDown()) return undefined

    if (!limiter.tryConsumeAboveFloor(config.gemini.extractionRpmFloor)) {
      logger.debug({ channelId }, 'Memory extraction skipped (RPM floor)')
      return undefined
    }

    try {
      const response = await getClient().models.generateContent({
        model: config.gemini.extractionModel,
        contents: prompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 400,
          httpOptions: { timeout: 15_000 }
        }
      })

      const text = response.text?.trim()
      if (!text) {
        logger.debug({ channelId }, 'Memory extraction returned no text')
        return undefined
      }

      return text
    } catch (error) {
      const failure = classifyGeminiFailure(error)
      const canRetry = failure.kind === 'transient_http' || failure.kind === 'network'

      if (!canRetry || attempt >= config.gemini.extractionMaxRetries) {
        logger.warn({ channelId, error }, 'Memory extraction Gemini call failed')
        return undefined
      }

      await waitForRetry(
        computeBackoff(attempt, config.gemini.retryBackoffBaseMs, {
          maxMs: config.gemini.retryBackoffCapMs
        })
      )
    }
  }

  return undefined
}

/** Run extraction from the passive buffer messages */
async function runBufferExtraction(
  channelId: string,
  messages: BufferedMessage[],
  botUserId?: string,
  guildId?: string
): Promise<void> {
  const conversationText = messages.map((m) => `[${m.displayName}]: ${m.content}`).join('\n')

  if (!conversationText.trim()) return

  const prompt = EXTRACTION_PROMPT + conversationText

  // Case-insensitive map so LLM name variations ("hiro" vs "Hiro") still resolve
  const userMap = new Map<string, string>()
  for (const m of messages) {
    userMap.set(m.displayName.toLowerCase(), m.userId)
  }

  try {
    const text = await generateExtraction(channelId, prompt)
    if (!text) return

    const facts = parseFacts(text)
    if (facts.length === 0) {
      logger.info({ channelId }, 'Memory extraction complete — no facts found')
      return
    }

    let savedCount = 0
    for (const fact of facts) {
      const resolvedUserId = userMap.get(fact.userId.toLowerCase())
      if (!resolvedUserId) {
        logger.debug({ name: fact.userId, channelId }, 'Skipping fact — display name not found in userMap')
        continue
      }
      if (botUserId && resolvedUserId === botUserId) continue
      const effectiveGuildId = guildId ?? 'global'
      const existingFacts = getFacts(effectiveGuildId, resolvedUserId)
      const alreadyExists = existingFacts.some((f) => f.key === fact.key && f.value === fact.value)
      if (!alreadyExists) {
        saveFact(effectiveGuildId, resolvedUserId, fact.key, fact.value)
        savedCount++
      }
    }

    if (savedCount > 0) {
      logger.info(
        { channelId, extracted: facts.length, saved: savedCount },
        'Passive buffer memory extraction complete'
      )
    }
  } catch (error) {
    logger.warn({ channelId, error }, 'Memory extraction Gemini call failed')
  }
}

/** Parse the JSON array from the LLM response */
function parseFacts(text: string): ExtractedFact[] {
  try {
    let cleaned = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '')
    cleaned = cleaned.trim()

    if (cleaned === '[]' || !cleaned.startsWith('[')) return []

    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      (f: unknown): f is ExtractedFact =>
        typeof f === 'object' &&
        f !== null &&
        typeof (f as ExtractedFact).userId === 'string' &&
        typeof (f as ExtractedFact).key === 'string' &&
        typeof (f as ExtractedFact).value === 'string' &&
        (f as ExtractedFact).key.length > 0 &&
        (f as ExtractedFact).value.length > 0
    )
  } catch {
    logger.debug({ text }, 'Failed to parse memory extraction response')
    return []
  }
}

/** Reset state for testing */
export function resetCounters(): void {
  lastExtractionTime = 0
  messageCounts.clear()
}

/** Exposed for testing */
export { parseFacts as _parseFacts }
