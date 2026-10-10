import { describe, expect, it, vi } from 'vitest'

vi.mock('../expressions.js', () => ({
  getExpressionUrl: () => 'https://example.test/roka.png'
}))

import type { WatchOutcome } from '../../agent/media/types.js'
import type { ReplyOutcome } from '../../agent/replyOutcomes.js'
import {
  MAX_TOOL_FOOTER_CHARS,
  TEXT_DISPLAY_BUDGET,
  buildRokaMessage,
  buildToolFooter,
  openedPostCitation
} from '../messageBuilder.js'
import type { SocialPost, SocialPostLookup } from '../socialPosts/types.js'
import { type SocialPlatform, parseSocialPostUrl } from '../socialPosts/urls.js'

function payloadJson(
  text: string,
  toolsUsed?: string[],
  sources?: Array<{ url: string }>,
  socialPost?: SocialPostLookup,
  replyOutcome?: ReplyOutcome,
  watchOutcome?: WatchOutcome
) {
  return JSON.stringify(
    buildRokaMessage(text, 'playful', toolsUsed, sources, socialPost, replyOutcome, watchOutcome).components[0].toJSON()
  )
}

/** Every TextDisplay in the container — Components V2 budgets their content together, not separately. */
function renderedChars(
  text: string,
  toolsUsed?: string[],
  sources?: Array<{ url: string }>,
  socialPost?: SocialPostLookup,
  replyOutcome?: ReplyOutcome,
  watchOutcome?: WatchOutcome
) {
  const container = buildRokaMessage(
    text,
    'playful',
    toolsUsed,
    sources,
    socialPost,
    replyOutcome,
    watchOutcome
  ).components[0].toJSON() as {
    components: Array<{ content?: string; components?: Array<{ content?: string }> }>
  }
  return container.components
    .flatMap((component) => component.components ?? [component])
    .map((component) => component.content ?? '')
    .join('').length
}

function footerFor(labels: string[]) {
  return buildToolFooter(labels)
}

function foundPost(url: string): SocialPostLookup {
  const target = parseSocialPostUrl(url)!
  const post: SocialPost = {
    platform: target.platform,
    id: target.id,
    canonicalUrl: target.canonicalUrl,
    target,
    authorHandle: 'roka',
    authorName: 'Roka',
    createdAt: null,
    text: 'post',
    quotedText: '',
    quotedAuthorHandle: '',
    photoCount: 0,
    videoCount: 0,
    imageUrl: null,
    externalTitle: '',
    replyCount: null,
    durationSec: null,
    video: null
  }
  return { status: 'found', post }
}

/** A found post on any platform: the footer reads only its platform and canonical URL. */
function foundOn(platform: SocialPlatform): SocialPostLookup {
  const found = foundPost('https://x.com/roka/status/123')
  return found.status === 'found' ? { status: 'found', post: { ...found.post, platform } } : found
}

const PLATFORMS: SocialPlatform[] = ['x', 'bluesky', 'youtube', 'tiktok', 'reddit', 'instagram', 'bilibili', 'threads']
const SOCIAL_POST_OUTCOMES: SocialPostLookup[] = [
  foundPost('https://x.com/roka/status/123'),
  ...PLATFORMS.map((platform): SocialPostLookup => ({ status: 'failed', platform, reason: 'timeout' }))
]

const TOOL_NAMES = [
  'roll_dice',
  'flip_coin',
  'get_current_time',
  'get_weather',
  'search_web',
  'search_anime',
  'get_anime_schedule',
  'set_reminder',
  'list_reminders',
  'cancel_reminder',
  'remember_user',
  'recall_user'
]

