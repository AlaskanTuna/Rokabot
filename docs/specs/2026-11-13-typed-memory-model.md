# Typed Memory Model Design

Design for #266 (memory sub-project 3): store member facts, server facts, conversation summaries and media digests as one typed `memory_item` model behind one read API and one write API. Roka recalls exactly what she recalls today until the owner approves a behaviour change. The owner approved this spec as a draft only. No code ships from it yet.

## Status And Preconditions

| Item                | State on 2026-11-13                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #262 Recall         | `memory.recall: shadow`, with the Jev relevance gate in shadow. The 2026-11-13 calibration returned no-go: no kind passed the enable rule, and the gate missed its deadline on 27% of turns.           |
| #265 Write Path     | Memory 2C (#277) shipped: evidence provenance, crash-safe capture through `memory_episode_line`, summary validation. #278 (2D coverage and retention) and the crash-safe check in #463 are still open. |
| Extraction Route    | Extraction ran on the Qwen fallback, not Haiku: the Anthropic structured-output schema had more than 24 optional parameters. #472 fixed it on 2026-11-13.                                              |
| Production Envelope | 2.39 MiB database, 187 vectors (#266). 142 claims on 2026-11-08 (#463).                                                                                                                                |

No phase below starts before #262 runs `unified` in production. Phase 1 also waits for the one release in which #262 keeps the legacy path as a config rollback.

## Goals

1. **One Read API:** every prompt-facing read of the four stores goes through one module, and its type makes the recall scope mandatory.
2. **One Lifecycle:** supersession, removal, review, expiry and explicit retention use one status and `end_reason` vocabulary for every kind.
3. **Typed Semantics:** kind-specific rules stay in the schema as `CHECK` constraints and partial unique indexes. This is not one untyped text table.
4. **Versioned Embeddings:** each vector names its text hash, renderer, model, version and dimensions. Wrong and zero vectors are detected, not only missing ones.
5. **Exact Parity:** the migration changes storage, not recall. Every phase can roll back.
6. **Fewer Paths:** the four legacy prompt builders and their budgets retire.

## Non-Goals

- **No Recall Change:** thresholds, boosts, the Jev gate, the rubric and the token budget stay as #262 leaves them.
- **No Extraction Change:** the extraction prompt and its output schema stay the same. The schema must not grow, because the Anthropic structured-output limit already pushed extraction to the fallback once.
- **No Retention Change:** the 30/14/180-day tiers were the owner's decision on 2026-09-25, and #278 re-tests them. This design moves the rules. It does not change the values.
- **No Privacy Change:** `relaxed`, `balanced`, `strict` and `off` keep their meaning, and `canRecall` stays the only check.
- **No Vector Extension:** brute-force cosine in SQLite stays. `sqlite-vec` stays deferred (`docs/trd/memory.md`).
- **Not Remembered Knowledge:** the extraction queue, capture state, session history and metrics stay outside the model (see [What Stays Separate](#what-stays-separate)).
- **No Forgetting Inside Summaries:** `forget_user` keeps today's reach. It does not edit episode summaries.

## Current Stores

### Tables And Owners

| Store                  | Tables                                                                                                                                 | Writers                                                                                                                                                                                                                                                                         | Readers                                                                                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Member Facts           | `memory_claim` rows with `subject_kind = 'user'`, `memory_evidence`, `memory_claim_fts`. Schema in `src/storage/memoryClaimSchema.ts`. | `src/agent/memory/memoryClaims.ts` (`assertClaim`, `replaceActiveClaim`, `retractClaim`, `retireClaim`, `rejectClaimIdsForSpeaker`, `pruneStaleClaims`), raw SQL in `src/agent/memory/reclassify.ts`, vectors through `setClaimEmbedding` in `src/storage/memoryRecallStore.ts` | `src/agent/memory/retriever.ts`, `recall.ts`, `identityResolver.ts`, `extractor.ts`, `hiddenRetractions.ts`, `obsidianExport.ts`, `src/storage/statsStore.ts`, `src/agent/tools/rememberUser.ts`, `recallUser.ts`, `forgetUser.ts` |
| Server Facts           | The same tables with `subject_kind = 'guild'` and NULL `subject_user_id`                                                               | `assertGuildClaim`, `replaceActiveGuildClaim`, `rejectActiveGuildClaimById` in `memoryClaims.ts`; dates from `guildFactDates.ts`                                                                                                                                                | `retrieveGuildFacts` in `retriever.ts`, `recall.ts`, `extractor.ts`, `obsidianExport.ts` (`guild.md`), `statsStore.ts`                                                                                                             |
| Conversation Summaries | `memory_episode` (`id` is the queue job ID). DDL in `src/storage/database.ts`.                                                         | `persistEpisodeResult` (`src/agent/memory/episodePersistence.ts`) through `saveMemoryEpisode`; `setEpisodeEmbedding` and `pruneExpiredEpisodes` from `episodeMaintenance.ts`. All in `src/storage/memoryEpisodeStore.ts`.                                                       | `buildEpisodeRecallBlock` (`src/agent/memory/episodeRetriever.ts`), `recall.ts`, `obsidianExport.ts` (`Episodes.md`), `statsStore.ts`                                                                                              |
| Media Digests          | `media_digest` and `media_occurrence`. DDL in `src/storage/database.ts`.                                                               | `src/agent/media/mediaCache.ts` through `saveMediaDigest` and `recordMediaOccurrence`; `setMediaDigestEmbedding`, `pruneExpiredMediaDigests`, `forgetMediaForUser`. All in `src/storage/mediaDigestStore.ts`.                                                                   | `buildMediaRecallBlock` (`src/agent/memory/mediaRecall.ts`), `listMediaRecallCandidates` in `recall.ts`, `findMediaDigest` in `mediaCache.ts`, `findMediaSharedBy` in `forgetUser.ts`                                              |

All three vector-bearing tables carry `embedding`, `embedding_model_id`, `embedding_dim` and `embedding_fingerprint`. `ensureVectorProvenanceColumns` (`src/storage/vectorProvenance.ts`) adds them at startup and marks a vector without provenance `unknown`. `decodeFloat32Embedding` and `isActiveVector` (`src/storage/memoryEpisodeStore.ts`) decide whether a vector is readable.

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

| Gap                                                                                                                                                                                                                                                         | Handled By                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| An optional `scope` skips privacy filtering in the legacy helpers: `withinScope` (`retriever.ts`, lines 45-49), `recallEpisodes` (`episodeRetriever.ts`, line 69), `recallMedia` (`mediaRecall.ts`, lines 44-49). The line numbers in #266 are out of date. | Phase 1 deletes them. The new API has no unscoped prompt-facing read.   |
| `memory.recall: shadow` runs both recall paths. The shared `last_recalled_at` needs a workaround in `cooldownPenalty` (`recall.ts`, lines 96-104).                                                                                                          | Phase 1                                                                 |
| Vector checks are copied per table, and staleness is a text comparison. A zero vector is refused at read time, then fetched again on every maintenance pass.                                                                                                | Versioned embedding rows                                                |
| The recall pool reads every episode and decodes every BLOB before privacy filtering (`listEpisodesForGuild`). Prune and cap queries use `SELECT *`.                                                                                                         | The read API selects columns and loads vectors after the privacy filter |
| A reclassified fact is `rejected` with `reclassified`, so `purgeDeadClaims` deletes it after 30 days. Undo then fails, although the `claim_reclassified` audit row is kept forever.                                                                         | Kept for parity. Owner question 4.                                      |
| `touchRecalled` ignores server facts, so the unified cooldown never applies to them.                                                                                                                                                                        | Kept for parity. Owner question 8.                                      |
| `extraction_run.detail.models.extraction` records the configured model (`extractionRun.ts`), not the model that answered. So the trace cannot show a fallback such as the recent Qwen run.                                                                  | Out of scope. Owner question 9.                                         |

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

| `memory_item` Column                  | Member Fact                                | Server Fact                          | Conversation Summary                                        | Media Digest                                  |
| ------------------------------------- | ------------------------------------------ | ------------------------------------ | ----------------------------------------------------------- | --------------------------------------------- |
| `kind`, `subject_kind`                | `fact`, `user`                             | `fact`, `guild`                      | `episode`, `guild`                                          | `media`, `guild`                              |
| `predicate`, `content`, `label`       | `predicate`, `value`, NULL                 | `predicate`, `value`, NULL           | NULL, `summary`, NULL                                       | NULL, `summary`, `label`                      |
| Natural Key                           | User dedup index                           | Guild dedup index                    | `source_job_id` = `memory_episode.id`                       | `content_key`, plus `media_kind` from `kind`  |
| `status`, `end_reason`, `ended_at`    | Copied                                     | Copied                               | `active`, NULL, NULL                                        | `active`, NULL, NULL                          |
| `superseded_by`                       | Mapped to the successor's item ID          | Mapped                               | NULL                                                        | NULL                                          |
| `period`, `valid_until`, `event_date` | `period`, NULL, NULL                       | `period`, `expires_at`, `event_date` | `current`, NULL, NULL                                       | `current`, NULL, NULL                         |
| `first_seen_at`, `last_seen_at`       | Copied                                     | Copied                               | `started_at`, `ended_at`                                    | `created_at`, latest occurrence `observed_at` |
| `created_at`                          | NULL (the claim has none)                  | NULL                                 | `created_at`                                                | `created_at`                                  |
| Support Rows                          | `memory_evidence` → `memory_item_evidence` | Same                                 | One `episode` occurrence: channel, `started_at`, `ended_at` | `media_occurrence` → `memory_item_occurrence` |
| Payload                               | None                                       | None                                 | None                                                        | `digest_json` → `memory_item_payload`         |

`saveMediaDigest` rewrites `media_digest.created_at` on every upsert, so it records the last digest write, not the first share. The backfill copies it as stored.

Recall keeps its four presentation kinds (`RecallItemKind` in `recall.ts`), so `memory.recallGateShortlist`, `memory.recallGateMinNoul` and the telemetry keys do not change:

| Item                | Recall Kind    |
| ------------------- | -------------- |
| `fact` with `user`  | `fact`         |
| `fact` with `guild` | `server_fact`  |
| `episode`           | `conversation` |
| `media`             | `media`        |

### Lifecycle

Every kind uses the four claim statuses. An ended item always has `ended_at` and `end_reason`. Rows that ended before those columns existed keep their migration-time `ended_at` and NULL `end_reason` exactly as stored, and purge on the normal clock.

| Transition       | Status Change                        | `end_reason`   | Kinds                                                                       | Today's Code                                                            |
| ---------------- | ------------------------------------ | -------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Stage            | new → `candidate`, `needs_review`    | None           | Facts                                                                       | `assertClaim` with incomplete verification                              |
| Activate         | `candidate` → `active`               | None           | Facts                                                                       | `activateClaim`, a later verified assertion                             |
| Supersede        | `active` → `superseded`              | `superseded`   | Single-value current facts                                                  | `supersedePriorActive`, `replaceActiveClaim`                            |
| Reclassify       | `active` → `rejected`                | `reclassified` | User facts                                                                  | `moveClaim` in `reclassify.ts`                                          |
| Remove           | `active` → `rejected`                | `removed`      | Facts                                                                       | `rejectActiveClaimById`, `rejectActiveGuildClaimById`, `undoReclassify` |
| Retract          | `active` → `rejected`                | `retracted`    | User facts                                                                  | `retractClaim`, `reconcileHiddenRetractions`                            |
| Forget           | `active` → `rejected`                | `forgotten`    | User facts; media once no share is left                                     | `rejectClaimIdsForSpeaker`, `forgetMediaForUser`                        |
| Evict            | `active` → `rejected`                | `evicted`      | User facts                                                                  | `evictOverflow`                                                         |
| Expire           | `candidate` or `active` → `rejected` | `expired`      | All kinds                                                                   | `pruneStaleClaims`, `pruneExpiredEpisodes`, `pruneExpiredMediaDigests`  |
| Self             | `active` → `rejected`                | `self`         | User facts about Roka                                                       | `pruneStaleClaims`                                                      |
| Revive           | ended → `active` or `candidate`      | Cleared        | Facts, never from `forgotten` passively                                     | `assertClaim`, `assertGuildClaim`                                       |
| Replace In Place | `active` stays, `version` + 1        | None           | Episodes on retry, media on re-watch                                        | `saveMemoryEpisode` and `saveMediaDigest` upserts                       |
| Purge            | ended → deleted                      | None           | Facts after 30 days; episodes and media in the same pass (owner question 3) | `purgeDeadClaims`, prune deletes                                        |

- **Explicit Retention:** a pin (`remember_user`) exempts a user fact from tier expiry and from the cap. No other kind takes a pin.
- **Correction Links:** a transition that ends an item because of another item sets `superseded_by` in the same transaction, before the cap or the purge can run. This is today's order in `replaceActiveClaim` and `moveClaim`.
- **One Writer:** every transition is one function in the item store. Callers name the transition, not the SQL.

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
- **Telemetry:** the Jev gate's `textHash` stays as it is. It already names the text Jev saw.

### Evidence And Occurrences

Evidence and occurrence rows stay separate from items and from each other, as #266 recommends.

- **Evidence:** support for a fact. It holds the source message, channel, speaker, job and the observed and effective time. Each job counts once per item. It applies to facts only, which the store enforces and a test checks.
- **Occurrences:** where an item appeared. A media share keeps its message, sharer, replied-to author, origin and time. Per-share deletion stays: `forget_user` deletes the speaker's shares and ends the item only when none is left.
- **Episode Span:** one `episode` occurrence keeps the channel, `started_at` (`span_start`) and `ended_at` (`observed_at`). The job ID stays on the item as its natural key.
- **One Retention Rule:** episodes and media both end when their last occurrence is older than their retention setting. That matches today's `pruneExpiredEpisodes` and `pruneExpiredMediaDigests`.

### IDs

Items get new IDs. Each migrated row keeps `legacy_table` and `legacy_id`, and evidence and occurrence rows keep `legacy_id`. These columns are value-free and stay after the legacy tables are dropped.

- **Who Needs Them:** `claim_reclassified` audit rows (`oldId`, `newId`), `recall` and `recall_shadow` tuples, the gate's `shortlist`, `jev_events` decision keys and `npm run memory:undo-reclassify -- <id>`. All of them name legacy IDs.
- **Telemetry After Cutover:** gate detail moves to `v: 2`, and recall rows add `"ids": "item"`, so a calibration script can tell the ID spaces apart. Do not run a labelling round across the Phase 5 deploy. Split it there, as #262 split at `ce2bf97`.
- **Alternative:** keep `item.id` equal to the claim ID. Owner question 2 covers the trade-off.

## How Existing Behaviour Maps

### Read API

One module, `src/storage/memoryItemStore.ts`, owns the SQL. One agent-side module, `src/agent/memory/memoryItems.ts`, owns the lifecycle rules.

| Function           | Contract                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listRecallable`   | Takes a `RecallScope` with no optional form. It returns live items (not under review, `valid_until` unpassed) that `canRecall` admits, with their sources and a vector readable in the active space. It refuses `global` and `dm:` tenants, and returns nothing under `off`. |
| `listForWrite`     | The write path's own read: dedup, supersession, `same_as` planning and hidden retraction. It sees hidden items, and its result type cannot be rendered into a prompt block.                                                                                                  |
| Transition Writers | One function per row of the lifecycle table. Each runs in one transaction with its evidence or occurrence write.                                                                                                                                                             |

- **Relaxed Shortcut:** under `relaxed` the store may skip the source lookup, as `withinScope` does today. A test proves the result equals running `canRecall` on every item.
- **Column Reads:** recall selects only the columns it ranks on. It loads vectors only for items that passed the privacy filter.

### Recall And The Jev Gate

- **Pool:** `recallTurn` (`recall.ts`) reads the same candidates from `listRecallable`: speaker, up to `memory.recentParticipantLimit` participants, named members and one current `relationship_to` hop. With a query vector it also reads server facts, summaries and media.
- **Gate:** `runRecallGate` (`recallGateRun.ts`) and `buildRecallShortlist` (`recallGate.ts`) do not change. Core facts still bypass the gate. A Jev outage still leaves core-only recall.
- **Keys:** `gateKey` stays `<recall kind>:<id>`, with item IDs from Phase 5.
- **Parity Target:** for one turn and one database, the item pool must equal the legacy pool in candidate set, similarity (to 1e-6), score, core flags, gated count and fallback. Jev's answers are not compared, because they are not deterministic.

### Privacy Levels

| Level      | Item Store Behaviour                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relaxed`  | Every item in the guild. The source lookup may be skipped.                                                                                                      |
| `balanced` | `canRecall` over the item's sources: evidence channels for facts, occurrence channels for summaries and media. A public channel shares; a private one does not. |
| `strict`   | The same sources. Only the current channel or the thread's parent.                                                                                              |
| `off`      | No reads and no writes. `forget_user` still deletes. Maintenance prunes and does not embed.                                                                     |

- **Missing Sources:** the per-kind rule stays. A fact with no evidence is an unknown source (public under `balanced`, refused under `strict`). A media item with no occurrence is private. Owner question 5 asks whether to unify them.
- **Coverage:** unified recall, `recall_user`, `forget_user` replies, the extraction prompt (`recallableHere` in `extractor.ts`), `same_as` candidates and nickname lookup all move to the scoped read.
- **Switch-On Tests:** the #262 privacy tests run against the item store at Phase 4 and again at Phase 5.

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
- **Queries:** the keyword fallback keeps its rules: ASCII `[a-z0-9]{2,}` tokens, the first 12, joined with OR, user facts only, and at most `memory.maxClaimsPerTurn` × 3 rows. `forget_user` keeps its Unicode terms joined with AND. Media forgetting keeps its substring match in code.
- **Boot:** the index rebuilds only when the FTS table is missing, as #453 fixed for claims.
- **Not Widened:** server facts, summaries and media stay out of keyword search. Owner question 8 covers widening it.

### Embeddings

- **One Row Per Space:** `memory_item_embedding` keys a vector by item and fingerprint. The migration copies the one legacy vector per row, `unknown` fingerprints included.
- **Renderer:** facts use `fact_sentence` (`renderFactSentence` in `factSentences.ts`). Summaries and media use `summary`. `renderer_version` is a code constant, so a renderer change makes every old vector stale with no data migration.
- **Readable Vector:** the fingerprint is active (or `unknown` in the `gemini-embedding-2` space, as `isActiveVector` allows today), `dim` matches, the BLOB is `dim × 4` bytes, every value is finite, the norm is above zero, and `text_hash` equals the hash of the item's rendered text.
- **NULL Hash:** a vector copied by a projection trigger in Phases 3-5 has a NULL `text_hash`, because SQL cannot hash. It counts as readable while the legacy writers still guard their text. Maintenance fills the hash from the stored text, and Phase 6 writers always set it.
- **Bad Vectors:** the writer refuses a zero or non-finite vector before storing it. The maintenance report counts wrong-space, wrong-size, zero and stale vectors separately, so a provider that keeps returning zeros shows up.
- **Envelope:** brute-force cosine stays. Before any vector extension, profile BLOB decoding and the wide reads (#266).

### Legacy Builders And Budgets

Phase 1 removes these after `unified` has run for one release:

- **Builders:** `retrieveForTurn` and `retrieveGuildFacts` (`retriever.ts`), `buildEpisodeRecallBlock` (`episodeRetriever.ts`), `buildMediaRecallBlock` (`mediaRecall.ts`), and the `recallMode !== 'unified'` branches in `createTurnContext` (`src/agent/turnContext.ts`).
- **Config:** `memory.retrievalTokenBudget`, `memory.guildFactsTokenBudget`, `memory.episodeTokenBudget`, `memory.mediaTokenBudget` and `memory.speakerMinShare`, with their `NUMERIC_BOUNDS` entries and the `MEMORY_RETRIEVAL_TOKEN_BUDGET`, `MEMORY_GUILD_FACTS_TOKEN_BUDGET` and `MEMORY_SPEAKER_MIN_SHARE` overrides.
- **Kept:** `memory.maxClaimsPerTurn`, because the keyword fallback uses it. `memory.episodeRecallK` and `memory.mediaRecallK`, because `packRecallItems` caps by them. `recall_user`'s broad lookup (`recallFactsForSubject`, no floor and no gate) stays on purpose.
- **DM Branch:** `turnContext.ts` (lines 554-555) keeps the legacy facts block for `dm:` tenants. A DM is never a memory tenant (`docs/trd/system.md`), so count `dm:%` rows in `memory_claim` on the Pi first. Remove the branch if the count is zero.

### What Stays Separate

| Table                                          | Why It Stays Out                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `extraction_queue`                             | Work in flight, not knowledge                                                       |
| `memory_episode_cursor`, `memory_episode_line` | Capture state for open episodes, deleted at flush                                   |
| `session_history`                              | The conversation window, kept 7 days                                                |
| `memory_events`, `jev_events`                  | Value-free telemetry. `claim_reclassified` rows stay exempt from the metrics prune. |
| `extraction_samples`                           | Private labelling text that no prompt reads                                         |
| `monitored_channels`, `user_names`             | Capture triggers and name lookup                                                    |
| `user_memory`                                  | Dropped only by the existing explicit `npm run migrate:memory-v2`                   |

## Migration Plan

| Phase | PR  | Change                                 | `memory.store` | Exit Check                                                                | Rollback                                                   |
| ----- | --- | -------------------------------------- | -------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 0     | -   | Preconditions                          | -              | `unified` live for one release; extraction route fixed                    | -                                                          |
| 1     | 1   | Retire the legacy builders and budgets | -              | Full verification; a day of `recall` rows; replies spot-checked           | Revert the PR                                              |
| 2     | 2   | Item schema and offline backfill       | `legacy`       | Backfill checks pass on a Pi copy and on the Pi; offline replay parity    | Revert. The tables stay inert.                             |
| 3     | 3   | Dual-write through projection triggers | `dual`         | Integrity sweep shows zero drift for 7 days                               | `memory.store: legacy` drops the triggers                  |
| 4     | 3   | Shadow read beside every legacy read   | `dual`         | 7 days and 150 guild turns with zero mismatches; no event-loop regression | `memory.store: legacy`                                     |
| 5     | 4   | Read cutover; legacy still the writer  | `item`         | One release with clean parity and integrity rows                          | `memory.store: dual`, a config flip                        |
| 6     | 5   | Writer cutover; triggers dropped       | `item`         | One release; the reverse export tested on a Pi copy                       | `npm run migrate:memory-items -- --to-legacy`, then revert |
| 7     | 6   | Drop the legacy tables                 | Key removed    | A `.backup` taken; the explicit script reports zero misses                | Restore the backup (owner question 10)                     |

`memory.store` is a temporary key with the env override `MEMORY_STORE`, like `memory.recall` and `MEMORY_RECALL`. It goes in `config.yml` with an inline comment and is removed in Phase 7.

### Phase 1: Retire The Legacy Builders

This is the cleanup PR #262 promises after its rollback release. Land it once, under whichever issue gets there first. It also removes the cooldown workaround in `recall.ts` (lines 96-104), the `retrieval` events and the `retrieveForSubject` branch of `recall_user`. Storage is untouched.

### Phase 2: Schema And Backfill

- **Schema:** `src/storage/memoryItemSchema.ts` creates the tables. Nothing reads them.
- **Script:** `npm run migrate:memory-items` (`scripts/migrate-memory-items.ts`) is offline and explicit. Startup never runs it, as with `migrate:memory-v2`. Stop the bot, take a `.backup` (`docs/RUNBOOK.md`), then run it.
- **One Transaction:** the copy and every check run in one transaction. Any miss rolls back and exits non-zero. A rerun copies only rows with no item yet, so it is a no-op after a full run.
- **Checks:** row counts per kind, subject, status and period; evidence and occurrence counts per item; non-null provenance counts; vector counts per fingerprint; complete and unique legacy IDs; no item timestamp the legacy row did not have.
- **Round Trip:** the script projects each item back to its legacy columns and compares every column. Phase 6's rollback depends on this check.
- **Offline Replay:** on a Pi database copy, replay up to 150 recent guild turns from `session_history` through both pools, like `scripts/recall-calibration-sample.ts`. The report holds counts only. Any mismatch blocks Phase 3.

### Phase 3: Dual-Write

- **Triggers:** `AFTER INSERT`, `UPDATE` and `DELETE` triggers on `memory_claim`, `memory_evidence`, `memory_episode`, `media_digest` and `media_occurrence` mirror each legacy write into the item tables in the same transaction. They find the item by `legacy_table` and `legacy_id`.
- **Why Triggers:** they cover every writer, including raw SQL in `reclassify.ts`, the startup migrations in `memoryClaimSchema.ts` and `vectorProvenance.ts`, and the explicit scripts. The FTS index already works this way.
- **Flag:** at startup, `dual` creates the triggers after `ensureMemoryClaimSchema`, and `legacy` drops them. Entering `dual` again after a rollback needs the backfill again, which catches up on the missing rows.
- **Integrity Sweep:** at startup and daily, a value-free `memory_events` row of kind `item_integrity` holds drift counts per kind. A drift above zero logs a warning.

### Phase 4: Shadow Read

Under `dual`, the item read API runs beside each legacy read, off the reply path:

- the unified recall pool and the gate pool
- `recall_user` and the read half of `forget_user`
- nickname lookup and the name-presence check (`activeNicknameClaims`, `USER_CLAIM_PRESENCE`)
- the claims the extraction prompt may show
- `/stats` counts

Each comparison writes a value-free `memory_events` row of kind `item_parity` with counts and the first mismatch reason. Watch Pi CPU and event-loop delay while it runs, as #262 asks for its own shadow. Parity should be exact. Any mismatch is a bug, and the 7-day clock restarts after the fix.

### Phase 5: Read Cutover

`memory.store: item` points every prompt-facing reader at the item API. This includes `obsidianExport.ts`, `statsStore.ts` and the calibration scripts. Writers still write the legacy tables, and the triggers keep the items current, so rollback is a config flip. The shadow comparison keeps running with the roles swapped. The runbook's memory queries move to the item tables in the same PR.

### Phase 6: Writer Cutover

The writers in `memoryClaims.ts`, `reclassify.ts`, `memoryEpisodeStore.ts`, `mediaDigestStore.ts` and `memoryRecallStore.ts` move to the item store. The triggers are dropped, and the legacy tables are frozen. New audit rows record item IDs with `"v": 2`, and `undo-reclassify` resolves an old ID through `legacy_id`. No behaviour change ships in this PR. The reverse export (`--to-legacy`) rebuilds the legacy rows from items. Run it once on a Pi copy before merging.

### Phase 7: Drop The Legacy Tables

After one release on Phase 6, take a `.backup` and run `npm run migrate:memory-items -- --drop-legacy`. It drops `memory_claim`, `memory_evidence`, `memory_claim_fts`, `memory_episode`, `media_digest` and `media_occurrence`, then removes `memory.store`. Startup never drops anything.

### Docs Per Phase

- **TRD:** `docs/trd/memory.md` and `docs/trd/data.md` change in the PR that changes the contract: Phase 1 (builders, budgets), Phase 2 (new tables), Phase 5 (readers), Phase 7 (dropped tables).
- **Decisions:** Phase 2 adds a `docs/DECISIONS.md` row for the typed item model. Phase 7 adds one for dropping the legacy tables.
- **Config:** every key change updates `config.yml`, `NUMERIC_BOUNDS` and `docs/guide/configuration.md`.

## Tests And Acceptance

### Per-PR Verification

Each PR passes `npm test`, `npm run test:perf`, `npm run typecheck`, `npm run format:check` and `biome check .`. No PR changes the extraction prompt, so `npm run test:live` is not required.

### Tests

| Area           | Test                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mapping        | A legacy → item → legacy round trip over fixtures: past facts, candidates under review, month-precision server facts, supersession chains, reclassified and forgotten rows, evidence with and without provenance, media shared in several channels, a digest with no share, an episode overwritten on retry, and `unknown`, wrong-size and zero vectors. |
| Triggers       | Table-driven over every exported writer in `memoryClaims.ts`, `reclassify.ts`, `memoryEpisodeStore.ts`, `mediaDigestStore.ts` and `memoryRecallStore.ts`: after each call the item tables equal the projection.                                                                                                                                          |
| Scope          | A `listRecallable` call with no scope, marked `// @ts-expect-error`, turns `npm run typecheck` red if the scope ever becomes optional. `global` and `dm:` tenants return nothing. `off` returns nothing.                                                                                                                                                 |
| Privacy        | For every kind and level, item sources give the same `canRecall` answer as legacy sources, including missing evidence and missing occurrences. The #262 switch-on tests pass against the item store.                                                                                                                                                     |
| Retention      | With a fake clock: tiers by predicate, pins exempt, the cap evicts past items first, guild date expiry, guild candidates, episodes at 90 days, media per share, dead facts purged at 30 days. Results equal the legacy prune.                                                                                                                            |
| Keyword Search | `searchClaimIds` and `searchClaims` return the same IDs on both stores. A restart leaves the FTS bytes unchanged.                                                                                                                                                                                                                                        |
| Embeddings     | Wrong fingerprint, wrong size, zero norm, NaN and a stale `text_hash` are unreadable and re-embedded. A zero vector is refused at write. A provider switch keeps the old space's rows.                                                                                                                                                                   |
| Backfill       | A rerun is a no-op. A planted miss aborts with nothing written. No item gets a timestamp its legacy row did not have.                                                                                                                                                                                                                                    |
| Evals          | `recallRelevance.eval.test.ts`, `memoryGuildFacts.eval.test.ts`, `memoryPromotion.eval.test.ts` and `memoryEpisodeReplay.eval.test.ts` pass unchanged on the item store.                                                                                                                                                                                 |
| Performance    | `npm run test:perf` times the item recall pool at 1,000 and 10,000 items, with BLOB decoding measured on its own. It must not be slower than the legacy pool. The #266 workstation reference is about 1.3 ms and 14 ms for brute force.                                                                                                                  |

### Acceptance

1. The four stores are read and written only through the item store, and no prompt-facing read can omit the scope.
2. The legacy builders, their five budget keys and `memory.store` are gone, while `maxClaimsPerTurn` and `recall_user`'s broad lookup remain.
3. Production shows zero `item_parity` mismatches and zero `item_integrity` drift for 7 days before Phase 5, and again before Phase 6 freezes the legacy tables.
4. The `recall` rows on the day after Phase 5 match the week before it in memories per turn, tokens and duration, within normal variation.
5. Telemetry stays value-free, and old audit and telemetry IDs still resolve through `legacy_id`.
6. `docs/trd/memory.md`, `docs/trd/data.md`, `docs/RUNBOOK.md` and `docs/DECISIONS.md` describe the item model.

## Risks

| Risk                                                                                   | Mitigation                                                                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A writer is missed in dual-write                                                       | Triggers sit below every writer. The daily integrity sweep counts drift.                                                       |
| A privacy regression from a dropped scope or the per-kind missing-source rule          | Mandatory scope in the type, privacy parity tests per kind and level, and the #262 switch-on tests at Phases 4 and 5           |
| New IDs break undo, runbook queries or calibration                                     | `legacy_table` and `legacy_id` on every row, gate detail `v: 2`, and no labelling round across Phase 5                         |
| Retention drift keeps private text longer or drops it early                            | A purge delay per kind, fake-clock parity tests, and owner question 3                                                          |
| The backfill invents transition dates                                                  | Timestamps copied verbatim, and a check that fails on any new timestamp                                                        |
| Shadow work slows the Pi                                                               | Off the reply path, with event-loop delay watched in Phase 4                                                                   |
| A migration on a live database                                                         | The bot is stopped, a `.backup` comes first, one transaction, and any miss aborts                                              |
| A NULL `text_hash` hides a stale vector during projection                              | The legacy writers already guard their text. Maintenance fills hashes. Phase 6 always sets them.                               |
| Overlap with #278 retention changes, the extraction route fix and #442 (removing Qwen) | Phase 5 waits for #265 to close (owner question 1). The item store reads tiers from config, so a new value needs no migration. |
| Forward-only schema leaves inert tables after a rollback                               | The tables are harmless when unread. The migration script can drop them on request.                                            |

## Choices Made In Design

- **Three Kinds, Not Four:** member and server facts share supersession, dedup, review and evidence. They differ only by subject, exactly as `memory_claim` does today.
- **Claim Statuses Kept:** the four statuses already appear in the TRD, tests and runbook queries. Renaming them buys nothing for parity.
- **Recall Kinds Kept:** the four recall kinds stay, so gate config, calibration and telemetry need no rename.
- **No `valid_from`:** no data supplies it yet. `valid_until` replaces `expires_at` alone.
- **Triggers For Dual-Write:** one mechanical projection covers every write path. Editing more than 25 write functions across five modules by hand would risk missing one.
- **Payload Table:** `digest_json` is the only large column, and the recall read never needs it.
- **Exact Parity Over Sampling:** both pools come from the same code and data, so a sampled tolerance would hide bugs. The offline replay is the sampled check #266 asks for.

## Owner Decisions (2026-11-13)

| #   | Question                  | Decision                                                                                                     |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Start Gate                | Phases 1 and 2 may start once `unified` has run one release, with #278 open. Phase 5 waits for #265 to close |
| 2   | IDs                       | New item IDs, with `legacy_table` and `legacy_id`                                                            |
| 3   | Ended Summaries And Media | Deleted in the same prune pass, as today                                                                     |
| 4   | Reclassify Undo Window    | Keep the 30-day purge                                                                                        |
| 5   | Missing Sources           | Keep the per-kind rule                                                                                       |
| 6   | Embedding Spaces          | One vector per item and fingerprint                                                                          |
| 7   | Flag                      | Accept the temporary `memory.store` key and `MEMORY_STORE` override from Phase 2 to Phase 7                  |
| 10  | Drop Timing               | Drop the legacy tables one release after the writer cutover; restore from backup is the rollback             |

## Open Questions For The Owner

1. **Later Behaviour Changes:** after Phase 6, should follow-up issues cover the server-fact cooldown (`touchRecalled` skips server facts) and keyword search over server facts, summaries and media? Or leave both as they are?
2. **Extraction Model Provenance:** tracked as its own issue, outside #266.
