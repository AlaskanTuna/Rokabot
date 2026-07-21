import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    rateLimit: { rpm: 15, rpd: 500 },
    session: { ttlMs: 300_000, windowSize: 10 }
  }
}))

import { type AssemblerInput, assembleSystemPrompt } from '../promptAssembler.js'
import { CORE_PROMPT } from '../prompts/core.js'
import { SPEECH_PROMPT } from '../prompts/speech.js'
import { TONE_PROMPTS, type ToneKey } from '../prompts/tones.js'

describe('assembleSystemPrompt', () => {
  const baseInput: AssemblerInput = {
    tone: 'playful',
    participants: ['Alice'],
    hour: 14,
    displayName: 'Alice'
  }

  it('contains Layer 0: Core identity', () => {
    const result = assembleSystemPrompt(baseInput)
    expect(result).toContain(CORE_PROMPT)
  })

  it('contains Layer 1: Speech patterns', () => {
    const result = assembleSystemPrompt(baseInput)
    expect(result).toContain(SPEECH_PROMPT)
  })

  it('contains Layer 2: Tone prompt', () => {
    const result = assembleSystemPrompt(baseInput)
    expect(result).toContain(TONE_PROMPTS.playful)
  })

  it('contains Layer 3: Context with participant name', () => {
    const result = assembleSystemPrompt(baseInput)
    expect(result).toContain('Alice')
    expect(result).toContain('## Situation')
  })

  it('contains time-of-day context', () => {
    const result = assembleSystemPrompt({ ...baseInput, hour: 14 })
    expect(result).toContain('afternoon')
  })

  it('uses different Layer 2 for each tone', () => {
    const tones: ToneKey[] = [
      'playful',
      'sincere',
      'domestic',
      'flustered',
      'curious',
      'annoyed',
      'tender',
      'confident',
      'nostalgic',
      'mischievous',
      'sleepy',
      'competitive'
    ]
    const results = tones.map((tone) => assembleSystemPrompt({ ...baseInput, tone }))

    // Each result should contain the corresponding tone prompt
    for (let i = 0; i < tones.length; i++) {
      expect(results[i]).toContain(TONE_PROMPTS[tones[i]])
    }

    // All results should differ from each other (because of different Layer 2)
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        expect(results[i]).not.toBe(results[j])
      }
    }
  })

  it('contains curious tone prompt when tone is curious', () => {
    const result = assembleSystemPrompt({ ...baseInput, tone: 'curious' })
    expect(result).toContain('Curious')
    expect(result).toContain(TONE_PROMPTS.curious)
  })

  it('contains annoyed tone prompt when tone is annoyed', () => {
    const result = assembleSystemPrompt({ ...baseInput, tone: 'annoyed' })
    expect(result).toContain('Annoyed')
    expect(result).toContain(TONE_PROMPTS.annoyed)
  })

  it('contains tender tone prompt when tone is tender', () => {
    const result = assembleSystemPrompt({ ...baseInput, tone: 'tender' })
    expect(result).toContain('Tender')
    expect(result).toContain(TONE_PROMPTS.tender)
  })

  it('contains confident tone prompt when tone is confident', () => {
    const result = assembleSystemPrompt({ ...baseInput, tone: 'confident' })
    expect(result).toContain('Confident')
    expect(result).toContain(TONE_PROMPTS.confident)
  })

  it('contains nostalgic tone prompt when tone is nostalgic', () => {
    const result = assembleSystemPrompt({ ...baseInput, tone: 'nostalgic' })
    expect(result).toContain('Nostalgic')
    expect(result).toContain(TONE_PROMPTS.nostalgic)
  })

  it('contains mischievous tone prompt when tone is mischievous', () => {
    const result = assembleSystemPrompt({ ...baseInput, tone: 'mischievous' })
    expect(result).toContain('Mischievous')
    expect(result).toContain(TONE_PROMPTS.mischievous)
  })

  it('contains sleepy tone prompt when tone is sleepy', () => {
    const result = assembleSystemPrompt({ ...baseInput, tone: 'sleepy' })
    expect(result).toContain('Sleepy')
    expect(result).toContain(TONE_PROMPTS.sleepy)
  })

  it('contains competitive tone prompt when tone is competitive', () => {
    const result = assembleSystemPrompt({ ...baseInput, tone: 'competitive' })
    expect(result).toContain('Competitive')
    expect(result).toContain(TONE_PROMPTS.competitive)
  })

  it('handles multiple participants', () => {
    const input: AssemblerInput = {
      tone: 'playful',
      participants: ['Alice', 'Bob', 'Charlie'],
      hour: 10,
      displayName: 'Alice'
    }
    const result = assembleSystemPrompt(input)
    expect(result).toContain('Alice')
    expect(result).toContain('Bob')
    expect(result).toContain('Charlie')
    expect(result).toContain('group conversation')
  })

  it('handles single participant', () => {
    const result = assembleSystemPrompt(baseInput)
    expect(result).toContain('The user you are currently talking to is named "Alice"')
  })

  it('includes early morning context', () => {
    const result = assembleSystemPrompt({ ...baseInput, hour: 6 })
    expect(result).toContain('early morning')
  })

  it('includes late night context', () => {
    const result = assembleSystemPrompt({ ...baseInput, hour: 23 })
    expect(result).toContain('late night')
  })

  it('joins all 4 layers with double newlines', () => {
    const result = assembleSystemPrompt(baseInput)
    // Verify the structure has all layers separated by \n\n
    expect(result).toContain(CORE_PROMPT + '\n\n' + SPEECH_PROMPT)
  })
})
