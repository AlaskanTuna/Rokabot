import { Collection } from 'discord.js'
import { describe, expect, it } from 'vitest'
import { MAX_ATTACHMENTS } from '../../agent/media/mediaRules.js'
import { extractMessageContent } from '../messageContent.js'

interface Attachment {
  url: string
  proxyURL?: string
  contentType: string | null
  size?: number
  duration?: number | null
  width?: number | null
  height?: number | null
}

function collection<T>(items: T[]) {
  return new Collection(items.map((item, index) => [String(index), item] as const))
}

function snapshot(attachments: Attachment[]) {
  return {
    content: '',
    components: [],
    embeds: [],
    attachments: collection(attachments)
  }
}

function message({
  attachments = [],
  embeds = [],
  snapshots = []
}: {
  attachments?: Attachment[]
  embeds?: object[]
  snapshots?: ReturnType<typeof snapshot>[]
} = {}) {
  return {
    id: 'trigger-1',
    author: { id: 'asker-1', displayName: 'Asker' },
    content: 'what is this?',
    mentions: { members: new Collection(), users: new Collection() },
    attachments: collection(attachments),
    components: [],
    embeds,
    messageSnapshots: collection(snapshots),
    poll: null,
    stickers: new Collection()
  }
}

function referenceMessage(attachments: Attachment[], authorId = 'user-2', embeds: object[] = []) {
  return {
    id: 'reference-1',
    author: { id: authorId, displayName: 'X' },
    member: null,
    content: 'look at this',
    embeds,
    poll: null,
    messageSnapshots: new Collection(),
    components: [],
    stickers: new Collection(),
    attachments: collection(attachments)
  }
}

const forwardedIn = { origin: 'forward', sourceMessageId: 'trigger-1', sourceAuthorId: null }
const repliedTo = { origin: 'reply', sourceMessageId: 'reference-1', sourceAuthorId: 'user-2' }

function thumbnailEmbed(url: string) {
  return {
    author: null,
    title: null,
    description: null,
    fields: [],
    footer: null,
    video: null,
    image: null,
    thumbnail: { url },
    data: { type: 'rich' }
  }
}

function extract(trigger: object, reference: object | null = null, isReplyToBot = false) {
  return extractMessageContent(trigger as never, reference as never, isReplyToBot, 'bot', [])
}

describe('media message content', () => {
  it('takes a forwarded video and names its media kind', () => {
    const video = { url: 'https://cdn.test/clip.mp4', contentType: 'video/mp4' }

    const extracted = extract(message({ snapshots: [snapshot([video])] }))

    expect(extracted.mediaAttachments).toEqual([{ ...video, ...forwardedIn }])
    expect(extracted.content).toContain('(forwarded video(s))')
  })

  it('names each forwarded media kind and how many did not fit', () => {
    const image = { url: 'https://cdn.test/photo.png', contentType: 'image/png' }
    const video = { url: 'https://cdn.test/clip.mp4', contentType: 'video/mp4' }
    const ownImages = Array.from({ length: MAX_ATTACHMENTS }, (_, index) => ({
      url: `https://cdn.test/own-${index}.png`,
      contentType: 'image/png'
    }))

    const extracted = extract(message({ attachments: ownImages, snapshots: [snapshot([image, video])] }))

    expect(extracted.mediaAttachments.map((attachment) => attachment.url)).toEqual(ownImages.map(({ url }) => url))
    expect(extracted.content).toContain('(forwarded image(s), 1 not shown)')
    expect(extracted.content).toContain('(forwarded video(s), 1 not shown)')
  })

  it('takes a replied-to voice message and names its media kind', () => {
    const audio = { url: 'https://cdn.test/voice.ogg', contentType: 'audio/ogg' }

    const extracted = extract(message(), referenceMessage([audio]))

    expect(extracted.mediaAttachments).toEqual([{ ...audio, ...repliedTo }])
    expect(extracted.content).toContain('[Replying to X: look at this\n(attached audio clip(s))]')
  })

  it('names unsupported replied-to files without taking them', () => {
    const zip = { url: 'https://cdn.test/archive.zip', contentType: 'application/zip' }

    const extracted = extract(message(), referenceMessage([zip]))

    expect(extracted.mediaAttachments).toEqual([])
    expect(extracted.content).toContain("(attached file(s) of a type that can't be opened)")
  })

  it("names video attachments on Roka's own message without taking them", () => {
    const video = { url: 'https://cdn.test/clip.mp4', contentType: 'video/mp4' }

    const extracted = extract(message(), referenceMessage([video], 'bot'), true)

    expect(extracted.mediaAttachments).toEqual([])
    expect(extracted.content).toContain('(attached video(s), 1 not shown)')
  })

  it('takes replied-to video before the triggering message embed thumbnail', () => {
    const video = { url: 'https://cdn.test/clip.mp4', contentType: 'video/mp4' }
    const thumbnail = 'https://cdn.test/own-thumb.jpg'

    const extracted = extract(message({ embeds: [thumbnailEmbed(thumbnail)] }), referenceMessage([video]))

    expect(extracted.mediaAttachments).toEqual([
      { ...video, ...repliedTo },
      { url: thumbnail, contentType: 'image/png' }
    ])
  })

  it('takes a replied-to embed thumbnail when no real media is available', () => {
    const thumbnail = 'https://cdn.test/reply-thumb.jpg'

    const extracted = extract(message(), referenceMessage([], 'user-2', [thumbnailEmbed(thumbnail)]))

    expect(extracted.mediaAttachments).toEqual([{ url: thumbnail, contentType: 'image/png' }])
  })
})

