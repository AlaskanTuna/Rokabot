import type { FailureKind } from '../geminiReliability.js'
import type { ProviderId } from './profiles.js'

export class ProviderError extends Error {
  readonly provider: ProviderId
  readonly kind: FailureKind
  readonly status?: number
  readonly retryAfterMs?: number
  // `declare` emits nothing: a plain field would be re-initialised to undefined after super() and wipe the cause.
  declare readonly cause?: unknown

  constructor(input: {
    provider: ProviderId
    kind: FailureKind
    message: string
    status?: number
    retryAfterMs?: number
    cause?: unknown
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause })
    // ErrorRecoveryPlugin turns error.name into the outcome's errorCode, which is how the ladder recognises it.
    this.name = 'ProviderError'
    this.provider = input.provider
    this.kind = input.kind
    this.status = input.status
    this.retryAfterMs = input.retryAfterMs
  }
}
