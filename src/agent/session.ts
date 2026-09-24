import { InMemorySessionService, createEvent } from '@google/adk'
import type { Event, GetSessionRequest, Session } from '@google/adk'
import type { Content, Part } from '@google/genai'
import { config } from '../config.js'
import { loadHistory } from '../storage/sessionStore.js'
import { logger } from '../utils/logger.js'
import { attachmentMarker } from './attachments.js'
import { abortActiveTurns } from './reliability.js'
import { beginShutdown } from './shutdownSignal.js'

/** Lets the harness pre-create the session generateResponse will look up (#52). */
export const APP_NAME = 'rokabot'

const sessionErrorCounts = new Map<string, number>()

export function clearSessionErrorCount(channelId: string): void {
  sessionErrorCounts.delete(channelId)
}

export function incrementSessionErrorCount(channelId: string): void {
  sessionErrorCounts.set(channelId, (sessionErrorCounts.get(channelId) ?? 0) + 1)
}

/** Caps history; attachment-retention tests use a real Runner because the test seam bypasses appendEvent. */
export class WindowedSessionService extends InMemorySessionService {
  // Keep original event references because getSession returns deep clones.
  private attachmentEvents = new Map<string, Event[]>()

  constructor(private maxEvents: number) {
    super()
  }

  override async getSession(request: GetSessionRequest): Promise<Session | undefined> {
    return super.getSession({
      ...request,
      config: { ...request?.config, numRecentEvents: this.maxEvents }
    })
  }

  override async appendEvent(request: Parameters<InMemorySessionService['appendEvent']>[0]): Promise<Event> {
    const appended = await super.appendEvent(request)
    if (request.event.content?.parts?.some((part: Part) => part.inlineData)) {
      const pending = this.attachmentEvents.get(request.session.id) ?? []
      pending.push(request.event)
      this.attachmentEvents.set(request.session.id, pending)
    }
    return appended
  }

  /** Replaces bytes after retries so future turns do not resend the upload. */
  stripAttachmentBytes(sessionId: string): number {
    const events = this.attachmentEvents.get(sessionId)
    this.attachmentEvents.delete(sessionId)
    if (!events) return 0

    let stripped = 0
    for (const event of events) {
      const parts = event.content?.parts
      if (!parts) continue
      for (let index = 0; index < parts.length; index++) {
        const inline = parts[index].inlineData
        if (!inline) continue
        parts[index] = { text: attachmentMarker(inline.mimeType ?? '') }
        stripped++
      }
    }
    return stripped
  }

  override async deleteSession(request: Parameters<InMemorySessionService['deleteSession']>[0]): Promise<void> {
    this.attachmentEvents.delete(request.sessionId)
    return super.deleteSession(request)
  }
}

// Exported so tests can assert attachment bytes are removed from retained history.
export const sessionService = new WindowedSessionService(config.session.windowSize * 2)

const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function resetIdleTimer(channelId: string): void {
  const existing = idleTimers.get(channelId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    logger.info({ channelId }, 'Session idle timeout')
    void destroySession(channelId)
  }, config.session.ttlMs)

  idleTimers.set(channelId, timer)
}

/** Channels whose next session rebuild must skip SQLite rehydration after a safety de-escalation */
const rehydrationSuppressed = new Set<string>()

export function suppressSessionRehydration(channelId: string): void {
  rehydrationSuppressed.add(channelId)
}

/** Retrieve or create an ADK session for the given channel */
export async function ensureSession(channelId: string) {
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
      state: {}
    })
    logger.info({ channelId }, 'ADK session created')

    try {
      // Skip reload after safety filtering to keep rejected history out of the new session.
      const prior = rehydrationSuppressed.has(channelId)
        ? []
        : loadHistory(channelId, config.session.windowSize, config.session.maxRehydrationAge)
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
  rehydrationSuppressed.delete(channelId)

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
  beginShutdown()
  abortActiveTurns()

  const channels = [...idleTimers.keys()]
  for (const channelId of channels) {
    await destroySession(channelId)
  }
  logger.info('All ADK sessions destroyed')
}
