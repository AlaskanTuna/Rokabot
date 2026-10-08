import { Collection } from 'discord.js'
import { describe, expect, it } from 'vitest'
import { extractMessageContent } from '../messageContent.js'

interface Attachment {
  url: string
  contentType: string | null
  size?: number
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
  snapshots = []
}: {
  attachments?: Attachment[]
  snapshots?: ReturnType<typeof snapshot>[]
} = {}) {
  return {
    content: 'what is this?',
    mentions: { members: new Collection(), users: new Collection() },
    attachments: collection(attachments),
    components: [],
    embeds: [],
    messageSnapshots: collection(snapshots),
    poll: null,
    stickers: new Collection()
  }
}

function extract(trigger: object) {
  return extractMessageContent(trigger as never, null, false, 'bot', [])
}

describe('media message content', () => {
  it('takes a forwarded video and names its media kind', () => {
    const video = { url: 'https://cdn.test/clip.mp4', contentType: 'video/mp4' }

    const extracted = extract(message({ snapshots: [snapshot([video])] }))

    expect(extracted.imageAttachments).toEqual([video])
    expect(extracted.content).toContain('(forwarded video(s))')
  })

  it('names each forwarded media kind and how many did not fit', () => {
    const image = { url: 'https://cdn.test/photo.png', contentType: 'image/png' }
    const video = { url: 'https://cdn.test/clip.mp4', contentType: 'video/mp4' }

    const extracted = extract(message({ snapshots: [snapshot([image, video])] }))

    expect(extracted.imageAttachments).toEqual([image])
    expect(extracted.content).toContain('(forwarded image(s))')
    expect(extracted.content).toContain('(forwarded video(s), 1 not shown)')
  })
})
