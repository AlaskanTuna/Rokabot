import { describe, expect, it } from 'vitest'
import { FACES, TONE_FACES } from '../prompts/kaomoji.js'
import { buildReplyShapePrompt, chooseReplyShape, messageWeight, renderReplyShape } from '../replyShape.js'

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LONG =
  'I finally finished the big project at work today and honestly I am so drained, my manager kept moving the deadline and I barely slept this week, do you think I should ask for a few days off or just push through until the holidays?'

function shapes(userMessage: string, tone: Parameters<typeof chooseReplyShape>[0]['tone'] = 'playful', runs = 600) {
  const rng = seeded(42)
  return Array.from({ length: runs }, () =>
    chooseReplyShape({ userMessage, tone, recentReplies: [], displayName: 'Ikuyo', rng })
  )
}

describe('messageWeight', () => {
  it('reads a ping or a short quip as quick', () => {
    expect(messageWeight('Roka')).toBe('quick')
    expect(messageWeight('roka roka')).toBe('quick')
    expect(messageWeight('lol you lost again')).toBe('quick')
  })

  it('reads a long or heavy message as rich', () => {
    expect(messageWeight(LONG)).toBe('rich')
    expect(messageWeight('I feel so lonely tonight and I do not really know who to talk to')).toBe('rich')
  })

  it('reads an everyday line as ordinary', () => {
    expect(messageWeight('what kind of sweets do you sell at the shop?')).toBe('ordinary')
  })

  it('weighs what the user wrote, not the message they replied to', () => {
    const replied = `[Replying to Maniwa Roka: [Container: ${LONG}]] Roka`
    expect(messageWeight(replied)).toBe('quick')
  })
})

describe('chooseReplyShape', () => {
  it('keeps a quick message to one paragraph most of the time', () => {
    const counts = shapes('Roka').map((shape) => shape.paragraphs)
    expect(counts.filter((p) => p === 1).length / counts.length).toBeGreaterThan(0.55)
    expect(counts).not.toContain(3)
  })

  it('gives an ordinary message two paragraphs most of the time, sometimes one or three', () => {
    const counts = shapes('what kind of sweets do you sell at the shop?').map((shape) => shape.paragraphs)
    expect(counts.filter((p) => p === 2).length / counts.length).toBeGreaterThan(0.6)
    expect(counts).toContain(1)
    expect(counts).toContain(3)
  })

  it('never cuts a rich message to one paragraph and often gives it three', () => {
    const counts = shapes(LONG).map((shape) => shape.paragraphs)
    expect(counts).not.toContain(1)
    expect(counts.filter((p) => p === 3).length / counts.length).toBeGreaterThan(0.45)
  })

  it('spreads openings evenly across every style a playful mood allows', () => {
    const styles = shapes('what kind of sweets do you sell at the shop?').map((shape) => shape.opener.style)
    const share = (style: string) => styles.filter((s) => s === style).length / styles.length
    for (const style of ['content', 'soft', 'particle', 'gasp', 'comedy', 'name']) {
      expect(share(style), style).toBeGreaterThan(0.1)
      expect(share(style), style).toBeLessThan(0.25)
    }
  })

  it('keeps a sincere or tender moment to plain openings', () => {
    for (const tone of ['sincere', 'tender'] as const) {
      const styles = new Set(shapes('I had a rough day', tone).map((shape) => shape.opener.style))
      expect([...styles].sort()).toEqual(['content', 'soft'])
    }
  })

  it('never opens the way the last few replies opened', () => {
    const rng = seeded(7)
    const recentReplies = ['Mou~ you again!', '*Huh?* Since when?', 'Fufu~ caught you.']
    for (let i = 0; i < 300; i++) {
      const shape = chooseReplyShape({ userMessage: 'hey', tone: 'playful', recentReplies, displayName: 'Ikuyo', rng })
      expect(['Mou~', 'Huh?', 'Fufu~']).not.toContain(shape.opener.word)
    }
  })

  it('does not open in the same style twice in a row', () => {
    const rng = seeded(9)
    for (let i = 0; i < 300; i++) {
      const shape = chooseReplyShape({
        userMessage: 'hey',
        tone: 'playful',
        recentReplies: ['Ara~ look who came by.'],
        displayName: 'Ikuyo',
        rng
      })
      expect(shape.opener.style).not.toBe('particle')
    }
  })

  it('does not end on a question right after a reply that did', () => {
    const rng = seeded(11)
    for (let i = 0; i < 300; i++) {
      const shape = chooseReplyShape({
        userMessage: 'hey',
        tone: 'playful',
        recentReplies: ['So, did you finish it? (・∀・)'],
        displayName: 'Ikuyo',
        rng
      })
      expect(shape.ending).not.toBe('question')
    }
  })

  it('offers four different faces from the mood, skipping faces used recently', () => {
    const rng = seeded(13)
    const pool = TONE_FACES.flustered.flatMap((group) => FACES[group])
    const used = pool.slice(0, 5)
    for (let i = 0; i < 200; i++) {
      const shape = chooseReplyShape({
        userMessage: 'you look cute today',
        tone: 'flustered',
        recentReplies: [`Wh-what ${used.join(' ')}`],
        displayName: 'Ikuyo',
        rng
      })
      expect(new Set(shape.faces).size).toBe(4)
      for (const face of shape.faces) {
        expect(pool).toContain(face)
        expect(used).not.toContain(face)
      }
    }
  })
})

