# Memory 2C Design

Design for #277: make every fact traceable to its source, and stop losing conversations to crashes. It ships as three independent PRs.

## Owner Decisions (2026-11-05)

| Topic        | Decision                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------- |
| Provenance   | The extractor cites the source message for each add and update. Code validates the citation.    |
| Capture      | Open episode lines are saved to SQLite and restored at boot.                                    |
| Summaries    | Rules plus Jev. A failed summary is dropped, and the loss is logged.                            |
| Rejected Ops | A summary is dropped when every proposed change was rejected.                                   |
| Merge Timing | Build now. Merge only after #262 calibration ends, so collection sees no restart or mix change. |

## Choices Made In Design

- **Citation Format:** the prompt numbers delta lines and the model returns `sourceLine`. Code maps the line to the message ID and speaker. A number costs fewer tokens than a Discord ID, and the model cannot invent an ID that looks valid.
- **Citation Scope:** only `add` and `update` cite, because only they write evidence. `remove` and `retract` write no evidence row, so they accept the field and ignore it. A strict schema would otherwise fail the whole extraction on a stray citation.
- **Idempotency Key:** `(claim_id, job_id)`, not `(job, source message)` as #277 first said. A retried job can cite a different line, which the original key would count twice. One conversation also should not count as two sightings of a fact.
- **"When" In A Summary:** the check covers who and what. `memory_episode` already stores `started_at` and `ended_at`, and the extraction prompt gives the model no date, so a text check for "when" would drop almost everything.
- **Jev Unavailable:** a summary that passed the rules is kept. Admission and verification already ran, so an outage should not erase the record.
- **No Backfill:** old evidence keeps null provenance. Old summaries stay until retention removes them.

## PR 1: Crash-Safe Capture

New table, saved in the same transaction as the cursor:

```sql
CREATE TABLE IF NOT EXISTS memory_episode_line (
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  is_bot INTEGER NOT NULL,
  PRIMARY KEY (channel_id, message_id)
);
```

```text
message arrives
  transaction: insert line, count it on the cursor
flush
  transaction: enqueue job, advance cursor, delete the episode's lines
boot
  privacy off: delete all lines, reset all cursors
  otherwise: set each cursor's count to its saved line count
             restore lines into the buffer
             start each lull timer with the time still left
```

- **Bounds:** a flush deletes the lines, and a channel flushes at `memory.episodeMaxMessages`, so no retention job is needed.
- **Accepted Loss:** the three context lines before a restored episode are lost. They are background only.
- **Data Exposure:** chat text reaches disk at capture, not at flush. It stays in the same database as `extraction_queue`, which already holds the same text.

## PR 2: Provenance And Idempotent Evidence

`memory_evidence` gains nullable `job_id`, `source_message_id` and `speaker_user_id`, plus:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_evidence_job
  ON memory_evidence (claim_id, job_id) WHERE job_id IS NOT NULL;
```

- **Citation Check:** the line must exist in `episode.messages` and not be a bot line. For a user fact, its `userId` must equal the op's subject. A failed check stores null message and speaker, keeps `job_id`, and adds to `ops.uncited`. It does not change whether the op applies.
- **Retry:** when a claim already has evidence from this job, `assertClaim` and `assertGuildClaim` return it unchanged, with no salience bump and no revival.
- **Reads:** no prompt or tool reads the new columns.
- **Richer Private Wording:** #265 asks that a brief public restatement must not expose a richer private fact. The hidden claim is not a same-as candidate under `balanced` or `strict`, so this PR adds a test and no new logic. An exact public restatement still adds public evidence, as it does today, because those words are already public.

## PR 3: Summary Validation

```text
before embedding
  Jev rejected every proposed change  → drop, ops_rejected
  contains a Discord ID (15+ digits)  → drop, numeric_id
  matches the boilerplate pattern     → drop, boilerplate
  Jev: says who and what, below threshold → drop, incomplete
  Jev unavailable                     → keep, judged false
```

- **What Counts As Rejected:** only Jev's own rejection. A rule, a judge outage or a missing target on a retry says nothing about the facts, so those summaries go on to the other checks.
- **Tunables:** `memory.summaryThreshold` at 0.5 and `memory.modelSummaryThreshold` at 0.7, the same values as the verify thresholds. Neither is calibrated.
- **Telemetry:** `extraction_run.detail.summary` gains `dropReason` and `judged`. Each judgement writes a `jev_events` row with `question = 'summary_complete'`.
- **Prompt:** the summary line now forbids user IDs and "no durable fact" wording, so fewer summaries fail.

## Verification

- Each PR passes full verification: `npm test`, `test:perf`, `typecheck`, `format:check` and `biome check .`.
- PRs 2 and 3 change the extraction prompt. Each runs `correctFacts.live.test.ts` (12 Gemini calls per run) twice on `GRAPHIFY_GEMINI_API_KEY`, with the route pinned to `gemini-3.5-flash-lite` (#461). Production runs `claude-haiku-5-5`, so `ops.uncited` is the check there.
- After the PRs ship, the runbook's funnel queries show `ops.uncited` and the summary drop rate. Review both before tuning.

## Not In Scope

- Merging the memory stores (#266) and coverage or retention review (#278).
- Evidence for retractions.
