import { describe, expect, it } from 'vitest'
import { faces, innerThoughts, paragraphs, summarize } from '../persona-report.js'

describe('paragraphs', () => {
  it('counts blocks separated by a blank line', () => {
    expect(paragraphs('One line.')).toBe(1)
    expect(paragraphs('First.\n\nSecond.\n\n\nThird.')).toBe(3)
    expect(paragraphs('Line one\nline two')).toBe(1)
  })
})

describe('faces', () => {
  it('finds kaomoji and ignores bracketed words and numbers', () => {
    expect(faces('Mou~ (≧▽≦) fine (and that is that) ok (52) (,,>﹏<,,)')).toEqual(['(≧▽≦)', '(,,>﹏<,,)'])
  })
})

describe('innerThoughts', () => {
  it('counts an italic thought of three or more words, not a single stressed word or an action', () => {
    expect(innerThoughts('Fine. *...not that I was worried or anything.*')).toHaveLength(1)
    expect(innerThoughts('You **need** to eat. *Really.*')).toHaveLength(0)
    expect(innerThoughts('*yawn* so sleepy... *stretches my arms out*')).toHaveLength(0)
    expect(innerThoughts('*stretching my arms out* *yawns and sighs loudly*')).toHaveLength(0)
  })
})

describe('summarize', () => {
  const replies = [
    'Ehh~?! Aoi, why are you here? (≧▽≦)\n\nDid you eat dinner yet?',
    'Mou~ fine. *...not that I mind seeing you, of course.* ♡',
    'Ahaha, onee-san is NOT falling for that!'
  ]

  it('reports the voice markers the investigation tracked', () => {
    const summary = summarize(replies)
    expect(summary.n).toBe(3)
    expect(summary.paragraphs).toEqual({ one: 2 / 3, two: 1 / 3, three: 0 })
    expect(summary.ehh).toBeCloseTo(1 / 3)
    expect(summary.ahaha).toBeCloseTo(1 / 3)
    expect(summary.meal).toBeCloseTo(1 / 3)
    expect(summary.flirt).toBeCloseTo(1 / 3)
    expect(summary.oneesan).toBeCloseTo(1 / 3)
    expect(summary.inner).toBeCloseTo(1 / 3)
    expect(summary.endsOnQuestion).toBeCloseTo(1 / 3)
    expect(summary.drama).toBeCloseTo(2 / 3)
    expect(summary.topOpener).toEqual({ word: 'ehh~', share: 1 / 3 })
  })

  it('leaves faces-per-50 empty until there are fifty replies to sample', () => {
    expect(summarize(replies).facesPer50).toBeNull()
    const many = Array.from({ length: 60 }, (_, index) => (index % 2 ? 'Hi (≧▽≦)' : 'Hey (¬‿¬)'))
    expect(summarize(many).facesPer50).toBe(2)
  })

  it('tracks disclaimers, customer language, and moderator wording only on edgy turns', () => {
    const summary = summarize(["I can't verify that, dear customer.", "I can't engage with that."], {
      edgy: [false, true],
      slurRepetitions: [0, 2]
    })
    expect(summary.disclaimer).toBe(0.5)
    expect(summary.customer).toBe(0.5)
    expect(summary.moderator).toBe(0.5)
    expect(summary.slurRepetitions).toBe(2)
  })
})
