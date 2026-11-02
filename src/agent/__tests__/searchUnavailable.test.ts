import { afterEach, describe, expect, it, vi } from 'vitest'
import { stripNarratedToolCalls } from '../narratedToolCalls.js'
import { ROKA_TOOL_NAMES } from '../tools/toolNames.js'

const ROKA = 'characters/roka'
const HARNESS = 'prompts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe.each(['off', 'native'] as const)('a deployment whose search provider is %s', (provider) => {
  it(`offers no search under ${provider}`, async () => {
    vi.resetModules()
    vi.stubEnv('SEARCH_PROVIDER', provider)

    const { rokaTools } = await import('../tools/index.js')
    const { character } = await import('../../character/index.js')
    const declarations = new Map(rokaTools.map((tool) => [tool.name, tool._getDeclaration()]))

    expect(rokaTools).toHaveLength(13)
    expect(declarations.has('search_web')).toBe(false)
    expect(JSON.stringify(rokaTools.map((tool) => tool._getDeclaration()))).not.toContain('search_web')
    for (const mode of ['full', 'forget', 'none'] as const) {
      expect(character.prompts.stable[mode]).not.toContain('search_web')
    }
    expect(declarations.get('search_anime')?.description).toBe('Search for anime by title or keyword.')
    expect(declarations.get('get_anime_schedule')?.description).toBe(
      'Get anime airing schedule. Can check a specific day, the full week, or current season.'
    )
    expect(declarations.get('read_replies')?.description).toContain('and then call it. Never call it just because')
  })

  it(`still strips a search_web call the model narrates under ${provider}`, async () => {
    vi.resetModules()
    vi.stubEnv('SEARCH_PROVIDER', provider)

    expect(stripNarratedToolCalls('*(search_web: x)* hi', ROKA_TOOL_NAMES)).toEqual({ text: 'hi', stripped: 1 })
  })
})
