import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    rateLimit: { rpm: 15, rpd: 500 },
    session: { ttlMs: 300_000, windowSize: 10 }
  }
}))

import type { WindowMessage } from '../../session/types.js'
import { detectTone } from '../toneDetector.js'

function makeMessage(content: string): WindowMessage {
  return {
    role: 'user',
    displayName: 'TestUser',
    content,
    timestamp: Date.now()
  }
}

describe('detectTone', () => {
  describe('flustered detection', () => {
    it('detects flustered tone from romantic keywords', () => {
      const messages = [makeMessage('I think I have a crush on you, you are so cute')]
      expect(detectTone(messages)).toBe('flustered')
    })

    it('detects flustered tone from emoji patterns', () => {
      const messages = [makeMessage('you are so beautiful ❤')]
      expect(detectTone(messages)).toBe('flustered')
    })
  })

  describe('tender detection', () => {
    it('detects tender tone from vulnerability keywords', () => {
      const messages = [makeMessage('I miss you, goodnight')]
      expect(detectTone(messages)).toBe('tender')
    })

    it('detects tender tone from gratitude and connection', () => {
      const messages = [makeMessage('thank you for always being there')]
      expect(detectTone(messages)).toBe('tender')
    })

    it('detects tender tone from worry and care', () => {
      const messages = [makeMessage('stay safe out there, I promise I will')]
      expect(detectTone(messages)).toBe('tender')
    })
  })

  describe('annoyed detection', () => {
    it('detects annoyed tone from defiance keywords', () => {
      const messages = [makeMessage("no I won't do it")]
      expect(detectTone(messages)).toBe('annoyed')
    })

    it('detects annoyed tone from recklessness keywords', () => {
      const messages = [makeMessage("I didn't eat and stayed up all night")]
      expect(detectTone(messages)).toBe('annoyed')
    })

    it('detects annoyed tone from teasing-her keywords', () => {
      const messages = [makeMessage('you are so old, granny')]
      expect(detectTone(messages)).toBe('annoyed')
    })

    it('detects annoyed tone from arguing keywords', () => {
      const messages = [makeMessage("whatever, I don't care")]
      expect(detectTone(messages)).toBe('annoyed')
    })
  })

  describe('sincere detection', () => {
    it('detects sincere tone from emotional keywords', () => {
      const messages = [makeMessage('I feel so sad and lonely today')]
      expect(detectTone(messages)).toBe('sincere')
    })

    it('detects sincere tone from sad emoji', () => {
      const messages = [makeMessage('I feel hurt 😢')]
      expect(detectTone(messages)).toBe('sincere')
    })
  })

  describe('domestic detection', () => {
    it('detects domestic tone from food keywords', () => {
      const messages = [makeMessage('what should I cook for dinner tonight?')]
      expect(detectTone(messages)).toBe('domestic')
    })

    it('detects domestic tone from daily life keywords', () => {
      const messages = [makeMessage('the weather is so cold this morning')]
      expect(detectTone(messages)).toBe('domestic')
    })

    it('detects domestic tone from cozy emoji', () => {
      const messages = [makeMessage('time for some tea 🍵 at home')]
      expect(detectTone(messages)).toBe('domestic')
    })
  })

  describe('curious detection', () => {
    it('detects curious tone from question words', () => {
      const messages = [makeMessage('what is that and how does it work?')]
      expect(detectTone(messages)).toBe('curious')
    })

    it('detects curious tone from learning keywords', () => {
      const messages = [makeMessage('that is so interesting, I wonder about it')]
      expect(detectTone(messages)).toBe('curious')
    })

    it('detects curious tone from analysis keywords', () => {
      const messages = [makeMessage('what if we think about this theory')]
      expect(detectTone(messages)).toBe('curious')
    })

    it('does not trigger curious from a single question word', () => {
      const messages = [makeMessage('what')]
      expect(detectTone(messages)).toBe('playful')
    })
  })

  describe('confident detection', () => {
    it('detects confident tone from advice-seeking keywords', () => {
      const messages = [makeMessage('can you help me with some advice on this?')]
      expect(detectTone(messages)).toBe('confident')
    })

    it('detects confident tone from teaching keywords', () => {
      const messages = [makeMessage('teach me how to do this, show me the way')]
      expect(detectTone(messages)).toBe('confident')
    })

    it('detects confident tone from recommendation keywords', () => {
      const messages = [makeMessage('what should I do? can you recommend something?')]
      expect(detectTone(messages)).toBe('confident')
    })

    it('detects confident tone from trust keywords', () => {
      const messages = [makeMessage("don't worry, I trust me with this")]
      expect(detectTone(messages)).toBe('confident')
    })
  })

  describe('sleepy detection', () => {
    it('detects sleepy tone from sleep keywords', () => {
      const messages = [makeMessage("I'm so sleepy and tired right now")]
      expect(detectTone(messages)).toBe('sleepy')
    })

    it('detects sleepy tone from drowsy keywords', () => {
      const messages = [makeMessage('I need a nap, feeling so exhausted')]
      expect(detectTone(messages)).toBe('sleepy')
    })

    it('detects sleepy tone from emoji', () => {
      const messages = [makeMessage("can't sleep 💤")]
      expect(detectTone(messages)).toBe('sleepy')
    })

    it('detects sleepy tone with single keyword during late night hours', () => {
      const messages = [makeMessage('I feel drowsy')]
      expect(detectTone(messages, 23)).toBe('sleepy')
    })

    it('detects sleepy tone with single keyword at 2am', () => {
      const messages = [makeMessage('time for bed')]
      expect(detectTone(messages, 2)).toBe('sleepy')
    })

    it('does not trigger sleepy with single keyword during daytime', () => {
      const messages = [makeMessage('I feel drowsy')]
      expect(detectTone(messages, 14)).not.toBe('sleepy')
    })

    it('does not trigger sleepy with single keyword when no hour provided', () => {
      const messages = [makeMessage('I feel drowsy')]
      expect(detectTone(messages)).not.toBe('sleepy')
    })
  })

  describe('nostalgic detection', () => {
    it('detects nostalgic tone from memory keywords', () => {
      const messages = [makeMessage('do you remember those days back then?')]
      expect(detectTone(messages)).toBe('nostalgic')
    })

    it('detects nostalgic tone from childhood keywords', () => {
      const messages = [makeMessage('my childhood memories are so precious')]
      expect(detectTone(messages)).toBe('nostalgic')
    })

    it('detects nostalgic tone from past keywords', () => {
      const messages = [makeMessage('I used to do that long ago')]
      expect(detectTone(messages)).toBe('nostalgic')
    })
  })

  describe('mischievous detection', () => {
    it('detects mischievous tone from scheming keywords', () => {
      const messages = [makeMessage("let's prank them, I dare you")]
      expect(detectTone(messages)).toBe('mischievous')
    })

    it('detects mischievous tone from plotting keywords', () => {
      const messages = [makeMessage('I have a secret trick to show you')]
      expect(detectTone(messages)).toBe('mischievous')
    })

    it('detects mischievous tone from surprise keywords', () => {
      const messages = [makeMessage("let's sneak in and surprise them")]
      expect(detectTone(messages)).toBe('mischievous')
    })
  })

  describe('competitive detection', () => {
    it('detects competitive tone from game keywords', () => {
      const messages = [makeMessage("let's play a game, I will win")]
      expect(detectTone(messages)).toBe('competitive')
    })

    it('detects competitive tone from challenge keywords', () => {
      const messages = [makeMessage('I challenge you to a rematch')]
      expect(detectTone(messages)).toBe('competitive')
    })

    it('detects competitive tone from score keywords', () => {
      const messages = [makeMessage('the score is tied, I need to beat you')]
      expect(detectTone(messages)).toBe('competitive')
    })

    it('detects competitive tone from emoji', () => {
      const messages = [makeMessage("let's play 🏆🎮")]
      expect(detectTone(messages)).toBe('competitive')
    })
  })

  describe('default fallback', () => {
    it('returns playful when no patterns match', () => {
      const messages = [makeMessage('hey lets play some video games')]
      expect(detectTone(messages)).toBe('playful')
    })

    it('returns playful for empty messages array', () => {
      expect(detectTone([])).toBe('playful')
    })

    it('returns playful when only one keyword matches (needs 2)', () => {
      const messages = [makeMessage('I feel sad')]
      expect(detectTone(messages)).toBe('playful')
    })
  })

  describe('detection priority order', () => {
    it('flustered beats tender when both match', () => {
      // "love" + "crush" = flustered; "always" + "together" = tender
      // flustered is checked first
      const messages = [makeMessage('I love you, I always want to be together, I have a crush')]
      expect(detectTone(messages)).toBe('flustered')
    })

    it('tender beats annoyed when both match', () => {
      // "miss" + "goodnight" = tender; "no" + "whatever" = annoyed
      // tender is checked before annoyed
      const messages = [makeMessage('no whatever, I miss you, goodnight')]
      expect(detectTone(messages)).toBe('tender')
    })

    it('annoyed beats sincere when both match', () => {
      // "no" + "won't" = annoyed; "sad" + "lonely" = sincere
      // annoyed is checked before sincere
      const messages = [makeMessage("no I won't, I feel sad and lonely")]
      expect(detectTone(messages)).toBe('annoyed')
    })

    it('confident beats playful when both match', () => {
      // "advice" + "recommend" = confident; no specific playful keywords (playful is fallback)
      const messages = [makeMessage('I need some advice, can you recommend something fun?')]
      expect(detectTone(messages)).toBe('confident')
    })

    it('annoyed beats sleepy when both match', () => {
      // "no" + "won't" = annoyed; "tired" + "exhausted" = sleepy
      // annoyed is checked before sleepy
      const messages = [makeMessage("no I won't, I'm tired and exhausted")]
      expect(detectTone(messages)).toBe('annoyed')
    })

    it('sleepy beats sincere when both match', () => {
      // "sleepy" + "tired" = sleepy; "sad" + "lonely" = sincere
      // sleepy is checked before sincere
      const messages = [makeMessage('I feel sleepy and tired, also sad and lonely')]
      expect(detectTone(messages)).toBe('sleepy')
    })

    it('sincere beats nostalgic when both match', () => {
      // "sad" + "hurt" = sincere; "remember" + "past" = nostalgic
      // sincere is checked before nostalgic
      const messages = [makeMessage('I feel sad and hurt when I remember the past')]
      expect(detectTone(messages)).toBe('sincere')
    })

    it('nostalgic beats domestic when both match', () => {
      // "remember" + "used to" = nostalgic; "cook" + "dinner" = domestic
      // nostalgic is checked before domestic
      const messages = [makeMessage('I remember we used to cook dinner together')]
      expect(detectTone(messages)).toBe('nostalgic')
    })

    it('domestic beats mischievous when both match', () => {
      // "food" + "cook" = domestic; "prank" + "trick" = mischievous
      // domestic is checked before mischievous
      const messages = [makeMessage("let's cook some food, I'll prank them with a trick")]
      expect(detectTone(messages)).toBe('domestic')
    })

    it('mischievous beats competitive when both match', () => {
      // "dare" + "trick" = mischievous; "game" + "win" = competitive
      // mischievous is checked before competitive
      const messages = [makeMessage('I dare you to a trick in this game, you will not win')]
      expect(detectTone(messages)).toBe('mischievous')
    })
  })

  describe('scans only last 3 messages', () => {
    it('ignores older messages beyond the last 3', () => {
      const messages = [
        makeMessage('I feel so sad and lonely'), // msg 1 (should be ignored)
        makeMessage('just talking about random stuff'), // msg 2
        makeMessage('playing some games'), // msg 3
        makeMessage('this is fun right') // msg 4
      ]
      // Only messages 2-4 are scanned; msg 1 with sad+lonely is outside the window
      expect(detectTone(messages)).toBe('playful')
    })

    it('detects tone from the last 3 messages', () => {
      const messages = [
        makeMessage('random stuff'),
        makeMessage('I have a crush'),
        makeMessage('you are so cute'),
        makeMessage('will you go on a date with me')
      ]
      // Last 3: crush, cute, date -> flustered
      expect(detectTone(messages)).toBe('flustered')
    })
  })
})
