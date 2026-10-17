# Memory

The contract for what Roka learns from server conversations, how she stores it, and how it reaches the prompt.

## At a Glance

| Item       | Contract                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Scope      | Guild channels only. DMs, group DMs and `/ask` never read or write long-term memory.                       |
| Tenant     | `guild_id` is the Discord server. Claims, summaries and media digests never cross servers.                 |
| Write Path | Monitored message, episode, `extraction_queue`, admission, typed extraction, verification, writes.         |
| Judge      | Jev with `TYPESAFE_API_KEY`. Otherwise the main model if `config.yml` has an `llm:` block. Otherwise none. |
| Recall     | `memory.recall`: `legacy`, `shadow` (default) or `unified`.                                                |
| Privacy    | `memory.privacy`: `relaxed` (default), `balanced`, `strict` or `off`.                                      |
| Timing     | Memory work is asynchronous. It never blocks the reply that captured the messages.                         |

Deployer view: [Memory Guide](../guide/memory.md). Judge internals: [Jev](jev.md). Model routes: [Models](models.md).

## Subjects

- **User Claims:** `subject_kind = 'user'` with a `subject_user_id`.
- **Guild Facts:** `subject_kind = 'guild'` with a NULL `subject_user_id`.
- **Episode Summaries and Media Digests:** stored apart from claims.
- **Monitoring:** a mention, a reply to Roka or her name keyword marks a channel monitored for
  `memory.channelMonitorTtlMs` (24 h), persisted in `monitored_channels`. Only monitored guild channels feed episodes.
  Roka's own lines enter as bot context only.

## Storage Schema

All tables live in `data/rokabot.db`. `memory_claim`, `memory_episode` and `media_digest` also carry
`embedding_model_id`, `embedding_dim` and `embedding_fingerprint`.

| Table                   | Columns                                                                                                                                                                                                                                                                                                                                                      | Contract                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `memory_claim`          | `id`, `guild_id`, `subject_kind`, `subject_user_id`, `predicate`, `value`, `period`, `object_kind`, `object_user_id`, `source_kind`, `status`, `confidence`, `salience`, `pinned`, `needs_review`, `superseded_by`, `expires_at`, `event_date`, `first_seen_at`, `last_seen_at`, `last_recalled_at`, `ended_at`, `end_reason`, `embedding`, `embedding_text` | User rows need a user ID, guild rows NULL. Guild `upcoming_event` and `plan` need `expires_at`. Both dedup indexes include `period`. |
| `memory_evidence`       | `id`, `claim_id`, `channel_id`, `source_kind`, `observed_at`, `effective_at`                                                                                                                                                                                                                                                                                 | One row per observation. Passive rows use the latest episode message time. `effective_at` equals it.                                 |
| `memory_claim_fts`      | `value`, `predicate`                                                                                                                                                                                                                                                                                                                                         | FTS5 mirror of active claims, kept by triggers.                                                                                      |
| `memory_episode_cursor` | `channel_id`, `guild_id`, `last_message_id`, `opened_at`, `message_count`                                                                                                                                                                                                                                                                                    | Per-channel checkpoint of the open episode.                                                                                          |
| `extraction_queue`      | `id`, `guild_id`, `channel_id`, `payload`, `status`, `attempts`, `enqueued_at`, `available_at`, `transient_retries`                                                                                                                                                                                                                                          | `pending`, `processing` or `failed`. Success deletes the row. A failed row keeps its payload.                                        |
| `memory_episode`        | `id`, `guild_id`, `channel_id`, `started_at`, `ended_at`, `summary`, `embedding`, `created_at`                                                                                                                                                                                                                                                               | One summary per queue job ID (the idempotency key). Nullable vector.                                                                 |
| `media_digest`          | `id`, `guild_id`, `content_key`, `kind`, `label`, `summary`, `digest_json`, `embedding`, `created_at`                                                                                                                                                                                                                                                        | One digest per `(guild_id, content_key)`.                                                                                            |
| `media_occurrence`      | `id`, `digest_id`, `guild_id`, `channel_id`, `message_id`, `shared_by_user_id`, `source_author_id`, `origin`, `observed_at`                                                                                                                                                                                                                                  | One row per share, unique per `(digest_id, message_id)`.                                                                             |
| `memory_events`         | `id`, `kind`, `guild_id`, `channel_id`, `subject_user_id`, `duration_ms`, `n_candidates`, `n_selected`, `n_changed`, `tokens_est`, `op`, `created_at`, `detail`                                                                                                                                                                                              | Value-free. Kinds: `retrieval`, `context_build`, `recall`, `recall_shadow`, `extraction_run`, `claim_reclassified`.                  |
| `jev_events`            | `kind`, `guild_id`, `channel_id`, `question`, `answer`, `probability`, `confidence`, `applied`, `latency_ms`, `input_tokens`, `baseline`, `job_id`, `created_at`, `judge`                                                                                                                                                                                    | No message text. `kind` is `turn`, `admission` or `verification`.                                                                    |
| `extraction_samples`    | `id`, `job_id`, `guild_id`, `channel_id`, `outcome`, `admission_probability`, `lines`, `created_at`, `expires_at`                                                                                                                                                                                                                                            | Private text of rejected episodes. No prompt reads it.                                                                               |

