import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EpisodeLine, ExtractionEpisode } from '../../../storage/extractionQueue.js'

const mocks = vi.hoisted(() => ({
  client: null as { systemOne: ReturnType<typeof vi.fn> } | null,
  systemOne: vi.fn(),
  record: vi.fn(),
  warn: vi.fn(),
  config: { memory: { admitThreshold: 0.5 }, jev: { memoryTimeoutMs: 5_000 } }
}))

vi.mock('../../jev/client.js', () => ({ getJevClient: () => mocks.client }))
vi.mock('../../../storage/jevEventStore.js', () => ({ recordJevEvent: mocks.record }))
vi.mock('../../../utils/logger.js', () => ({ logger: { warn: mocks.warn } }))
vi.mock('../../../config.js', () => ({ config: mocks.config }))

import { admitEpisode } from '../admission.js'
import { precheckEpisode } from '../episodePrecheck.js'

function line(content: string, messageId = 'm-1'): EpisodeLine {
  return { messageId, userId: 'u-1', displayName: 'Mio', content, timestamp: 1_000, isBot: false }
}

function episodeWith(messages: EpisodeLine[], context: EpisodeLine[] = []): ExtractionEpisode {
  return { messages, context, startedAt: 1_000, endedAt: 1_000 }
}

function setJudgment(noul: number, inputTokens = 14) {
  mocks.systemOne.mockResolvedValueOnce({
    answers: { lasting_fact: { type: 'noul', noul } },
    usage: { input_tokens: inputTokens, output_tokens: 2 }
  })
}

describe('passive memory admission', () => {
  beforeEach(() => {
    mocks.client = { systemOne: mocks.systemOne }
    mocks.systemOne.mockReset()
    mocks.record.mockReset()
    mocks.warn.mockReset()
  })

  it('refuses a sensitive delta before Jev', async () => {
    const episode = episodeWith([line('My full name is Alice Example and my email is alice@example.com')])

    expect(precheckEpisode(episode)).toBe('sensitive')
    await expect(admitEpisode({ guildId: 'g-1', channelId: 'c-1', episode })).resolves.toEqual({
      admitted: false,
      reason: 'sensitive'
    })
    expect(mocks.systemOne).not.toHaveBeenCalled()
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it('refuses an all-trivial delta before Jev', async () => {
    const episode = episodeWith([line('hello'), line('😂', 'm-2'), line('https://example.com', 'm-3')])

    expect(precheckEpisode(episode)).toBe('trivial')
    await expect(admitEpisode({ guildId: 'g-1', channelId: 'c-1', episode })).resolves.toEqual({
      admitted: false,
      reason: 'trivial'
    })
    expect(mocks.systemOne).not.toHaveBeenCalled()
  })

  it('fails closed when Jev is unavailable and records no admission', async () => {
    mocks.client = null
    const episode = episodeWith([line('I like tea')])

    await expect(admitEpisode({ guildId: 'g-1', channelId: 'c-1', episode })).resolves.toEqual({
      admitted: false,
      reason: 'jev_unavailable'
    })
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it('sends every delta line without context to Jev', async () => {
    const delta = [line('I like tea'), line('I drink it every morning', 'm-2')]
    const context = [line('old context', 'ctx-1')]
    setJudgment(0.7)

    await admitEpisode({ guildId: 'g-1', channelId: 'c-1', episode: episodeWith(delta, context) })

    expect(mocks.systemOne).toHaveBeenCalledWith(
      {
        state: { messages: ['[u-1|Mio]: I like tea', '[u-1|Mio]: I drink it every morning'] },
        questions: { lasting_fact: expect.any(Object) }
      },
      { timeout: 5_000 }
    )
    expect(JSON.stringify(mocks.systemOne.mock.calls)).not.toContain('old context')
  })

  it('drops a lasting-fact score below the threshold and records numeric metadata only', async () => {
    const content = 'I like tea'
    setJudgment(0.49, 18)

    await expect(
      admitEpisode({ guildId: 'g-1', channelId: 'c-1', episode: episodeWith([line(content)]) })
    ).resolves.toEqual({
      admitted: false,
      reason: 'below_threshold'
    })

    expect(mocks.record).toHaveBeenCalledWith({
      kind: 'admission',
      guildId: 'g-1',
      channelId: 'c-1',
      question: 'lasting_fact',
      answer: '0.49',
      probability: 0.49,
      confidence: null,
      applied: false,
      latencyMs: expect.any(Number),
      inputTokens: 18
    })
    expect(JSON.stringify(mocks.record.mock.calls)).not.toContain(content)
  })

  it('admits a score equal to the configured threshold', async () => {
    setJudgment(0.5)

    await expect(
      admitEpisode({ guildId: 'g-1', channelId: 'c-1', episode: episodeWith([line('I like tea')]) })
    ).resolves.toEqual({ admitted: true, reason: 'admitted' })
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ applied: true, probability: 0.5 }))
  })

  it('fails closed when the Jev admission request times out', async () => {
    mocks.systemOne.mockRejectedValueOnce(new Error('timeout'))

    await expect(
      admitEpisode({ guildId: 'g-1', channelId: 'c-1', episode: episodeWith([line('I like tea')]) })
    ).resolves.toEqual({ admitted: false, reason: 'jev_unavailable' })
    expect(mocks.record).not.toHaveBeenCalled()
  })
})
