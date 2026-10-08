import { formatRepliesForModel } from '../../discord/socialPosts/replies/format.js'
import { type ReplyReader, replyReader } from '../../discord/socialPosts/replies/service.js'
import { parseSocialPostUrl } from '../../discord/socialPosts/urls.js'
import { recordReplyOutcome } from '../replyOutcomes.js'

export interface ReadRepliesParams {
  url: string
}

export async function readReplies(
  { url }: ReadRepliesParams,
  reader: Pick<ReplyReader, 'read'> = replyReader
): Promise<{ replies: string }> {
  const cleaned = url
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/[.,!?;:'")\]]+$/g, '')
  const target = parseSocialPostUrl(cleaned)
  if (!target) return { replies: 'That is not a supported post link.' }

  const lookup = await reader.read(target)
  recordReplyOutcome(lookup.status)
  return { replies: formatRepliesForModel(lookup) }
}
