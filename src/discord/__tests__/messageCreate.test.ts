import { describe, expect, it } from 'vitest'
import { NAME_MENTION_REGEX } from '../events/messageCreate.js'

describe('NAME_MENTION_REGEX', () => {
  it.each([
    'roka',
    'Roka',
    'ROKA',
    'hey roka',
    'roka help',
    'what does roka think?',
    'Roka-chan',
    'roka, are you there',
    'hi Roka!',
    'roka.',
    'Maniwa Roka'
  ])('matches "%s"', (input) => {
    expect(NAME_MENTION_REGEX.test(input)).toBe(true)
  })

  it.each(['rokabot', 'rokarokaroka', 'brokar', 'krokas', 'roketto', 'rokku', 'arokala', ''])(
    'rejects "%s"',
    (input) => {
      expect(NAME_MENTION_REGEX.test(input)).toBe(false)
    }
  )
})
