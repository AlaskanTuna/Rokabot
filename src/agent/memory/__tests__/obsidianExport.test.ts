import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { load } from 'js-yaml'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    memory: {
      maxActiveClaimsPerUser: 20,
      vaultExportDir: 'data/vault'
    }
  }
}))

import { closeDb, getDb } from '../../../storage/database.js'
import { assertClaim, pinClaim } from '../memoryClaims.js'

let vaultDir: string
let escapeDir: string

beforeEach(async () => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  vaultDir = await mkdtemp(join(tmpdir(), 'rokabot-vault-'))
  escapeDir = await mkdtemp(join(tmpdir(), 'rokabot-escape-'))
})

afterEach(async () => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  await rm(vaultDir, { recursive: true, force: true })
  await rm(escapeDir, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('exportVault', () => {
  it('exports active claims as grouped YAML without store writes or network calls', async () => {
    const favorite = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'favorite_anime',
      value: 'Frieren',
      sourceKind: 'explicit',
      observedAt: 1_000
    })
    pinClaim(favorite.id)
    const supersededGame = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'favorite_game',
      value: 'Chess',
      sourceKind: 'explicit',
      observedAt: 1_500
    })
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'favorite_game',
      value: 'Hollow Knight',
      sourceKind: 'explicit',
      observedAt: 1_600
    })
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'relationship_to',
      value: 'friend',
      objectUserId: 'user-2',
      sourceKind: 'human',
      observedAt: 2_000
    })
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-2',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'passive',
      observedAt: 3_000
    })
    assertClaim({
      guildId: 'dm:channel-1',
      subjectUserId: 'user-1',
      predicate: 'hobby',
      value: 'reading',
      sourceKind: 'explicit',
      observedAt: 4_000
    })

    const db = getDb()
    const prepare = vi.spyOn(db, 'prepare')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    const { exportVault } = await import('../obsidianExport.js')
    const result = await exportVault(vaultDir)

    const note = await readFile(join(vaultDir, 'guild-1', 'user-1.md'), 'utf8')
    const frontmatter = note.match(/^---\n([\s\S]*?)\n---\n/)?.[1]

    expect(result).toEqual({ notes: 3, claims: 5 })
    expect(db.prepare('SELECT status FROM memory_claim WHERE id = ?').get(supersededGame.id)).toEqual({
      status: 'superseded'
    })
    expect(frontmatter).toBeDefined()
    expect(load(frontmatter as string)).toEqual({
      favorite_anime: [{ value: 'Frieren', source_kind: 'explicit', pinned: true, last_seen_at: 1_000 }],
      favorite_game: [{ value: 'Hollow Knight', source_kind: 'explicit', pinned: false, last_seen_at: 1_600 }],
      relationship_to: [{ value: 'friend', source_kind: 'human', pinned: false, last_seen_at: 2_000 }]
    })
    expect(note).not.toContain('Chess')
    expect(note).toContain('[[user-2]]')
    await expect(readFile(join(vaultDir, 'dm:channel-1', 'user-1.md'), 'utf8')).resolves.toContain('reading')
    expect(prepare.mock.calls.map(([sql]) => sql.trim().toUpperCase())).toEqual(
      expect.arrayContaining([expect.stringMatching(/^SELECT/), expect.stringMatching(/^SELECT/)])
    )
    expect(prepare.mock.calls.map(([sql]) => sql.trim().toUpperCase()).every((sql) => sql.startsWith('SELECT'))).toBe(
      true
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a scope that would write outside the export directory', async () => {
    assertClaim({
      guildId: `../${basename(escapeDir)}`,
      subjectUserId: 'user-1',
      predicate: 'hobby',
      value: 'reading',
      sourceKind: 'explicit',
      observedAt: 1_000
    })

    const { exportVault } = await import('../obsidianExport.js')

    await expect(exportVault(vaultDir)).rejects.toThrow('outside the export directory')
    await expect(readFile(join(escapeDir, 'user-1.md'), 'utf8')).rejects.toThrow()
  })
})
