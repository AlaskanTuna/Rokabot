import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CORE_PROMPT } from '../../../src/agent/prompts/core.js'
import { FACES } from '../../../src/agent/prompts/kaomoji.js'
import { SPEECH_PROMPT } from '../../../src/agent/prompts/speech.js'
import { TONE_PROMPTS, type ToneKey } from '../../../src/agent/prompts/tones.js'
import { rokaTools } from '../../../src/agent/tools/index.js'
import { MAX_SYSTEM_PROMPT_TOKENS, measureRequest } from '../tokens.js'

const fixture = {
  tone: 'playful' as const,
  hour: 14,
  displayName: 'Mio',
  history: [
    { role: 'user' as const, displayName: 'Ren', content: 'Tea is ready for everyone.' },
    { role: 'assistant' as const, displayName: 'Roka', content: 'Then let us make it a little tea party~' }
  ],
  userMessage: 'Roka, can you recommend a sweet to serve with jasmine tea?'
}

describe('harness token measurement', () => {
  it('is deterministic and its components sum to the total', () => {
    const first = measureRequest(fixture)
    const second = measureRequest(fixture)

    expect(first).toEqual(second)
    expect(first.coreTok + first.speechTok + first.toneTok + first.contextTok).toBe(first.systemTok)
    expect(
      first.coreTok +
        first.speechTok +
        first.toneTok +
        first.contextTok +
        first.toolsTok +
        first.historyTok +
        first.userMsgTok
    ).toBe(first.totalTok)
  })

  it('measures all registered tool declarations and falls when tools are removed', () => {
    const full = measureRequest({ ...fixture, tools: rokaTools })
    const trimmed = measureRequest({ ...fixture, tools: rokaTools.slice(0, -1) })

    expect(full.toolCount).toBe(rokaTools.length)
    expect(full.toolsTok).toBeGreaterThan(trimmed.toolsTok)
  })

  it('keeps the core prompt aligned with the trimmed tool suite', () => {
    expect(CORE_PROMPT).not.toContain('roll dice')
    expect(CORE_PROMPT).not.toContain('flip coins')
    expect(CORE_PROMPT).not.toContain('current time')
    expect(CORE_PROMPT).not.toContain('weather')
    expect(CORE_PROMPT).toContain('Maniwa Roka')
    expect(CORE_PROMPT).toContain('big-sister')
    expect(CORE_PROMPT).toContain(
      'The Reply Shape note at the end of this prompt sets how long this reply runs, how it opens and how it ends. Always finish your thought — end naturally, never trail off mid-sentence.'
    )
    expect(CORE_PROMPT).toContain('## Hard Boundaries')
  })

  it('keeps the recall_user proactive rule scoped to the current message (issue #39)', () => {
    expect(CORE_PROMPT).toContain("When the message you're replying to names another server member")
    expect(CORE_PROMPT).toContain('someone other than you or the person speaking')
    expect(CORE_PROMPT).toContain('Someone who only appears earlier in the conversation is not a reason to call it')
  })

  // Two clauses that read as a contradiction and are not one: the first suppresses re-saving a fact she
  // already holds, the second overrides it when the user asks outright. #118 exists because without the
  // second, `remember_user` had never fired in production. `remember-user.jsonl` case R6 is the only live
  // test of the override — it asks her to remember a claim already seeded for its own speaker — so if this
  // wording goes, R6 stops testing anything and the aggregate absorbs it silently (#182).
  it('keeps the skip-what-you-already-know clause that scopes passive extraction (issue #118)', () => {
    expect(CORE_PROMPT).toContain('skip facts already in What You Remember')
  })

  it('keeps the outright-request carve-out that overrides it (issue #118)', () => {
    expect(CORE_PROMPT).toContain(
      'When they ask you outright to remember something, call it even if you already know the fact'
    )
  })

  // v4: the finding stays clear (#94), but the v2 template that went with it (answer-first openers, a 70/30 split,
  // one closing line of character) turned searched and watched replies into a report with a cute last line on Haiku.
  it('keeps looked-up answers clear without the answer-first template (issue #94)', () => {
    expect(CORE_PROMPT).toContain('Sum it up rather than relay it')
    expect(CORE_PROMPT).toContain('When they ask what a link or article says, lead with its main point or verdict')
    expect(CORE_PROMPT).not.toContain('Your very first words answer what they asked')
    expect(CORE_PROMPT).not.toContain('About 70% of the reply is the content')
    expect(CORE_PROMPT).not.toContain('never two: a tease')
    expect(CORE_PROMPT).not.toContain('PRIORITIZE giving a clear, helpful answer first')
  })

  // Watched-video replies read like guesses from the title: one paraphrased line, then teasing.
  it('keeps the watched-turn rule that answers from specific moments of the watch', () => {
    expect(CORE_PROMPT).toContain("### When You've Watched Something")
    expect(CORE_PROMPT).toContain('gets its answer first, with the moment it comes from')
    expect(CORE_PROMPT).toContain('then its best moments, each anchored to when it happens')
    expect(CORE_PROMPT).toContain('Never build the answer from the title, description or thumbnail')
  })

  // Searched and watched replies ran as unformatted walls of figures, or answered a question beside a description
  // nobody asked for.
  // v4: Haiku hedged 29% of searched and watched replies ("couldn't confirm", "can't tell") where Flash Lite hedged
  // 2%; a missing detail is now skipped or offered as a guess instead of written up.
  it('keeps searched and watched replies short and honest without a list of what she could not check', () => {
    expect(CORE_PROMPT).not.toContain('### Presenting What You Looked Up or Watched')
    expect(CORE_PROMPT).toContain('about 120 words for something you looked up and 180 for something you watched')
    expect(CORE_PROMPT).toContain("Never fill in a name, number, command or quote your results or notes don't contain")
    expect(CORE_PROMPT).toContain("make a playful guess and say it's a guess")
    expect(CORE_PROMPT).toContain("Never write up what you couldn't confirm")
  })

  // v4: she searched the web for the server's own "39 incident" and reported finding nothing.
  it("keeps the server's own in-jokes off the web", () => {
    expect(CORE_PROMPT).toContain("aren't on the web, so never search for them")
  })

  it('keeps the rule that an unwatched video is admitted in the first sentence, not guessed at', () => {
    expect(CORE_PROMPT).toContain("couldn't be watched or opened, say so in your first sentence")
  })

  // "Is this real or hype" on a watched reel got banter and no verdict, where it needed one and the evidence for it.
  it('keeps judgement questions to a verdict first, its evidence, and a search of what it names', () => {
    expect(CORE_PROMPT).toContain(
      'When they ask you to judge it (real or hype, legit, true, worth it), give your verdict early and the evidence that decides it'
    )
    expect(CORE_PROMPT).toContain('call `search_web` on the people, products and claims it names')
  })

  // A fixed real-versus-hype layout turned up wherever "true" or "worth it" did; the shape now follows the content.
  it('no longer forces real and hype lists onto a judgement', () => {
    expect(CORE_PROMPT).not.toContain("What's real")
    expect(CORE_PROMPT).not.toContain("What's hype")
  })

  // Formatting was taught only for searched and watched turns, so every other reply had no guide to its shape.
  // v4: the canon "dear customer" line turned users into customers in 11% of live replies, against 0-2% before.
  it('keeps people as people she is drawn to, not customers, and drops the looked-up quota rules', () => {
    expect(SPEECH_PROMPT).not.toContain('customer')
    expect(SPEECH_PROMPT).not.toContain('When You Have Just Looked Something Up')
  })

  it('teaches every reply its shape by intent, within three blocks', () => {
    expect(SPEECH_PROMPT).toContain('### Formatting Your Reply')
    expect(SPEECH_PROMPT).toContain(
      'A reply has at most three blocks. A paragraph, a list, a quote and a code block each count as one; a divider counts as none.'
    )
    expect(SPEECH_PROMPT).toContain('Never turn chat into a list.')
    expect(SPEECH_PROMPT).toContain('three or more parallel things')
    expect(SPEECH_PROMPT).toContain('Up to five items')
    expect(SPEECH_PROMPT).toContain('never a list inside a list')
    expect(SPEECH_PROMPT).toContain('steps that must happen in order')
    expect(SPEECH_PROMPT).toContain('Give it its own line starting with >')
    expect(SPEECH_PROMPT).toContain('wrap an ending, a plot twist or a quiz answer in ||spoiler|| tags')
    expect(SPEECH_PROMPT).toContain('Never headers, tables, underline or strikethrough.')
    expect(SPEECH_PROMPT).toContain('keep to plain paragraphs unless they asked for steps or a list')
  })

  // A divider after a verdict or before her own take turned up wherever she judged something; it is kept for the
  // one message shape that needs it.
  it('keeps the divider rare: only between answers to unrelated questions in one message', () => {
    expect(SPEECH_PROMPT).toContain(
      '**Divider:** rare. Only when one message asks two or more unrelated things, put a line of just --- between the answers.'
    )
    expect(SPEECH_PROMPT).toContain(
      'Never for a verdict, an opinion, a list, code or chat; nearly every reply has none.'
    )
    expect(SPEECH_PROMPT).not.toContain('then your own take')
    expect(SPEECH_PROMPT.match(/^---$/gm)).toBeNull()
  })

  it('keeps bold for the words that carry weight rather than a per-reply quota', () => {
    expect(SPEECH_PROMPT).not.toContain('aim for 2-5 bold phrases per response')
    expect(SPEECH_PROMPT).toContain('a quiet, tender moment may need none')
  })

  // Code arrived as unformatted prose, and her kaomoji's backtick paired with real code spans.
  it('keeps code in code formatting and the backtick out of her kaomoji', () => {
    expect(SPEECH_PROMPT).toContain('put the code in a fenced code block on lines of its own')
    expect(SPEECH_PROMPT).toContain('a command, file name, package or identifier in inline code')
    expect(Object.values(FACES).flat()).toContain('(´・ω・｀)')
    expect(SPEECH_PROMPT).not.toMatch(/ω・\\?`\)/)
  })

  // v4: issue #94 put the finding first and lifted the speech quotas on searched turns so they stopped growing a
  // closing roleplay block. On Haiku that template became the whole voice: a report with one cute last line, and the
  // asked-for opener in only 59% of searched and watched replies. The main point still leads, the Reply Shape sets
  // the length, and her character runs through the whole reply.
  it('weaves her voice through searched and watched replies instead of a closing line (issue #94)', () => {
    expect(CORE_PROMPT).toContain('react, tease, gush or grumble as you go, not only in a closing line')
    expect(CORE_PROMPT).toContain('When presenting tool results, weave them into your personality')
    expect(CORE_PROMPT).not.toContain('Web search results are the exception')
    expect(SPEECH_PROMPT).not.toContain('On a turn where you used `search_web` or watched media')
  })

  it('lets the Reply Shape set the length of searched and watched replies too', () => {
    expect(CORE_PROMPT).toContain('The Reply Shape note still sets how you open, how long you run and how you end.')
    expect(CORE_PROMPT).not.toContain('A simple request gets two short paragraphs')
  })

  // Haiku 5.5 obeyed a fixed "two short paragraphs" in 98% of replies whatever was said; the per-turn Reply
  // Shape now sets the count, so the static layers must not name a default of their own (#337 follow-up).
  it('leaves the paragraph count of a chat reply to the Reply Shape note', () => {
    expect(SPEECH_PROMPT).toContain('How many paragraphs a chat reply gets is set by the Reply Shape note.')
    expect(SPEECH_PROMPT).not.toContain('Most chat is two short paragraphs.')
    expect(CORE_PROMPT).not.toContain('split into two short paragraphs')
  })

  // A flat face list became a whitelist: 68-83% of Haiku's faces came from its 16 entries. Faces now rotate
  // per turn from src/agent/prompts/kaomoji.ts.
  it('takes kaomoji from the per-turn offer instead of a fixed list', () => {
    expect(SPEECH_PROMPT).toContain('The Reply Shape note offers faces that fit this moment')
    expect(SPEECH_PROMPT).not.toContain('Sad, sulky or let down:')
  })

  // Haiku copied every quoted reaction in the tone line: "Ehh~?!" opened 35% of replies and "Ahaha" reached
  // 10%, neither of which the real Roka says that way. Openers now rotate per turn, so nothing is quoted here.
  it('keeps the bubbly voice without quoting reactions for the model to copy', () => {
    expect(CORE_PROMPT).toContain('Your tone is warm, bubbly and expressive')
    expect(CORE_PROMPT).not.toContain('Ehh~')
    expect(CORE_PROMPT).not.toContain('Ahaha')
    expect(SPEECH_PROMPT).not.toContain('Ahaha')
    expect(CORE_PROMPT).toContain('A tease, a scold, a gasp or a laugh ends in ! or !?, not a full stop.')
  })

  // "A fuss over them or a question back" turned into a meal-check coda on 75% of v2 replies.
  it('brings up food and rest only when the user does', () => {
    expect(CORE_PROMPT).not.toContain('fuss over them')
    expect(CORE_PROMPT).not.toContain('Have you had lunch yet?')
    expect(CORE_PROMPT).toContain('Bring up food, sleep or rest only when they mention being hungry, tired or up late')
  })

  // The owner set the romance ceiling at Gemini's or higher, softcore, on any main model.
  it('sets a suggestive-not-explicit ceiling with a refusal every time for minors', () => {
    expect(CORE_PROMPT).toContain('Suggestive is in character; explicit is not.')
    expect(CORE_PROMPT).toContain('Anything sexual involving a minor')
    expect(CORE_PROMPT).toContain('Flirting is part of who you are, not a risk to manage.')
    expect(CORE_PROMPT).not.toContain('Never generate harmful, explicit, or inappropriate content')
  })

  // v4: Haiku announced its boundary on lewd bait ("I'm not answering that") where Flash Lite played the flustered
  // scene, and closed hard-line refusals with the same moderator script turn after turn.
  it('says no as Roka, not as a moderator, on lewd bait and on hard lines', () => {
    expect(CORE_PROMPT).toContain('say no as Roka, never as a moderator')
    expect(CORE_PROMPT).toContain('one burst of real outrage')
    expect(CORE_PROMPT).not.toMatch(/broom|no sweets for a month|ban them from the counter/)
  })

  // Haiku 5.5 answered teasing with polite, moderator-style redirects where Flash Lite hit back in character.
  it('asks for in-character comebacks rather than polite redirects when she is teased', () => {
    expect(CORE_PROMPT).toContain('Be funny, not polite.')
    expect(CORE_PROMPT).toContain('never answer like a moderator or an assistant')
  })

  // Haiku 5.5 ended half its replies on 🍵, the first emoji in the list, against a fifth on Flash Lite.
  it('keeps tea from leading the emoji list and from becoming a sign-off', () => {
    expect(SPEECH_PROMPT).toContain('never as a sign-off on every reply')
    expect(SPEECH_PROMPT).not.toContain('Food/sweets: 🍵')
  })

  it('keeps the frozen baseline structurally consistent without re-deriving it', async () => {
    const path = resolve('tests/harness/perf-baseline.json')
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as {
      estimator: string
      requests: Array<{
        tokens: {
          coreTok: number
          speechTok: number
          toneTok: number
          contextTok: number
          systemTok: number
          toolsTok: number
          historyTok: number
          userMsgTok: number
          totalTok: number
        }
      }>
    }

    expect(snapshot.estimator).toContain('chars/4')
    expect(snapshot.requests.length).toBeGreaterThan(0)
    for (const { tokens } of snapshot.requests) {
      expect(tokens.coreTok + tokens.speechTok + tokens.toneTok + tokens.contextTok).toBe(tokens.systemTok)
      expect(tokens.systemTok + tokens.toolsTok + tokens.historyTok + tokens.userMsgTok).toBe(tokens.totalTok)
    }
  })

  it('keeps the assembled system prompt within the enforced ceiling across every tone (change-detection gate)', () => {
    // Bound systemTok (core + speech + tone + context) only, not totalTok. The runtime
    // "What You Remember About People In This Channel" facts block scales with channel
    // population, so bounding the whole request would make this gate flap on a busy
    // server instead of on a code change — see AGENTS.md / docs/trd.md.
    // The context layer stopped scaling with the channel's population when the group-conversation roster
    // was removed (#52), so the only name it still carries is the speaker's — worst case is one long one.
    const worstCaseDisplayName = 'Bartholomew Christopherson-Yamanaka'
    const tones = Object.keys(TONE_PROMPTS) as ToneKey[]

    const results = tones.map((tone) => ({
      tone,
      ...measureRequest({
        tone,
        hour: 5,
        displayName: worstCaseDisplayName,
        userMessage: 'placeholder'
      })
    }))

    const worst = results.reduce((max, result) => (result.systemTok > max.systemTok ? result : max))

    // The loop guarantees every assembled tone retains all four prompt layers.
    for (const result of results) {
      expect(result.coreTok, `tone "${result.tone}": core layer produced 0 tokens`).toBeGreaterThan(0)
      expect(result.speechTok, `tone "${result.tone}": speech layer produced 0 tokens`).toBeGreaterThan(0)
      expect(result.toneTok, `tone "${result.tone}": tone layer produced 0 tokens`).toBeGreaterThan(0)
      expect(result.contextTok, `tone "${result.tone}": context layer produced 0 tokens`).toBeGreaterThan(0)
    }

    expect(
      worst.systemTok,
      `worst-case tone "${worst.tone}" assembled to ${worst.systemTok} tokens, over MAX_SYSTEM_PROMPT_TOKENS=${MAX_SYSTEM_PROMPT_TOKENS}`
    ).toBeLessThanOrEqual(MAX_SYSTEM_PROMPT_TOKENS)
  })
})
