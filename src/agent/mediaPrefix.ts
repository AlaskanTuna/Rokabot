/**
 * Whether the first N bytes of a file are still a file the model can read.
 *
 * Some containers tolerate being cut short and some do not, and the difference is not cosmetic: a truncated
 * MP3 is ordinary audio that simply stops, while a truncated MP4 whose index sits at the end is undecodable.
 * Sending the second kind produces no error anywhere — the request succeeds and the answer is about nothing —
 * so the check has to happen before the bytes are sent, and has to refuse when it cannot prove the prefix works.
 */

/** How a type behaves when cut short. `none` means a prefix is not safe to send and the file must be refused. */
export type PrefixPolicy = 'streamable' | 'isobmff' | 'none'

/**
 * Every entry here is measured, not argued. A prefix that fails to decode raises no error — the request
 * succeeds and the answer is about nothing — so a plausible-sounding format is refused until someone has
 * actually cut one in half and counted the tokens.
 *
 * Measured by `countTokens` on a 40% byte prefix against the whole file, 120 s audio and 60 s video sources:
 *
 * ```
 * audio/mpeg  a 1 MB cut of a 2.77 MB 84 kbps file summarised correctly, with an exact quote
 * audio/ogg   full 3841  prefix 1538  40.0%
 * audio/flac  full 3842  prefix 1526  39.7%
 * audio/aac   full 3842  prefix 1539  40.1%
 * audio/wav   full 3841  prefix 1537  40.0%
 * video/webm  full 6001  prefix 2295  38.2%
 * ```
 *
 * Each ratio tracking its byte fraction is the evidence: a container that failed to decode would not come
 * back proportional, it would come back near zero. Two of these contradict the paper reasoning — WAV
 * survives despite a header declaring a length the file no longer has, because the decoder takes the PCM
 * present rather than trusting it, and WebM survives despite Matroska being able to carry its cues at the
 * end. Both would have been refused on argument.
 *
 * Caveat on the five: they were synthetic single-stream files from ffmpeg. A Discord voice message is
 * OGG/Opus, so that one matches real input directly; the others are "measured on a clean file" rather than
 * on whatever a user uploads, and a chained or multiplexed stream could still behave differently.
 */
export function prefixPolicyFor(contentType: string): PrefixPolicy {
  if (STREAMABLE_TYPES.has(contentType)) return 'streamable'

  // ISO base media: prefixable only when `moov` precedes the media data, which is a property of the specific
  // file rather than of the format. Checked per file by isobmffAllowsPrefix.
  if (['video/mp4', 'video/mov', 'video/quicktime', 'video/3gpp'].includes(contentType)) return 'isobmff'

  // Anything unmeasured refuses. AVI and WMV are the remaining admitted types and neither has been cut.
  return 'none'
}

/** Types where a byte prefix decodes to exactly the media it contains, whatever the container does at the end. */
const STREAMABLE_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  'audio/wav',
  'video/webm'
])

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

    // Size is resolved before any decision about the type, because finding the index is not the same as
    // having it: a moov that begins inside the cut but runs past it leaves a truncated index, and a
    // truncated index decodes to nothing while the request still succeeds.
    let size = declared
    if (declared === 1) {
      if (offset + 16 > prefix.length) return false
      // The real size is a 64-bit value following the type. Read whole and narrowed to a Number, which is
      // exact below 2^53 — anything larger is rejected by the Number.isSafeInteger guard below rather than
      // silently wrapping.
      size = Number(prefix.readBigUInt64BE(offset + 8))
    } else if (declared === 0) {
      // Extends to end of file. Nothing can follow it, and if it is the index then the index is not
      // contained in the prefix either.
      return false
    }

    if (size < 8 || !Number.isSafeInteger(size)) return false

    if (type === 'moov') return offset + size <= prefix.length
    // Media data reached with no index before it: a prefix of this file has nothing to decode against.
    if (type === 'mdat' || type === 'moof') return false

    offset += size
  }

  // Ran out of prefix without finding either. Not provably prefixable, so it is refused.
  return false
}
