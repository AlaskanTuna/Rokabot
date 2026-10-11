import { estimateTokens } from '../../utils/tokens.js'
import type { ProviderId } from './profiles.js'
import { ProviderError } from './providerError.js'
import type { CallUsage, Workload } from './usage.js'

export interface CallReservation {
  release(usage?: CallUsage): void
}

export interface BudgetDenial {
  denied: 'rpm' | 'rpd' | 'tpm' | 'monthly'
}

interface CallInput {
  provider: ProviderId
  model: string
  workload: Workload
  estTokens: number
}

/** 1A stub that always grants; 1D replaces it with per-call RPM, TPM and monthly-spend reservations. */
export function reserveCall(_input: CallInput): CallReservation | BudgetDenial {
  return { release: () => {} }
}

/** Every adapter awaits this before each provider request; 1D gives it a body that can wait for a window to open. */
export async function startCall(input: CallInput & { signal?: AbortSignal }): Promise<CallReservation> {
  return grantOrThrow(input.provider, reserveCall(input))
}

/** Adapters call this when they classify a provider's own billing error as `billing_exhausted`; 1D gives it a body. */
export function markBillingExhausted(_provider: ProviderId): void {}

function msUntilNextUtcMidnight(): number {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()
}

export function grantOrThrow(provider: ProviderId, reservation: CallReservation | BudgetDenial): CallReservation {
  if (!('denied' in reservation)) return reservation
  const message = `${provider} call denied by the local ${reservation.denied} budget`
  if (reservation.denied === 'monthly') throw new ProviderError({ provider, kind: 'billing_exhausted', message })
  throw new ProviderError({
    provider,
    kind: 'quota_exhausted',
    message,
    retryAfterMs: reservation.denied === 'rpd' ? msUntilNextUtcMidnight() : 60_000
  })
}

/** Inline media is left out: its base64 length says nothing about what an image or PDF costs in tokens. */
export function requestTokenEstimate(value: unknown): number {
  return estimateTokens(JSON.stringify(value, (key, child) => (key === 'data' ? undefined : child)) ?? '')
}
