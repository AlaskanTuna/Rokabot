import { type MarkdownContext, escapeHtml, renderMarkdown } from './markdown.js'
import { PREVIEW_SCRIPT, PREVIEW_STYLES } from './styles.js'

export interface PreviewAuthor {
  name: string
  avatarUrl?: string
  bot?: boolean
  color?: string
}

export interface PreviewReaction {
  emoji: string
  count: number
  me?: boolean
}

export interface PreviewMessage {
  author: PreviewAuthor
  timestamp: Date
  /** A string, a Discord message payload, or discord.js builders — anything `send`/`reply` accepts. */
  payload: unknown
  replyTo?: { author: PreviewAuthor; text: string }
  interaction?: { user: PreviewAuthor; command: string }
  reactions?: PreviewReaction[]
}

export interface PreviewPageOptions {
  title?: string
  channelName?: string
  mentions?: MarkdownContext
  theme?: 'dark' | 'ash' | 'onyx' | 'light'
  now?: Date
  timeZone?: string
  /** Reload the page every N seconds, for a preview file that a running chat keeps rewriting. */
  refreshSeconds?: number
}

type JsonObject = Record<string, unknown>

const GROUP_WINDOW_MS = 7 * 60_000
const DEFAULT_AVATARS = 6
const BUTTON_STYLES: Record<number, string> = {
  1: 'primary',
  2: 'secondary',
  3: 'success',
  4: 'danger',
  5: 'link',
  6: 'premium'
}
const SELECT_TYPES = new Set([3, 5, 6, 7, 8])
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml'
}

const LINK_ICON =
  '<svg class="cv2-button-link-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M15 2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0V4.41l-4.3 4.3a1 1 0 1 1-1.4-1.42L19.58 3H16a1 1 0 0 1-1-1Z"/><path fill="currentColor" d="M5 2a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-6a1 1 0 1 0-2 0v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6a1 1 0 1 0 0-2H5Z"/></svg>'
const CHEVRON_ICON =
  '<svg class="cv2-select-chevron" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M5.3 9.3a1 1 0 0 1 1.4 0l5.3 5.29 5.3-5.3a1 1 0 1 1 1.4 1.42l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.42Z"/></svg>'
const FILE_ICON =
  '<svg class="cv2-file-icon" aria-hidden="true" width="30" height="40" viewBox="0 0 72 96"><path fill="#7289da" d="M72 29.3V88c0 4.4-3.6 8-8 8H8c-4.4 0-8-3.6-8-8V8c0-4.4 3.6-8 8-8h34.7L72 29.3z"/><path fill="#fff" fill-opacity=".4" d="M42.7 0v21.3c0 4.4 3.6 8 8 8H72L42.7 0z"/></svg>'
const HASH_ICON =
  '<svg class="channel-icon" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M10.99 3.16A1 1 0 1 0 9 2.84L8.15 8H4a1 1 0 0 0 0 2h3.82l-.67 4H3a1 1 0 1 0 0 2h3.82l-.8 4.84a1 1 0 0 0 1.97.32L8.85 16h4.97l-.8 4.84a1 1 0 0 0 1.97.32l.86-5.16H20a1 1 0 1 0 0-2h-3.82l.67-4H21a1 1 0 1 0 0-2h-3.82l.8-4.84a1 1 0 1 0-1.97-.32L15.15 8h-4.97l.8-4.84ZM14.15 14l.67-4H9.85l-.67 4h4.97Z" clip-rule="evenodd"/></svg>'

function asObject(value: unknown): JsonObject | null {
  if (typeof value !== 'object' || value === null) return null
  const toJSON = (value as JsonObject).toJSON
  return typeof toJSON === 'function' ? asObject(toJSON.call(value)) : (value as JsonObject)
}

function asObjects(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const object = asObject(item)
    return object ? [object] : []
  })
}

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

interface RenderContext {
  files: ReadonlyMap<string, string>
  mentions: MarkdownContext
}

function mediaUrl(media: unknown, ctx: RenderContext): string {
  const url = str(asObject(media)?.url) ?? ''
  return url.startsWith('attachment://') ? (ctx.files.get(url.slice('attachment://'.length)) ?? url) : url
}

function emojiHtml(emoji: unknown): string {
  const object = asObject(emoji)
  if (!object) return ''
  const id = str(object.id)
  if (id) {
    const animated = object.animated === true ? '&animated=true' : ''
    return `<img class="emoji" src="https://cdn.discordapp.com/emojis/${id}.webp?size=48${animated}&quality=lossless" alt=":${escapeHtml(str(object.name) ?? '')}:" draggable="false">`
  }
  return renderMarkdown(str(object.name) ?? '')
}

