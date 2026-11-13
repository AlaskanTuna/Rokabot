import type { Part } from '@google/genai'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { remainingTokensThisMinute } from '../llm/tokenBudget.js'
import { measureAttachmentTokens } from './attachmentCost.js'
import { geminiMimeType, isStreamedUpload } from './attachmentLimits.js'
import { type MediaAttachment, downloadAttachment, prepareAttachments } from './attachments.js'
import { bytesContentKey, discordAttachmentContentKey } from './contentKey.js'
import { formatClock, mergeHalves, renderCompactDigest, renderDigestBlock, watchOutcomeFor } from './digest.js'
import { durationFromTokens, mp4DurationSec } from './duration.js'
import { type UploadedFile, deleteFile, streamToFiles } from './filesUpload.js'
import { ESTIMATED_DURATION_HEADROOM, type MediaMemoryScope, recordShare, remember, remembered } from './mediaCache.js'
import {
  HALVES_MAX_DURATION_SEC,
  HALVES_MIN_DURATION_SEC,
  type HalvesPlan,
  planCoverage,
  planFocus,
  planHalves
} from './plan.js'
import type { CoveragePlan, MediaClip, MediaDigest, MediaKind, WatchOutcome } from './types.js'
import { type WatchResult, type WatchSource, countUriTokens, watchMedia } from './watch.js'

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
  /** The first audio or video item's outcome, so the footer can say whether she really watched it. */
  watchOutcome: WatchOutcome | null
}

function noteOutcome(result: PreparedTurnMedia, outcome: WatchOutcome): void {
  result.watchOutcome ??= outcome
}

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

function labelFor(attachment: MediaAttachment, kind: MediaKind): string {
  if (attachment.transport === 'uri') return 'YouTube video'
  // Discord states a duration only for voice messages.
  if (kind === 'audio') return attachment.durationSec !== undefined ? 'voice message' : 'audio clip'
  return 'video'
}

function notice(label: string, outcome: string): Part {
  const article = /^[aeiou]/i.test(label) ? 'An' : 'A'
  return { text: `[${article} ${label} was shared, but ${outcome}.]` }
}

type Prepared =
  | {
      status: 'ready'
      source: WatchSource
      plan: CoveragePlan
      opening: boolean
      budgetTokens: number
      bytes?: Buffer
      file?: UploadedFile
    }
  | { status: 'dropped' }

function present(result: PreparedTurnMedia, digest: MediaDigest): void {
  const block = renderDigestBlock(digest)
  const compact = renderCompactDigest(digest)
  result.mediaTextParts.push({ text: block })
  result.compactions.set(block, compact)
  result.compactDigests.push(compact)
  result.digests.push(digest)
}

async function prepareUri(attachment: MediaAttachment, label: string): Promise<Prepared> {
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
    opening: false,
    budgetTokens
  }
}

async function prepareInline(attachment: MediaAttachment, kind: MediaKind, label: string): Promise<Prepared> {
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
    const tokens = await measureAttachmentTokens(
      [{ inlineData: { data: download.data, mimeType: download.mimeType } }],
      'gemini'
    )
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
    opening: download.truncated,
    budgetTokens: config.gemini.maxAttachmentTokens,
    bytes: download.bytes
  }
}

async function prepareFiles(
  attachment: MediaAttachment & { size: number },
  kind: MediaKind,
  label: string
): Promise<Prepared> {
  const file = await streamToFiles({
    sourceUrl: attachment.url,
    mimeType: geminiMimeType(attachment.contentType),
    size: attachment.size,
    deadlineMs: config.media.uploadTimeoutMs
  })
  if (!file) return { status: 'dropped' }

  let durationSec = attachment.durationSec ?? file.durationSec
  if (durationSec === null) {
    const tokens = await countUriTokens(file.uri, DURATION_COUNT_FPS, file.mimeType)
    durationSec =
      tokens === undefined || tokens < MIN_URI_COUNT_TOKENS
        ? null
        : durationFromTokens({ tokens, kind, fps: DURATION_COUNT_FPS })
  }

  return {
    status: 'ready',
    source: {
      transport: 'files',
      kind,
      fileUri: file.uri,
      mimeType: file.mimeType,
      label,
      ...(attachment.silent ? { silent: true } : {})
    },
    plan: planCoverage({
      kind,
      durationSec,
      budgetTokens: config.gemini.maxAttachmentTokens,
      canSkim: kind === 'video',
      skimClips: config.media.skimClips,
      skimClipSeconds: config.media.skimClipSeconds
    }),
    opening: false,
    budgetTokens: config.gemini.maxAttachmentTokens,
    file
  }
}