describe('romance and big-sister beats', () => {
  it('asks for a sweet or suggestive line in about half of playful replies', () => {
    const flirts = shapes('what kind of sweets do you sell at the shop?').filter((shape) => shape.flirt).length / 600
    expect(flirts).toBeGreaterThan(0.45)
    expect(flirts).toBeLessThan(0.65)
  })

  it('never asks for one in a sincere or nostalgic moment', () => {
    for (const tone of ['sincere', 'nostalgic'] as const) {
      expect(shapes('I had a rough day', tone).some((shape) => shape.flirt)).toBe(false)
    }
  })

  it('sometimes has her call herself onee-san, never in a sincere moment', () => {
    const playful = shapes('what kind of sweets do you sell at the shop?').filter((shape) => shape.oneesan).length / 600
    expect(playful).toBeGreaterThan(0.15)
    expect(playful).toBeLessThan(0.35)
    expect(shapes('I had a rough day', 'sincere').some((shape) => shape.oneesan)).toBe(false)
  })

  it('asks for one dramatic overreaction in some flustered or annoyed replies, never a quiet one', () => {
    const flustered = shapes('you look cute today', 'flustered').filter((shape) => shape.drama).length / 600
    expect(flustered).toBeGreaterThan(0.3)
    expect(flustered).toBeLessThan(0.6)
    for (const tone of ['sincere', 'tender', 'nostalgic', 'sleepy'] as const) {
      expect(shapes('hey', tone).some((shape) => shape.drama)).toBe(false)
    }
  })

  it('renders each beat only when it was drawn', () => {
    const rng = seeded(5)
    let flirtLines = 0
    for (let i = 0; i < 200; i++) {
      const input = { userMessage: 'hey there', tone: 'playful' as const, recentReplies: [], displayName: 'Ikuyo', rng }
      const shape = chooseReplyShape(input)
      const prompt = renderReplyShape(shape)
      expect(prompt.includes('plainly sweet on them'), String(shape.flirt)).toBe(shape.flirt)
      expect(prompt.includes('onee-san'), String(shape.oneesan)).toBe(shape.oneesan)
      expect(prompt.includes('dramatic overreaction'), String(shape.drama)).toBe(shape.drama)
      if (shape.flirt) flirtLines++
    }
    expect(flirtLines).toBeGreaterThan(0)
  })
})

describe('buildReplyShapePrompt', () => {
  it('spells out length, opening, ending and faces for this reply only', () => {
    const prompt = buildReplyShapePrompt({
      userMessage: 'Roka',
      tone: 'playful',
      recentReplies: [],
      displayName: 'Ikuyo',
      rng: seeded(3)
    })
    expect(prompt.startsWith('## Reply Shape')).toBe(true)
    expect(prompt).toContain('If you look something up or watch media this turn, those rules win.')
    expect(prompt).toMatch(/- Length: /)
    expect(prompt).toMatch(/- Open: /)
    expect(prompt).toMatch(/- End: /)
    expect(prompt).toMatch(/- Faces that fit: /)
  })

  it('names the speaker when the opening is their name, and otherwise keeps the name off the first word', () => {
    const rng = seeded(21)
    let sawName = false
    let sawOther = false
    for (let i = 0; i < 200; i++) {
      const input = { userMessage: 'hey there', tone: 'playful' as const, recentReplies: [], displayName: 'Ikuyo', rng }
      const prompt = buildReplyShapePrompt(input)
      if (prompt.includes('Open with their name, "Ikuyo"')) sawName = true
      else {
        sawOther = true
        expect(prompt).toContain('Use their name at most once, and not as your first word.')
      }
    }
    expect(sawName && sawOther).toBe(true)
  })
})
