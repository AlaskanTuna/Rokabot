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
const READABLE_FORMATS = 'PNG JPEG GIF WebP | PDF | MP3 WAV OGG FLAC AAC AIFF | MP4 MOV WebM AVI MPEG FLV WMV 3GP'

// One option per attachment slot, driven by the same ceiling the mention path uses, so the two surfaces
// cannot drift apart and the count is stated once. The "n of m" suffix is dropped at a single slot, where it
// would read as a promise of more slots that are not there.
for (let index = 0; index < MAX_ATTACHMENTS; index++) {
  command.addAttachmentOption((option) =>
    option
      .setName(attachmentOptionName(index))
      .setDescription(
        MAX_ATTACHMENTS === 1 ? READABLE_FORMATS : `${READABLE_FORMATS} (${index + 1} of ${MAX_ATTACHMENTS})`
      )
      .setRequired(false)
  )
}

// A link, not an upload: deliberately typed, so it needs no embed and sidesteps the unfurl-timing problem
// the mention path has. Added after the attachment slots so it reads last in Discord's option list.
//
// Takes the same formats as the upload slot beside it. It used to be images alone, on the reasoning that
// this is the path that makes the Pi fetch a host a user named — but the SSRF guard covers the host and never
// the payload, so the narrow type set was not the thing making it safe. What is: #157's 2s HEAD and 15s body
// timeouts, the per-type size ceilings, and #136's measured token ceiling, none of which care about type.
// Kept at 'Link to ' + READABLE_FORMATS so the two options name the same set in the same words — 95 of
// Discord's 100 characters, and the reason this reads as a bare list rather than a sentence.
command.addStringOption((option) =>
  option.setName('attachment_url').setDescription(`Link to ${READABLE_FORMATS}`).setRequired(false)
)

export const askCommand = command
