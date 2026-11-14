# Data Models and Storage

The shared data shapes, the SQLite tables and the modules that own them, and the outbound model request.

## At a Glance

- **Database:** one SQLite file, `data/rokabot.db`, opened through better-sqlite3 in `src/storage/database.ts`.
- **Canonical Store:** SQLite holds session history, memory items (facts, episodes, media digests), the extraction queue, reminders, games, telemetry, reports and spend.
- **In-Memory Window:** `WindowedSessionService` (`src/agent/session.ts`) keeps a per-channel ADK session. It rehydrates from `session_history` after a restart.
- **Schema Changes:** forward-only. Tables are created with `CREATE TABLE IF NOT EXISTS`, and new columns are added on startup.
- **Outbound Request:** one ADK agent (`roka`) calls the model that `llm.main` selects.

## Data Models

### WindowMessage

One text message in a channel window (`src/storage/sessionStore.ts`). `loadHistory` returns these from `session_history`, and tone detection reads them.

| Field         | Type                    | Description                               |
| ------------- | ----------------------- | ----------------------------------------- |
| `role`        | `'user' \| 'assistant'` | Who sent the message.                     |
| `displayName` | `string`                | Discord display name of the sender.       |
| `content`     | `string`                | Message text.                             |
| `timestamp`   | `number`                | Unix time in ms when the message arrived. |

### RateLimiterConfig

Limits for one `RateLimiter` (`src/utils/rateLimiter.ts`).

| Field | Type     | Description                                                                                                                                                      |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rpm` | `number` | Most model calls admitted in any rolling 60 s window. A turn reserves `gemini.maxLlmCalls` slots and hands back the unused ones.                                 |
| `rpd` | `number` | Most daily units per UTC day. A turn reservation takes one unit and hands it back if it made no model call. A retry or a call outside a turn takes one unit too. |

- **One Limiter per Model:** `rateLimiterFor` keeps one limiter per `provider/model`. A limit the model entry does not set never refuses.
- **Gemini Defaults:** a Gemini entry inherits `rateLimit.rpm` (15), `rateLimit.rpd` (500) and `gemini.maxTokensPerMinute` (125000). `RATE_LIMIT_RPM` and `RATE_LIMIT_RPD` override the first two.
- **Shared Limiter:** `getSharedRateLimiter()` is the main model's limiter. The Discord turn guard, the retry gate and per-call budgets all use it.

### AssemblerInput

Input to `assembleSystemPrompt` (`src/agent/promptAssembler.ts`), which joins the four prompt layers.

| Field         | Type          | Description                                                                                                                                       |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tone`        | `ToneKey`     | The mood for the tone layer.                                                                                                                      |
| `hour`        | `number`      | Local hour (0–23) for the context layer.                                                                                                          |
| `displayName` | `string`      | Display name of the user being answered.                                                                                                          |
| `memoryScope` | `MemoryScope` | `'none'` on `/ask`, `'forget'` under `memory.privacy: off`, else `'full'`. The core layer then drops or narrows guidance that names memory tools. |

### ToneKey

The detected mood that selects the mood prompt. The list comes from the character pack's `moods.yml`; Roka's 12 are
below, with the criterion Jev uses for each (`moods.<mood>.judge`). `playful` is the default.
[Prompt Engine](./prompt-engine.md) covers detection order and triggers; [Jev Judgments](./jev.md) covers the
override. `src/agent/__tests__/promptAssembler.test.ts` fails when this table and the pack disagree.

| Value           | When It Fits                                                                                |
| --------------- | ------------------------------------------------------------------------------------------- |
| `'playful'`     | casual banter, jokes or light small talk; the default when nothing else fits                |
| `'sincere'`     | a real worry, a serious topic, or a request for honest advice                               |
| `'domestic'`    | food, cooking, meals, chores, home life, or looking after someone                           |
| `'flustered'`   | a compliment, flirting, romance, or an embarrassing remark aimed at Roka                    |
| `'curious'`     | something new or interesting is shared, or a topic worth exploring                          |
| `'annoyed'`     | Roka is being teased, ignored, or treated rudely, or someone repeats something she dislikes |
| `'tender'`      | someone is sad, lonely or hurting, or says something heartfelt and affectionate             |
| `'confident'`   | someone asks Roka for help or guidance, or for her to take charge                           |
| `'nostalgic'`   | memories, the past, old times, or how things have changed                                   |
| `'mischievous'` | pranks, schemes, dares, or playful plotting                                                 |
| `'sleepy'`      | late-night chat, tiredness, or going to bed                                                 |
| `'competitive'` | games, challenges, contests, bets or rivalry                                                |

## Persistence and Storage

### Database File

