import { renderMarkdown } from '../preview/markdown.js'

const twemoji = (code: string) => `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${code}.svg`

describe('renderMarkdown inline styles', () => {
  it('escapes HTML instead of rendering it', () => {
    expect(renderMarkdown('<b>hi</b> & "x"')).toBe('&lt;b&gt;hi&lt;/b&gt; &amp; &quot;x&quot;')
  })

  it('renders bold, italic, underline, strikethrough and spoilers', () => {
    expect(renderMarkdown('**a** *b* _c_ __d__ ~~e~~ ||f||')).toBe(
      '<strong>a</strong> <em>b</em> <em>c</em> <u>d</u> <s>e</s> <span class="spoiler" tabindex="0"><span class="spoiler-content">f</span></span>'
    )
  })

  it('nests bold inside italic for triple asterisks', () => {
    expect(renderMarkdown('***both***')).toBe('<em><strong>both</strong></em>')
  })

  it('leaves markdown inside inline code alone', () => {
    expect(renderMarkdown('`**x**` and ``a`b``')).toBe(
      '<code class="inline">**x**</code> and <code class="inline">a`b</code>'
    )
  })

  it('honours backslash escapes', () => {
    expect(renderMarkdown('\\*not italic\\*')).toBe('*not italic*')
  })

  it('keeps a lone asterisk and snake_case words as text', () => {
    expect(renderMarkdown('2 * 3 = snake_case_name')).toBe('2 * 3 = snake_case_name')
  })

  it('preserves newlines for pre-wrap rendering', () => {
    expect(renderMarkdown('one\ntwo')).toBe('one\ntwo')
  })
})

describe('renderMarkdown links', () => {
  it('renders masked links, including suppressed-embed targets', () => {
    expect(renderMarkdown('[Roka](https://example.com/a) [b](<https://example.com/b>)')).toBe(
      '<a class="link" href="https://example.com/a" title="https://example.com/a" target="_blank" rel="noreferrer">Roka</a> ' +
        '<a class="link" href="https://example.com/b" title="https://example.com/b" target="_blank" rel="noreferrer">b</a>'
    )
  })

  it('autolinks bare and angle-bracketed URLs without trailing punctuation', () => {
    expect(renderMarkdown('see https://example.com/x. or <https://example.com/y>')).toBe(
      'see <a class="link" href="https://example.com/x" target="_blank" rel="noreferrer">https://example.com/x</a>. or ' +
        '<a class="link" href="https://example.com/y" target="_blank" rel="noreferrer">https://example.com/y</a>'
    )
  })

  it('does not link a masked link whose target is not http(s)', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a')
  })
})

describe('renderMarkdown blocks', () => {
  it('renders fenced code blocks with their language and without the fence newlines', () => {
    expect(renderMarkdown('```ts\nconst a = 1\n```\nafter')).toBe(
      '<pre class="codeblock"><code data-lang="ts">const a = 1</code></pre>after'
    )
  })

  it('renders three heading levels only when followed by a space', () => {
    expect(renderMarkdown('# One\n## Two\n### Three\n#### Four\n#nospace')).toBe(
      '<h1>One</h1><h2>Two</h2><h3>Three</h3>#### Four\n#nospace'
    )
  })

  it('renders -# subtext', () => {
    expect(renderMarkdown('-# 🌸 searched the web')).toBe(
      `<small class="subtext"><img class="emoji" src="${twemoji('1f338')}" alt="🌸" draggable="false"> searched the web</small>`
    )
  })

  it('renders single-line quotes and stops at the first unquoted line', () => {
    expect(renderMarkdown('> quoted **bold**\n> second\nplain')).toBe(
      '<blockquote>quoted <strong>bold</strong>\nsecond</blockquote>plain'
    )
  })

  it('renders >>> as a quote of everything after it', () => {
    expect(renderMarkdown('before\n>>> all\nof this')).toBe('before\n<blockquote>all\nof this</blockquote>')
  })

  it('only starts quotes and headings at the start of a line', () => {
    expect(renderMarkdown('a > b # c')).toBe('a &gt; b # c')
  })

  it('renders bullet and numbered lists with nesting', () => {
    expect(renderMarkdown('- a\n  - nested\n- b\n1. x\n2. y')).toBe(
      '<ul><li>a<ul><li>nested</li></ul></li><li>b</li></ul><ol start="1"><li>x</li><li>y</li></ol>'
    )
  })
})

describe('renderMarkdown Discord entities', () => {
  it('renders user, role and channel mentions from the supplied names', () => {
    const html = renderMarkdown('<@1> <@!2> <@&3> <#4> @everyone', {
      users: { '1': 'Tester' },
      roles: { '3': 'Mods' },
      channels: { '4': 'general' }
    })
    expect(html).toBe(
      '<span class="mention">@Tester</span> <span class="mention">@unknown-user</span> ' +
        '<span class="mention">@Mods</span> <span class="mention channel">#general</span> ' +
        '<span class="mention">@everyone</span>'
    )
  })

  it('renders custom emoji from the Discord CDN', () => {
    expect(renderMarkdown('hi <:roka:123> <a:spin:456>')).toBe(
      'hi <img class="emoji" src="https://cdn.discordapp.com/emojis/123.webp?size=48&quality=lossless" alt=":roka:" draggable="false"> ' +
        '<img class="emoji" src="https://cdn.discordapp.com/emojis/456.webp?size=48&animated=true&quality=lossless" alt=":spin:" draggable="false">'
    )
  })

  it('renders timestamps in the requested style', () => {
    const html = renderMarkdown('<t:0:D> <t:0:t>', { timeZone: 'UTC' })
    expect(html).toBe('<span class="timestamp">January 1, 1970</span> <span class="timestamp">12:00 AM</span>')
  })

  it('renders relative timestamps against the supplied clock', () => {
    expect(renderMarkdown('<t:0:R>', { now: new Date(3 * 86_400_000) })).toBe(
      '<span class="timestamp">3 days ago</span>'
    )
  })

  it('swaps Unicode emoji for Twemoji, keeping VS16 only inside ZWJ sequences', () => {
    expect(renderMarkdown('ok ❤️ 👩‍💻')).toBe(
      `ok <img class="emoji" src="${twemoji('2764')}" alt="❤️" draggable="false"> ` +
        `<img class="emoji" src="${twemoji('1f469-200d-1f4bb')}" alt="👩‍💻" draggable="false">`
    )
  })

  it('makes emoji-only text jumbo', () => {
    expect(renderMarkdown('🌸 <:roka:1>')).toBe(
      `<img class="emoji jumbo" src="${twemoji('1f338')}" alt="🌸" draggable="false"> ` +
        '<img class="emoji jumbo" src="https://cdn.discordapp.com/emojis/1.webp?size=96&quality=lossless" alt=":roka:" draggable="false">'
    )
  })
})
