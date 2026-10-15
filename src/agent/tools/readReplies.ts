import { config } from '../../config.js'
import { formatRepliesForModel } from '../../discord/socialPosts/replies/format.js'
import { type ReplyReader, replyReader } from '../../discord/socialPosts/replies/service.js'
import { parseSocialPostUrl } from '../../discord/socialPosts/urls.js'
import { recordReplyOutcome } from '../replyOutcomes.js'

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