describe('voice message duration', () => {
  it('carries a replied-to voice message duration onto the attachment', () => {
    const voice = { url: 'https://cdn.discordapp.com/v.ogg', contentType: 'audio/ogg', size: 30_000, duration: 52 }
    const result = extractMessageContent(message() as never, referenceMessage([voice]) as never, false, 'bot', [])
    expect(result.mediaAttachments).toEqual([
      {
        url: voice.url,
        contentType: 'audio/ogg',
        size: 30_000,
        durationSec: 52,
        origin: 'reply',
        sourceMessageId: 'reference-1',
        sourceAuthorId: 'user-2'
      }
    ])
  })

  it('leaves the duration off when Discord states none', () => {
    const clip = { url: 'https://cdn.discordapp.com/c.mp4', contentType: 'video/mp4', size: 1_000, duration: null }
    const result = extractMessageContent(message({ attachments: [clip] }) as never, null, false, 'bot', [])
    expect(result.mediaAttachments[0]).not.toHaveProperty('durationSec')
  })
})

describe('where watched media came from', () => {
  const clip = { url: 'https://cdn.discordapp.com/c.mp4', contentType: 'video/mp4', size: 1_000 }

  it("marks the asker's own upload with their message and id", () => {
    const result = extract(message({ attachments: [clip] }))

    expect(result.mediaAttachments[0]).toMatchObject({
      origin: 'upload',
      sourceMessageId: 'trigger-1',
      sourceAuthorId: 'asker-1'
    })
  })

  it('marks a forwarded clip as forwarded, with no author it can vouch for', () => {
    const result = extract(message({ snapshots: [snapshot([clip])] }))

    expect(result.mediaAttachments[0]).toMatchObject({
      origin: 'forward',
      sourceMessageId: 'trigger-1',
      sourceAuthorId: null
    })
  })

  it('leaves images without provenance, since only audio and video are remembered', () => {
    const image = { url: 'https://cdn.discordapp.com/i.png', contentType: 'image/png', size: 10 }

    expect(extract(message({ attachments: [image] })).mediaAttachments[0]).not.toHaveProperty('origin')
  })
})

describe('image resizing through the Discord proxy', () => {
  const proxy = 'https://media.discordapp.net/attachments/1/2/IMG.png?ex=1&is=2&hm=3'
  const resized = `${proxy}&width=472&height=1024`

  it('downloads an upload at vision size through the proxy', () => {
    const image = {
      url: 'https://cdn.discordapp.com/attachments/1/2/IMG.png?ex=1&is=2&hm=3',
      proxyURL: proxy,
      contentType: 'image/png',
      size: 9_968_897,
      width: 1179,
      height: 2556
    }

    expect(extract(message({ attachments: [image] })).mediaAttachments).toEqual([
      { url: resized, contentType: 'image/png', size: 9_968_897, proxyResized: true }
    ])
  })

  it('keeps the original URL when Discord states no dimensions', () => {
    const image = { url: 'https://cdn.discordapp.com/i.png', proxyURL: proxy, contentType: 'image/png', size: 10 }

    expect(extract(message({ attachments: [image] })).mediaAttachments).toEqual([
      { url: 'https://cdn.discordapp.com/i.png', contentType: 'image/png', size: 10 }
    ])
  })

  it('resizes a Components V2 gallery image', () => {
    const trigger = {
      ...message(),
      components: [
        {
          toJSON: () => ({
            type: 17,
            components: [
              {
                type: 12,
                items: [
                  {
                    media: {
                      url: 'https://cdn.discordapp.com/attachments/1/2/IMG.png?ex=1&is=2&hm=3',
                      proxy_url: proxy,
                      content_type: 'image/png',
                      width: 1179,
                      height: 2556
                    }
                  }
                ]
              }
            ]
          })
        }
      ]
    }

    expect(extract(trigger).mediaAttachments).toEqual([
      { url: resized, contentType: 'image/png', size: undefined, proxyResized: true }
    ])
  })

  it("resizes an embed image through Discord's external proxy, not the sender's host", () => {
    const external = 'https://images-ext-1.discordapp.net/external/abc/https/static.klipy.com/x.webp'
    const embed = {
      ...thumbnailEmbed('https://static.klipy.com/x.webp'),
      thumbnail: { url: 'https://static.klipy.com/x.webp', proxyURL: external, width: 2048, height: 1024 }
    }

    expect(extract(message({ embeds: [embed] })).mediaAttachments).toEqual([
      { url: `${external}?width=1024&height=512`, contentType: 'image/png', proxyResized: true }
    ])
  })
})
