import { describe, expect, it } from 'vitest'
import type { MediaAttachment } from '../attachments.js'
import { registerTurnImages, turnImageUrl, withTurnImages } from '../turnImages.js'

function image(url: string): MediaAttachment {
  return { url, contentType: 'image/png' }
}

describe('turn image registry', () => {
  it('indexes only images, 1-based, in message order', () => {
    withTurnImages(() => {
      registerTurnImages([
        image('https://cdn.example/a.png'),
        { url: 'https://cdn.example/clip.mp4', contentType: 'video/mp4' },
        image('https://cdn.example/b.png')
      ])
      expect(turnImageUrl(1)).toBe('https://cdn.example/a.png')
      expect(turnImageUrl(2)).toBe('https://cdn.example/b.png')
      expect(turnImageUrl(3)).toBeUndefined()
    })
  })

  it('starts empty in every scope', () => {
    withTurnImages(() => {
      registerTurnImages([image('https://cdn.example/a.png')])
    })
    withTurnImages(() => {
      expect(turnImageUrl(1)).toBeUndefined()
    })
  })

  it('is a safe no-op with no turn scope open', () => {
    expect(turnImageUrl(1)).toBeUndefined()
    expect(() => registerTurnImages([image('https://cdn.example/a.png')])).not.toThrow()
  })
})