The queue payload holds the delta messages, up to three earlier context lines, and the start and end times.

## Write Path

![Passive Memory Write Path](../diagrams/memory-write-path.svg)

_A monitored message becomes an episode, a queued job, a judged extraction, and then claims, a summary and vectors._

### Capture

1. Each monitored guild message enters the channel buffer, and the cursor counts it as a delta.
2. The episode closes after `memory.episodeLullMs` (180 s) of silence or at `memory.episodeMaxMessages` (25) deltas,
   capped at `memory.bufferSize - 3` so three context lines fit.
3. The queue insert and cursor advance share one SQLite transaction.
4. Startup converts legacy array payloads to the episode shape, keeps every row and status, and returns `processing`
   rows to `pending`.

### Scheduling and Retries

The scheduler is per-guild round-robin. It runs one job per guild at a time, oldest first. Under `memory.privacy: off`
capture stops and the scheduler does not drain.

| Failure                                                               | Class       | Queue Action                                                                                     |
| --------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| HTTP 429/500/502/503/504, quota, network, timeout, non-shutdown abort | `transient` | Retry after 1, 5, 20, then 60 min, spending no attempt. The fifth counts as an ordinary failure. |
| The admission judge gave no answer (`jev_unavailable`)                | `unjudged`  | One retry after 5 min. A second miss deletes the job.                                            |
| Anything else, such as billing or a refusal                           | `permanent` | Requeue once. The second ordinary failure leaves the row `failed`.                               |

Delayed jobs keep FIFO order and wake the scheduler at `available_at`. `failed` rows older than
`memory.failedExtractionRetentionDays` (7, from enqueue) are pruned at startup and daily. There is no queue-size
limit, daily budget ratio or extraction RPM floor.

### Admission

- **Precheck:** `sensitive` if any delta matches an email, phone, credential, legal name, age or birthday, address,
  school or workplace, medical or social-handle pattern. `trivial` if every delta is empty, a greeting, a short
  reaction or emoji only. Both drop locally.
- **Judgment:** one `lasting_fact` question. Admit at or above `memory.admitThreshold` (0.5, Jev) or
  `memory.modelAdmitThreshold` (0.7, main model). No judge, a timeout or an unusable answer drops the episode.
- **Judge:** `memory.judge` is derived: `jev` with `TYPESAFE_API_KEY`; `model` without it when an `llm:` block exists;
  `none` otherwise, which drops every episode and warns once at startup. See [Jev](jev.md).
- **Timeouts:** `jev.memoryTimeoutMs` (5000 ms) bounds Jev admission and verification. A main-model judgment uses its
  route's timeout.

### Extraction

The legacy config runs `gemini.extractionModel` (default `gemini.model`) with no fallback. An `llm:` block runs the
main model, then the fallback once. The prompt carries the human user IDs, the active claims and guild facts this
channel may recall, up to three context lines (background only) and the deltas. The model returns a strict operation
list and a one-to-two-sentence summary.

