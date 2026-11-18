import { beforeEach, describe, expect, it, vi } from 'vitest'

const gateMocks = vi.hoisted(() => ({ generateObject: vi.fn() }))

vi.mock('../../llm/generateObject.js', () => ({ generateObject: gateMocks.generateObject }))

import { fakeFetch } from '../../../../tests/harness/fakeFetch.js'
import { GATE_PROMPT, judgeImageLookup } from './lookupGate.js'

// A 1x1 PNG: sharp reads it and the gate downscales it to JPEG.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function imageFetch() {
  return fakeFetch(
    () =>
      new Response(Buffer.from(TINY_PNG_BASE64, 'base64'), {
        status: 200,
        headers: { 'content-type': 'image/png' }
      })
  ).fetchImpl
}

beforeEach(() => {
  gateMocks.generateObject.mockReset()
})

describe('judgeImageLookup', () => {
  it('returns the model verdict and sends the speaker text with downscaled images inline', async () => {
    gateMocks.generateObject.mockResolvedValue({
      value: { asks: true, target: 2, subject: 'figure_or_merch' },
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      usage: {
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        workload: 'imageGate',
        inputTokens: 1,
        outputTokens: 1
      }
    })
    const result = await judgeImageLookup('who is the 2nd one', [{ url: 'https://cdn.example/a.png' }], {
      fetchImpl: imageFetch()
    })
    expect(result).toEqual({ asks: true, target: 2, subject: 'figure_or_merch' })
    const call = gateMocks.generateObject.mock.calls[0][0]
    expect(call.workload).toBe('imageGate')
    expect(call.maxOutputTokens).toBe(200)
    expect(call.prompt).toContain(GATE_PROMPT)
    expect(call.prompt).toContain('who is the 2nd one')
    expect(call.images).toHaveLength(1)
    expect(call.images[0].mimeType).toBe('image/jpeg')
    expect(call.images[0].data).toBeInstanceOf(Buffer)
  })

  it('returns null when the model output is invalid', async () => {
    gateMocks.generateObject.mockRejectedValue(new Error('invalid_object'))
    const result = await judgeImageLookup('who is this', [{ url: 'https://cdn.example/a.png' }], {
      fetchImpl: imageFetch()
    })
    expect(result).toBeNull()
  })

  it('returns null when the model call errors', async () => {
    gateMocks.generateObject.mockRejectedValue(new Error('overloaded'))
    const result = await judgeImageLookup('who is this', [{ url: 'https://cdn.example/a.png' }], {
      fetchImpl: imageFetch()
    })
    expect(result).toBeNull()
  })

  it('returns null on timeout instead of hanging the turn', async () => {
    gateMocks.generateObject.mockImplementation(() => new Promise(() => {}))
    const result = await judgeImageLookup('who is this', [{ url: 'https://cdn.example/a.png' }], {
      fetchImpl: imageFetch(),
      timeoutMs: 50
    })
    expect(result).toBeNull()
  })

  it('returns null without calling the model when no image downloads', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('down', { status: 500 }))
    const result = await judgeImageLookup('who is this', [{ url: 'https://cdn.example/a.png' }], { fetchImpl })
    expect(result).toBeNull()
    expect(gateMocks.generateObject).not.toHaveBeenCalled()
  })
})
