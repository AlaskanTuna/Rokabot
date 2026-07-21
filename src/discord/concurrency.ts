/** Per-channel concurrency guard preventing simultaneous requests */
// Concurrent same-channel messages are dropped with a busy reply, never queued or retry-cancelled.

const activeRequests = new Set<string>()

export function isChannelBusy(channelId: string): boolean {
  return activeRequests.has(channelId)
}

export function markBusy(channelId: string): void {
  activeRequests.add(channelId)
}

export function markFree(channelId: string): void {
  activeRequests.delete(channelId)
}