| Operation | Subjects    | Effect                                                                                |
| --------- | ----------- | ------------------------------------------------------------------------------------- |
| `add`     | User, guild | Insert or refresh an active claim. A user add has a `tense`.                          |
| `update`  | User, guild | Replace a current claim of the same subject and predicate, linked by `superseded_by`. |
| `remove`  | User, guild | Reject a claim that was never true or names the wrong person. The row stays.          |
| `retract` | User only   | End a fact that was true and has ended. Names a predicate and value, not a claim ID.  |
| `noop`    | None        | No change.                                                                            |

Prompt rules:

- **Restatement:** `add` with the exact existing value. Never add a rewording. `noop` only when nothing durable came up.
- **Tense:** user adds and updates are `current`, `past` ("I used to play chess") or `planned`.
- **Switch:** "switched from chess to go" is a `retract` of the old value plus an `add` of the new.
- **Past Claims:** listed with `"period": "past"`, never updated or removed. History is an `add` of tense `past`.
- **Predicates:** the most specific one over `misc`. A game they play is `hobby` unless they call it their favorite.
  A retract of a listed fact uses its listed predicate.

Write guards: a user subject (and object user) must be a human author of the deltas. `privacyGuard.ts` rejects
sensitive keys and values shaped like emails, phone numbers, account numbers or API credentials. `planned` ops drop.

### Guild Facts and Dates

Guild predicates: `upcoming_event`, `plan`, `running_joke`, `place`, `rule`, `announcement`. Only `upcoming_event` and
`plan` take a date, and they require one. The others never expire.

- **Accepted:** `year`/`month`/`day`; `month`/`day` (next occurrence); bare `month` with optional `year`; `today`,
  `tomorrow`; `this_week` or `next_week` with a weekday; `this_month`, `next_month`.
- **Rejected:** missing, impossible, past or contradictory dates. A weekday must match the resolved date.
- **Schema:** three branches (`month` + `day`, `month` only, `relative`). `year` only when stated, since the prompt has
  no current date.
- **Resolution:** local date of the latest episode message in `timezone` (or `TZ`). Day precision expires at the next
  local midnight, month precision at the next month. `expires_at` is epoch ms; `event_date` is `YYYY-MM-DD` or `YYYY-MM`.

### Verification

Every write op gets `durable_N` and `attributed_N` (user) or `guild_scoped_N` (guild). An `add` gets `same_as_N_M` per
same-subject, same-predicate, same-period claim. Past ops and retracts get their own durability wording.

| Key            | Asked For                                                           | Below Threshold                               |
| -------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| `current_N`    | Every user add and update: true of the subject now?                 | It cannot be written as current               |
| `past_N`       | Every user add and update: true at some earlier time?               | With `current_N` failing too, the op drops    |
| `changes_N`    | Every user update: does it change claim #ID into a different fact?  | Becomes evidence on the target; wording stays |
| `retracts_N_M` | A retract, per visible current claim in its category (best 5 first) | That claim is not retired                     |

Thresholds are `memory.verifyThreshold` (0.5, Jev) or `memory.modelVerifyThreshold` (0.7, main model). Verification is
complete only when every key has a probability in 0..1.

With complete verification:

1. **Gate:** durability and attribution (or scope) must hold.
2. **Period:** current if `current_N` holds on a `current` op; else past if `past_N` holds; else dropped.
3. **Still True:** a past op whose `current_N` holds only adds evidence to the matching current claim.
4. **Past Facts:** write or refresh a `period = 'past'` row. Past and current rows never supersede, revive or replace
   each other. A current update aimed at a past claim writes a new current fact.
5. **Duplicates:** an exact active value adds evidence even below the `same_as` threshold. Other duplicates must pass.
6. **Retraction:** retires each visible current claim whose `retracts_N_M` holds (`end_reason = 'retracted'`).
   Candidates span the predicate category, ordered by value match, then own predicate, then listing order.
7. **Order:** multi-value retracts first (to free a cap slot), then all other ops, then single-value retracts, so a
   retract-then-add switch lets the add supersede the old value and inherit its pin.
8. **Pins:** a verified op that supersedes a pinned current claim writes `pinned = 1`.

With incomplete verification, adds and updates stage as `candidate` with `needs_review`. A candidate never retires a
fact, never inherits a pin and never refreshes an active duplicate. Removes and retracts are not applied.

