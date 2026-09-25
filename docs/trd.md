# Technical Requirements Document — Rokabot

> References: [`PRD`](./prd.md) for product requirements.

---

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                  Discord Server                  │
│  User sends /ask or @Roka                        │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│              Discord Gateway Layer                │
│  discord.js v14 client                            │
│  - Slash command handler (/ask)                   │
│  - Message handler (mention/reply detection)      │
│  - Rate limit guard (windowed RPM + daily RPD)    │
│  - Concurrency guard (1 active req per channel)   │
│  - Typing indicator management                    │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│          WindowedSessionService (ADK)              │
│  Per-channel ADK sessions                          │
│  - FIFO window bounded by `session.windowSize`     │
│  - Idle TTL bounded by `session.ttl`               │
│  - Rehydrates retained session history from SQLite │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│              Roka Agent (ADK)                     │
│  - 4-layer prompt system                          │
│  - Rule-based tone detector                       │
│  - Prompt assembler                               │
│  - gemini-3.5-flash-lite backend                  │
│  - Future: ADK tool integrations                  │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│              Gemini API                           │
│  gemini-3.5-flash-lite                            │
│  15 RPM │ 250K TPM │ 500 RPD                     │
└─────────────────────────────────────────────────┘
```

SQLite (`better-sqlite3`) is the canonical store for durable bot state. `session_history` is rehydrated into the
ADK window up to `session.windowSize`, while `session.historyRetentionDays` governs history pruning. The in-memory
per-channel window is a hot cache, not the source of truth, so a bot restart does not erase retained history or other
durable state.

### Core Code Modules

| Module                                | Responsibility                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/discord/events/messageCreate.ts` | Detect triggers, admit turns, reserve rate and byte budgets, and send replies.                                             |
| `src/discord/messageContent.ts`       | Convert messages, embeds, polls, stickers, forwards, Components V2, and reply context into prompt content and attachments. |
| `src/agent/roka.ts`                   | Configure the ADK agent and runner, then orchestrate `generateResponse`.                                                   |
| `src/agent/turnContext.ts`            | Assemble session, tone, Jev, identity, retrieval, and prompt context for each turn.                                        |
| `src/agent/attachments.ts`            | Download and measure media, prepare model parts, and provide attachment markers.                                           |
| `src/agent/reliability.ts`            | Run retry and fallback orchestration and register the error recovery plugin.                                               |
| `src/agent/session.ts`                | Own the ADK session service and session lifecycle.                                                                         |

### Persistence & Storage

