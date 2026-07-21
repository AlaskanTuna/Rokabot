import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCooldowns, shouldReact } from '../emojiReactor.js'

beforeEach(() => {
  resetCooldowns()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shouldReact', () => {
  describe('reaction rules', () => {
    it('reacts to food keywords with a food emoji', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0) // always passes probability gate
      const emoji = shouldReact('I am so hungry right now', 'ch1')
      expect(emoji).toBeDefined()
      expect(['🍳', '🍵', '🍙']).toContain(emoji)
    })

    it('reacts to cooking keywords', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('gonna cook some dinner', 'ch1')
      expect(emoji).toBeDefined()
      expect(['🍳', '🍵', '🍙']).toContain(emoji)
    })

    it('reacts to oishii', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('that looks oishii', 'ch1')
      expect(emoji).toBeDefined()
      expect(['🍳', '🍵', '🍙']).toContain(emoji)
    })

    it('reacts to anime keywords with anime emoji', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('I just watched a great anime', 'ch1')
      expect(emoji).toBeDefined()
      expect(['✨', '🌸']).toContain(emoji)
    })

    it('reacts to manga keyword', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('reading a new manga series', 'ch1')
      expect(emoji).toBeDefined()
      expect(['✨', '🌸']).toContain(emoji)
    })

    it('reacts to waifu keyword', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('she is my waifu', 'ch1')
      expect(emoji).toBeDefined()
      expect(['✨', '🌸']).toContain(emoji)
    })

    it('reacts to compliments with heart emoji', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('you are so cute', 'ch1')
      expect(emoji).toBe('💕')
    })

    it('reacts to best girl', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('Roka is best girl', 'ch1')
      expect(emoji).toBe('💕')
    })

    it('reacts to adorable', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('that is adorable', 'ch1')
      expect(emoji).toBe('💕')
    })

    it('reacts to greetings with wave emoji', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('good morning everyone', 'ch1')
      expect(emoji).toBe('👋')
    })

    it('reacts to ohayo', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('ohayo!', 'ch1')
      expect(emoji).toBe('👋')
    })

    it('reacts to tadaima', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('tadaima!', 'ch1')
      expect(emoji).toBe('👋')
    })

    it('reacts to sadness with hug emoji', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('I feel so sad today', 'ch1')
      expect(emoji).toBe('🫂')
    })

    it('reacts to depressed', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('feeling depressed', 'ch1')
      expect(emoji).toBe('🫂')
    })

    it('reacts to goodnight with moon emoji', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('goodnight everyone', 'ch1')
      expect(emoji).toBe('🌙')
    })

    it('reacts to oyasumi', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('oyasumi nasai', 'ch1')
      expect(emoji).toBe('🌙')
    })

    it('reacts to going to sleep', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('I am going to sleep now', 'ch1')
      expect(emoji).toBe('🌙')
    })

    it('reacts to excitement with celebration emoji', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('woohoo we did it!', 'ch1')
      expect(emoji).toBeDefined()
      expect(['🎉', '✨', '💯']).toContain(emoji)
    })

    it('reacts to congrats', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('congrats on the win!', 'ch1')
      expect(emoji).toBeDefined()
      expect(['🎉', '✨']).toContain(emoji)
    })

    it('reacts to yay', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('yay we did it', 'ch1')
      expect(emoji).toBeDefined()
      expect(['🎉', '✨']).toContain(emoji)
    })
  })

  describe('no reaction cases', () => {
    it('returns null for non-matching content', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('just a normal message about nothing', 'ch1')
      expect(emoji).toBeNull()
    })

    it('returns null for empty content', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('', 'ch1')
      expect(emoji).toBeNull()
    })
  })

  describe('probability gate', () => {
    it('reacts when random is below threshold (0.33)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.32)
      const emoji = shouldReact('good morning', 'ch1')
      expect(emoji).toBe('👋')
    })

    it('does not react when random is at threshold (0.33)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.33)
      const emoji = shouldReact('good morning', 'ch1')
      expect(emoji).toBeNull()
    })

    it('does not react when random is above threshold', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const emoji = shouldReact('good morning', 'ch1')
      expect(emoji).toBeNull()
    })
  })

  describe('cooldown system', () => {
    it('prevents rapid reactions in the same channel', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const first = shouldReact('good morning', 'ch1')
      expect(first).toBe('👋')

      const second = shouldReact('good morning again', 'ch1')
      expect(second).toBeNull()
    })

    it('allows reactions in different channels', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const first = shouldReact('good morning', 'ch1')
      expect(first).toBe('👋')

      const second = shouldReact('good morning', 'ch2')
      expect(second).toBe('👋')
    })

    it('allows reaction after cooldown expires', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)

      const first = shouldReact('good morning', 'ch1')
      expect(first).toBe('👋')

      // Advance time past cooldown (180 seconds)
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 181_000)

      const second = shouldReact('good morning', 'ch1')
      expect(second).toBe('👋')
    })
  })

  describe('priority (first matching rule wins)', () => {
    it('compliment takes priority over excitement when both match', () => {
      // "cute" matches compliments, "amazing" matches excitement
      // Compliments rule is defined before excitement, so it wins
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('you are cute and amazing', 'ch1')
      expect(emoji).toBe('💕')
    })

    it('goodnight takes priority over food when both match', () => {
      // "goodnight" matches goodnight, "dinner" matches food
      // Goodnight is defined before food, so it wins
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('goodnight after dinner', 'ch1')
      expect(emoji).toBe('🌙')
    })

    it('greeting takes priority over excitement', () => {
      // "hello" matches greeting, "awesome" matches excitement
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('hello this is awesome', 'ch1')
      expect(emoji).toBe('👋')
    })
  })

  describe('case insensitivity', () => {
    it('matches uppercase keywords', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('GOOD MORNING', 'ch1')
      expect(emoji).toBe('👋')
    })

    it('matches mixed case keywords', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const emoji = shouldReact('GoOdNiGhT', 'ch1')
      expect(emoji).toBe('🌙')
    })
  })

  describe('resetCooldowns', () => {
    it('clears all cooldowns allowing immediate reactions', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)

      shouldReact('good morning', 'ch1')
      // Should be on cooldown now
      expect(shouldReact('good morning', 'ch1')).toBeNull()

      resetCooldowns()

      // Should work again after reset
      const emoji = shouldReact('good morning', 'ch1')
      expect(emoji).toBe('👋')
    })
  })
})
