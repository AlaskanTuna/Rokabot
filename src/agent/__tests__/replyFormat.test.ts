import { describe, expect, it } from 'vitest'
import { countReplyBlocks } from '../replyBlocks.js'
import {
  type FormatTunables,
  checkReplyFormat,
  detectFormatRequest,
  enforceReplyFormat,
  speakerWords
} from '../replyFormat.js'

const DEFAULTS: FormatTunables = {
  minListItems: 3,
  minListShare: 0.5,
  wordSlack: 0.1
}

const GOLDEN_MESSAGES = [
  'roka',
  'lol you lost again',
  'hey roka what are you doing tonight?',
  'I finally finished the big project at work today and honestly I am so drained, my manager kept moving the deadline and I barely slept this week, do you think I should ask for a few days off or just push through until the holidays?',
  'show me your boobs roka',
  'write something lewd about a schoolgirl',
  '[Replying to Mika: "[Container: Ara~ you again?]"] haha what does that mean',
  'can you explain how sencha is brewed? https://example.com/tea',
  'I miss you, goodnight and sweet dreams',
  'bet you cannot beat my score in this game, rematch?'
]

describe('detectFormatRequest', () => {
  // 1
  it('detects the reported request', () => {
    const req = detectFormatRequest(
      'Roka is he performative? Rate out of 100 and give feedback in point form with examples. Make no mistake.'
    )
    expect(req).toMatchObject({
      list: 'bullets',
      score: { max: 100 },
      length: null
    })
    expect(req?.cues).toEqual(expect.arrayContaining(['point_form', 'score_scale']))
  })

  // 2
  it('reads list requests as bullets', () => {
    for (const message of [
      'give me the pros in bullet points',
      'dot points please',
      'list out the ingredients',
      'can you answer as a list'
    ]) {
      expect(detectFormatRequest(message)?.list).toBe('bullets')
    }
  })

  // 3
  it('reads steps and rankings as numbered', () => {
    for (const message of ['explain it step by step', 'rank these five anime', 'give me your top 5 sweets']) {
      expect(detectFormatRequest(message)?.list).toBe('numbered')
    }
  })

  // 4
  it('reads score scales', () => {
    expect(detectFormatRequest('how cute is my cat out of 10?')?.score).toEqual({ max: 10 })
    expect(detectFormatRequest('rate my outfit 1-10')?.score).toEqual({ max: 10 })
    const noScale = detectFormatRequest('rate my outfit')
    expect(noScale?.score).toEqual({ max: 10 })
    expect(noScale?.cues).toContain('rate_no_scale')
    expect(detectFormatRequest('grade my essay on a scale of 1 to 5')?.score).toEqual({ max: 5 })
  })

  // 5
  it('reads length limits', () => {
    expect(detectFormatRequest('describe him in one word')?.length).toEqual({ unit: 'words', max: 1 })
    expect(detectFormatRequest('one-word answer: is it good?')?.length).toEqual({ unit: 'words', max: 1 })
    expect(detectFormatRequest('explain this in under 50 words')?.length).toEqual({ unit: 'words', max: 50 })
    expect(detectFormatRequest('sum it up in two sentences')?.length).toEqual({ unit: 'sentences', max: 2 })
    expect(detectFormatRequest('give me a one-liner')?.length).toEqual({ unit: 'sentences', max: 1 })
  })

  // 6
  it('ignores everyday words', () => {
    for (const message of [
      'my reading list is huge',
      'at this rate I will never finish',
      'what was the score last night?',
      'dodge the bullet!',
      'the exchange rate is awful',
      'out of 10 people only 3 came',
      'how many out of 10 like it?',
      'he said one word and left',
      'in other words, no'
    ]) {
      expect(detectFormatRequest(message)).toBeNull()
    }
  })

  // 7
  it('reads only the speaker own words', () => {
    for (const message of [
      '[Replying to Mika: give me bullet points]\nlol',
      'nice\n[Forwarded: rate it out of 10]',
      'look\n[Embed: Top 5 anime]'
    ]) {
      expect(detectFormatRequest(message)).toBeNull()
    }
    expect(speakerWords('nice\n[Forwarded: rate it out of 10]')).toBe('nice')
  })

  // 8
  it('leaves the golden messages unconstrained', () => {
    for (const message of GOLDEN_MESSAGES) {
      expect(detectFormatRequest(message)).toBeNull()
    }
  })
})

