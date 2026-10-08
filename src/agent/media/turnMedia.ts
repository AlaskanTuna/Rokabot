import type { Part } from '@google/genai'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { measureAttachmentTokens } from '../attachmentCost.js'
import { type ImageAttachment, downloadAttachment, prepareAttachments } from '../attachments.js'
import { formatClock, renderCompactDigest, renderDigestBlock } from './digest.js'
import { durationFromTokens, mp4DurationSec } from './duration.js'
import { planCoverage, planFocus } from './plan.js'
import type { CoveragePlan, MediaDigest, MediaKind } from './types.js'
import { type WatchSource, countUriTokens, watchMedia } from './watch.js'

export interface PreparedTurnMedia {
  /** Image and PDF parts for ADK, exactly as prepareAttachments returns them. */
  directParts: Part[]
  /** One text part per watched item (its digest) or per item that could not be watched (a notice). */
  mediaTextParts: Part[]
  /** Full digest block → compact digest, so session history keeps only the compact form. */
  compactions: Map<string, string>
  /** Compact digests, appended to the saved user message so rehydration keeps them. */
  compactDigests: string[]
  digests: MediaDigest[]
  watcherCalls: number
  /** Image tokens plus the watcher's billed prompt tokens. */
  mediaTokens: number
  droppedAttachments: number
  truncatedAttachments: number
  refusedAttachments: number
}

// countTokens on a YouTube URI is a measured estimate, not the bill, so a duration derived from it is planned
// against a smaller budget rather than stretched: the timeline bins stay on the real video.
const ESTIMATED_DURATION_HEADROOM = 1.15
const DURATION_COUNT_FPS = 0.05
// A count that small is the prompt without the video (Gemini omitted the media), not a few-second clip; read
// as a duration it would wave a long video through admission at full frame rate.
const MIN_URI_COUNT_TOKENS = 200
// Up to this length the whole video already plays at one frame per second.
const FOCUS_MIN_DURATION_SEC = 120
const ISOBMFF_TYPES = new Set(['video/mp4', 'video/mov', 'video/quicktime', 'video/3gpp'])

function watchableKind(contentType: string): MediaKind | null {
  if (contentType.startsWith('audio/')) return 'audio'
  if (contentType.startsWith('video/')) return 'video'
  return null
}

function labelFor(attachment: ImageAttachment, kind: MediaKind): string {
  if (attachment.transport === 'uri') return 'YouTube video'
  // Discord states a duration only for voice messages.
  if (kind === 'audio') return attachment.durationSec !== undefined ? 'voice message' : 'audio clip'
  return 'video'
}

function notice(label: string, outcome: string): Part {
  const article = /^[aeiou]/i.test(label) ? 'An' : 'A'
  return { text: `[${article} ${label} was shared, but ${outcome}.]` }
}

type Prepared = { status: 'ready'; source: WatchSource; plan: CoveragePlan; opening: boolean } | { status: 'dropped' }

async function prepareUri(attachment: ImageAttachment, label: string): Promise<Prepared> {
  let durationSec = attachment.durationSec ?? null
  let budgetTokens = config.gemini.maxAttachmentTokens
  if (durationSec === null) {
    const tokens = await countUriTokens(attachment.url, DURATION_COUNT_FPS)
    durationSec =
      tokens === undefined || tokens < MIN_URI_COUNT_TOKENS
        ? null
        : durationFromTokens({ tokens, kind: 'video', fps: DURATION_COUNT_FPS })
    budgetTokens = Math.floor(budgetTokens / ESTIMATED_DURATION_HEADROOM)
  }

  return {
    status: 'ready',
    source: { transport: 'uri', kind: 'video', fileUri: attachment.url, mimeType: 'video/mp4', label },
    // A short video is cheaper to watch whole at full density than to watch around one moment.
    plan:
      attachment.startSec !== undefined && durationSec !== null && durationSec > FOCUS_MIN_DURATION_SEC
        ? planFocus({ durationSec, startSec: attachment.startSec, budgetTokens })
        : planCoverage({
            kind: 'video',
            durationSec,
            budgetTokens,
            canSkim: true,
            skimClips: config.media.skimClips,
            skimClipSeconds: config.media.skimClipSeconds
          }),
    opening: false
  }
}

async function prepareInline(attachment: ImageAttachment, kind: MediaKind, label: string): Promise<Prepared> {
  const download = await downloadAttachment(attachment)
  if (!download) return { status: 'dropped' }

  let durationSec = attachment.durationSec ?? null
  if (durationSec === null && download.bytes && ISOBMFF_TYPES.has(attachment.contentType)) {
    durationSec = mp4DurationSec(download.bytes)
  }
  // Stated and header durations describe the whole file, but only its opening arrived.
  if (durationSec !== null && download.truncated && download.bytes && attachment.size) {
    durationSec = (durationSec * download.bytes.length) / attachment.size
  }
  if (durationSec === null) {
    const tokens = await measureAttachmentTokens([{ inlineData: { data: download.data, mimeType: download.mimeType } }])
    durationSec = tokens === undefined ? null : durationFromTokens({ tokens, kind })
  }

  return {
    status: 'ready',
    source: {
      transport: 'inline',
      kind,
      mimeType: download.mimeType,
      data: download.data,
      label,
      ...(attachment.silent ? { silent: true } : {})
    },
    plan: planCoverage({
      kind,
      durationSec,
      budgetTokens: config.gemini.maxAttachmentTokens,
      // Each clip of an inline file would resend its whole bytes.
      canSkim: false,
      skimClips: config.media.skimClips,
      skimClipSeconds: config.media.skimClipSeconds
    }),
    opening: download.truncated
  }
}

