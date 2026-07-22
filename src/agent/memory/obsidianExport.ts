import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { dump } from 'js-yaml'
import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
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

export async function exportVault(dir: string = config.memory.vaultExportDir): Promise<VaultExportResult> {
  const subjects = listActiveClaimSubjects()
  const exportDir = resolve(dir)
  let claims = 0

  for (const { guild_id: guildId, subject_user_id: userId } of subjects) {
    const activeClaims = getActiveClaims(guildId, userId)
    const notePath = resolve(join(exportDir, guildId, `${userId}.md`))
    const relativeNotePath = relative(exportDir, notePath)
    if (relativeNotePath === '..' || relativeNotePath.startsWith(`..${sep}`) || isAbsolute(relativeNotePath)) {
      throw new Error('Vault note path is outside the export directory')
    }

    await mkdir(dirname(notePath), { recursive: true })
    await writeFile(notePath, formatNote(activeClaims), 'utf8')
    claims += activeClaims.length
  }

  return { notes: subjects.length, claims }
}
