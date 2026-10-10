import { AttachmentBuilder } from 'discord.js'
import { buildRokaMessage } from '../../../src/discord/messageBuilder.js'
import { getToneStyle } from '../../../src/discord/toneStyles.js'
import type { CaptureRecord } from '../captureSink.js'
import { transcriptMessages } from '../preview/conversation.js'
import { type PreviewMessage, renderComponents, renderPreviewPage } from '../preview/render.js'

const roka = { name: 'Roka', bot: true }
const tester = { name: 'Tester' }
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 11, 6, minutes))

describe('renderComponents', () => {
  it('draws a container with its accent colour', () => {
    const html = renderComponents([{ type: 17, accent_color: 0xff8800, components: [{ type: 10, content: 'hi' }] }])
    expect(html).toContain('class="cv2-container has-accent" style="--accent-color: #ff8800"')
    expect(html).toContain('<div class="cv2-text markup reduced">hi</div>')
  })

  it('places a section thumbnail beside its text', () => {
    const html = renderComponents([
      {
        type: 9,
        components: [{ type: 10, content: '**bold**' }],
        accessory: { type: 11, media: { url: 'https://example.com/a.webp' }, description: 'Roka smiling' }
      }
    ])
    expect(html).toMatch(
      /<div class="cv2-section"><div class="cv2-section-content"><div class="cv2-text markup"><strong>bold<\/strong><\/div><\/div><div class="cv2-section-accessory"><div class="cv2-thumbnail"><img src="https:\/\/example.com\/a.webp" alt="Roka smiling"/
    )
  })

  it('keeps top-level text at full size and centres a section beside a button', () => {
    const html = renderComponents([
      { type: 10, content: 'top' },
      {
        type: 9,
        components: [{ type: 10, content: 'row' }],
        accessory: { type: 2, style: 2, label: 'Open', custom_id: 'o' }
      }
    ])
    expect(html).toContain('<div class="cv2-text markup">top</div>')
    expect(html).toContain('<div class="cv2-section center">')
  })

  it('renders separator spacing and divider flags', () => {
    expect(renderComponents([{ type: 14, divider: true, spacing: 1 }])).toBe(
      '<div class="cv2-separator spacing-small divider" role="separator"></div>'
    )
    expect(renderComponents([{ type: 14, divider: false, spacing: 2 }])).toBe(
      '<div class="cv2-separator spacing-large" role="separator"></div>'
    )
  })

  it('lays out a media gallery by item count', () => {
    const items = [1, 2, 3].map((n) => ({ media: { url: `https://example.com/${n}.png` } }))
    const html = renderComponents([{ type: 12, items }])
    expect(html).toContain('class="cv2-gallery count-3"')
    expect(html.match(/class="cv2-gallery-item"/g)).toHaveLength(3)
  })

  it('renders buttons by style, with link buttons as anchors', () => {
    const html = renderComponents([
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: 'Next', custom_id: 'next' },
          { type: 2, style: 2, label: 'Back', custom_id: 'back', disabled: true },
          { type: 2, style: 5, label: 'Open', url: 'https://example.com' }
        ]
      }
    ])
    expect(html).toContain(
      '<button class="cv2-button style-primary" type="button"><span class="cv2-button-label">Next</span></button>'
    )
    expect(html).toContain('<button class="cv2-button style-secondary" type="button" disabled>')
    expect(html).toContain(
      '<a class="cv2-button style-link" href="https://example.com" target="_blank" rel="noreferrer">'
    )
  })

  it('renders a string select with its placeholder', () => {
    const html = renderComponents([
      { type: 1, components: [{ type: 3, custom_id: 'pick', placeholder: 'Choose a buddy', options: [] }] }
    ])
    expect(html).toContain('<div class="cv2-select"><span class="cv2-select-placeholder">Choose a buddy</span>')
  })

  it('resolves attachment:// media from the payload files', () => {
    const html = renderComponents(
      [{ type: 12, items: [{ media: { url: 'attachment://card.png' } }] }],
      new Map([['card.png', 'data:image/png;base64,AAAA']])
    )
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })
})

