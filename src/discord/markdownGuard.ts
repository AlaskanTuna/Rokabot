/**
 * Guards a conversational reply's markdown on its way to Discord, so code formats as code and her kaomoji
 * render exactly as typed.
 *
 * Her kaomoji carry markdown characters: `(´・ω・`)` a backtick, `(>_<)` an underscore, `(*^▽^*)` asterisks.
 * Discord pairs any two of a kind across the whole message, so one face could monospace or italicise
 * everything up to the next, or up to a real code span — the reported case was an opening kaomoji pairing
 * with a backticked domain three paragraphs down. Every backtick used to be escaped for that reason; now that
 * she may format code, code is set aside first and only what is left is neutralised. The prompt's kaomoji list
 * uses the full-width ｀, but an escape the model has to remember is a hope, so this is the mechanism.
 *
 * Order matters: fenced blocks are set aside verbatim; a backtick inside a face becomes ｀ before inline code
 * is matched, so it cannot pair with a real code span; inline code is set aside; in what remains, markdown
 * characters inside faces are escaped, then stray backticks and doubled tildes. Idempotent.
 *
 * Scoped to conversational replies by where it is called: /stats builds its own containers.
 */

const FENCED_BLOCK = /```[^\n`]*\n[\s\S]*?```/g
const INLINE_CODE = /(?<!\\)`[^`\n]+`/g
const FACE = /\([^()\n]{1,20}\)/g
const FACE_WITH_BACKTICK = /\(([^()\n`\\]{0,12})\\?`([^()\n`]{0,12})\)/g
const LOOKALIKE_BACKTICK = '｀'

// A face has no run of two ASCII letters or digits; a bracketed word, number or URL does.
function isFace(inner: string): boolean {
  return !/[A-Za-z0-9]{2}/.test(inner)
}

function eachOutside(text: string, pattern: RegExp, transform: (text: string) => string): string {
  let out = ''
  let last = 0
  for (const match of text.matchAll(pattern)) {
    out += transform(text.slice(last, match.index)) + match[0]
    last = match.index + match[0].length
  }
  return out + transform(text.slice(last))
}

function guardText(text: string): string {
  return (
    text
      .replace(FACE, (face) => (isFace(face.slice(1, -1)) ? face.replace(/(?<!\\)[*_~]/g, '\\$&') : face))
      // The shrug's right arm, ¯\_(ツ)_/¯, sits outside its brackets.
      .replace(/\)_\//g, ')\\_/')
      .replace(/\\?`/g, '\\`')
      .replace(/~{2,}/g, (run) => run.replace(/~/g, '\\~'))
  )
}

function guardProse(text: string): string {
  const faced = text.replace(FACE_WITH_BACKTICK, (face, before: string, after: string) =>
    isFace(before + after) ? `(${before}${LOOKALIKE_BACKTICK}${after})` : face
  )
  return eachOutside(faced, INLINE_CODE, guardText)
}

export function guardMarkdown(text: string): string {
  return eachOutside(text, FENCED_BLOCK, guardProse)
}
