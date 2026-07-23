import { describe, expect, it, vi } from 'vitest'

vi.mock('../expressions.js', () => ({
  getExpressionUrl: () => 'https://example.test/roka.png'
}))

import { buildRokaMessage } from '../messageBuilder.js'

function payloadJson(text: string, toolsUsed?: string[]) {
  return JSON.stringify(buildRokaMessage(text, 'playful', toolsUsed).components[0].toJSON())
}

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
    expect(payloadJson('A ritual completed~', [toolName])).toContain(`-# 🌸 ${label}`)
  })

  it('exposes labels only, never a distinctive tool argument', () => {
    const distinctiveArgument = 'ARGUMENT-MUST-NEVER-REACH-DISCORD-5f1a'
    const payload = payloadJson('A ritual completed~', ['roll_dice', distinctiveArgument])

    expect(payload).toContain('-# 🌸 cast the fortune dice')
    expect(payload).not.toContain(distinctiveArgument)
  })

  it('places a small divider directly before the tool-usage footer', () => {
    const components = buildRokaMessage('A ritual completed~', 'playful', ['roll_dice']).components[0].toJSON()
      .components
    const footerIndex = components.findIndex(
      (component) => component.type === 10 && component.content.startsWith('-# 🌸')
    )

    expect(components[footerIndex - 1]).toMatchObject({ type: 14, divider: true, spacing: 1 })
  })

  it('ends the tool-usage footer with a Discord relative timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T12:00:00Z'))

    const components = buildRokaMessage('A ritual completed~', 'playful', ['roll_dice']).components[0].toJSON()
      .components
    const footer = components.find((component) => component.type === 10 && component.content.startsWith('-# 🌸'))

    expect(footer).toMatchObject({ content: '-# 🌸 cast the fortune dice • <t:1784808000:R>' })

    vi.useRealTimers()
  })

  it('keeps plain replies byte-identical and adds no footer for no tools', () => {
    const currentOutput = payloadJson('Tea is ready~')
    const noToolsOutput = payloadJson('Tea is ready~', [])

    expect(noToolsOutput).toBe(currentOutput)
    expect(noToolsOutput).not.toContain('-# 🌸')
  })

  it('skips unknown tools and caps the footer after three known labels', () => {
    const payload = payloadJson('All done~', [
      'unknown_tool',
      'roll_dice',
      'flip_coin',
      'get_current_time',
      'get_weather'
    ])

    expect(payload).toMatch(
      /-# 🌸 cast the fortune dice · tossed a shrine coin · peeked at the temple clock …and more • <t:\d+:R>/
    )
    expect(payload).not.toContain("read the sky's mood")
    expect(payload).not.toContain('unknown_tool')
  })
})