// MAX_TOOL_FOOTER_CHARS is derived from the longest label of each kind plus the widest overflow count, and
// config.discord.maxMessageLength's ceiling is that subtracted from the budget. These sweep the derivation
// instead of trusting it, over the selections a real turn can actually produce.
describe('tool footer budget', () => {
  // buildToolFooter takes labels, not tool names, so the labels are read back out of a rendered footer
  // rather than restated here — a copy would drift the moment a label is reworded.
  function labelFor(
    toolName: string,
    socialPost?: SocialPostLookup,
    replyOutcome?: ReplyOutcome,
    watchOutcome?: WatchOutcome
  ): string {
    const container = buildRokaMessage(
      'x',
      'playful',
      toolName ? [toolName] : [],
      [],
      socialPost,
      replyOutcome,
      watchOutcome
    ).components[0].toJSON() as {
      components: Array<{ content?: string; components?: Array<{ content?: string }> }>
    }
    const footer = container.components
      .flatMap((component) => component.components ?? [component])
      .map((component) => component.content ?? '')
      .find((content) => content.startsWith('-# 🌸'))
    // An opened post also adds a citation row beneath the footer line.
    return (footer ?? '').split('\n')[0].replace('-# 🌸 ', '')
  }

  const LABELS = TOOL_NAMES.map((toolName) => labelFor(toolName))
  // A turn opens at most one linked post, and its label leads the footer ahead of the tools.
  const POST_LABELS = SOCIAL_POST_OUTCOMES.map((socialPost) => labelFor('', socialPost))
  const REPLY_OUTCOMES: ReplyOutcome[] = ['none', 'found', 'failed']
  // One watched item per turn leads the footer too. Its label has no times, so every wording is sampled once.
  const WATCH_OUTCOMES: WatchOutcome[] = (['video', 'audio'] as const).flatMap((kind): WatchOutcome[] => [
    { status: 'watched', kind, coverage: 'whole', durationSec: 186 },
    { status: 'watched', kind, coverage: 'part', startSec: 0, endSec: 120, durationSec: 186 },
    { status: 'watched', kind, coverage: 'part', startSec: 600, endSec: 720, durationSec: 1800 },
    { status: 'watched', kind, coverage: 'skim' },
    { status: 'remembered', kind },
    { status: 'failed', kind }
  ])

  type Lead = { lead: string[]; socialPost?: SocialPostLookup; watchOutcome?: WatchOutcome }

  // A post label and a watch label each lead on their own; a post's own video takes one label naming both.
  const LEADS: Lead[] = [
    ...[undefined, ...SOCIAL_POST_OUTCOMES].flatMap((socialPost) =>
      [undefined, ...WATCH_OUTCOMES].map((watchOutcome) => ({
        lead: [
          ...(socialPost ? [POST_LABELS[SOCIAL_POST_OUTCOMES.indexOf(socialPost)]] : []),
          ...(watchOutcome ? [labelFor('', undefined, undefined, watchOutcome)] : [])
        ],
        socialPost,
        watchOutcome
      }))
    ),
    ...PLATFORMS.flatMap((platform) =>
      WATCH_OUTCOMES.map((outcome) => {
        const watchOutcome = { ...outcome, fromLink: true }
        return {
          lead: [labelFor('', foundOn(platform), undefined, watchOutcome)],
          socialPost: foundOn(platform),
          watchOutcome
        }
      })
    )
  ]

  /**
   * Longest footer over every distinct ordered selection, plus a tool selection that achieves it. Distinct
   * because generateResponse builds toolsUsed from a Set (src/agent/roka.ts), which is what keeps the
   * derivation valid — repeated labels would push the worst case past it, and the NUMERIC_BOUNDS ceiling
   * derived from it too. The overflow count is swept to every tool, because its digits widen the suffix. The
   * names are returned so the render test can exercise the same worst case rather than whichever selection
   * happens to come first in declaration order.
   */
  function worstDistinctFooter(): {
    chars: number
    names: string[]
    socialPost?: SocialPostLookup
    replyOutcome?: ReplyOutcome
    watchOutcome?: WatchOutcome
  } {
    let worst: {
      chars: number
      names: string[]
      socialPost?: SocialPostLookup
      replyOutcome?: ReplyOutcome
      watchOutcome?: WatchOutcome
    } = { chars: 0, names: [] }
    for (const { lead: leadLabels, socialPost, watchOutcome } of LEADS) {
      for (const outcome of REPLY_OUTCOMES) {
        const lead = [...leadLabels, ...(outcome === 'none' ? [] : [labelFor('', undefined, outcome)])]
        for (let i = 0; i < LABELS.length; i++) {
          for (let j = 0; j < LABELS.length; j++) {
            if (i === j) continue
            const rest = TOOL_NAMES.flatMap((_, index) => (index !== i && index !== j ? [index] : []))
            for (let extra = 0; extra <= rest.length; extra++) {
              const picked = [i, j, ...rest.slice(0, extra)]
              const chars = buildToolFooter([...lead, ...picked.map((index) => LABELS[index])]).length
              if (chars > worst.chars) {
                worst = {
                  chars,
                  names: picked.map((index) => TOOL_NAMES[index]),
                  socialPost,
                  replyOutcome: outcome === 'none' ? undefined : outcome,
                  watchOutcome
                }
              }
            }
          }
        }
      }
    }
    return worst
  }

  it('bounds every reachable tool combination, not just the one the derivation guessed', () => {
    expect(worstDistinctFooter().chars).toBeLessThanOrEqual(MAX_TOOL_FOOTER_CHARS)
  })

  // Exactly tight, not merely sufficient: slack here would silently shrink every reply's usable length.
  it('is exactly the longest reachable footer rather than an overestimate', () => {
    expect(worstDistinctFooter().chars).toBe(MAX_TOOL_FOOTER_CHARS)
  })

  // The invariant the ceiling exists to guarantee. Declaration order is not the worst case — the selection
  // that maximises the footer is what leaves fitCitations the least room — so it is rendered explicitly
  // alongside the short-footer cases rather than hoping a count-based sweep happens to reach it.
  it('keeps the rendered message within the budget for the worst tool selection at the ceiling', () => {
    const ceiling = TEXT_DISPLAY_BUDGET - MAX_TOOL_FOOTER_CHARS
    const sources = [{ url: 'https://www.crunchyroll.com/news/a' }, { url: 'https://vndb.org/b' }]
    const { names: heaviest, socialPost, replyOutcome, watchOutcome } = worstDistinctFooter()
    const selections = [[], TOOL_NAMES.slice(0, 1), TOOL_NAMES.slice(0, 2), heaviest.slice(0, 2), heaviest]
    let worst = 0
    for (const selection of selections) {
      for (let length = ceiling - 120; length <= ceiling; length++) {
        worst = Math.max(
          worst,
          renderedChars('x'.repeat(length), selection, sources, socialPost, replyOutcome, watchOutcome)
        )
      }
    }

    expect(worst).toBeLessThanOrEqual(TEXT_DISPLAY_BUDGET)
  })
})

