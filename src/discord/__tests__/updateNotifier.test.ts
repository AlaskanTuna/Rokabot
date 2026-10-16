import type { Client } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cfg = vi.hoisted(() => ({ updates: { notify: true, repo: 'AlaskanTuna/Rokabot', checkIntervalHours: 24 } }))
const store = vi.hoisted(() => ({ notified: new Set<string>(), failMark: false }))

vi.mock('../../config.js', () => ({ config: cfg }))
vi.mock('../../utils/logger.js', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../../storage/updateNoticeStore.js', () => ({
  wasUpdateNotified: (tag: string) => store.notified.has(tag),
  markUpdateNotified: (tag: string) => {
    if (store.failMark) throw new Error('database is locked')
    store.notified.add(tag)
  }
}))

import { checkForUpdate, isNewerVersion } from '../updateNotifier.js'

function release(status: number, body: unknown = {}): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

function clientWithOwner(owner: unknown): { client: Client; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async () => undefined)
  const resolved =
    owner === 'team' ? { members: new Map(), owner: { user: { send } } } : owner === 'user' ? { send } : null
  const client = { application: { fetch: vi.fn(async () => ({ owner: resolved })) } } as unknown as Client
  return { client, send }
}

const LATEST = { tag_name: 'v0.3.0', html_url: 'https://github.com/AlaskanTuna/Rokabot/releases/tag/v0.3.0' }

beforeEach(() => {
  store.notified.clear()
  store.failMark = false
  cfg.updates.notify = true
})

describe('isNewerVersion', () => {
  it.each([
    ['v0.3.0', '0.2.9', true],
    ['v0.3.0', '0.3.0', false],
    ['v0.2.0', '0.3.0', false],
    ['v1.0.0', '0.9.9', true],
    ['v0.3.0', '0.3.0-rc.1', true],
    ['v0.3.0-rc.2', '0.3.0-rc.10', false],
    ['release-1', '0.3.0', false],
    ['v0.3', '0.2.0', false]
  ])('%s newer than %s is %s', (latest, current, expected) => {
    expect(isNewerVersion(latest, current)).toBe(expected)
  })
})

describe('checkForUpdate', () => {
  it('DMs a user owner once about a newer release', async () => {
    const { client, send } = clientWithOwner('user')

    expect(await checkForUpdate(client, { fetcher: release(200, LATEST), currentVersion: '0.2.0' })).toBe('notified')
    expect(await checkForUpdate(client, { fetcher: release(200, LATEST), currentVersion: '0.2.0' })).toBe('current')

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toContain('v0.3.0')
    expect(send.mock.calls[0][0]).toContain(LATEST.html_url)
  })

  it("DMs a team's owner", async () => {
    const { client, send } = clientWithOwner('team')

    await checkForUpdate(client, { fetcher: release(200, LATEST), currentVersion: '0.2.0' })

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when the running version is current', async () => {
    const { client, send } = clientWithOwner('user')

    expect(await checkForUpdate(client, { fetcher: release(200, LATEST), currentVersion: '0.3.0' })).toBe('current')
    expect(send).not.toHaveBeenCalled()
  })

  it('does nothing when updates.notify is off', async () => {
    cfg.updates.notify = false
    const fetcher = release(200, LATEST)
    const { client, send } = clientWithOwner('user')

    expect(await checkForUpdate(client, { fetcher, currentVersion: '0.2.0' })).toBe('off')
    expect(fetcher).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    ['no releases yet (404)', release(404, { message: 'Not Found' }), 'current'],
    ['rate limited (403)', release(403, { message: 'API rate limit exceeded' }), 'failed'],
    ['a non-semver tag', release(200, { tag_name: 'release-1', html_url: 'https://example.com' }), 'current'],
    ['a malformed body', release(200, { name: 'oops' }), 'current']
  ])('never DMs or throws on %s', async (_label, fetcher, outcome) => {
    const { client, send } = clientWithOwner('user')

    expect(await checkForUpdate(client, { fetcher, currentVersion: '0.2.0' })).toBe(outcome)
    expect(send).not.toHaveBeenCalled()
  })

  it('treats a network error as a failed check', async () => {
    const { client, send } = clientWithOwner('user')
    const fetcher = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch

    expect(await checkForUpdate(client, { fetcher, currentVersion: '0.2.0' })).toBe('failed')
    expect(send).not.toHaveBeenCalled()
  })

  it('marks the tag announced even when the owner has DMs closed, so it does not retry daily', async () => {
    const { client, send } = clientWithOwner('user')
    send.mockRejectedValueOnce(new Error('Cannot send messages to this user'))

    expect(await checkForUpdate(client, { fetcher: release(200, LATEST), currentVersion: '0.2.0' })).toBe('notified')
    expect(await checkForUpdate(client, { fetcher: release(200, LATEST), currentVersion: '0.2.0' })).toBe('current')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('handles an application with no owner', async () => {
    const { client } = clientWithOwner(null)

    expect(await checkForUpdate(client, { fetcher: release(200, LATEST), currentVersion: '0.2.0' })).toBe('notified')
    expect(await checkForUpdate(client, { fetcher: release(200, LATEST), currentVersion: '0.2.0' })).toBe('current')
  })

  it('retries the next interval when the owner lookup fails, without marking the tag', async () => {
    const { client, send } = clientWithOwner('user')
    const fetchApplication = client.application?.fetch as ReturnType<typeof vi.fn>
    fetchApplication.mockRejectedValueOnce(new Error('Discord unavailable'))

    expect(await checkForUpdate(client, { fetcher: release(200, LATEST), currentVersion: '0.2.0' })).toBe('failed')
    expect(send).not.toHaveBeenCalled()

    expect(await checkForUpdate(client, { fetcher: release(200, LATEST), currentVersion: '0.2.0' })).toBe('notified')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('sends no DM when the store cannot record the tag, so a failing store never repeats DMs', async () => {
    const { client, send } = clientWithOwner('user')
    store.failMark = true

    await expect(checkForUpdate(client, { fetcher: release(200, LATEST), currentVersion: '0.2.0' })).rejects.toThrow(
      'database is locked'
    )
    expect(send).not.toHaveBeenCalled()
  })
})