Admission writes one `jev_events` row (`kind = 'admission'`, `lasting_fact`). Complete verification writes one row
per key with the job in `job_id`. `judge` is `provider:model` for the main model and NULL for Jev.

## Hidden-Fact Reconciliation

Under `balanced` and `strict`, the extractor and judge see only claims this channel may recall. After the write
transaction, `reconcileHiddenRetractions` handles each verified `retract`:

1. **Candidates:** the subject's active current claims in the same category, not under review, not visible here.
2. **Ranking:** cosine similarity of the retracted fact's sentence to each stored claim vector. Top 3; no vector, skip.
3. **Judgment:** one judge call. Each candidate at or above the verify threshold retires with `retracted` and counts in
   `ops.retracted`.

Nothing hidden reaches the prompt, reply or logs (logs carry IDs, predicate and counts). `relaxed` and `off` make no
calls. The pass never throws; a failure retires nothing.

## Extraction Run Trace

Each attempt writes one best-effort `memory_events` row, `kind = 'extraction_run'`, from `runJob`'s `finally`. It holds
counts, message IDs, timings and model names, never text, display names or error messages. Columns: `duration_ms`
(attempt), `n_candidates` (ops proposed, no `noop`), `n_selected` (applied, staged included), `n_changed`,
`tokens_est` (admission + extraction + verification input).

| `detail` Field                    | Meaning                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `jobId`, `attempt`                | Job and `attempts + transientRetries + 1`                                                              |
| `firstMessageId`, `lastMessageId` | First and last delta IDs; NULL when empty                                                              |
| `messageCount`, `humanCount`      | Deltas, and how many came from non-bots                                                                |
| `stage`                           | `precheck`, `admission`, `extraction`, `verification` or `applied`                                     |
| `outcome`                         | `admitted`, `trivial`, `sensitive`, `below_threshold`, `jev_unavailable`, `noop`, `written` or `error` |
| `errorClass`, `errorStatus`       | `transient`, `permanent` or `unjudged`, and the HTTP status                                            |
| `admission`                       | `{ probability, threshold }`                                                                           |
| `ops`                             | `{ proposed, applied, duplicate, staged, dropped, changed, past, reword, retracted }`                  |
| `summary`                         | `{ kept, chars, boilerplate }`                                                                         |
| `stageMs`                         | `{ admission, extraction, verification, persistence }`                                                 |
| `models`                          | `{ extraction, jev, embedding }`: `gemini.extractionModel`, `jev.model`, the embedding model           |

A retried job writes one row per attempt. A summary persistence failure records `stage: 'applied'`, `outcome: 'error'`.

`extraction_samples` keeps text of rejected episodes for offline labelling:

- **Eligible:** `trivial` or `below_threshold` only (a `CHECK`). Never `sensitive`, `jev_unavailable` or under `off`.
- **Selection:** a job-ID hash at `memory.extractionSampleRate` (0.1; 0 disables), stable across retries.
- **Contents:** IDs, outcome, admission probability and `[displayName]: content` lines. No user IDs.
- **Bounds:** expires after `memory.extractionSampleDays` (14), pruned at startup and daily, at most 200 rows.

## Claim Lifecycle and Retention

Statuses: `candidate` (staged; excluded from recall, nickname lookup and the cap), `active`, `superseded`, `rejected`.
A candidate activates through a later verified assertion or, for user claims, `activateClaim`.

| `end_reason`   | Set When                                                 |
| -------------- | -------------------------------------------------------- |
| `superseded`   | A single-value current write replaced it                 |
| `removed`      | A `remove` op, or an undone reclassification             |
| `retracted`    | A verified retraction, visible or hidden                 |
| `forgotten`    | `forget_user`                                            |
| `evicted`      | The active-claim cap                                     |
| `expired`      | Tier retention, guild-fact expiry, stale guild candidate |
| `self`         | The subject is Roka herself                              |
| `reclassified` | Moved to another predicate (`superseded_by` links it)    |

Every end sets `ended_at` and `end_reason`; rows ended before those columns got the migration time and NULL. Startup
raises active claims' `last_seen_at` to their newest evidence.

