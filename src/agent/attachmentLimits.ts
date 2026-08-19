/**
 * Per-attachment size ceilings, in their own leaf module so the byte budget can read them without importing
 * the agent runtime — four test suites replace roka.js with a double, and a value imported from there would
 * silently arrive undefined inside them.
 */

export const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024

// Documents get their own ceiling rather than sharing the image one: a PDF is not resized before sending, so
// its bytes reach the request as-is, and 10 MB is what upload latency admits inside gemini.timeout at the
// Pi's measured 2.5 MB/s upstream. See docs/multimodal.md.
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024

// Audio sits below the document ceiling: 8 MB is roughly five minutes at 128 kbps, and at 32 tokens a second
// its token cost never approaches the measured 250,000 TPM — RPM binds first by an order of magnitude. The
// cap is upload latency against gemini.timeout, same as the others. See docs/multimodal.md.
export const MAX_AUDIO_SIZE_BYTES = 8 * 1024 * 1024

/**
 * The ceiling one attachment is held to, by kind. Single declaration because the download and the in-flight
 * byte budget both need it and must not disagree — a budget that reserved one number while the download
 * enforced another would either over-admit or refuse turns it had room for.
 */
export function sizeLimitFor(contentType: string): number {
  if (contentType.startsWith('image/')) return MAX_IMAGE_SIZE_BYTES
  if (contentType.startsWith('audio/')) return MAX_AUDIO_SIZE_BYTES
  return MAX_DOCUMENT_SIZE_BYTES
}

/**
 * What to call this type when handing it to Gemini. Gemini documents `audio/mp3`, which is not a registered
 * MIME type; the registered one for an MP3 is `audio/mpeg` (RFC 3003), and that is what Discord labels the
 * commonest audio upload there is. Admitting the registered name and renaming it at the boundary is safe
 * whichever the API accepts, where sending Discord's name unchanged is a guess. Everything else passes through.
 */
export function geminiMimeType(contentType: string): string {
  return contentType === 'audio/mpeg' ? 'audio/mp3' : contentType
}
