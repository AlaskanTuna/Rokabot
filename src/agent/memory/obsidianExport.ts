import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { dump } from 'js-yaml'
import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import { listEpisodeGuildIds, listEpisodesForGuild } from '../../storage/memoryEpisodeStore.js'
import type { MemoryEpisode } from '../../storage/memoryEpisodeStore.js'
import { type GuildMemoryClaim, type UserMemoryClaim, getActiveClaims, getActiveGuildClaims } from './memoryClaims.js'

type ActiveClaimSubject = Readonly<{
  guild_id: string
  subject_user_id: string
}>

type ActiveGuildSubject = Readonly<{ guild_id: string }>

type ExportedClaim = Readonly<{
  value: string
  source_kind: string
  pinned: boolean
  last_seen_at: number
}>

type ExportedGuildClaim = ExportedClaim & Readonly<{ expires_at?: number }>

export type VaultExportResult = Readonly<{
  notes: number
  claims: number
  episodes: number
}>

function listActiveClaimSubjects(): ActiveClaimSubject[] {
  return getDb()
    .prepare(
      `SELECT DISTINCT guild_id, subject_user_id
       FROM memory_claim
       WHERE subject_kind = 'user' AND status = 'active'
       ORDER BY guild_id, subject_user_id`
    )
    .all() as ActiveClaimSubject[]
}

function listActiveGuildSubjects(now: number): ActiveGuildSubject[] {
  return getDb()
    .prepare(
      `SELECT DISTINCT guild_id
       FROM memory_claim
       WHERE subject_kind = 'guild' AND subject_user_id IS NULL AND status = 'active' AND needs_review = 0
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY guild_id`
    )
    .all(now) as ActiveGuildSubject[]
}

function formatClaimGroups(claims: UserMemoryClaim[]): Record<string, ExportedClaim[]> {
  const groups: Record<string, ExportedClaim[]> = {}

  for (const { predicate, value, sourceKind, pinned, lastSeenAt } of claims) {
    const group = groups[predicate] ?? []
    group.push({
      value,
      source_kind: sourceKind,
      pinned,
      last_seen_at: lastSeenAt
    })
    groups[predicate] = group
  }

  return groups
}

function formatRelationships(claims: UserMemoryClaim[]): string {
  const edges = claims.filter(({ predicate, objectUserId }) => predicate === 'relationship_to' && objectUserId)
  if (edges.length === 0) return ''

  return `## Relationships\n\n${edges.map(({ objectUserId, value }) => `- [[${objectUserId}]] — ${value}`).join('\n')}\n`
}

function formatNote(claims: UserMemoryClaim[]): string {
  return `---\n${dump(formatClaimGroups(claims))}---\n\n${formatRelationships(claims)}`
}

function formatGuildNote(claims: GuildMemoryClaim[]): string {
  const groups: Record<string, ExportedGuildClaim[]> = {}
  for (const { predicate, value, sourceKind, pinned, lastSeenAt, expiresAt } of claims) {
    const group = groups[predicate] ?? []
    group.push({
      value,
      source_kind: sourceKind,
      pinned,
      last_seen_at: lastSeenAt,
      ...(expiresAt !== null ? { expires_at: expiresAt } : {})
    })
    groups[predicate] = group
  }
  return `---\n${dump(groups)}---\n`
}

function notePath(exportDir: string, guildId: string, fileName: string): string {
  const path = resolve(join(exportDir, guildId, fileName))
  const relativePath = relative(exportDir, path)
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('Vault note path is outside the export directory')
  }
  return path
}

function formatEpisodeNote(episodes: readonly MemoryEpisode[]): string {
  return [...episodes]
    .sort((left, right) => right.endedAt - left.endedAt || left.id - right.id)
    .map((episode) => {
      const date = new Date(episode.endedAt).toISOString().slice(0, 10).replace(/#/g, '\\#')
      const range =
        new Date(episode.startedAt).toISOString().slice(11, 16) +
        '–' +
        new Date(episode.endedAt).toISOString().slice(11, 16)
      return '### ' + date + ' (' + range + ' UTC)\n\n> ' + JSON.stringify(episode.summary) + '\n'
    })
    .join('\n')
}

export async function exportVault(dir: string = config.memory.vaultExportDir): Promise<VaultExportResult> {
  const subjects = listActiveClaimSubjects()
  const now = Date.now()
  const guilds = listActiveGuildSubjects(now)
  const exportDir = resolve(dir)
  let claims = 0
  let notes = subjects.length
  let episodes = 0

  for (const { guild_id: guildId, subject_user_id: userId } of subjects) {
    const activeClaims = getActiveClaims(guildId, userId)
    const path = notePath(exportDir, guildId, `${userId}.md`)

    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, formatNote(activeClaims), 'utf8')
    claims += activeClaims.length
  }

  for (const { guild_id: guildId } of guilds) {
    const activeClaims = getActiveGuildClaims(guildId, now)
    if (activeClaims.length === 0) continue
    const path = notePath(exportDir, guildId, 'guild.md')

    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, formatGuildNote(activeClaims), 'utf8')
    claims += activeClaims.length
    notes++
  }

  for (const guildId of listEpisodeGuildIds()) {
    const guildEpisodes = listEpisodesForGuild(guildId)
    if (guildEpisodes.length === 0) continue
    const path = notePath(exportDir, guildId, 'Episodes.md')

    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, formatEpisodeNote(guildEpisodes), 'utf8')
    episodes += guildEpisodes.length
  }

  return { notes, claims, episodes }
}
