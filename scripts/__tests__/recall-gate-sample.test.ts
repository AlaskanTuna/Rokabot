import { createHash } from 'node:crypto'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
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
import { type GatePair, loadGatePairs, matchGateMessage, writeGateSample } from '../recall-gate-sample.js'

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

function okGate(message: string, shortlist: Array<[string, number, number | null]>): Record<string, unknown> {
  return { v: 1, status: 'ok', messageHash: hash(message), shortlist }
}

function shadowRow(id: number, createdAt: number, gate: unknown, channelId: string | null = CHANNEL): void {
  const detail = typeof gate === 'string' ? gate : JSON.stringify({ mode: 'shadow', fallback: false, gate })
  getDb()
    .prepare(
      `INSERT INTO memory_events (id, kind, guild_id, channel_id, subject_user_id, detail, created_at)
       VALUES (?, 'recall_shadow', ?, ?, 'alice', ?, ?)`
    )
    .run(id, GUILD, channelId, detail, createdAt)
}

function history(
  content: string,
  timestamp: number,
  role: 'user' | 'assistant' = 'user',
  channelId = CHANNEL,
  displayName = role === 'user' ? 'Alice' : 'Roka'
): void {
  getDb()
    .prepare('INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)')
    .run(channelId, role, displayName, content, timestamp)
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
    expect(pairs[3].memoryText).toBe('A short clip of someone strumming a Yamaha')
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

  it('names the subject of a member fact from the copy, and only for member facts', () => {
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

    expect(pairsOf().map(({ kind, subject }) => [kind, subject])).toEqual([
      ['fact', 'Alice A.'],
      ['fact', null],
      ['server_fact', null],
      ['conversation', null]
    ])
  })

  it('leaves the subject null when the copy has no user-names table', () => {
    const { claimId } = seedMemories()
    getDb().exec('DROP TABLE user_names')
    history(MESSAGE, NOW + SECOND)
    shadowRow(1, NOW, okGate(MESSAGE, [['fact', claimId, 0.9]]))

    expect(pairsOf().map(({ subject }) => subject)).toEqual([null])
  })

  it('gives the period of a fact or server fact, and null for conversations and media', () => {
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
      ['conversation', null],
      ['media', null]
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
      subject: 'Alice A.',
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
  function match(createdAt: number, text: string): ReturnType<typeof matchGateMessage> {
    const database = new Database(finish(), { readonly: true })
    try {
      return matchGateMessage(database, CHANNEL, createdAt, hash(text))
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

  it('takes the earlier row on an exact tie', () => {
    history(MESSAGE, NOW + 20 * SECOND)
    history(MESSAGE, NOW - 20 * SECOND)

    expect(match(NOW, MESSAGE)).toEqual({ message: MESSAGE, timestamp: NOW - 20 * SECOND, speaker: 'Alice' })
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

  it('writes empty files for an empty sample', () => {
    const outDir = join(directory, 'empty')

    writeGateSample([], outDir)

    expect(readFileSync(join(outDir, 'pairs.jsonl'), 'utf8')).toBe('')
    expect(readFileSync(join(outDir, 'key.jsonl'), 'utf8')).toBe('')
  })
})
