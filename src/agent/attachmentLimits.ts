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