- **Path:** `data/rokabot.db` under the project root. `ROKABOT_DB_PATH` overrides it. The `data/` folder is created when missing.
- **Pragmas:** `journal_mode = WAL`, `synchronous = NORMAL`.
- **Lifecycle:** `getDb()` opens the file once, creates tables and runs migrations. Shutdown calls `closeDb()`.
- **Container:** `docker-compose.yml` mounts `./data` at `/app/data`, so the file survives container restarts. See [Deployment](./deployment.md).

### Tables

| Table                                                 | Contents                                                                                                                                                                                                                                                       | Owner                                                                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session_history`                                     | Channel messages: role, display name, content, timestamp, optional user ID and username.                                                                                                                                                                       | `src/storage/sessionStore.ts`                                                                                                                    |
| `memory_claim`, `memory_evidence`, `memory_claim_fts` | User and guild claims, their evidence, and the FTS5 mirror of active claims. Legacy tables dropped in production on 2026-11-14 via `--drop-legacy`; absent on dropped schemas.                                                                                 | `src/storage/memoryClaimSchema.ts`, `src/agent/memory/memoryClaims.ts`                                                                           |
| `memory_item`, `memory_item_fts`                      | Canonical typed item store and its active-fact FTS5 mirror. `item` writers maintain items directly (`dual` source triggers apply only on undropped schemas). FTS triggers remain on the item schema. `legacy_embedding_text` holds rendered claim vector text. | `src/storage/memoryItemSchema.ts`, `src/storage/memoryItemProjection.ts`, `src/storage/memoryItemStore.ts`, `src/agent/memory/memoryItems.ts`    |
| `memory_item_evidence`                                | Fact evidence, written in the same transaction as its lifecycle row; projection triggers fill legacy IDs only in `dual` on undropped schemas.                                                                                                                  | `src/storage/memoryItemSchema.ts`, `src/storage/memoryItemStore.ts`                                                                              |
| `memory_item_occurrence`                              | Media shares and episode spans, written in the same transaction as their parent transition; projection triggers fill legacy IDs only in `dual` on undropped schemas.                                                                                           | `src/storage/memoryItemSchema.ts`, `src/storage/memoryItemStore.ts`                                                                              |
| `memory_item_payload`                                 | Media `digest_json`, kept outside prompt-facing item reads.                                                                                                                                                                                                    | `src/storage/memoryItemSchema.ts`, `src/storage/memoryItemProjection.ts`                                                                         |
| `memory_item_embedding`                               | Vectors by item and fingerprint, with renderer, version and text hash. `item` writers set `text_hash` directly; legacy projection triggers leave it NULL until startup or daily maintenance fills it.                                                          | `src/storage/memoryItemSchema.ts`, `src/storage/memoryItemProjection.ts`, `src/storage/memoryItemIntegrity.ts`, `src/storage/memoryItemStore.ts` |
| `memory_legacy_drop`                                  | Single-row marker (`id = 1`, `dropped_at`, `detail`) recorded by `--drop-legacy` once the six legacy tables are dropped.                                                                                                                                       | `src/storage/memoryLegacyDrop.ts`                                                                                                                |
| `memory_episode`                                      | Episode summaries per guild and channel, with an optional embedding. Legacy table dropped in production on 2026-11-14 via `--drop-legacy`; episodes live in `memory_item`.                                                                                     | `src/storage/memoryEpisodeStore.ts`                                                                                                              |
| `memory_episode_cursor`                               | Per-channel episode checkpoint: guild, last message ID, open time, message count.                                                                                                                                                                              | `src/storage/memoryEpisodeStore.ts`                                                                                                              |
| `memory_episode_line`                                 | Open episode text, saved at capture and deleted at flush: one row per message.                                                                                                                                                                                 | `src/storage/memoryEpisodeStore.ts`                                                                                                              |
| `extraction_queue`                                    | Closed episode payloads with `pending`, `processing` or `failed` status, attempts and retry time.                                                                                                                                                              | `src/storage/extractionQueue.ts`                                                                                                                 |
| `extraction_samples`                                  | Text of rejected conversations for offline labelling. Capped at 200 rows. Never read at runtime.                                                                                                                                                               | `src/storage/extractionSampleStore.ts`                                                                                                           |
| `media_digest`, `media_occurrence`                    | Watched-media digests per guild and content key, with an optional embedding, and each place one was shared. Legacy tables dropped in production on 2026-11-14 via `--drop-legacy`; media lives in `memory_item`.                                               | `src/storage/mediaDigestStore.ts`                                                                                                                |
| `memory_events`                                       | Value-free retrieval, claim-change, recall and extraction-run telemetry, `claim_reclassified` audit rows, and per-kind `item_integrity` drift counts.                                                                                                          | `src/storage/metricsStore.ts`, `src/agent/memory/reclassify.ts`, `src/storage/memoryItemIntegrity.ts`                                            |
| `jev_events`                                          | Jev and main-model judgments: kind, question, answer, probability, confidence, applied, latency, tokens, baseline, job ID, judge.                                                                                                                              | `src/storage/jevEventStore.ts`                                                                                                                   |
| `response_events`                                     | One row per reply turn: outcome, timings, retries, token estimates, tools, model, provider, failure marker, and format telemetry (`format_kinds`, `format_outcome`, `format_detail`).                                                                          | `src/storage/metricsStore.ts`                                                                                                                    |
| `failure_diagnostics`                                 | Detail for failed turns, plus `kind: 'format_unmet'` rows (`outcome: 'ok'`) when an explicit format request stayed unmet, including the triggering message verbatim.                                                                                           | `src/storage/metricsStore.ts`                                                                                                                    |
| `extraction_events`                                   | Retained historical extraction telemetry.                                                                                                                                                                                                                      | `src/storage/metricsStore.ts`                                                                                                                    |
| `reminders`                                           | Scheduled user reminders and delivery state.                                                                                                                                                                                                                   | `src/storage/reminderStore.ts`                                                                                                                   |
| `game_scores`                                         | Game scores per user and game.                                                                                                                                                                                                                                 | `src/discord/commands/games/*.ts`                                                                                                                |
| `gacha_daily`, `buddy`                                | Daily draw state and companion pets.                                                                                                                                                                                                                           | `src/games/buddy.ts`                                                                                                                             |
| `gacha_collection`                                    | Created at startup. No code reads or writes it.                                                                                                                                                                                                                | `src/storage/database.ts`                                                                                                                        |
| `user_names`                                          | Durable user ID to username and display name lookup.                                                                                                                                                                                                           | `src/storage/userNames.ts`                                                                                                                       |
| `monitored_channels`                                  | Passive-monitoring channels and their expiry.                                                                                                                                                                                                                  | `src/agent/memory/channelMonitor.ts`                                                                                                             |
| `bug_reports`                                         | `/report` submissions with context snapshot and attachment metadata.                                                                                                                                                                                           | `src/storage/reportStore.ts`                                                                                                                     |
| `llm_spend`                                           | Estimated USD spend per UTC month and provider, read against `llm.monthlyBudgetUsd`.                                                                                                                                                                           | `src/storage/spendStore.ts`                                                                                                                      |
| `update_notices`                                      | Release tags the owner was already told about, so each release is announced once.                                                                                                                                                                              | `src/storage/updateNoticeStore.ts`                                                                                                               |

- **Vector Provenance:** on undropped legacy schemas, `memory_episode`, `media_digest` and `memory_claim` carry `embedding_model_id`, `embedding_dim` and `embedding_fingerprint`. A vector stored without provenance is marked `unknown` at startup.
- **Typed Memory:** startup creates the additive `memory_item*` schema. In `legacy` and `item`, source projection triggers are dropped. In `dual`, triggers mirror the five legacy source tables in the same transaction; startup and daily maintenance record value-free source drift counts and fill NULL embedding hashes. `dual` reads legacy tables; `item` reads and writes prompt-facing memory through the scoped item API, sets `text_hash` directly, reserves new item IDs above legacy IDs, and checks item-native invariants. Production runs `MEMORY_STORE=item` in `.env` (`config.yml` stays `legacy`), with 0 projection triggers and the six legacy tables dropped on 2026-11-14 via `npm run migrate:memory-items -- --drop-legacy --backup <path>` (`memory_legacy_drop` recorded). Startup never recreates dropped tables, and only `item` starts on a dropped schema; rollback restores the pre-drop backup. On undropped schemas, `npm run migrate:memory-items` is an explicit catch-up and `-- --to-legacy` exports items to legacy rows in one transaction. The offline simulator (`npm run memsim`) gated each phase with no production soak or in-production shadow read.
- **No Message Text:** `memory_events`, `jev_events` and `response_events` store no message text. `response_events.failure_marker` stores only the raw `finishReason` or error-code token, such as `SAFETY`; `format_outcome` records `met`, `repaired`, `unmet` or `suppressed`; and `format_kinds` / `format_detail` store requested formats, rule IDs, requested bounds, check booleans, repair kind, mode and suppression reason only.

### Retention

| Data                                                                                                         | Kept For                                                   | Pruned                     |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------- |
| `session_history`                                                                                            | `session.historyRetentionDays` (7 days)                    | At startup, then hourly    |
| `response_events`, `extraction_events`, `jev_events`, `memory_events`                                        | `metrics.retentionDays` (90 days)                          | At startup, then daily     |
| `memory_events` rows of kind `claim_reclassified`                                                            | Kept; undo reads them                                      | Never by the metrics prune |
| `failure_diagnostics`                                                                                        | `metrics.diagnosticsRetentionHours` (72 hours)             | At startup, then hourly    |
| `extraction_samples`                                                                                         | `memory.extractionSampleDays` (14 days), 200 rows at most  | At startup, then daily     |
| Failed `extraction_queue` jobs                                                                               | `memory.failedExtractionRetentionDays` (7 days)            | At startup, then daily     |
| `memory_item` (`kind = 'episode'`; `memory_episode` if undropped)                                            | `memory.episodeRetentionDays` (90 days)                    | At startup, then daily     |
| `memory_item` (`kind = 'media'`), `memory_item_occurrence` (`media_digest`, `media_occurrence` if undropped) | `memory.mediaRetentionDays` (90 days) after the last share | At startup, then daily     |
| `bug_reports`                                                                                                | Kept; independent of `metrics.retentionDays`               | Never                      |

Claim lifetimes depend on the predicate. See [Memory](./memory.md).

### Bug Reports

`/report` is a global command in guilds, bot DMs and group DMs with user installs. It writes straight to SQLite. It uses no LLM, rate limiter or session state.

- **Input:** a required `type` (`bug`, `wrong_answer`, `unsafe` or `other`), a required message of up to 1,500 characters, and one optional attachment.
- **Reply:** an ephemeral deferral, then the saved report ID.
- **Limit:** `report.maxPerUserPerHour` (5) reports per user per rolling hour.
- **Row:** `id`, `created_at`, `type`, `status` (`open` for new reports), `message`, user and guild context, `interaction_id`, `locale`, attachment metadata, `bot_version`, `git_commit`, `gemini_model`, `fallback_model`, `uptime_s` and `context_json`.
- **Snapshot:** `context_json` holds the channel's last `report.historyMessages` (20) `session_history` rows, up to 10 `response_events`, 5 `failure_diagnostics` and 5 `jev_events`, all within `report.historyMaxAgeMs` (2 hours). User history rows keep their user IDs. The snapshot is capped at 64 KiB by dropping the oldest entries first. A failed section query logs a warning and keeps the other sections.
- **Attachment:** copied only from `cdn.discordapp.com` or `media.discordapp.net`, and only when the declared and streamed size is at most `report.maxAttachmentBytes` (8 MiB). Copies go to `data/reports/`. When no copy is saved, the row keeps the metadata and the reason.

## Outbound Model Request

Every reply turn runs the ADK `LlmAgent` named `roka` on the model that `llm.main` selects. [Models](./models.md) covers profiles, fallback and hedging.

| Part               | Contract                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System Instruction | The composed system prompt: the pack's static sections, mood and situation from `assembleSystemPrompt`, the turn context blocks, then `## Reply Shape`. |
| History            | Rehydrated `session_history`. User lines read `[displayName]: content`. Assistant lines are plain content.                                              |
| Current Message    | `[displayName]: message`.                                                                                                                               |
| Generation Config  | `temperature` 0.9, `topP` 0.95, `maxOutputTokens` from `gemini.maxOutputTokens` (500), timeout `gemini.timeout`.                                        |
| Safety Settings    | Harassment, hate speech, sexually explicit and dangerous content, all at `gemini.safetyThreshold` (default `OFF`).                                      |
| Call Budget        | `runConfig.maxLlmCalls` is `gemini.maxLlmCalls` (4) minus the turn's media watcher calls, and at least 1.                                               |

- **Prompt Size:** `MAX_SYSTEM_PROMPT_TOKENS` in `tests/harness/tokens.ts` caps the assembled static prompt plus mood and situation. `tests/harness/__tests__/tokens.test.ts` enforces it. The cap exists to detect prompt growth.
- **Other Bounds:** `memory.retrievalTokenBudget`, `session.windowSize` and `memory.contextSize` size their own blocks. `createTurnContext` in `src/agent/turnContext.ts` shows what each request holds.

## Source Files

- `src/storage/sessionStore.ts`
- `src/utils/rateLimiter.ts`
- `src/agent/promptAssembler.ts`, `src/character/`, `characters/roka/moods.yml`
- `src/storage/database.ts`, `src/storage/memoryClaimSchema.ts`, `src/storage/memoryItemSchema.ts`, `src/storage/memoryItemProjection.ts`, `src/storage/memoryItemBackfill.ts`, `src/storage/memoryItemIntegrity.ts`, `src/storage/memoryItemStore.ts`, `src/storage/memoryLegacyDrop.ts`, `src/storage/memoryRecallStore.ts`, `src/storage/memoryVector.ts`, `src/storage/vectorProvenance.ts`
- `src/storage/sessionStore.ts`, `src/storage/gameStore.ts`, `src/storage/statsStore.ts`, `src/storage/metricsStore.ts`, `src/storage/reportStore.ts`
- `src/agent/session.ts`, `src/agent/roka.ts`, `src/agent/llm/safetySettings.ts`
- `src/index.ts` (prune schedule)
