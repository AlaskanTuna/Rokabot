import { describe, expect, it } from 'vitest'
import { renderFactSentence } from '../factSentences.js'

describe('renderFactSentence', () => {
  it('renders a member fact without naming the person', () => {
    expect(
      renderFactSentence({ subjectKind: 'user', predicate: 'general_occupation', value: 'nurse', eventDate: null })
    ).toBe("This person's general occupation: nurse.")
  })

  it('renders a past member fact as history', () => {
    expect(
      renderFactSentence({
        subjectKind: 'user',
        predicate: 'general_occupation',
        value: 'nurse',
        eventDate: null,
        period: 'past'
      })
    ).toBe("This person's past general occupation: nurse.")
  })

  it('renders a current member fact the same as one with no period', () => {
    expect(
      renderFactSentence({
        subjectKind: 'user',
        predicate: 'general_occupation',
        value: 'nurse',
        eventDate: null,
        period: 'current'
      })
    ).toBe("This person's general occupation: nurse.")
  })

  it('leaves a server fact unchanged whatever its period', () => {
    expect(
      renderFactSentence({
        subjectKind: 'guild',
        predicate: 'upcoming_event',
        value: 'movie night',
        eventDate: null,
        period: 'past'
      })
    ).toBe('Server upcoming event: movie night.')
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
