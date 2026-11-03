// Discord has no multi-attachment option; ten picker slots would bury /ask's message option.
export const ASK_ATTACHMENT_SLOTS = 3

/**
 * Discord has no multi-attachment option type, so /ask exposes one option per picker slot. Named for
 * attachments rather than images because the slots take PDFs, audio and video too — see ALLOWED_MEDIA_TYPES.
 *
 * A lone slot is `attachment`; multiple slots are numbered, independently of the ten-file per-turn ceiling.
 */
export function attachmentOptionName(index: number): string {
  return ASK_ATTACHMENT_SLOTS > 1 ? `attachment_${index + 1}` : 'attachment'
}
