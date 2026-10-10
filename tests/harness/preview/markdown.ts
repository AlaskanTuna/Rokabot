export interface MarkdownContext {
  users?: Record<string, string>
  roles?: Record<string, string>
  channels?: Record<string, string>
  timeZone?: string
  now?: Date
}

interface State {
  ctx: MarkdownContext
  inline: boolean
  inQuote: boolean
  jumbo: boolean
}

interface Match {
  length: number
  html: string
}

type Rule = (source: string, state: State) => Match | null

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/'
// A non-literal flags string: tsc rejects the v flag below an es2024 target, but Node 24 supports it.
const UNICODE_SETS: string = 'gv'
const EMOJI = new RegExp('\\p{RGI_Emoji}', UNICODE_SETS)
const CUSTOM_EMOJI = /<a?:\w+:\d+>/g
const MAX_JUMBO_EMOJI = 30

export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

// Twemoji names files by code point, dropping VS16 unless the sequence is joined with ZWJ.
function twemojiCode(emoji: string): string {
  const raw = emoji.includes('‍') ? emoji : emoji.replaceAll('️', '')
  return [...raw].map((char) => char.codePointAt(0)?.toString(16)).join('-')
}

function emojiImage(src: string, alt: string, jumbo: boolean): string {
  return `<img class="emoji${jumbo ? ' jumbo' : ''}" src="${src}" alt="${escapeHtml(alt)}" draggable="false">`
}

function textHtml(text: string, state: State): string {
  let html = ''
  let last = 0
  for (const match of text.matchAll(EMOJI)) {
    html += escapeHtml(text.slice(last, match.index))
    html += emojiImage(`${TWEMOJI_BASE}${twemojiCode(match[0])}.svg`, match[0], state.jumbo)
    last = match.index + match[0].length
  }
  return html + escapeHtml(text.slice(last))
}

function isJumbo(text: string): boolean {
  const custom = text.match(CUSTOM_EMOJI)?.length ?? 0
  const withoutCustom = text.replace(CUSTOM_EMOJI, '')
  const unicode = withoutCustom.match(EMOJI)?.length ?? 0
  const count = custom + unicode
  return count > 0 && count <= MAX_JUMBO_EMOJI && withoutCustom.replace(EMOJI, '').trim() === ''
}

function rule(pattern: RegExp, render: (match: RegExpExecArray, state: State) => string | null): Rule {
  return (source, state) => {
    const match = pattern.exec(source)
    if (!match) return null
    const html = render(match, state)
    return html === null ? null : { length: match[0].length, html }
  }
}

function formatTimestamp(seconds: number, style: string, ctx: MarkdownContext): string {
  const date = new Date(seconds * 1000)
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: ctx.timeZone, ...options }).format(date).replaceAll(' ', ' ')
  const shortTime = () => format({ hour: 'numeric', minute: '2-digit' })
  const longDate = () => format({ month: 'long', day: 'numeric', year: 'numeric' })

  switch (style) {
    case 't':
      return shortTime()
    case 'T':
      return format({ hour: 'numeric', minute: '2-digit', second: '2-digit' })
    case 'd':
      return format({ month: '2-digit', day: '2-digit', year: 'numeric' })
    case 'D':
      return longDate()
    case 'F':
      return `${format({ weekday: 'long' })}, ${longDate()} ${shortTime()}`
    case 'R':
      return relativeTime(date, ctx.now ?? new Date())
    default:
      return `${longDate()} ${shortTime()}`
  }
}

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number, number]> = [
  ['second', 1, 45],
  ['minute', 60, 45],
  ['hour', 3600, 22],
  ['day', 86_400, 26],
  ['month', 2_592_000, 11],
  ['year', 31_536_000, Number.POSITIVE_INFINITY]
]

function relativeTime(date: Date, now: Date): string {
  const seconds = (date.getTime() - now.getTime()) / 1000
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'always' })
  for (const [unit, size, limit] of RELATIVE_STEPS) {
    const value = Math.round(seconds / size)
    if (Math.abs(value) < limit) return formatter.format(value, unit)
  }
  return formatter.format(Math.round(seconds / 31_536_000), 'year')
}