| SQLite Table                                              | Contents                                                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_history`                                         | Channel messages, including message role, display name, content, timestamp, and optional user identity fields.                                                                              |
| `memory_claim`, `memory_evidence`, `memory_claim_fts`     | User-subject claims, their evidence, and the FTS5 mirror of active claims.                                                                                                                  |
| `memory_episode_cursor`                                   | Per-channel episode checkpoint: tenant, last message ID, open time, and delta-message count.                                                                                                |
| `extraction_queue`                                        | Closed episode payloads, with `pending`, `processing`, or retained `failed` status and attempt count.                                                                                       |
| `memory_events`                                           | Value-free retrieval and claim-change telemetry.                                                                                                                                            |
| `jev_events`                                              | TypeSafe judgment kind, question key, answer, probability/confidence, applied flag, latency, input tokens, optional baseline, and timestamp.                                                |
| `reminders`                                               | Scheduled user reminders and delivery state.                                                                                                                                                |
| `game_scores`, `gacha_collection`, `gacha_daily`, `buddy` | Game scores and gacha/companion data.                                                                                                                                                       |
| `user_names`, `monitored_channels`                        | Durable user identity lookup and passive-monitoring state.                                                                                                                                  |
| `response_events`, `extraction_events`                    | Response telemetry and retained historical extraction telemetry. `response_events.failure_marker` stores the raw `finishReason`/`errorCode` token only (e.g. `SAFETY`), never message text. |

## Technology Stack

### Runtime

| Component       | Technology | Version | Notes                         |
| --------------- | ---------- | ------- | ----------------------------- |
| Language        | TypeScript | ^5.8    | ES2022 target, Node16 modules |
| Runtime         | Node.js    | 24      | Alpine-based, ARM64 for RPi 5 |
| Package Manager | npm        | bundled | Lockfile committed            |

### Discord

| Component | Technology                            | Version | Notes                                                     |
| --------- | ------------------------------------- | ------- | --------------------------------------------------------- |
| SDK       | discord.js                            | ^14.18  | Gateway + REST                                            |
| Intents   | Guilds, GuildMessages, MessageContent | —       | MessageContent is privileged (auto-approved <100 servers) |
| Partials  | Channel, Message                      | —       | Required for reply detection                              |

### AI / Agent

| Component       | Technology            | Version | Notes                                                    |
| --------------- | --------------------- | ------- | -------------------------------------------------------- |
| Agent Framework | @google/adk           | ^0.1    | TypeScript ADK; fallback to @google/genai if unavailable |
| LLM Client      | @google/genai         | ^1.0    | Gemini API client (ADK dependency)                       |
| Model           | gemini-3.5-flash-lite | —       | 1M context, 15 RPM / 250K TPM / 500 RPD                  |

### Utilities

| Component  | Technology | Version | Notes                               |
| ---------- | ---------- | ------- | ----------------------------------- |
| Logging    | pino       | ^9.6    | Structured JSON; pino-pretty in dev |
| Env Vars   | dotenv     | ^16.5   | Loaded at startup                   |
| Dev Runner | tsx        | ^4.19   | Watch mode for development          |

### Testing

| Component   | Technology | Version  | Notes                              |
| ----------- | ---------- | -------- | ---------------------------------- |
| Test Runner | vitest     | ^3.1     | TypeScript-native, globals enabled |
| Coverage    | v8         | built-in | Via vitest coverage provider       |

### Deployment

| Component        | Technology           | Notes                       |
| ---------------- | -------------------- | --------------------------- |
| Containerization | Docker               | Multi-stage build           |
| Orchestration    | Docker Compose       | Single service (expandable) |
| Base Image       | node:24-alpine       | ARM64 native, ~150MB image  |
| Target Hardware  | Raspberry Pi 5 (8GB) | mem_limit: 512MB            |

## Data Models

### WindowMessage

Represents a text message projected from an ADK session event for tone detection.

| Field         | Type                    | Description                                   |
| ------------- | ----------------------- | --------------------------------------------- |
| `role`        | `'user' \| 'assistant'` | Who sent the message                          |
| `displayName` | `string`                | Discord display name of the sender            |
| `content`     | `string`                | Message text content                          |
| `timestamp`   | `number`                | Unix timestamp (ms) when message was received |

### RateLimiterConfig

Configuration for the dual rate limiter.

| Field | Type     | Default | Description                                      |
| ----- | -------- | ------- | ------------------------------------------------ |
| `rpm` | `number` | `15`    | Max **requests** admitted in any rolling minute  |
| `rpd` | `number` | `500`   | Max **turns** per day (daily counter, see below) |

### AssemblerInput

Input to the prompt assembler for building the system prompt.

| Field          | Type       | Description                                      |
| -------------- | ---------- | ------------------------------------------------ |
| `tone`         | `ToneKey`  | Detected conversation tone                       |
| `participants` | `string[]` | Display names of recent participants             |
| `hour`         | `number`   | Current hour (0-23) for time-of-day context      |
| `displayName`  | `string`   | Display name of the current user being addressed |

### ToneKey

Enum of detected conversation tones.

| Value           | Trigger                                            | Layer 2 Effect                           |
| --------------- | -------------------------------------------------- | ---------------------------------------- |
| `'playful'`     | Default / no match                                 | Teasing, big-sister energy               |
| `'sincere'`     | Emotional/supportive keywords                      | Genuine, reflective                      |
| `'domestic'`    | Food/daily life keywords                           | Cozy, food-centered care                 |
| `'flustered'`   | Romantic/flirty keywords                           | Stammering, composure breaking           |
| `'curious'`     | Questions/learning/analysis                        | Engaged, enthusiastic, explanatory       |
| `'annoyed'`     | Defiance/recklessness/teasing her                  | Pouty exasperation, "mou~" energy        |
| `'tender'`      | Vulnerability/worry/quiet softness                 | Guard down, warm vulnerability           |
| `'confident'`   | Help/advice/trust keywords                         | Cool, composed onee-san authority        |
| `'nostalgic'`   | Memory/reminiscing keywords                        | Wistful, trailing-off reflection         |
| `'mischievous'` | Scheming/dare/prank keywords                       | Conspiratorial, gleeful plotting         |
| `'sleepy'`      | Tiredness keywords (or 1 match during 22:00-04:00) | Drowsy, guard-down, sentences dissolving |
| `'competitive'` | Game/rivalry/challenge keywords                    | Fired-up, affectionate trash-talk        |

`detectTone` is first-match-wins over `TONE_PATTERNS`' declaration order in `src/agent/toneDetector.ts`, not
the row order above. A trigger listed against a later tone is unreachable whenever an earlier tone matches the same
text. Behavioral precedence is pinned by `src/agent/__tests__/toneDetector.test.ts`.
It reads the current message plus the two session messages before it, so the tone answers the message being
replied to rather than only the history.

## Memory Architecture

The shipped memory write path extracts user-subject claims and guild-subject facts from monitored guild-channel
episodes and stores them in SQLite. `guild_id` is the Discord server scope. Guild facts are restricted to servers; DMs
and `/ask` neither read nor write memory. Guild-scoped episode summaries are stored separately and are not claims.

### Storage Schema

| Table                   | Columns                                                                                                                                                                                                                                                                                                        | Contract                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `memory_claim`          | `id`, `guild_id`, `subject_kind`, nullable `subject_user_id`, `predicate`, `value`, `object_kind`, `object_user_id`, `source_kind`, `status`, `confidence`, `salience`, `pinned`, `needs_review`, `superseded_by`, `expires_at`, `first_seen_at`, `last_seen_at`, `last_recalled_at`, `ended_at`, `end_reason` | User and guild claims. User rows require a user ID; guild rows require NULL. Separate partial indexes deduplicate each subject scope. |
| `memory_evidence`       | `id`, `claim_id`, `channel_id`, `source_kind`, `observed_at`                                                                                                                                                                                                                                                   | Evidence observations attached to claims.                                                                                             |
| `memory_claim_fts`      | `value`, `predicate`                                                                                                                                                                                                                                                                                           | FTS5 mirror of active claims, maintained by insert, update, and delete triggers.                                                      |
| `memory_episode_cursor` | `channel_id`, `guild_id`, `last_message_id`, `opened_at`, `message_count`                                                                                                                                                                                                                                      | Per-channel checkpoint for the open episode.                                                                                          |
| `extraction_queue`      | `id`, `guild_id`, `channel_id`, `payload`, `status`, `attempts`, `enqueued_at`                                                                                                                                                                                                                                 | Closed episode payloads in `pending`, `processing`, or retained `failed` state.                                                       |
| `memory_episode`        | `id`, `guild_id`, `channel_id`, `started_at`, `ended_at`, `summary`, `embedding`, `created_at`                                                                                                                                                                                                                 | One completed episode summary per queue ID; nullable 768-value float32 embedding.                                                     |
| `memory_events`         | `id`, `kind`, `guild_id`, `channel_id`, `subject_user_id`, `duration_ms`, `n_candidates`, `n_selected`, `n_changed`, `tokens_est`, `op`, `created_at`                                                                                                                                                          | Value-free retrieval and claim-change telemetry.                                                                                      |
| `jev_events`            | `kind`, `guild_id`, `channel_id`, `question`, `answer`, `probability`, `confidence`, `applied`, `latency_ms`, `input_tokens`, `baseline`, `created_at`                                                                                                                                                         | Value-free Jev judgment telemetry. The kind is `turn`, `admission`, or `verification`; `baseline` is optional.                        |

The `extraction_queue` payload contains the episode's delta messages, up to three preceding context lines, and start
and end timestamps. It is user content and remains in a failed queue row for inspection; success deletes the queue
row. `jev_events` stores question keys and judgment results, not episode or message text.

### Episode Capture And Write Path

In monitored guild channels, `episodeTracker` stores delta messages in the channel buffer and updates
`memory_episode_cursor`. Silence for `memory.episodeLullMs` (180 seconds) or reaching
`memory.episodeMaxMessages` (25 deltas) closes an episode. The queue insert and cursor advance share one SQLite
transaction. Startup converts legacy queue payloads into the episode shape while preserving every queue row and its
status, including `failed`; processing rows older than five minutes return to `pending`.

The per-guild round-robin scheduler runs at most one job per guild at a time. A failure is retried once; after the
second failed attempt the job remains `failed` in `extraction_queue`. There is no per-guild delay, queue-size setting,
Gemini daily budget ratio, or separate extraction RPM floor. Memory work is asynchronous and does not block the reply
that captured the messages.

The pipeline is **local precheck → Jev admission → Gemini typed extraction → Jev verification → claim writes**.
Sensitive or wholly trivial episodes are dropped locally. Other episodes require a successful Jev `lasting_fact`
judgment with probability at least `memory.admitThreshold` (0.5); if Jev is unavailable, times out, or returns no
usable answer, the episode is dropped without a Gemini extraction request. `TYPESAFE_API_KEY` is therefore required
for passive memory, and startup warns once when it is absent.

Gemini uses `gemini.extractionModel` (defaulting to `gemini.model`) and returns a strict operation list plus a
one-to-two-sentence summary. The summary is persisted in `memory_episode` with the extraction queue ID as its
idempotency key; its document embedding is stored in the same row when the embedding call succeeds. Operations can
target a user subject `{ kind: 'user', userId }` or the current guild subject `{ kind: 'guild' }`:

- **Add:** insert an active claim for a user or a guild and predicate.
- **Update:** replace an existing claim for the same subject and predicate, linking the old row through `superseded_by`.
- **Remove:** reject an existing active claim for the same subject without deleting its row.
- **Noop:** make no claim change.

The extraction prompt asks Gemini to emit `add` with the same subject, predicate, and exact value when a member
restates a current durable fact. It never adds a rewording and returns `noop` only when no durable fact came up.

Guild predicates are `upcoming_event`, `plan`, `running_joke`, `place`, `rule`, and `announcement`. All claims pass
through `privacyGuard.ts`. `upcoming_event` and `plan` require resolvable date components; other guild predicates have
no expiry. Dates accept a complete `year`/`month`/`day`, a `month`/`day` for the next future occurrence, `today` or
`tomorrow`, or `this_week`/`next_week` paired with a weekday. A supplied weekday must agree with the resolved date.
Gemini's response schema requires a `month` and `day` on a calendar date, so a stated day cannot be dropped, and asks
for the `year` only when the messages state it. Missing, impossible, past, or contradictory dates are rejected rather
than guessed. Resolution uses the current date
in `config.timezone` (including the existing `TZ` override); expiry is the first instant of the following local day,
stored as epoch milliseconds in `expires_at`.

Jev verifies durability for every write operation and verifies attribution for user subjects with `attributed_N` or
shared guild scope with `guild_scoped_N`. Adds are checked against same-subject, same-predicate claims with
`same_as_N_M`. After durability and attribution pass, an exact active value appends evidence even when its
`same_as_N_M` answer is below `memory.verifyThreshold` (0.5); other semantic duplicate answers must meet that
threshold. An add with incomplete verification does not refresh an active duplicate. If verification is incomplete,
remove operations are not applied and permitted new add/update operations are marked `needs_review`. Sensitive
operations are always rejected. For single-cardinality predicates, a successful replacement supersedes the prior
active claim. Capacity eviction, explicit removal, retention pruning, and the daily guild-expiry prune end claims
with a reason and timestamp. Evidence and dead claim rows remain until the dead-row retention period expires.

Completed admission judgments write one `jev_events` row with `kind='admission'` and question `lasting_fact`.
Completed verification writes one row per answer key (`durable_N`, `attributed_N`, `guild_scoped_N`, or `same_as_N_M`).
These rows include the answer, probability, application outcome, latency, and input-token count, but no source message text.
`jev.memoryTimeoutMs` (5000 ms) bounds admission and verification calls.

### Claim Lifecycle And Retention

Claim statuses are `candidate`, `active`, `superseded`, and `rejected`. Episode operations write active claims directly;
single-cardinality updates move prior active claims to `superseded`, while removals, capacity eviction, and retention
pruning move claims to `rejected`. Every transition out of `candidate` or `active` sets `ended_at` and `end_reason`:
`expired`, `evicted`, `superseded`, `removed`, `forgotten`, or `self`. Older rows upgraded by migration receive the
migration time in `ended_at` and a NULL reason. Startup migration also raises active claims' `last_seen_at` to their
newest evidence time.

- `first_seen_at` records the first observation.
- `last_seen_at` records the newest observation, advances only forward, and drives expiry.
- `last_recalled_at` changes only when the retriever selects a claim for the prompt.

An assertion revives a rejected or superseded value in its existing row, clears `superseded_by`, `ended_at`, and
`end_reason`, refreshes evidence, then applies single-value supersession and the active-claim cap. A passive assertion
cannot revive a value ended with `forgotten`; an explicit `remember_user` assertion can revive it and pins it. Guild
facts revive the same way and receive the newly resolved `expires_at`. A value can only revive in the same row while
that row remains retained.

The retention job expires unpinned candidate and active user claims from `last_seen_at` by predicate tier: stable
identity and social claims at `memory.stableClaimRetentionDays` (180 days), standard lifestyle, interests, and
personality claims at `memory.claimRetentionDays` (30 days), and transient opinions, misc, and `currently_watching`
claims at `memory.transientClaimRetentionDays` (14 days). Pinned claims are exempt. Guild claims keep their
date-based expiry and are not subject to these tiers. `memory.maxActiveClaimsPerUser` (20) limits active user claims
per subject, evicting the least salient unpinned claims first. Explicitly remembered claims are pinned.

Each startup and daily prune hard-deletes `rejected` and `superseded` claims whose `ended_at` is strictly older than
`memory.deadClaimRetentionDays` (30 days), along with their evidence. Candidate rows are not purged. The vault export,
statistics, recall commands, and `forget_user` operate on active claims; the name resolver also treats any claim row as
a guild-presence hint until it is purged. A dead-only user may therefore leave the resolver's member index after the
dead row is deleted unless response events still establish guild presence.
The daily episode retention pass deletes `memory_episode` rows with `ended_at` strictly older than
`memory.episodeRetentionDays` (90 days) and re-embeds retained rows with missing or unreadable vectors.

### Bounded Retrieval Contract

Retrieval is tenant-scoped and bounded to at most `memory.maxClaimsPerTurn` (10) claims and approximately
`memory.retrievalTokenBudget` (350) tokens. It reserves up to `memory.speakerMinShare` (0.5) of the selected slots
for speaker anchors; anchors are considered before every other candidate and are never displaced by general
selection. It considers at most `memory.recentParticipantLimit` (3) non-speaker participants and may expand one hop
through an active `relationship_to` claim to an included participant.

On memory-enabled guild turns, `turnContext.ts` separately retrieves active, unexpired, same-guild facts that do not
need review and appends a server-memory block under the independent `memory.guildFactsTokenBudget` (150) token
budget. `/ask` has no user or server memory block. `forget_user` searches and rejects only user-subject claims.
`/stats` includes active unexpired guild facts in memory totals and growth, while remembered-member metrics remain
user-only. The vault export writes active unexpired guild facts to `<vault>/<guildId>/guild.md`, including `expires_at`
when set; member notes retain their user-only shape.

Candidate score is `salience × sourceWeight × 2 + confidence + recency × 0.5`, plus the pin, FTS, and topic-route
bonuses. At scoring time only, salience is multiplied by `0.5 ^ (ageDays / memory.salienceHalfLifeDays)`; stored
salience is unchanged. A claim recalled within `memory.recallCooldownMs` loses 0.75 points unless FTS or topic
routing matched it for the current message. Speaker anchors use the same final score. `retrieveForSubject`, including
`recall_user`, shares this scorer.

Before selection, `resolveReferences` (`src/agent/memory/identityResolver.ts`) finds the members the message is
about: Discord mentions, then guild-scoped display names, usernames and active `nickname` claims found in the text
(names under 3 characters are ignored). A name that maps to one member resolves; a name that maps to several stays
ambiguous and is never guessed. Resolved members take the participant slots first, ahead of recent speakers, and a
member named by a nickname or username gets a `## Who Is Mentioned` line mapping the alias to their display name.
`recall_user` uses the same lookup and asks which member is meant when a name is ambiguous.

