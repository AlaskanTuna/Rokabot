import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { buddySprite, buildBuddyContainer } from '../../discord/events/games/shared.js'
import { SPECIES } from '../data/buddySpecies.js'

const spritesDirectory = resolve(process.cwd(), 'assets/sprites/buddies')
const buddySourceFiles = [
  ...readdirSync(resolve(process.cwd(), 'src/discord/events/games'))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => resolve(process.cwd(), 'src/discord/events/games', file)),
  resolve(process.cwd(), 'src/discord/events/gachaMention.ts'),
  resolve(process.cwd(), 'src/games/data/buddySpecies.ts')
]

describe('buddy sprites', () => {
  it('provides a valid bundled PNG for every buddy species', async () => {
    await Promise.all(
      SPECIES.map(async ({ id }) => {
        const path = resolve(spritesDirectory, `${id}.png`)

        expect(existsSync(path)).toBe(true)
        expect(statSync(path).size).toBeLessThanOrEqual(256 * 1024)

        const metadata = await sharp(path).metadata()

        expect(metadata.format).toBe('png')
        expect(metadata.width).toBe(metadata.height)
        expect(metadata.hasAlpha).toBe(true)
      })
    )
  })

  it('serializes a sprite thumbnail with its matching attachment', () => {
    const sprite = buddySprite('kitsune')

    const payload = buildBuddyContainer({
      accentColor: 0xffffff,
      title: 'Kitsune',
      body: 'A fox spirit',
      thumbnailUrl: sprite.url,
      files: [sprite.file]
    })

    expect(payload.components[0].toJSON().components[0]).toMatchObject({
      accessory: { media: { url: 'attachment://kitsune.png' } }
    })
    expect(payload.files?.[0].name).toBe('kitsune.png')
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
