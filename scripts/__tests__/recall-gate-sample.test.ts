import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assertClaim,
  rejectClaimIdsForSpeaker,
  retireClaim,
  retractClaim
} from '../../src/agent/memory/memoryClaims.js'
import { config } from '../../src/config.js'
import { closeDb, getDb } from '../../src/storage/database.js'
import { recordMediaOccurrence, saveMediaDigest } from '../../src/storage/mediaDigestStore.js'
import { saveMemoryEpisode } from '../../src/storage/memoryEpisodeStore.js'
import { turnRef } from '../recall-calibration-sample.js'
import {
  type GatePair,
  formatSkips,
  loadGatePairs,
  loadGateSample,
  matchGateMessage,
  writeGateSample
} from '../recall-gate-sample.js'

const NOW = 1_800_000_000_000
const GUILD = 'guild-gate'
const CHANNEL = 'chan-gate'
const MESSAGE = 'what guitar did Aki want?'
const SECOND = 1000
// The configured timezone sets which local day a timestamp falls on, so each test pins it.
const settings = config as { timezone: string | undefined }

const hash = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16)

let directory = ''
let dbPath = ''
let previousDbPath: string | undefined
let previousTimezone: string | undefined

function okGate(
  message: string,
  shortlist: Array<[string, number, number | null]>,
  version: { rubric?: string; model?: string } = {}
): Record<string, unknown> {
  return { v: 1, status: 'ok', messageHash: hash(message), shortlist, ...version }
}

function shadowRow(
  id: number,
  createdAt: number,
  gate: unknown,
  channelId: string | null = CHANNEL,
  subjectUserId: string | null = 'alice'
): void {
  const detail = typeof gate === 'string' ? gate : JSON.stringify({ mode: 'shadow', fallback: false, gate })
  getDb()
    .prepare(
      `INSERT INTO memory_events (id, kind, guild_id, channel_id, subject_user_id, detail, created_at)
       VALUES (?, 'recall_shadow', ?, ?, ?, ?, ?)`
    )
    .run(id, GUILD, channelId, subjectUserId, detail, createdAt)
}

function history(
  content: string,
  timestamp: number,
  role: 'user' | 'assistant' = 'user',
  channelId = CHANNEL,
  displayName = role === 'user' ? 'Alice' : 'Roka',
  userId: string | null = null
): void {
  getDb()
    .prepare(
      'INSERT INTO session_history (channel_id, role, display_name, content, timestamp, user_id) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(channelId, role, displayName, content, timestamp, userId)
}

function guildClaim(
  predicate: string,
  value: string,
  extra: { period?: string; endReason?: string; eventDate?: string; expiresAt?: number } = {}
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO memory_claim (guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status,
         first_seen_at, last_seen_at, period, end_reason, event_date, expires_at)
       VALUES (?, 'guild', NULL, ?, ?, 'passive', ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      GUILD,
      predicate,
      value,
      extra.endReason ? 'rejected' : 'active',
      NOW - 1000,
      NOW,
      extra.period ?? 'current',
      extra.endReason ?? null,
      extra.eventDate ?? null,
      extra.expiresAt ?? null
    )
  return Number(result.lastInsertRowid)
}

function seedMemories(): { claimId: number; episodeId: number } {
  const claim = assertClaim({
    guildId: GUILD,
    subjectUserId: 'alice',
    predicate: 'likes',
    value: 'a Yamaha guitar',
    sourceKind: 'passive',
    channelId: CHANNEL,
    observedAt: NOW
  })
  saveMemoryEpisode({
    id: 7,
    guildId: GUILD,
    channelId: CHANNEL,
    startedAt: NOW - 60_000,
    endedAt: NOW - 30_000,
    summary: 'Aki and Alice compared guitar shops',
    embedding: null
  })
  return { claimId: claim.id, episodeId: 7 }
}

/** The copy is read back from disk, like a .backup of the production database. */
function finish(): string {
  closeDb()
  return dbPath
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'recall-gate-'))
  previousDbPath = process.env.ROKABOT_DB_PATH
  previousTimezone = config.timezone
  settings.timezone = 'Asia/Singapore'
  dbPath = join(directory, 'copy.db')
  process.env.ROKABOT_DB_PATH = dbPath
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = previousDbPath
  settings.timezone = previousTimezone
  rmSync(directory, { recursive: true, force: true })
})

