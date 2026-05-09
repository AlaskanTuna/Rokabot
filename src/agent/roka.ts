/** ADK pipeline orchestrator for in-character response generation */

import { LlmAgent, Runner, InMemorySessionService, isFinalResponse, BasePlugin, createEvent } from '@google/adk'
import type { LlmResponse, Event } from '@google/adk'
import type { GetSessionRequest, Session } from '@google/adk'
import type { Content, Part } from '@google/genai'
import { logger } from '../utils/logger.js'
import { processImageForGemini } from '../utils/imageProcessor.js'
import { assembleSystemPrompt } from './promptAssembler.js'
import { detectTone } from './toneDetector.js'
import type { ToneKey } from './prompts/tones.js'
import type { WindowMessage } from '../session/types.js'
import { config } from '../config.js'
import { getLocalHour } from '../utils/timezone.js'
import { rokaTools } from './tools/index.js'
import { saveMessage, loadHistory, getChannelUsers } from '../storage/sessionStore.js'
import { getAllFactsForPrompt, refreshFactTimestamps } from '../storage/userMemory.js'
import { getAllUserNames } from '../storage/userNames.js'
import { getMessages as getBufferMessages } from './passiveBuffer.js'

export interface ImageAttachment {
  url: string
  contentType: string
}

interface GenerateOptions {
  channelId: string
  guildId: string
  userMessage: string
  displayName: string
  username: string
  userId: string
  imageAttachments?: ImageAttachment[]
}

export interface GenerateResult {
  text: string
  tone: ToneKey
}

const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024
const APP_NAME = 'rokabot'

const sessionErrorCounts = new Map<string, number>()
let toolCallsThisRequest: string[] = []

/** Caps event history returned by getSession to keep context within budget */
class WindowedSessionService extends InMemorySessionService {
  constructor(private maxEvents: number) {
    super()
  }

  override async getSession(request: GetSessionRequest): Promise<Session | undefined> {
    return super.getSession({
      ...request,
      config: { ...request?.config, numRecentEvents: this.maxEvents }
    })
  }
}

const sessionService = new WindowedSessionService(config.session.windowSize * 2)

const rokaAgent = new LlmAgent({
  name: 'roka',
  model: config.gemini.model,
  instruction: '',
  tools: [...rokaTools],
  disallowTransferToParent: true,
  disallowTransferToPeers: true,
  generateContentConfig: {
    temperature: 0.9,
    topP: 0.95,
    maxOutputTokens: config.gemini.maxOutputTokens,
    httpOptions: { timeout: config.gemini.timeout }
  },
  beforeModelCallback: async ({ context, request }) => {
    const prompt = context.state.get<string>('_systemPrompt')
    if (prompt) {
      request.config = request.config ?? ({} as NonNullable<typeof request.config>)
      request.config!.systemInstruction = prompt
    }
    return undefined
  },
  afterModelCallback: async ({ response }) => {
    if (!response.content?.parts) return undefined

    for (const part of response.content.parts) {
      if (part.text && !part.thought) {
        // Strip per-line leading whitespace — 4+ spaces or a tab makes Discord render the line as an indented code block
        part.text = part.text
          .replace(/^\[?Roka\]?:\s*/i, '')
          .replace(/^[ \t]+/gm, '')
          .trim()
      }
    }

    const hasText = response.content.parts.some((p) => p.text?.trim() && !p.thought)
    const hasFunctionCall = response.content.parts.some((p) => 'functionCall' in p && p.functionCall)
    if (!hasText && !hasFunctionCall) {
      logger.warn(
        {
          model: config.gemini.model,
          partKeys: response.content.parts.map((p) => Object.keys(p)),
          finishReason: (response as unknown as { finishReason?: string }).finishReason,
          usage: (response as unknown as { usageMetadata?: unknown }).usageMetadata
        },
        'Empty model response — replacing with fallback'
      )
      response.content.parts = [{ text: getRandomFallback() }]
    }

    return undefined
  },
  beforeToolCallback: async ({ tool, args }) => {
    logger.info({ tool: tool.name, args }, 'Tool call requested')
    toolCallsThisRequest.push(tool.name)
    return undefined
  }
})

