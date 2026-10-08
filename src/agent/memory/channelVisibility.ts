export type ChannelVisibility = 'public' | 'private'

export interface ChannelVisibilityResolver {
  visibility(channelId: string): ChannelVisibility
  parentOf(channelId: string): string | null
}

// Until the Discord client registers a resolver, nothing is known to be public, which errs toward privacy.
const UNKNOWN: ChannelVisibilityResolver = { visibility: () => 'private', parentOf: () => null }
let current: ChannelVisibilityResolver = UNKNOWN

export function registerChannelVisibility(resolver: ChannelVisibilityResolver): void {
  current = resolver
}

export function channelVisibility(): ChannelVisibilityResolver {
  return current
}

export function resetChannelVisibilityForTest(): void {
  current = UNKNOWN
}
