import { SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL } from '../../../agent/promptSafety.js'
import { PLATFORM_NAMES, quoted } from '../format.js'
import type { ReplyLookup, SocialReply } from './types.js'

const MAX_QUOTED_REPLY_CHARS = 1000

// The bot sends with Discord's default mention parsing, so an echoed mass mention would ping everyone.
function defang(value: string): string {
  return value.replace(/@(everyone|here)\b/gi, '@\u200b$1')
}

function line(reply: SocialReply, index: number): string {
  const who = reply.author ? `@${defang(quoted(reply.author, 64))}` : 'someone'
  const likes = reply.likes === null ? '' : ` (${reply.likes} ${reply.likes === 1 ? 'like' : 'likes'})`
  return `${index + 1}. ${who}${likes}: "${defang(quoted(reply.text, MAX_QUOTED_REPLY_CHARS))}"`
}

export function formatRepliesForModel(lookup: ReplyLookup): string {
  const name = PLATFORM_NAMES[lookup.platform]
  if (lookup.status === 'failed') return `(the replies to this ${name} post could not be opened)`
  if (lookup.replies.length === 0)
    return `${SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL}\n[Replies on the ${name} post — none readable]`

  const total = lookup.total === null ? '' : ` of ${lookup.total}`
  const ranking = lookup.platform === 'reddit' ? 'ranked by votes' : 'ranked by likes'
  return `${SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL}\n[Replies on the ${name} post — top ${lookup.replies.length}${total}, ${ranking}: ${lookup.replies.map(line).join(' | ')}]`
}
