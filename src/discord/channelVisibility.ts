import { ChannelType, type Client, PermissionFlagsBits } from 'discord.js'
import type { ChannelVisibility, ChannelVisibilityResolver } from '../agent/memory/channelVisibility.js'

export function createChannelVisibilityResolver(client: Client): ChannelVisibilityResolver {
  const visibility = (channelId: string): ChannelVisibility => {
    const channel = client.channels.cache.get(channelId)
    if (!channel || !('guild' in channel)) return 'private'
    if (channel.isThread()) {
      if (channel.type === ChannelType.PrivateThread || !channel.parentId) return 'private'
      return visibility(channel.parentId)
    }
    if ('nsfw' in channel && channel.nsfw) return 'private'
    const everyone = channel.guild.roles.everyone
    return channel.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel) ? 'public' : 'private'
  }
  const parentOf = (channelId: string): string | null => {
    const channel = client.channels.cache.get(channelId)
    return channel?.isThread() ? channel.parentId : null
  }
  return { visibility, parentOf }
}