describe('loading gate pairs', () => {
  it('joins exact turn text by hash, memory text by kind, and keeps probabilities out of the blind file', () => {
    const { claimId, episodeId } = seedMemories()
    const serverFactId = guildClaim('announcement', 'the club meets on Friday')
    const media = saveMediaDigest({
      guildId: GUILD,
      contentKey: 'video-1',
      kind: 'video',
      label: 'Guitar demo',
      summary: 'A short clip of someone strumming a Yamaha',
      digestJson: '{}'
    })
    history(MESSAGE, NOW + 4 * SECOND)
    shadowRow(
      1,
      NOW,
      okGate(MESSAGE, [
        ['fact', claimId, 0.91],
        ['conversation', episodeId, 0.12],
        ['server_fact', serverFactId, 0.33],
        ['media', media?.id ?? 0, 0.5]
      ])
    )
    shadowRow(2, NOW + 1, {
      v: 1,
      status: 'deadline',
      messageHash: hash(MESSAGE),
      shortlist: [['fact', claimId, null]]
    })

    const pairs = loadGatePairs(finish())

    expect(pairs.map(({ kind, probability }) => [kind, probability])).toEqual([
      ['fact', 0.91],
      ['conversation', 0.12],
      ['server_fact', 0.33],
      ['media', 0.5]
    ])
    expect(pairs[0]).toMatchObject({ message: MESSAGE, memoryText: 'likes: a Yamaha guitar' })
    expect(pairs[1].memoryText).toBe('Aki and Alice compared guitar shops')
    expect(pairs[2].memoryText).toBe('announcement: the club meets on Friday')
    expect(pairs[3].memoryText).toBe('Guitar demo: A short clip of someone strumming a Yamaha')
    expect(new Set(pairs.map(({ turnRef: ref }) => ref))).toEqual(new Set([turnRef(CHANNEL, NOW)]))
    expect(pairs[0].pairId).toBe(`${turnRef(CHANNEL, NOW)}-fact-${claimId}`)

    const outDir = join(directory, 'out')
    writeGateSample(pairs, outDir)
    const blind = readFileSync(join(outDir, 'pairs.jsonl'), 'utf8')
    const key = readFileSync(join(outDir, 'key.jsonl'), 'utf8')
    expect(blind).not.toMatch(/0\.91|0\.12|0\.33|probability/)
    expect(key).toContain('0.91')
    expect(
      blind
        .trim()
        .split('\n')
        .map((line) => Object.keys(JSON.parse(line)).sort())
    ).toEqual(
      Array(4).fill([
        'date',
        'kind',
        'memoryText',
        'message',
        'pairId',
        'period',
        'recentMessages',
        'speaker',
        'subject',
        'turnDate'
      ])
    )
    expect(
      key
        .trim()
        .split('\n')
        .map((line) => Object.keys(JSON.parse(line)).sort())
    ).toEqual(Array(4).fill(['kind', 'pairId', 'probability', 'turnRef']))
  })

  it('skips non-ok gate rows, unjudged candidates, other versions and unreadable details', () => {
    const { claimId, episodeId } = seedMemories()
    history(MESSAGE, NOW + SECOND)
    shadowRow(1, NOW, { v: 1, status: 'deadline', messageHash: hash(MESSAGE), shortlist: [['fact', claimId, 0.9]] })
    shadowRow(2, NOW, { v: 1, status: 'gate_error' })
    shadowRow(3, NOW, { v: 2, status: 'ok', messageHash: hash(MESSAGE), shortlist: [['fact', claimId, 0.9]] })
    shadowRow(4, NOW, 'not json')
    shadowRow(5, NOW, { mode: 'shadow' })
    shadowRow(
      6,
      NOW,
      okGate(MESSAGE, [
        ['fact', claimId, null],
        ['conversation', episodeId, 0.4]
      ])
    )
    shadowRow(
      7,
      NOW,
      okGate(MESSAGE, [
        ['fact', 999, 0.9],
        ['mystery', 1, 0.9]
      ])
    )
    shadowRow(8, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]]), null)

    const pairs = loadGatePairs(finish())

    expect(pairs.map(({ kind, probability }) => [kind, probability])).toEqual([['conversation', 0.4]])
  })

  it('skips turns whose text has aged out of the history', () => {
    const { claimId } = seedMemories()
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]]))
    history('some other message', NOW + SECOND)
    history(MESSAGE, NOW + SECOND, 'assistant')
    history(MESSAGE, NOW + SECOND, 'user', 'another-channel')

    expect(loadGatePairs(finish())).toEqual([])
  })

  it('matches a saved user row that appends media digests after a newline', () => {
    const { claimId } = seedMemories()
    const multiLine = 'look at this\nit is my new guitar'
    history(`${MESSAGE}\n[video: someone strumming]\n[image: a guitar shop]`, NOW + SECOND)
    history(`${multiLine}\n[image: a Yamaha]`, NOW + 2 * SECOND)
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]]))
    shadowRow(2, NOW + 2 * SECOND, okGate(multiLine, [['fact', claimId, 0.8]]))

    const pairs = loadGatePairs(finish())

    expect(pairs.map(({ message, probability }) => [message, probability])).toEqual([
      [MESSAGE, 0.9],
      [multiLine, 0.8]
    ])
  })

  it('searches from ten minutes before the row to five minutes after it, both ends included', () => {
    const { claimId } = seedMemories()
    const cases: Array<[string, number, boolean]> = [
      ['too early', -600 * SECOND - 1, false],
      ['earliest', -600 * SECOND, true],
      ['slow turn', 200 * SECOND, true],
      ['latest', 300 * SECOND, true],
      ['too late', 300 * SECOND + 1, false]
    ]
    cases.forEach(([message, offset], index) => {
      history(message, NOW + offset)
      shadowRow(index + 1, NOW, okGate(message, [['fact', claimId, 0.5]]))
    })

    const pairs = loadGatePairs(finish())

    expect(pairs.map(({ message }) => message)).toEqual(
      cases.filter(([, , matches]) => matches).map(([message]) => message)
    )
  })

  it('skips a turn that was only an image, with or without a digest', () => {
    const { claimId } = seedMemories()
    history('(shared an image)', NOW + SECOND)
    history('(shared an image)\n[image: a cat]', NOW + 400 * SECOND, 'user')
    shadowRow(1, NOW, okGate('(shared an image)', [['fact', claimId, 0.9]]))
    shadowRow(2, NOW + 400 * SECOND, okGate('(shared an image)', [['fact', claimId, 0.9]]))
    history('(shared an image) of my cat', NOW + 800 * SECOND)
    shadowRow(3, NOW + 800 * SECOND, okGate('(shared an image) of my cat', [['fact', claimId, 0.7]]))

    const pairs = loadGatePairs(finish())

    expect(pairs.map(({ message }) => message)).toEqual(['(shared an image) of my cat'])
  })

  it('skips a turn that only pinged the bot, which carries no text a judge could read', () => {
    const { claimId } = seedMemories()
    history('(pinged you without saying anything)', NOW + SECOND)
    shadowRow(1, NOW, okGate('(pinged you without saying anything)', [['fact', claimId, 0.9]]))
    history('(pinged you without saying anything) hi', NOW + 800 * SECOND)
    shadowRow(2, NOW + 800 * SECOND, okGate('(pinged you without saying anything) hi', [['fact', claimId, 0.7]]))

    expect(loadGatePairs(finish()).map(({ message }) => message)).toEqual(['(pinged you without saying anything) hi'])
  })

  it('does not write to the database copy', () => {
    const { claimId } = seedMemories()
    history(MESSAGE, NOW + SECOND)
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]]))
    const copy = finish()
    const before = createHash('sha256').update(readFileSync(copy)).digest('hex')

    loadGatePairs(copy)

    expect(createHash('sha256').update(readFileSync(copy)).digest('hex')).toBe(before)
  })
})

