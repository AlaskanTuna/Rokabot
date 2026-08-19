import { describe, expect, it } from 'vitest'
import { ALLOWED_MEDIA_TYPES } from '../attachments.js'
import { askCommand } from '../commands/ask.js'

const options = askCommand.toJSON().options ?? []
const slots = options.filter((option) => /^attachment_\d+$/.test(option.name))
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
    expect(slots).toHaveLength(3)
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

  it('names the image formats on the link option', () => {
    for (const label of ['PNG', 'JPEG', 'GIF', 'WebP']) expect(linkOption!.description).toContain(label)
  })

  // The link option is images-only on purpose — resolveImageUrl gates on ALLOWED_IMAGE_TYPES. Naming a
  // format it would refuse is the over-promise this test exists to stop.
  it.each(['PDF', 'MP3', 'OGG', 'FLAC', 'MP4', 'WebM'])('does not promise %s on the link option', (label) => {
    expect(linkOption!.description).not.toContain(label)
  })
})
