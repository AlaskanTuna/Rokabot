import { Collection } from 'discord.js'
import { describe, expect, it } from 'vitest'
import { collectEmbedVideoUrls, embedVideoUrl, extractMessageContent } from '../messageContent.js'

function videoEmbed(proxyURL: string, overrides: object = {}) {
  return {
    author: null,
    title: null,
    description: 'a clip',
    fields: [],
    footer: null,
    video: { url: 'https://video.example/direct.mp4', proxyURL, width: 640, height: 360 },
    image: { url: 'https://cdn.test/thumb.jpg' },
    thumbnail: null,
    data: { type: 'video' },
    url: 'https://example.com/post',
    ...overrides
  }
}

const PROXY_A = 'https://images-ext-1.discordapp.net/embed_proxy/a.mp4'
const PROXY_B = 'https://media.discordapp.net/embed_proxy/b.mp4'

function gifvEmbed() {
  return {
    author: null,
    title: null,
    description: null,
    fields: [],
    footer: null,
    video: { url: 'https://media.tenor.com/abc/roka-wink.mp4', width: 480, height: 270 },
    image: null,
    thumbnail: { url: 'https://media.tenor.com/abc/still.png' },
    data: { type: 'gifv' },
    url: 'https://tenor.com/view/abc'
  }
}

function message({ embeds = [], snapshots = [] }: { embeds?: object[]; snapshots?: object[] } = {}) {
  return {
    id: 'trigger-1',
    author: { id: 'asker-1', displayName: 'Asker' },
    content: 'Roka look at this https://example.com/post',
    mentions: { members: new Collection(), users: new Collection() },
    attachments: new Collection(),
    components: [],
    embeds,
    messageSnapshots: new Collection(snapshots.map((snapshot, index) => [String(index), snapshot])),
    poll: null,
    stickers: new Collection()
  }
}

function referenceMessage(embeds: object[] = [], snapshots: object[] = []) {
  return {
    id: 'reference-1',
    author: { id: 'user-2', displayName: 'X' },
    member: null,
    content: 'look at this',
    embeds,
    poll: null,
    messageSnapshots: new Collection(snapshots.map((snapshot, index) => [String(index), snapshot])),
    components: [],
    stickers: new Collection(),
    attachments: new Collection()
  }
}

function snapshotWithEmbed(embed: object) {
  return { content: '', components: [], embeds: [embed], attachments: new Collection() }
}

describe('embedVideoUrl', () => {
  it('takes the proxy URL on a discordapp.net subdomain', () => {
    expect(embedVideoUrl(videoEmbed(PROXY_A) as never)).toBe(PROXY_A)
  })

  it('takes the proxy URL on media.discordapp.net', () => {
    expect(embedVideoUrl(videoEmbed(PROXY_B) as never)).toBe(PROXY_B)
  })

  it('takes the proxy URL on a discordapp.com subdomain', () => {
    const proxyURL = 'https://images-ext-1.discordapp.com/embed_proxy/c.mp4'
    expect(embedVideoUrl(videoEmbed(proxyURL) as never)).toBe(proxyURL)
  })

  it('returns null when the embed carries only url and no proxyURL', () => {
    const embed = videoEmbed(PROXY_A, { video: { url: 'https://video.example/direct.mp4' } })

    expect(embedVideoUrl(embed as never)).toBeNull()
  })

  it('returns null for a proxy URL on another host', () => {
    expect(embedVideoUrl(videoEmbed('https://proxy.example/clip.mp4') as never)).toBeNull()
  })

  it('leaves gifv embeds as text and never watches them', () => {
    expect(embedVideoUrl(gifvEmbed() as never)).toBeNull()
  })

  it('returns null when the embed carries no video', () => {
    expect(embedVideoUrl({ video: null, data: { type: 'rich' } } as never)).toBeNull()
  })
})

describe('collectEmbedVideoUrls', () => {
  it('takes a playable video from the message itself', () => {
    const urls = collectEmbedVideoUrls(message({ embeds: [videoEmbed(PROXY_A)] }) as never, null)

    expect(urls).toEqual([PROXY_A])
  })

  it('takes a playable video from a replied-to message', () => {
    const urls = collectEmbedVideoUrls(message() as never, referenceMessage([videoEmbed(PROXY_B)]) as never)

    expect(urls).toEqual([PROXY_B])
  })

  it('takes a playable video from a forwarded snapshot', () => {
    const urls = collectEmbedVideoUrls(message({ snapshots: [snapshotWithEmbed(videoEmbed(PROXY_A))] }) as never, null)

    expect(urls).toEqual([PROXY_A])
  })

  it('returns at most 3 URLs, since each costs a HEAD request', () => {
    const embeds = [0, 1, 2, 3, 4].map((index) =>
      videoEmbed(`https://images-ext-${index}.discordapp.net/embed_proxy/${index}.mp4`)
    )
    const urls = collectEmbedVideoUrls(message({ embeds }) as never, null)

    expect(urls).toHaveLength(3)
  })

  it('skips a gifv embed everywhere it is read', () => {
    const urls = collectEmbedVideoUrls(
      message({
        embeds: [gifvEmbed()],
        snapshots: [snapshotWithEmbed(gifvEmbed())]
      }) as never,
      referenceMessage([gifvEmbed()]) as never
    )

    expect(urls).toEqual([])
  })
})

describe('embed video thumbnail suppression', () => {
  it('does not also send the thumbnail as an image when the video is used', () => {
    const embed = videoEmbed(PROXY_A)
    const trigger = message({ embeds: [embed] }) as never

    const extracted = extractMessageContent(trigger, null, false, 'bot', [], undefined, new Set([PROXY_A]))

    expect(extracted.mediaAttachments).toEqual([])
    expect(extracted.content).toContain('video')
  })

  it('keeps the thumbnail when the video URL does not resolve to video', () => {
    const embed = videoEmbed(PROXY_A)
    const trigger = message({ embeds: [embed] }) as never

    const extracted = extractMessageContent(trigger, null, false, 'bot', [], undefined, new Set())

    expect(extracted.mediaAttachments).toEqual([{ url: 'https://cdn.test/thumb.jpg', contentType: 'image/png' }])
  })
})
