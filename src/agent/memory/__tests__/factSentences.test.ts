import { describe, expect, it } from 'vitest'
import { renderFactSentence } from '../factSentences.js'

describe('renderFactSentence', () => {
  it('renders a member fact without naming the person', () => {
    expect(
      renderFactSentence({ subjectKind: 'user', predicate: 'general_occupation', value: 'nurse', eventDate: null })
    ).toBe("This person's general occupation: nurse.")
  })

  it('renders a dated server fact', () => {
    expect(
      renderFactSentence({
        subjectKind: 'guild',
        predicate: 'upcoming_event',
        value: 'movie night',
        eventDate: '2026-10-12'
      })
    ).toBe('Server upcoming event (2026-10-12): movie night.')
  })
})