function mediaHtml(url: string, description: string | null): string {
  const alt = escapeHtml(description ?? '')
  return /\.(mp4|webm|mov)(\?|$)/i.test(url)
    ? `<video src="${escapeHtml(url)}" controls muted preload="metadata"></video>`
    : `<img src="${escapeHtml(url)}" alt="${alt}" loading="lazy" draggable="false">`
}

function spoilerWrap(html: string, spoiler: unknown): string {
  return spoiler === true
    ? `<div class="media-spoiler" tabindex="0">${html}<span class="media-spoiler-label">SPOILER</span></div>`
    : html
}

function renderButton(button: JsonObject): string {
  const style = BUTTON_STYLES[Number(button.style)] ?? 'secondary'
  const emoji = button.emoji ? `<span class="cv2-button-emoji">${emojiHtml(button.emoji)}</span>` : ''
  const label = str(button.label)
    ? `<span class="cv2-button-label">${renderMarkdown(str(button.label) ?? '', {})}</span>`
    : ''
  if (style === 'link') {
    const href = escapeHtml(str(button.url) ?? '#')
    return `<a class="cv2-button style-link${button.disabled ? ' disabled' : ''}" href="${href}" target="_blank" rel="noreferrer">${emoji}${label}${LINK_ICON}</a>`
  }
  return `<button class="cv2-button style-${style}" type="button"${button.disabled ? ' disabled' : ''}>${emoji}${label}</button>`
}

function renderSelect(select: JsonObject): string {
  const chosen = asObjects(select.options).filter((option) => option.default === true)
  const shown = chosen.length
    ? `<span class="cv2-select-value">${chosen.map((option) => escapeHtml(str(option.label) ?? '')).join(', ')}</span>`
    : `<span class="cv2-select-placeholder">${escapeHtml(str(select.placeholder) ?? 'Make a selection')}</span>`
  return `<div class="cv2-select${select.disabled ? ' disabled' : ''}">${shown}${CHEVRON_ICON}</div>`
}

function renderGallery(items: JsonObject[], ctx: RenderContext): string {
  const count = Math.min(items.length, 10)
  const cells = items
    .slice(0, 10)
    .map(
      (item) =>
        `<div class="cv2-gallery-item">${spoilerWrap(mediaHtml(mediaUrl(item.media, ctx), str(item.description)), item.spoiler)}</div>`
    )
    .join('')
  return `<div class="cv2-gallery count-${count}">${cells}</div>`
}

