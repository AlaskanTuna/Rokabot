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
│  - Rate limit guard (token bucket RPM + daily RPD)│
│  - Concurrency guard (1 active req per channel)   │
│  - Typing indicator management                    │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│              Session Manager                      │
│  Hot per-channel cache over SQLite history         │
│  - Rehydrates the ADK window on session creation   │
│  - FIFO window bounded by `session.windowSize`     │
│  - Idle TTL bounded by `session.ttl`               │
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

### Persistence & Storage

| SQLite Table                                                                                                       | Contents                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_history`                                                                                                  | Channel messages, including message role, display name, content, timestamp, and optional user identity fields.                                                                                  |
| `user_memory`, `memory_claim`, `memory_evidence`, `memory_claim_fts`, `extraction_queue`, `memory_backfill_marker` | Legacy facts, typed claims and their evidence/search mirror, restart-safe extraction work, and the one-time legacy backfill marker.                                                             |
| `reminders`                                                                                                        | Scheduled user reminders and delivery state.                                                                                                                                                    |
| `game_scores`, `gacha_collection`, `gacha_daily`, `buddy`                                                          | Game scores and gacha/companion data.                                                                                                                                                           |
| `user_names`, `monitored_channels`                                                                                 | Durable user identity lookup and passive-monitoring state.                                                                                                                                      |
| `response_events`, `extraction_events`, `memory_events`                                                            | Response, legacy extraction, and value-free claims-memory telemetry. `response_events.failure_marker` stores the raw `finishReason`/`errorCode` token only (e.g. `SAFETY`), never message text. |

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

Represents a single message in the per-channel FIFO window.

| Field         | Type                    | Description                                   |
| ------------- | ----------------------- | --------------------------------------------- |
| `role`        | `'user' \| 'assistant'` | Who sent the message                          |
| `displayName` | `string`                | Discord display name of the sender            |
| `content`     | `string`                | Message text content                          |
| `timestamp`   | `number`                | Unix timestamp (ms) when message was received |

### ChannelSession

Per-channel session state maintained by the SessionManager.

| Field          | Type              | Description                                                      |
| -------------- | ----------------- | ---------------------------------------------------------------- |
| `channelId`    | `string`          | Discord channel ID (map key)                                     |
| `messages`     | `WindowMessage[]` | FIFO hot cache (bounded by `session.windowSize`, oldest evicted) |
| `idleTimer`    | `Timeout \| null` | Idle TTL timer handle (bounded by `session.ttl`)                 |
| `lastActivity` | `number`          | Unix timestamp of last interaction                               |

### RateLimiterConfig

Configuration for the dual rate limiter.

| Field | Type     | Default | Description                                     |
| ----- | -------- | ------- | ----------------------------------------------- |
| `rpm` | `number` | `15`    | Max requests per minute (token bucket capacity) |
| `rpd` | `number` | `500`   | Max requests per day (daily counter)            |

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

## Memory Architecture (Claims)

Claims memory is SQLite-backed, guild-scoped, and selected before the prompt is assembled. It replaces the
all-facts retrieval path when `memory.claimsBackend` is enabled; the legacy path remains available only as a rollback.

### Storage Schema

| Table              | Columns                                                                                                                                                                                                                                       | Contract                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `memory_claim`     | `id`, `guild_id`, `subject_user_id`, `predicate`, `value`, `object_kind`, `object_user_id`, `source_kind`, `status`, `confidence`, `salience`, `pinned`, `needs_review`, `superseded_by`, `first_seen_at`, `last_seen_at`, `last_recalled_at` | Typed claims. `idx_memory_claim_dedup` is unique on (`guild_id`, `subject_user_id`, `predicate`, `value`).  |
| `memory_claim_fts` | `value`, `predicate`                                                                                                                                                                                                                          | FTS5 virtual-table mirror of active `memory_claim` rows, maintained by insert, update, and delete triggers. |
| `memory_evidence`  | `id`, `claim_id`, `channel_id`, `source_kind`, `observed_at`                                                                                                                                                                                  | Evidence observations attached to claims.                                                                   |
| `extraction_queue` | `id`, `guild_id`, `channel_id`, `payload`, `status`, `attempts`, `enqueued_at`                                                                                                                                                                | Persisted extraction batches; queue statuses are `pending` and `processing`.                                |
| `memory_events`    | `id`, `kind`, `guild_id`, `channel_id`, `subject_user_id`, `duration_ms`, `n_candidates`, `n_selected`, `n_changed`, `tokens_est`, `op`, `created_at`                                                                                         | Value-free pipeline telemetry. `op` records `assert`, `retract`, `supersede`, or `none` when applicable.    |

### Claim Lifecycle

Claim statuses are `candidate`, `active`, `superseded`, and `rejected`, with the normal lifecycle
`candidate → active → superseded → rejected`. Activation or assertion of a new active claim for a
single-cardinality predicate supersedes prior active claims for the same (`guild_id`, `subject_user_id`, `predicate`)
and sets their `superseded_by` to the replacement claim. Retractions, capacity eviction, and retention pruning mark
claims `rejected`.

Claims with `needs_review` are excluded from the general retrieval candidates. They can be selected only as anchors
for their own `subject_user_id`, so they never surface as cross-context memories.

### Timestamps, Retention & Capacity

- `first_seen_at` records the first observation.
- `last_seen_at` records the latest observation and drives expiry.
- `last_recalled_at` changes only when the retriever selects a claim for the prompt.

The current retention job marks unpinned `candidate` and `active` claims `rejected` when `last_seen_at` exceeds
`memory.claimRetentionDays` (90 days); pinned claims are exempt. `memory.maxActiveClaimsPerUser` (20) limits active
claims per user, evicting the least salient unpinned claims first.

### Bounded Retrieval Contract

Retrieval is guild-scoped and bounded to at most `memory.maxClaimsPerTurn` (10) claims and approximately
`memory.retrievalTokenBudget` (350) tokens. It reserves up to `memory.speakerMinShare` (0.5) of the selected slots
for speaker anchors; anchors are considered before every other candidate and are never displaced by general
selection. It considers at most `memory.recentParticipantLimit` (3) non-speaker participants and may expand one hop
through an active `relationship_to` claim to an included participant.

The retriever, not `refreshFactTimestamps`, calls `touchRecalled()` for selected claims. The resulting entries are
rendered through the shared Phase 13 `buildFactsEnvelope` untrusted-data envelope; the claims path does not fork the
envelope.

### Extraction Pipeline

The pipeline is: candidate gate → persisted `extraction_queue` → per-guild round-robin scheduler → user-ID-keyed
batched extractor → transactional `assert`/`retract` operations in `memory_claim`. The candidate gate rejects
sensitive, trivial, and already-known-only batches before any extraction call. Persisted queue state is restart-safe:
stuck `processing` work can be returned to `pending`, and failed work is retried up to the queue attempt cap before it
is dropped.

The scheduler enforces `memory.perGuildGapMs` (20 seconds) between batches from the same guild and caps each guild at
`memory.extractionQueueMaxPerGuild` (50) pending batches. Extraction is limited to
`floor(rateLimit.rpd × memory.extractionDailyBudgetRatio)` (0.4 of RPD) and requires
`gemini.extractionRpmFloor` (3) remaining RPM, so live traffic wins. This is the same floor-priority behavior defined
in [Reliability & Failure Handling](#reliability--failure-handling).

### Tenancy

Every claim is scoped by `guild_id`. A guild interaction uses the real guild id. Every non-guild channel — bot DM
and group DM alike — is its own tenant, shaped `dm:<channelId>` and derived at the two handler sites. There is no
shared `'global'` claims tenant: `assertWritableGuild` (`src/agent/memory/memoryClaims.ts:109`) throws on it, and
DM↔DM isolation is pinned by `src/agent/tools/__tests__/memoryTools.test.ts`. Legacy facts with no attested scope
are still logged and skipped during backfill rather than assigned a tenant.

### Prompt-Assembly Invariant

Retrieval runs once in `generateResponse` while assembling `_systemPrompt`. `beforeModelCallback` reads only that
already-assembled state to assign the system instruction; it never triggers retrieval or reads the database.

### Flag, Rollback & Legacy Path

`memory.claimsBackend` defaults to `true`. Set `MEMORY_CLAIMS_BACKEND=false` to roll back to the legacy
`user_memory` all-facts path, or revert the configuration default. The legacy dual-write tap remains present but is
inert while the claims backend is enabled; it is retained for later cleanup.

### Vault Export Technical Contract

`exportVault()` and `npm run export:vault` are read-only, offline export paths. They write one note per
(`guild_id`, `subject_user_id`), with YAML frontmatter grouped by predicate and `relationship_to` facts rendered as
`[[wikilinks]]`. `dm:` scopes remain isolated in their own export paths. A containment guard based on `path.relative`
and `path.isAbsolute` rejects a note path outside the export directory. Export performs no store writes and no network
requests.

### Deferred Items

- Embeddings and `sqlite-vec` semantic retrieval.
- An ADK `globalInstruction` spike.
- Two-way Obsidian vault synchronization; the current export is one-way and read-only.

## API Contracts

### Discord Events (Inbound)

#### InteractionCreate (Slash Command)

```
Event: interactionCreate
Filter: isChatInputCommand() && commandName === 'chat'
Extract: interaction.options.getString('message'), channelId, user.displayName
Flow: deferReply() → process → editReply(response)
```

#### MessageCreate (Mention/Reply)

```
Event: messageCreate
Filter: !author.bot && (isMentioned || isReplyToBot)
Extract: content (stripped of mention tags), channelId, member.displayName
Flow: sendTyping() → process → message.reply(response)
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
- `src/agent/roka.ts` adds further components on top before a request goes out — tool declarations, conversation history, recalled facts, overheard channel messages, and the current user message are examples of what gets added, not an exhaustive list.
- Some of those components carry their own bounds elsewhere in the code (e.g. `config.memory.retrievalTokenBudget`, `config.session.windowSize`, `config.memory.contextSize`) — for what a given request actually contains and how each piece is sized, read `assembleSystemPrompt` and the prompt-assembly path in `src/agent/roka.ts` directly rather than this doc.

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