- **Timestamps:** `last_seen_at` only moves forward and drives expiry. `last_recalled_at` changes only when recall
  selects the claim.
- **Period:** `current` or `past`, part of both dedup indexes. Several past values of a single-value predicate coexist.
- **Revival:** an assertion revives an ended value in its own row and clears `superseded_by`, `ended_at`, `end_reason`.
  It matches `period`. A candidate revival stays a candidate. Guild revivals take the new `expires_at`/`event_date`.
- **Forgotten:** a passive assertion never revives a `forgotten` value in any period. `remember_user` can, and pins it.
- **Pins:** `remember_user` pins. A verified correction of a pinned single-value current fact keeps the pin, set before
  the cap runs.

### Retention Tiers

The prune runs at startup and daily. It expires unpinned user candidates and active claims by `last_seen_at`:

| Tier      | Setting                              | Default | Predicates                                                                                                                              |
| --------- | ------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Stable    | `memory.stableClaimRetentionDays`    | 180     | Identity and social: `nickname`, `language_spoken`, `nationality`, `pronouns`, `relationship_to`, `friend_group`, `communication_style` |
| Standard  | `memory.claimRetentionDays`          | 30      | Lifestyle, interests and personality, except `currently_watching`                                                                       |
| Transient | `memory.transientClaimRetentionDays` | 14      | Opinions, `misc` and `currently_watching`                                                                                               |

- **Guild Facts:** keep their date expiry. Unexpired guild candidates expire after `memory.claimRetentionDays`.
- **Cap:** `memory.maxActiveClaimsPerUser` (20) active unpinned claims per member. Eviction takes past facts first, then
  lowest salience, then oldest. Pinned claims and candidates do not count.
- **Dead Rows:** `rejected` and `superseded` rows older than `memory.deadClaimRetentionDays` (30) are deleted with
  their evidence. A value revives in place only while its row exists. Until then, any claim row is a guild-presence
  hint for name lookup.

The predicate list and tiers live in `src/agent/memory/predicates.ts`.

## Fact Reclassification

`reclassifyClaims` (`reclassify.ts`, `reclassifyModels.ts`) moves misfiled facts, at startup and daily after the prune.

- **Limits:** never under `off`. `memory.reclassifyMaxPerRun` (env `MEMORY_RECLASSIFY_MAX_PER_RUN`, 20, bounded 0..100)
  caps moves per run; 0 turns it off.
- **Candidates:** active current `misc` claims, plus the weaker side of an equal-value pair under two predicates (the
  `misc` one, else lower salience, else newer). Up to `min(100, 5 × cap)` in random order. Undone moves are never
  offered again.
- **Proposal:** one call on the extraction model route returns a predicate or `keep`. `misc` and `relationship_to` are
  never targets.
- **Confirmation:** one judge call asks `fits_<id>` for at most `cap` proposals, held to the verify threshold.
- **Move:** one transaction retires the old row (`reclassified`), writes the value as an active, verified fact under
  the new predicate, copies evidence, keeps the pin and `first_seen_at`, and links old to new. It rolls back if it would
  end any other fact. It skips a value the member retracted or forgot.
- **Audit:** `claim_reclassified` rows with `detail` `{ oldId, newId, from, to, probability, created }`, no values,
  exempt from the `metrics.retentionDays` prune.
- **Undo:** `undoReclassify(oldClaimId)` reactivates the old row and, when `created`, ends the replacement as
  `removed`. Dev: `npm run memory:undo-reclassify -- <old claim id>`. Production: [Runbook](../runbook.md).

## Privacy Modes

`memory.privacy` (env `MEMORY_PRIVACY`) sets where memory may be recalled. It never changes what was learned, so it can
change or revert with no backfill.

| Level               | Behaviour                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `relaxed` (default) | Recalled anywhere in the server                                                                   |
| `balanced`          | Public-channel memories travel; private-channel memories stay in that channel                     |
| `strict`            | Every channel keeps its own memories                                                              |
| `off`               | No writes or recall. `remember_user` and `recall_user` are withheld; `forget_user` still deletes. |

