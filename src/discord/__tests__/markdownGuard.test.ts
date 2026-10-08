import { describe, expect, it } from 'vitest'
import { guardMarkdown } from '../markdownGuard.js'

// Her kaomoji list in src/agent/prompts/speech.ts, plus faces she picks up elsewhere that carry markdown
// characters. The ASCII backtick form is how she typed the first one before the list switched to ｀.
const KAOMOJI = [
  '(´・ω・`)',
  '(´・ω・｀)',
  '(╥﹏╥)',
  '(⁄ ⁄•⁄ω⁄•⁄ ⁄)',
  '( ˘ω˘ )',
  '(・ω・)ノ',
  '(≧▽≦)',
  '(,,>﹏<,,)',
  '(◕‿◕✿)',
  'σ(≧ε≦σ)',
  '(〃ω〃)',
  '(´▽｀)',
  '(´△｀)',
  "(´；ω；)'",
  '(๑•́ ▽ •́๑)',
  '(´•ω•̥)',
  '(>_<)',
  '(*^▽^*)',
  '(T_T)',
  '(￣ー￣)'
]

describe('guardMarkdown', () => {
  it('turns the backtick in her kaomoji into a lookalike so it cannot open a code span', () => {
    expect(guardMarkdown('(´・ω・`)')).toBe('(´・ω・｀)')
  })

  it('treats a pre-escaped kaomoji backtick the same way', () => {
    expect(guardMarkdown('(´・ω・\\`)')).toBe('(´・ω・｀)')
  })

  // The reported shape: a kaomoji backtick paired with a backticked domain further down and monospaced the
  // whole opening.
  it('keeps inline code working beside a kaomoji', () => {
    expect(guardMarkdown('Ara~, Ikuyo? (´・ω・`) ♪ ... through `gonkarouter.io` with free tokens.')).toBe(
      'Ara~, Ikuyo? (´・ω・｀) ♪ ... through `gonkarouter.io` with free tokens.'
    )
  })

  it('keeps a command in inline code untouched', () => {
    expect(guardMarkdown('Run `bun add -g @excalidraw/cli` first~')).toBe('Run `bun add -g @excalidraw/cli` first~')
  })

  it('keeps underscores and brackets inside inline code untouched', () => {
    expect(guardMarkdown('call `foo_bar(a_b)` then')).toBe('call `foo_bar(a_b)` then')
  })

  it('keeps a fenced code block verbatim, kaomoji-like text and backticks included', () => {
    const block = '```py\nprint(a_b)  # (>_<)\nx = `y` ~~z~~\n```'
    expect(guardMarkdown(`Here~\n${block}\nDone (≧▽≦)`)).toBe(`Here~\n${block}\nDone (≧▽≦)`)
  })

  it('escapes a backtick that pairs with nothing', () => {
    expect(guardMarkdown('a ` b')).toBe('a \\` b')
  })

  it('escapes the fence of a code block that never closes', () => {
    expect(guardMarkdown('```ts\nconst a = 1')).toBe('\\`\\`\\`ts\nconst a = 1')
  })

  it('escapes underscores and asterisks inside a face so they cannot italicise the text between two faces', () => {
    expect(guardMarkdown('(>_<) oops (>_<)')).toBe('(>\\_<) oops (>\\_<)')
    expect(guardMarkdown('(*^▽^*) yay')).toBe('(\\*^▽^\\*) yay')
  })

  it('leaves an italic aside that ends in a kaomoji italic', () => {
    expect(guardMarkdown('*...not that I care (,,>﹏<,,)*')).toBe('*...not that I care (,,>﹏<,,)*')
  })

  it('escapes the trailing arm of a shrug', () => {
    expect(guardMarkdown('¯\\_(ツ)_/¯')).toBe('¯\\_(ツ)\\_/¯')
  })

  it('escapes doubled tildes so they cannot strike text through, and leaves single ones', () => {
    expect(guardMarkdown('yo~~ ne~~')).toBe('yo\\~\\~ ne\\~\\~')
    expect(guardMarkdown('you know~ right~?')).toBe('you know~ right~?')
  })

  it('leaves bracketed words, spoilers, quotes and lists alone', () => {
    const text = '**Bold** (see the docs) and ||the twist||\n> "a line"\n- one\n1. two'
    expect(guardMarkdown(text)).toBe(text)
  })

  it('is idempotent', () => {
    const text = 'Ara (´・ω・`) `cmd` a ` b (>_<) yo~~\n```js\nx\n```'
    expect(guardMarkdown(guardMarkdown(text))).toBe(guardMarkdown(text))
  })

  it.each(KAOMOJI)('keeps code formatted around %s, wherever it sits', (face) => {
    const text = `${face} run \`npm test\` then ${face}\n\`\`\`sh\nls ${face}\n\`\`\`\nbye ${face}`
    const guarded = guardMarkdown(text)
    const outsideCode = guarded.replace(`\`\`\`sh\nls ${face}\n\`\`\``, '').replace('`npm test`', '')

    expect(guarded).toContain('`npm test`')
    expect(guarded).toContain(`\`\`\`sh\nls ${face}\n\`\`\``)
    expect(outsideCode.match(/(?<!\\)`/g)).toBeNull()
    expect(outsideCode.match(/(?<!\\)[*_~]/g)).toBeNull()
  })
})