/**
 * The two halves to watch in place of a skim (or a decline) of a 20 to 40 minute video, when the minute's tokens
 * carry both and the turn's model calls still leave ADK at least two after the two watches.
 */
function halvesFor(source: WatchSource, plan: CoveragePlan, budgetTokens: number): HalvesPlan | null {
  if (source.transport === 'inline' || source.kind !== 'video') return null
  const shortened = plan.mode === 'skim' || (plan.mode === 'decline' && plan.reason === 'too_long')
  if (!shortened || plan.durationSec === null) return null
  if (plan.durationSec <= HALVES_MIN_DURATION_SEC || plan.durationSec > HALVES_MAX_DURATION_SEC) return null
  if (config.gemini.maxLlmCalls - 2 < 2) return null

  const halves = planHalves({ durationSec: plan.durationSec, budgetTokens })
  if (!halves || remainingTokensThisMinute() < 2 * halves.halfEstimate) return null
  return halves
}

/** Watches both halves at once. Calls and billed tokens count whether or not a half produced a usable digest. */
async function watchHalves(
  source: WatchSource,
  halves: HalvesPlan,
  input: { focus: string },
  result: PreparedTurnMedia
): Promise<{ digest: MediaDigest | null; watched: WatchResult[] }> {
  const watched = await Promise.all(
    halves.halves.map(({ plan, window }) =>
      watchMedia({
        source,
        plan,
        window,
        focus: input.focus,
        // Two halves already take two of the turn's reserved calls; a retry would eat ADK's. A failed half
        // leaves the other as a partial digest instead.
        mayRetry: () => false,
        opening: false
      })
    )
  )

  for (const [index, outcome] of watched.entries()) {
    result.watcherCalls += outcome.calls
    if (outcome.status === 'ok') {
      result.mediaTokens += outcome.promptTokens
    } else {
      // Billed even though unusable; a timed-out request may have been processed in full.
      result.mediaTokens +=
        outcome.promptTokens ?? (outcome.reason === 'timeout' ? halves.halves[index].plan.estimate : 0)
    }
  }

  const [first, second] = watched.map((outcome) => (outcome.status === 'ok' ? outcome.digest : null))
  return { digest: mergeHalves(first, second, halves.halves[0].plan.durationSec), watched }
}

interface WatchInput {
  channelId: string
  focus: string
  mayRetry: () => boolean
  memoryScope?: MediaMemoryScope | null
}

/** A watcher either presented the item, or says why not; a null notice is a download that never arrived. */
type Attempt = { ok: true } | { ok: false; notice: string | null }

interface WatchContext {
  attachment: MediaAttachment
  kind: MediaKind
  label: string
  input: WatchInput
  result: PreparedTurnMedia
  scope: MediaMemoryScope | null
  contentKey: string | undefined
  reuse: (hit: { id: number; digest: MediaDigest }) => void
}

const UNWATCHABLE = "it couldn't be watched right now"
const SWITCHED_OFF = 'watching and listening are switched off right now'

async function watchOne(
  attachment: MediaAttachment,
  kind: MediaKind,
  input: WatchInput,
  result: PreparedTurnMedia
): Promise<void> {
  const label = labelFor(attachment, kind)
  const scope = input.memoryScope ?? null
  let contentKey = scope ? attachment.contentKey : undefined
  // A streamed upload has no bytes to hash until it is uploaded, so its Discord path stands in as the key.
  if (scope && !contentKey && isStreamedUpload(attachment, config.media.maxStreamedUploadBytes)) {
    contentKey = discordAttachmentContentKey(attachment.url) ?? undefined
  }
  const reuse = (hit: { id: number; digest: MediaDigest }) => {
    present(result, hit.digest)
    noteOutcome(result, { status: 'remembered', kind })
    recordShare(scope!, attachment, hit.id)
    logger.info({ channelId: input.channelId, kind, outcome: 'remembered' }, 'Watched media')
  }
  const linkHit = scope && contentKey ? remembered(scope, contentKey) : null
  if (linkHit) return reuse(linkHit)

  const context: WatchContext = { attachment, kind, label, input, result, scope, contentKey, reuse }
  const attempt = await watchWithGemini(context)
  if (attempt.ok) return
  noteOutcome(result, { status: 'failed', kind })
  if (attempt.notice === null) result.droppedAttachments += 1
  else result.mediaTextParts.push(notice(label, attempt.notice))
}