describe('buildRokaMessage citations', () => {
  const SOURCES = [{ url: 'https://www.crunchyroll.com/news/a' }, { url: 'https://vndb.org/b' }]

  // With the search rubric live, search_web fires on most factual questions, so a reply is routinely built
  // on sources the reader cannot otherwise see (#19 item 1).
  it('cites the sources a searched reply was built on', () => {
    expect(payloadJson('She premiered in January~', ['search_web'], SOURCES)).toContain('crunchyroll.com')
  })

  // The footer says what she did; the citations say where it came from. Complementary, not duplicated.
  it('keeps the tool footer alongside the citations rather than replacing it', () => {
    expect(payloadJson('She premiered in January~', ['search_web'], SOURCES)).toContain(footerFor(['searched the web']))
  })

  it('adds nothing when the turn searched nothing', () => {
    expect(payloadJson('Tea is ready~', ['roll_dice'], [])).toBe(payloadJson('Tea is ready~', ['roll_dice']))
  })

  // The reply text, the footer and the citation row share one budget, and only the citations are droppable.
  // The longest reply production can build is bounded by discord.maxMessageLength, whose own ceiling is
  // TEXT_DISPLAY_BUDGET - MAX_TOOL_FOOTER_CHARS, so that is the worst case the citation row has to survive.
  it('keeps a maximum-length searched reply within the shared budget', () => {
    const longestReply = 'x'.repeat(TEXT_DISPLAY_BUDGET - MAX_TOOL_FOOTER_CHARS)

    expect(renderedChars(longestReply, ['search_web'], SOURCES)).toBeLessThanOrEqual(TEXT_DISPLAY_BUDGET)
  })

  // Swept rather than sampled: the overrun only appears at the lengths where the citation row exactly fills
  // its budget, which any single fixed reply length walks straight past.
  it('never overruns the shared budget at any reply length', () => {
    const ceiling = TEXT_DISPLAY_BUDGET - MAX_TOOL_FOOTER_CHARS
    const rendered = []
    for (let length = ceiling - 250; length <= ceiling; length++) {
      rendered.push(renderedChars('x'.repeat(length), ['search_web'], SOURCES))
    }

    expect(Math.max(...rendered)).toBeLessThanOrEqual(TEXT_DISPLAY_BUDGET)
  })
})

