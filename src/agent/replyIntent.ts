const REPLY_WORDS =
  /\b(?:comment(?:s|ed|ers?|ing)?|repl(?:y|ies|ied|ying)|reactions?|react(?:s|ed|ing)?|respon(?:d|ds|ded|ding|se|ses)|thread|crowd)\b/i
const OPINION =
  /\b(?:people|everyone|everybody|folks|others|the internet|anyone)\b[^.?!]{0,20}\b(?:say|says|saying|said|think|thinks|thinking|thought|feel|feels|feeling)\b/i

/**
 * Whether the speaker's own words ask about a post's replies. read_replies is offered only then: Flash Lite
 * otherwise fetched replies on turns that only asked what a post was about. Links are dropped first because a
 * Reddit post's path contains /comments/. Generous on purpose: a false match only offers the tool.
 */
export function asksAboutReplies(text: string): boolean {
  const words = text.replace(/https?:\/\/\S+/g, ' ')
  return REPLY_WORDS.test(words) || OPINION.test(words)
}
