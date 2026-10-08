import type { Part } from '@google/genai'
import { config } from '../../config.js'
import {
  findMediaDigest,
  recordMediaOccurrence,
  saveMediaDigest,
  setMediaDigestEmbedding
} from '../../storage/mediaDigestStore.js'
import { logger } from '../../utils/logger.js'
import { measureAttachmentTokens } from '../attachmentCost.js'
import { geminiMimeType, isStreamedUpload } from '../attachmentLimits.js'
import { type ImageAttachment, downloadAttachment, prepareAttachments } from '../attachments.js'
import { embedEpisodeText } from '../memory/episodeEmbeddings.js'
import { remainingTokensThisMinute } from '../tokenBudget.js'
import { bytesContentKey, discordAttachmentContentKey } from './contentKey.js'
import { formatClock, mergeHalves, renderCompactDigest, renderDigestBlock } from './digest.js'
import { durationFromTokens, mp4DurationSec } from './duration.js'
import { type UploadedFile, deleteFile, streamToFiles } from './filesUpload.js'
import {
  HALVES_MAX_DURATION_SEC,
  HALVES_MIN_DURATION_SEC,
  type HalvesPlan,
  planCoverage,
  planFocus,
  planHalves
} from './plan.js'
import type { CoveragePlan, MediaDigest, MediaKind } from './types.js'
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

/** A server turn whose watched media is remembered. Absent for DMs, group DMs and `/ask`. */
export interface MediaMemoryScope {
  guildId: string
  channelId: string
  messageId: string
  userId: string
}

function remembered(scope: MediaMemoryScope, contentKey: string): { id: number; digest: MediaDigest } | null {
  try {
    const stored = findMediaDigest(scope.guildId, contentKey)
    if (!stored) return null
    const digest = JSON.parse(stored.digestJson) as MediaDigest
    // A partial watch is worth redoing; a later share may get the whole thing.
    if (digest.mode === 'opening' || digest.incomplete) return null
    // A skim of a video that two halves could cover whole is worth redoing when a share can afford the halves.
    if (
      digest.mode === 'skim' &&
      digest.durationSec > HALVES_MIN_DURATION_SEC &&
      digest.durationSec <= HALVES_MAX_DURATION_SEC
    ) {
      return null
    }
    // Throws on a row that has drifted from the digest shape, which then counts as a miss.
    renderDigestBlock(digest)
    renderCompactDigest(digest)
    return { id: stored.id, digest }
  } catch (error) {
    logger.warn({ error, contentKey }, 'Could not read remembered media')
    return null
  }
}

function recordShare(scope: MediaMemoryScope, attachment: ImageAttachment, digestId: number): void {
  try {
    recordMediaOccurrence({
      digestId,
      guildId: scope.guildId,
      channelId: scope.channelId,
      messageId: attachment.sourceMessageId ?? scope.messageId,
      sharedByUserId: scope.userId,
      sourceAuthorId: attachment.sourceAuthorId ?? null,
      origin: attachment.origin ?? 'upload'
    })
  } catch (error) {
    logger.warn({ error, digestId }, 'Could not record shared media')
  }
}

function remember(scope: MediaMemoryScope, attachment: ImageAttachment, contentKey: string, digest: MediaDigest) {
  try {
    const saved = saveMediaDigest({
      guildId: scope.guildId,
      contentKey,
      kind: digest.kind,
      label: digest.label,
      summary: digest.observations.summary,
      digestJson: JSON.stringify(digest)
    })
    if (!saved) return
    recordShare(scope, attachment, saved.id)
    // Off the reply path; a failed embedding stays NULL until maintenance repairs it.
    void embedEpisodeText({ text: saved.summary, role: 'RETRIEVAL_DOCUMENT' })
      .then((embedding) =>
        setMediaDigestEmbedding({ guildId: scope.guildId, id: saved.id, summary: saved.summary, embedding })
      )
      .catch((error) => logger.warn({ error, digestId: saved.id }, 'Could not embed remembered media'))
  } catch (error) {
    logger.warn({ error, contentKey }, 'Could not remember watched media')
  }
}

