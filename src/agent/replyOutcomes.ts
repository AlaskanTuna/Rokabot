import { AsyncLocalStorage } from 'node:async_hooks'

export type ReplyOutcome = 'none' | 'found' | 'failed'

const outcomeForTurn = new AsyncLocalStorage<{ outcome: ReplyOutcome }>()

/** Same async-context propagation searchCitations.ts relies on to reach inside ADK's tool execution. */
export async function withReplyOutcomes<T>(run: () => Promise<T>): Promise<[T, ReplyOutcome]> {
  const sink: { outcome: ReplyOutcome } = { outcome: 'none' }
  const result = await outcomeForTurn.run(sink, run)
  return [result, sink.outcome]
}

export function recordReplyOutcome(outcome: 'found' | 'failed'): void {
  const sink = outcomeForTurn.getStore()
  if (!sink || sink.outcome === 'found') return
  sink.outcome = outcome
}