`forget_user` searches the current speaker's active claims using AND semantics across up to six query keywords. It
rejects one to three matches and returns up to four matching values when clarification is needed. It does not accept a
target member ID or name, and its responses replace values that `privacyGuard.ts` marks sensitive with a generic label.

Retrieval runs once in `src/agent/turnContext.ts` while assembling `_systemPrompt`. `beforeModelCallback` reads only
that already-assembled state to assign the system instruction; it never triggers retrieval or reads the database.
Selected claims use the shared `buildFactsEnvelope` untrusted-data envelope.

### Episodic Recall

Completed episode summaries are embedded with `memory.embeddingModel` (`gemini-embedding-2`) at 768 dimensions and
stored as 3072-byte little-endian float32 BLOBs in `memory_episode.embedding`. Document input is prefixed with
`title: none | text: `; query input is prefixed with `task: search result | query: `. The role prefixes are required
by `gemini-embedding-2`; requests set `outputDimensionality: 768` and omit `taskType`. The embedding client uses
`GEMINI_API_KEY` and `memory.embeddingTimeoutMs` (1500 ms). A failed summary embedding leaves a null vector for
maintenance to repair.

Message handlers start the query embedding inside `TurnEntryWork` at the same point as Jev entry work. Only guild
message turns request it; `/ask` and DMs do not. Recall reads episodes with `WHERE guild_id = ?` and computes cosine
similarity in JavaScript. Results must score strictly above `memory.episodeMinSimilarity` (0.45), are ordered by score,
then `ended_at` descending and ID ascending, and are limited by `memory.episodeRecallK` (3) and the rendered
`memory.episodeTokenBudget` (200). The prompt uses the UTC end date and JSON-escaped summaries under an explicit
untrusted-data heading. If query embedding or retrieval fails or reaches its timeout, context assembly continues
without episode context.

The daily maintenance pass deletes rows whose `ended_at` is older than `memory.episodeRetentionDays` (90 days), then
visits each guild's null or unreadable embeddings sequentially and retries document embedding. A failed row remains
available for a later pass. `/stats` reports the number of episodes ended in the last 30 days, and the vault export
writes guild-local `Episodes.md` files without embedding bytes.

### Explicit Legacy Migration

`npm run migrate:memory-v2` is an explicit offline command; startup never drops `user_memory` or invokes the migration.
If the legacy marker is absent, the command attempts the one-time backfill and infers legal scopes for old `global`
rows only from recorded guild or channel evidence. It then verifies every old row against its normalized claim in every
attested scope. Any row without a legal scope or a matching claim aborts the command and leaves `user_memory` intact.
On success, the report shows legacy-row count and the top ten active claims per subject before and after the shared
overflow eviction, then the command drops `user_memory`. Eviction changes claim status; it never deletes claims. A
second run after success is an empty, safe no-op.

### Replay Baseline

The offline `npm run memory:replay -- --session-history <database>` command uses stub admission, extraction, and
verification adapters and makes no network calls. The captured PR 3 replay processed 122 rows (20 transcript, 102
snapshot), with 0 unmapped and 0 ambiguous snapshot rows; it segmented 37 episodes, admitted 37, dropped 0, and
produced 0 operations because the offline extractor stub returns an empty operation list. It made 0 network calls and
recorded 0 model latency or token estimates.

The combined transcript and snapshot inter-message gap distribution had 106 samples, 22 zero-gap ties, and 84
positive gaps. The positive-gap percentiles were p50 23.4 s, p75 236.8 s, p90 25,867.6 s, p95 70,514.2 s, and p99
218,938.9 s. The snapshot-only distribution had 98 samples, 22 ties, and 76 positive gaps; positive-gap percentiles
were p50 19.1 s, p75 933.4 s, p90 30,852.8 s, p95 71,515.0 s, and p99 231,320.6 s. Percentiles use linear
interpolation and exclude zero-gap ties; ties remain in `sampleCount`.

### Vault Export Technical Contract

`exportVault()` and `npm run export:vault` are read-only, offline export paths. They write one note per
(`guild_id`, `subject_user_id`), with YAML frontmatter grouped by predicate and `relationship_to` facts rendered as
`[[wikilinks]]`, plus one guild-local `Episodes.md` for stored episode summaries. For each guild with eligible claims,
they also write `<exportDir>/<guildId>/guild.md` with YAML frontmatter grouped by guild predicate and `expires_at` for
dated facts. Expired, rejected, and `needs_review` guild claims are omitted. Episode dates and time ranges use UTC; each
summary is a JSON-encoded blockquote payload, and embeddings are omitted. `dm:` claim scopes remain isolated in their own
export paths. A containment guard based on `path.relative` and `path.isAbsolute` rejects every note path outside the
export directory. Export performs no store writes and no network requests.

### Deferred Items

- `sqlite-vec` semantic retrieval.
- An ADK `globalInstruction` spike.
- Two-way Obsidian vault synchronization; the current export is one-way and read-only.

## Jev Judgments

