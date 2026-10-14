import { createHash } from 'node:crypto'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertClaim } from '../../src/agent/memory/memoryClaims.js'
import { closeDb, getDb } from '../../src/storage/database.js'
import { saveMediaDigest } from '../../src/storage/mediaDigestStore.js'
import { saveMemoryEpisode } from '../../src/storage/memoryEpisodeStore.js'
import { turnRef } from '../recall-calibration-sample.js'
import { type GatePair, loadGatePairs, matchGateMessage, writeGateSample } from '../recall-gate-sample.js'

const NOW = 1_800_000_000_000
const GUILD = 'guild-gate'
const CHANNEL = 'chan-gate'
const MESSAGE = 'what guitar did Aki want?'
const SECOND = 1000

const hash = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16)

let directory = ''
let dbPath = ''
let previousDbPath: string | undefined

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

function history(content: string, timestamp: number, role: 'user' | 'assistant' = 'user', channelId = CHANNEL): void {
  getDb()
    .prepare('INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)')
    .run(channelId, role, role === 'user' ? 'Alice' : 'Roka', content, timestamp)
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
  dbPath = join(directory, 'copy.db')
  process.env.ROKABOT_DB_PATH = dbPath
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = previousDbPath
  rmSync(directory, { recursive: true, force: true })
})

describe('loading gate pairs', () => {
  it('joins exact turn text by hash, memory text by kind, and keeps probabilities out of the blind file', () => {
    const { claimId, episodeId } = seedMemories()
    getDb()
      .prepare(
        `INSERT INTO memory_claim (guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status,
           first_seen_at, last_seen_at)
         VALUES (?, 'guild', NULL, 'announcement', 'the club meets on Friday', 'passive', 'active', ?, ?)`
      )
      .run(GUILD, NOW, NOW)
    const serverFactId = Number(
      (getDb().prepare("SELECT id FROM memory_claim WHERE subject_kind = 'guild'").get() as { id: number }).id
    )
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
    ).toEqual(Array(4).fill(['kind', 'memoryText', 'message', 'pairId']))
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

    expect(match(NOW, MESSAGE)).toEqual({ message: MESSAGE, timestamp: NOW + 30 * SECOND })
  })

  it('prefers the nearer row even when it is the one carrying a digest', () => {
    history(MESSAGE, NOW + 200 * SECOND)
    history(`${MESSAGE}\n[image: a guitar]`, NOW - 10 * SECOND)

    expect(match(NOW, MESSAGE)).toEqual({ message: MESSAGE, timestamp: NOW - 10 * SECOND })
  })

  it('takes the earlier row on an exact tie', () => {
    history(MESSAGE, NOW + 20 * SECOND)
    history(MESSAGE, NOW - 20 * SECOND)

    expect(match(NOW, MESSAGE)).toEqual({ message: MESSAGE, timestamp: NOW - 20 * SECOND })
  })
})

describe('writing the sample', () => {
  const pairs: GatePair[] = Array.from({ length: 12 }, (_, index) => ({
    pairId: `turn-fact-${index}`,
    turnRef: `turn-${index % 3}`,
    kind: 'fact',
    message: `message ${index}`,
    memoryText: `memory ${index}`,
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