function formatBytes(size: unknown): string {
  if (typeof size !== 'number') return ''
  const units = ['bytes', 'KB', 'MB', 'GB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit === 0 ? value : value.toFixed(2)} ${units[unit]}`
}

function renderComponent(component: JsonObject, ctx: RenderContext): string {
  switch (component.type) {
    case 1:
      return `<div class="cv2-action-row">${asObjects(component.components)
        .map((child) => (SELECT_TYPES.has(Number(child.type)) ? renderSelect(child) : renderButton(child)))
        .join('')}</div>`
    case 2:
      return renderButton(component)
    case 9: {
      const accessory = asObject(component.accessory)
      return `<div class="cv2-section"><div class="cv2-section-content">${renderList(component.components, ctx)}</div><div class="cv2-section-accessory">${accessory ? renderComponent(accessory, ctx) : ''}</div></div>`
    }
    case 10:
      return `<div class="cv2-text markup">${renderMarkdown(str(component.content) ?? '', ctx.mentions)}</div>`
    case 11:
      return `<div class="cv2-thumbnail">${spoilerWrap(mediaHtml(mediaUrl(component.media, ctx), str(component.description)), component.spoiler)}</div>`
    case 12:
      return renderGallery(asObjects(component.items), ctx)
    case 13: {
      const name = str(asObject(component.file)?.url)?.replace('attachment://', '') ?? 'file'
      return spoilerWrap(
        `<div class="cv2-file">${FILE_ICON}<div class="cv2-file-meta"><span class="cv2-file-name">${escapeHtml(str(component.name) ?? name)}</span><span class="cv2-file-size">${formatBytes(component.size)}</span></div></div>`,
        component.spoiler
      )
    }
    case 14: {
      const spacing = component.spacing === 2 ? 'large' : 'small'
      const divider = component.divider === false ? '' : ' divider'
      return `<div class="cv2-separator spacing-${spacing}${divider}" role="separator"></div>`
    }
    case 17: {
      const accent = typeof component.accent_color === 'number' ? component.accent_color : null
      const classes = `cv2-container${accent === null ? '' : ' has-accent'}${component.spoiler ? ' spoiler-container' : ''}`
      const style = accent === null ? '' : ` style="--accent-color: ${hex(accent)}"`
      return `<div class="${classes}"${style}>${renderList(component.components, ctx)}</div>`
    }
    default:
      return SELECT_TYPES.has(Number(component.type)) ? renderSelect(component) : ''
  }
}

function renderList(components: unknown, ctx: RenderContext): string {
  return asObjects(components)
    .map((component) => renderComponent(component, ctx))
    .join('')
}

/** Render top-level message components (Components V2 or legacy action rows) to HTML. */
export function renderComponents(
  components: unknown,
  files: ReadonlyMap<string, string> = new Map(),
  mentions: MarkdownContext = {}
): string {
  return renderList(components, { files, mentions })
}

function renderEmbed(embed: JsonObject, ctx: RenderContext): string {
  const color = typeof embed.color === 'number' ? ` style="--embed-color: ${hex(embed.color)}"` : ''
  const md = (value: unknown) => renderMarkdown(str(value) ?? '', ctx.mentions)
  const author = asObject(embed.author)
  const footer = asObject(embed.footer)
  const thumbnail = asObject(embed.thumbnail)
  const image = asObject(embed.image)
  const parts = [
    author ? `<div class="embed-author">${escapeHtml(str(author.name) ?? '')}</div>` : '',
    str(embed.title) ? `<div class="embed-title">${md(embed.title)}</div>` : '',
    str(embed.description) ? `<div class="embed-description markup">${md(embed.description)}</div>` : '',
    asObjects(embed.fields).length
      ? `<div class="embed-fields">${asObjects(embed.fields)
          .map(
            (field) =>
              `<div class="embed-field${field.inline ? ' inline' : ''}"><div class="embed-field-name">${md(field.name)}</div><div class="embed-field-value markup">${md(field.value)}</div></div>`
          )
          .join('')}</div>`
      : '',
    image ? `<div class="embed-image">${mediaHtml(mediaUrl(image, ctx), null)}</div>` : '',
    footer ? `<div class="embed-footer">${escapeHtml(str(footer.text) ?? '')}</div>` : ''
  ]
  const thumb = thumbnail ? `<div class="embed-thumbnail">${mediaHtml(mediaUrl(thumbnail, ctx), null)}</div>` : ''
  return `<article class="embed"${color}><div class="embed-grid">${parts.join('')}${thumb}</div></article>`
}

function fileDataUri(file: unknown): [string, string] | null {
  // Not asObject: AttachmentBuilder.toJSON() keeps the metadata and drops the buffer.
  const object = typeof file === 'object' && file !== null ? (file as JsonObject) : null
  const name = str(object?.name)
  const data = object?.attachment ?? object?.data
  if (!name || !Buffer.isBuffer(data)) return null
  const type = IMAGE_TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
  return [name, `data:${type};base64,${data.toString('base64')}`]
}

function payloadFiles(payload: JsonObject): Map<string, string> {
  const files = Array.isArray(payload.files) ? payload.files : []
  return new Map(
    files.flatMap((file) => {
      const entry = fileDataUri(file)
      return entry ? [entry] : []
    })
  )
}

function initials(name: string): number {
  return [...name].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0) % DEFAULT_AVATARS
}

function avatarUrl(author: PreviewAuthor): string {
  return author.avatarUrl ?? `https://cdn.discordapp.com/embed/avatars/${initials(author.name)}.png`
}

function sameDay(left: Date, right: Date, timeZone?: string): boolean {
  const day = (date: Date) => date.toLocaleDateString('en-CA', { timeZone })
  return day(left) === day(right)
}

function shortTime(date: Date, timeZone?: string): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).replaceAll(' ', ' ')
}

function headerTime(date: Date, options: PreviewPageOptions): string {
  const now = options.now ?? new Date()
  const time = shortTime(date, options.timeZone)
  if (sameDay(date, now, options.timeZone)) return `Today at ${time}`
  if (sameDay(date, new Date(now.getTime() - 86_400_000), options.timeZone)) return `Yesterday at ${time}`
  return `${date.toLocaleDateString('en-US', { timeZone: options.timeZone })} ${time}`
}

function authorKey(author: PreviewAuthor): string {
  return `${author.bot ? 'bot' : 'user'}:${author.name}`
}

function startsGroup(message: PreviewMessage, previous: PreviewMessage | undefined): boolean {
  return (
    !previous ||
    message.replyTo !== undefined ||
    message.interaction !== undefined ||
    authorKey(message.author) !== authorKey(previous.author) ||
    message.timestamp.getTime() - previous.timestamp.getTime() > GROUP_WINDOW_MS
  )
}

