import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buddySprite, buildBuddyContainer } from '../../discord/events/games/shared.js'
import { SPECIES } from '../data/buddySpecies.js'

const buddySourceFiles = [
  ...readdirSync(resolve(process.cwd(), 'src/discord/events/games'))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => resolve(process.cwd(), 'src/discord/events/games', file)),
  resolve(process.cwd(), 'src/discord/events/gachaMention.ts'),
  resolve(process.cwd(), 'src/games/data/buddySpecies.ts')
]

describe('buddy sprites', () => {
  it('provides a unique Catbox sprite URL for every buddy species', () => {
    const spriteUrls = SPECIES.map(({ spriteUrl }) => spriteUrl)

    expect(spriteUrls).toHaveLength(18)
    expect(spriteUrls).toEqual(
      expect.arrayContaining(
        spriteUrls.map((url) => expect.stringMatching(/^https:\/\/files\.catbox\.moe\/[a-z0-9]+\.png$/))
      )
    )
    expect(new Set(spriteUrls).size).toBe(18)
  })

  it('serializes the species sprite URL as its thumbnail without files', () => {
    const species = SPECIES.find(({ id }) => id === 'kitsune')
    expect(species).toBeDefined()

    const payload = buildBuddyContainer({
      accentColor: 0xffffff,
      title: 'Kitsune',
      body: 'A fox spirit',
      thumbnailUrl: buddySprite(species!.id)
    })

    expect(payload.components[0].toJSON().components[0]).toMatchObject({
      accessory: { media: { url: species!.spriteUrl } }
    })
    expect(payload).not.toHaveProperty('files')
  })

  it('does not include files in a container without a thumbnail', () => {
    const payload = buildBuddyContainer({
      accentColor: 0xffffff,
      title: 'Guide',
      body: 'No companion'
    })

    expect(payload).not.toHaveProperty('files')
  })

  it('does not retain placeholder URLs in buddy-scope source files', () => {
    for (const path of buddySourceFiles) {
      expect(readFileSync(path, 'utf8')).not.toContain('placehold.co')
    }
  })
})
