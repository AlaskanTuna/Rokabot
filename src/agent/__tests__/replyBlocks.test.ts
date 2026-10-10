import { describe, expect, it } from 'vitest'
import { MAX_REPLY_BLOCKS, capReplyBlocks, countReplyBlocks, splitAtDividers } from '../replyBlocks.js'

describe('countReplyBlocks', () => {
  it.each([
    ['one paragraph', 'Ara~ you came back. **Tea** is ready.', 1],
    ['a paragraph, a list and a closing line', 'Two picks:\n\n- **Frieren**\n- **Mushishi**\n\nEat first, ne~', 3],
    ['a lead-in sentence directly above its list', 'Do these in order:\n1. Boil water\n2. Pour', 2],
    ['numbered steps the model spaced apart', '1. Boil water\n\n2. Pour\n\n3. Wait', 1],
    ['consecutive quote lines', '> first reply\n> second reply', 1],
    ['a code block with blank lines, bullets and a dash rule inside', '```py\ndef f():\n\n    - x\n---\n```', 1],
    ['two paragraphs either side of a divider', 'The answer.\n\n---\n\nMy take, fufu~', 2],
    ['a kaomoji alone on its own line', 'Mou~ fine.\n\n(´・ω・｀)', 2]
  ])('counts %s', (_label, text, blocks) => {
    expect(countReplyBlocks(text)).toBe(blocks)
  })

  it('does not read an italic aside as a bullet', () => {
    expect(countReplyBlocks('*...not that I was worried*\nAnyway, eat.')).toBe(1)
  })
})

describe('capReplyBlocks', () => {
  it('caps a reply at three blocks', () => {
    expect(MAX_REPLY_BLOCKS).toBe(3)
  })

  it('returns a reply within the cap byte-identical', () => {
    const text = 'Two picks:\n\n\n- **Frieren**\n- **Mushishi**\n\nEat first, ne~'

    expect(capReplyBlocks(text)).toEqual({ text, blocks: 3, merged: 0 })
  })

  it('joins the last two paragraphs of a four-paragraph reply', () => {
    expect(capReplyBlocks('One.\n\nTwo.\n\nThree.\n\nFour~')).toEqual({
      text: 'One.\n\nTwo.\n\nThree. Four~',
      blocks: 3,
      merged: 1
    })
  })

  it('folds a trailing kaomoji paragraph into the paragraph before it', () => {
    expect(capReplyBlocks('A.\n\nB.\n\nC.\n\n(´・ω・｀)').text).toBe('A.\n\nB.\n\nC. (´・ω・｀)')
  })

  it('joins only prose and never touches a list', () => {
    expect(capReplyBlocks('Picks:\n\n- a\n- b\n\nOne more thing.\n\nAnd another.\n\nBye~')).toEqual({
      text: 'Picks:\n\n- a\n- b\n\nOne more thing. And another. Bye~',
      blocks: 3,
      merged: 2
    })
  })

  it('leaves a reply alone when no two paragraphs sit side by side', () => {
    const text = 'Lead.\n\n- a\n- b\n\n> quoted\n\n```sh\nls\n```\n\nBye~'

    expect(capReplyBlocks(text)).toEqual({ text, blocks: 5, merged: 0 })
  })

  it('does not join paragraphs across a divider', () => {
    const text = 'Answer.\n\n---\n\nMy take.\n\n- a\n- b\n\n> quoted'

    expect(capReplyBlocks(text)).toEqual({ text, blocks: 4, merged: 0 })
  })

  it('keeps the divider when joining paragraphs after it', () => {
    expect(capReplyBlocks('Answer.\n\n---\n\nTake one.\n\nTake two.\n\nTake three.').text).toBe(
      'Answer.\n\n---\n\nTake one.\n\nTake two. Take three.'
    )
  })
})

describe('splitAtDividers', () => {
  it('splits a reply at its divider lines', () => {
    expect(splitAtDividers('The answer.\n\n---\n\nMy take~')).toEqual(['The answer.', 'My take~'])
  })

  it('keeps a dash rule inside a code block as code', () => {
    const text = 'Front matter:\n```md\n---\ntitle: x\n---\n```'

    expect(splitAtDividers(text)).toEqual([text])
  })

  it('drops the empty parts a leading, trailing or doubled divider leaves', () => {
    expect(splitAtDividers('---\nA\n---\n---\nB\n---')).toEqual(['A', 'B'])
  })

  it('returns a reply with no divider whole', () => {
    expect(splitAtDividers('Just one paragraph~')).toEqual(['Just one paragraph~'])
  })
})