const linkHtml = (href: string, inner: string, title: boolean) =>
  `<a class="link" href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(href)}"` : ''} target="_blank" rel="noreferrer">${inner}</a>`

const wrap = (tag: string) => (match: RegExpExecArray, state: State) =>
  `<${tag}>${parse(match[1] ?? match[2], { ...state, inline: true })}</${tag}>`

const codeBlock = rule(
  /^```(?:([a-z0-9_+\-.#]+?)\n)?\n*([^\n][\s\S]*?)\n*```\n?/i,
  (match) =>
    `<pre class="codeblock"><code${match[1] ? ` data-lang="${escapeHtml(match[1])}"` : ''}>${escapeHtml(match[2])}</code></pre>`
)

const blockQuote: Rule = (source, state) => {
  const multi = /^>>> ([\s\S]*)/.exec(source)
  const single = multi ? null : /^(?:> [^\n]*(?:\n|$))+/.exec(source)
  const match = multi ?? single
  if (!match) return null
  const body = multi ? multi[1] : match[0].replace(/\n$/, '').replace(/^> /gm, '')
  return { length: match[0].length, html: `<blockquote>${parse(body, { ...state, inQuote: true })}</blockquote>` }
}

const heading = rule(
  /^(#{1,3}) +([^\n]+?)(?:\n|$)/,
  (match, state) => `<h${match[1].length}>${parse(match[2], { ...state, inline: true })}</h${match[1].length}>`
)

const subtext = rule(
  /^-# +([^\n]+?)(?:\n|$)/,
  (match, state) => `<small class="subtext">${parse(match[1], { ...state, inline: true })}</small>`
)

interface ListItem {
  indent: number
  ordered: boolean
  start: number
  text: string
}

const LIST_LINE = /^( *)([*-]|\d{1,9}\.) +([^\n]*)/

function buildList(items: ListItem[], from: number, state: State): [string, number] {
  const first = items[from]
  let html = first.ordered ? `<ol start="${first.start}">` : '<ul>'
  let index = from
  while (index < items.length && items[index].indent === first.indent && items[index].ordered === first.ordered) {
    const item = items[index]
    let inner = parse(item.text, { ...state, inline: true })
    index++
    while (index < items.length && items[index].indent > item.indent) {
      const [child, next] = buildList(items, index, state)
      inner += child
      index = next
    }
    html += `<li>${inner}</li>`
  }
  return [`${html}${first.ordered ? '</ol>' : '</ul>'}`, index]
}

const list: Rule = (source, state) => {
  const items: ListItem[] = []
  let length = 0
  for (const line of source.split('\n')) {
    const match = LIST_LINE.exec(line)
    if (!match || (items.length === 0 && match[1].length > 0)) break
    const marker = match[2]
    items.push({
      indent: match[1].length,
      ordered: marker.endsWith('.'),
      start: marker.endsWith('.') ? Number.parseInt(marker, 10) : 1,
      text: match[3]
    })
    length += line.length + 1
  }
  if (items.length === 0) return null

  let html = ''
  let index = 0
  while (index < items.length) {
    const [block, next] = buildList(items, index, state)
    html += block
    index = next
  }
  return { length: Math.min(length, source.length), html }
}

const MENTION_RULES: Rule[] = [
  rule(
    // Word ids as well as snowflakes, so the harness's `<@roka>` resolves like a real mention.
    /^<@!?(\w+)>/,
    (match, state) => `<span class="mention">@${escapeHtml(state.ctx.users?.[match[1]] ?? 'unknown-user')}</span>`
  ),
  rule(
    /^<@&(\d+)>/,
    (match, state) => `<span class="mention">@${escapeHtml(state.ctx.roles?.[match[1]] ?? 'deleted-role')}</span>`
  ),
  rule(
    /^<#(\d+)>/,
    (match, state) => `<span class="mention channel">#${escapeHtml(state.ctx.channels?.[match[1]] ?? 'unknown')}</span>`
  ),
  rule(/^<\/([\w -]+):\d+>/, (match) => `<span class="mention command">/${escapeHtml(match[1])}</span>`),
  rule(/^<(a?):(\w+):(\d+)>/, (match, state) => {
    const size = state.jumbo ? 96 : 48
    const src = `https://cdn.discordapp.com/emojis/${match[3]}.webp?size=${size}${match[1] ? '&animated=true' : ''}&quality=lossless`
    return emojiImage(src, `:${match[2]}:`, state.jumbo)
  }),
  rule(
    /^<t:(-?\d{1,17})(?::([tTdDfFR]))?>/,
    (match, state) =>
      `<span class="timestamp">${escapeHtml(formatTimestamp(Number(match[1]), match[2] ?? 'f', state.ctx))}</span>`
  ),
  rule(/^@(everyone|here)\b/, (match) => `<span class="mention">@${match[1]}</span>`)
]

const isWebUrl = (url: string) => /^https?:\/\//i.test(url)

const LINK_RULES: Rule[] = [
  rule(/^\\([^0-9A-Za-z\s])/, (match) => escapeHtml(match[1])),
  rule(/^<(https?:\/\/[^ >]+)>/, (match) => linkHtml(match[1], escapeHtml(match[1]), false)),
  ...MENTION_RULES,
  rule(/^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/, (match) => linkHtml(match[1], escapeHtml(match[1]), false)),
  rule(/^\[((?:\[[^\]]*\]|[^[\]]|\](?=[^[]*\]))*)\]\(\s*<?((?:\([^)]*\)|[^\s\\]|\\.)*?)>?\s*\)/, (match, state) =>
    isWebUrl(match[2]) ? linkHtml(match[2], parse(match[1], { ...state, inline: true }), true) : null
  )
]

