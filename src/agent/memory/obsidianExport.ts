import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { dump } from 'js-yaml'
import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import { listEpisodeGuildIds, listEpisodesForGuild } from '../../storage/memoryEpisodeStore.js'
import type { MemoryEpisode } from '../../storage/memoryEpisodeStore.js'
import { type MemoryClaim, getActiveClaims } from './memoryClaims.js'

type ActiveClaimSubject = Readonly<{
  guild_id: string
  subject_user_id: string
}>

type ExportedClaim = Readonly<{
  value: string
  source_kind: string
  pinned: boolean
  last_seen_at: number
}>

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
       WHERE status = 'active'
       ORDER BY guild_id, subject_user_id`
    )
    .all() as ActiveClaimSubject[]
}

function formatClaimGroups(claims: MemoryClaim[]): Record<string, ExportedClaim[]> {
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

function formatRelationships(claims: MemoryClaim[]): string {
  const edges = claims.filter(({ predicate, objectUserId }) => predicate === 'relationship_to' && objectUserId)
  if (edges.length === 0) return ''

  return `## Relationships\n\n${edges.map(({ objectUserId, value }) => `- [[${objectUserId}]] — ${value}`).join('\n')}\n`
}

function formatNote(claims: MemoryClaim[]): string {
  return `---\n${dump(formatClaimGroups(claims))}---\n\n${formatRelationships(claims)}`
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

function assertInsideExportDir(exportDir: string, notePath: string): void {
  const relativeNotePath = relative(exportDir, notePath)
  if (relativeNotePath === '..' || relativeNotePath.startsWith(`..${sep}`) || isAbsolute(relativeNotePath)) {
    throw new Error('Vault note path is outside the export directory')
  }
}

export async function exportVault(dir: string = config.memory.vaultExportDir): Promise<VaultExportResult> {
  const subjects = listActiveClaimSubjects()
  const exportDir = resolve(dir)
  const guildIds = new Set([...subjects.map(({ guild_id }) => guild_id), ...listEpisodeGuildIds()])
  let claims = 0
  let episodes = 0

  for (const guildId of guildIds) {
    for (const { subject_user_id: userId } of subjects.filter((subject) => subject.guild_id === guildId)) {
      const activeClaims = getActiveClaims(guildId, userId)
      const notePath = resolve(join(exportDir, guildId, `${userId}.md`))
      assertInsideExportDir(exportDir, notePath)

      await mkdir(dirname(notePath), { recursive: true })
      await writeFile(notePath, formatNote(activeClaims), 'utf8')
      claims += activeClaims.length
    }

    const guildEpisodes = listEpisodesForGuild(guildId)
    if (guildEpisodes.length === 0) continue

    const notePath = resolve(join(exportDir, guildId, 'Episodes.md'))
    assertInsideExportDir(exportDir, notePath)
    await mkdir(dirname(notePath), { recursive: true })
    await writeFile(notePath, formatEpisodeNote(guildEpisodes), 'utf8')
    episodes += guildEpisodes.length
  }

  return { notes: subjects.length, claims, episodes }
}