// A linked post is read before the model runs, so it is not a tool call; without this the reader cannot tell
// whether she saw the post or only searched around it.
describe('buildRokaMessage linked posts', () => {
  const SOURCES = [{ url: 'https://news.ycombinator.com/item?id=1' }]

  it('leads the footer with the post she opened, ahead of the tools she used', () => {
    expect(payloadJson('Credits~', ['search_web'], SOURCES, foundPost('https://x.com/roka/status/123'))).toContain(
      footerFor(['peeked at the X post', 'searched the web'])
    )
  })

  it.each([
    ['https://www.youtube.com/watch?v=jNQXAC9IVRw', 'peeked at the YouTube video'],
    ['https://bsky.app/profile/atproto.com/post/3mx7uc3l6i22k', 'peeked at the Bluesky post']
  ])('names the platform and kind of post for %s', (url, label) => {
    expect(payloadJson('Cute~', [], [], foundPost(url))).toContain(footerFor([label]))
  })

  it('says so when the linked post could not be opened', () => {
    const failed: SocialPostLookup = { status: 'failed', platform: 'x', reason: 'timeout' }

    expect(payloadJson('Hmm~', [], [], failed)).toContain(footerFor(["couldn't open the X post"]))
  })

  it('cites the opened post ahead of the search sources', () => {
    expect(payloadJson('Credits~', ['search_web'], SOURCES, foundPost('https://x.com/roka/status/123'))).toContain(
      '-# 🔗 [x.com](<https://x.com/i/status/123>)  ·  [news.ycombinator.com](<https://news.ycombinator.com/item?id=1>)'
    )
  })

  it('does not cite a post it could not open', () => {
    const failed: SocialPostLookup = { status: 'failed', platform: 'x', reason: 'timeout' }

    expect(payloadJson('Hmm~', [], [], failed)).not.toContain('🔗')
  })

  it('renders byte-identically when the turn had no linked post', () => {
    expect(payloadJson('Tea is ready~', ['roll_dice'], SOURCES, { status: 'none' })).toBe(
      payloadJson('Tea is ready~', ['roll_dice'], SOURCES)
    )
  })
})

