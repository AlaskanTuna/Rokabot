/** /ask slash command definition — single-turn chat that searches the web on its own when it needs to */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { MAX_ATTACHMENTS, attachmentOptionName } from '../attachments.js'

const command = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask Roka anything — she looks things up when she needs to')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addStringOption((option) =>
    option.setName('question').setDescription('What do you want to ask or say?').setRequired(true)
  )

// Named formats rather than a category word: "image, PDF or audio" does not tell someone whether the file
// in front of them will be taken, and a slot that under-promises is a feature nobody finds. Discord caps an
// option description at 100 characters — SlashCommandBuilder throws at construction past it, so overrunning
// is a load failure rather than a subtle one — which is what keeps this a list of extensions, not MIME types.
// A test asserts every admitted type is named here, so adding one to the sets fails until this is updated.
const READABLE_FORMATS = 'PNG, JPEG, GIF, WebP, PDF, MP3, WAV, OGG, FLAC, AAC or AIFF'

// One option per attachment slot, driven by the same ceiling the mention path uses, so the two surfaces
// cannot drift apart and the count is stated once.
for (let index = 0; index < MAX_ATTACHMENTS; index++) {
  command.addAttachmentOption((option) =>
    option
      .setName(attachmentOptionName(index))
      .setDescription(
        index === 0
          ? `Share a file with Roka: ${READABLE_FORMATS} (1 of ${MAX_ATTACHMENTS})`
          : `Another file: ${READABLE_FORMATS} (${index + 1} of ${MAX_ATTACHMENTS})`
      )
      .setRequired(false)
  )
}

// A link, not an upload: deliberately typed, so it needs no embed and sidesteps the unfurl-timing problem
// the mention path has. Added after the attachment slots so it reads last in Discord's option list.
//
// Images only, and deliberately narrower than the upload slots beside it. `resolveImageUrl` is the path that
// makes the Pi fetch a host a user named, so widening its type set is a change to what an attacker can aim
// it at, not just a feature — the SSRF guard covers the host, never the payload. It names its four formats
// rather than saying "a file", so the slot does not promise what it does not do. Widening it to documents and
// audio is worth its own change, with its own tests, and should not ride along inside a modality PR.
command.addStringOption((option) =>
  option
    .setName('attachment_url')
    .setDescription('Link to a PNG, JPEG, GIF or WebP for Roka to look at')
    .setRequired(false)
)

export const askCommand = command
