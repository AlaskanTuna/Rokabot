import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPubliclyRoutableHost, resolveImageUrl } from '../attachments.js'

function headResponse({ ok = true, contentType = 'image/png', url = 'https://cdn.test/a.png' } = {}) {
  return { ok, url, headers: { get: (name: string) => (name === 'content-type' ? contentType : null) } }
}

describe('isPubliclyRoutableHost', () => {
  // The Pi reaches these itself and lives on a Tailnet, so the guard is what stops a pasted link turning the
  // bot into a probe for the poster. 100.64.0.0/10 is the one that matters most here — it is Tailscale's.
  it.each([
    'localhost',
    'api.localhost',
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
    'fe80::1'
  ])('refuses %s', (host) => {
    expect(isPubliclyRoutableHost(host)).toBe(false)
  })

  // 172.15 and 172.32 sit just outside the private block, and 100.128 just outside CGNAT — a guard that
  // rejects these is over-broad and would refuse legitimate hosts.
  it.each(['cdn.discordapp.com', 'media.tenor.com', '8.8.8.8', '172.15.0.1', '172.32.0.1', '100.128.0.1'])(
    'allows %s',
    (host) => {
      expect(isPubliclyRoutableHost(host)).toBe(true)
    }
  )
})

describe('resolveImageUrl', () => {
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

  // The assertion that matters: refused *before* the request, so the bot never touches the tailnet at all.
  it('refuses a private host without making any request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await resolveImageUrl('http://100.64.0.1/admin')).toBeNull()
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

  // Validating only the typed hostname would guard nothing: roka.ts's GET follows redirects of its own, so a
  // public URL that bounces to the tailnet has to be caught on where it landed, not where it started.
  it('refuses a public URL that redirects onto a private host', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => headResponse({ url: 'http://10.0.0.5/secret.png' }))
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