describe('the context Jev saw', () => {
  const day = (...parts: [number, number, number, number?, number?, number?]): number => Date.UTC(...parts)

  function pairsOf(): GatePair[] {
    return loadGatePairs(finish())
  }

  it('gives the speaker and up to three earlier lines of the channel, oldest first', () => {
    const { claimId } = seedMemories()
    history('too far back', NOW - 500 * SECOND, 'user', CHANNEL, 'Bob')
    history('earlier a', NOW - 400 * SECOND, 'user', CHANNEL, 'Bob')
    history('a reply', NOW - 300 * SECOND, 'assistant', CHANNEL, 'Old Bot Name')
    history('earlier b\nwith a second line', NOW - 200 * SECOND, 'user', CHANNEL, 'Carol')
    history('another channel', NOW - 100 * SECOND, 'user', 'another-channel', 'Dave')
    history(MESSAGE, NOW + 4 * SECOND, 'user', CHANNEL, 'Alice the Guitarist')
    history('same moment', NOW + 4 * SECOND, 'user', CHANNEL, 'Bob')
    history('afterwards', NOW + 10 * SECOND, 'user', CHANNEL, 'Bob')
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]]))

    const [pair] = pairsOf()

    expect(pair.speaker).toBe('Alice the Guitarist')
    expect(pair.recentMessages).toEqual([
      '[Bob]: earlier a',
      '[Roka]: a reply',
      '[Carol]: earlier b\nwith a second line'
    ])
  })

  it('shows only lines Jev could load: not older than the rehydration age before the shadow row, edge included', () => {
    const { claimId } = seedMemories()
    const age = config.session.maxRehydrationAge
    history('ancient', NOW - age - 60 * SECOND, 'user', CHANNEL, 'Bob')
    history('one millisecond too old', NOW - age - 1, 'user', CHANNEL, 'Bob')
    history('exactly at the edge', NOW - age, 'user', CHANNEL, 'Carol')
    history('well inside', NOW - 1000 * SECOND, 'user', CHANNEL, 'Bob')
    history(MESSAGE, NOW + SECOND)
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]]))

    expect(pairsOf()[0].recentMessages).toEqual(['[Carol]: exactly at the edge', '[Bob]: well inside'])
  })

  it('still keeps only the three newest lines inside the window, oldest first', () => {
    const { claimId } = seedMemories()
    for (const [index, name] of ['a', 'b', 'c', 'd'].entries()) {
      history(`line ${name}`, NOW - (400 - index * 100) * SECOND, 'user', CHANNEL, 'Bob')
    }
    history(MESSAGE, NOW + SECOND)
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]]))

    expect(pairsOf()[0].recentMessages).toEqual(['[Bob]: line b', '[Bob]: line c', '[Bob]: line d'])
  })

  it('applies no age bound when the rehydration age is zero, as loadHistory does', () => {
    const { claimId } = seedMemories()
    const previous = config.session.maxRehydrationAge
    ;(config.session as { maxRehydrationAge: number }).maxRehydrationAge = 0
    try {
      history('from last week', NOW - 7 * 24 * 3600 * 1000, 'user', CHANNEL, 'Bob')
      history(MESSAGE, NOW + SECOND)
      shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]]))

      expect(pairsOf()[0].recentMessages).toEqual(['[Bob]: from last week'])
    } finally {
      ;(config.session as { maxRehydrationAge: number }).maxRehydrationAge = previous
    }
  })

  it('gives fewer lines when the channel has fewer, and none when it has none', () => {
    const { claimId } = seedMemories()
    history('only one before', NOW - 100 * SECOND, 'user', CHANNEL, 'Bob')
    history(MESSAGE, NOW + SECOND)
    history('a different turn', NOW + 700 * SECOND)
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]]))
    shadowRow(2, NOW + 700 * SECOND, okGate('a different turn', [['fact', claimId, 0.9]]))

    const pairs = pairsOf()

    expect(pairs[0].recentMessages).toEqual(['[Bob]: only one before'])
    expect(pairs[1].recentMessages).toEqual(['[Bob]: only one before', '[Alice]: what guitar did Aki want?'])
  })

  it("names the speaker's own facts by the speaker's chat name, other members from the copy, and only member facts", () => {
    const bob = assertClaim({
      guildId: GUILD,
      subjectUserId: 'bob',
      predicate: 'likes',
      value: 'chess',
      sourceKind: 'passive',
      channelId: CHANNEL,
      observedAt: NOW
    })
    const { claimId, episodeId } = seedMemories()
    getDb()
      .prepare('INSERT INTO user_names (user_id, username, display_name, updated_at) VALUES (?, ?, ?, ?)')
      .run('alice', 'alice_9', 'Alice A.', NOW)
    getDb()
      .prepare('INSERT INTO user_names (user_id, username, display_name, updated_at) VALUES (?, ?, ?, ?)')
      .run('bob', 'bob_3', 'Bobby', NOW)
    const serverFactId = guildClaim('announcement', 'the club meets on Friday')
    history(MESSAGE, NOW + SECOND)
    shadowRow(
      1,
      NOW,
      okGate(MESSAGE, [
        ['fact', claimId, 0.9],
        ['fact', bob.id, 0.8],
        ['server_fact', serverFactId, 0.7],
        ['conversation', episodeId, 0.6]
      ])
    )

    // Jev saw the speaker under the name in the chat, which can differ from the name stored for the user.
    expect(pairsOf().map(({ kind, subject }) => [kind, subject])).toEqual([
      ['fact', 'Alice'],
      ['fact', 'Bobby'],
      ['server_fact', null],
      ['conversation', null]
    ])
  })

  it('leaves a fact about another member unnamed when the shadow row has no speaker', () => {
    const { claimId } = seedMemories()
    getDb()
      .prepare('INSERT INTO user_names (user_id, username, display_name, updated_at) VALUES (?, ?, ?, ?)')
      .run('alice', 'alice_9', 'Alice A.', NOW)
    history(MESSAGE, NOW + SECOND)
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]]), CHANNEL, null)

    expect(pairsOf().map(({ subject }) => subject)).toEqual(['Alice A.'])
  })

  it('leaves another member unnamed when the copy has no user-names table, but still names the speaker', () => {
    const { claimId } = seedMemories()
    const bob = assertClaim({
      guildId: GUILD,
      subjectUserId: 'bob',
      predicate: 'likes',
      value: 'chess',
      sourceKind: 'passive',
      channelId: CHANNEL,
      observedAt: NOW
    })
    getDb().exec('DROP TABLE user_names')
    history(MESSAGE, NOW + SECOND)
    shadowRow(
      1,
      NOW,
      okGate(MESSAGE, [
        ['fact', claimId, 0.9],
        ['fact', bob.id, 0.8]
      ])
    )

    expect(pairsOf().map(({ subject }) => subject)).toEqual(['Alice', null])
  })

  it("gives the period Jev saw: the claim's for facts and server facts, current for conversations and media", () => {
    const past = assertClaim({
      guildId: GUILD,
      subjectUserId: 'alice',
      predicate: 'likes',
      value: 'skateboarding',
      sourceKind: 'passive',
      channelId: CHANNEL,
      period: 'past',
      observedAt: NOW
    })
    const { claimId, episodeId } = seedMemories()
    const serverPast = guildClaim('announcement', 'a trip to Kyoto', { period: 'past' })
    const media = saveMediaDigest({
      guildId: GUILD,
      contentKey: 'video-p',
      kind: 'video',
      label: 'Clip',
      summary: 'A clip',
      digestJson: '{}'
    })
    history(MESSAGE, NOW + SECOND)
    shadowRow(
      1,
      NOW,
      okGate(MESSAGE, [
        ['fact', claimId, 0.9],
        ['fact', past.id, 0.9],
        ['server_fact', serverPast, 0.9],
        ['conversation', episodeId, 0.9],
        ['media', media?.id ?? 0, 0.9]
      ])
    )

    expect(pairsOf().map(({ kind, period }) => [kind, period])).toEqual([
      ['fact', 'current'],
      ['fact', 'past'],
      ['server_fact', 'past'],
      ['conversation', 'current'],
      ['media', 'current']
    ])
  })

  it('dates a conversation and a media digest by the configured timezone, as Jev saw them', () => {
    saveMemoryEpisode({
      id: 3,
      guildId: GUILD,
      channelId: CHANNEL,
      startedAt: day(2026, 0, 31, 16),
      endedAt: day(2026, 0, 31, 17, 30),
      summary: 'a late chat',
      embedding: null
    })
    saveMemoryEpisode({
      id: 4,
      guildId: GUILD,
      channelId: CHANNEL,
      startedAt: day(2026, 0, 30, 10),
      endedAt: day(2026, 0, 30, 15, 59, 59),
      summary: 'an afternoon chat',
      embedding: null
    })
    const shared = saveMediaDigest({
      guildId: GUILD,
      contentKey: 'video-d1',
      kind: 'video',
      label: 'Clip',
      summary: 'A twice shared clip',
      digestJson: '{}',
      createdAt: day(2026, 1, 1)
    })
    const unshared = saveMediaDigest({
      guildId: GUILD,
      contentKey: 'video-d2',
      kind: 'video',
      label: 'Clip',
      summary: 'A clip with no recorded share',
      digestJson: '{}',
      createdAt: day(2026, 2, 5, 12)
    })
    for (const [messageId, observedAt] of [
      ['m1', day(2026, 1, 20, 23, 59)],
      ['m2', day(2026, 1, 10, 12)]
    ] as const) {
      recordMediaOccurrence({
        digestId: shared?.id ?? 0,
        guildId: GUILD,
        channelId: CHANNEL,
        messageId,
        sharedByUserId: 'alice',
        sourceAuthorId: null,
        origin: 'upload',
        observedAt
      })
    }
    history(MESSAGE, NOW + SECOND)
    shadowRow(
      1,
      NOW,
      okGate(MESSAGE, [
        ['conversation', 3, 0.9],
        ['conversation', 4, 0.9],
        ['media', shared?.id ?? 0, 0.9],
        ['media', unshared?.id ?? 0, 0.9]
      ])
    )

    expect(pairsOf().map(({ kind, date }) => [kind, date])).toEqual([
      ['conversation', '2026-02-01'],
      ['conversation', '2026-01-30'],
      ['media', '2026-02-21'],
      ['media', '2026-03-05']
    ])
  })

  it('gives a member fact no date, because Jev saw none', () => {
    const fact = assertClaim({
      guildId: GUILD,
      subjectUserId: 'alice',
      predicate: 'likes',
      value: 'night owls',
      sourceKind: 'passive',
      channelId: CHANNEL,
      observedAt: day(2026, 8, 3, 17)
    })
    history(MESSAGE, NOW + SECOND)
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', fact.id, 0.9]]))

    expect(pairsOf().map(({ date }) => date)).toEqual([null])
  })

  it('gives a server fact the date Jev saw: the event date at the precision it was said, else none', () => {
    const fullDate = guildClaim('upcoming_event', 'the club meetup', {
      eventDate: '2026-10-31',
      expiresAt: day(2026, 9, 31, 16)
    })
    const monthOnly = guildClaim('plan', 'a trip to Kyoto', { eventDate: '2026-11', expiresAt: day(2026, 10, 30, 16) })
    const legacy = guildClaim('plan', 'a legacy plan', { expiresAt: day(2026, 11, 5, 16) })
    const other = guildClaim('announcement', 'a new rule')
    history(MESSAGE, NOW + SECOND)
    shadowRow(
      1,
      NOW,
      okGate(
        MESSAGE,
        [fullDate, monthOnly, legacy, other].map((id): [string, number, number] => ['server_fact', id, 0.5])
      )
    )

    expect(pairsOf().map(({ memoryText, date }) => [memoryText, date])).toEqual([
      ['upcoming_event: the club meetup', '2026-10-31'],
      ['plan: a trip to Kyoto', 'November 2026'],
      ['plan: a legacy plan', '2026-12-05'],
      ['announcement: a new rule', null]
    ])
  })

  it('dates the turn itself by its history row, in the configured timezone', () => {
    const { claimId } = seedMemories()
    const lastSecondOfTheDay = day(2026, 8, 3, 15, 59, 59)
    const firstSecondOfTheNext = day(2026, 8, 3, 16, 0, 0)
    history('an afternoon message', lastSecondOfTheDay)
    history('an evening message', firstSecondOfTheNext)
    shadowRow(1, lastSecondOfTheDay - 2 * SECOND, okGate('an afternoon message', [['fact', claimId, 0.9]]))
    shadowRow(2, firstSecondOfTheNext - 2 * SECOND, okGate('an evening message', [['fact', claimId, 0.9]]))

    expect(pairsOf().map(({ message, turnDate }) => [message, turnDate])).toEqual([
      ['an afternoon message', '2026-09-03'],
      ['an evening message', '2026-09-04']
    ])
  })

  it('writes the context to the blind file without probabilities or raw ids', () => {
    const { claimId } = seedMemories()
    getDb()
      .prepare('INSERT INTO user_names (user_id, username, display_name, updated_at) VALUES (?, ?, ?, ?)')
      .run('alice', 'alice_9', 'Alice A.', NOW)
    history('an earlier line', NOW - 50 * SECOND, 'user', CHANNEL, 'Bob')
    history(MESSAGE, NOW + SECOND)
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.91]]))
    const outDir = join(directory, 'out')

    writeGateSample(pairsOf(), outDir)

    const blind = readFileSync(join(outDir, 'pairs.jsonl'), 'utf8')
    expect(JSON.parse(blind)).toEqual({
      pairId: `${turnRef(CHANNEL, NOW)}-fact-${claimId}`,
      kind: 'fact',
      message: MESSAGE,
      memoryText: 'likes: a Yamaha guitar',
      speaker: 'Alice',
      recentMessages: ['[Bob]: an earlier line'],
      subject: 'Alice',
      period: 'current',
      date: null,
      turnDate: '2027-01-15'
    })
    expect(blind).not.toMatch(/0\.91|probability|"alice"|guild-gate|chan-gate/)
    expect(readFileSync(join(outDir, 'key.jsonl'), 'utf8')).toBe(
      `${JSON.stringify({ pairId: `${turnRef(CHANNEL, NOW)}-fact-${claimId}`, turnRef: turnRef(CHANNEL, NOW), kind: 'fact', probability: 0.91 })}\n`
    )
  })
})

