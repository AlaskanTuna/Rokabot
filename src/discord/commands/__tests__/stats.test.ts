import { InteractionContextType } from 'discord.js'
import { describe, expect, it } from 'vitest'
import { statsCommand } from '../stats.js'

describe('/stats command', () => {
  it('is available only in guild contexts', () => {
    expect(statsCommand.toJSON().contexts).toEqual([InteractionContextType.Guild])
  })
})