async function watchOne(
  attachment: ImageAttachment,
  kind: MediaKind,
  input: { channelId: string; focus: string; mayRetry: () => boolean; geminiUnavailable?: boolean },
  result: PreparedTurnMedia
): Promise<void> {
  const label = labelFor(attachment, kind)
  // Only Gemini can watch; while turns are pinned to the fallback model, waiting on it would only add delay.
  if (input.geminiUnavailable) {
    result.mediaTextParts.push(notice(label, "it couldn't be watched right now"))
    return
  }
  const prepared =
    attachment.transport === 'uri' ? await prepareUri(attachment, label) : await prepareInline(attachment, kind, label)

  if (prepared.status === 'dropped') {
    result.droppedAttachments += 1
    return
  }
  const { source, plan, opening } = prepared
  if (opening) result.truncatedAttachments += 1

  if (plan.mode === 'decline') {
    result.mediaTextParts.push(
      notice(
        label,
        plan.reason === 'too_long' && plan.durationSec !== null
          ? `at about ${formatClock(plan.durationSec)} it is too long to watch in one go`
          : "it couldn't be opened"
      )
    )
    logger.info(
      { channelId: input.channelId, kind, transport: source.transport, mode: 'decline', reason: plan.reason },
      'Watched media'
    )
    return
  }

  const watchStartedAt = Date.now()
  const watched = await watchMedia({
    source,
    plan,
    focus: input.focus,
    // A retry is a second full watch; only worth it when the first failed fast.
    mayRetry: () => Date.now() - watchStartedAt < config.media.watchTimeoutMs / 2 && input.mayRetry(),
    opening
  })
  result.watcherCalls += watched.calls

  if (watched.status === 'ok') {
    const block = renderDigestBlock(watched.digest)
    const compact = renderCompactDigest(watched.digest)
    result.mediaTextParts.push({ text: block })
    result.compactions.set(block, compact)
    result.compactDigests.push(compact)
    result.digests.push(watched.digest)
    result.mediaTokens += watched.promptTokens
  } else {
    result.mediaTextParts.push(
      notice(label, watched.reason === 'unavailable' ? "it couldn't be opened" : "it couldn't be watched right now")
    )
    // Billed even though unusable; a timed-out request may have been processed in full.
    result.mediaTokens += watched.promptTokens ?? (watched.reason === 'timeout' ? plan.estimate : 0)
  }

  logger.info(
    {
      channelId: input.channelId,
      kind,
      transport: source.transport,
      mode: opening ? 'opening' : plan.mode,
      durationSec: Math.round(plan.durationSec),
      fps: plan.mode === 'whole' ? plan.fps : null,
      estimate: plan.estimate,
      promptTokens: watched.status === 'ok' ? watched.promptTokens : undefined,
      watchMs: watched.watchMs,
      calls: watched.calls,
      outcome: watched.status === 'ok' ? 'ok' : watched.reason
    },
    'Watched media'
  )
}

/** Turn a turn's attachments into model parts, watching audio and video into digests first. */
export async function prepareTurnMedia(input: {
  channelId: string
  attachments: ImageAttachment[] | undefined
  focus: string
  mayRetry: () => boolean
  /** True while turns are pinned to the fallback model, which cannot watch. */
  geminiUnavailable?: boolean
}): Promise<PreparedTurnMedia> {
  const attachments = input.attachments ?? []
  const watchable = config.media.watch
    ? attachments.flatMap((attachment) => {
        const kind = watchableKind(attachment.contentType)
        return kind ? [{ attachment, kind }] : []
      })
    : []
  const direct = attachments.filter((attachment) => !watchable.some((item) => item.attachment === attachment))

  const prepared = await prepareAttachments(input.channelId, direct.length > 0 ? direct : undefined)
  const result: PreparedTurnMedia = {
    directParts: prepared.imageParts,
    mediaTextParts: [],
    compactions: new Map(),
    compactDigests: [],
    digests: [],
    watcherCalls: 0,
    mediaTokens: prepared.imageTokens,
    droppedAttachments: prepared.droppedAttachments,
    truncatedAttachments: prepared.truncatedAttachments,
    refusedAttachments: prepared.refusedAttachments
  }

  for (const { attachment, kind } of watchable) await watchOne(attachment, kind, input, result)
  return result
}