describe('who spoke', () => {
  it('takes the speaker from the row the shadow row’s user wrote, not a nearer identical message from someone else', () => {
    const { claimId } = seedMemories()
    history('lol', NOW + 200 * SECOND, 'user', CHANNEL, 'Alice the Guitarist', 'alice')
    history('lol', NOW + 10 * SECOND, 'user', CHANNEL, 'Bob', 'bob')
    shadowRow(1, NOW, okGate('lol', [['fact', claimId, 0.9]]))

    const [pair] = loadGatePairs(finish())

    expect(pair.speaker).toBe('Alice the Guitarist')
    expect(pair.recentMessages).toEqual(['[Bob]: lol'])
    expect(pair.subject).toBe('Alice the Guitarist')
  })
})

describe('claims a member removed', () => {
  function explicit(predicate: string, value: string): number {
    return assertClaim({
      guildId: GUILD,
      subjectUserId: 'alice',
      predicate,
      value,
      sourceKind: 'explicit',
      channelId: CHANNEL,
      observedAt: NOW
    }).id
  }

  const endReason = (id: number): string | null =>
    (getDb().prepare('SELECT end_reason AS reason FROM memory_claim WHERE id = ?').get(id) as { reason: string | null })
      .reason

  it('never emits a removed, forgotten or retracted claim, but keeps a superseded one', () => {
    const kept = explicit('likes', 'tea')
    const removed = explicit('likes', 'coffee')
    const forgotten = explicit('likes', 'juice')
    const retracted = explicit('likes', 'soda')
    explicit('nickname', 'Al')
    const superseded = Number(
      (getDb().prepare("SELECT id FROM memory_claim WHERE predicate = 'nickname'").get() as { id: number }).id
    )
    explicit('nickname', 'Ally')
    const guildRemoved = guildClaim('announcement', 'a retired rule', { endReason: 'removed' })
    expect(retractClaim({ guildId: GUILD, subjectUserId: 'alice', predicate: 'likes', value: 'coffee' })).toBe(true)
    expect(rejectClaimIdsForSpeaker(GUILD, 'alice', [forgotten])).toBe(true)
    expect(retireClaim(GUILD, retracted, 'retracted')).toBe(true)
    expect([kept, removed, forgotten, retracted, superseded].map(endReason)).toEqual([
      null,
      'removed',
      'forgotten',
      'retracted',
      'superseded'
    ])
    history(MESSAGE, NOW + SECOND)
    shadowRow(
      1,
      NOW,
      okGate(
        MESSAGE,
        [kept, removed, forgotten, retracted, superseded]
          .map((id): [string, number, number] => ['fact', id, 0.5])
          .concat([['server_fact', guildRemoved, 0.5]])
      )
    )

    const pairs = loadGatePairs(finish())

    expect(pairs.map(({ memoryText }) => memoryText)).toEqual(['likes: tea', 'nickname: Al'])
  })
})

