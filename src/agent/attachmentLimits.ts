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

// Video shares the document ceiling rather than getting a larger one: 10 MB is what upload latency admits
// inside gemini.timeout, and at low media resolution it is also what holds a clip inside the measured
// 250,000 TPM without a decode pass — roughly 40-160 s at typical Discord bitrates. See docs/multimodal.md.
// Equal to the document ceiling today, so sizeLimitFor's video branch is not independently observable and
// no test can pin it. Kept separate anyway: the two are set by different arguments, and a later change to
// one should not silently move the other.
export const MAX_VIDEO_SIZE_BYTES = 10 * 1024 * 1024

/**
 * The ceiling one attachment is held to, by kind. Single declaration because the download and the in-flight
 * byte budget both need it and must not disagree — a budget that reserved one number while the download
 * enforced another would either over-admit or refuse turns it had room for.
 */
export function sizeLimitFor(contentType: string): number {
  if (contentType.startsWith('image/')) return MAX_IMAGE_SIZE_BYTES
  if (contentType.startsWith('audio/')) return MAX_AUDIO_SIZE_BYTES
  if (contentType.startsWith('video/')) return MAX_VIDEO_SIZE_BYTES
  return MAX_DOCUMENT_SIZE_BYTES
}

/**
 * What to call this type when handing it to Gemini. Gemini documents `audio/mp3`, which is not a registered
 * MIME type; the registered one for an MP3 is `audio/mpeg` (RFC 3003), and that is what Discord reports.
 *
 * Both labels are in fact accepted — measured with real MP3 bytes against `countTokens` and `generateContent`,
 * which returned identical token counts under either, because Gemini routes on the content rather than the
 * declared type. So the rename is a deliberate preference and not a necessity: the documented name is the one
 * carrying a compatibility promise, and an undocumented alias can stop working without notice. It costs
 * nothing, so it is worth having. Everything else passes through.
 */
export function geminiMimeType(contentType: string): string {
  return GEMINI_SPELLINGS[contentType] ?? contentType
}

/**
 * Types whose registered name differs from the one Gemini documents. `audio/mpeg` is the registered type for
 * an MP3 (RFC 3003) and `video/quicktime` for a .mov, and both are what Discord reports — Gemini's own list
 * says `audio/mp3` and `video/mov`. The audio pair is measured as interchangeable, so this is a preference
 * for the documented spelling rather than a workaround; the documented name is the one carrying a
 * compatibility promise, and it costs nothing to send.
 */
const GEMINI_SPELLINGS: Record<string, string> = {
  'audio/mpeg': 'audio/mp3',
  'video/quicktime': 'video/mov'
}

/**
 * What Gemini charges for one image, measured against gemini-3.5-flash-lite with countTokens on
 * 2026-08-19: 1089 tokens for every square image from 64x64 through 1024x1024, easing slightly at
 * extreme aspect ratios (1081 at 2:1, 1056 at 4:1). Flat, so resizing an image cannot change what it
 * costs — there is no cheap tier for a small one and no tiling growth for a large one.
 *
 * Note for anyone reaching for the published tile model — 258 tokens per tile, one tile below 384px:
 * it does not describe this model's billing, and measuring beats citing it. A 64x64 image costs the
 * same 1089 as a 1024x1024 one, so neither the cheap tier nor the tiling growth shows up in practice.
 */
export const GEMINI_IMAGE_TOKENS = 1089
