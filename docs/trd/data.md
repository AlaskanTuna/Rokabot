# Data Models and Storage

The shared data shapes, the SQLite tables and the modules that own them, and the outbound model request.

## At a Glance

- **Database:** one SQLite file, `data/rokabot.db`, opened through better-sqlite3 in `src/storage/database.ts`.
- **Canonical Store:** SQLite holds session history, memory claims, episodes, media digests, the extraction queue, reminders, games, telemetry, reports and spend.
- **In-Memory Window:** `WindowedSessionService` (`src/agent/session.ts`) keeps a per-channel ADK session. It rehydrates from `session_history` after a restart.
- **Schema Changes:** forward-only. Tables are created with `CREATE TABLE IF NOT EXISTS`, and new columns are added on startup.
- **Outbound Request:** one ADK agent (`roka`) calls the model that `llm.main` selects.

## Data Models

### WindowMessage

One text message in a channel window (`src/session/types.ts`). `loadHistory` returns these from `session_history`, and tone detection reads them.

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

| Field         | Type       | Description                                                                    |
| ------------- | ---------- | ------------------------------------------------------------------------------ |
| `tone`        | `ToneKey`  | The mood for the tone layer.                                                   |
| `hour`        | `number`   | Local hour (0–23) for the context layer.                                       |
| `displayName` | `string`   | Display name of the user being answered.                                       |
| `memory`      | `boolean`  | `false` on `/ask`. The core layer then drops guidance that names memory tools. |
| `forgetOnly`  | `boolean?` | `true` under `memory.privacy: off`. Only `forget_user` stays offered.          |

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

| Table                                                 | Contents                                                                                                                          | Owner                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `session_history`                                     | Channel messages: role, display name, content, timestamp, optional user ID and username.                                          | `src/storage/sessionStore.ts`                                          |
| `memory_claim`, `memory_evidence`, `memory_claim_fts` | User and guild claims, their evidence, and the FTS5 mirror of active claims.                                                      | `src/storage/memoryClaimSchema.ts`, `src/agent/memory/memoryClaims.ts` |
| `memory_episode`                                      | Episode summaries per guild and channel, with an optional embedding.                                                              | `src/storage/memoryEpisodeStore.ts`                                    |
| `memory_episode_cursor`                               | Per-channel episode checkpoint: guild, last message ID, open time, message count.                                                 | `src/storage/memoryEpisodeStore.ts`                                    |
| `extraction_queue`                                    | Closed episode payloads with `pending`, `processing` or `failed` status, attempts and retry time.                                 | `src/storage/extractionQueue.ts`                                       |
| `extraction_samples`                                  | Text of rejected conversations for offline labelling. Capped at 200 rows. Never read at runtime.                                  | `src/storage/extractionSampleStore.ts`                                 |
| `media_digest`, `media_occurrence`                    | Watched-media digests per guild and content key, with an optional embedding, and each place one was shared.                       | `src/storage/mediaDigestStore.ts`                                      |
| `memory_events`                                       | Value-free retrieval, claim-change, recall and extraction-run telemetry, plus `claim_reclassified` audit rows.                    | `src/storage/metricsStore.ts`, `src/agent/memory/reclassify.ts`        |
| `jev_events`                                          | Jev and main-model judgments: kind, question, answer, probability, confidence, applied, latency, tokens, baseline, job ID, judge. | `src/storage/jevEventStore.ts`                                         |
| `response_events`                                     | One row per reply turn: outcome, timings, retries, token estimates, tools, model, provider, failure marker.                       | `src/storage/metricsStore.ts`                                          |
| `failure_diagnostics`                                 | Detail for failed turns, including the triggering message verbatim.                                                               | `src/storage/metricsStore.ts`                                          |
| `extraction_events`                                   | Retained historical extraction telemetry.                                                                                         | `src/storage/metricsStore.ts`                                          |
| `reminders`                                           | Scheduled user reminders and delivery state.                                                                                      | `src/storage/reminderStore.ts`                                         |
| `game_scores`                                         | Game scores per user and game.                                                                                                    | `src/discord/events/games/*.ts`                                        |
| `gacha_daily`, `buddy`                                | Daily draw state and companion pets.                                                                                              | `src/games/buddy.ts`                                                   |
| `gacha_collection`                                    | Created at startup. No code reads or writes it.                                                                                   | `src/storage/database.ts`                                              |
| `user_names`                                          | Durable user ID to username and display name lookup.                                                                              | `src/storage/userNames.ts`                                             |
| `monitored_channels`                                  | Passive-monitoring channels and their expiry.                                                                                     | `src/agent/channelMonitor.ts`                                          |
| `bug_reports`                                         | `/report` submissions with context snapshot and attachment metadata.                                                              | `src/storage/reportStore.ts`                                           |
| `llm_spend`                                           | Estimated USD spend per UTC month and provider, read against `llm.monthlyBudgetUsd`.                                              | `src/storage/spendStore.ts`                                            |
| `update_notices`                                      | Release tags the owner was already told about, so each release is announced once.                                                 | `src/storage/updateNoticeStore.ts`                                     |

- **Vector Provenance:** `memory_episode`, `media_digest` and `memory_claim` carry `embedding_model_id`, `embedding_dim` and `embedding_fingerprint`. A vector stored without provenance is marked `unknown` at startup.
- **No Message Text:** `memory_events`, `jev_events` and `response_events` store no message text. `response_events.failure_marker` stores only the raw `finishReason` or error-code token, such as `SAFETY`.

### Retention

| Data                                                                  | Kept For                                                   | Pruned                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------- |
| `session_history`                                                     | `session.historyRetentionDays` (7 days)                    | At startup, then hourly    |
| `response_events`, `extraction_events`, `jev_events`, `memory_events` | `metrics.retentionDays` (90 days)                          | At startup, then daily     |
| `memory_events` rows of kind `claim_reclassified`                     | Kept; undo reads them                                      | Never by the metrics prune |
| `failure_diagnostics`                                                 | `metrics.diagnosticsRetentionHours` (72 hours)             | At startup, then hourly    |
| `extraction_samples`                                                  | `memory.extractionSampleDays` (14 days), 200 rows at most  | At startup, then daily     |
| Failed `extraction_queue` jobs                                        | `memory.failedExtractionRetentionDays` (7 days)            | At startup, then daily     |
| `memory_episode`                                                      | `memory.episodeRetentionDays` (90 days)                    | At startup, then daily     |
| `media_digest`, `media_occurrence`                                    | `memory.mediaRetentionDays` (90 days) after the last share | At startup, then daily     |
| `bug_reports`                                                         | Kept; independent of `metrics.retentionDays`               | Never                      |

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

- `src/session/types.ts`
- `src/utils/rateLimiter.ts`
- `src/agent/promptAssembler.ts`, `src/character/`, `characters/roka/moods.yml`
- `src/storage/database.ts`, `src/storage/memoryClaimSchema.ts`, `src/storage/vectorProvenance.ts`
- `src/storage/sessionStore.ts`, `src/storage/metricsStore.ts`, `src/storage/reportStore.ts`
- `src/agent/session.ts`, `src/agent/roka.ts`, `src/agent/safetySettings.ts`
- `src/index.ts` (prune schedule)
