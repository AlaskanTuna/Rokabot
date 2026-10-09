import { beforeEach, expect, it, vi } from 'vitest'

const recordMemoryEvent = vi.hoisted(() => vi.fn())
vi.mock('../../../storage/metricsStore.js', () => ({ recordMemoryEvent }))
vi.mock('../../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    gemini: { extractionModel: 'gemini-x' },
    memory: { embeddingModel: 'embed-x' },
    jev: { model: 'jev-x' }
  }
}))

import { finishRunTrace, noteError, noteSummary, startRunTrace } from '../extractionRun.js'

const job = {
  id: 7,
  guildId: 'g',
  channelId: 'c',
  attempts: 0,
  episode: {
    startedAt: 0,
    endedAt: 1,
    context: [],
    messages: [
      { messageId: 'm1', userId: 'u1', displayName: 'Alice', content: 'I am a nurse', timestamp: 1, isBot: false },
      { messageId: 'm2', userId: 'b', displayName: 'Roka', content: 'nice', timestamp: 2, isBot: true }
    ]
  }
} as never

beforeEach(() => {
  recordMemoryEvent.mockReset()
})

it('writes one text-free extraction_run row', () => {
  const trace = startRunTrace(job, 1)
  trace.stage = 'applied'
  trace.outcome = 'written'
  noteSummary(trace, 'No new durable facts were shared.', true)
  finishRunTrace(trace)

  const row = recordMemoryEvent.mock.calls[0][0]
  expect(row).toMatchObject({ kind: 'extraction_run', guildId: 'g', channelId: 'c' })
  const detail = JSON.parse(row.detail)
  expect(detail).toMatchObject({
    jobId: 7,
    attempt: 1,
    firstMessageId: 'm1',
    lastMessageId: 'm2',
    messageCount: 2,
    humanCount: 1,
    stage: 'applied',
    outcome: 'written',
    summary: { kept: true, boilerplate: true }
  })
  expect(row.detail).not.toContain('nurse')
  expect(row.detail).not.toContain('Alice')
})

it('starts every op counter at zero, including past, reword and retracted', () => {
  expect(startRunTrace(job, 1).ops).toEqual({
    proposed: 0,
    applied: 0,
    duplicate: 0,
    staged: 0,
    dropped: 0,
    changed: 0,
    past: 0,
    reword: 0,
    retracted: 0
  })
})

it('keeps the error class and HTTP status but never the error message', () => {
  const trace = startRunTrace(job, 2)
  trace.stage = 'extraction'
  noteError(trace, 'transient', Object.assign(new Error('user said I am a nurse'), { status: 503 }))
  finishRunTrace(trace)

  const detail = JSON.parse(recordMemoryEvent.mock.calls[0][0].detail)
  expect(detail).toMatchObject({ outcome: 'error', errorClass: 'transient', errorStatus: 503 })
  expect(JSON.stringify(detail)).not.toContain('nurse')
})

it('leaves an unjudged outcome in place and records the unjudged class', () => {
  const trace = startRunTrace(job, 1)
  trace.outcome = 'jev_unavailable'
  noteError(trace, 'unjudged', new Error('x'))
  finishRunTrace(trace)

  const detail = JSON.parse(recordMemoryEvent.mock.calls[0][0].detail)
  expect(detail).toMatchObject({ outcome: 'jev_unavailable', errorClass: 'unjudged' })
})

it('never throws when recording fails', () => {
  recordMemoryEvent.mockImplementation(() => {
    throw new Error('db down')
  })
  expect(() => finishRunTrace(startRunTrace(job, 1))).not.toThrow()
})