Jev (TypeSafe's typed decision model, `@typesafe-ai/sdk`) answers pick-from-a-list questions; Gemini generates every
reply, tool call and memory operation. The client (`src/agent/jev/client.ts`) exists only when `TYPESAFE_API_KEY` is
set, is pinned to `jev.model` (`jev-1.13.0`), and makes one attempt with no retries. Message and `/ask` handlers
start one `TurnEntryWork` before reply fetching, deferral or ADK session loading. Generation receives that same handle
and waits only when an enabled feature is `on`; `shadow` observes it asynchronously. A declined turn aborts the work,
and failures keep the rule-based decision.

In-reply tone, referent and lookup judgments use `jev.tone`, `jev.referents` and `jev.prefetch`, each with `off`,
`shadow` or `on` mode. Tone and referents can be overridden by `JEV_TONE` and `JEV_REFERENTS`; prefetch can be
controlled with `JEV_PREFETCH`:

| Mode     | Behaviour                                                            |
| -------- | -------------------------------------------------------------------- |
| `off`    | The feature adds no Jev decision                                     |
| `shadow` | The decision is observed without applying it; turn judgments persist |
| `on`     | The decision may be used when its feature-specific threshold passes  |

- **Turn Judgment:** at most one `judgeTurn` request per turn, carrying a tone `choice` over the 12 `ToneKey`s and a
  referent `choice` for each name `resolveReferences` found ambiguous (at most 3 names, 8 candidates each, plus
  `none`/`unclear`). It receives at most three prior lines from `session_history` and is bounded by `jev.timeoutMs`
  (1200 ms). An `on` tone uses selected-choice probability threshold `jev.toneMinProbability`; a missing probability
  keeps the rule tone. An `on` referent uses `jev.referentMinConfidence` and joins the retrieval participants after
  the resolver's members, with a `## Who Is Mentioned` line. The safety rung-3 `sincere` prompt overrides any tone.
- **Lookup Judgment:** when `jev.prefetch` is not `off`, the same request includes a `needs_lookup` `noul` asking
  whether the message needs a specific, niche, recent or real-world fact. It is returned as `TurnJudgment.needsLookup`;
  a missing, malformed or out-of-range answer becomes `null`. This adds no second Jev request. The lookup query uses
  the mention-stripped message text before reply, container, embed, poll or forwarded-content wrappers are added.
- **Turn Events:** each non-null turn judgment writes one `kind = 'turn'` row to `jev_events` with the rule baseline,
  decision labels, probability, confidence, whether tone was applied, rounded latency and input tokens. The `question`
  JSON records the `prefetch` mode; the `answer` JSON records `needsLookup` and `prefetchStatus`. It stores no message
  text, alias or user ID. `metrics.retentionDays` prunes these rows with the other metrics tables.
- **Memory Admission And Verification:** Jev is a hard dependency for passive memory. After the local sensitive/trivial
  precheck, admission asks whether an episode contains a lasting fact and requires `memory.admitThreshold` (0.5).
  Verification checks operation durability and attribution against `memory.verifyThreshold` (0.5), and checks additions
  against same-predicate claims. Both are bounded by `jev.memoryTimeoutMs` (5000 ms). A missing key, timeout, or unusable
  admission answer drops the episode before Gemini extraction; incomplete verification blocks removals and marks
  allowed additions or updates for review.
- **Replay Comparator:** `npm run replay:jev -- data/rokabot.db --max-turns 100` compares Jev tone labels with the
  regex tone on retained history and transcript fixtures, including CJK turns. Regex agreement is a tuning comparator,
  not ground-truth accuracy; the cutoff support rule also checks CJK agreement before tone can turn on.
- **Event Recording:** admission and verification judgments are recorded in `jev_events` with question key, answer,
  probability, confidence, `applied`, latency and input-token count. Source messages are not stored in this table.
  `memory.admitThreshold` and `memory.verifyThreshold` are the memory thresholds; there is no Jev extraction mode.

### Search Prefetch

`jev.prefetch` defaults to `shadow`. `off` omits the lookup question; `shadow` asks it and records whether it crossed
the threshold without searching; `on` starts a Tavily search when `needsLookup` is at least `jev.prefetchMinNoul`.
The default threshold is `0.7`, and the maximum wait before the first model request proceeds without results is
`jev.prefetchWaitMs` (4000 ms).

The message handler starts `TurnEntryWork` before reply fetching and session loading. Once the shared Jev judgment clears
the threshold in `on` mode, it starts at most one automatic prefetch using the original mention-stripped message text
(or the `/ask` question). That search can run while session and memory context are prepared. It does not reserve a
Gemini RPM slot. Rejected turns cancel the shared work; if a Tavily request is already in flight, the abort signal is
passed through to its fetch.

A successful result is injected into the first model system prompt in a `## Looked It Up` block, capped at 2000
characters. The existing lookup-answer instructions in `src/agent/prompts/core.ts` apply, including the direction to
call `search_web` again if the results are thin or off-topic. The normal search citation footer uses the prefetched
URLs; a later model-issued search replaces that citation list. A prefetched result counts `search_web` in `toolsUsed`,
once even if Gemini also calls the tool. The tool remains registered in all modes. Empty, failed, aborted, canceled or
timed-out prefetches add no prompt block, and the turn answers normally. The safety ladder drops the prefetch block
after its first rung.

The derivation, measured latency and rollout plan are in `docs/research/jev-integration.md`.

## API Contracts

### Discord Events (Inbound)

#### InteractionCreate (Slash Command)

```
Event: interactionCreate
Filter: isChatInputCommand() && commandName === 'ask'
Extract: interaction.options.getString('question'), channelId, user.displayName
Flow: start turn work → deferReply() → process → editReply(response)
```

#### MessageCreate (Mention/Reply)

```
Event: messageCreate
Filter: !author.bot && (isMentioned || isReplyToBot)
Extract: content (stripped of mention tags), channelId, member.displayName
Flow: start turn work and sendTyping() without waiting → fetch reply context → process → message.reply(response)
```

#### Installation & Context Policy

Commands are registered globally (`src/discord/events/ready.ts`). Each command carries an explicit installation
context (`GuildInstall`/`UserInstall`) and interaction context (`Guild`/`BotDM`/`PrivateChannel`) set on its builder;
the whole policy is pinned by `src/discord/commands/__tests__/registration.test.ts`, which is the authoritative
list. A user-install context delivers interactions only, with no gateway message stream, so there is no
mention/reply trigger and no passive extraction there; that absence is pinned by
`src/discord/__tests__/client.test.ts`.

### Gemini API (Outbound)

#### GenerateContent

```
Model: gemini-3.5-flash-lite
System Instruction: assembleSystemPrompt(tone, participants, hour)
Contents: [
  ...history.map(m => ({ role: m.role, parts: [{ text: `[${m.displayName}]: ${m.content}` }] })),
  { role: 'user', parts: [{ text: `[${displayName}]: ${userMessage}` }] }
]
Safety Settings: HARM_CATEGORY_HARASSMENT, HARM_CATEGORY_HATE_SPEECH, HARM_CATEGORY_SEXUALLY_EXPLICIT,
                 HARM_CATEGORY_DANGEROUS_CONTENT — all set to `gemini.safetyThreshold` (default `OFF`)
```

**Token budget per request:**

- The system prompt (the four layers assembled by `assembleSystemPrompt` in `src/agent/promptAssembler.ts`) is size-capped and enforced: `MAX_SYSTEM_PROMPT_TOKENS` in `tests/harness/tokens.ts`, checked by `tests/harness/__tests__/tokens.test.ts`. The cap exists as a change-detection gate, not a latency budget.
- `src/agent/turnContext.ts` assembles session history, recalled facts, overheard channel messages, identity context, and the system prompt; `src/agent/roka.ts` adds tool declarations and the current user message before sending the request.
- Some components carry their own bounds elsewhere in the code (e.g. `config.memory.retrievalTokenBudget`, `config.session.windowSize`, `config.memory.contextSize`) — read `assembleSystemPrompt` and `createTurnContext` for what each request contains and how its prompt context is sized.

**Rate limits:**

- 15 RPM (binding constraint)
- 250K TPM (not the binding constraint — RPM caps request volume well before the token ceiling)
- 500 RPD (~20 req/hr sustained)

## Deployment Pipeline

### Docker Build (Multi-Stage)

```
Stage 1: build
  ├── FROM node:24-alpine
  ├── COPY package.json + lockfile
  ├── npm ci (all deps)
  ├── COPY src/ + tsconfig.json
  └── npm run build (tsc → dist/)

Stage 2: runtime
  ├── FROM node:24-alpine
  ├── COPY package.json + lockfile
  ├── npm ci --omit=dev (prod deps only)
  ├── COPY dist/ from build stage
  ├── USER node (non-root)
  └── CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
services:
  roka:
    build: .
    restart: unless-stopped
    env_file: .env
    mem_limit: 512m
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
```

### RPi 5 Deployment Notes

- ARM64 architecture — `node:24-alpine` supports natively
- No cross-compilation needed if building on-device
- Expected runtime memory: ~80-150MB
- `mem_limit: 512m` is a safety guardrail against memory leaks
- `restart: unless-stopped` survives crashes and RPi reboots (Docker must start on boot)
- Log rotation prevents storage exhaustion on RPi's limited disk

## Reliability & Failure Handling

Gemini failures on a live response are classified before the retry or fallback decision. The live
path uses `liveMaxRetries = 2`: up to two retries after the initial call, with a 1s exponential base
backoff and full jitter. Retrying stops at whichever of two conditions is reached first: the ~12s
accumulated-backoff cap (`gemini.retryBackoffCapMs`), or the `gemini.turnDeadlineMs` wall-clock budget for
the whole retry loop. The deadline is evaluated only before a retry — never before the first attempt —
and admits one only when a full `gemini.timeout` still fits in the remaining budget; once either
condition is reached, the specified fallback behavior applies.

| Taxonomy          | Examples / Detection                                                                                                                                                                                                         | Retryable                                | Max Attempts                              | Backoff                                                          | Rate-Limiter Token                                                                   | Session Action                                                        | User-Visible Result                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `transient_http`  | 429, 500, 503, overloaded, quota, `RESOURCE_EXHAUSTED`, or `UNAVAILABLE`                                                                                                                                                     | Yes                                      | `liveMaxRetries = 2` retries              | 1s exponential base with full jitter; stop at ~12s added latency | Yes; each retry consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)   | Preserve                                                              | Real answer if a retry succeeds; generic fallback after exhaustion or when the RPM floor prevents a retry                                     |
| `network`         | `fetch failed`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, or abort-timeout                                                                                                                                                     | Yes                                      | `liveMaxRetries = 2` retries              | 1s exponential base with full jitter; stop at ~12s added latency | Yes; each retry consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)   | Preserve                                                              | Real answer if a retry succeeds; generic fallback after exhaustion or when the RPM floor prevents a retry                                     |
| `empty_text`      | No parts; `finishReason` `STOP`, `OTHER`, or unset; or `MAX_TOKENS` with thoughts-only output                                                                                                                                | Yes                                      | `liveMaxRetries = 2` retries              | 1s exponential base with full jitter; stop at ~12s added latency | Yes; each retry consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)   | Preserve                                                              | Real answer if a retry succeeds; generic fallback after exhaustion or when the RPM floor prevents a retry                                     |
| `safety`          | `SAFETY`, `PROHIBITED_CONTENT`, `BLOCKLIST`, or `SPII`                                                                                                                                                                       | No blind retry; one steered regeneration | 1 steered regeneration, one-shot per turn | None — the block is not rate-related                             | The regeneration consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)  | Preserve                                                              | A generated in-character redirect when the regeneration succeeds; otherwise the static safety deflection: “Ehh… let's not get into that one~” |
| `session_corrupt` | The Gemini 400 whose message reports a function-call turn immediately following a user turn                                                                                                                                  | Yes, once                                | 1 retry                                   | 1s exponential base with full jitter; stop at ~12s added latency | Yes; the retry consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)    | Destroy the ADK session and rehydrate it from SQLite before the retry | Real answer if the rehydrated retry succeeds; otherwise the same in-character decline as `terminal`                                           |
| `recitation`      | Gemini recitation finish reason or equivalent response classification                                                                                                                                                        | Yes, once                                | 1 resample                                | 1s full-jitter resample delay                                    | Yes; the resample consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`) | Preserve                                                              | Real answer if the resample succeeds; otherwise an in-character decline                                                                       |
| `quota_exhausted` | A 429 whose `quotaId` names `RequestsPerDay` and not `RequestsPerMinute` — the key is out of requests until midnight Pacific                                                                                                 | No                                       | None                                      | None                                                             | No                                                                                   | Preserve                                                              | The same in-character decline as `terminal`                                                                                                   |
| `terminal`        | 400, `INVALID_ARGUMENT`, authentication failure, or permission failure (bare status codes are matched last and digit-anchored, so a `400` inside a larger number — a quota figure, a token count — is not a terminal signal) | No                                       | 0 retries                                 | None                                                             | The initial user message consumes its token; no retry token is consumed              | Destroy                                                               | In-character decline                                                                                                                          |

Configurable thresholds are set on all four Gemini-API-supported harm categories
(`HARM_CATEGORY_HARASSMENT`, `HARM_CATEGORY_HATE_SPEECH`, `HARM_CATEGORY_SEXUALLY_EXPLICIT`,
`HARM_CATEGORY_DANGEROUS_CONTENT`) via `gemini.safetyThreshold` (default `OFF`). `PROHIBITED_CONTENT`,
`SPII`, and `BLOCKLIST` are server-side and not configurable, which is why the static safety deflection
path must remain even after the thresholds are relaxed.

### The Fallback Model

When `MODELSCOPE_API_KEY` is set, a turn that Gemini cannot serve is answered by `fallback.model`
(`Qwen/Qwen3.5-122B-A10B` on ModelScope API-Inference) instead of the generic fallback message.

- **Where It Plugs In:** `rokaAgent`'s model is a `RoutedLlm` (`src/agent/fallbackModel.ts`) that sends each model
  call to Gemini or to `ModelScopeLlm` according to the per-turn `modelRouteForRequest` store. The fallback runs
  through the same ADK pipeline as Gemini — the same callbacks, tools, `maxLlmCalls` cap and error plugin — so a
  fallback failure is classified by the same taxonomy.
- **When It Switches:** after a `transient_http`, `network` or `quota_exhausted` failure the loop moves the rest
  of the turn to the other model at once, with no backoff and no RPM-floor check, and grants that attempt on top
  of the retry budget. At most one switch per turn; `safety`, `recitation`, `terminal`, `session_corrupt` and
  `empty_text` never switch. With a fallback configured, a spent Gemini day is answered rather than deflected.
- **Per-Attempt Timeout:** the attempt timer and the deadline check follow the model serving the attempt:
  `gemini.timeout` (20 s) or `fallback.timeoutMs` (15 s). A Gemini timeout therefore costs about 20 s before the
  fallback answers in 1–3 s, inside `gemini.turnDeadlineMs`.
- **Sticky Window:** when Gemini failed and the fallback answered, turns for the next `fallback.stickyMs` (5 min)
  start on the fallback, so an outage costs one slow reply per window rather than one per turn. A turn that only
  started on the fallback does not extend the window; if it fails in an outage-shaped way it switches back to
  Gemini, and any Gemini success clears the window. `stickyMs: 0` disables it.
- **Translation:** Gemini-shaped requests become OpenAI Chat Completions with `enable_thinking: false` (thinking
  on measured 9–15 s a call). Images pass through as data URLs; audio, video and PDFs become a text marker.
  Tool calls the fallback returns carry `thoughtSignature: 'skip_thought_signature_validator'`, because Gemini
  rejects an unsigned function call in the current turn (400) but accepts the tagged one, so it can read the
  fallback's history when it recovers.
- **Accounting:** fallback calls still take the turn's reserved Gemini RPM slots, which only makes the limiter
  more conservative during an outage. Background memory extraction has no fallback; it waits for Gemini.
- **Logs:** `Gemini unavailable, answering this turn with the fallback model` and `Fallback model answered`.

#### Hedging Slow Gemini Calls

A slow Gemini call is a latency problem the switch policy cannot see: nothing has failed, so the turn waits out
`gemini.timeout` (20 s) before the fallback is even considered. So `RoutedLlm` does not wait to be told to switch —
if a fallback is configured, `gemini.hedgeAfterMs` (5 s, `0` disables) elapses and Gemini has still not finished
the call, the same call starts on the fallback and whichever side answers first keeps the turn.

- **Per Model Call, Not Per Turn:** the hedge lives inside `RoutedLlm.generateContentAsync`, so the ADK runner
  still sees one model call per call and `maxLlmCalls` is unaffected. Tool round-trips are separate model calls
  and are hedged independently. The runner is never run twice, so session events are never appended twice.
- **The Race Is On The Answer, Not The First Failure:** the bot runs non-streaming (`streamingMode` is never set),
  so `generateContentAsync` yields once, after the whole call, and answering and winning are the same event. A
  side that fails drops out of the race rather than settling it, so a fallback that dies fast (a ModelScope 429)
  does not cost the turn its still-running Gemini call, and a Gemini failure does not cost the turn a fallback
  that may yet answer. Only when both sides have failed does the call fail, and it then rethrows **Gemini's** own
  error object unchanged so the reliability ladder classifies the failure kind it keys on; the fallback's error is
  logged at warn and dropped.
- **No Hedge After A Fast Gemini Failure:** a Gemini failure that lands before the timer fires ends the call
  right there — the hedge is cleared and Gemini's error rethrown — exactly as it behaves unhedged, so the ladder
  sees the outage no later than it otherwise would.
- **Eligibility:** a request is hedged only when the fallback can serve it fully. Images and tool calls are fine;
  any inline or file media the fallback can only stand in for (audio, video, PDFs, documents) blocks the hedge, and
  so does a turn already routed to the fallback.
- **Abort Semantics:** each side gets its own `AbortController`, passed as `GenerateContentConfig.abortSignal` to
  Gemini and composed with `AbortSignal.timeout(fallback.timeoutMs)` for ModelScope. The loser is aborted
  synchronously the moment the winner is decided — there is no grace period, because the winner's answer is
  already in hand and the loser's tokens are wasted work. An aborted loser logs nothing, counts as no failure, and
  neither arms the sticky window nor spends a retry.
- **Sticky Window:** a hedge win does **not** set `fallbackUntilMs`. The window is keyed on Gemini having failed;
  one slow call is not an outage, and arming it would push every later turn onto the fallback for 5 minutes. For
  the same reason the window is only set when the turn was moved onto the fallback by the reliability ladder.
- **Accounting And Recording:** a hedged call spends one Gemini RPM slot, and the hedge's own ModelScope call
  spends none. `response_events` gains two columns: `model` (`'gemini'` or `'fallback'` on **every** turn that
  produced an answer, `NULL` on a turn that produced none) and `hedged` (`1` once any model call of the turn fired
  a hedge). Both are read off the turn's single `modelRouteForRequest` store, which `RoutedLlm` writes on every
  call it serves. A hedge win is otherwise recorded as an ordinary successful turn, so the win rate is visible
  without inflating the failure rate.
- **Calibration:** production per-turn `llm_ms` for no-tool turns is p50 1.9 s / p75 2.7 s / p90 6.2 s / p95 14.4 s,
  so 5 s fires on roughly the slowest 10–15% of calls, at the cost of one extra call on each of them.
- **Logs:** `Hedged slow Gemini call; kept the faster answer` names the winner; `Hedged fallback call failed while
Gemini was still running` is logged only when the turn ends with both sides failed, since a fallback that loses
  a race it rescued nothing from is not worth a line.

### RPM-Budget Accounting

- A turn reserves `gemini.maxLlmCalls` rate-limiter slots, then releases the unused portion. Live retries require
  `remainingRpm >= retryRpmFloor` (`2`).
- Tool-chain calls up to `maxLlmCalls = 4` were uncounted, so `rpm` bounded turns while Gemini's quota
  counted requests. **Closed for `rpm` by #167**: a turn now reserves `maxLlmCalls` slots and releases what it
  did not use, so `rpm` is counted in requests. See "A Turn Reserves the Calls It May Make".
- **`rpd` still counts turns, and that is a half-closed gap rather than a decision.** `reserveCalls`
  increments `dailyCount` once per turn and `release` never touches it, so within one object `admitted`
  counts requests and `dailyCount` counts turns: `rpd: 500` admits 500 turns, which is up to 2,000 requests
  against a 500-request daily quota. Left as-is because converting it needs release semantics for a counter
  that has none, and because the reachability is the same dormant profile as the rest — production runs ~10
  turns a day. Named here so the asymmetry does not read as deliberate.

### A Spent Day Is Not a Spent Minute

Both arrive as `429 RESOURCE_EXHAUSTED` with the same HTTP status and, until now, the same `kind`. Only the
`quotaId` separates them, and their correct responses are opposite:

| `quotaId`                                   | Recovers within a turn?            | Right response  |
| ------------------------------------------- | ---------------------------------- | --------------- |
| `...RequestsPerMinutePerProjectPerModel...` | Yes, in seconds                    | Retry           |
| `...RequestsPerDayPerProjectPerModel...`    | **No, not until midnight Pacific** | Deflect at once |

Classified as `transient_http`, a spent day cost three attempts and their backoff **on every turn for the rest
of the day**, and then reported itself as a transient — so the symptom was latency nobody attributed to a rate
limiter that reports itself as never having been hit.

- **Matched only when the payload names the day and not the minute.** The two mistakes are not equal: reading
  a minute as a day deflects a turn a retry would have rescued, while reading a day as a minute costs three
  refused attempts. The second is the pre-existing behaviour, so an ambiguous payload keeps it.
- **The payload's own `retryDelay` is not read, and must not be.** A daily refusal advertises
  `retryDelay: "39s"` — a minute-shaped remedy for a day-shaped problem, which is Google failing to make the
  same distinction. `computeBackoff` takes an attempt number and nothing else, so we are safe by construction
  rather than by design; honouring the server's delay is a reasonable-sounding change that would retry
  roughly two thousand times into a wall that only opens at midnight.
- **Reachable in production, though not at today's traffic.** `rateLimiter`'s daily counter is in memory and
  starts at zero on every restart, and `main` deploys on merge, so a busy day plus a redeploy leaves the
  server's quota as the only guard. At ~10 turns a day nothing is close to it; the mechanism is real and the
  reachability is not, which is why this is classification rather than a new limiter.

### Concurrency & Lifecycle Under Retry

- A concurrent message in a channel whose live turn is retrying is rejected by the per-channel guard
  with the existing in-character busy reply. It is dropped rather than queued or used to cancel the
  retrying turn; its content remains in the passive buffer for a later turn, and it consumes no
  rate-limiter token.
- The per-channel guard is now released within the turn deadline plus the pre-loop prologue (prompt
  assembly, memory retrieval, image download), rather than up to `(liveMaxRetries + 1) × gemini.timeout`
  as before — this is the blast-radius bound the deadline actually buys.
- Independent channels may retry concurrently. Cross-channel RPM contention is resolved by the
  synchronous `tryConsumeAboveFloor()` primitive, which is race-free under JavaScript run-to-completion. The
  memory scheduler runs independently and processes queued episodes asynchronously.
- An idle TTL cannot fire during a retry: `ttlMs` is much greater than the maximum retry window. If a
  session is nevertheless destroyed while its retry loop is in flight, the loop must resolve to a
  graceful fallback rather than throw.
- On `SIGTERM`, a retrying live turn aborts promptly within the existing 5s force-exit budget. This
  lifecycle behavior does not require a change to `index.ts`.
- The initial live attempt reuses the token already consumed by the Discord handler. Only subsequent
  retries consume additional rate-limiter tokens.

### Global In-Flight Attachment Budget

The per-channel guard bounds how many turns one channel runs, never how many run in total, so K busy
channels means K simultaneous attachment downloads. Each attachment costs roughly **4.7×** its own size in
RSS — the `arrayBuffer`, the `Buffer` copy, the base64 string and the JSON body all coexist — and two of
those multiples are `Buffer`s, which live outside the V8 heap and so never raise a catchable heap error.
The container is SIGKILLed instead. `src/discord/byteBudget.ts` is the admission control for that:

- **Reserved before the download starts**, not after. A check that runs once the bytes have landed is a
  measurement, not a guard.
- `discord.maxInFlightAttachmentBytes` (32 MB) is the ceiling across every channel at once. Its `min` bound
  is `MAX_ATTACHMENTS × MAX_DOCUMENT_SIZE_BYTES`: below that a maximal turn could never be admitted even on
  an idle bot, so it would be refused permanently rather than delayed. **At `MAX_ATTACHMENTS = 1` that floor
  is 10 MB**, so the 32 MB default sits at a little over three times it and three channels can download
  concurrently. That headroom is the point of the one-attachment ceiling rather than a side effect: at three
  attachments the floor was 30 MB, the default sat 2 MB above it, and a single maximal turn held off every
  other channel on every other server until it completed. `discord.maxInFlightAttachmentBytes` remains the
  knob to loosen it further.
- A turn is reserved its attachments' **stated** sizes where Discord gives them, and its type's ceiling where
  it does not — an embed image or a link resolved by HEAD states no size, and an unknown must cost the most
  it could. A stated size above the ceiling is clamped to it, since the download refuses on `Content-Length`
  before buffering.
- **Over-budget turns take the existing in-character busy reply**, not a new path and not a silent drop.
- **The reservation is released on every exit path** — success, download failure, model error and timeout —
  from the same `finally` that releases the per-channel guard. A leak here degrades into a permanent refusal
  rather than a failed turn, which is the harder failure to notice, so both the succeeding and the failing
  path are pinned by tests.

Per-turn caps are unchanged and independent of this: 4 MB per image and 10 MB per document are set by upload
latency against `gemini.timeout`, not by container memory. See `docs/research/multimodal.md`.

### Attachment Types and Their Ceilings

`src/discord/attachments.ts` holds the single declaration of every admitted type; `src/agent/attachmentLimits.ts`
holds the ceilings and the one function that maps a type to its ceiling, so the download and the in-flight
byte budget cannot disagree about the same file.

| Kind     | Types                                                                           | Ceiling | Path                            |
| -------- | ------------------------------------------------------------------------------- | ------- | ------------------------------- |
| Image    | `png`, `jpeg`, `gif`, `webp`                                                    | 4 MB    | Re-encoded by `sharp`           |
| Document | `application/pdf`                                                               | 10 MB   | Untouched                       |
| Audio    | `wav`, `mp3`, `mpeg`, `aiff`, `aac`, `ogg`, `flac`                              | 8 MB    | Untouched                       |
| Video    | `mp4`, `mpeg`, `mov`, `quicktime`, `avi`, `x-flv`, `mpg`, `webm`, `wmv`, `3gpp` | 10 MB   | Untouched, low media resolution |

- **Only images go through `sharp`.** Handed anything else it throws, and its catch returns the _undecoded_
  bytes relabelled `image/jpeg` — so a document or clip routed through it arrives byte-identical but
  misdeclared and unreadable. Tests assert the data and the mimeType as a pair for exactly this reason; the
  data alone matches even when the file is broken.
- **Oversized media is taken as a prefix, not refused.** A file past its ceiling is `Range`-fetched down to
  exactly that ceiling and sent as its opening, so the excess never crosses the wire. Whole-file ingestion of
  very large media is not merely expensive but arithmetically impossible — 200 MB of audio is ~5.3 h, about
  611,000 tokens against a 250,000 TPM ceiling — so a bounded prefix is the only shape that works.
  - **Only where the container survives being cut.** MP3 is a stream of self-describing frames, so any prefix
    is valid audio. ISO base media (`mp4`, `mov`, `3gpp`) is prefixable only when `moov` precedes the media
    data, which is a property of the file rather than the format: a phone MP4 carries its index last and a
    prefix of one is undecodable. `isobmffAllowsPrefix` walks the box list of the bytes already fetched, so
    the check costs no extra request. Everything else refuses — OGG, WebM, FLAC and AAC are all plausibly
    prefixable and none is measured, and a wrong guess here raises no error anywhere: the request succeeds
    and the answer is about nothing.
  - **A file refused on its stated size is never requested at all**, so a 200 MB upload of an unprefixable
    type costs zero transfer.
  - **The saving is the cancel, not `Range`.** Measured against `cdn.discordapp.com`: it advertises
    `accept-ranges: bytes` and then answers **200 with the whole body** for a ranged request, so the
    Range-ignored path is the only one that runs in production, not a fallback. What bounds the transfer is
    `readWithinLimit` cancelling the reader at the ceiling — measured on a 50 MB body, 1 MB read in 178 ms
    against 2,750 ms for the whole file, so the transfer genuinely stops rather than being read and
    discarded. `Range` is still sent because it costs nothing and a 206 would be better; nothing depends on
    it. Treating the resulting overflow as a failure would turn the saving into a refusal on every file.
  - **She says so.** `truncatedAttachments` reaches the Discord layer and adds a line naming the truncation,
    separately from the unreadable-file line — a turn can carry one of each.
- **The download aborts mid-transfer.** `readWithinLimit` streams the body with a running byte counter and
  cancels the reader the moment it passes the ceiling. What it replaced buffered the whole body and measured
  it afterwards, safe only while every response carries an honest `content-length` — a header that is absent
  or understated would have let a response exhaust the container before anything checked it. There is
  deliberately no `arrayBuffer()` fallback for a body-less response: a fallback is a path where the guard
  does not run, and it is the path a malformed response would take. The `content-length` pre-check remains a
  cheap early exit, and is what refuses an honestly-declared oversized file before a byte is read.
- **Media resolution is pinned low per request, not on the agent.** `mediaResolution` is request-level and
  governs images as well as video frames, so setting it on `rokaAgent` would re-price and re-render every
  picture she can already see. `beforeModelCallback` sets it only when the request carries a video part.
- **`audio/mpeg` and `video/quicktime` are admitted and renamed.** Gemini documents `audio/mp3` and
  `video/mov`, neither of which is a registered MIME
  type; the registered ones are `audio/mpeg` (RFC 3003) and `video/quicktime`, and those are what Discord
  reports. The
  rename happens once, in `geminiMimeType`, at the download boundary. **Both labels are accepted** —
  measured with real MP3 bytes, identical token counts under either, because Gemini routes on content rather
  than on the declared type. The rename is therefore a preference, not a requirement: the documented name is
  the one with a compatibility promise, and it costs nothing to send.
- **Audio contributes 0 to `tokensInEst`.** It is billed per second of media, and seconds are not knowable
  without decoding — the same argument `docs/research/multimodal.md` makes against enforcing duration caps. Left at
  zero deliberately rather than estimated.
- **Both surfaces admit the same set.** `/ask` and the mention path each filter with `isSupportedMedia`.
  The forwarded, referenced and embed sub-paths on the mention path remain images-only, because their text
  markers describe what they carry as images.
- **Components V2 media is read, and what cannot be read is still counted.** A Components V2 message keeps
  its files in `components` rather than in `attachments`, so `Thumbnail` (11), `MediaGallery` (12) and `File`
  (13) reached her as nothing at all — and as nothing _silently_, because a path that never detects a file
  cannot report one. `extractComponentMedia` walks the same tree the text walker does and routes what it
  finds into the ordinary attachment slots, after the sender's own uploads: an explicit upload is the more
  deliberate of the two gestures. A component whose `content_type` she cannot read, **or that states none at
  all**, adds to `unsupportedCount` rather than being skipped — guessing a type from the URL would be the
  same silent assumption that created the gap. Nothing here makes a network call: the type comes from what
  Discord already resolved.
- **`attachment_url` takes the same set as the upload slot.** It was images-only, on the reasoning that this
  is the SSRF-guarded path where the Pi fetches a host the _sender_ named — but the guard checks the host and
  never the payload, so the narrow type set was not what made it safe. What does: the 2 s HEAD and 15 s body
  timeouts, the per-type size ceilings, and the measured token ceiling, none of which care about type. The
  resolver also carries the `content-length` the server declared, so a linked file reaches the same
  truncate-or-refuse decision an uploaded one does; a host that lies about it costs nothing, because that
  size only chooses the policy and `readWithinLimit` bounds the transfer either way.
- **Two asymmetries remain and are deliberate.** Only images are re-encoded by `sharp` on the way through, so
  every other type is relayed to the model verbatim; and time-based media lets the sender pick the token cost
  per byte, where an image is a flat 1,089 whatever it contains. Both are bounded downstream by
  `gemini.maxAttachmentTokens`, which refuses after the download rather than before it.

### Attachment Token Admission

Size does not bound token cost, so the byte ceilings above do not bound the bill. A 17 KB PDF is 50 pages at a
measured ~560 tokens each — 28,001 tokens from a file small enough to pass every check on the way in — and
three 200-page PDFs reach 341,543 tokens in a single request, over the whole 250,000 TPM ceiling.
`src/agent/attachments.ts` therefore prices the parts with `countTokens` before sending them and refuses attachments above
`gemini.maxAttachmentTokens`, rather than letting the request fail on a 429 that would retry into the same
wall and spend the minute's budget for every other channel.

- **Video is not adjusted, because the estimate already runs above the bill.** `countTokens` does under-price
  a video's soundtrack — sometimes to nothing, and how much is a property of the (video, audio) _pair_ rather
  than of the audio. It over-prices the video itself by more. Four matched clips, `countTokens` against
  `usageMetadata.promptTokenCount`:

  | Clip                   | `countTokens` | Billed | Over-report |
  | ---------------------- | ------------- | ------ | ----------- |
  | black frames + audio   | 2,070         | 1,768  | 1.17x       |
  | black frames, silent   | 2,070         | 1,268  | 1.63x       |
  | 854x480 24 fps + audio | 2,133         | 1,828  | 1.17x       |
  | 854x480, silent        | 2,061         | 1,328  | 1.55x       |

  **Billing is the clean side.** Audio bills 500 tokens for 20 seconds beside _both_ videos — identical across
  clips differing in resolution, framerate, bitrate, content and 35x in bytes — at ~25/second, the same rate
  the audio bills at alone. The erratic side is the estimator: the same audio stream contributes 72 tokens to
  `countTokens` beside one video and 0 beside another, decided by its companion. That is an artefact of the
  estimator, not a property of the cost model.

  A `VIDEO_AUDIO_ALLOWANCE` of 0.31 was briefly added on the reading that audio was unpriced and the guard
  therefore too permissive. Measured against billing that was false in both halves: the estimate was already
  1.17x-1.63x above the bill, and the allowance pushed it to 1.53x-2.14x — worst on silent video, the case it
  deliberately over-charged. Removed.

- **The margin is borrowed from `MEDIA_RESOLUTION_LOW`, not inherent to the estimate.** `src/agent/roka.ts` pins low
  media resolution on any request carrying video, so the biller charges ~65 tokens/second while `countTokens`
  prices at ~103. The probe cannot pin anything: `CountTokensConfig.generationConfig`, where `mediaResolution`
  lives, is documented "Not supported by the Gemini Developer API". Both terms are linear in duration, so the
  ratio is duration-independent and a 20-second measurement generalises by construction rather than by
  extrapolation — the 854x480 ceiling still binds the video rate. **Remove that setting, or let a future part
  shape stop matching `requestCarriesVideo`, and billing rises toward the default resolution while the
  estimate does not move: the guard flips from over- to under-estimating with nothing in `attachmentCost.ts`
  changing.** Pinned at both ends — `prices video at whatever resolution the request will use` in
  `attachmentCost`'s tests, and a roka test named for this consequence rather than for the setting.

- **Images are skipped, and that skip is model-specific.** `needsMeasuring` returns false when every part is
  an image, because an image is a flat 1,089 tokens regardless of dimensions and `MAX_ATTACHMENTS` of them
  cannot reach any legal ceiling. That number is _this_ model's; `gemini.model` is configurable, and a model
  that priced images by size would make the skip wrong rather than merely stale. The floor on
  `maxAttachmentTokens` is derived from the same constant (`MAX_ATTACHMENTS * GEMINI_IMAGE_TOKENS`) so the
  two cannot drift apart silently.
- **`countTokens` does not draw on the generate quota.** Verified twice against a key at its RPD limit: the
  call succeeds where `generateContent` 429s. Pricing is therefore free in quota, but not in transfer.
- **It costs a second upload.** `countTokens` sends the same base64 payload the message will send, so a
  priced attachment crosses the wire twice. At the Pi's measured ~2.5 MB/s that is ~4 s each way for a 10 MB
  PDF, inside the 20 s timeout with room to spare, but it is real latency on the largest admitted files and
  it is why the image skip is worth having rather than an optimisation for its own sake.
- **It fails open.** A `countTokens` that throws or times out returns `undefined` and the turn proceeds
  unpriced. The check exists to stop a predictable overrun, not to become a new way for an ordinary message
  to fail.
- **A refusal is told to the model.** The same `failedAttachmentNotice` that covers a failed download covers
  a cost refusal, in its own wording. Without it a refused turn looks identical to a question about a file
  that was never attached — the exact condition that produced the `search_web` fabrications described above.
- **Refusal is all-or-nothing, and the wording says so.** One cheap image beside one 500-page PDF refuses
  both, so the notice blames the set (`together they are too long to read`) rather than each file — otherwise
  she tells the sender their 1,089-token picture was too long to read. Refusing only the expensive member
  would need a `countTokens` per attachment, and each of those re-uploads the file.

### The Per-Minute Token Budget

`rateLimit.rpm` bounds how many turns happen, not what they cost, and that bounded spend adequately only
while every turn cost about the same. A text turn is ~5,600 tokens, so 15 of them is 34% of the measured
250,000 TPM (#125). Attachments end that relationship: one turn may now carry `gemini.maxAttachmentTokens`,
and 15 of those is over three times the minute's budget.

Neither existing guard sees it. `byteBudget` meters bytes, and the whole finding of #136 is that bytes do not
bound tokens — a generated 89-page PDF measured 49,841 tokens in 35 KB, which passes the per-turn ceiling and
reserves 0.107% of the byte budget. Fifteen of those a minute is 299% of TPM while the byte budget reads 1.6%
used. `gemini.maxAttachmentTokens` bounds one turn and says nothing about their rate.

`src/agent/tokenBudget.ts` is a global account of tokens spent per rolling minute, draining continuously
rather than resetting on a boundary, mirroring the RPM bucket. Global rather than per-channel because TPM is
a project quota: the harm from overspending lands on every other channel, not on the sender.

- **Admission and accounting are separate decisions, taken in different places.** Exact cost is only knowable
  after a file has been downloaded and measured, which is far too late to decline politely. Admission
  therefore asks the answerable question in the Discord handlers, before the turn: for a turn carrying
  attachments, is there room for the worst turn `gemini.maxAttachmentTokens` admits? That is the same floor
  idiom as `retryRpmFloor`. Accounting happens afterwards in `src/agent/roka.ts`, charging
  what was actually sent.
- **Over-budget takes the existing in-character busy reply,** exactly as `byteBudget` does, and is asked
  before the byte reservation so a declined turn has taken nothing it must hand back. No new counter, notice,
  or message pool: the condition is transient and "she is swamped" is what it means.
- **Text turns are never gated.** `rateLimit.rpm` already bounds them to about a third of the minute, and
  gating them would refuse ordinary conversation to protect a quota conversation does not threaten. The
  `NUMERIC_BOUNDS` floor pins `maxTokensPerMinute >= maxAttachmentTokens`, so a budget too small to ever
  admit an attachment is rejected at startup rather than silently refusing every one. The two ceilings are
  pinned together for the same reason read backwards: because one knob's floor is the other knob's value,
  an attachment ceiling above the per-minute ceiling would leave `maxTokensPerMinute` with no legal value at
  all, while both rows still read as valid on their own. `maxAttachmentTokens` is therefore capped at 125,000
  too — nothing above it could ever be admitted anyway, since a turn is only let in when the minute can fund
  a whole one.
- **The charge is measured where measuring was already paid for.** The `countTokens` probe above already runs
  for non-image turns and its answer was previously compared to the ceiling and discarded; it is now kept as
  the attachment term. Image-only turns charge the flat 1,089 each. No probe is ever added to feed the
  budget — a round trip that re-uploads a file to price it is the resource being rationed.
- **A refused turn is not charged.** It never reaches `generateContent`, so it spends none of the quota this
  bucket meters, and charging it would refuse other channels for spend that did not happen. The bandwidth
  path is already bounded upstream: `src/discord/events/messageCreate.ts` reserves calls before `generateResponse`,
  so a refused turn has already burned an RPM token.
- **`tokensInEst` and the charge are one expression.** The metric reports exactly what the budget is charged,
  because two expressions for the same quantity is how a budget starts describing something other than the
  spend it bounds.
- **`maxTokensPerMinute` is bounded at half the measured ceiling, not the whole of it.** A continuously
  draining bucket has no capacity separate from its rate, so a rolling minute admits both: a burst arriving
  at an empty bucket spends the entire budget and then spends whatever drains in behind it, for up to 2x the
  configured value inside one 60-second window. Simulated against the module's exact drain arithmetic with
  maximal 55,626-token turns under `rateLimit.rpm` 15, the worst rolling minute is 389,382 tokens at a
  setting of 200,000 — 156% of the ceiling the guard exists to defend, in precisely the burst case it was
  built for. The default and the `NUMERIC_BOUNDS` ceiling are both 125,000, which makes the worst case
  250,000 by construction. Capping capacity separately from rate is the more precise alternative and was
  not taken: it adds a second concept to a module that currently has one, to buy throughput this project
  has never needed at a measured peak of 38 requests a day.

### A Turn Reserves the Calls It May Make

`rateLimit.rpm` is counted in **requests**, and a turn is not one request. ADK is given
`runConfig.maxLlmCalls`, so a turn that calls a tool issues an initial model call and another after the tool
result, chaining up to that ceiling. Admitting on a single slot let 15 turns become up to 60 requests against
a 15 RPM quota (#167) — the third instance of a guard metering a different unit than the quota it defends,
after bytes-for-tokens (#136) and capacity-for-rate (#149).

Both handlers that reach the model now reserve `gemini.maxLlmCalls` slots before the turn and hand back what
it did not use, released in the same `finally` as the byte reservation and the concurrency flag.

- **Reserved at the ceiling, released to the truth.** Production averages ~1.13 calls a turn, so pricing
  every turn at the 4-call peak would cost most of the budget. The release is the whole difference between
  this and simply lowering `rpm`: that would price every turn at 4 permanently, this holds 4 only while the
  turn runs.
- **The sustained ceiling is `rpm - maxLlmCalls + 1`, not `rpm`.** A turn is admitted only when a whole
  reservation fits, so single-call turns settle at 12 a minute at `rpm: 15`, not 15. That headroom is the
  standing cost of bounding the peak — a fifth of the budget — and it is the figure to quote, not `rpm`.
- **`rateLimit.rpm` has a floor of `gemini.maxLlmCalls`.** Below it no turn can ever be admitted and the bot
  answers nothing while reporting itself rate-limited. Found when a harness fixture at `rpm: 2` went silent
  the moment reservations landed; now rejected at startup rather than at runtime.
- **A turn that cannot report what it spent keeps its whole reservation.** Holding slots costs a minute;
  handing back slots that were spent costs the quota. Made explicit rather than left to arithmetic that would
  otherwise degrade to `NaN` and release nothing by accident.
- **The early check is an optimisation, not the guard.** `canAdmitCalls` declines before a Discord round trip
  is spent; the reservation taken later is authoritative, and a turn that loses the race between them is
  refused there. Removing the peek changes which message the user sees, not whether the turn runs.
- **`rpd` is not converted, and the asymmetry is a gap rather than a choice.** `reserveCalls` increments the
  daily counter once per turn and the release never decrements it, so this object now counts requests by the
  minute and turns by the day. Converting it needs release semantics for a counter that has none. See
  "RPM-Budget Accounting".
- **`/anime` and `/remind` take no slot from this limiter.** They reach Jikan and SQLite, never Gemini.
  `toolCommands.ts` used to call `tryConsume()` anyway, borrowing this limiter as a generic abuse guard.
  Google's quota was never touched by that; **ours** is what ended up wrong, so the harm was self-inflicted
  pessimism — our guard refusing real turns earlier than it needed to. Removed in #172, and nothing was left
  unguarded: `jikanThrottle` bounds Jikan calls at 350 ms apart on its own, and `/remind` writes one local
  row.

### The Two Limiters Bound Their Windows Differently, on Purpose

`rateLimit.rpm` and `gemini.maxTokensPerMinute` guard per-minute quotas and are built differently. That is a
decision, not drift, and it is recorded here so the next reader meets the distinction rather than the
discrepancy.

Both started as continuously-refilling buckets, and a bucket whose capacity equals its rate admits
`capacity + rate x T` over a window of length T — twice the configured value at T of one minute. Measured on
each: `rpm: 15` admitted **29** requests in the worst rolling minute (#149), and a 200,000 token budget
admitted **389,382** (#148).

- **`rateLimiter.ts` counts a sliding window**, so `rpm` means what it says. The count is `rpm` itself —
  fifteen timestamps in a bounded array — so exactness costs nothing and gives up no throughput. Admissions
  are released only once they are strictly older than the window, never on its edge, so no closed
  60-second interval can contain more than `rpm` of them.
- **`tokenBudget.ts` keeps the bucket and halves the knob** so that its 2x is the real ceiling. It meters a
  continuous quantity rather than a count, so an exact window would mean retaining every charge rather than a
  bounded number of them, and the ceiling it defends is a token figure we can simply configure below.

The rule the two share: **exact where exactness is cheap, halved where it is not.** Converging them would
mean either retaining unbounded charge history or halving `rpm` to 7 and giving up half the request budget.

### Attachment Bytes Do Not Live in History

ADK's runner appends the incoming message to the session verbatim, and nothing in the framework removes it.
`inlineData` parts therefore stayed in the live event list and were **re-sent to Gemini as conversation
history on every later turn** until they aged out of the window, the idle TTL fired, or the bot restarted.
Measured before the fix: ~11.5 MB of heap retained per attachment, accumulating turn over turn and released
only on teardown, and a five-minute clip re-charged on every turn that followed it.

`src/agent/session.ts`'s `WindowedSessionService.stripAttachmentBytes` replaces those bytes with a text marker — `(an image)`,
`(an audio clip)`, `(a document)` — once the turn is over.

- **After every attempt, never between them.** A retry re-sends the same message, so ADK appends it again;
  stripping mid-loop would hand the model a marker where the first attempt had the picture. One upload can
  therefore leave several copies in history, and all of them are tracked and stripped.
- **The reference, not a copy.** `appendEvent` receives the very object pushed into storage — neither it nor
  `createEvent` clones — which is what lets a later strip reach stored history. `getSession` deep-clones, so
  stripping a fetched session would mutate a copy and change nothing.
- **It runs on failed turns too.** A turn that errored still appended its message, so its bytes are retained
  exactly as a successful turn's are.

**The capability this removes.** She can no longer refer back to a picture from an earlier turn — she knows
one was there, not what was in it. That is a real loss, and it is chosen rather than inherited: rehydration
after a restart already rebuilds history as text-only, so the two paths previously disagreed about whether an
image from four turns ago was still visible. They now agree, and the behaviour is the same before and after a
restart instead of depending on how recently the bot was deployed.

### ADK Error Delivery Constraint

Google ADK yields model-call errors as runner events rather than throwing them from `runner.runAsync()`.
Reliability handling must therefore classify yielded error events and `LlmResponse` fields before choosing
the taxonomy behavior above; it cannot rely solely on an outer `try`/`catch` around the runner.

When a candidate returns with no content parts, ADK's `createLlmResponse` sets `errorCode` to the
candidate's `finishReason` (e.g. the literal string `SAFETY`) and drops `candidate.safetyRatings` at that
same boundary, so the per-harm-category rating is never observable downstream — only the coarse
`finishReason`/`errorCode` token survives into the reliability loop.
