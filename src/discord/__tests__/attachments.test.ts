import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))

import {
  isPrivateAddress,
  isSupportedDocument,
  isSupportedImage,
  isSupportedMedia,
  resolveImageUrl,
  resolvesToPublicAddress
} from '../attachments.js'

function headResponse({ ok = true, contentType = 'image/png', url = 'https://cdn.test/a.png' } = {}) {
  return { ok, url, headers: { get: (name: string) => (name === 'content-type' ? contentType : null) } }
}

const PUBLIC_ANSWER = [{ address: '93.184.216.34', family: 4 }]

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '192.168.1.1',
    '172.16.0.1',
    '172.31.255.254',
    '169.254.169.254',
    '100.64.0.1',
    '100.127.255.255',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1' // an IPv4-mapped v6 address is the same loopback wearing a different spelling
  ])('recognises %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  // Just outside each block. A check that rejects these is over-broad and refuses legitimate hosts.
  it.each(['93.184.216.34', '8.8.8.8', '172.15.0.1', '172.32.0.1', '100.128.0.1', '2606:4700::1111'])(
    'treats %s as public',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false)
    }
  )
})

describe('resolvesToPublicAddress', () => {
  beforeEach(() => {
    mocks.lookup.mockReset()
    mocks.lookup.mockResolvedValue(PUBLIC_ANSWER)
  })

  // The whole point of the rewrite. A hostname is not an address, and nothing about the text of
  // `localtest.me` says it answers ::1 — only resolving it does.
  it('refuses a hostname that resolves into a private range', async () => {
    mocks.lookup.mockResolvedValue([{ address: '100.64.0.1', family: 4 }])

    expect(await resolvesToPublicAddress('roka-probe.example')).toBe(false)
  })

  it('refuses a hostname where only one of several answers is private', async () => {
    mocks.lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 }
    ])

    expect(await resolvesToPublicAddress('split.example')).toBe(false)
  })

  it('accepts a hostname whose every answer is public', async () => {
    expect(await resolvesToPublicAddress('cdn.discordapp.com')).toBe(true)
  })

  it('fails closed when the name does not resolve', async () => {
    mocks.lookup.mockRejectedValue(new Error('ENOTFOUND'))

    expect(await resolvesToPublicAddress('nope.example')).toBe(false)
  })

  it('fails closed when a name resolves to nothing at all', async () => {
    mocks.lookup.mockResolvedValue([])

    expect(await resolvesToPublicAddress('empty.example')).toBe(false)
  })

  // localhost need not appear in DNS, so it is refused by name rather than by resolution.
  it.each(['localhost', 'api.localhost'])('refuses %s without resolving it', async (host) => {
    expect(await resolvesToPublicAddress(host)).toBe(false)
    expect(mocks.lookup).not.toHaveBeenCalled()
  })

  it.each(['10.0.0.5', '[::1]', '100.64.0.1'])('refuses the private literal %s without resolving it', async (host) => {
    expect(await resolvesToPublicAddress(host)).toBe(false)
    expect(mocks.lookup).not.toHaveBeenCalled()
  })

  it('accepts a public literal without resolving it', async () => {
    expect(await resolvesToPublicAddress('8.8.8.8')).toBe(true)
    expect(mocks.lookup).not.toHaveBeenCalled()
  })
})

describe('resolveImageUrl', () => {
  beforeEach(() => {
    mocks.lookup.mockReset()
    mocks.lookup.mockResolvedValue(PUBLIC_ANSWER)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('refuses a protocol that is not http or https', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await resolveImageUrl('file:///etc/passwd')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses something that is not a URL at all', async () => {
    vi.stubGlobal('fetch', vi.fn())

    expect(await resolveImageUrl('what is in this picture?')).toBeNull()
  })

  it('refuses a private literal without making any request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await resolveImageUrl('http://100.64.0.1/admin')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // The hole this PR was rejected for. A perfectly ordinary-looking hostname, one static DNS record, no
  // redirect and no rebinding — the request must not happen at all.
  it('refuses an ordinary hostname that resolves onto the tailnet, without making any request', async () => {
    mocks.lookup.mockResolvedValue([{ address: '100.64.0.1', family: 4 }])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await resolveImageUrl('https://roka-probe.example/x.png')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a page rather than an image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => headResponse({ contentType: 'text/html; charset=utf-8' }))
    )

    expect(await resolveImageUrl('https://example.test/article')).toBeNull()
  })

  it('refuses a URL the server will not serve', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => headResponse({ ok: false }))
    )

    expect(await resolveImageUrl('https://example.test/gone.png')).toBeNull()
  })

  it('refuses when the request itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ENOTFOUND')
      })
    )

    expect(await resolveImageUrl('https://nope.test/a.png')).toBeNull()
  })

  it('accepts a public URL serving a supported image type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => headResponse({ contentType: 'image/webp' }))
    )

    expect(await resolveImageUrl('https://cdn.test/a.png')).toEqual({
      url: 'https://cdn.test/a.png',
      contentType: 'image/webp'
    })
  })

  it('refuses a public URL that redirects onto a private literal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => headResponse({ url: 'http://10.0.0.5/secret.png' }))
    )

    expect(await resolveImageUrl('https://public.test/redirect')).toBeNull()
  })

  // The redirect target gets the same resolution treatment, not just the literal check.
  it('refuses a redirect onto a hostname that resolves privately', async () => {
    mocks.lookup.mockImplementation(async (host: string) =>
      host === 'public.test' ? PUBLIC_ANSWER : [{ address: '169.254.169.254', family: 4 }]
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => headResponse({ url: 'http://metadata.example/latest' }))
    )

    expect(await resolveImageUrl('https://public.test/redirect')).toBeNull()
  })

  it('hands on the URL it landed on rather than the one typed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => headResponse({ url: 'https://cdn.test/final.png' }))
    )

    expect(await resolveImageUrl('https://public.test/shortlink')).toEqual({
      url: 'https://cdn.test/final.png',
      contentType: 'image/png'
    })
  })
})

describe('document policy', () => {
  it('recognises a PDF as a document', () => {
    expect(isSupportedDocument({ contentType: 'application/pdf' })).toBe(true)
  })

  // A document is not an image: the image predicate still gates the vision-only paths, where a PDF handed to
  // sharp would be re-encoded into nonsense.
  it('does not count a PDF as an image', () => {
    expect(isSupportedImage({ contentType: 'application/pdf' })).toBe(false)
  })

  it.each(['text/plain', 'application/zip', 'video/mp4', 'application/msword'])('refuses %s', (contentType) => {
    expect(isSupportedDocument({ contentType })).toBe(false)
  })

  it.each(['image/png', 'image/webp', 'application/pdf'])('accepts %s as media she can read', (contentType) => {
    expect(isSupportedMedia({ contentType })).toBe(true)
  })

  it.each(['application/zip', 'text/plain', null])('refuses %s as media', (contentType) => {
    expect(isSupportedMedia({ contentType })).toBe(false)
  })
})
