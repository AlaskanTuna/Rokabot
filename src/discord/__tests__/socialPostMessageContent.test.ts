import { Collection } from 'discord.js'
import { describe, expect, it } from 'vitest'
import { extractMessageContent } from '../messageContent.js'
import type { SocialPostPresentation } from '../messageContent.js'
import { parseSocialPostUrl } from '../socialPosts/urls.js'

const target = parseSocialPostUrl('https://x.com/roka/status/123')!
const presentation: SocialPostPresentation = {
  target,
  line: '[Linked post — X @roka (Roka), 2026-10-06: "text"]',
  imageAttachment: { url: 'https://pbs.twimg.com/post-photo.jpg', contentType: 'image/jpeg' }
}

function message({ attachments = [], embeds = [] }: { attachments?: object[]; embeds?: object[] } = {}) {
  return {
    content: 'what is this?',
    mentions: { members: new Collection(), users: new Collection() },
    attachments: new Collection(attachments.map((attachment, index) => [String(index), attachment])),
    components: [],
    embeds,
    messageSnapshots: new Collection(),
    poll: null,
    stickers: new Collection()
  } as never
}

function postEmbed() {
  return {
    url: 'https://x.com/roka/status/123',
    author: null,
    title: 'Embed title',
    description: 'raw embed description',
    fields: [],
    footer: null,
    video: null,
    image: null,
    thumbnail: { url: 'https://pbs.twimg.com/embed-thumb.jpg' },
    data: { type: 'rich' }
  }
}

describe('social post message content', () => {
  it('replaces a matching embed description and thumbnail with the normalized post', () => {
    const extracted = extractMessageContent(message({ embeds: [postEmbed()] }), null, false, 'bot', [], presentation)

    expect(extracted.content).toContain(presentation.line)
    expect(extracted.content).not.toContain('raw embed description')
    expect(extracted.imageAttachments).toEqual([presentation.imageAttachment])
  })

  it('keeps the current user attachment in the only media slot', () => {
    const ownImage = { url: 'https://cdn.discordapp.com/user-upload.png', contentType: 'image/png', size: 100 }
    const extracted = extractMessageContent(
      message({ attachments: [ownImage], embeds: [postEmbed()] }),
      null,
      false,
      'bot',
      [],
      presentation
    )

    expect(extracted.imageAttachments).toEqual([ownImage])
    expect(extracted.content).toContain(presentation.line)
  })

  it('adds the linked post line and image when no Discord embed exists', () => {
    const extracted = extractMessageContent(message(), null, false, 'bot', [], presentation)

    expect(extracted.content).toContain(presentation.line)
    expect(extracted.imageAttachments).toEqual([presentation.imageAttachment])
  })
})