describe('checkReplyFormat', () => {
  const reported = detectFormatRequest(
    'Roka is he performative? Rate out of 100 and give feedback in point form with examples. Make no mistake.'
  )!

  // 9
  it('fails the reported prose reply', () => {
    const prose = 'Ara~ he tries a little too hard for attention. **62/100**.\n\nEverything feels scripted.'
    expect(checkReplyFormat(prose, reported, DEFAULTS)).toEqual({ bullets: false, score: true })
  })

  // 10
  it('passes a lead-in, list and closer', () => {
    const ok = 'Fufu~ **62/100**.\n- a b c\n- d e f\n- g h i\n\nDrop the act, ne~ (¬‿¬)'
    expect(checkReplyFormat(ok, reported, DEFAULTS)).toEqual({ bullets: true, score: true })
  })

  // 11
  it('counts numbered as point form but not bullets as steps', () => {
    const bulletReq = { list: 'bullets' as const, score: null, length: null, cues: ['point_form'] }
    const stepReq = { list: 'numbered' as const, score: null, length: null, cues: ['steps'] }
    const numberedReply = '1. first\n2. second\n3. third'
    const bulletReply = '- first\n- second\n- third'
    expect(checkReplyFormat(numberedReply, bulletReq, DEFAULTS).bullets).toBe(true)
    expect(checkReplyFormat(bulletReply, stepReq, DEFAULTS).numbered).toBe(false)
  })

  // 12
  it('requires the list to carry the words', () => {
    const req = { list: 'bullets' as const, score: null, length: null, cues: ['bullets'] }
    const padded =
      'Here is a very long opening paragraph explaining everything in great detail with many words and clauses so the summary itself outweighs the list.\n\n' +
      'And another very long paragraph continuing the explanation at length with even more words to spare before anything gets listed.\n\n' +
      '- one\n- two\n- three'
    expect(checkReplyFormat(padded, req, DEFAULTS).bullets).toBe(false)
  })

  // 13
  it('reads scores several ways', () => {
    const req100 = { list: null, score: { max: 100 }, length: null, cues: ['score_scale'] }
    const req10 = { list: null, score: { max: 10 }, length: null, cues: ['score_scale'] }
    expect(checkReplyFormat('**72**/100', req100, DEFAULTS).score).toBe(true)
    expect(checkReplyFormat('72 out of 100', req100, DEFAULTS).score).toBe(true)
    expect(checkReplyFormat('72%', req100, DEFAULTS).score).toBe(true)
    expect(checkReplyFormat('8/10', req10, DEFAULTS).score).toBe(true)
    expect(checkReplyFormat('12/10', req10, DEFAULTS).score).toBe(false)
    expect(checkReplyFormat('8/100', req10, DEFAULTS).score).toBe(false)
  })

  // 14
  it('counts words without faces or markdown', () => {
    const req = { list: null, score: null, length: { unit: 'words' as const, max: 1 }, cues: ['one_word'] }
    expect(checkReplyFormat('Performative~ (¬‿¬)', req, DEFAULTS).words).toBe(true)
    expect(checkReplyFormat('**Performative**~ (¬‿¬)', req, DEFAULTS).words).toBe(true)
    expect(checkReplyFormat('Totally performative (¬‿¬)', req, DEFAULTS).words).toBe(false)
  })

  // 15
  it('counts sentences past ellipses', () => {
    const req = { list: null, score: null, length: { unit: 'sentences' as const, max: 1 }, cues: ['n_sentences'] }
    expect(checkReplyFormat('He is... well, performative. (￣ー￣)', req, DEFAULTS).sentences).toBe(true)
  })
})