describe('matching a turn to its history row', () => {
  function match(createdAt: number, text: string, speakerId?: string | null): ReturnType<typeof matchGateMessage> {
    const database = new Database(finish(), { readonly: true })
    try {
      return matchGateMessage(database, CHANNEL, createdAt, hash(text), speakerId)
    } finally {
      database.close()
    }
  }

  it('uses the matching row whose timestamp is nearest the shadow row', () => {
    history(MESSAGE, NOW - 400 * SECOND)
    history(MESSAGE, NOW + 30 * SECOND)
    history(MESSAGE, NOW + 250 * SECOND)

    expect(match(NOW, MESSAGE)).toEqual({ message: MESSAGE, timestamp: NOW + 30 * SECOND, speaker: 'Alice' })
  })

  it('prefers the nearer row even when it is the one carrying a digest', () => {
    history(MESSAGE, NOW + 200 * SECOND)
    history(`${MESSAGE}\n[image: a guitar]`, NOW - 10 * SECOND)

    expect(match(NOW, MESSAGE)).toEqual({ message: MESSAGE, timestamp: NOW - 10 * SECOND, speaker: 'Alice' })
  })

  it('prefers the speaker’s own row over a nearer identical message from another member', () => {
    history(MESSAGE, NOW + 10 * SECOND, 'user', CHANNEL, 'Bob', 'bob')
    history(MESSAGE, NOW + 200 * SECOND, 'user', CHANNEL, 'Alice', 'alice')

    expect(match(NOW, MESSAGE, 'alice')).toEqual({ message: MESSAGE, timestamp: NOW + 200 * SECOND, speaker: 'Alice' })
  })

  it('uses the nearest of the speaker’s own rows when there are several', () => {
    history(MESSAGE, NOW - 300 * SECOND, 'user', CHANNEL, 'Alice', 'alice')
    history(MESSAGE, NOW + 40 * SECOND, 'user', CHANNEL, 'Alice', 'alice')
    history(MESSAGE, NOW + 5 * SECOND, 'user', CHANNEL, 'Bob', 'bob')

    expect(match(NOW, MESSAGE, 'alice')).toEqual({ message: MESSAGE, timestamp: NOW + 40 * SECOND, speaker: 'Alice' })
  })

  it('falls back to the nearest row of anyone when the speaker has none, or when no speaker is known', () => {
    history(MESSAGE, NOW + 10 * SECOND, 'user', CHANNEL, 'Bob', 'bob')
    history(MESSAGE, NOW + 200 * SECOND, 'user', CHANNEL, 'Carol', 'carol')

    expect(match(NOW, MESSAGE, 'alice')).toEqual({ message: MESSAGE, timestamp: NOW + 10 * SECOND, speaker: 'Bob' })
    expect(match(NOW, MESSAGE, null)).toEqual({ message: MESSAGE, timestamp: NOW + 10 * SECOND, speaker: 'Bob' })
  })

  it('takes the earlier row on an exact tie', () => {
    history(MESSAGE, NOW + 20 * SECOND)
    history(MESSAGE, NOW - 20 * SECOND)

    expect(match(NOW, MESSAGE)).toEqual({ message: MESSAGE, timestamp: NOW - 20 * SECOND, speaker: 'Alice' })
  })
})