Gemini failures are classified before a live response or background extraction is finalized. The live
path uses `liveMaxRetries = 2`: up to two retries after the initial call, with a 1s exponential base
backoff and full jitter. Retrying stops at whichever of two conditions is reached first: the ~12s
accumulated-backoff cap (`gemini.retryBackoffCapMs`), or the `gemini.turnDeadlineMs` wall-clock budget for
the whole retry loop. The deadline is evaluated only before a retry — never before the first attempt —
and admits one only when a full `gemini.timeout` still fits in the remaining budget; once either
condition is reached, the specified fallback behavior applies.

| Taxonomy             | Examples / Detection                                                                                                                                                                                                         | Retryable                                | Max Attempts                              | Backoff                                                          | Rate-Limiter Token                                                                                                                    | Session Action                                                        | User-Visible Result                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `transient_http`     | 429, 500, 503, overloaded, quota, `RESOURCE_EXHAUSTED`, or `UNAVAILABLE`                                                                                                                                                     | Yes                                      | `liveMaxRetries = 2` retries              | 1s exponential base with full jitter; stop at ~12s added latency | Yes; each retry consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)                                                    | Preserve                                                              | Real answer if a retry succeeds; generic fallback after exhaustion or when the RPM floor prevents a retry                                     |
| `network`            | `fetch failed`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, or abort-timeout                                                                                                                                                     | Yes                                      | `liveMaxRetries = 2` retries              | 1s exponential base with full jitter; stop at ~12s added latency | Yes; each retry consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)                                                    | Preserve                                                              | Real answer if a retry succeeds; generic fallback after exhaustion or when the RPM floor prevents a retry                                     |
| `empty_text`         | No parts; `finishReason` `STOP`, `OTHER`, or unset; or `MAX_TOKENS` with thoughts-only output                                                                                                                                | Yes                                      | `liveMaxRetries = 2` retries              | 1s exponential base with full jitter; stop at ~12s added latency | Yes; each retry consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)                                                    | Preserve                                                              | Real answer if a retry succeeds; generic fallback after exhaustion or when the RPM floor prevents a retry                                     |
| `safety`             | `SAFETY`, `PROHIBITED_CONTENT`, `BLOCKLIST`, or `SPII`                                                                                                                                                                       | No blind retry; one steered regeneration | 1 steered regeneration, one-shot per turn | None — the block is not rate-related                             | The regeneration consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)                                                   | Preserve                                                              | A generated in-character redirect when the regeneration succeeds; otherwise the static safety deflection: “Ehh… let's not get into that one~” |
| `session_corrupt`    | The Gemini 400 whose message reports a function-call turn immediately following a user turn                                                                                                                                  | Yes, once                                | 1 retry                                   | 1s exponential base with full jitter; stop at ~12s added latency | Yes; the retry consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)                                                     | Destroy the ADK session and rehydrate it from SQLite before the retry | Real answer if the rehydrated retry succeeds; otherwise the same in-character decline as `terminal`                                           |
| `recitation`         | Gemini recitation finish reason or equivalent response classification                                                                                                                                                        | Yes, once                                | 1 resample                                | 1s full-jitter resample delay                                    | Yes; the resample consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)                                                  | Preserve                                                              | Real answer if the resample succeeds; otherwise an in-character decline                                                                       |
| `terminal`           | 400, `INVALID_ARGUMENT`, authentication failure, or permission failure (bare status codes are matched last and digit-anchored, so a `400` inside a larger number — a quota figure, a token count — is not a terminal signal) | No                                       | 0 retries                                 | None                                                             | The initial user message consumes its token; no retry token is consumed                                                               | Destroy                                                               | In-character decline                                                                                                                          |
| `extraction_failure` | Any background memory-extraction failure                                                                                                                                                                                     | Only for a transient failure             | 1 light retry                             | Light full-jitter retry delay                                    | Yes; each extraction attempt, including its retry, consumes a token and may run only while `remainingRpm >= extractionRpmFloor` (`3`) | Preserve; background extraction never destroys the live session       | No user-facing message; quietly give up after the retry or immediately for a non-transient failure, and never block user traffic              |

