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

function referenceMessage(attachments: Attachment[], authorId = 'user-2') {
  return {
    author: { id: authorId, displayName: 'X' },
    member: null,
    content: 'look at this',
    embeds: [],
    poll: null,
    messageSnapshots: new Collection(),
    components: [],
    stickers: new Collection(),
    attachments: collection(attachments)
  }
}

function extract(trigger: object, reference: object | null = null, isReplyToBot = false) {
  return extractMessageContent(trigger as never, reference as never, isReplyToBot, 'bot', [])
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

  it('takes a replied-to voice message and names its media kind', () => {
    const audio = { url: 'https://cdn.test/voice.ogg', contentType: 'audio/ogg' }

    const extracted = extract(message(), referenceMessage([audio]))

    expect(extracted.imageAttachments).toEqual([audio])
    expect(extracted.content).toContain('[Replying to X: look at this\n(attached audio clip(s))]')
  })

  it('names unsupported replied-to files without taking them', () => {
    const zip = { url: 'https://cdn.test/archive.zip', contentType: 'application/zip' }

    const extracted = extract(message(), referenceMessage([zip]))

    expect(extracted.imageAttachments).toEqual([])
    expect(extracted.content).toContain("(attached file(s) of a type that can't be opened)")
  })

  it("names video attachments on Roka's own message without taking them", () => {
    const video = { url: 'https://cdn.test/clip.mp4', contentType: 'video/mp4' }

    const extracted = extract(message(), referenceMessage([video], 'bot'), true)

    expect(extracted.imageAttachments).toEqual([])
    expect(extracted.content).toContain('(attached video(s), 1 not shown)')
  })
})