describe('buildRokaMessage reply outcomes', () => {
  it('shows that she read the replies when they were read', () => {
    expect(payloadJson('So many people agree~', ['read_replies'], [], undefined, 'found')).toContain(
      footerFor(['read the replies'])
    )
  })

  it("says she couldn't read the replies when they could not be opened", () => {
    expect(payloadJson('Hmm~', ['read_replies'], [], undefined, 'failed')).toContain(
      footerFor(["couldn't read the replies"])
    )
  })

  it('orders the post label, then the replies label, then tool labels', () => {
    expect(
      payloadJson('Hm~', ['search_web', 'read_replies'], [], foundPost('https://x.com/roka/status/123'), 'found')
    ).toContain(footerFor(['peeked at the X post', 'read the replies', 'searched the web']))
  })

  it('renders byte-identically when no replies were read', () => {
    expect(payloadJson('Tea~', ['roll_dice'], [], undefined, 'none')).toBe(payloadJson('Tea~', ['roll_dice']))
  })
})

// The footer is where a reader checks whether she really watched what she talks about. How much is a word, not
// times: the reply itself cites the moments.
describe('buildRokaMessage watch outcomes', () => {
  it.each<[WatchOutcome, string]>([
    [{ status: 'watched', kind: 'video', coverage: 'whole', durationSec: 186 }, 'watched the video'],
    [
      { status: 'watched', kind: 'video', coverage: 'part', startSec: 653, endSec: 1306, durationSec: 1306 },
      'watched most of the video'
    ],
    [
      { status: 'watched', kind: 'video', coverage: 'part', startSec: 600, endSec: 720, durationSec: 1800 },
      'watched part of the video'
    ],
    [{ status: 'watched', kind: 'video', coverage: 'skim' }, 'skimmed the video'],
    [{ status: 'watched', kind: 'audio', coverage: 'whole', durationSec: 45 }, 'heard the clip'],
    [
      { status: 'watched', kind: 'audio', coverage: 'part', startSec: 0, endSec: 30, durationSec: 45 },
      'heard most of the clip'
    ],
    [{ status: 'remembered', kind: 'video' }, 'remembered the video'],
    [{ status: 'failed', kind: 'video' }, "couldn't watch the video"],
    [{ status: 'failed', kind: 'audio' }, "couldn't hear the clip"]
  ])('labels %j as "%s"', (outcome, label) => {
    expect(payloadJson('Mou~', [], [], undefined, undefined, outcome)).toContain(footerFor([label]))
  })

  it('names a linked post and its own video in one label', () => {
    const payload = payloadJson('Mou~', ['search_web'], [], foundPost('https://x.com/roka/status/123'), 'none', {
      status: 'watched',
      kind: 'video',
      coverage: 'whole',
      durationSec: 39,
      fromLink: true
    })

    expect(payload).toContain(footerFor(['watched the X video', 'searched the web']))
    expect(payload).not.toContain('peeked at')
  })

  it.each<[WatchOutcome, string]>([
    [
      {
        status: 'watched',
        kind: 'video',
        coverage: 'part',
        startSec: 0,
        endSec: 1050,
        durationSec: 2100,
        fromLink: true
      },
      'watched most of the YouTube video'
    ],
    [{ status: 'failed', kind: 'video', fromLink: true }, "couldn't watch the YouTube video"],
    [{ status: 'remembered', kind: 'video', fromLink: true }, 'remembered the YouTube video']
  ])('labels a linked YouTube video %j as "%s"', (outcome, label) => {
    expect(payloadJson('Mou~', [], [], foundOn('youtube'), undefined, outcome)).toContain(footerFor([label]))
  })

  it('keeps the post label and a plain watch label when the watched item was an upload', () => {
    expect(
      payloadJson('Hm~', [], [], foundPost('https://x.com/roka/status/123'), undefined, {
        status: 'watched',
        kind: 'video',
        coverage: 'whole',
        durationSec: 39
      })
    ).toContain(footerFor(['peeked at the X post', 'watched the video']))
  })

  it('puts the watch label after the post label and before the replies label', () => {
    expect(
      payloadJson('Hm~', ['search_web'], [], foundPost('https://x.com/roka/status/123'), 'found', {
        status: 'failed',
        kind: 'video'
      })
    ).toContain(footerFor(['peeked at the X post', "couldn't watch the video", 'read the replies', 'searched the web']))
  })

  it('renders byte-identically when nothing was watched', () => {
    expect(payloadJson('Tea~', ['roll_dice'], [], undefined, undefined, undefined)).toBe(
      payloadJson('Tea~', ['roll_dice'])
    )
  })
})