Configurable thresholds are set on all four Gemini-API-supported harm categories
(`HARM_CATEGORY_HARASSMENT`, `HARM_CATEGORY_HATE_SPEECH`, `HARM_CATEGORY_SEXUALLY_EXPLICIT`,
`HARM_CATEGORY_DANGEROUS_CONTENT`) via `gemini.safetyThreshold` (default `OFF`). `PROHIBITED_CONTENT`,
`SPII`, and `BLOCKLIST` are server-side and not configurable, which is why the static safety deflection
path must remain even after the thresholds are relaxed.

### RPM-Budget Accounting

- A user message consumes one rate-limiter token today. Every live retry and every background extraction
  attempt, including an extraction retry, must also consume a token.
- Live retries require `remainingRpm >= retryRpmFloor` (`2`). Background extraction requires
  `remainingRpm >= extractionRpmFloor` (`3`); otherwise it is skipped so user traffic retains priority.
- Tool-chain calls up to `maxLlmCalls = 4` remain uncounted. This is known debt and is outside this
  reliability-policy change.

### Concurrency & Lifecycle Under Retry

- A concurrent message in a channel whose live turn is retrying is rejected by the per-channel guard
  with the existing in-character busy reply. It is dropped rather than queued or used to cancel the
  retrying turn; its content remains in the passive buffer for a later turn, and it consumes no
  rate-limiter token.
