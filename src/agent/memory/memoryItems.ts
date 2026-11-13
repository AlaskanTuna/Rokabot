import type Database from 'better-sqlite3'
import { config } from '../../config.js'
import type { MediaRecallCandidate } from '../../storage/mediaDigestStore.js'
import type { MemoryEpisode } from '../../storage/memoryEpisodeStore.js'
import {
  type RecallableFactFilter,
  type RecallableFactItem,
  type WriteMemoryItem,
  listForWrite,
  listRecallable
} from '../../storage/memoryItemStore.js'
import { getAllUserNames } from '../../storage/userNames.js'
import type { GuildMemoryClaim, MemoryClaim, UserMemoryClaim } from './memoryClaims.js'
import { type RecallScope, canRecall } from './privacy.js'
import type { RetrieveForTurnInput, SubjectRetrievalSnapshot, TurnRetrievalSnapshot } from './retriever.js'

function mapFact(item: RecallableFactItem): MemoryClaim {
  const base = {
    id: item.id,
    guildId: item.guildId,
    predicate: item.predicate,
    value: item.content,
    objectKind: item.objectKind,
    objectUserId: item.objectUserId,
    sourceKind: item.sourceKind as UserMemoryClaim['sourceKind'],
    status: item.status as UserMemoryClaim['status'],
    period: item.period,
    confidence: item.confidence,
    salience: item.salience,
    pinned: item.pinned,
    needsReview: item.needsReview,
    supersededBy: null,
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
    lastRecalledAt: item.lastRecalledAt,
    expiresAt: item.validUntil,
    eventDate: item.eventDate
  }
  return item.subjectKind === 'guild'
    ? ({ ...base, subjectKind: 'guild', subjectUserId: null } as GuildMemoryClaim)
    : ({ ...base, subjectKind: 'user', subjectUserId: item.subjectUserId as string } as UserMemoryClaim)
}

export function readItemSubjectSnapshot(
  database: Database.Database,
  guildId: string,
  subjectUserId: string,
  message: string,
  scope: RecallScope
): SubjectRetrievalSnapshot {
  if (scope.guildId !== guildId) return { activeClaims: [], ftsIds: new Set() }
  const rows = listRecallable(scope, { kind: 'fact', subjectKind: 'user', subjectUserId, message }, database)
  return {
    activeClaims: rows.map((row) => mapFact(row) as UserMemoryClaim),
    ftsIds: new Set(rows.filter(({ keywordMatch }) => keywordMatch).map(({ id }) => id))
  }
}

export function readItemTurnSnapshot(
  database: Database.Database,
  input: RetrieveForTurnInput,
  userIds: string[]
): TurnRetrievalSnapshot {
  if (input.scope.guildId !== input.guildId) {
    return { activeClaims: [], ftsIds: new Set(), names: getAllUserNames() }
  }
  const rows = listRecallable(
    input.scope,
    { kind: 'fact', subjectKind: 'user', subjectUserIds: userIds, message: input.message },
    database
  )
  return {
    activeClaims: rows.map((row) => mapFact(row) as UserMemoryClaim),
    ftsIds: new Set(rows.filter(({ keywordMatch }) => keywordMatch).map(({ id }) => id)),
    names: getAllUserNames()
  }
}

export function readItemGuildFacts(
  database: Database.Database,
  guildId: string,
  now: number,
  scope: RecallScope
): GuildMemoryClaim[] {
  if (scope.guildId !== guildId) return []
  return listRecallable(scope, { kind: 'fact', subjectKind: 'guild', now }, database).map(
    (item) => mapFact(item) as GuildMemoryClaim
  )
}

export function readItemFacts(
  scope: RecallScope,
  filter: Omit<RecallableFactFilter, 'kind'>,
  database?: Database.Database
): MemoryClaim[] {
  return listRecallable(scope, { ...filter, kind: 'fact' }, database).map(mapFact)
}

export function readItemRecallableEpisodes(
  database: Database.Database,
  guildId: string,
  scope: RecallScope
): MemoryEpisode[] {
  if (scope.guildId !== guildId) return []
  return listRecallable(scope, { kind: 'episode' }, database).map((item) => ({
    id: item.id,
    guildId: item.guildId,
    channelId: item.channelId,
    startedAt: item.firstSeenAt,
    endedAt: item.lastSeenAt,
    summary: item.content,
    embedding: item.embedding,
    createdAt: item.createdAt
  }))
}

export function readItemMediaCandidates(
  database: Database.Database,
  guildId: string,
  scope: RecallScope
): MediaRecallCandidate[] {
  if (scope.guildId !== guildId) return []
  return listRecallable(scope, { kind: 'media' }, database).map((item) => ({
    id: item.id,
    label: item.label,
    summary: item.content,
    embedding: item.embedding,
    lastSharedAt: item.lastSeenAt,
    channelIds: item.channelIds
  }))
}

export function readItemNicknameClaims(
  guildId: string,
  scope: RecallScope
): Array<{ id: number; user_id: string; value: string }> {
  if (scope.guildId !== guildId) return []
  return listRecallable(scope, {
    kind: 'fact',
    subjectKind: 'user',
    predicate: 'nickname',
    period: 'current'
  }).map((item) => ({ id: item.id, user_id: item.subjectUserId as string, value: item.content }))
}

export type ForgetFactMatch = Readonly<{ kind: 'fact'; id: number; predicate: string; value: string }>
export type ForgetMediaMatch = Readonly<{ kind: 'media'; id: number; label: string; summary: string }>
export type ItemForgetCandidates = Readonly<{
  facts: readonly WriteMemoryItem[]
  media: readonly WriteMemoryItem[]
  visibleFacts: readonly ForgetFactMatch[]
  visibleMedia: readonly ForgetMediaMatch[]
}>