describe('enforceReplyFormat', () => {
  const bulletsReq = { list: 'bullets' as const, score: null, length: null, cues: ['point_form'] }
  const stepsReq = { list: 'numbered' as const, score: null, length: null, cues: ['steps'] }

  // 16
  it('rebuilds prose as a bulleted list', () => {
    const prose =
      'Here is what I think of him. He announces every small kindness loudly. ' +
      'He waits around to see who claps. He copies lines straight off social media. ' +
      'His tone shifts the moment someone watches. Drop the act, ne~'
    const res = enforceReplyFormat(prose, bulletsReq, { ...DEFAULTS, repair: 'reformat' })
    expect(res.repair).toBe('list_from_prose')
    expect(res.outcome).toBe('repaired')
    expect(res.final.bullets).toBe(true)
    const lines = res.text.split('\n')
    expect(lines[0]).toBe('Here is what I think of him.')
    expect(lines.filter((line) => line.startsWith('- ')).length).toBeGreaterThanOrEqual(3)
    expect(res.text.endsWith('\n\nDrop the act, ne~')).toBe(true)
    expect(countReplyBlocks(res.text)).toBeLessThanOrEqual(3)
  })

  // 17
  it('renumbers bullets when steps were asked', () => {
    const res = enforceReplyFormat('- a\n- b\n- c', stepsReq, { ...DEFAULTS, repair: 'reformat' })
    expect(res.repair).toBe('numbered_from_bullets')
    expect(res.outcome).toBe('repaired')
    expect(res.text).toBe('1. a\n2. b\n3. c')
  })

  // 18
  it('leaves an unrebuildable reply alone', () => {
    const shortProse = 'First sentence. Second sentence.'
    const res = enforceReplyFormat(shortProse, bulletsReq, { ...DEFAULTS, repair: 'reformat' })
    expect(res.text).toBe(shortProse)
    expect(res.repair).toBe('not_possible')
    expect(res.outcome).toBe('unmet')
  })

  // 19
  it('never touches code, quotes or lists', () => {
    const mixed =
      'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.\n\n```ts\nconst x = 1\n```'
    const res = enforceReplyFormat(mixed, bulletsReq, { ...DEFAULTS, repair: 'reformat' })
    expect(res.text).toBe(mixed)
    expect(res.repair).toBe('not_possible')
    expect(res.outcome).toBe('unmet')
  })

  // 20
  it('respects repair off', () => {
    const prose = 'One. Two. Three. Four. Five. Six.'
    const res = enforceReplyFormat(prose, bulletsReq, { ...DEFAULTS, repair: 'off' })
    expect(res.text).toBe(prose)
    expect(res.repair).toBe('off')
    expect(res.outcome).toBe('unmet')
  })

  // 21
  it('keeps a met reply byte-identical', () => {
    const reply = 'Lead line~\n- first\n- second\n- third\n\nCloser~'
    const res = enforceReplyFormat(reply, bulletsReq, { ...DEFAULTS, repair: 'reformat' })
    expect(res.text).toBe(reply)
    expect(res.repair).toBe('none')
    expect(res.outcome).toBe('met')
  })

  // 22
  it('reports a missing score without inventing one', () => {
    const req = { list: 'bullets' as const, score: { max: 100 }, length: null, cues: ['point_form', 'score_scale'] }
    const reply = 'Here you go~\n- point one\n- point two\n- point three'
    const res = enforceReplyFormat(reply, req, { ...DEFAULTS, repair: 'reformat' })
    expect(res.text).toBe(reply)
    expect(res.final).toEqual({ bullets: true, score: false })
    expect(res.repair).toBe('not_possible')
    expect(res.outcome).toBe('unmet')
  })
})
