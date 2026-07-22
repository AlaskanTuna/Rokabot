export type CaptureKind = 'reply' | 'send' | 'editReply' | 'followUp' | 'react' | 'typing'

export interface CaptureInput {
  kind: CaptureKind
  payload: unknown
  channelId?: string | null
}

export interface CaptureRecord extends CaptureInput {
  channelId: string | null
  ts: number
}

export class CaptureSink {
  private readonly records: CaptureRecord[] = []

  constructor(private readonly now: () => number = Date.now) {}

  record({ kind, payload, channelId }: CaptureInput): CaptureRecord {
    const captured = { kind, payload, channelId: channelId ?? null, ts: this.now() }
    this.records.push(captured)
    return captured
  }

  all(): readonly CaptureRecord[] {
    return [...this.records]
  }

  reset(): void {
    this.records.length = 0
  }
}

export function createCaptureSink(now?: () => number): CaptureSink {
  return new CaptureSink(now)
}