describe('buildRokaMessage', () => {
  it.each([
    ['roll_dice', 'cast the dice'],
    ['flip_coin', 'tossed a coin'],
    ['get_current_time', 'checked the clock'],
    ['get_weather', 'checked the weather'],
    ['search_web', 'searched the web'],
    ['search_anime', 'looked up anime'],
    ['get_anime_schedule', 'checked airing times'],
    ['set_reminder', 'set a reminder'],
    ['list_reminders', 'listed reminders'],
    ['cancel_reminder', 'cancelled a reminder'],
    ['remember_user', 'saved a memory'],
    ['recall_user', 'recalled a memory']
  ])('renders the approved label for %s', (toolName, label) => {
    expect(payloadJson('A ritual completed~', [toolName])).toContain(footerFor([label]))
  })

  it('exposes labels only, never a distinctive tool argument', () => {
    const distinctiveArgument = 'ARGUMENT-MUST-NEVER-REACH-DISCORD-5f1a'
    const payload = payloadJson('A ritual completed~', ['roll_dice', distinctiveArgument])

    expect(payload).toContain(footerFor(['cast the dice']))
    expect(payload).not.toContain(distinctiveArgument)
  })

  it('places a small divider directly before the tool-usage footer', () => {
    const components = buildRokaMessage('A ritual completed~', 'playful', ['roll_dice']).components[0].toJSON()
      .components
    const footerIndex = components.findIndex(
      (component) => component.type === 10 && component.content.startsWith(footerFor(['']))
    )

    expect(components[footerIndex - 1]).toMatchObject({ type: 14, divider: true, spacing: 1 })
  })

  // Discord already shows when the reply was sent beside her name, so the footer carries no timestamp.
  it('ends the tool-usage footer with its last label rather than a timestamp', () => {
    const components = buildRokaMessage('A ritual completed~', 'playful', ['roll_dice']).components[0].toJSON()
      .components
    const footer = components.find(
      (component) => component.type === 10 && component.content.startsWith(footerFor(['']))
    )

    expect(footer).toMatchObject({ content: '-# 🌸 cast the dice' })
  })

  it('pins the tool footer prefix, separator and overflow count as literal strings', () => {
    expect(buildToolFooter(['first label', 'second label'])).toBe('-# 🌸 first label · second label')
    expect(buildToolFooter(['a', 'b', 'c', 'd'])).toBe('-# 🌸 a · b +2')
  })

  it('derives the worst-case tool footer size independently of the current clock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    vi.resetModules()
    const { MAX_TOOL_FOOTER_CHARS: atFirstDate } = await import('../messageBuilder.js')

    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    vi.resetModules()
    const { MAX_TOOL_FOOTER_CHARS: atSecondDate } = await import('../messageBuilder.js')

    expect(atFirstDate).toBe(73)
    expect(atSecondDate).toBe(atFirstDate)

    vi.useRealTimers()
  })

  it('pins the max message length to the shared budget minus the measured tool footer', async () => {
    vi.stubEnv('DISCORD_TOKEN', 'test-token')
    vi.stubEnv('DISCORD_CLIENT_ID', 'test-client-id')
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key')
    const { NUMERIC_BOUNDS } = await import('../../config.js')
    const maxMessageLength = NUMERIC_BOUNDS.find((bound) => bound.path === 'discord.maxMessageLength')

    expect(maxMessageLength?.max).toBe(4000 - MAX_TOOL_FOOTER_CHARS)

    vi.unstubAllEnvs()
  })

  it('keeps plain replies byte-identical and adds no footer for no tools', () => {
    const currentOutput = payloadJson('Tea is ready~')
    const noToolsOutput = payloadJson('Tea is ready~', [])

    expect(noToolsOutput).toBe(currentOutput)
    expect(noToolsOutput).not.toContain(footerFor(['']))
  })

  it('skips unknown tools and caps the footer after two known labels', () => {
    const payload = payloadJson('All done~', [
      'unknown_tool',
      'roll_dice',
      'flip_coin',
      'get_current_time',
      'get_weather'
    ])

    expect(payload).toContain('-# 🌸 cast the dice · tossed a coin +2')
    expect(payload).not.toContain("read the sky's mood")
    expect(payload).not.toContain('unknown_tool')
  })
})