function canShowForgetItem(item: WriteMemoryItem, scope: RecallScope | undefined): boolean {
  const level = config.memory.privacy
  if (level === 'off') return false
  if (level === 'relaxed') return true
  if (!scope) return false
  const sources = item.sourceChannels.length > 0 ? item.sourceChannels : item.kind === 'fact' ? [null] : ['']
  return canRecall(sources, scope, level)
}

export function findItemForgetCandidates(input: {
  guildId: string
  userId: string
  ftsQuery: string
  terms: readonly string[]
  scope?: RecallScope
  limit: number
}): ItemForgetCandidates {
  if (input.guildId === 'global' || input.guildId.startsWith('dm:')) {
    return { facts: [], media: [], visibleFacts: [], visibleMedia: [] }
  }
  const facts =
    input.ftsQuery.trim().length === 0
      ? []
      : listForWrite({
          guildId: input.guildId,
          kind: 'fact',
          subjectKind: 'user',
          subjectUserId: input.userId,
          statuses: ['active'],
          ftsQuery: input.ftsQuery,
          limit: input.limit
        })
  const media =
    input.terms.length === 0
      ? []
      : listForWrite({
          guildId: input.guildId,
          kind: 'media',
          mediaUserId: input.userId,
          terms: input.terms,
          limit: input.limit
        })
  return {
    facts,
    media,
    visibleFacts: facts
      .filter((item) => canShowForgetItem(item, input.scope))
      .flatMap((item) =>
        item.predicate ? [{ kind: 'fact' as const, id: item.id, predicate: item.predicate, value: item.content }] : []
      ),
    visibleMedia: media
      .filter((item) => canShowForgetItem(item, input.scope))
      .flatMap((item) =>
        item.label ? [{ kind: 'media' as const, id: item.id, label: item.label, summary: item.content }] : []
      )
  }
}

export type ItemVaultFacts = Readonly<{
  users: readonly Readonly<{ guildId: string; userId: string; claims: readonly UserMemoryClaim[] }>[]
  guilds: readonly Readonly<{ guildId: string; claims: readonly GuildMemoryClaim[] }>[]
  episodes: readonly MemoryEpisode[]
}>

export function listItemVaultFacts(now: number): ItemVaultFacts {
  const userItems = listForWrite({ kind: 'fact', subjectKind: 'user', statuses: ['active'] })
  const guildItems = listForWrite({ kind: 'fact', subjectKind: 'guild', statuses: ['active'], needsReview: false, now })
  const episodeItems = listForWrite({ kind: 'episode', statuses: ['active'] })
  const groupedUsers = new Map<string, UserMemoryClaim[]>()
  for (const item of userItems) {
    if (!item.subjectUserId) continue
    const key = `${item.guildId}\u0000${item.subjectUserId}`
    groupedUsers.set(key, [...(groupedUsers.get(key) ?? []), mapWriteFact(item) as UserMemoryClaim])
  }
  for (const claims of groupedUsers.values()) {
    claims.sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        right.salience - left.salience ||
        right.lastSeenAt - left.lastSeenAt ||
        right.id - left.id
    )
  }
  const groupedGuilds = new Map<string, GuildMemoryClaim[]>()
  for (const item of guildItems) {
    groupedGuilds.set(item.guildId, [
      ...(groupedGuilds.get(item.guildId) ?? []),
      mapWriteFact(item) as GuildMemoryClaim
    ])
  }
  for (const claims of groupedGuilds.values()) {
    claims.sort(
      (left, right) => right.salience - left.salience || right.lastSeenAt - left.lastSeenAt || right.id - left.id
    )
  }
  return {
    users: [...groupedUsers].map(([key, claims]) => {
      const [guildId, userId] = key.split('\u0000')
      return { guildId: guildId ?? '', userId: userId ?? '', claims }
    }),
    guilds: [...groupedGuilds].map(([guildId, claims]) => ({ guildId, claims })),
    episodes: episodeItems.map((item) => ({
      id: item.id,
      guildId: item.guildId,
      channelId: item.occurrences.find(({ origin }) => origin === 'episode')?.channelId ?? '',
      startedAt: item.firstSeenAt,
      endedAt: item.lastSeenAt,
      summary: item.content,
      embedding: null,
      createdAt: item.createdAt ?? item.firstSeenAt
    }))
  }
}

function mapWriteFact(item: WriteMemoryItem): MemoryClaim {
  const base = {
    id: item.id,
    guildId: item.guildId,
    predicate: item.predicate ?? '',
    value: item.content,
    objectKind: item.objectKind,
    objectUserId: item.objectUserId,
    sourceKind: (item.sourceKind ?? 'legacy') as UserMemoryClaim['sourceKind'],
    status: item.status as UserMemoryClaim['status'],
    period: item.period,
    confidence: item.confidence ?? 0,
    salience: item.salience ?? 0,
    pinned: item.pinned,
    needsReview: item.needsReview,
    supersededBy: null,
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
    lastRecalledAt: item.lastRecalledAt,
    expiresAt: item.validUntil,
    eventDate: item.eventDate
  }
  return item.subjectKind === 'guild'
    ? ({ ...base, subjectKind: 'guild', subjectUserId: null } as GuildMemoryClaim)
    : ({ ...base, subjectKind: 'user', subjectUserId: item.subjectUserId ?? '' } as UserMemoryClaim)
}
