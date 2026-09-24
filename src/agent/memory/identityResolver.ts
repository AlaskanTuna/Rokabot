import { getDb } from '../../storage/database.js'
import { getUserName } from '../../storage/userNames.js'

type MatchKind = 'display_name' | 'username' | 'nickname'

type NameCandidate = {
  userId: string
  matchedBy: MatchKind
}

type NameIndex = {
  aliases: Map<string, Map<string, NameCandidate>>
  users: Map<string, { displayName: string }>
}

type UserNameRow = {
  user_id: string
  username: string
  display_name: string
}

const MATCH_PRIORITY: Record<MatchKind, number> = {
  display_name: 0,
  username: 1,
  nickname: 2
}

const GUILD_PRESENCE = `(
  EXISTS(SELECT 1 FROM memory_claim WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = user_names.user_id)
  OR EXISTS(SELECT 1 FROM response_events WHERE guild_id = ? AND user_id = user_names.user_id)
)`

function buildNameIndex(guildId: string): NameIndex {
  const db = getDb()
  const global = guildId === 'global'
  const userRows = db
    .prepare(
      `SELECT user_id, username, display_name FROM user_names
       ${global ? '' : `WHERE ${GUILD_PRESENCE}`}
       ORDER BY rowid`
    )
    .all(...(global ? [] : [guildId, guildId])) as UserNameRow[]
  const nicknameRows = global
    ? []
    : (db
        .prepare(
          `SELECT subject_user_id AS user_id, value FROM memory_claim
           WHERE guild_id = ? AND subject_kind = 'user' AND status = 'active' AND predicate = 'nickname'
           ORDER BY id`
        )
        .all(guildId) as Array<{ user_id: string; value: string }>)

  const aliases = new Map<string, Map<string, NameCandidate>>()
  const users = new Map(userRows.map((row) => [row.user_id, { displayName: row.display_name }]))
  const addAlias = (value: string, userId: string, matchedBy: MatchKind) => {
    const alias = value.trim()
    if (!alias) return
    const normalized = alias.toLowerCase()
    const candidates = aliases.get(normalized) ?? new Map<string, NameCandidate>()
    const existing = candidates.get(userId)
    if (!existing || MATCH_PRIORITY[matchedBy] < MATCH_PRIORITY[existing.matchedBy]) {
      candidates.set(userId, { userId, matchedBy })
    }
    aliases.set(normalized, candidates)
  }

  for (const row of userRows) addAlias(row.display_name, row.user_id, 'display_name')
  for (const row of userRows) addAlias(row.username, row.user_id, 'username')
  for (const row of nicknameRows) addAlias(row.value, row.user_id, 'nickname')

  return { aliases, users }
}

function orderedCandidates(candidates: Map<string, NameCandidate>): NameCandidate[] {
  return [...candidates.values()].sort(
    (left, right) => MATCH_PRIORITY[left.matchedBy] - MATCH_PRIORITY[right.matchedBy]
  )
}

function isAscii(value: string): boolean {
  return [...value].every((character) => character.charCodeAt(0) <= 0x7f)
}

export function resolveName(name: string, guildId: string): string[] {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return []
  const candidates = buildNameIndex(guildId).aliases.get(normalized)
  return candidates ? orderedCandidates(candidates).map(({ userId }) => userId) : []
}

export function resolveReferences(input: {
  guildId: string
  text: string
  speakerId: string
  mentionedUserIds: string[]
}): {
  resolved: Array<{
    userId: string
    alias: string
    displayName: string
    matchedBy: 'mention' | 'display_name' | 'username' | 'nickname'
  }>
  ambiguous: Array<{ alias: string; candidateIds: string[] }>
} {
  if (input.guildId === 'global') return { resolved: [], ambiguous: [] }

  const resolved: Array<{
    userId: string
    alias: string
    displayName: string
    matchedBy: 'mention' | MatchKind
  }> = []
  const ambiguous: Array<{ alias: string; candidateIds: string[] }> = []
  const seenUserIds = new Set<string>()

  for (const userId of input.mentionedUserIds) {
    if (userId === input.speakerId || seenUserIds.has(userId)) continue
    const user = getUserName(userId)
    if (!user) continue
    resolved.push({ userId, alias: user.displayName, displayName: user.displayName, matchedBy: 'mention' })
    seenUserIds.add(userId)
  }

  const nameIndex = buildNameIndex(input.guildId)
  const occurrences: Array<{
    start: number
    order: number
    alias: string
    candidates: Map<string, NameCandidate>
  }> = []
  let order = 0

  for (const [alias, candidates] of nameIndex.aliases) {
    const candidate = candidates.values().next().value as NameCandidate | undefined
    if (!candidate) continue
    if ([...alias].length < 3) continue
    const expression = isAscii(alias)
      ? new RegExp(`(?<![A-Za-z0-9_])${escapeRegex(alias)}(?![A-Za-z0-9_])`, 'i')
      : new RegExp(escapeRegex(alias), 'i')
    const match = expression.exec(input.text)
    if (match) occurrences.push({ start: match.index, order: order++, alias: match[0], candidates })
  }

  occurrences.sort(
    (left, right) => left.start - right.start || right.alias.length - left.alias.length || left.order - right.order
  )

  for (const occurrence of occurrences) {
    const candidates = orderedCandidates(occurrence.candidates)
    if (candidates.length > 1) {
      ambiguous.push({ alias: occurrence.alias, candidateIds: candidates.map(({ userId }) => userId) })
      continue
    }
    const candidate = candidates[0]
    if (
      !candidate ||
      candidate.userId === input.speakerId ||
      seenUserIds.has(candidate.userId) ||
      resolved.length >= 5
    ) {
      continue
    }
    resolved.push({
      userId: candidate.userId,
      alias: occurrence.alias,
      displayName: nameIndex.users.get(candidate.userId)?.displayName ?? candidate.userId,
      matchedBy: candidate.matchedBy
    })
    seenUserIds.add(candidate.userId)
  }

  return { resolved: resolved.slice(0, 5), ambiguous }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