describe('renderPreviewPage', () => {
  const messages: PreviewMessage[] = [
    { author: tester, timestamp: at(0), payload: 'hello <@1>' },
    { author: tester, timestamp: at(1), payload: 'second line' },
    {
      author: roka,
      timestamp: at(2),
      payload: buildRokaMessage('Hi there\n---\nSecond block', 'playful', ['search_web'])
    }
  ]

  it('produces a standalone document with the channel header', () => {
    const html = renderPreviewPage(messages, { channelName: 'roka-test', mentions: { users: { '1': 'Roka' } } })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<h1 class="channel-name">roka-test</h1>')
    expect(html).toContain('<span class="mention">@Roka</span>')
  })

  it('groups consecutive messages from one author and tags bots as apps', () => {
    const html = renderPreviewPage(messages)
    expect(html.match(/class="message group-start"/g)).toHaveLength(2)
    expect(html.match(/class="message"/g)).toHaveLength(1)
    expect(html).toContain('<span class="bot-tag"><span class="bot-tag-text">APP</span></span>')
  })

  it("renders Roka's real Components V2 reply with tone accent, divider and tool footer", () => {
    const html = renderPreviewPage(messages)
    const color = getToneStyle('playful').color.toString(16).padStart(6, '0')
    expect(html).toContain(`--accent-color: #${color}`)
    expect(html).toContain('<div class="cv2-text markup reduced">Hi there</div>')
    expect(html).toContain('<div class="cv2-text markup reduced">Second block</div>')
    expect(html).toContain('<small class="subtext">')
    expect(html).toContain('searched the web</small>')
  })

  it('reads attachments from AttachmentBuilder files', () => {
    const file = new AttachmentBuilder(Buffer.from([1, 2, 3]), { name: 'card.png' })
    const html = renderPreviewPage([
      {
        author: roka,
        timestamp: at(0),
        payload: { components: [{ type: 12, items: [{ media: { url: 'attachment://card.png' } }] }], files: [file] }
      }
    ])
    expect(html).toContain('src="data:image/png;base64,AQID"')
  })

  it('stamps today with the time alone and earlier days the way the client does', () => {
    const now = new Date(Date.UTC(2026, 9, 11, 9, 0))
    const stamp = (timestamp: Date) =>
      renderPreviewPage([{ author: tester, timestamp, payload: 'x' }], { now, timeZone: 'UTC' }).match(
        /<time class="message-timestamp"[^>]*>([^<]*)</
      )?.[1]
    expect(stamp(new Date(Date.UTC(2026, 9, 11, 7, 42)))).toBe('7:42 AM')
    expect(stamp(new Date(Date.UTC(2026, 9, 10, 15, 5)))).toBe('Yesterday at 3:05 PM')
    expect(stamp(new Date(Date.UTC(2026, 9, 8, 15, 5)))).toBe('10/08/2026 3:05 PM')
  })

  it('shows a reply reference and a slash command header', () => {
    const html = renderPreviewPage([
      { author: roka, timestamp: at(0), payload: 'pong', replyTo: { author: tester, text: 'ping' } },
      { author: roka, timestamp: at(1), payload: 'answer', interaction: { user: tester, command: 'ask' } }
    ])
    expect(html).toContain('class="reply-context"')
    expect(html).toContain('<span class="reply-text markup">ping</span>')
    expect(html).toContain('<span class="command-name">/ask</span>')
  })
})

describe('transcriptMessages', () => {
  const line = (kind: 'message' | 'slash', content: string) => ({
    kind,
    guildId: 'g',
    channelId: 'c',
    userId: 'u',
    displayName: 'Tester',
    content
  })
  const record = (kind: CaptureRecord['kind'], payload: unknown): CaptureRecord => ({
    kind,
    payload,
    channelId: 'c',
    ts: 0
  })

  it('shows a mention as the user message, a reaction on it, and Roka replying to it', () => {
    const messages = transcriptMessages(
      [
        {
          line: line('message', 'hi Roka'),
          records: [record('typing', null), record('react', '🌸'), record('reply', 'hello')]
        }
      ],
      roka,
      at(0)
    )
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      author: tester,
      payload: 'hi Roka',
      reactions: [{ emoji: '🌸', count: 1, me: true }]
    })
    expect(messages[1]).toMatchObject({ author: roka, payload: 'hello', replyTo: { author: tester, text: 'hi Roka' } })
  })

  it('shows /ask as one interaction response that later edits replace', () => {
    const messages = transcriptMessages(
      [{ line: line('slash', 'question'), records: [record('reply', 'thinking'), record('editReply', 'answer')] }],
      roka,
      at(0)
    )
    expect(messages).toEqual([
      { author: roka, timestamp: at(0), payload: 'answer', interaction: { user: tester, command: 'ask' } }
    ])
  })

  it('posts follow-up chunks as their own messages', () => {
    const messages = transcriptMessages(
      [{ line: line('message', 'long'), records: [record('reply', 'part 1'), record('send', 'part 2')] }],
      roka,
      at(0)
    )
    expect(messages.map((message) => message.payload)).toEqual(['long', 'part 1', 'part 2'])
    expect(messages[2].replyTo).toBeUndefined()
  })
})