describe('what the sampler skipped', () => {
  it('counts each reason once, and unusable memories by candidate', () => {
    const { claimId, episodeId } = seedMemories()
    const removed = assertClaim({
      guildId: GUILD,
      subjectUserId: 'alice',
      predicate: 'likes',
      value: 'coffee',
      sourceKind: 'explicit',
      channelId: CHANNEL,
      observedAt: NOW
    }).id
    retractClaim({ guildId: GUILD, subjectUserId: 'alice', predicate: 'likes', value: 'coffee' })
    history(MESSAGE, NOW + SECOND)
    history('(shared an image)', NOW + 10 * SECOND)
    history('(pinged you without saying anything)', NOW + 20 * SECOND)
    shadowRow(1, NOW, { v: 1, status: 'deadline', messageHash: hash(MESSAGE), shortlist: [] })
    shadowRow(2, NOW, { v: 1, status: 'gate_error' })
    shadowRow(3, NOW, 'not json')
    shadowRow(4, NOW + 30 * SECOND, okGate('said where nobody recorded it', [['fact', claimId, 0.9]]))
    shadowRow(5, NOW + 10 * SECOND, okGate('(shared an image)', [['fact', claimId, 0.9]]))
    shadowRow(6, NOW + 20 * SECOND, okGate('(pinged you without saying anything)', [['fact', claimId, 0.9]]))
    shadowRow(
      7,
      NOW,
      okGate(MESSAGE, [
        ['fact', claimId, 0.9],
        ['fact', 999, 0.8],
        ['fact', removed, 0.7],
        ['mystery', 1, 0.6],
        ['conversation', episodeId, 0.5],
        ['fact', claimId, null]
      ])
    )

    const sample = loadGateSample(finish())

    expect(sample.pairs.map(({ kind }) => kind)).toEqual(['fact', 'conversation'])
    expect(sample.rows).toBe(7)
    expect(sample.skips).toEqual({
      gateNotOk: 3,
      otherSelection: 0,
      noHistoryMatch: 1,
      placeholder: 2,
      memoryUnavailable: 3
    })
  })

  it('prints every reason with its count', () => {
    const line = formatSkips({
      gateNotOk: 3,
      otherSelection: 4,
      noHistoryMatch: 5,
      placeholder: 6,
      memoryUnavailable: 7
    })

    expect(line).toBe(
      'skipped: 3 turns with a gate that was not ok, 4 turns on another rubric or model, 5 turns with no history match, ' +
        '6 placeholder messages, 7 candidates whose memory is missing or excluded'
    )
  })

  it('returns the same pairs from loadGatePairs as from the sample', () => {
    const { claimId } = seedMemories()
    history(MESSAGE, NOW + SECOND)
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]]))
    const copy = finish()

    expect(loadGatePairs(copy)).toEqual(loadGateSample(copy).pairs)
  })
})

