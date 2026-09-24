import { expect } from 'vitest'

export const turnEntryRejections = [
  'busy-channel',
  'advisory-rate-limit',
  'call-reservation',
  'attachment-token',
  'byte-budget',
  'non-bot-reply'
] as const

export type TurnEntryRejection = (typeof turnEntryRejections)[number]

export async function assertTurnEntryRejections(
  run: (rejection: TurnEntryRejection) => Promise<{
    start: unknown
    cancel: unknown
    generate: unknown
  }>,
  includeNonBotReply = true
): Promise<void> {
  for (const rejection of turnEntryRejections) {
    if (rejection === 'non-bot-reply' && !includeNonBotReply) continue

    const { start, cancel, generate } = await run(rejection)
    expect(generate).not.toHaveBeenCalled()

    if (rejection === 'non-bot-reply') {
      expect(start).not.toHaveBeenCalled()
      expect(cancel).not.toHaveBeenCalled()
    } else {
      expect(start).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledOnce()
    }
  }
}