- **Sources:** a fact's `memory_evidence` channels, a summary's `channel_id`, a digest's `media_occurrence` channels.
- **Gate:** `canRecall` (`src/agent/memory/privacy.ts`) is the only check. An item passes if any source does. `strict`
  allows the current channel or the thread's parent; `balanced` also allows any public channel. A missing source is
  public under `balanced` and fails under `strict`. A digest with no occurrence is private.
- **Visibility:** public means `@everyone` can View Channel and the channel is not NSFW. Public threads follow their
  parent; private threads and unknown channels are private. `src/discord/channelVisibility.ts` resolves this at recall
  time, so a channel that turns private stops sharing at once.
- **Limit:** with no channel visible to `@everyone`, `balanced` acts like `strict`.
- **Coverage:** unified and legacy recall, `recall_user`, `forget_user` replies, the extraction prompt, `same_as`
  candidates and nickname lookup.
- **Forget User:** works at every level. `relaxed` quotes values; `balanced` and `strict` quote only what is
  recallable here and count the rest; `off` reports counts only.
- **Cached Media:** except under `off`, a repost reuses its stored digest even if the first share is hidden here.
  Recall of the summary is still gated.

## Unified Recall

![Unified Memory Recall](../diagrams/memory-recall.svg)

_Candidates pass the privacy gate, are scored against the turn's query vector, and fill one budgeted block._

| `memory.recall`    | Prompt                                                        | Unified Recall      |
| ------------------ | ------------------------------------------------------------- | ------------------- |
| `legacy`           | People facts, server facts, episode and media blocks          | Not run             |
| `shadow` (default) | The legacy blocks                                             | Runs, logged only   |
| `unified`          | One block from `recallForTurn` (`src/agent/memory/recall.ts`) | Replaces the blocks |

- **Candidates:** live facts (not under review, not expired) about the speaker, up to
  `memory.recentParticipantLimit` (3) participants, named members and one current `relationship_to` hop. With a query
  vector: also server facts, conversation summaries and media summaries.
- **Fact Vectors:** each active fact is embedded as a subject-neutral sentence ("This person's past hobby: chess.") in
  `memory_claim.embedding`, with the sentence in `embedding_text`. New facts embed after each job (20) and after
  `remember_user` (5); maintenance fills gaps and changed sentences.
- **Floors:** similarity must exceed `memory.factMinSimilarity` (0.65), `memory.serverFactMinSimilarity` (0.65),
  `memory.episodeMinSimilarity` (0.7) or `memory.mediaMinSimilarity` (0.7), or the fingerprint's
  `embeddings.minSimilarity` entry.
- **Boosts:** +0.05 speaker, +0.05 named member, +0.05 pinned, up to +0.03 recency halving every
  `memory.salienceHalfLifeDays` (30). A fact recalled within `memory.recallCooldownMs` (6 h) loses 0.1 unless keyword-matched.
  Summaries and media get only recency.
- **Selection:** up to `memory.recallCoreFacts` (3) core speaker facts first (pinned, `nickname`, `pronouns`; never
  past). The rest fill `memory.recallTokenBudget` (600) best-first, with at most `memory.episodeRecallK` (3) summaries
  and `memory.mediaRecallK` (2) media.
- **Past Facts:** keyed `<predicate> (past)`. A past relationship is not followed; a past nickname names no one.
- **Fallback:** no query vector within `embeddings.timeoutMs` (1500 ms) means core facts plus keyword-matched facts.
- **Prompt:** `## What You Remember`, an untrusted-data sentence, then People, This Server, Past Conversations and
  Media Shared Here with JSON-quoted values. The safety ladder drops it with the legacy blocks.
- **Telemetry:** a `recall` or `recall_shadow` row per guild memory turn: mode, privacy, fallback, gated count and the
  selected `[kind, id, score]` tuples.

## Bounded Retrieval (Legacy)

The people-facts block under `legacy` or `shadow`, built once in `src/agent/turnContext.ts`. `beforeModelCallback` only
reads the assembled prompt. Claims use the `buildFactsEnvelope` untrusted-data envelope.