async function watchWithGemini(context: WatchContext): Promise<Attempt> {
  const { attachment, kind, label, input, result, scope, reuse } = context
  let { contentKey } = context
  const prepared =
    attachment.transport === 'uri'
      ? await prepareUri(attachment, label)
      : isStreamedUpload(attachment, config.media.maxStreamedUploadBytes)
        ? await prepareFiles(attachment, kind, label)
        : await prepareInline(attachment, kind, label)

  if (prepared.status === 'dropped') return { ok: false, notice: null }
  try {
    const { source, plan, opening } = prepared
    if (scope && !contentKey && prepared.bytes) {
      contentKey = bytesContentKey(prepared.bytes)
      const bytesHit = remembered(scope, contentKey)
      if (bytesHit) {
        reuse(bytesHit)
        return { ok: true }
      }
    }
    if (opening) result.truncatedAttachments += 1

    const halves = halvesFor(source, plan, prepared.budgetTokens)
    if (halves) {
      const { digest, watched } = await watchHalves(source, halves, input, result)
      const failures = watched.flatMap((outcome) => (outcome.status === 'failed' ? [outcome] : []))
      if (digest) {
        present(result, digest)
        noteOutcome(result, watchOutcomeFor(digest))
        if (scope && contentKey) remember(scope, attachment, contentKey, digest)
      }

      logger.info(
        {
          channelId: input.channelId,
          kind,
          watcher: 'gemini',
          transport: source.transport,
          mode: 'halves',
          durationSec: Math.round(halves.halves[0].plan.durationSec),
          fps: halves.halves[0].plan.fps,
          estimate: 2 * halves.halfEstimate,
          watchMs: Math.max(...watched.map((outcome) => outcome.watchMs)),
          calls: watched.reduce((total, outcome) => total + outcome.calls, 0),
          outcome: digest ? (failures.length > 0 ? 'partial' : 'ok') : failures[0]?.reason
        },
        'Watched media'
      )
      if (digest) return { ok: true }
      return { ok: false, notice: failures[0]?.reason === 'unavailable' ? "it couldn't be opened" : UNWATCHABLE }
    }

    if (plan.mode === 'decline') {
      logger.info(
        {
          channelId: input.channelId,
          kind,
          watcher: 'gemini',
          transport: source.transport,
          mode: 'decline',
          reason: plan.reason
        },
        'Watched media'
      )
      return {
        ok: false,
        notice:
          plan.reason === 'too_long' && plan.durationSec !== null
            ? `at about ${formatClock(plan.durationSec)} it is too long to watch in one go`
            : "it couldn't be opened"
      }
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
      present(result, watched.digest)
      noteOutcome(result, watchOutcomeFor(watched.digest))
      result.mediaTokens += watched.promptTokens
      if (scope && contentKey) remember(scope, attachment, contentKey, watched.digest)
    } else {
      // Billed even though unusable; a timed-out request may have been processed in full.
      result.mediaTokens += watched.promptTokens ?? (watched.reason === 'timeout' ? plan.estimate : 0)
    }

    logger.info(
      {
        channelId: input.channelId,
        kind,
        watcher: 'gemini',
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
    if (watched.status === 'ok') return { ok: true }
    return { ok: false, notice: watched.reason === 'unavailable' ? "it couldn't be opened" : UNWATCHABLE }
  } finally {
    if (prepared.file) void deleteFile(prepared.file.name)
  }
}

/** Turn a turn's attachments into model parts, watching audio and video into digests first. */
export async function prepareTurnMedia(input: {
  channelId: string
  attachments: MediaAttachment[] | undefined
  focus: string
  mayRetry: () => boolean
  memoryScope?: MediaMemoryScope | null
}): Promise<PreparedTurnMedia> {
  const attachments = input.attachments ?? []
  const watchable = attachments.flatMap((attachment) => {
    const kind = watchableKind(attachment.contentType)
    return kind ? [{ attachment, kind }] : []
  })
  const direct = attachments.filter((attachment) => !watchable.some((item) => item.attachment === attachment))

  const prepared = await prepareAttachments(input.channelId, direct.length > 0 ? direct : undefined)
  const result: PreparedTurnMedia = {
    directParts: prepared.mediaParts,
    mediaTextParts: [],
    compactions: new Map(),
    compactDigests: [],
    digests: [],
    watcherCalls: 0,
    mediaTokens: prepared.imageTokens,
    droppedAttachments: prepared.droppedAttachments,
    truncatedAttachments: prepared.truncatedAttachments,
    refusedAttachments: prepared.refusedAttachments,
    watchOutcome: null
  }

  for (const { attachment, kind } of watchable) {
    const first = result.watchOutcome === null
    if (config.media.watcher === 'off') {
      noteOutcome(result, { status: 'failed', kind })
      result.mediaTextParts.push(notice(labelFor(attachment, kind), SWITCHED_OFF))
    } else {
      await watchOne(attachment, kind, input, result)
    }
    if (first && result.watchOutcome && attachment.origin === 'link') {
      result.watchOutcome = { ...result.watchOutcome, fromLink: true }
    }
  }
  return result
}
