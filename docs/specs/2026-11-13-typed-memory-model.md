# Typed Memory Model Design

Design for #266 (memory sub-project 3): store member facts, server facts, conversation summaries and media digests as one typed `memory_item` model behind one read API and one write API. The four legacy memory blocks stay the only recall path and read through that API. Roka recalls exactly what she recalls today until the owner approves a behaviour change. The owner approved this spec on 2026-11-13; implementation proceeds phase by phase.

## Status And Preconditions

| Item                | State on 2026-11-13                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #262 Recall         | No-go on 2026-11-13: 0 of 4 kinds passed, 18 of 2,998 labelled pairs were relevant, and the gate missed its deadline on 27% of turns. The owner chose legacy recall.                                                                                                       |
| Legacy-Only Recall  | #481 merged: removes unified recall, the shadow recall, the Jev recall gate and the `memory.recall` setting. The four legacy memory blocks stay as the only recall path.                                                                                                   |
| Phase 1 (#483)      | Merged on 2026-11-13 (owner approved starting before one release). All legacy recall builders require `RecallScope`; reads are split from pure selections.                                                                                                                 |
| Phase 2 (#266)      | Implemented and verified on 2026-11-13: additive item schema, offline backfill and replay readers. A private database copy passed migration checks and a 134-turn replay with zero mismatches. The bot remains on the legacy store.                                        |
| Phase 3 (#266)      | Implemented: dual-write projection triggers, catch-up migration, NULL-hash embedding maintenance and value-free integrity sweeps. A private database copy passed the dual-write sweep and replay with zero drift and zero mismatches. The bot remains on the legacy store. |
| Phase 5 (#266)      | Implemented on 2026-11-14: item read API and reader cutover. Private-copy migration and replay are the local gate; the separate offline simulator remains the promotion gate. No production soak or in-production shadow read.                                             |
| Phase 6 (#266)      | Implemented on 2026-11-14: item writers, frozen legacy source tables, trigger removal and transactional reverse export. Offline parity and the private-copy round trip are the gate; no production soak or shadow read.                                                    |
| #265 Write Path     | Memory 2C (#277) shipped: evidence provenance, crash-safe capture through `memory_episode_line`, summary validation. #278 (2D coverage and retention) and the crash-safe check in #463 are still open.                                                                     |
| Extraction Route    | Extraction ran on the Qwen fallback, not Haiku: the Anthropic structured-output schema had more than 24 optional parameters. #472 fixed it on 2026-11-13.                                                                                                                  |
| Production Envelope | 2.39 MiB database, 187 vectors (#266). 142 claims on 2026-11-08 (#463).                                                                                                                                                                                                    |

No phase below starts before the legacy-only recall PR has run one release in production. #266 then changes the store under the four legacy blocks. It does not change the blocks. This spec names functions rather than line numbers for code that PR touches, and Phase 1 starts by re-reading the builders as merged.

## Goals

1. **One Read API:** every prompt-facing read of the four stores goes through one module, and its type makes the recall scope mandatory.
2. **One Lifecycle:** supersession, removal, review, expiry and explicit retention use one status and `end_reason` vocabulary for every kind.
3. **Typed Semantics:** kind-specific rules stay in the schema as `CHECK` constraints and partial unique indexes. This is not one untyped text table.
4. **Versioned Embeddings:** each vector names its text hash, renderer, model, version and dimensions. Wrong and zero vectors are detected, not only missing ones.
5. **Exact Parity:** the migration changes storage, not recall. Every phase can roll back.
6. **Legacy Blocks Served:** the four legacy blocks stay the only recall path. They read through the item API with the same scoring, budgets and output.

## Non-Goals

- **No Recall Change:** the four legacy blocks keep their scoring, similarity floors, budgets, headings and order. #266 does not bring back unified recall or the Jev recall gate.
- **No Extraction Change:** the extraction prompt and its output schema stay the same. The schema must not grow, because the Anthropic structured-output limit already pushed extraction to the fallback once.
- **No Retention Change:** the 30/14/180-day tiers were the owner's decision on 2026-09-25, and #278 re-tests them. This design moves the rules. It does not change the values.
- **No Privacy Change:** `relaxed`, `balanced`, `strict` and `off` keep their meaning, and `canRecall` stays the only check.
- **No Vector Extension:** brute-force cosine in SQLite stays. `sqlite-vec` stays deferred (`docs/trd/memory.md`).
- **Not Remembered Knowledge:** the extraction queue, capture state, session history and metrics stay outside the model (see [What Stays Separate](#what-stays-separate)).
- **No Forgetting Inside Summaries:** `forget_user` keeps today's reach. It does not edit episode summaries.

## Current Stores

### Tables And Owners

| Store                  | Tables                                                                                                                                 | Writers                                                                                                                                                                                                                                                                         | Readers                                                                                                                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Member Facts           | `memory_claim` rows with `subject_kind = 'user'`, `memory_evidence`, `memory_claim_fts`. Schema in `src/storage/memoryClaimSchema.ts`. | `src/agent/memory/memoryClaims.ts` (`assertClaim`, `replaceActiveClaim`, `retractClaim`, `retireClaim`, `rejectClaimIdsForSpeaker`, `pruneStaleClaims`), raw SQL in `src/agent/memory/reclassify.ts`, vectors through `setClaimEmbedding` in `src/storage/memoryRecallStore.ts` | `retrieveForTurn` and `retrieveForSubject` (`src/agent/memory/retriever.ts`), `identityResolver.ts`, `extractor.ts`, `hiddenRetractions.ts`, `obsidianExport.ts`, `src/storage/statsStore.ts`, `src/agent/tools/rememberUser.ts`, `recallUser.ts`, `forgetUser.ts` |
| Server Facts           | The same tables with `subject_kind = 'guild'` and NULL `subject_user_id`                                                               | `assertGuildClaim`, `replaceActiveGuildClaim`, `rejectActiveGuildClaimById` in `memoryClaims.ts`; dates from `guildFactDates.ts`                                                                                                                                                | `retrieveGuildFacts` in `retriever.ts`, `extractor.ts`, `obsidianExport.ts` (`guild.md`), `statsStore.ts`                                                                                                                                                          |
| Conversation Summaries | `memory_episode` (`id` is the queue job ID). DDL in `src/storage/database.ts`.                                                         | `persistEpisodeResult` (`src/agent/memory/episodePersistence.ts`) through `saveMemoryEpisode`; `setEpisodeEmbedding` and `pruneExpiredEpisodes` from `episodeMaintenance.ts`. All in `src/storage/memoryEpisodeStore.ts`.                                                       | `buildEpisodeRecallBlock` (`src/agent/memory/episodeRetriever.ts`), `obsidianExport.ts` (`Episodes.md`), `statsStore.ts`                                                                                                                                           |
| Media Digests          | `media_digest` and `media_occurrence`. DDL in `src/storage/database.ts`.                                                               | `src/agent/media/mediaCache.ts` through `saveMediaDigest` and `recordMediaOccurrence`; `setMediaDigestEmbedding`, `pruneExpiredMediaDigests`, `forgetMediaForUser`. All in `src/storage/mediaDigestStore.ts`.                                                                   | `buildMediaRecallBlock` (`src/agent/memory/mediaRecall.ts`, through `listMediaRecallCandidates`), `findMediaDigest` in `mediaCache.ts`, `findMediaSharedBy` in `forgetUser.ts`                                                                                     |

The readers are listed as they stand after the legacy-only recall PR removes unified recall. All three vector-bearing tables carry `embedding`, `embedding_model_id`, `embedding_dim` and `embedding_fingerprint`. `ensureVectorProvenanceColumns` (`src/storage/vectorProvenance.ts`) adds them at startup and marks a vector without provenance `unknown`. `decodeFloat32Embedding` and `isActiveVector` (`src/storage/memoryEpisodeStore.ts`) decide whether a vector is readable.

### How The Stores Differ

| Aspect             | Member Facts                                                                                         | Server Facts                                          | Conversation Summaries             | Media Digests                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Natural Key        | `(guild_id, subject_user_id, predicate, value, period)`                                              | `(guild_id, predicate, value, period)`                | Queue job ID (`memory_episode.id`) | `(guild_id, content_key)`                                                                  |
| Lifecycle          | `candidate`, `active`, `superseded`, `rejected`, with `end_reason`                                   | Same                                                  | A row exists or is deleted         | A row exists or is deleted                                                                 |
| Validity           | `period` (`current` or `past`)                                                                       | `expires_at`, `event_date`                            | `started_at` to `ended_at`         | None                                                                                       |
| Retention Clock    | `last_seen_at` by tier: 180, 30 or 14 days. Pinned rows are exempt. Cap of 20.                       | `expires_at`. Unexpired candidates end after 30 days. | `ended_at` plus 90 days            | Each occurrence's `observed_at` plus 90 days. A digest with no occurrence left is deleted. |
| Ended Rows         | Kept `memory.deadClaimRetentionDays` (30), then deleted with evidence                                | Same                                                  | Deleted at once                    | Deleted at once                                                                            |
| Privacy Sources    | Evidence `channel_id`s. No evidence means `[null]`: public under `balanced`, refused under `strict`. | Same                                                  | `channel_id`                       | Occurrence channels. No occurrence means `['']`: always private.                           |
| Vector Text        | `renderFactSentence` output, stored in `embedding_text`                                              | Same                                                  | `summary`                          | `summary`                                                                                  |
| Stale Vector Check | `embedding_text` differs from the sentence (`factEmbeddings.ts`)                                     | Same                                                  | The write requires `summary = ?`   | The write requires `summary = ?`. An upsert with a new summary sets the vector to NULL.    |
| Keyword Search     | `memory_claim_fts` holds active rows                                                                 | In the index, filtered out of every query             | None                               | None. `forget_user` matches substrings in code.                                            |
| Recall Clock       | `last_recalled_at`, set by `touchRecalled`                                                           | Never set: `touchRecalled` updates user rows only     | None                               | None                                                                                       |
| Forgetting         | `rejected` with `forgotten` (`rejectClaimIdsForSpeaker`)                                             | Never                                                 | Never                              | Deletes the speaker's shares, then any digest nobody else shares                           |

### Gaps In Today's Code

| Gap                                                                                                                                                                                                                                    | Handled By                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An optional `scope` skipped privacy filtering in the legacy helpers: `withinScope` (`retriever.ts`), `recallEpisodes`/`buildEpisodeRecallBlock` (`episodeRetriever.ts`), and `recallMedia`/`buildMediaRecallBlock` (`mediaRecall.ts`). | Phase 1 makes `RecallScope` required in each builder (`withinScope`, `retrieveForTurn`, `retrieveForSubject`, `retrieveGuildFacts`, `recallEpisodes`, `buildEpisodeRecallBlock`, `recallMedia`, `buildMediaRecallBlock`). The item API has no unscoped prompt-facing read. |
| `retrieveForTurn` reads, scores, stamps `last_recalled_at` (`touchRecalled`) and writes its `retrieval` event in one call. Its selection cannot run twice on one snapshot.                                                             | Phase 1 splits selection from bookkeeping                                                                                                                                                                                                                                  |
| Vector checks are copied per table, and staleness is a text comparison. A zero vector is refused at read time, then fetched again on every maintenance pass.                                                                           | Versioned embedding rows                                                                                                                                                                                                                                                   |
| `buildEpisodeRecallBlock` reads every episode and decodes every BLOB before privacy filtering (`listEpisodesForGuild`). Prune and cap queries use `SELECT *`.                                                                          | The read API selects columns and loads vectors after the privacy filter                                                                                                                                                                                                    |
| A reclassified fact is `rejected` with `reclassified`, so `purgeDeadClaims` deletes it after 30 days. Undo then fails, although the `claim_reclassified` audit row is kept forever.                                                    | Kept (owner decision 4)                                                                                                                                                                                                                                                    |
| `touchRecalled` updates user rows only, so server facts never get `last_recalled_at`.                                                                                                                                                  | Kept for parity. Open question 1.                                                                                                                                                                                                                                          |
| `extraction_run.detail.models.extraction` records the configured model (`extractionRun.ts`), not the model that answered. So the trace cannot show a fallback such as the recent Qwen run.                                             | Out of scope. Open question 2.                                                                                                                                                                                                                                             |

## Proposed Model

### Tables

All tables are additive and created with `CREATE TABLE IF NOT EXISTS`, following the forward-only rule in `docs/TRD.md`.

```sql
CREATE TABLE IF NOT EXISTS memory_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'episode', 'media')),
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('user', 'guild')),
  subject_user_id TEXT,
  predicate TEXT,                 -- fact: free-text key, normalized as today
  content TEXT NOT NULL,          -- fact value, or episode or media summary
  label TEXT,                     -- media label
  media_kind TEXT CHECK (media_kind IN ('audio', 'video')),
  content_key TEXT,               -- media natural key
  source_job_id INTEGER,          -- episode natural key: the extraction job
  period TEXT NOT NULL DEFAULT 'current' CHECK (period IN ('current', 'past')),
  object_kind TEXT,
  object_user_id TEXT,
  source_kind TEXT,               -- fact: explicit, human, passive or legacy
  status TEXT NOT NULL CHECK (status IN ('candidate', 'active', 'superseded', 'rejected')),
  needs_review INTEGER NOT NULL DEFAULT 0,
  end_reason TEXT,
  ended_at INTEGER,
  superseded_by INTEGER,
  confidence REAL,
  salience REAL,
  pinned INTEGER NOT NULL DEFAULT 0,
  valid_until INTEGER,            -- recall skips the item after this instant
  event_date TEXT,                -- YYYY-MM-DD or YYYY-MM, as stated
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,  -- observation clock: recency and retention
  last_recalled_at INTEGER,
  created_at INTEGER,             -- row write time when the legacy row had one
  version INTEGER NOT NULL DEFAULT 1,
  legacy_table TEXT,
  legacy_id INTEGER,
  legacy_embedding_text TEXT,    -- exact legacy memory_claim.embedding_text for a complete round trip
  UNIQUE (legacy_table, legacy_id),
  CHECK ((subject_kind = 'user') = (subject_user_id IS NOT NULL)),
  CHECK (kind = 'fact' OR (subject_kind = 'guild' AND period = 'current' AND pinned = 0 AND needs_review = 0)),
  CHECK (kind != 'fact' OR (predicate IS NOT NULL AND source_kind IS NOT NULL)),
  CHECK (kind != 'media' OR (content_key IS NOT NULL AND label IS NOT NULL AND media_kind IS NOT NULL)),
  CHECK (kind != 'episode' OR source_job_id IS NOT NULL),
  CHECK (kind != 'fact' OR subject_kind != 'guild' OR predicate NOT IN ('upcoming_event', 'plan')
         OR valid_until IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_user_fact
  ON memory_item (guild_id, subject_user_id, predicate, content, period) WHERE kind = 'fact' AND subject_kind = 'user';
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_guild_fact
  ON memory_item (guild_id, predicate, content, period) WHERE kind = 'fact' AND subject_kind = 'guild';
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_episode ON memory_item (source_job_id) WHERE kind = 'episode';
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_media ON memory_item (guild_id, content_key) WHERE kind = 'media';
CREATE INDEX IF NOT EXISTS idx_memory_item_scope
  ON memory_item (guild_id, kind, status, subject_kind, subject_user_id);

-- Support for a fact: today's memory_evidence, keyed by item.
CREATE TABLE IF NOT EXISTS memory_item_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  channel_id TEXT,
  source_kind TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  effective_at INTEGER,
  job_id INTEGER,
  source_message_id TEXT,
  speaker_user_id TEXT,
  legacy_id INTEGER UNIQUE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_evidence_job
  ON memory_item_evidence (item_id, job_id) WHERE job_id IS NOT NULL;

-- Where an item appeared: each media share, and the one span of an episode.
CREATE TABLE IF NOT EXISTS memory_item_occurrence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('upload', 'reply', 'forward', 'link', 'episode')),
  message_id TEXT,
  shared_by_user_id TEXT,
  source_author_id TEXT,
  span_start INTEGER,             -- episode started_at
  observed_at INTEGER NOT NULL,   -- media share time, or episode ended_at
  legacy_id INTEGER UNIQUE,
  CHECK ((origin = 'episode') = (message_id IS NULL AND shared_by_user_id IS NULL)),
  CHECK (origin != 'episode' OR span_start IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_occurrence_message
  ON memory_item_occurrence (item_id, message_id) WHERE message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_occurrence_episode
  ON memory_item_occurrence (item_id) WHERE origin = 'episode';

-- Large media JSON stays out of the per-turn recall read.
CREATE TABLE IF NOT EXISTS memory_item_payload (item_id INTEGER PRIMARY KEY, digest_json TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS memory_item_embedding (
  item_id INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,      -- provider:model:dim:recipe, or 'unknown'
  model_id TEXT,
  dim INTEGER NOT NULL,
  renderer TEXT NOT NULL CHECK (renderer IN ('fact_sentence', 'summary')),
  renderer_version INTEGER NOT NULL,
  text_hash TEXT,                 -- SHA-256 hex of the exact text embedded
  vector BLOB NOT NULL,
  created_at INTEGER,
  PRIMARY KEY (item_id, fingerprint)
);
```

### Kinds And Columns

`kind` is a closed list of three values. Member and server facts share `kind = 'fact'` and differ by `subject_kind`, as in `memory_claim` today. Predicates stay free text (decision of 2026-09-25), so no `CHECK` lists them.

| `memory_item` Column                  | Member Fact                                | Server Fact                          | Conversation Summary                                        | Media Digest                                                                        |
| ------------------------------------- | ------------------------------------------ | ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `kind`, `subject_kind`                | `fact`, `user`                             | `fact`, `guild`                      | `episode`, `guild`                                          | `media`, `guild`                                                                    |
| `predicate`, `content`, `label`       | `predicate`, `value`, NULL                 | `predicate`, `value`, NULL           | NULL, `summary`, NULL                                       | NULL, `summary`, `label`                                                            |
| Natural Key                           | User dedup index                           | Guild dedup index                    | `source_job_id` = `memory_episode.id`                       | `content_key`, plus `media_kind` from `kind`                                        |
| `status`, `end_reason`, `ended_at`    | Copied                                     | Copied                               | `active`, NULL, NULL                                        | `active`, NULL, NULL                                                                |
| `superseded_by`                       | Mapped to the successor's item ID          | Mapped                               | NULL                                                        | NULL                                                                                |
| `period`, `valid_until`, `event_date` | `period`, NULL, NULL                       | `period`, `expires_at`, `event_date` | `current`, NULL, NULL                                       | `current`, NULL, NULL                                                               |
| `first_seen_at`, `last_seen_at`       | Copied                                     | Copied                               | `started_at`, `ended_at`                                    | `created_at`, latest occurrence `observed_at`, or `created_at` when no share exists |
| `created_at`                          | NULL (the claim has none)                  | NULL                                 | `created_at`                                                | `created_at`                                                                        |
| Support Rows                          | `memory_evidence` → `memory_item_evidence` | Same                                 | One `episode` occurrence: channel, `started_at`, `ended_at` | `media_occurrence` → `memory_item_occurrence`                                       |
| Payload                               | None                                       | None                                 | None                                                        | `digest_json` → `memory_item_payload`                                               |

`saveMediaDigest` rewrites `media_digest.created_at` on every upsert, so it records the last digest write, not the first share. The backfill copies it as stored.

`legacy_embedding_text` is the one Phase 2 extension to the table above. `memory_claim.embedding_text` can contain text that cannot be reconstructed from its hash, so the migration retains that exact value until the legacy table is dropped. It is used only for reverse projection and is not a prompt read.

Each item kind feeds exactly one legacy block, so headings, budgets and block order do not change:

| Item                | Legacy Block                                        | Builder                                                   |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| `fact` with `user`  | `## What You Remember About People In This Channel` | `retrieveForTurn`; `retrieveForSubject` for `recall_user` |
| `fact` with `guild` | `## Things You Remember About This Server`          | `retrieveGuildFacts`                                      |
| `episode`           | `## Things you remember happening here`             | `buildEpisodeRecallBlock`                                 |
| `media`             | `## Media You Watched Here Before`                  | `buildMediaRecallBlock`                                   |

### Lifecycle

Every kind uses the four claim statuses. An ended item always has `ended_at` and `end_reason`. Rows that ended before those columns existed keep their migration-time `ended_at` and NULL `end_reason` exactly as stored, and purge on the normal clock.

| Transition       | Status Change                        | `end_reason`   | Kinds                                                                       | Today's Code                                                                            |
| ---------------- | ------------------------------------ | -------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Stage            | new → `candidate`, `needs_review`    | None           | Facts                                                                       | `assertClaim` with incomplete verification                                              |
| Activate         | `candidate` → `active`               | None           | Facts                                                                       | `activateClaim`, a later verified assertion                                             |
| Supersede        | `active` → `superseded`              | `superseded`   | Single-value current facts                                                  | `supersedePriorActive`, `replaceActiveClaim`                                            |
| Reclassify       | `active` → `rejected`                | `reclassified` | User facts                                                                  | `moveClaim` in `reclassify.ts`                                                          |
| Remove           | `active` → `rejected`                | `removed`      | Facts                                                                       | `rejectActiveClaimById`, `rejectActiveGuildClaimById`, `retractClaim`, `undoReclassify` |
| Retract          | `active` → `rejected`                | `retracted`    | User facts                                                                  | `reconcileHiddenRetractions`                                                            |
| Forget           | `active` → `rejected`                | `forgotten`    | User facts; media once no share is left                                     | `rejectClaimIdsForSpeaker`, `forgetMediaForUser`                                        |
| Evict            | `active` → `rejected`                | `evicted`      | User facts                                                                  | `evictOverflow`                                                                         |
| Expire           | `candidate` or `active` → `rejected` | `expired`      | All kinds                                                                   | `pruneStaleClaims`, `pruneExpiredEpisodes`, `pruneExpiredMediaDigests`                  |
| Self             | `active` → `rejected`                | `self`         | User facts about Roka                                                       | `pruneStaleClaims`                                                                      |
| Revive           | ended → `active` or `candidate`      | Cleared        | Facts, never from `forgotten` passively                                     | `assertClaim`, `assertGuildClaim`                                                       |
| Replace In Place | `active` stays, `version` + 1        | None           | Episodes on retry, media on re-watch                                        | `saveMemoryEpisode` and `saveMediaDigest` upserts                                       |
| Purge            | ended → deleted                      | None           | Facts after 30 days; episodes and media in the same pass (owner decision 3) | `purgeDeadClaims`, prune deletes                                                        |

- **Explicit Retention:** a pin (`remember_user`) exempts a user fact from tier expiry and from the cap. No other kind takes a pin.
- **Correction Links:** a transition that ends an item because of another item sets `superseded_by` in the same transaction, before the cap or the purge can run. This is today's order in `replaceActiveClaim` and `moveClaim`.
- **One Writer:** every transition is one function in the item store. Callers name the transition, not the SQL.

`retractClaim` currently stores `end_reason = 'removed'`; hidden retraction reconciliation stores `retracted`. Phase 6 preserves those existing values for parity.

### Time

| Column                                 | Clock              | Meaning                                                                                                          |
| -------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `first_seen_at`, `last_seen_at`        | Observation        | When Roka first and last observed the item. `last_seen_at` only moves forward and drives recency and expiry.     |
| `last_recalled_at`                     | Recall             | Set only when recall selects the item. It never refreshes retention.                                             |
| `ended_at`                             | System             | When Roka retired the item, not when it stopped being true.                                                      |
| `valid_until`                          | World              | The instant after which the content no longer holds. Server `upcoming_event` and `plan` only, from `expires_at`. |
| `event_date`, `period`                 | World              | The stated date precision, and current or past.                                                                  |
| Evidence `observed_at`, `effective_at` | Observation, World | Per sighting. Today `effective_at` equals `observed_at`.                                                         |

There is no `valid_from`. Nothing records when a fact began to be true today, because `effective_at` always equals the message time. The column waits until extraction supplies a real effective time.

The backfill copies every timestamp unchanged. It never writes the migration time into a transition, validity or observation column (#266).

### Versioning

- **Content Version:** `version` starts at 1 and rises by one when `content`, `label`, `event_date` or `valid_until` changes in place. That happens on an episode retry, a media re-watch and a server-fact revival.
- **New Facts, New Rows:** a changed fact value is a new row linked by `superseded_by`, as today. Its `version` stays 1.

### Evidence And Occurrences

Evidence and occurrence rows stay separate from items and from each other, as #266 recommends.

- **Evidence:** support for a fact. It holds the source message, channel, speaker, job and the observed and effective time. Each job counts once per item. It applies to facts only, which the store enforces and a test checks.
- **Occurrences:** where an item appeared. A media share keeps its message, sharer, replied-to author, origin and time. Per-share deletion stays: `forget_user` deletes the speaker's shares and ends the item only when none is left.
- **Episode Span:** one `episode` occurrence keeps the channel, `started_at` (`span_start`) and `ended_at` (`observed_at`). The job ID stays on the item as its natural key.
- **One Retention Rule:** episodes and media both end when their last occurrence is older than their retention setting. That matches today's `pruneExpiredEpisodes` and `pruneExpiredMediaDigests`.

### IDs

Items get new IDs. Each migrated row keeps `legacy_table` and `legacy_id`, and evidence and occurrence rows keep `legacy_id`. These columns are value-free and stay after the legacy tables are dropped.

- **Who Needs Them:** `claim_reclassified` audit rows (`oldId`, `newId`), `npm run memory:undo-reclassify -- <id>` and the runbook's claim queries. All of them name legacy IDs.
- **Old Recall Telemetry:** `recall_shadow` rows and `jev_events` rows of kind `recall` also name legacy IDs. The legacy-only recall PR stops writing them, and the 90-day metrics prune removes the rest.
- **Legacy Block Telemetry:** `retrieval` and `context_build` rows hold counts only, so the ID change does not touch them.
- **Decided:** new item IDs (owner decision 2).

## How Existing Behaviour Maps

### Read API

One module, `src/storage/memoryItemStore.ts`, owns the SQL. One agent-side module, `src/agent/memory/memoryItems.ts`, owns the lifecycle rules.

| Function           | Contract                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listRecallable`   | Takes a `RecallScope` with no optional form. It returns live items (not under review, `valid_until` unpassed) that `canRecall` admits, with their sources and a vector readable in the active space. It refuses `global` and `dm:` tenants, and returns nothing under `off`. |
| `listForWrite`     | The write path's own read: dedup, supersession, `same_as` planning and hidden retraction. It sees hidden items, and its result type cannot be rendered into a prompt block.                                                                                                  |
| Transition Writers | One function per row of the lifecycle table. Each runs in one transaction with its evidence or occurrence write.                                                                                                                                                             |

- **Relaxed Shortcut:** under `relaxed` the store may skip the source lookup, as `withinScope` does today. A test proves the result equals running `canRecall` on every item.
- **Column Reads:** each builder selects only the columns it scores on. Vectors load only for items that passed the privacy filter.
- **Callers:** each legacy builder calls `listRecallable` once per turn. Scoring stays in the builders, not in the store.

### Recall Through The Legacy Blocks

The legacy-only recall PR leaves four blocks as the only recall path. The item model serves them. It does not replace them.

| Block         | Builder                                           | Item Read                                                                                                                                | Budget Keys (Kept)                                                                                  |
| ------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| People Facts  | `retrieveForTurn` (`retriever.ts`)                | Active user facts of the speaker and up to `memory.recentParticipantLimit` (3) participants, plus keyword matches from `memory_item_fts` | `memory.maxClaimsPerTurn` (10), `memory.retrievalTokenBudget` (350), `memory.speakerMinShare` (0.5) |
| Server Facts  | `retrieveGuildFacts` (`retriever.ts`)             | Active guild facts whose `valid_until` has not passed                                                                                    | `memory.guildFactsTokenBudget` (150)                                                                |
| Episodes      | `buildEpisodeRecallBlock` (`episodeRetriever.ts`) | Summaries with a readable vector, ranked above `memory.episodeMinSimilarity`                                                             | `memory.episodeRecallK` (3), `memory.episodeTokenBudget` (200)                                      |
| Media         | `buildMediaRecallBlock` (`mediaRecall.ts`)        | Media summaries with a readable vector and their share channels, ranked above `memory.mediaMinSimilarity`                                | `memory.mediaRecallK` (2), `memory.mediaTokenBudget` (400)                                          |
| `recall_user` | `retrieveForSubject` (`retriever.ts`)             | One member's active facts, with no budget and no floor                                                                                   | 15 facts (`MAX_RECALLED_FACTS` in `recallUser.ts`)                                                  |

- **Scoring:** the people-facts score (`salience × sourceWeight × 2 + confidence + recency × 0.5`, plus the pin, keyword, topic and cooldown terms), the similarity floors and the budgets stay in the builders unchanged.
- **Bookkeeping:** `touchRecalled` runs once per turn after selection, for user facts only, as today. The `retrieval` and `context_build` events keep their counts.
- **Parity Target:** for one turn, one `now`, one `last_recalled_at` snapshot and one query vector, each block renders byte-identical text from either store. Its selected IDs also match through `legacy_id`. The comparison logs block hashes and counts, never text.

### Privacy Levels

| Level      | Item Store Behaviour                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relaxed`  | Every item in the guild. The source lookup may be skipped.                                                                                                      |
| `balanced` | `canRecall` over the item's sources: evidence channels for facts, occurrence channels for summaries and media. A public channel shares; a private one does not. |
| `strict`   | The same sources. Only the current channel or the thread's parent.                                                                                              |
| `off`      | No reads and no writes. `forget_user` still deletes. Maintenance prunes and does not embed.                                                                     |

- **Missing Sources:** the per-kind rule stays. A fact with no evidence is an unknown source (public under `balanced`, refused under `strict`). A media item with no occurrence is private (owner decision 5).
- **Coverage:** the four legacy blocks, `recall_user`, `forget_user` replies, the extraction prompt (`recallableHere` in `extractor.ts`), `same_as` candidates and nickname lookup all move to the scoped read.
- **Leak Tests:** at Phase 5 the `balanced` and `strict` tests in `retriever.test.ts` run on both stores. `episodeRetriever.test.ts` and `mediaRecall.test.ts` use a bare legacy schema, so `memoryItemReadParity.test.ts` renders all four blocks and `recall_user` on both stores under `balanced` and `strict`, and `memoryItemStore.test.ts` checks each kind's sources on the item store. No in-production duplicate reads run under Phase 4.

### Retention Tiers

| Kind                 | Clock                         | Rule                                                                | Setting                                                                                                              |
| -------------------- | ----------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Member Fact          | `last_seen_at`                | Unpinned candidates and active items end by predicate tier          | `memory.stableClaimRetentionDays` (180), `memory.claimRetentionDays` (30), `memory.transientClaimRetentionDays` (14) |
| Member Fact Cap      | Active unpinned items         | Past items first, then lowest salience, then oldest                 | `memory.maxActiveClaimsPerUser` (20)                                                                                 |
| Server Fact          | `valid_until`                 | Ends at the date. Unexpired candidates end after the standard tier. | `memory.claimRetentionDays` (30)                                                                                     |
| Conversation Summary | Occurrence `observed_at`      | Ends with its one occurrence                                        | `memory.episodeRetentionDays` (90)                                                                                   |
| Media Digest         | Each occurrence `observed_at` | Old shares are deleted. The item ends with its last share.          | `memory.mediaRetentionDays` (90)                                                                                     |
| Ended Facts          | `ended_at`                    | Deleted with their evidence                                         | `memory.deadClaimRetentionDays` (30)                                                                                 |

The tiers stay in `src/agent/memory/predicates.ts`. If #278 changes a value, the item store reads the new value with no schema change.

### Full-Text Search

- **Index:** `memory_item_fts` is an external-content FTS5 table on `memory_item(content, predicate)`. Its triggers fire when `status = 'active' AND kind = 'fact'`, matching `memory_claim_fts`.
- **Queries:** keyword matching keeps its rules: ASCII `[a-z0-9]{2,}` tokens, the first 12, joined with OR, user facts only, and at most `memory.maxClaimsPerTurn` × 3 rows. A match still adds its boost in `retrieveForTurn` and `retrieveForSubject` and skips the cooldown. `forget_user` keeps its Unicode terms joined with AND. Media forgetting keeps its substring match in code.
- **Boot:** the index rebuilds only when the FTS table is missing, as #453 fixed for claims.
- **Not Widened:** server facts, summaries and media stay out of keyword search. Open question 1 covers widening it.

### Embeddings

- **One Row Per Space:** `memory_item_embedding` keys a vector by item and fingerprint. The migration copies the one legacy vector per row, `unknown` fingerprints included.
- **Renderer:** facts use `fact_sentence` (`renderFactSentence` in `factSentences.ts`). Summaries and media use `summary`. `renderer_version` is a code constant, so a renderer change makes every old vector stale with no data migration.
- **Readable Vector:** the fingerprint is active (or `unknown` in the `gemini-embedding-2` space, as `isActiveVector` allows today), `dim` matches, the BLOB is `dim × 4` bytes, every value is finite, the norm is above zero, and `text_hash` equals the hash of the item's rendered text.
- **NULL Hash:** a vector copied by a projection trigger in Phases 3-5 has a NULL `text_hash`, because SQL cannot hash. It counts as readable while the legacy writers still guard their text. Maintenance fills the hash from the stored text, and Phase 6 writers always set it.
- **Bad Vectors:** the writer refuses a zero or non-finite vector before storing it. The maintenance report counts wrong-space, wrong-size, zero and stale vectors separately, so a provider that keeps returning zeros shows up.
- **Envelope:** brute-force cosine stays. Before any vector extension, profile BLOB decoding and the wide reads (#266).

### Legacy Builders And Budgets

#266 first said to retire the four builders and their budgets only after #262 passed. #262 did not pass, so they stay.

- **Builders Kept:** `retrieveForTurn`, `retrieveForSubject` and `retrieveGuildFacts` (`retriever.ts`), `buildEpisodeRecallBlock` (`episodeRetriever.ts`) and `buildMediaRecallBlock` (`mediaRecall.ts`), called from `createTurnContext` (`src/agent/turnContext.ts`) and `recallUser.ts`.
- **Budgets Kept:** every key in the block table above, plus `memory.salienceHalfLifeDays`, `memory.recallCooldownMs`, `memory.episodeMinSimilarity` and `memory.mediaMinSimilarity`. Their `NUMERIC_BOUNDS` entries and env overrides stay too. The keys only unified recall used leave with the legacy-only recall PR, not with #266.
- **Broad Lookup Kept:** `recall_user` keeps `retrieveForSubject` on purpose: one member, no speaker anchoring, no budget, no floor.
- **Builder Changes:** Phase 1 makes the scope required and splits `retrieveForTurn`'s selection from its bookkeeping. Output does not change.
- **DM Turns:** `createTurnContext` builds no `RecallScope` for a `dm:` tenant (or empty `guildId`). Before Phase 1, `episodeSectionPromise` and `mediaSectionPromise` already skipped when `!scope` (because `recallEmbedding` required `scope`), while `retrieveForTurn` and `retrieveGuildFacts` read a DM tenant with no privacy filter. A DM is never a memory tenant (`docs/trd/system.md`). Pi count on 2026-11-13: `0` `dm:%` rows across `memory_claim`, `memory_episode`, `media_occurrence` and `user_memory`. Phase 1 skips all four memory blocks on an unscoped (DM) turn instead of reading without a scope.

### What Stays Separate

| Table                                          | Why It Stays Out                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `extraction_queue`                             | Work in flight, not knowledge                                                                                                      |
| `memory_episode_cursor`, `memory_episode_line` | Capture state for open episodes, deleted at flush                                                                                  |
| `session_history`                              | The conversation window, kept 7 days                                                                                               |
| `memory_events`, `jev_events`                  | Value-free telemetry. `item_integrity` stores per-kind drift counts; `claim_reclassified` rows stay exempt from the metrics prune. |
| `extraction_samples`                           | Private labelling text that no prompt reads                                                                                        |
| `monitored_channels`, `user_names`             | Capture triggers and name lookup                                                                                                   |
| `user_memory`                                  | Dropped only by the existing explicit `npm run migrate:memory-v2`                                                                  |

## Migration Plan

| Phase | PR  | Change                                         | `memory.store` | Exit Check                                                                                               | Rollback                                   |
| ----- | --- | ---------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 0     | -   | Preconditions                                  | -              | Legacy-only recall PR live for one release; extraction route fixed (#472)                                | -                                          |
| 1     | 1   | Prepare the legacy builders for a second store | -              | Full verification; golden prompt test unchanged; a day of `retrieval` and `context_build` rows unchanged | Revert the PR                              |
| 2     | 2   | Item schema and offline backfill               | `legacy`       | Backfill checks pass on a Pi copy and on the Pi; offline replay parity                                   | Revert. The tables stay inert.             |
| 3     | 3   | Dual-write through projection triggers         | `dual`         | Integrity sweep shows zero drift for 7 days                                                              | `memory.store: legacy` drops the triggers  |
| 4     | 3   | Shadow read beside every legacy read           | `dual`         | 7 days and 150 guild turns with zero mismatches; no event-loop regression                                | `memory.store: legacy`                     |
| 5     | 4   | Read cutover; legacy still the writer          | `item`         | One release with clean parity and integrity rows                                                         | `memory.store: dual`, a config flip        |
| 6     | 5   | Writer cutover; triggers dropped               | `item`         | Offline simulator passes; reverse export and forward checks pass on a private database copy              | Stop; run `--to-legacy`; set `dual`; start |
| 7     | 6   | Drop the legacy tables                         | Key removed    | A `.backup` taken; the explicit script reports zero misses                                               | Restore the backup (owner decision 10)     |

`memory.store` is a temporary key with the env override `MEMORY_STORE` (owner decision 7). It works the way `memory.recall` and `MEMORY_RECALL` did before the legacy-only recall PR removed them. It goes in `config.yml` with an inline comment and is removed in Phase 7.

### Phase 1: Prepare The Legacy Builders For A Second Store

The legacy builders are the recall path, so this phase makes them able to read from either store. Storage is untouched, and no block changes its output.

- **Re-Read First:** check the builders and `createTurnContext` as the legacy-only recall PR merged them. Update this spec if a function moved.
- **Required Scope:** `retrieveForTurn`, `retrieveForSubject`, `retrieveGuildFacts`, `recallEpisodes`/`buildEpisodeRecallBlock` and `recallMedia`/`buildMediaRecallBlock` take `scope: RecallScope` with no optional form. `withinScope` and the `!input.scope` bypasses go away. This is #266's "scope required on reads".
- **DM Turns:** after the Pi count in [Legacy Builders And Budgets](#legacy-builders-and-budgets), a turn with no scope skips the blocks.
- **Read And Select:** each builder gets its rows through one small reader, then runs a pure selection. `retrieveForTurn` returns its selection, and the caller runs `touchRecalled` and the `retrieval` event once. The other builders already write nothing.
- **Why Now:** Phase 4 must feed one builder from two stores on one `last_recalled_at` snapshot. Without the split, the legacy run's `touchRecalled` would reach the item rows through the triggers before the item run selects.

### Phase 2: Schema And Backfill

- **Schema:** `src/storage/memoryItemSchema.ts` creates the tables. Bot code does not read or write them; item readers are used only by tests and offline replay.
- **Script:** `npm run migrate:memory-items` (`scripts/migrate-memory-items.ts`) is offline and explicit. Startup never runs it, as with `migrate:memory-v2`. Stop the bot, take a `.backup` (`docs/RUNBOOK.md`), then run it.
- **One Transaction:** reconciliation and every check run in one transaction. Any miss rolls back and exits non-zero. A rerun inserts new projections, refreshes changed rows, removes rows whose legacy source is gone, and leaves a fully synced database unchanged.
- **Checks:** row counts per kind, subject, status and period; evidence and occurrence counts per item; non-null provenance counts; vector counts per fingerprint; complete and unique legacy IDs; no item timestamp the legacy row did not have.
- **Round Trip:** the script projects each item back to its legacy columns and compares every column. Phase 6's rollback depends on this check.
- **Offline Replay:** on a database copy, replay up to 150 recent guild turns from `session_history` through the four builders and `recall_user`, once per store, with one fixed `now` and the same `last_recalled_at` snapshot. `session_history` has no `guild_id`, so the replay maps its channel through `response_events` and skips unmapped channels. It uses stored episode, media or claim vectors as query stand-ins; it makes no embedding calls. The report contains counts and block hashes only. Any mismatch blocks Phase 3.

### Phase 3: Dual-Write

- **Triggers:** `AFTER INSERT`, `UPDATE` and `DELETE` triggers on `memory_claim`, `memory_evidence`, `memory_episode`, `media_digest` and `media_occurrence` mirror each legacy write into the item tables in the same transaction. They find the item by `legacy_table` and `legacy_id`. Their values match the Phase 2 backfill projection; writer tests compare each result with the migration's table-driven projection verifier.
- **Why Triggers:** they cover exported writers and raw SQL paths in `reclassify.ts`. They install after `ensureMemoryClaimSchema` during startup. The existing `memory_item_fts` triggers remain part of `memoryItemSchema.ts`; Phase 3 adds no source-table FTS triggers.
- **Flag:** `memory.store` accepts `legacy`, `dual` and `item`. During Phases 3-5, `dual` and `item` create the triggers after `ensureMemoryClaimSchema`; Phase 6 changes `item` to drop them, while `dual` keeps them and `legacy` drops them. `config.yml` stays `legacy`. Before entering `dual`, stop the bot and run `migrate:memory-items` for catch-up. Startup never runs catch-up. See the [Pi runbook](../RUNBOOK.md#typed-memory-items-phases-3-5-and-6).
- **Integrity Sweep:** at startup and daily in `dual`, a value-free `memory_events` row of kind `item_integrity` holds `fact`, `episode` and `media` drift counts. Drift above zero logs a warning and does not stop startup.
- **Embeddings:** SQL triggers copy vectors with a NULL `text_hash`. Item readers accept NULL hashes while the legacy writer still guards summary text; maintenance fills the hash from stored item text. A non-NULL hash must still match.
- **Catch-Up:** the offline migration inserts missing rows, refreshes changed rows and deletes item rows whose legacy source disappeared. It checks and round-trips the result in the same transaction and is a no-op on a fully synced database.

### Phase 4: Shadow Read (Not Run)

Owner decision 12 on 2026-11-14 removes the in-production shadow read and soak. No `item_parity` production event or duplicate production read is implemented. The offline simulator on the parallel branch is the promotion gate.

### Phase 5: Read Cutover

`memory.store: item` points every prompt-facing reader at the item API. The four legacy builders, `recall_user`, the read half of `forget_user`, nickname and name-presence reads, extraction context, `obsidianExport.ts` and `statsStore.ts` all switch. During Phase 5, writers still write the legacy tables and the projection triggers stay enabled, so rollback is a config flip to `dual`. Phase 6 moves the writers and drops those triggers. The offline simulator is the promotion gate; there is no production soak or shadow comparison. Item readers return each row under its `legacy_id`, so `touchRecalled`, `forget_user`, the `retrieval` trace and the builders' ID tie-breaks keep legacy IDs until Phase 6.

### Phase 6: Writer Cutover

The writers in `memoryClaims.ts`, `reclassify.ts`, `memoryEpisodeStore.ts`, `mediaDigestStore.ts` and `memoryRecallStore.ts` move to transition writers in `memoryItemStore.ts`/`memoryItems.ts`. Each lifecycle row and its evidence or occurrence write share one transaction. Every new vector stores its `text_hash`. The triggers are dropped, and the legacy source tables stop changing. New audit rows record item IDs with `"v": 2`. `undo-reclassify` takes an audit row's `oldId`: a `v: 2` ID names an item, and an older ID resolves through `legacy_id`. Callers keep seeing `legacy_id` for migrated items and the item ID for new ones; new item IDs start above every legacy ID, so the two never collide. No prompt block, tool output or stored value changes relative to `dual`. The reverse export (`npm run migrate:memory-items -- --to-legacy`) rebuilds the legacy rows from items in one transaction, then runs the Phase 2 forward checks before commit. Rollback is: stop the bot, run the reverse export, set `memory.store: dual`, start the bot. The offline simulator and private-copy round trip are the gate; production soak and in-production shadow reads are not required.

### Phase 7: Drop The Legacy Tables

After one release on Phase 6, take a `.backup` and run `npm run migrate:memory-items -- --drop-legacy`. It drops `memory_claim`, `memory_evidence`, `memory_claim_fts`, `memory_episode`, `media_digest` and `media_occurrence`, then removes `memory.store`. Startup never drops anything.

### Docs Per Phase

- **TRD:** `docs/trd/memory.md` and `docs/trd/data.md` change in the PR that changes the contract: Phase 1 (required scope in the builders), Phase 2 (new tables), Phase 5 (readers), Phase 7 (dropped tables).
- **Decisions:** Phase 2 adds a `docs/DECISIONS.md` row for the typed item model. Phase 7 adds one for dropping the legacy tables.
- **Config:** every key change updates `config.yml` and `docs/guide/configuration.md`; numeric tunables also update `NUMERIC_BOUNDS`. The categorical `memory.store` key has no numeric bound.

## Tests And Acceptance

### Per-PR Verification

Each PR passes `npm test`, `npm run test:perf`, `npm run typecheck`, `npm run format:check` and `biome check .`. No PR changes the extraction prompt, so `npm run test:live` is not required.

### Tests

| Area           | Test                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mapping        | A legacy → item → legacy round trip over fixtures: past facts, candidates under review, month-precision server facts, supersession chains, reclassified and forgotten rows, evidence with and without provenance, media shared in several channels, a digest with no share, an episode overwritten on retry, and `unknown`, wrong-size and zero vectors. The migration verifier is the mapping oracle for trigger equality, including vector provenance and permitted NULL hashes. |
| Triggers       | Table-driven over every exported writer in `memoryClaims.ts`, `reclassify.ts`, `memoryEpisodeStore.ts`, `mediaDigestStore.ts` and `memoryRecallStore.ts`: after each call item rows match the projection produced in `dual`, and legacy source tables remain byte-identical in `item`. Tests also cover trigger install/drop, audit `v:2`, undo through `legacy_id`, reverse export, and `memory_item_fts` token parity.                                                           |
| Builders       | For fixed rows, `now`, `last_recalled_at` snapshot and query vector, each of the four blocks and `recall_user` renders byte-identical text from either store. Selection runs before `touchRecalled`, and the golden prompt test is unchanged.                                                                                                                                                                                                                                      |
| Scope          | A call to `listRecallable` or a legacy builder with no scope, marked `// @ts-expect-error`, turns `npm run typecheck` red if the scope ever becomes optional. `global` and `dm:` tenants return nothing. `off` returns nothing.                                                                                                                                                                                                                                                    |
| Privacy        | For every kind and level, item sources give the same `canRecall` answer as legacy sources, including missing evidence and missing occurrences. The `balanced` and `strict` tests in `retriever.test.ts` pass on both stores, and all four blocks and `recall_user` render identically on both stores under `balanced` and `strict`.                                                                                                                                                |
| Retention      | With a fake clock: tiers by predicate, pins exempt, the cap evicts past items first, guild date expiry, guild candidates, episodes at 90 days, media per share, dead facts purged at 30 days. Results equal the legacy prune.                                                                                                                                                                                                                                                      |
| Keyword Search | `searchClaimIds` and `searchClaims` return the same IDs on both stores. A restart leaves the FTS bytes unchanged.                                                                                                                                                                                                                                                                                                                                                                  |
| Embeddings     | Item readers reject wrong fingerprint, wrong size, zero norm, NaN and mismatched non-NULL `text_hash` vectors as unreadable. They accept NULL hashes from Phase 3 triggers; startup and daily maintenance fill hashes from stored item text without embedding calls. Writers match the legacy source's single-vector behavior: a replacement vector clears other fingerprints for that item and stores the text hash.                                                              |
| Backfill       | A rerun on a synced database is a no-op. Catch-up reconciles changed, deleted and new legacy rows. A planted miss aborts with nothing written. No item gets a timestamp its legacy row did not have.                                                                                                                                                                                                                                                                               |
| Evals          | `recallRelevance.eval.test.ts`, `memoryGuildFacts.eval.test.ts`, `memoryPromotion.eval.test.ts` and `memoryEpisodeReplay.eval.test.ts` pass unchanged on the item store.                                                                                                                                                                                                                                                                                                           |
| Performance    | `memoryItemBuilders.perf.test.ts` (`npm run test:perf`) times the four builders on both stores at 1,000 and 10,000 items per kind under `relaxed` and `strict`, with BLOB decoding measured on its own. The item store must not be slower than legacy beyond timing noise (25% plus 2 ms). The #266 workstation reference is about 1.3 ms and 14 ms for brute force.                                                                                                               |

### Acceptance

1. In Phase 5, prompt-facing reads go through the scoped item API while writers stay on legacy tables with projection triggers. Phase 6 moves writes. No prompt-facing read can omit the scope.
2. The four legacy blocks are still the only recall path, with the same budgets, headings and output. `recall_user` keeps its broad lookup, and `memory.store` is gone after Phase 7.
3. The offline simulator passes before promotion to `item`. Production shadow reads and a 7-day production soak are not required by owner decision 12.
4. The private-copy migration and `scripts/replay-memory-items.ts` report zero mismatches. `item_integrity` remains value-free: it compares source projection drift under `dual` and item-native invariants under `item`.
5. Telemetry stays value-free, and old audit and telemetry IDs still resolve through `legacy_id`.
6. `docs/trd/memory.md`, `docs/trd/data.md`, `docs/RUNBOOK.md` and `docs/DECISIONS.md` describe the item model.

## Risks

| Risk                                                                                   | Mitigation                                                                                                                          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A writer is missed during cutover                                                      | Phase 5 triggers cover legacy writers; Phase 6 has parity tests for every exported writer and checks item-native invariants.        |
| A privacy regression from a dropped scope or the per-kind missing-source rule          | Mandatory scope in the type, privacy parity tests per kind and level, and the builders' leak tests on both stores at Phases 4 and 5 |
| New IDs break undo or runbook queries                                                  | `legacy_table` and `legacy_id` on every row. Old gate telemetry ages out with the 90-day metrics prune.                             |
| The shadow read sees cooldowns the legacy run just stamped                             | Phase 1 splits selection from `touchRecalled`, so both stores select on one snapshot                                                |
| The legacy-only recall PR merges in a different shape than this spec assumes           | The spec names functions, not line numbers, for that code. Phase 1 re-reads the builders as merged.                                 |
| Retention drift keeps private text longer or drops it early                            | A purge delay per kind, fake-clock parity tests, and owner decision 3                                                               |
| The backfill invents transition dates                                                  | Timestamps copied verbatim, and a check that fails on any new timestamp                                                             |
| The offline simulator reports a cutover mismatch                                       | The simulator is the promotion gate; do not use an in-production shadow read or soak (owner decision 12)                            |
| A migration on a live database                                                         | The bot is stopped, a `.backup` comes first, one transaction, and any miss aborts                                                   |
| A NULL `text_hash` hides a stale vector during projection                              | Phase 3-5 triggers can leave NULL hashes; maintenance fills them. Phase 6 writers hash every vector they write.                     |
| Overlap with #278 retention changes, the extraction route fix and #442 (removing Qwen) | Phase 5 waits for #265 to close (owner decision 1). The item store reads tiers from config, so a new value needs no migration.      |
| Forward-only schema leaves inert tables after a rollback                               | The tables are harmless when unread. The migration script can drop them on request.                                                 |

## Choices Made In Design

- **Three Kinds, Not Four:** member and server facts share supersession, dedup, review and evidence. They differ only by subject, exactly as `memory_claim` does today.
- **Claim Statuses Kept:** the four statuses already appear in the TRD, tests and runbook queries. Renaming them buys nothing for parity.
- **One Block Per Kind:** each item kind feeds exactly one legacy block, so headings, budgets, scoring and the golden prompt test stay as they are. The model serves the legacy builders and does not replace them, because #262 kept them as the only recall path.
- **No `valid_from`:** no data supplies it yet. `valid_until` replaces `expires_at` alone.
- **Triggers For Dual-Write:** one mechanical projection covers every write path. Editing more than 25 write functions across five modules by hand would risk missing one.
- **Payload Table:** `digest_json` is the only large column, and the recall read never needs it.
- **Exact Parity Over Sampling:** both stores feed the same builder code with the same data, so a sampled tolerance would hide bugs. The offline replay is the sampled check #266 asks for.

## Owner Decisions (2026-11-13 and 2026-11-14)

| #   | Question                  | Decision                                                                                                                                                                                                                                                       |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Start Gate                | Phases 1 and 2 may start after the legacy-only recall PR has run one release, with #278 open. Phase 5 waits for #265 to close                                                                                                                                  |
| 2   | IDs                       | New item IDs, with `legacy_table` and `legacy_id`                                                                                                                                                                                                              |
| 3   | Ended Summaries And Media | Deleted in the same prune pass, as today                                                                                                                                                                                                                       |
| 4   | Reclassify Undo Window    | Keep the 30-day purge                                                                                                                                                                                                                                          |
| 5   | Missing Sources           | Keep the per-kind rule                                                                                                                                                                                                                                         |
| 6   | Embedding Spaces          | One vector per item and fingerprint                                                                                                                                                                                                                            |
| 7   | Flag                      | Accept the temporary `memory.store` key and `MEMORY_STORE` override from Phase 2 to Phase 7                                                                                                                                                                    |
| 11  | Scope After The No-Go     | Run all seven phases                                                                                                                                                                                                                                           |
| 10  | Drop Timing               | Drop the legacy tables one release after the writer cutover; restore from backup is the rollback                                                                                                                                                               |
| 12  | Phase 5 Gate              | No production soak and no in-production shadow read. The offline simulator on a parallel branch is the promotion gate. During Phase 5, keep projection triggers enabled under `item` for config-only rollback to `dual`.                                       |
| 13  | Phase 6 Gate And Rollback | No production soak and no in-production shadow read. The offline simulator and a private-copy reverse/forward round trip gate promotion. Phase 6 drops projection triggers under `item`; rollback stops the bot, runs `--to-legacy`, sets `dual`, then starts. |

## Open Questions For The Owner

1. **Later Behaviour Changes:** after Phase 6, should follow-up issues cover the server-fact cooldown (`touchRecalled` skips server facts) and keyword search over server facts, summaries and media? Or leave both as they are?
2. **Extraction Model Provenance:** tracked as #477, outside #266.
