import { ChannelType, type Client, PermissionFlagsBits } from 'discord.js'
import { describe, expect, it } from 'vitest'

import { createChannelVisibilityResolver } from '../channelVisibility.js'

const everyoneRole = { id: 'guild-1' }

function fakeChannel(
  id: string,
  options: { type?: ChannelType; viewable?: boolean; nsfw?: boolean; parentId?: string | null } = {}
) {
  const type = options.type ?? ChannelType.GuildText
  return {
    id,
    type,
    nsfw: options.nsfw ?? false,
    parentId: options.parentId ?? null,
    guild: { roles: { everyone: everyoneRole } },
    isThread: () => type === ChannelType.PublicThread || type === ChannelType.PrivateThread,
    permissionsFor: (role: unknown) => ({
      has: (flag: bigint) =>
        role === everyoneRole && flag === PermissionFlagsBits.ViewChannel && options.viewable !== false
    })
  }
}

function resolverFor(channels: ReturnType<typeof fakeChannel>[]) {
  const cache = new Map(channels.map((channel) => [channel.id, channel]))
  return createChannelVisibilityResolver({ channels: { cache } } as unknown as Client)
}

describe('createChannelVisibilityResolver', () => {
  it('reports a text channel as public only when @everyone can view it', () => {
    const resolver = resolverFor([fakeChannel('open'), fakeChannel('staff', { viewable: false })])
    expect(resolver.visibility('open')).toBe('public')
    expect(resolver.visibility('staff')).toBe('private')
  })

  it('reports an NSFW channel as private even when @everyone can view it', () => {
    const resolver = resolverFor([fakeChannel('nsfw', { nsfw: true })])
    expect(resolver.visibility('nsfw')).toBe('private')
  })

  it('gives a public thread its parent visibility', () => {
    const resolver = resolverFor([
      fakeChannel('open'),
      fakeChannel('staff', { viewable: false }),
      fakeChannel('open-thread', { type: ChannelType.PublicThread, parentId: 'open' }),
      fakeChannel('staff-thread', { type: ChannelType.PublicThread, parentId: 'staff' })
    ])
    expect(resolver.visibility('open-thread')).toBe('public')
    expect(resolver.visibility('staff-thread')).toBe('private')
  })

  it('reports a private thread as private whatever its parent', () => {
    const resolver = resolverFor([
      fakeChannel('open'),
      fakeChannel('private-thread', { type: ChannelType.PrivateThread, parentId: 'open' })
    ])
    expect(resolver.visibility('private-thread')).toBe('private')
  })

  it('reports an uncached channel as private', () => {
    expect(resolverFor([]).visibility('missing')).toBe('private')
  })

  it('returns the parent of a thread and null for anything else', () => {
    const resolver = resolverFor([
      fakeChannel('open'),
      fakeChannel('open-thread', { type: ChannelType.PublicThread, parentId: 'open' })
    ])
    expect(resolver.parentOf('open-thread')).toBe('open')
    expect(resolver.parentOf('open')).toBeNull()
    expect(resolver.parentOf('missing')).toBeNull()
  })
})
