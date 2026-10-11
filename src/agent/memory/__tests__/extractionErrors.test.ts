import { describe, expect, it } from 'vitest'
import { ProviderError } from '../../llm/providerError.js'
import { JevUnavailableError, classifyExtractionError } from '../extractionErrors.js'

describe('classifyExtractionError', () => {
  it.each([429, 500, 502, 503, 504])('classifies HTTP %i errors as transient', (status) => {
    expect(classifyExtractionError(Object.assign(new Error('request failed'), { status }))).toBe('transient')
  })

  it.each(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'])('classifies %s causes as transient', (code) => {
    const cause = Object.assign(new Error('network failed'), { code })
    expect(classifyExtractionError(new TypeError('fetch failed', { cause }))).toBe('transient')
  })

  it('classifies a nested TypeSafe HTTP status as transient', () => {
    const cause = Object.assign(new Error('service unavailable'), { status: 503 })
    expect(classifyExtractionError(new Error('Jev request failed', { cause }))).toBe('transient')
  })

  it('classifies TypeSafe connection errors as transient', () => {
    expect(classifyExtractionError(Object.assign(new Error('connection failed'), { name: 'APIConnectionError' }))).toBe(
      'transient'
    )
  })

  it('classifies timeouts and aborts as transient unless shutdown caused them', () => {
    expect(classifyExtractionError(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))).toBe('transient')
    expect(classifyExtractionError(Object.assign(new Error('timed out'), { name: 'APITimeoutError' }))).toBe(
      'transient'
    )
    expect(classifyExtractionError(new DOMException('aborted', 'AbortError'))).toBe('transient')
    expect(classifyExtractionError(Object.assign(new Error('request cancelled'), { name: 'APIUserAbortError' }))).toBe(
      'transient'
    )
    expect(classifyExtractionError(new DOMException('aborted', 'AbortError'), { shuttingDown: true })).toBe('permanent')
    expect(
      classifyExtractionError(Object.assign(new Error('request cancelled'), { name: 'APIUserAbortError' }), {
        shuttingDown: true
      })
    ).toBe('permanent')
  })

  it('keeps abort-coded errors permanent when shutdown caused them', () => {
    const error = Object.assign(new Error('request aborted'), { code: 'UND_ERR_ABORTED' })
    expect(classifyExtractionError(error)).toBe('transient')
    expect(classifyExtractionError(error, { shuttingDown: true })).toBe('permanent')
  })

  it('classifies other errors as permanent', () => {
    expect(classifyExtractionError(new Error('schema mismatch'))).toBe('permanent')
  })

  it.each(['transient_http', 'quota_exhausted'] as const)(
    'classifies a %s provider failure as transient whatever its status',
    (kind) => {
      expect(
        classifyExtractionError(new ProviderError({ provider: 'anthropic', kind, message: 'busy', status: 529 }))
      ).toBe('transient')
    }
  )

  it.each(['billing_exhausted', 'refusal'] as const)('classifies a %s provider failure as permanent', (kind) => {
    expect(
      classifyExtractionError(new ProviderError({ provider: 'anthropic', kind, message: 'no', status: 429 }))
    ).toBe('permanent')
  })

  it('classifies a network provider failure as transient unless shutdown caused it', () => {
    const error = new ProviderError({ provider: 'anthropic', kind: 'network', message: 'Anthropic Request timed out.' })
    expect(classifyExtractionError(error)).toBe('transient')
    expect(classifyExtractionError(error, { shuttingDown: true })).toBe('permanent')
  })

  it('finds a provider failure through the cause chain', () => {
    const cause = new ProviderError({ provider: 'anthropic', kind: 'transient_http', message: 'busy', status: 529 })
    expect(classifyExtractionError(new Error('extraction failed', { cause }))).toBe('transient')
  })

  it('still classifies a structured-output failure as permanent', async () => {
    const { StructuredOutputError } = await import('../../llm/generateObject.js')
    expect(classifyExtractionError(new StructuredOutputError('invalid_object', 'anthropic'))).toBe('permanent')
  })
})

it('classifies an episode Jev could not judge as unjudged', () => {
  expect(classifyExtractionError(new JevUnavailableError())).toBe('unjudged')
})