// simple-markdown resolves these three by match length, with em winning ties, then strong, then underline.
const EMPHASIS_RULES: Array<[Rule, number]> = [
  [rule(/^\*\*((?:\\[\s\S]|[^\\])+?)\*\*(?!\*)/, wrap('strong')), 0.1],
  [
    rule(
      /^\b_((?:__|\\[\s\S]|[^\\_])+?)_\b|^\*(?=\S)((?:\*\*|\\[\s\S]|\s+(?:\\[\s\S]|[^\s*\\]|\*\*)|[^\s*\\])+?)\*(?!\*)/,
      wrap('em')
    ),
    0.2
  ],
  [rule(/^__((?:\\[\s\S]|[^\\])+?)__(?!_)/, wrap('u')), 0]
]

const TAIL_RULES: Rule[] = [
  rule(/^~~([\s\S]+?)~~(?!_)/, wrap('s')),
  rule(
    /^\|\|([\s\S]+?)\|\|/,
    (match, state) =>
      `<span class="spoiler" tabindex="0"><span class="spoiler-content">${parse(match[1], { ...state, inline: true })}</span></span>`
  ),
  rule(/^(`+)([\s\S]*?[^`])\1(?!`)/, (match) => `<code class="inline">${escapeHtml(match[2])}</code>`)
]

function emphasis(source: string, state: State): Match | null {
  let best: Match | null = null
  let bestQuality = -1
  for (const [candidate, bonus] of EMPHASIS_RULES) {
    const match = candidate(source, state)
    if (match && match.length + bonus > bestQuality) {
      best = match
      bestQuality = match.length + bonus
    }
  }
  return best
}

const TEXT = /^[\s\S]+?(?=[^0-9A-Za-z\sÀ-￿]|\n| {2,}\n|\w+:\S|$)/

function parse(source: string, state: State): string {
  let html = ''
  let text = ''
  let index = 0

  const emit = (match: Match) => {
    html += textHtml(text, state) + match.html
    text = ''
    index += match.length
  }

  while (index < source.length) {
    const rest = source.slice(index)
    const lineStart = index === 0 || source[index - 1] === '\n'

    const block = state.inline
      ? null
      : (codeBlock(rest, state) ??
        (lineStart
          ? ((state.inQuote ? null : blockQuote(rest, state)) ??
            heading(rest, state) ??
            subtext(rest, state) ??
            list(rest, state))
          : null))
    if (block) {
      emit(block)
      continue
    }

    let match: Match | null = null
    for (const candidate of LINK_RULES) {
      match = candidate(rest, state)
      if (match) break
    }
    match ??= emphasis(rest, state)
    if (!match) {
      for (const candidate of TAIL_RULES) {
        match = candidate(rest, state)
        if (match) break
      }
    }
    if (match) {
      emit(match)
      continue
    }

    const plain = rest[0] === '\n' ? '\n' : (TEXT.exec(rest)?.[0] ?? rest[0])
    text += plain
    index += plain.length
  }

  return html + textHtml(text, state)
}

/** Escape plain text such as a button label, swapping Unicode emoji for Twemoji the way the client does. */
export function renderPlainText(text: string): string {
  return textHtml(text, { ctx: {}, inline: true, inQuote: false, jumbo: false })
}

/** Render Discord-flavoured markdown to HTML the way the Discord client lays it out (newlines kept for pre-wrap). */
export function renderMarkdown(source: string, ctx: MarkdownContext = {}): string {
  return parse(source, { ctx, inline: false, inQuote: false, jumbo: isJumbo(source) })
}