function present(result: PreparedTurnMedia, digest: MediaDigest): void {
  const block = renderDigestBlock(digest)
  const compact = renderCompactDigest(digest)
  result.mediaTextParts.push({ text: block })
  result.compactions.set(block, compact)
  result.compactDigests.push(compact)
  result.digests.push(digest)
}

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
    opening: false,
    budgetTokens
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
    opening: download.truncated,
    budgetTokens: config.gemini.maxAttachmentTokens,
    bytes: download.bytes
  }
}

async function prepareFiles(
  attachment: ImageAttachment & { size: number },
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

async function watchOne(
  attachment: ImageAttachment,
  kind: MediaKind,
  input: {
    channelId: string
    focus: string
    mayRetry: () => boolean
    geminiUnavailable?: boolean
    memoryScope?: MediaMemoryScope | null
  },
  result: PreparedTurnMedia
): Promise<void> {
  const label = labelFor(attachment, kind)
  const scope = input.memoryScope ?? null
  let contentKey = scope ? attachment.contentKey : undefined
  // A streamed upload has no bytes to hash until it is uploaded, so its Discord path stands in as the key.
  if (scope && !contentKey && isStreamedUpload(attachment, config.media.maxStreamedUploadBytes)) {
    contentKey = discordAttachmentContentKey(attachment.url)
  }
  const reuse = (hit: { id: number; digest: MediaDigest }) => {
    present(result, hit.digest)
    recordShare(scope!, attachment, hit.id)
    logger.info({ channelId: input.channelId, kind, outcome: 'remembered' }, 'Watched media')
  }
  const linkHit = scope && contentKey ? remembered(scope, contentKey) : null
  if (linkHit) return reuse(linkHit)
  // Only Gemini can watch; while turns are pinned to the fallback model, waiting on it would only add delay.
  if (input.geminiUnavailable) {
    result.mediaTextParts.push(notice(label, "it couldn't be watched right now"))
    return
  }
  const prepared =
    attachment.transport === 'uri'
      ? await prepareUri(attachment, label)
      : isStreamedUpload(attachment, config.media.maxStreamedUploadBytes)
        ? await prepareFiles(attachment, kind, label)
        : await prepareInline(attachment, kind, label)

  if (prepared.status === 'dropped') {
    result.droppedAttachments += 1
    return
  }
  try {
    const { source, plan, opening } = prepared
    if (scope && !contentKey && prepared.bytes) {
      contentKey = bytesContentKey(prepared.bytes)
      const bytesHit = remembered(scope, contentKey)
      if (bytesHit) return reuse(bytesHit)
    }
    if (opening) result.truncatedAttachments += 1

    const halves = halvesFor(source, plan, prepared.budgetTokens)
    if (halves) {
      const { digest, watched } = await watchHalves(source, halves, input, result)
      const failures = watched.flatMap((outcome) => (outcome.status === 'failed' ? [outcome] : []))
      if (digest) {
        present(result, digest)
        if (scope && contentKey) remember(scope, attachment, contentKey, digest)
      } else {
        result.mediaTextParts.push(
          notice(
            label,
            failures[0]?.reason === 'unavailable' ? "it couldn't be opened" : "it couldn't be watched right now"
          )
        )
      }

      logger.info(
        {
          channelId: input.channelId,
          kind,
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
      return
    }

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
      present(result, watched.digest)
      result.mediaTokens += watched.promptTokens
      if (scope && contentKey) remember(scope, attachment, contentKey, watched.digest)
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
  } finally {
    if (prepared.file) void deleteFile(prepared.file.name)
  }
}

/** Turn a turn's attachments into model parts, watching audio and video into digests first. */
export async function prepareTurnMedia(input: {
  channelId: string
  attachments: ImageAttachment[] | undefined
  focus: string
  mayRetry: () => boolean
  /** True while turns are pinned to the fallback model, which cannot watch. */
  geminiUnavailable?: boolean
  memoryScope?: MediaMemoryScope | null
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