/** Intercepts Gemini API errors and returns an in-character fallback */
class ErrorRecoveryPlugin extends BasePlugin {
  async onModelErrorCallback({
    error
  }: {
    callbackContext: unknown
    llmRequest: unknown
    error: Error
  }): Promise<LlmResponse | undefined> {
    logger.error(
      {
        model: config.gemini.model,
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      },
      'Gemini API error intercepted'
    )
    return { content: { role: 'model', parts: [{ text: getRandomFallback() }] } }
  }
}

const runner = new Runner({
  appName: APP_NAME,
  agent: rokaAgent,
  sessionService,
  plugins: [new ErrorRecoveryPlugin('error-recovery')]
})

const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

function resetIdleTimer(channelId: string): void {
  const existing = idleTimers.get(channelId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    logger.info({ channelId }, 'Session idle timeout')
    void destroySession(channelId)
  }, config.session.ttlMs)

  idleTimers.set(channelId, timer)
}

/** Retrieve or create an ADK session for the given channel */
async function ensureSession(channelId: string) {
  let session = await sessionService.getSession({
    appName: APP_NAME,
    userId: channelId,
    sessionId: channelId
  })

  if (!session) {
    session = await sessionService.createSession({
      appName: APP_NAME,
      userId: channelId,
      sessionId: channelId,
      state: { participants: [] }
    })
    logger.info({ channelId }, 'ADK session created')

    try {
      const prior = loadHistory(channelId, config.session.windowSize, config.session.maxRehydrationAge)
      if (prior.length > 0) {
        for (const msg of prior) {
          const role = msg.role === 'user' ? 'user' : 'model'
          const content: Content = {
            role,
            parts: [
              {
                text: msg.role === 'user' ? `[${msg.displayName}]: ${msg.content}` : msg.content
              }
            ]
          }
          const event = createEvent({
            author: msg.role === 'user' ? 'user' : 'roka',
            invocationId: `rehydrate-${channelId}`,
            content
          })
          await sessionService.appendEvent({ session, event })
        }
        session = (await sessionService.getSession({
          appName: APP_NAME,
          userId: channelId,
          sessionId: channelId
        }))!
        logger.info({ channelId, rehydratedMessages: prior.length }, 'Session rehydrated from SQLite')
      }
    } catch (error) {
      logger.warn({ channelId, error }, 'Failed to rehydrate session from SQLite')
    }
  }

  return session
}

/** Clear the idle timer and delete the ADK session for a channel */
export async function destroySession(channelId: string): Promise<void> {
  const timer = idleTimers.get(channelId)
  if (timer) {
    clearTimeout(timer)
    idleTimers.delete(channelId)
  }

  sessionErrorCounts.delete(channelId)

  try {
    await sessionService.deleteSession({
      appName: APP_NAME,
      userId: channelId,
      sessionId: channelId
    })
    logger.info({ channelId }, 'ADK session destroyed')
  } catch (error) {
    logger.debug({ channelId, error }, 'Session already destroyed or never existed')
  }
}

/** Destroy every active ADK session for graceful shutdown */
export async function destroyAllSessions(): Promise<void> {
  const channels = [...idleTimers.keys()]
  for (const channelId of channels) {
    await destroySession(channelId)
  }
  logger.info('All ADK sessions destroyed')
}

/** Download an image as base64, returning null if it fails or exceeds 4 MB */
async function downloadImage(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      logger.warn({ url, status: response.status }, 'Failed to download image')
      return null
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
      logger.warn({ url, size: contentLength }, 'Image exceeds 4 MB size limit, skipping')
      return null
    }

    const buffer = await response.arrayBuffer()

    if (buffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
      logger.warn({ url, size: buffer.byteLength }, 'Image exceeds 4 MB size limit, skipping')
      return null
    }

    const rawBuffer = Buffer.from(buffer)
    const processed = await processImageForGemini(rawBuffer)
    const base64 = processed.data.toString('base64')
    return { data: base64, mimeType: processed.mimeType }
  } catch (error) {
    logger.warn({ url, error }, 'Error downloading image')
    return null
  }
}

