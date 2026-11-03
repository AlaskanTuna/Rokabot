import { Collection } from 'discord.js'
import { describe, expect, it } from 'vitest'
import { collectEmbedVideoUrls, embedVideoUrl, extractMessageContent } from '../messageContent.js'

function videoEmbed(url: string, overrides: object = {}) {
  return {
    author: null,
    title: null,
    description: 'a clip',
    fields: [],
    footer: null,
    video: { url, proxyURL: url, width: 640, height: 360 },
    image: { url: 'https://cdn.test/thumb.jpg' },
    thumbnail: null,
    data: { type: 'video' },
    url: 'https://example.com/post',
    ...overrides
  }
}

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
  it('prefers the proxy URL over the direct URL', () => {
    const embed = videoEmbed('https://video.example/direct.mp4', {
      video: { url: 'https://video.example/direct.mp4', proxyURL: 'https://proxy.example/clip.mp4' }
    })

    expect(embedVideoUrl(embed as never)).toBe('https://proxy.example/clip.mp4')
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
    const urls = collectEmbedVideoUrls(message({ embeds: [videoEmbed('https://video.example/a.mp4')] }) as never, null)

    expect(urls).toEqual(['https://video.example/a.mp4'])
  })

  it('takes a playable video from a replied-to message', () => {
    const urls = collectEmbedVideoUrls(
      message() as never,
      referenceMessage([videoEmbed('https://video.example/reply.mp4')]) as never
    )

    expect(urls).toEqual(['https://video.example/reply.mp4'])
  })

  it('takes a playable video from a forwarded snapshot', () => {
    const urls = collectEmbedVideoUrls(
      message({ snapshots: [snapshotWithEmbed(videoEmbed('https://video.example/fwd.mp4'))] }) as never,
      null
    )

    expect(urls).toEqual(['https://video.example/fwd.mp4'])
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
    const embed = videoEmbed('https://video.example/a.mp4')
    const trigger = message({ embeds: [embed] }) as never

    const extracted = extractMessageContent(
      trigger,
      null,
      false,
      'bot',
      [],
      undefined,
      new Set(['https://video.example/a.mp4'])
    )

    expect(extracted.mediaAttachments).toEqual([])
    expect(extracted.content).toContain('video')
  })

  it('keeps the thumbnail when the video URL does not resolve to video', () => {
    const embed = videoEmbed('https://www.youtube.com/embed/abc')
    const trigger = message({ embeds: [embed] }) as never

    const extracted = extractMessageContent(trigger, null, false, 'bot', [], undefined, new Set())

    expect(extracted.mediaAttachments).toEqual([{ url: 'https://cdn.test/thumb.jpg', contentType: 'image/png' }])
  })
})
