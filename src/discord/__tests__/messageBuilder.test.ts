import { describe, expect, it, vi } from 'vitest'

vi.mock('../expressions.js', () => ({
  getExpressionUrl: () => 'https://example.test/roka.png'
}))

import type { WatchOutcome } from '../../agent/media/types.js'
import type { ReplyOutcome } from '../../agent/replyOutcomes.js'
import { MAX_TOOL_FOOTER_CHARS, TEXT_DISPLAY_BUDGET, buildRokaMessage, buildToolFooter } from '../messageBuilder.js'
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

function footerWithoutTimestamp(labels: string[]) {
  return buildToolFooter(labels, 0).replace(' • <t:0:R>', '')
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

const PLATFORMS: SocialPlatform[] = ['x', 'bluesky', 'youtube', 'tiktok', 'reddit', 'instagram', 'bilibili']
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

// MAX_TOOL_FOOTER_CHARS is derived by guessing the worst case — the three longest labels plus the overflow
// suffix — and config.discord.maxMessageLength's ceiling is that guess subtracted from the budget. These
// sweep the guess instead of trusting it, over the selections a real turn can actually produce.
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
    return (footer ?? '')
      .split('\n')[0]
      .replace('-# 🌸 ', '')
      .replace(/ • <t:\d+:R>$/, '')
  }

  // Any 10-digit epoch renders the same width, which is the assumption the derivation itself documents.
  const EPOCH = 1_784_808_000
  const LABELS = TOOL_NAMES.map((toolName) => labelFor(toolName))
  // A turn opens at most one linked post, and its label leads the footer ahead of the tools.
  const POST_LABELS = SOCIAL_POST_OUTCOMES.map((socialPost) => labelFor('', socialPost))
  const REPLY_OUTCOMES: ReplyOutcome[] = ['none', 'found', 'failed']
  // One watched item per turn leads the footer too. Clock times are the variable part, so the samples take the
  // longest a label prints (9:59:59; later times are left out of the label) alongside every fixed wording.
  const LONGEST_CLOCK = 35_999
  const WATCH_OUTCOMES: Array<WatchOutcome | undefined> = [
    undefined,
    ...(['video', 'audio'] as const).flatMap((kind): WatchOutcome[] => [
      { status: 'watched', kind, coverage: 'whole', durationSec: LONGEST_CLOCK },
      { status: 'watched', kind, coverage: 'part', startSec: LONGEST_CLOCK, endSec: LONGEST_CLOCK },
      { status: 'watched', kind, coverage: 'part', startSec: LONGEST_CLOCK, endSec: LONGEST_CLOCK, heard: 'none' },
      { status: 'watched', kind, coverage: 'whole', durationSec: LONGEST_CLOCK, heard: 'none' },
      { status: 'watched', kind, coverage: 'skim' },
      { status: 'remembered', kind },
      { status: 'failed', kind }
    ])
  ]

  /**
   * Longest footer over every distinct ordered selection, plus a tool selection that achieves it. Distinct
   * because generateResponse builds toolsUsed from a Set (src/agent/roka.ts), which is what keeps the
   * derivation valid — repeated labels would push the worst case past it, and the NUMERIC_BOUNDS ceiling
   * derived from it too. The names are returned so the render test can exercise the same worst case rather
   * than whichever selection happens to come first in declaration order.
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
    const watchLeads = WATCH_OUTCOMES.map((watch) => (watch ? [labelFor('', undefined, undefined, watch)] : []))
    for (let post = -1; post < POST_LABELS.length; post++) {
      const postLead = post < 0 ? [] : [POST_LABELS[post]]
      for (const outcome of REPLY_OUTCOMES) {
        for (const [watchIndex, watchLead] of watchLeads.entries()) {
          const lead = [...postLead, ...watchLead, ...(outcome === 'none' ? [] : [labelFor('', undefined, outcome)])]
          for (let i = 0; i < LABELS.length; i++) {
            for (let j = 0; j < LABELS.length; j++) {
              for (let k = 0; k < LABELS.length; k++) {
                if (i === j || j === k || i === k) continue
                const spare = TOOL_NAMES.findIndex((_, index) => index !== i && index !== j && index !== k)
                for (const overflow of [[], [spare]]) {
                  const picked = [i, j, k, ...overflow]
                  const chars = buildToolFooter([...lead, ...picked.map((index) => LABELS[index])], EPOCH).length
                  if (chars > worst.chars) {
                    worst = {
                      chars,
                      names: picked.map((index) => TOOL_NAMES[index]),
                      socialPost: post < 0 ? undefined : SOCIAL_POST_OUTCOMES[post],
                      replyOutcome: outcome === 'none' ? undefined : outcome,
                      watchOutcome: WATCH_OUTCOMES[watchIndex]
                    }
                  }
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
    const selections = [[], TOOL_NAMES.slice(0, 1), TOOL_NAMES.slice(0, 2), heaviest.slice(0, 3), heaviest]
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
    expect(payloadJson('She premiered in January~', ['search_web'], SOURCES)).toContain(
      footerWithoutTimestamp(['searched the wider world'])
    )
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
      footerWithoutTimestamp(['peeked at the X post', 'searched the wider world'])
    )
  })

  it.each([
    ['https://www.youtube.com/watch?v=jNQXAC9IVRw', 'peeked at the YouTube video'],
    ['https://bsky.app/profile/atproto.com/post/3mx7uc3l6i22k', 'peeked at the Bluesky post']
  ])('names the platform and kind of post for %s', (url, label) => {
    expect(payloadJson('Cute~', [], [], foundPost(url))).toContain(footerWithoutTimestamp([label]))
  })

  it('says so when the linked post could not be opened', () => {
    const failed: SocialPostLookup = { status: 'failed', platform: 'x', reason: 'timeout' }

    expect(payloadJson('Hmm~', [], [], failed)).toContain(footerWithoutTimestamp(["couldn't open the X post"]))
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
  it("shows that she heard the crowd's chatter when the replies were read", () => {
    expect(payloadJson('So many people agree~', ['read_replies'], [], undefined, 'found')).toContain(
      footerWithoutTimestamp(["heard the crowd's chatter"])
    )
  })

  it("says she couldn't hear the crowd when the replies could not be opened", () => {
    expect(payloadJson('Hmm~', ['read_replies'], [], undefined, 'failed')).toContain(
      footerWithoutTimestamp(["couldn't hear the crowd"])
    )
  })

  it('orders the post label, then the replies label, then tool labels', () => {
    expect(
      payloadJson('Hm~', ['search_web', 'read_replies'], [], foundPost('https://x.com/roka/status/123'), 'found')
    ).toContain(
      footerWithoutTimestamp(['peeked at the X post', "heard the crowd's chatter", 'searched the wider world'])
    )
  })

  it('renders byte-identically when no replies were read', () => {
    expect(payloadJson('Tea~', ['roll_dice'], [], undefined, 'none')).toBe(payloadJson('Tea~', ['roll_dice']))
  })
})

// The footer is where a reader checks whether she really watched what she talks about, and how much of it.
describe('buildRokaMessage watch outcomes', () => {
  it.each<[WatchOutcome, string]>([
    [{ status: 'watched', kind: 'video', coverage: 'whole', durationSec: 186 }, 'watched the whole video (3:06)'],
    [
      { status: 'watched', kind: 'video', coverage: 'part', startSec: 653, endSec: 1306 },
      'watched 10:53–21:46 of the video'
    ],
    [{ status: 'watched', kind: 'video', coverage: 'skim' }, 'skimmed the video in clips'],
    [{ status: 'watched', kind: 'audio', coverage: 'whole', durationSec: 45 }, 'heard the whole clip (0:45)'],
    [{ status: 'remembered', kind: 'video' }, 'remembered watching this video'],
    [{ status: 'failed', kind: 'video' }, "couldn't watch the video"],
    [{ status: 'failed', kind: 'audio' }, "couldn't hear the clip"],
    [
      { status: 'watched', kind: 'video', coverage: 'whole', durationSec: 186, heard: 'none' },
      'watched the whole video without sound (3:06)'
    ],
    [
      { status: 'watched', kind: 'video', coverage: 'part', startSec: 600, endSec: 720, heard: 'none' },
      'watched 10:00–12:00 of the video without sound'
    ],
    [
      { status: 'watched', kind: 'video', coverage: 'whole', durationSec: 186, heard: 'speech' },
      'watched the whole video (3:06)'
    ]
  ])('labels %j as "%s"', (outcome, label) => {
    expect(payloadJson('Mou~', [], [], undefined, undefined, outcome)).toContain(footerWithoutTimestamp([label]))
  })

  it('leaves times out of a label past 9:59:59 so the footer budget holds', () => {
    expect(
      payloadJson('Mou~', [], [], undefined, undefined, {
        status: 'watched',
        kind: 'video',
        coverage: 'part',
        startSec: 36_000,
        endSec: 36_120
      })
    ).toContain(footerWithoutTimestamp(['watched part of the video']))
  })

  it('puts the watch label after the post label and before the replies label', () => {
    expect(
      payloadJson('Hm~', ['search_web'], [], foundPost('https://x.com/roka/status/123'), 'found', {
        status: 'failed',
        kind: 'video'
      })
    ).toContain(
      footerWithoutTimestamp(['peeked at the X post', "couldn't watch the video", "heard the crowd's chatter"])
    )
  })

  it('renders byte-identically when nothing was watched', () => {
    expect(payloadJson('Tea~', ['roll_dice'], [], undefined, undefined, undefined)).toBe(
      payloadJson('Tea~', ['roll_dice'])
    )
  })
})

describe('buildRokaMessage', () => {
  it.each([
    ['roll_dice', 'cast the fortune dice'],
    ['flip_coin', 'tossed a shrine coin'],
    ['get_current_time', 'peeked at the temple clock'],
    ['get_weather', "divined today's weather"],
    ['search_web', 'searched the wider world'],
    ['search_anime', 'leafed through anime scrolls'],
    ['get_anime_schedule', 'checked the airing almanac'],
    ['set_reminder', 'tied a reminder charm'],
    ['list_reminders', 'counted her reminder charms'],
    ['cancel_reminder', 'untied a reminder charm'],
    ['remember_user', 'pressed a memory flower'],
    ['recall_user', 'recalled a pressed memory']
  ])('renders the approved label for %s', (toolName, label) => {
    expect(payloadJson('A ritual completed~', [toolName])).toContain(footerWithoutTimestamp([label]))
  })

  it('exposes labels only, never a distinctive tool argument', () => {
    const distinctiveArgument = 'ARGUMENT-MUST-NEVER-REACH-DISCORD-5f1a'
    const payload = payloadJson('A ritual completed~', ['roll_dice', distinctiveArgument])

    expect(payload).toContain(footerWithoutTimestamp(['cast the fortune dice']))
    expect(payload).not.toContain(distinctiveArgument)
  })

  it('places a small divider directly before the tool-usage footer', () => {
    const components = buildRokaMessage('A ritual completed~', 'playful', ['roll_dice']).components[0].toJSON()
      .components
    const footerIndex = components.findIndex(
      (component) => component.type === 10 && component.content.startsWith(footerWithoutTimestamp(['']))
    )

    expect(components[footerIndex - 1]).toMatchObject({ type: 14, divider: true, spacing: 1 })
  })

  it('ends the tool-usage footer with a Discord relative timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T12:00:00Z'))

    const components = buildRokaMessage('A ritual completed~', 'playful', ['roll_dice']).components[0].toJSON()
      .components
    const footer = components.find(
      (component) => component.type === 10 && component.content.startsWith(footerWithoutTimestamp(['']))
    )

    expect(footer).toMatchObject({ content: buildToolFooter(['cast the fortune dice'], 1_784_808_000) })

    vi.useRealTimers()
  })

  it('pins the tool footer prefix, separator, overflow suffix, and timestamp form as literal strings', () => {
    const twoLabelFooter = buildToolFooter(['first label', 'second label'], 1_784_808_000)
    expect(twoLabelFooter).toBe('-# 🌸 first label · second label • <t:1784808000:R>')

    const overflowFooter = buildToolFooter(['a', 'b', 'c', 'd'], 1_784_808_000)
    expect(overflowFooter).toBe('-# 🌸 a · b · c …and more • <t:1784808000:R>')

    expect(overflowFooter).toMatch(/<t:\d+:R>$/)
  })

  it('derives the worst-case tool footer size independently of the current clock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    vi.resetModules()
    const { MAX_TOOL_FOOTER_CHARS: atFirstDate } = await import('../messageBuilder.js')

    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    vi.resetModules()
    const { MAX_TOOL_FOOTER_CHARS: atSecondDate } = await import('../messageBuilder.js')

    expect(atFirstDate).toBe(151)
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
    expect(noToolsOutput).not.toContain(footerWithoutTimestamp(['']))
  })

  it('skips unknown tools and caps the footer after three known labels', () => {
    const payload = payloadJson('All done~', [
      'unknown_tool',
      'roll_dice',
      'flip_coin',
      'get_current_time',
      'get_weather'
    ])

    expect(payload).toContain(
      footerWithoutTimestamp([
        'cast the fortune dice',
        'tossed a shrine coin',
        'peeked at the temple clock',
        'a fourth label'
      ])
    )
    expect(payload).not.toContain("read the sky's mood")
    expect(payload).not.toContain('unknown_tool')
  })
})