describe('mixed rubrics and models', () => {
  function seedMixed(): void {
    const { claimId } = seedMemories()
    const rows: Array<[string, { rubric?: string; model?: string }]> = [
      ['first', { rubric: 'r1', model: 'model-a' }],
      ['second', { rubric: 'r1', model: 'model-a' }],
      ['third', { rubric: 'r2', model: 'model-a' }],
      ['fourth', { rubric: 'r1', model: 'model-b' }]
    ]
    for (const [index, [message, version]] of rows.entries()) {
      history(message, NOW + (index * 700 + 1) * SECOND)
      shadowRow(index + 1, NOW + index * 700 * SECOND, okGate(message, [['fact', claimId, 0.9]], version))
    }
  }

  it('refuses to mix them and says how many turns each has', () => {
    seedMixed()
    const copy = finish()

    expect(() => loadGatePairs(copy)).toThrow('r1 / model-a = 2; r1 / model-b = 1; r2 / model-a = 1')
    expect(() => loadGatePairs(copy)).toThrow('--rubric and --model')
  })

  it('uses only the rows of the rubric and model it is given, and counts the rest as skipped', () => {
    seedMixed()

    const sample = loadGateSample(finish(), { rubric: 'r1', model: 'model-a' })

    expect(sample.pairs.map(({ message }) => message)).toEqual(['first', 'second'])
    expect(sample.skips.otherSelection).toBe(2)
  })

  it('accepts a rubric alone when it leaves one model, and still refuses when it leaves two', () => {
    seedMixed()
    const copy = finish()

    expect(loadGatePairs(copy, { rubric: 'r2' }).map(({ message }) => message)).toEqual(['third'])
    expect(() => loadGatePairs(copy, { rubric: 'r1' })).toThrow('r1 / model-a = 2; r1 / model-b = 1')
    expect(loadGatePairs(copy, { model: 'model-b' }).map(({ message }) => message)).toEqual(['fourth'])
  })

  it('does not count rows that could not make a pair', () => {
    const { claimId } = seedMemories()
    history(MESSAGE, NOW + SECOND)
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]], { rubric: 'r2', model: 'model-a' }))
    shadowRow(
      2,
      NOW + 3000 * SECOND,
      okGate('aged out of the history', [['fact', claimId, 0.9]], { rubric: 'r1', model: 'model-a' })
    )
    shadowRow(3, NOW + 4000 * SECOND, { v: 1, status: 'deadline', rubric: 'r0', model: 'model-z' })

    expect(loadGatePairs(finish()).map(({ message }) => message)).toEqual([MESSAGE])
  })

  it('selects nothing, without refusing, when the given rubric matches no row', () => {
    seedMixed()

    const sample = loadGateSample(finish(), { rubric: 'r9', model: 'model-a' })

    expect(sample.pairs).toEqual([])
    expect(sample.skips.otherSelection).toBe(4)
  })
})