- **Bounds:** `memory.maxClaimsPerTurn` (10) claims, about `memory.retrievalTokenBudget` (350) tokens.
- **Anchors:** `ceil(10 × memory.speakerMinShare)` (0.5, so 5) slots go to the speaker first and are never displaced.
- **Participants:** `memory.recentParticipantLimit` (3) non-speakers, plus one current `relationship_to` hop to an
  included participant. `needs_review` claims never appear.
- **Score:** `salience × sourceWeight × 2 + confidence + recency × 0.5`, +1 pinned, +1.5 FTS match, +1 topic route.
  Salience decays by `0.5 ^ (ageDays / memory.salienceHalfLifeDays)` at scoring time. Recency is
  `1 / (1 + ageDays / 30)`. Weights: `explicit` and `human` 1, `passive` 0.75, `legacy` 0.5. Cooldown: a recent recall
  loses 0.75 unless FTS or topic routing matched.
- **Server Facts:** a separate block of active, unexpired, same-guild facts within `memory.guildFactsTokenBudget` (150).
  Dates render from `event_date` (`2026-10-20` or `October 2026`); NULL falls back to `expires_at`.
- **References:** `resolveReferences` (`identityResolver.ts`) matches mentions, then display names, usernames and current
  `nickname` claims (3+ characters). One match resolves; several stay ambiguous. Resolved members take participant
  slots first. Nickname or username matches add a `## Who Is Mentioned` line.

## Memory Tools

| Tool            | Contract                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `remember_user` | Pinned `explicit` claim about the speaker. Refuses sensitive keys and values.                                                                                       |
| `recall_user`   | Up to 15 facts about one member, current then "In the past:". Unified mode uses the unified scorer with no floor; else `retrieveForSubject`. Asks when ambiguous.   |
| `forget_user`   | The speaker's own active claims and shared media, AND across up to six keywords. Forgets one to three matches; more asks which. Sensitive values print generically. |

`/ask` offers none of them. `forget_user` never touches guild facts.

## Embeddings and Episodic Recall

`getEmbeddingClient()` (`src/agent/memory/embeddings/`) follows `embeddings.provider` (env `EMBEDDINGS_PROVIDER`).

| Provider | Model                                      | Dim  | Recipe                                                                          |
| -------- | ------------------------------------------ | ---- | ------------------------------------------------------------------------------- |
| `gemini` | `gemini-embedding-2`                       | 768  | `title: none \| text: ` and `task: search result \| query: ` prefixes           |
| `local`  | `Xenova/multilingual-e5-small@761b726d-q8` | 384  | `sidecar/embeddings/`: E5 prefixes, mean pooling, L2 norm, 512-token truncation |
| `openai` | `text-embedding-3-small`                   | 1536 | Raw text; needs `OPENAI_API_KEY`                                                |

- **Default:** no `embeddings:` block means `gemini` with `GEMINI_API_KEY`, else `local`. A block without a provider
  means `local`. `memory.embeddingModel` and `memory.embeddingTimeoutMs` are deprecated fallbacks.
- **Storage:** little-endian float32 BLOBs, fingerprint `<provider>:<model>:<dim>:<recipe>`. A vector is read only when
  fingerprint and dimension match, its length is `dim × 4` and its norm is nonzero. Pre-provenance vectors are
  `unknown`, readable only in the `gemini-embedding-2` space.
- **Query:** only guild message turns embed the query, inside `TurnEntryWork`.
- **Legacy Episode Block:** same-guild summaries strictly above the episode floor, by score, then newest. At most
  `memory.episodeRecallK` (3) within `memory.episodeTokenBudget` (200), with UTC end dates under an untrusted heading.
  A failed or late embedding drops the block.

The maintenance pass runs at startup and every 24 hours, one pass at a time. It deletes episodes and media
occurrences older than `memory.episodeRetentionDays` and `memory.mediaRetentionDays` (90 each). It then embeds each
episode, digest and fact with no readable vector, `embeddings.backfillGapMs` (1000 ms) apart, stopping after
`embeddings.backfillBatchSize` (3600) or five failures in a row. A vector is stored only while its text is unchanged.
Under `off` it prunes but does not embed.

## Media Memory

Watched media is kept as text. Watching itself is in [Media](media.md).

