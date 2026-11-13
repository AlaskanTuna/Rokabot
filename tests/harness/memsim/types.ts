export type GroundTruthLabel =
  | 'new_fact'
  | 'update'
  | 'correction'
  | 'past_mention'
  | 'retraction'
  | 'multi_valued'
  | 'server_event'
  | 'private_fact'
  | 'media_share'

export interface GroundTruthItem {
  id: string
  label: GroundTruthLabel
  guildId: string
  channelId: string
  subjectUserId: string | null
  predicates: string[]
  expectedTokens: string[]
  supersededTokens?: string[]
  expectedPeriod?: 'current' | 'past'
  expectedEndReason?: 'retracted'
  expectedEventDate?: string
  mustNotLeakInPublic?: boolean
  introducedDay: number
  checkAfterDay: number
}

export interface GroundTruthFile {
  version: 1
  baseTimeMs: number
  items: GroundTruthItem[]
}

export interface SimGuildChannel {
  id: string
  name: string
  visibility: 'public' | 'private'
}

export interface SimGuild {
  id: string
  name: string
  channels: SimGuildChannel[]
}

export interface SimPersona {
  id: string
  username: string
  displayName: string
}

export interface SimMessage {
  id: string
  userId: string
  content: string
  delayMs: number
  replyToId?: string
  rokaReply?: string
  expectedRecallGtIds?: string[]
}

export interface SimEpisodeEvent {
  kind: 'episode'
  id: string
  offsetMs: number
  guildId: string | null
  channelId: string
  isDm?: boolean
  leaveOpen?: boolean
  messages: SimMessage[]
}

export interface SimMediaEvent {
  kind: 'media'
  id: string
  offsetMs: number
  guildId: string
  channelId: string
  userId: string
  messageId: string
  contentKey: string
  mediaKind: 'image' | 'video' | 'audio'
  label: string
  summary: string
  subjects: string[]
  groundTruthId?: string
}

export interface SimToolEvent {
  kind: 'tool'
  id: string
  offsetMs: number
  action: 'remember_user' | 'forget_user' | 'recall_user'
  guildId: string
  channelId: string
  userId: string
  factKey?: string
  factValue?: string
  query?: string
}

export interface SimOperatorEvent {
  kind: 'operator'
  id: string
  offsetMs: number
  action:
    | 'pin_unpin_claim'
    | 'activate_candidate'
    | 'retract_explicit'
    | 'undo_last_reclassify'
    | 'prune_overflow'
    | 'seed_overflow_facts'
    | 'reject_user_claim'
    | 'replace_guild_claim'
    | 'reject_guild_claim'
    | 'clear_saved_open_episodes'
    | 'seed_aged_throwaways'
  guildId: string
  userId: string
  channelId?: string
  factKey?: string
  factValue?: string
}

export interface SimRestartEvent {
  kind: 'restart'
  id: string
  offsetMs: number
  mode: 'crash' | 'graceful'
  simulateStuckProcessing?: boolean
}

export type SimDayEvent = SimEpisodeEvent | SimMediaEvent | SimToolEvent | SimOperatorEvent | SimRestartEvent

export interface SimDay {
  day: number
  events: SimDayEvent[]
}

export interface SimScenario {
  version: 1
  baseTimeMs: number
  botUserId: string
  botDisplayName: string
  guilds: SimGuild[]
  dmChannels: Array<{ id: string; userId: string }>
  personas: SimPersona[]
  days: SimDay[]
}

export interface BuilderTimingStats {
  count: number
  p50Ms: number
  p95Ms: number
  maxMs: number
}

export type GateStatus = 'passed' | 'failed' | 'skipped'

export interface LabelQualityMetrics {
  label: GroundTruthLabel
  planted: number
  matched: number
  falsePositives: number
  recall: number
  precision: number
  turnExpected: number
  turnRecalled: number
  turnRecall: number
  turnMentioned: number
  turnClean: number
  turnPrecision: number
}

export interface RestartCheckResult {
  id: string
  mode: 'crash' | 'graceful'
  openLinesBefore: number
  restoredLines: number
  flushedLines: number
  remainingLinesAfterFlush: number
  stuckReset: number
  stuckJobsCompleted: number
  passed: boolean
}

export interface MemsimReport {
  version: 1
  mode: 'record' | 'replay'
  store: 'legacy' | 'dual' | 'item'
  privacy: 'relaxed' | 'balanced' | 'strict' | 'off'
  seeded: boolean
  daysSimulated: number
  dropLegacyAtDay: number | null
  providerCalls: {
    river: { hits: number; live: number; total: number; budget: number }
    embeddings: { hits: number; live: number; total: number; budget: number }
    typesafe: { hits: number; live: number; total: number; budget: number }
  }
  integrity: {
    status: GateStatus
    skipReason?: string
    dailyDrifts: Array<{ day: number; fact: number; episode: number; media: number }>
    firstEventDrift?: { eventId: string; day: number; fact: number; episode: number; media: number }
    finalDrift: { fact: number; episode: number; media: number }
    passed: boolean
  }
  triggerCoverage: {
    status: GateStatus
    skipReason?: string
    expectedWriters: string[]
    firedPipeline: string[]
    firedScripted: string[]
    firedAll: string[]
    missing: string[]
    passed: boolean
  }
  phase4Parity: {
    status: GateStatus
    skipReason?: string
    turnsChecked: number
    mismatches: number
    passed: boolean
  }
  privacyGate: {
    status: GateStatus
    skipReason?: string
    publicTurnsChecked: number
    dmTurnsChecked: number
    privateOnlyItemsCount: number
    privateTokensLeaked: number
    dmMemoryBlockLeaks: number
    passed: boolean
  }
  crashSafety: {
    status: GateStatus
    skipReason?: string
    restartsTotal: number
    crashRestarts: number
    gracefulRestarts: number
    openLinesBeforeRestart: number
    openLinesRestored: number
    openLinesFlushed: number
    stuckResetTotal: number
    perRestart: RestartCheckResult[]
    passed: boolean
  }
  quality: {
    overallPlanted: number
    overallMatched: number
    overallFalsePositives: number
    overallRecall: number
    overallPrecision: number
    byLabel: LabelQualityMetrics[]
  }
  performance: {
    turnCount: number
    builders: {
      legacy: Record<'userFacts' | 'guildFacts' | 'episodes' | 'media' | 'recallUser', BuilderTimingStats>
      item: Record<'userFacts' | 'guildFacts' | 'episodes' | 'media' | 'recallUser', BuilderTimingStats>
    }
    scale10k?: {
      targetItems: number
      actualItems: number
      legacy: Record<'userFacts' | 'guildFacts' | 'episodes' | 'media' | 'recallUser', BuilderTimingStats>
      item: Record<'userFacts' | 'guildFacts' | 'episodes' | 'media' | 'recallUser', BuilderTimingStats>
    }
  }
  counts: {
    messagesProcessed: number
    episodesExtracted: number
    activeUserClaims: number
    pastUserClaims: number
    rejectedUserClaims: number
    retractedUserClaims: number
    activeGuildClaims: number
    episodesStored: number
    mediaDigestsStored: number
  }
  gatesPassed: boolean
  failures: string[]
}
