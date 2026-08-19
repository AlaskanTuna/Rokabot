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
Filter: isChatInputCommand() && commandName === 'ask'
Extract: interaction.options.getString('question'), channelId, user.displayName
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
  an idle bot, so it would be refused permanently rather than delayed. The default therefore sits only 2 MB
  above its own floor, and that is deliberate — one turn carrying three 10 MB documents reserves 30 MB and
  holds off every other channel until it completes. That is the budget working, made visible by the busy
  reply rather than silent; `discord.maxInFlightAttachmentBytes` is the knob to loosen it.
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
latency against `gemini.timeout`, not by container memory. See `docs/multimodal.md`.

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
  without decoding — the same argument `docs/multimodal.md` makes against enforcing duration caps. Left at
  zero deliberately rather than estimated.
- **Both surfaces admit the same set.** `/ask` and the mention path each filter with `isSupportedMedia`.
  The forwarded, referenced and embed sub-paths on the mention path remain images-only, because their text
  markers describe what they carry as images.
- **`attachment_url` is images-only**, narrower than the upload slots beside it. It is the SSRF-guarded path
  that makes the Pi fetch a user-named host, so its type set is a security decision rather than a feature
  one; widening it belongs in its own change.

### Attachment Token Admission

Size does not bound token cost, so the byte ceilings above do not bound the bill. A 17 KB PDF is 50 pages at a
measured ~560 tokens each — 28,001 tokens from a file small enough to pass every check on the way in — and
three 200-page PDFs reach 341,543 tokens in a single request, over the whole 250,000 TPM ceiling. `roka.ts`
therefore prices the parts with `countTokens` before sending them and refuses the turn's attachments above
`gemini.maxAttachmentTokens`, rather than letting the request fail on a 429 that would retry into the same
wall and spend the minute's budget for every other channel.

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
  idiom as `retryRpmFloor` and `extractionRpmFloor`. Accounting happens afterwards in `roka.ts`, charging
  what was actually sent.
- **Over-budget takes the existing in-character busy reply,** exactly as `byteBudget` does, and is asked
  before the byte reservation so a declined turn has taken nothing it must hand back. No new counter, notice,
  or message pool: the condition is transient and "she is swamped" is what it means.
- **Text turns are never gated.** `rateLimit.rpm` already bounds them to about a third of the minute, and
  gating them would refuse ordinary conversation to protect a quota conversation does not threaten. The
  `NUMERIC_BOUNDS` floor pins `maxTokensPerMinute >= maxAttachmentTokens`, so a budget too small to ever
  admit an attachment is rejected at startup rather than silently refusing every one.
- **The charge is measured where measuring was already paid for.** The `countTokens` probe above already runs
  for non-image turns and its answer was previously compared to the ceiling and discarded; it is now kept as
  the attachment term. Image-only turns charge the flat 1,089 each. No probe is ever added to feed the
  budget — a round trip that re-uploads a file to price it is the resource being rationed.
- **A refused turn is not charged.** It never reaches `generateContent`, so it spends none of the quota this
  bucket meters, and charging it would refuse other channels for spend that did not happen. The bandwidth
  path is already bounded upstream: `rateLimiter.tryConsume()` runs in the handler before `generateResponse`,
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

### Attachment Bytes Do Not Live in History

ADK's runner appends the incoming message to the session verbatim, and nothing in the framework removes it.
`inlineData` parts therefore stayed in the live event list and were **re-sent to Gemini as conversation
history on every later turn** until they aged out of the window, the idle TTL fired, or the bot restarted.
Measured before the fix: ~11.5 MB of heap retained per attachment, accumulating turn over turn and released
only on teardown, and a five-minute clip re-charged on every turn that followed it.

`WindowedSessionService.stripAttachmentBytes` replaces those bytes with a text marker — `(an image)`,
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