const KNOWN_FALLBACKS = new Set([
  'Hmm? Sorry, I spaced out for a moment there~',
  'Ah, what was that? I got distracted by something.',
  'Ahaha, my mind wandered. Say that again?',
  "I wasn't paying attention... don't tell anyone, okay?"
])

function getRandomFallback(): string {
  const fallbacks = [...KNOWN_FALLBACKS]
  return fallbacks[Math.floor(Math.random() * fallbacks.length)]
}

/** Convert ADK session events to WindowMessages for tone detection */
function eventsToWindowMessages(events: Event[]): WindowMessage[] {
  return events
    .filter((e) => e.content?.parts?.some((p: Part) => p.text && !p.thought))
    .map((e) => ({
      role: (e.author === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      displayName: '',
      content: (e.content?.parts ?? [])
        .filter((p: Part) => p.text && !p.thought)
        .map((p: Part) => p.text)
        .join(' '),
      timestamp: e.timestamp ?? 0
    }))
}

/** Generate an in-character response using the ADK agent pipeline
 * @param options - Channel ID, user message, display name, and optional image attachments
 * @returns Response text and detected tone
 */
export async function generateResponse(options: GenerateOptions): Promise<GenerateResult> {
  const { channelId, guildId, userMessage, displayName, username, userId, imageAttachments } = options

  toolCallsThisRequest = []

  const session = await ensureSession(channelId)
  resetIdleTimer(channelId)

  const storedParticipants = (session.state?.participants as string[]) ?? []
  const participants = [...new Set([...storedParticipants, displayName])]

  const fakeMessages = eventsToWindowMessages(session.events ?? [])
  const hour = getLocalHour()
  const tone = detectTone(fakeMessages, hour)

  let systemPrompt = assembleSystemPrompt({ tone, participants, hour, displayName })

  try {
    // Resolve user identities from persistent lookup table (survives restarts)
    const knownUsers = getAllUserNames()

    // Also pull channel-specific users from session history (has channel context)
    const channelUsers = getChannelUsers(channelId, config.session.windowSize)
    for (const [uid, user] of channelUsers) {
      if (!knownUsers.has(uid) && user.username) {
        knownUsers.set(uid, { userId: uid, username: user.username, displayName: user.displayName })
      }
    }

    // Ensure current speaker is included
    knownUsers.set(userId, { userId, username, displayName })

    const factLines: string[] = []
    for (const [uid, user] of knownUsers) {
      const facts = getAllFactsForPrompt(guildId, uid)
      if (facts) {
        const label = user.username !== user.displayName
          ? `${user.username} (${user.displayName})`
          : user.displayName
        factLines.push(`- ${label}: ${facts}`)
        refreshFactTimestamps(guildId, uid)
      }
    }
    if (factLines.length > 0) {
      systemPrompt += `\n\n## What You Remember About People In This Channel\n${factLines.join('\n')}`
      logger.info({ channelId, usersWithFacts: factLines.length, totalUsers: knownUsers.size }, 'User facts injected into prompt')
    }
  } catch (error) {
    logger.warn({ userId, error }, 'Failed to load user memory for prompt injection')
  }

  const overheard = getBufferMessages(channelId).slice(-config.memory.contextSize)
  if (overheard.length > 0) {
    const overheardText = overheard.map((m) => `[${m.displayName}]: ${m.content}`).join('\n')
    systemPrompt += `\n\n## Recent Channel Activity (messages you overheard)\n${overheardText}`
  }

  systemPrompt +=
    `\n\n- The current user's Discord ID is "${userId}".` +
    ' Use this ID (not their name) when calling remember_user or recall_user tools.'

  logger.debug({ tone, participantCount: participants.length, hour }, 'Prompt assembled')

  const imageParts: Part[] = []
  if (imageAttachments?.length) {
    const downloads = await Promise.all(imageAttachments.map((img) => downloadImage(img.url)))
    for (const result of downloads) {
      if (result) {
        imageParts.push({ inlineData: { data: result.data, mimeType: result.mimeType } })
      }
    }
    if (imageParts.length > 0) {
      logger.debug({ imageCount: imageParts.length }, 'Attached images to request')
    }
  }

  const newMessage: Content = {
    role: 'user',
    parts: [...imageParts, { text: `[${displayName}]: ${userMessage}` }]
  }

  logger.debug(
    { model: config.gemini.model, sessionEvents: session.events?.length ?? 0, hasImages: imageParts.length > 0 },
    'Sending ADK request'
  )

  const MAX_RETRIES = config.gemini.maxRetries
  const BASE_DELAY_MS = config.gemini.baseRetryDelay

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let responseText = ''
      let eventCount = 0
      let lastFinalEventPartKeys: string[][] = []
      const abortController = new AbortController()
      const timeoutId = setTimeout(() => abortController.abort(), config.gemini.timeout)

      try {
        for await (const event of runner.runAsync({
          userId: channelId,
          sessionId: channelId,
          newMessage,
          stateDelta: { _systemPrompt: systemPrompt, participants, _userId: userId, _channelId: channelId, _guildId: guildId },
          runConfig: { maxLlmCalls: config.gemini.maxLlmCalls }
        })) {
          eventCount += 1
          if (abortController.signal.aborted) break
          if (isFinalResponse(event) && event.content?.parts) {
            lastFinalEventPartKeys = event.content.parts.map((p: Part) => Object.keys(p))
            responseText = event.content.parts
              .filter((p: Part) => p.text && !p.thought)
              .map((p: Part) => p.text)
              .join('')
              .trim()
          }
        }
      } finally {
        clearTimeout(timeoutId)
      }

      if (abortController.signal.aborted && !responseText) {
        logger.warn({ channelId, model: config.gemini.model, eventCount }, 'Client-side timeout triggered for ADK runner')
        responseText = getRandomFallback()
      }

      if (!responseText) {
        logger.warn(
          { channelId, model: config.gemini.model, eventCount, lastFinalEventPartKeys, attempt },
          'Runner produced no usable text — using fallback'
        )
        responseText = getRandomFallback()
      }

      if (KNOWN_FALLBACKS.has(responseText)) {
        const errorCount = (sessionErrorCounts.get(channelId) ?? 0) + 1
        sessionErrorCounts.set(channelId, errorCount)

        if (errorCount >= 2) {
          logger.warn(
            { channelId, errorCount },
            'Consecutive fallbacks detected, destroying session to prevent corruption'
          )
          await destroySession(channelId)
          sessionErrorCounts.delete(channelId)
        } else {
          logger.warn({ channelId, errorCount }, 'Fallback response detected, preserving session (first occurrence)')
        }
      }

      if (!KNOWN_FALLBACKS.has(responseText)) {
        sessionErrorCounts.delete(channelId)
      }

      if (toolCallsThisRequest.length > 1) {
        logger.info({ tools: toolCallsThisRequest }, 'Tool fallback chain detected')
      }

      if (!KNOWN_FALLBACKS.has(responseText)) {
        try {
          saveMessage(channelId, 'user', displayName, userMessage, userId, username)
          saveMessage(channelId, 'assistant', 'Roka', responseText)
        } catch (error) {
          logger.warn({ channelId, error }, 'Failed to persist messages to SQLite')
        }
      }

      logger.debug({ responseLength: responseText.length }, 'ADK response extracted')
      return { text: responseText, tone }
    } catch (error) {
      const errDetail =
        error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error

      const errorMsg = error instanceof Error ? error.message : String(error)
      const isTransient =
        /429|500|503|RESOURCE_EXHAUSTED|overloaded|quota|rate.limit|unavailable|EAI_AGAIN|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
          errorMsg
        )

      if (isTransient && attempt < MAX_RETRIES) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt)
        logger.warn(
          { channelId, attempt: attempt + 1, maxRetries: MAX_RETRIES, delayMs, errorMessage: errorMsg },
          'Transient API error, retrying with exponential backoff'
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        continue
      }

      logger.error({ error: errDetail, channelId, attempt: attempt + 1 }, 'ADK request failed')

      if (error instanceof SyntaxError) {
        logger.warn({ channelId }, 'Session likely corrupted, destroying for recovery')
        await destroySession(channelId)
      }

      throw error
    }
  }

  throw new Error('Exhausted all retry attempts')
}