function nameHtml(author: PreviewAuthor, className: string): string {
  const color = author.color ? ` style="color: ${escapeHtml(author.color)}"` : ''
  return `<span class="${className}"${color}>${escapeHtml(author.name)}</span>`
}

const BOT_TAG = '<span class="bot-tag"><span class="bot-tag-text">APP</span></span>'

function renderReactions(reactions: readonly PreviewReaction[] | undefined): string {
  if (!reactions?.length) return ''
  const pills = reactions
    .map(
      (reaction) =>
        `<div class="reaction${reaction.me ? ' reacted' : ''}">${renderMarkdown(reaction.emoji).replace(' jumbo', '')}<span class="reaction-count">${reaction.count}</span></div>`
    )
    .join('')
  return `<div class="reactions">${pills}</div>`
}

function renderMessage(message: PreviewMessage, groupStart: boolean, options: PreviewPageOptions): string {
  const payload = typeof message.payload === 'string' ? { content: message.payload } : (asObject(message.payload) ?? {})
  const ctx: RenderContext = { files: payloadFiles(payload), mentions: options.mentions ?? {} }
  const content = str(payload.content)
  const iso = message.timestamp.toISOString()

  const context = message.replyTo
    ? `<div class="reply-context"><img class="reply-avatar" src="${escapeHtml(avatarUrl(message.replyTo.author))}" alt="">${nameHtml(message.replyTo.author, 'reply-username')}<span class="reply-text markup">${renderMarkdown(message.replyTo.text.replaceAll('\n', ' '), ctx.mentions)}</span></div>`
    : message.interaction
      ? `<div class="reply-context interaction"><img class="reply-avatar" src="${escapeHtml(avatarUrl(message.interaction.user))}" alt="">${nameHtml(message.interaction.user, 'reply-username')}<span class="interaction-used">used</span><span class="command-name">/${escapeHtml(message.interaction.command)}</span></div>`
      : ''

  const header = groupStart
    ? `<img class="avatar" src="${escapeHtml(avatarUrl(message.author))}" alt=""><h3 class="message-header">${nameHtml(message.author, 'username')}${message.author.bot ? BOT_TAG : ''}<time class="message-timestamp" datetime="${iso}">${escapeHtml(headerTime(message.timestamp, options))}</time></h3>`
    : `<time class="message-gutter-time" datetime="${iso}">${escapeHtml(shortTime(message.timestamp, options.timeZone))}</time>`

  const accessories = [
    renderComponents(payload.components, ctx.files, ctx.mentions),
    ...asObjects(payload.embeds).map((embed) => renderEmbed(embed, ctx)),
    renderReactions(message.reactions)
  ].join('')

  return `<li class="message-item"><article class="message${groupStart ? ' group-start' : ''}">${context}${header}${content ? `<div class="message-content markup">${renderMarkdown(content, ctx.mentions)}</div>` : ''}${accessories ? `<div class="message-accessories">${accessories}</div>` : ''}</article></li>`
}

/** Render a conversation as a standalone HTML page that reproduces the Discord desktop client's chat view. */
export function renderPreviewPage(messages: readonly PreviewMessage[], options: PreviewPageOptions = {}): string {
  const channel = options.channelName ?? 'roka-preview'
  const items = messages
    .map((message, index) => renderMessage(message, startsGroup(message, messages[index - 1]), options))
    .join('')
  const refresh = options.refreshSeconds ? `<meta http-equiv="refresh" content="${options.refreshSeconds}">` : ''

  return `<!doctype html>
<html lang="en" class="theme-${options.theme ?? 'dark'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${refresh}<title>${escapeHtml(options.title ?? `#${channel} · Discord preview`)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Source+Code+Pro:wght@400;600&display=swap">
<style>${PREVIEW_STYLES}</style>
</head>
<body>
<div class="app">
<section class="chat" aria-label="#${escapeHtml(channel)}">
<header class="channel-header">${HASH_ICON}<h1 class="channel-name">${escapeHtml(channel)}</h1><div class="toolbar"><label class="theme-picker">Theme <select id="theme"><option value="dark">Dark</option><option value="ash">Ash</option><option value="onyx">Onyx</option><option value="light">Light</option></select></label></div></header>
<main class="messages" role="log"><ol class="message-list">${items}<li class="list-spacer" aria-hidden="true"></li></ol></main>
<footer class="composer"><div class="composer-box"><span class="composer-placeholder">Message #${escapeHtml(channel)}</span></div></footer>
</section>
</div>
<script>${PREVIEW_SCRIPT}</script>
</body>
</html>
`
}
