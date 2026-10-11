import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

import { classifyGeminiFailure } from '../../geminiReliability.js'
import { ErrorRecoveryPlugin } from '../../reliability.js'
import { ProviderError } from '../providerError.js'

describe('ProviderError', () => {
  it('carries the provider, kind, status, retry hint and cause', () => {
    const cause = new Error('upstream')
    const error = new ProviderError({
      provider: 'anthropic',
      kind: 'transient_http',
      message: 'Anthropic 529',
      status: 529,
      retryAfterMs: 2000,
      cause
    })

    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      name: 'ProviderError',
      provider: 'anthropic',
      kind: 'transient_http',
      message: 'Anthropic 529',
      status: 529,
      retryAfterMs: 2000,
      cause
    })
  })

  it('leaves cause undefined when none was given', () => {
    const error = new ProviderError({ provider: 'anthropic', kind: 'refusal', message: 'Anthropic refused' })

    expect(error.cause).toBeUndefined()
  })
})

describe('classifyGeminiFailure with provider errors', () => {
  it.each([
    ['billing_exhausted', { retryable: false, deflect: true }],
    ['refusal', { retryable: false, deflect: true }],
    ['malformed_tool_args', { retryable: true, deflect: false }],
    ['context_length', { retryable: false, deflect: true }],
    ['transient_http', { retryable: true, deflect: false }]
  ] as const)('returns the own %s kind of a ProviderError unchanged', (kind, flags) => {
    // The message alone would read as terminal, which proves the carried kind wins.
    const error = new ProviderError({ provider: 'anthropic', kind, message: 'Anthropic 400 INVALID_ARGUMENT' })

    expect(classifyGeminiFailure(error)).toEqual({ kind, ...flags })
  })

  it('reads the kind the error plugin carried on a ProviderError turn outcome', () => {
    const outcome = {
      errorCode: 'ProviderError',
      errorMessage: 'Anthropic 400 INVALID_ARGUMENT',
      customMetadata: { reliabilityKind: 'refusal' },
      hasText: false,
      hasFunctionCall: false
    }

    expect(classifyGeminiFailure(outcome).kind).toBe('refusal')
  })

  it('ignores a carried kind on an outcome that did not come from a ProviderError', () => {
    const outcome = {
      errorCode: 'ApiError',
      errorMessage: '503 UNAVAILABLE',
      customMetadata: { reliabilityKind: 'refusal' },
      hasText: false,
      hasFunctionCall: false
    }

    expect(classifyGeminiFailure(outcome).kind).toBe('transient_http')
  })

  it('keeps a MALFORMED_FUNCTION_CALL response classified as empty_text, as today', () => {
    const outcome = {
      errorCode: 'MALFORMED_FUNCTION_CALL',
      errorMessage: 'ModelScope returned malformed tool arguments',
      finishReason: 'MALFORMED_FUNCTION_CALL',
      hasText: false,
      hasFunctionCall: false
    }

    expect(classifyGeminiFailure(outcome).kind).toBe('empty_text')
  })

  it('lets the error plugin hand a ProviderError kind to the ladder', async () => {
    const response = await new ErrorRecoveryPlugin('error-recovery').onModelErrorCallback({
      callbackContext: {},
      llmRequest: {},
      error: new ProviderError({ provider: 'anthropic', kind: 'billing_exhausted', message: 'Anthropic 402' })
    })

    expect(response).toMatchObject({
      errorCode: 'ProviderError',
      customMetadata: { reliabilityKind: 'billing_exhausted' }
    })
    expect(classifyGeminiFailure({ ...response, hasText: false, hasFunctionCall: false }).kind).toBe(
      'billing_exhausted'
    )
  })
})
