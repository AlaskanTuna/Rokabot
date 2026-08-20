import { describe, expect, it } from 'vitest'
import { ALLOWED_MEDIA_TYPES, MAX_ATTACHMENTS } from '../attachments.js'
import { askCommand } from '../commands/ask.js'

const options = askCommand.toJSON().options ?? []
const slots = options.filter((option) => /^attachment(_\d+)?$/.test(option.name))
const linkOption = options.find((option) => option.name === 'attachment_url')

// What a user reads on their own file. audio/mp3 and audio/mpeg are the same thing to a person, so both map
// to MP3 — an admitted type with no entry here is a type the picker would never name.
const LABELS: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/gif': 'GIF',
  'image/webp': 'WebP',
  'application/pdf': 'PDF',
  'audio/wav': 'WAV',
  'audio/mp3': 'MP3',
  'audio/mpeg': 'MP3',
  'audio/aiff': 'AIFF',
  'audio/aac': 'AAC',
  'audio/ogg': 'OGG',
  'audio/flac': 'FLAC',
  'video/mp4': 'MP4',
  'video/mov': 'MOV',
  'video/quicktime': 'MOV',
  'video/webm': 'WebM',
  'video/avi': 'AVI',
  'video/mpeg': 'MPEG',
  'video/mpg': 'MPEG',
  'video/x-flv': 'FLV',
  'video/wmv': 'WMV',
  'video/3gpp': '3GP'
}

// Read off the union, not the individual sets: enumerating them by hand is how video ended up admitted
// and unnamed while this very test stayed green.
const admitted = [...ALLOWED_MEDIA_TYPES]

describe('/ask option descriptions', () => {
  it('exposes one slot per attachment the turn admits', () => {
    expect(slots).toHaveLength(MAX_ATTACHMENTS)
  })

  // The one place the concrete name is stated. Everything else derives from attachmentOptionName, which is
  // right for keeping the surfaces in step and useless as a record of what users actually type: reverting
  // the single slot to `attachment_1` broke nothing until this existed. Guarded on the ceiling so it
  // documents the rule rather than blocking a future change to it.
  it('calls a lone slot `attachment`, with no number promising a second one', () => {
    if (MAX_ATTACHMENTS !== 1) return
    expect(slots.map((slot) => slot.name)).toEqual(['attachment'])
  })

  // No test asserts the 100-character description limit on purpose: SlashCommandBuilder.setDescription throws
  // at construction, so an overlong description makes this whole module unimportable and every suite that
  // touches it fails to collect. A test for it could only ever pass.

  // The drift guard. Adding a type to the sets without naming it here leaves a format the bot accepts and
  // never tells anyone about, which is the silent half of the same problem #100 had.
  it.each(admitted)('names %s in every attachment slot', (contentType) => {
    const label = LABELS[contentType]
    expect(label, `no user-facing label for ${contentType}`).toBeDefined()
    for (const slot of slots) expect(slot.description).toContain(label)
  })

  // The link option takes the same set as the upload slot now, so the drift guard runs over both rather than
  // asserting the two differ. A type resolveMediaUrl admits and this never names is a format she accepts and
  // tells nobody about — the silent half of the same problem #100 had.
  it.each(admitted)('names %s on the link option too', (contentType) => {
    const label = LABELS[contentType]
    expect(label, `no user-facing label for ${contentType}`).toBeDefined()
    expect(linkOption!.description).toContain(label)
  })

  // Discord throws at construction past 100 characters, so an overlong description makes this module
  // unimportable rather than merely wrong. Asserted here and not on the slots because the link option is the
  // one carrying a prefix in front of the shared format list, and so the one with the least room left.
  it('keeps the link description inside the length Discord accepts', () => {
    expect(linkOption!.description.length).toBeLessThanOrEqual(100)
  })
})
