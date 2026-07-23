import { describe, expect, it } from 'vitest'
import { animeCommand, toolCommands } from './tools.js'

describe('tool command registration', () => {
  it('nests the schedule commands under anime and omits retired tool commands', () => {
    const anime = animeCommand.toJSON()
    const schedule = anime.options?.find((option) => option.name === 'schedule')

    expect(toolCommands.map((command) => command.name)).toEqual(['anime', 'search', 'remind'])
    expect(schedule).toMatchObject({
      type: 2,
      options: [{ name: 'search' }, { name: 'browse' }]
    })
  })
})
