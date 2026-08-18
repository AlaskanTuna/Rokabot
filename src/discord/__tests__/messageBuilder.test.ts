import { describe, expect, it, vi } from 'vitest'

vi.mock('../expressions.js', () => ({
  getExpressionUrl: () => 'https://example.test/roka.png'
}))

import { MAX_TOOL_FOOTER_CHARS, TEXT_DISPLAY_BUDGET, buildRokaMessage, buildToolFooter } from '../messageBuilder.js'

function payloadJson(text: string, toolsUsed?: string[], sources?: Array<{ url: string }>) {
  return JSON.stringify(buildRokaMessage(text, 'playful', toolsUsed, sources).components[0].toJSON())
}

/** Every TextDisplay in the container — Components V2 budgets their content together, not separately. */
function renderedChars(text: string, toolsUsed?: string[], sources?: Array<{ url: string }>) {
  const container = buildRokaMessage(text, 'playful', toolsUsed, sources).components[0].toJSON() as {
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

    expect(atFirstDate).toBe(122)
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
