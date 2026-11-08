import { describe, expect, it } from 'vitest'
import { proxyResizeUrl } from '../imageProxy.js'

const upload = 'https://media.discordapp.net/attachments/1/2/IMG_7959.png?ex=6af1882f&is=6af036af&hm=2270874a'

describe('proxyResizeUrl', () => {
  it('asks the proxy for the vision size, keeping the shape', () => {
    const url = new URL(proxyResizeUrl(upload, 1179, 2556)!)

    expect(url.searchParams.get('width')).toBe('472')
    expect(url.searchParams.get('height')).toBe('1024')
  })

  it('keeps the signed query Discord needs to serve the file', () => {
    const url = new URL(proxyResizeUrl(upload, 1179, 2556)!)

    expect(url.searchParams.get('ex')).toBe('6af1882f')
    expect(url.searchParams.get('is')).toBe('6af036af')
    expect(url.searchParams.get('hm')).toBe('2270874a')
  })

  it('leaves a small image at its own size', () => {
    const url = new URL(proxyResizeUrl(upload, 400, 210)!)

    expect(url.searchParams.get('width')).toBe('400')
    expect(url.searchParams.get('height')).toBe('210')
  })

  it("resizes an embed image through Discord's external proxy", () => {
    const external = 'https://images-ext-1.discordapp.net/external/abc/https/pbs.twimg.com/media/x.jpg'

    expect(new URL(proxyResizeUrl(external, 1280, 720)!).searchParams.get('width')).toBe('1024')
  })

  it.each([
    ['a host Discord does not resize on', 'https://cdn.discordapp.com/attachments/1/2/a.png', 800, 600],
    ['a sender-chosen host', 'https://media.discordapp.net.evil.test/a.png', 800, 600],
    ['plain http', 'http://media.discordapp.net/attachments/1/2/a.png', 800, 600],
    ['no width', upload, null, 600],
    ['a zero height', upload, 800, 0]
  ])('gives nothing for %s', (_case, url, width, height) => {
    expect(proxyResizeUrl(url, width, height)).toBeUndefined()
  })

  it('gives nothing without a proxy URL', () => {
    expect(proxyResizeUrl(undefined, 800, 600)).toBeUndefined()
  })
})
