# Jev Judgments

How Rokabot asks Jev, TypeSafe's typed decision model, to pick from a list, and what happens when no judge answers.

## At a Glance

| Item           | Contract                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| What Jev Does  | Answers typed questions (`choice`, `noul`) about a JSON state. It never writes text.           |
| What It Judges | Reply tone, ambiguous names, whether a message needs a lookup, memory admission, verification. |
| What It Skips  | Every reply, tool call and memory operation. The main model writes those.                      |
| Client         | `src/agent/jev/client.ts`. It exists only when `TYPESAFE_API_KEY` is set.                      |
| Model          | `jev.model` (`jev-1.13.0`). `JEV_MODEL` overrides it. Thresholds are tuned to this version.    |
| Failure        | One attempt, no retries. Any error or timeout returns `null`, and the rule decision stays.     |

## Client

- **One Attempt:** the SDK client runs with `maxRetries: 0`. A failure logs `Jev judgment failed` and returns `null`.
- **Connection Reuse:** requests share one undici agent with a 60 s keep-alive.
- **Parallel Questions:** questions in one request run in parallel. One answer cannot see another.
- **No Key:** without `TYPESAFE_API_KEY`, `getJevClient()` returns `null`. Turn judgments are skipped. Memory judgments go to the main model or to no judge (see [Memory Judge](#memory-judge)).

## Turn Judgments

![Jev Turn Judgments](../diagrams/jev-turn-judgments.svg)

_One Jev request per turn starts at handler entry; the tone, referent and lookup answers feed the system prompt._

### Turn Entry Work

1. The message handler and the `/ask` handler call `startTurnEntryWork` before reply fetching, deferral or ADK session loading.
2. The work loads at most three prior lines from `session_history` (no older than `session.maxRehydrationAge`).
3. It sends at most one `judgeTurn` request. The request carries only the questions whose feature is not `off`.
4. Generation receives the same `TurnEntryWork` handle. It waits for the judgment only when tone, or referents with an ambiguous name, are `on`. Otherwise it reads the judgment in the background.
5. A declined turn (busy channel, rate limit, other refusal) calls `cancel()`. This aborts the Jev request and any search in flight.

The request state holds `speaker`, `message`, `recent_messages`, `time_of_day` (morning, afternoon, evening or late night, from the configured local hour) and, for ambiguous names, `candidates`. The request is bounded by `jev.timeoutMs` (1200 ms).

### Modes

`jev.tone`, `jev.referents` and `jev.prefetch` each take one mode. `JEV_TONE`, `JEV_REFERENTS` and `JEV_PREFETCH` override them. An unknown value stops startup with an error. A missing value defaults to `shadow`.

| Mode     | Behavior                                                                       |
| -------- | ------------------------------------------------------------------------------ |
| `off`    | The feature adds no question to the request.                                   |
| `shadow` | Jev answers. The answer is logged and persisted. The reply does not change.    |
| `on`     | The answer is used when its feature threshold passes. Generation waits for it. |

### Questions

| Question       | Type     | Applied When (`on` Mode)                                                                                                                                                                              |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tone`         | `choice` | The selected choice's probability is at least `jev.toneMinProbability` (0.3). A missing probability keeps the rule tone. The choices are the 12 `ToneKey` values.                                     |
| `referent_<n>` | `choice` | Confidence is at least `jev.referentMinConfidence` (0.8) and the pick is not the speaker. Up to 3 names, 8 candidates each, plus `none` and `unclear`. Only names `resolveReferences` left ambiguous. |
| `needs_lookup` | `noul`   | See [Search Prefetch](#search-prefetch). A missing, malformed or out-of-range answer becomes `null`.                                                                                                  |

- **Tone:** Jev's tone replaces the rule tone from `src/agent/toneDetector.ts`. Safety rung 3 still forces `sincere`.
- **Referents:** an accepted pick joins the retrieval participants after the resolver's members. It adds a line to the `## Who Is Mentioned` block.

### Turn Events

Each non-null turn judgment writes one `kind = 'turn'` row to `jev_events` after the prefetch settles.

| Column          | Value                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| `question`      | JSON: whether tone was asked, referent count, `prefetch` mode.                       |
| `answer`        | JSON: Jev tone, referent outcomes (total, matched), `needsLookup`, `prefetchStatus`. |
| `probability`   | Tone probability.                                                                    |
| `confidence`    | Tone confidence.                                                                     |
| `applied`       | Whether Jev's tone was used.                                                         |
| `baseline`      | The rule tone.                                                                       |
| Latency, Tokens | Rounded latency in ms, input tokens.                                                 |

The row stores no message text, alias or user ID. `metrics.retentionDays` prunes it with the other metrics tables.

## Search Prefetch

`jev.prefetch` ships as `shadow`. A live A/B on the search tool-trigger cases lost recall and latency in `on` mode.

| Mode     | Behavior                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| `off`    | The request has no lookup question.                                                                               |
| `shadow` | Jev answers. The log records whether the score crossed the threshold. No search runs.                             |
| `on`     | When `needsLookup` is at least `jev.prefetchMinNoul` (0.7), one Tavily search starts before the first model call. |

In `on` mode:

1. The search uses the mention-stripped message text, or the `/ask` question. Reply, embed, poll and forwarded-content wrappers are not part of the query.
2. The search runs while session and memory context load. It reserves no model RPM slot.
3. The first model call waits at most `jev.prefetchWaitMs` (4000 ms) for it, then proceeds without it.
4. A successful result becomes a `## Looked It Up` block in the system prompt: answer clipped to 1200 characters, up to 3 sources, 2000 characters in total.
5. The block invokes the core prompt's "When You've Looked Something Up" rules. Those rules tell the model to call `search_web` again when results are thin or off-topic.

- **Citations:** the search footer uses the prefetched URLs. A later `search_web` call by the model replaces the list.
- **Tool Count:** a used prefetch counts `search_web` once in `toolsUsed`, even if the model also calls the tool.
- **Tool Registration:** `search_web` stays registered in every mode.
- **No Result:** an empty, failed, aborted, canceled or timed-out search adds no block. The turn answers normally.
- **Safety Ladder:** any safety rung above 0 drops the block.

## Memory Judge

Passive memory needs a judge. `config.memory.judge` is derived at startup and cannot be set.

| `memory.judge` | When                                                 | Admission Threshold                | Verification Threshold              |
| -------------- | ---------------------------------------------------- | ---------------------------------- | ----------------------------------- |
| `jev`          | `TYPESAFE_API_KEY` is set, whatever the config says. | `memory.admitThreshold` (0.5)      | `memory.verifyThreshold` (0.5)      |
| `model`        | No key, and `config.yml` has an `llm:` block.        | `memory.modelAdmitThreshold` (0.7) | `memory.modelVerifyThreshold` (0.7) |
| `none`         | No key and no `llm:` block (legacy config).          | Every episode fails admission.     | Not reached.                        |

Under `none`, startup logs `Passive memory extraction is disabled: no TypeSafe API key` once.

### Memory Judgments

| Judgment           | Question Keys                                                                                        | Result                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Admission          | `lasting_fact`                                                                                       | Runs after the local sensitive/trivial precheck. Below threshold: the episode is dropped.                             |
| Verification       | `durable_<i>`, `attributed_<i>` or `guild_scoped_<i>`, plus tense, change, `same_as_*`, `retracts_*` | Checks each proposed operation for durability, attribution and duplicates. Below threshold: the operation is skipped. |
| Hidden Retractions | `retracts_<id>`                                                                                      | Probability that the messages end an existing fact.                                                                   |
| Reclassification   | Per proposed move                                                                                    | Confirms a move to a better category.                                                                                 |

- **Timeout:** Jev memory calls are bounded by `jev.memoryTimeoutMs` (5000 ms).
- **No Admission Answer:** a missing judge, timeout or unusable answer marks the job unjudged. The queue retries it once after 5 minutes, then drops it.
- **Incomplete Verification:** removals and retractions are blocked. Allowed additions and updates are written with `needs_review` set.
- **Events:** admission and verification write `jev_events` rows with question key, answer, probability, confidence, `applied`, latency, input tokens, optional `job_id` and `judge`. Source messages are not stored.

### Main-Model Judge

Under `memory.judge: model`, `judgeWithModel` (`src/agent/jev/modelJudge.ts`) asks the main model the same question keys over the same state.

- **One Call:** one `generateObject` call (workload `admission` or `verification`) returns a probability from 0 to 1 per key.
- **Fail Closed:** any failure returns `null`, as Jev does.
- **Thresholds:** self-reported probabilities run high, so the model thresholds are 0.7. Both are uncalibrated and have no environment override. Calibrate them on labelled episodes (`jev_events` rows with a `judge`) before trusting them.
- **Judge Column:** `jev_events.judge` holds `provider:model` for a model judgment and `null` for Jev.

## Configuration

| Key                         | Default      | Range | Purpose                                                                |
| --------------------------- | ------------ | ----- | ---------------------------------------------------------------------- |
| `jev.model`                 | `jev-1.13.0` | n/a   | Pinned Jev version. `JEV_MODEL` overrides it.                          |
| `jev.timeoutMs`             | `1200`       | ≥ 1   | Deadline for the in-reply judgment.                                    |
| `jev.memoryTimeoutMs`       | `5000`       | ≥ 1   | Deadline for memory admission and verification.                        |
| `jev.tone`                  | `on`         | mode  | Tone judgment mode. `JEV_TONE` overrides it.                           |
| `jev.referents`             | `shadow`     | mode  | Referent judgment mode. `JEV_REFERENTS` overrides it.                  |
| `jev.prefetch`              | `shadow`     | mode  | Lookup judgment and search prefetch mode. `JEV_PREFETCH` overrides it. |
| `jev.toneMinProbability`    | `0.3`        | 0–1   | Minimum probability for Jev's tone to apply.                           |
| `jev.referentMinConfidence` | `0.8`        | 0–1   | Minimum confidence for a referent pick to apply.                       |
| `jev.prefetchMinNoul`       | `0.7`        | 0–1   | Minimum `needs_lookup` score that starts a search.                     |
| `jev.prefetchWaitMs`        | `4000`       | ≥ 0   | Longest wait for a started search before the first model call.         |

The defaults are what `config.yml` ships. `NUMERIC_BOUNDS` in `src/config.ts` enforces the ranges. Memory thresholds live under `memory.*` (see [Memory](./memory.md)).

## Tools

- **Replay:** `npm run replay:jev -- data/rokabot.db --max-turns 100` compares Jev tone labels with the rule tone on retained history and transcript fixtures, including CJK turns. Agreement shows overlap only. The tone threshold comes from blind labels of which moods fit each production turn.
- **Prefetch Measure:** `npm run measure:prefetch` runs the search tool-trigger cases with prefetch.

## Source Files

- `src/agent/jev/client.ts`
- `src/agent/jev/judgments.ts`
- `src/agent/jev/modelJudge.ts`
- `src/agent/searchPrefetch.ts`
- `src/agent/turnContext.ts` (`startTurnEntryWork`, `awaitTurnPrefetch`, `applyJevTone`)
- `src/agent/memory/admission.ts`, `src/agent/memory/extractor.ts`, `src/agent/memory/judgeThresholds.ts`
- `src/storage/jevEventStore.ts`
- `src/config.ts` (`jev`, `memoryJudge`, `NUMERIC_BOUNDS`)
