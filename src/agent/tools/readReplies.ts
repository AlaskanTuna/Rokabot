import { config } from '../../config.js'
import { recordReplyOutcome } from '../replyOutcomes.js'
import { formatRepliesForModel } from '../social/replies/format.js'
import { type ReplyReader, replyReader } from '../social/replies/service.js'
import { parseSocialPostUrl } from '../social/urls.js'

export const MAX_REQUESTED_REPLIES = Math.max(config.socialPosts.maxReplies, config.socialPosts.maxRepliesOnRequest)

export interface ReadRepliesParams {
  url: string
  count?: number
}

export async function readReplies(
  { url, count }: ReadRepliesParams,
  reader: Pick<ReplyReader, 'read'> = replyReader
): Promise<{ replies: string }> {
  const cleaned = url
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/[.,!?;:'")\]]+$/g, '')
  const target = parseSocialPostUrl(cleaned)
  if (!target) return { replies: 'That is not a supported post link.' }

  const effectiveCount =
    count === undefined ? undefined : Math.floor(Math.max(1, Math.min(count, MAX_REQUESTED_REPLIES)))
  const lookup = await reader.read(target, effectiveCount)
  recordReplyOutcome(lookup.status)
  return { replies: formatRepliesForModel(lookup) }
}