- The per-channel guard is now released within the turn deadline plus the pre-loop prologue (prompt
  assembly, memory retrieval, image download), rather than up to `(liveMaxRetries + 1) × gemini.timeout`
  as before — this is the blast-radius bound the deadline actually buys.
- Independent channels may retry concurrently. Cross-channel RPM contention is resolved by the
  synchronous `tryConsumeAboveFloor()` primitive, which is race-free under JavaScript run-to-completion.
  The extraction floor (`3`) exceeds the live-retry floor (`2`), so user-facing retries win over
  background extraction when tokens are scarce.
- An idle TTL cannot fire during a retry: `ttlMs` is much greater than the maximum retry window. If a
  session is nevertheless destroyed while its retry loop is in flight, the loop must resolve to a
  graceful fallback rather than throw.
- On `SIGTERM`, a retrying live turn aborts promptly within the existing 5s force-exit budget. This
  lifecycle behavior does not require a change to `index.ts`.
- The initial live attempt reuses the token already consumed by the Discord handler. Only subsequent
  retries consume additional rate-limiter tokens.

### ADK Error Delivery Constraint

Google ADK yields model-call errors as runner events rather than throwing them from `runner.runAsync()`.
Reliability handling must therefore classify yielded error events and `LlmResponse` fields before choosing
the taxonomy behavior above; it cannot rely solely on an outer `try`/`catch` around the runner.

When a candidate returns with no content parts, ADK's `createLlmResponse` sets `errorCode` to the
candidate's `finishReason` (e.g. the literal string `SAFETY`) and drops `candidate.safetyRatings` at that
same boundary, so the per-harm-category rating is never observable downstream — only the coarse
`finishReason`/`errorCode` token survives into the reliability loop.