// A reply to one of her messages reopens the post that message was about, read back from its footer. Messages
// sent before the labels changed keep their old footers, so both shapes have to be recognised.
describe('openedPostCitation', () => {
  const citation = '-# 🔗 [x.com](<https://x.com/i/status/123>)  ·  [example.com](<https://example.com/a>)'

  it.each([
    ['an old footer with its timestamp', '-# 🌸 peeked at the X post · searched the wider world • <t:1791438787:R>'],
    ['a footer with the post label', '-# 🌸 peeked at the X post · searched the web'],
    ['a footer naming the post and its video together', '-# 🌸 watched the X video · searched the web'],
    ['a footer saying the post video could not be watched', "-# 🌸 couldn't watch the Instagram video +1"]
  ])('reads the post back from %s', (_case, footer) => {
    expect(openedPostCitation(['Mou~', `${footer}\n${citation}`])).toBe('https://x.com/i/status/123')
  })

  it.each([
    ['an old search-only footer', '-# 🌸 searched the wider world • <t:1791438787:R>'],
    ['a search-only footer', '-# 🌸 searched the web'],
    ['a footer for an uploaded video', '-# 🌸 watched the video · searched the web']
  ])('never takes a search citation for a post from %s', (_case, footer) => {
    expect(openedPostCitation(['Mou~', `${footer}\n${citation}`])).toBeNull()
  })
})

describe('buildRokaMessage dividers', () => {
  const SEPARATOR = { type: 14, divider: true, spacing: 1 }

  function rendered(text: string, toolsUsed: string[] = []) {
    return buildRokaMessage(text, 'playful', toolsUsed).components[0].toJSON().components
  }

  it('draws a --- line as a separator between two text blocks', () => {
    const [section, separator, after, ...rest] = rendered('The answer.\n\n---\n\nMy take~')

    expect(section).toMatchObject({ type: 9, components: [{ type: 10, content: 'The answer.' }] })
    expect(separator).toMatchObject(SEPARATOR)
    expect(after).toMatchObject({ type: 10, content: 'My take~' })
    expect(rest).toEqual([])
  })

  it('keeps the tool footer last, after the divided reply', () => {
    const components = rendered('The answer.\n---\nMy take~', ['roll_dice'])

    expect(components.at(-3)).toMatchObject({ type: 10, content: 'My take~' })
    expect(components.at(-2)).toMatchObject(SEPARATOR)
    expect(components.at(-1)).toMatchObject({ type: 10, content: footerFor(['cast the dice']) })
  })

  it('leaves a dash rule inside a code block as code', () => {
    const text = 'Front matter:\n```md\n---\ntitle: x\n---\n```'

    expect(rendered(text)).toEqual([expect.objectContaining({ type: 9, components: [{ type: 10, content: text }] })])
  })

  it('draws at most two dividers and keeps the rest of the reply in the last block', () => {
    const components = rendered('A\n---\nB\n---\nC\n---\nD')

    expect(components.filter((component) => component.type === 14)).toHaveLength(2)
    expect(components.at(-1)).toMatchObject({ type: 10, content: 'C\n\nD' })
  })

  it('renders a reply without a divider as one section', () => {
    expect(rendered('Just one paragraph~')).toEqual([
      expect.objectContaining({ type: 9, components: [{ type: 10, content: 'Just one paragraph~' }] })
    ])
  })
})