- **Content Keys:** `youtube:<id>`, `youtube:<id>@<startSec>`, `<platform>:<postId>:<mediaIndex>` (Bluesky `postId`
  is `<profile>/<rkey>`), `discord:<path>` for Discord CDN files, or `sha256:<hex>`. Signed URL parameters never count.
- **Occurrences:** `origin` is `upload`, `reply`, `forward` or `link`. `source_author_id` is the replied-to poster.
- **Scope:** guild memory turns with a message ID, never under `off`.
- **Repost Cache:** a link is checked before download, an upload after hashing. A hit reuses the digest with no watcher
  call and records a new occurrence. Opening-only, incomplete or unrenderable digests are replaced.
- **Writes:** a fresh watch saves digest and occurrence, then embeds the summary off the reply path. Failures only log.
- **Recall:** above `memory.mediaMinSimilarity` (0.7), at most `memory.mediaRecallK` (2) within
  `memory.mediaTokenBudget` (400). At `relaxed` it is guild-wide, private channels included.
- **Forgetting:** `forget_user` deletes the speaker's shared or authored occurrences, then digests no one else shares.

## Maintenance Commands

| Command                                                 | Contract                                                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run migrate:memory-v2`                             | Offline, explicit. Backfills `user_memory` once, checks every row against a claim in each legal scope, reports the top ten claims per subject, then drops `user_memory`. Any miss aborts. A rerun is a no-op. |
| `npm run memory:replay -- --session-history <database>` | Offline replay with stub judges and extractor. No network calls. Prints episode, operation and gap statistics.                                                                                                |
| `npm run memory:replay:live`                            | Real pipeline. Needs `ROKABOT_MEMORY_REPLAY_LIVE=1`, `GEMINI_API_KEY` and `TYPESAFE_API_KEY`.                                                                                                                 |
| `npm run export:vault`                                  | Read-only Obsidian snapshot to `memory.vaultExportDir` (env `MEMORY_VAULT_EXPORT_DIR`, default `data/vault`).                                                                                                 |
| `npm run memory:prune-overflow`                         | Applies the active-claim cap to every member now.                                                                                                                                                             |
| `npm run memory:undo-reclassify -- <id>`                | Undoes one reclassification.                                                                                                                                                                                  |

The migration infers scopes for old `global` rows only from recorded guild rows or response events. A row with
several scopes gets `needs_review`. Eviction changes status and never deletes. Startup never runs the migration.

The vault export writes `<dir>/<guildId>/<userId>.md` (frontmatter by predicate, `relationship_to` as `[[wikilinks]]`,
past facts marked `(past)`), `guild.md` (active, unexpired guild facts not under review, with `expires_at` and
`event_date`) and `Episodes.md` (UTC dates, JSON-encoded summaries, no vectors). A `path.relative` and
`path.isAbsolute` guard rejects paths outside the directory. It makes no store writes and no network calls.

`/stats` counts active unexpired guild facts in totals and growth, keeps remembered-member metrics user-only with
current facts, and reports episodes ended in the last 30 days.

## Deferred Items

- `sqlite-vec` semantic retrieval.
- An ADK `globalInstruction` spike.
- Two-way Obsidian sync. The export is one-way.

## Source Files

- `src/agent/memory/`: `episodeTracker.ts`, `scheduler.ts`, `admission.ts`, `episodePrecheck.ts`, `extractor.ts`,
  `guildFactDates.ts`, `privacyGuard.ts`, `memoryClaims.ts`, `predicates.ts`, `hiddenRetractions.ts`, `reclassify.ts`,
  `recall.ts`, `retriever.ts`, `identityResolver.ts`, `privacy.ts`, `episodeMaintenance.ts`, `factEmbeddings.ts`,
  `embeddings/`
- `src/agent/jev/judgments.ts`, `src/agent/jev/modelJudge.ts`, `src/agent/turnContext.ts`, `src/agent/tools/`
- `src/storage/`: `memoryClaimSchema.ts`, `database.ts`, `extractionQueue.ts`, `memoryEpisodeStore.ts`,
  `mediaDigestStore.ts`, `extractionSampleStore.ts`
- `scripts/`: `migrate-memory-v2.ts`, `replay-memory-v2.ts`, `export-vault.ts`, `undo-reclassify.ts`,
  `prune-claim-overflow.ts`