describe('writing the sample', () => {
  const pairs: GatePair[] = Array.from({ length: 12 }, (_, index) => ({
    pairId: `turn-fact-${index}`,
    turnRef: `turn-${index % 3}`,
    kind: 'fact',
    message: `message ${index}`,
    memoryText: `memory ${index}`,
    speaker: 'Alice',
    recentMessages: [],
    subject: null,
    period: null,
    date: null,
    turnDate: '2027-01-15',
    probability: 0.5 + index / 100
  }))

  it('writes owner-only files, even over files that already exist, and shuffles the same way every run', () => {
    const outDir = join(directory, 'private', 'out')
    writeGateSample(pairs, outDir)
    const first = readFileSync(join(outDir, 'pairs.jsonl'), 'utf8')
    for (const name of ['pairs.jsonl', 'key.jsonl']) {
      expect(statSync(join(outDir, name)).mode & 0o777).toBe(0o600)
      chmodSync(join(outDir, name), 0o644)
    }

    writeGateSample(pairs, outDir)

    for (const name of ['pairs.jsonl', 'key.jsonl']) expect(statSync(join(outDir, name)).mode & 0o777).toBe(0o600)
    expect(readFileSync(join(outDir, 'pairs.jsonl'), 'utf8')).toBe(first)
    const ids = first
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).pairId as string)
    expect([...ids].sort()).toEqual(pairs.map(({ pairId }) => pairId).sort())
    expect(ids).not.toEqual(pairs.map(({ pairId }) => pairId))
  })

  it('writes into a private directory, and tightens one that already exists', () => {
    const fresh = join(directory, 'fresh')
    const existing = join(directory, 'existing')
    mkdirSync(existing, { mode: 0o755 })
    chmodSync(existing, 0o755)

    writeGateSample(pairs, fresh)
    writeGateSample(pairs, existing)

    expect(statSync(fresh).mode & 0o777).toBe(0o700)
    expect(statSync(existing).mode & 0o777).toBe(0o700)
  })

  it('writes empty files for an empty sample', () => {
    const outDir = join(directory, 'empty')

    writeGateSample([], outDir)

    expect(readFileSync(join(outDir, 'pairs.jsonl'), 'utf8')).toBe('')
    expect(readFileSync(join(outDir, 'key.jsonl'), 'utf8')).toBe('')
  })
})
