import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import '../env.js'
import type { ExtractionOutput } from '../../../src/agent/memory/extractionSchema.js'
import type { EpisodeLine } from '../../../src/storage/extractionQueue.js'
import { loadSessionHistorySnapshot, replayEpisodes } from '../memoryEpisodeReplay.js'
import type { MemoryEpisodeReplayLine } from '../memoryEpisodeReplay.js'

const fixturePath = join(process.cwd(), 'tests/harness/memory-replay/episode-replay.jsonl')
const snapshotPath = join(process.cwd(), 'data/.memory-episode-replay.test.db')

function line(content: string, timestamp: number, messageId: string): MemoryEpisodeReplayLine {
  return {
    guildId: 'guild-a',
    channelId: 'channel-a',
    messageId,
    userId: 'u-1',
    displayName: 'Mio',
    content,
    timestamp,
    isBot: false
  }
}

function output(ops: ExtractionOutput['ops']): ExtractionOutput {
  return { ops, summary: 'A member shared durable interests.' }
}

afterEach(() => {
  rmSync(snapshotPath, { force: true })
})

describe('memory episode replay', () => {
  it('replays deterministic tracker boundaries with duplicate, new, bot, and guild-isolated lines', async () => {
    const contents = readFileSync(fixturePath, 'utf8')
    const lines = contents
      .trim()
      .split(/\r?\n/)
      .map((value) => JSON.parse(value) as MemoryEpisodeReplayLine)
    const admissions = new Map<string, boolean>([
      ['guild-a', true],
      ['guild-b', false]
    ])
    const extractedGuilds: string[] = []
    let verificationCount = 0
    const report = await replayEpisodes(lines, {
      admission: async ({ guildId }) => admissions.get(guildId) ?? true,
      extraction: async (context) => {
        extractedGuilds.push(context.guildId)
        if (context.episode.messages.some(({ content }) => content.includes('and manga'))) {
          return output([
            { op: 'add', subject: { kind: 'user', userId: 'u-1' }, predicate: 'likes', value: 'tea' },
            { op: 'add', subject: { kind: 'user', userId: 'u-1' }, predicate: 'favorite_anime', value: 'manga' }
          ])
        }
        return output([{ op: 'add', subject: { kind: 'user', userId: 'u-1' }, predicate: 'likes', value: 'tea' }])
      },
      verification: async () => {
        verificationCount++
        return {
          appliedOps: verificationCount === 1 ? 2 : 0,
          droppedOps: 0,
          duplicateOps: verificationCount === 1 ? 0 : 1
        }
      }
    })

    expect(report.admittedEpisodes).toBe(2)
    expect(report.droppedEpisodes).toBe(1)
    expect(report.opsPerEpisode).toEqual([2, 1, 0])
    expect(report.duplicatesAvoided).toBe(1)
    expect(report.networkCalls).toBe(0)
    expect(extractedGuilds).toEqual(['guild-a', 'guild-a'])
    expect(report.gapDistribution).toMatchObject({
      sampleCount: 3,
      zeroGapTies: 0,
      positiveCount: 3,
      p50Ms: 1_000,
      p75Ms: 99_000,
      p90Ms: 157_800,
      p99Ms: 193_080
    })
    expect(report.gapDistribution.p95Ms).toBeCloseTo(177_400)
  })

  it('reports zero-gap ties and linear-interpolated positive gap percentiles', async () => {
    const report = await replayEpisodes(
      [line('one', 1_000, 'm-1'), line('two', 1_000, 'm-2'), line('three', 1_100, 'm-3')],
      {
        admission: async () => false,
        extraction: async () => output([]),
        verification: async () => ({ appliedOps: 0, droppedOps: 0, duplicateOps: 0 })
      }
    )

    expect(report.gapDistribution).toEqual({
      sampleCount: 2,
      zeroGapTies: 1,
      positiveCount: 1,
      p50Ms: 100,
      p75Ms: 100,
      p90Ms: 100,
      p95Ms: 100,
      p99Ms: 100
    })
    expect(report.opsPerEpisode).toEqual([0])
  })

  it('maps only uniquely attributed session history and reports skipped rows', async () => {
    mkdirSync(join(process.cwd(), 'data'), { recursive: true })
    rmSync(snapshotPath, { force: true })
    const db = new Database(snapshotPath)
    db.exec(`
      CREATE TABLE session_history (
        channel_id TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT NOT NULL, content TEXT NOT NULL,
        timestamp INTEGER NOT NULL, user_id TEXT, username TEXT
      );
      CREATE TABLE response_events (guild_id TEXT NOT NULL, channel_id TEXT NOT NULL);
      INSERT INTO response_events VALUES ('guild-a', 'channel-a');
      INSERT INTO response_events VALUES ('guild-b', 'channel-b');
      INSERT INTO response_events VALUES ('guild-c', 'channel-b');
      INSERT INTO session_history VALUES ('channel-a', 'user', 'Mio', 'private text', 1, 'u-1', 'mio');
      INSERT INTO session_history VALUES ('channel-a', 'assistant', 'Roka', 'private reply', 2, NULL, NULL);
      INSERT INTO session_history VALUES ('channel-a', 'user', 'Unknown', 'missing identity', 3, NULL, NULL);
      INSERT INTO session_history VALUES ('channel-b', 'user', 'Mio', 'ambiguous', 4, 'u-1', 'mio');
      INSERT INTO session_history VALUES ('channel-c', 'user', 'Mio', 'unmapped', 5, 'u-1', 'mio');
    `)
    db.close()

    const report = loadSessionHistorySnapshot(snapshotPath)

    expect(report.lines).toEqual([
      expect.objectContaining({ guildId: 'guild-a', channelId: 'channel-a', userId: 'u-1', isBot: false }),
      expect.objectContaining({ guildId: 'guild-a', channelId: 'channel-a', userId: 'bot', isBot: true })
    ])
    expect(report.unmappedRows).toBe(2)
    expect(report.ambiguousRows).toBe(1)
    expect(report.lines.some(({ content }: EpisodeLine) => content.includes('private'))).toBe(true)
  })
})
