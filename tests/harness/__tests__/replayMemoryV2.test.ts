import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

const snapshotPath = join(process.cwd(), 'data/.memory-replay-cli.test.db')

afterEach(() => {
  rmSync(snapshotPath, { force: true })
})

describe('memory replay CLI', () => {
  it('reports snapshot gap statistics when a session-history database is supplied', () => {
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
      INSERT INTO session_history VALUES ('channel-a', 'user', 'Mio', 'shared interest', 1, 'u-1', 'mio');
    `)
    db.close()

    const output = execFileSync(
      resolve('node_modules/.bin/tsx'),
      [
        resolve('scripts/replay-memory-v2.ts'),
        '--transcripts',
        resolve('tests/harness/transcripts'),
        '--session-history',
        snapshotPath
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          DISCORD_TOKEN: 'ci-dummy-discord-token',
          DISCORD_CLIENT_ID: 'ci-dummy-discord-client-id',
          GEMINI_API_KEY: 'ci-dummy-gemini-api-key'
        }
      }
    )

    expect(output).toContain('"snapshot_gap_distribution": {')
    expect(output).toContain('"sampleCount": 0')
  })
})
