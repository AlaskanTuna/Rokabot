/**
 * Whether the first N bytes of a file are still a file the model can read.
 *
 * Some containers tolerate being cut short and some do not, and the difference is not cosmetic: a truncated
 * MP3 is ordinary audio that simply stops, while a truncated MP4 whose index sits at the end is undecodable.
 * Sending the second kind produces no error anywhere — the request succeeds and the answer is about nothing —
 * so the check has to happen before the bytes are sent, and has to refuse when it cannot prove the prefix works.
 */

/** How a type behaves when cut short. `none` means a prefix is not safe to send and the file must be refused. */
export type PrefixPolicy = 'frames' | 'isobmff' | 'none'

export function prefixPolicyFor(contentType: string): PrefixPolicy {
  // MP3 is a stream of self-describing frames with no trailing index, so any prefix is valid audio. Measured:
  // a 1 MB cut of a 2.77 MB 84 kbps file summarised correctly, with an exact quote, at 3,175 tokens.
  if (contentType === 'audio/mpeg' || contentType === 'audio/mp3') return 'frames'

  // ISO base media: prefixable only when `moov` precedes the media data, which is a property of the specific
  // file rather than of the format. Checked per file by isobmffAllowsPrefix.
  if (['video/mp4', 'video/mov', 'video/quicktime', 'video/3gpp'].includes(contentType)) return 'isobmff'

  // Everything else refuses rather than guesses. OGG, WebM, FLAC and ADTS AAC are all plausibly prefixable on
  // paper; none has been measured here, and a wrong guess is silent corruption rather than a failure. They
  // belong in this list only with a measurement behind them.
  return 'none'
}

/**
 * Walk the top-level ISO-BMFF box list and report whether `moov` arrives before the media data.
 *
 * A phone MP4 often carries `moov` last, so a prefix of one has no index and cannot be decoded; a fragmented
 * or faststart file carries it early. Only the first bytes are needed to tell them apart, which is why this
 * runs on the prefix already fetched rather than costing a request of its own.
 */
export function isobmffAllowsPrefix(prefix: Buffer): boolean {
  let offset = 0

  while (offset + 8 <= prefix.length) {
    const declared = prefix.readUInt32BE(offset)
    const type = prefix.toString('latin1', offset + 4, offset + 8)

    // Box types are four printable ASCII characters. Anything else means this is not a box list and the file
    // is not what its MIME type claims, which is a refusal rather than a guess.
    if (!/^[\x20-\x7e]{4}$/.test(type)) return false

    if (type === 'moov') return true
    // Media data reached with no index before it: a prefix of this file has nothing to decode against.
    if (type === 'mdat' || type === 'moof') return false

    let size = declared
    if (declared === 1) {
      if (offset + 16 > prefix.length) return false
      // 64-bit sizes only matter for boxes larger than 4 GB, which is far past any cap here; reading the low
      // half is enough to keep walking, and an implausible value falls through to the guard below.
      size = Number(prefix.readBigUInt64BE(offset + 8))
    } else if (declared === 0) {
      // Extends to end of file, so nothing follows it to find.
      return false
    }

    if (size < 8 || !Number.isSafeInteger(size)) return false
    offset += size
  }

  // Ran out of prefix without finding either. Not provably prefixable, so it is refused.
  return false
}
