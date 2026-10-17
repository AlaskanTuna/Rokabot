# Reliability

How a reply turn is admitted, retried, de-escalated and budgeted when a model call fails or a quota runs low.

## At a Glance

| Concern           | Rule                                                                                   | Default                     |
| ----------------- | -------------------------------------------------------------------------------------- | --------------------------- |
| Concurrency       | One turn per channel. A second message gets a busy reply.                              | n/a                         |
| Turn Reservation  | A turn reserves `gemini.maxLlmCalls` request slots and returns the unused ones.        | 4                           |
| Live Retries      | Up to `gemini.liveMaxRetries` retries after the first attempt.                         | 2                           |
| Retry Gate        | A retry needs `gemini.retryRpmFloor` free slots and takes one.                         | 2                           |
| Turn Deadline     | A retry starts only if one attempt timeout still fits in `gemini.turnDeadlineMs`.      | 63,000 ms (`config.yml`)    |
| Safety Ladder     | Up to 3 rungs. Each rung sheds carried context and tries again.                        | 3                           |
| Per-Minute Tokens | An attachment turn needs `gemini.maxAttachmentTokens` free in the main model's minute. | 125,000 of 125,000          |
| Per-Call Budgets  | Every provider call passes `startCall`. Replies outrank background work.               | Off without an `llm:` block |

## Turn Admission

The two handlers that reach the model, `messageCreate.ts` (mention, reply, name keyword) and `interactionCreate.ts`
(`/ask`), admit a turn in the same order. Every guard reads the main model's limiter (`getSharedRateLimiter()`).

![Reply turn admission: busy check, call peek, token floor, call and byte reservations, then the turn](../diagrams/reliability-turn-admission.svg)

_Each guard passes the turn on or sends an in-character reply, which the handler deletes after 5 s._

1. **Busy Check:** if the channel has a turn in flight, the user gets a busy line (`BUSY_MESSAGES`).
2. **Mark Busy:** the handler sets the flag right after the check, before it awaits `deferReply` or a linked-post
   lookup.
3. **Call Peek:** `canAdmitCalls(gemini.maxLlmCalls)` asks if a whole turn fits in `rpm` and `rpd`. If not, the user
   gets a decline line (`DECLINE_MESSAGES`). The peek holds nothing.
4. **Slow Work:** `/ask` defers its reply, the handler opens a linked post, and attachments are fitted to the turn.
5. **Token Floor:** a turn with attachments needs `gemini.maxAttachmentTokens` left in the main model's rolling minute
   (`canAffordAttachments`). If not, busy line. Text turns skip this step.
6. **Reserve Calls:** `reserveCalls(gemini.maxLlmCalls)` takes all the slots and one daily unit, or nothing. A turn that
   lost the race since step 3 gets a busy line. This step is the real guard; the peek only saves a Discord round trip.
7. **Reserve Bytes:** `tryReserve` takes the attachment bytes from `discord.maxInFlightAttachmentBytes`. If that budget
   is full, the handler calls `release(0)` to return the slots and the daily unit, then sends a busy line.
8. **Run:** `generateResponse` runs the turn.
9. **Finally:** the handler frees the channel, returns the bytes and calls `release(used)`.

## Failure Kinds

`classifyGeminiFailure` (`src/agent/geminiReliability.ts`) gives each failed attempt one kind. A `ProviderError` keeps
the kind its adapter set. A plain error is checked in this order: safety, recitation, session corruption, spent day,
terminal words, transient words, network words, terminal status, transient status. A status code matches only as a
whole number, so the `400` inside `4000000` is not terminal.

| Kind                  | Detected By                                                                                                                        | Retry                  | Switches Model | Session                | Line If It Ends Here |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------- | ---------------------- | -------------------- |
| `transient_http`      | 429, 500, 503, 504, `RESOURCE_EXHAUSTED`, `overloaded`, `quota`, `rate limit`, `UNAVAILABLE`                                       | Up to `liveMaxRetries` | Yes, sticky    | Keep                   | Generic              |
| `network`             | `fetch failed`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, abort, timeout, `DEADLINE_EXCEEDED`, attempt timeout                       | Up to `liveMaxRetries` | Yes, sticky    | Keep                   | Generic              |
| `empty_text`          | A response with no text and no function call, thoughts-only `MAX_TOKENS` included                                                  | Up to `liveMaxRetries` | No             | Keep                   | Generic              |
| `safety`              | `SAFETY`, `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`                                                                                | Ladder rungs only      | No             | Keep; rung 3 rebuilds  | Safety               |
| `recitation`          | `RECITATION`                                                                                                                       | 1                      | No             | Keep                   | Recitation           |
| `session_corrupt`     | Gemini 400: a function-call turn comes immediately after a user turn                                                               | 1, after a reset       | No             | Reset; destroy on exit | Terminal             |
| `quota_exhausted`     | A 429 that names `RequestsPerDay` and not `RequestsPerMinute`; a local budget refusal                                              | No                     | Yes, sticky    | Keep                   | Generic              |
| `billing_exhausted`   | Adapter error: provider credit spent, or the local monthly cap                                                                     | No                     | Yes            | Keep                   | Generic              |
| `refusal`             | Adapter error: the model refused, such as Claude `stop_reason: refusal`                                                            | No                     | Yes            | Keep                   | Safety               |
| `malformed_tool_args` | Adapter error: tool arguments that are not a JSON object                                                                           | Up to `liveMaxRetries` | Yes            | Keep                   | Generic              |
| `context_length`      | Adapter error: the prompt is too long (a 400 that says so, or a 413)                                                               | No                     | Yes            | Keep                   | Terminal             |
| `terminal`            | 400, 401, 403, `INVALID_ARGUMENT`, `UNAUTHENTICATED`, `UNAUTHORIZED`, `AUTHENTICATION`, `PERMISSION_DENIED`, `FORBIDDEN`; no match | No                     | No             | Destroy                | Terminal             |

| Line       | Text in `src/agent/roka.ts`                                         |
| ---------- | ------------------------------------------------------------------- |
| Safety     | `Huh? Let's not get into that one~`                                 |
| Recitation | `Ah, I don't think I should repeat that one exactly~`               |
| Terminal   | `Eep, something went wrong on my side. Let's try again later~`      |
| Generic    | A random pick from the four "spaced out" lines in `KNOWN_FALLBACKS` |

`gemini.safetyThreshold` (default `OFF`) sets Gemini's threshold on `HARM_CATEGORY_HARASSMENT`,
`HARM_CATEGORY_HATE_SPEECH`, `HARM_CATEGORY_SEXUALLY_EXPLICIT` and `HARM_CATEGORY_DANGEROUS_CONTENT`. Google applies
`PROHIBITED_CONTENT`, `SPII` and `BLOCKLIST` on its side and nobody can turn them off, so the safety path is needed
even at `OFF`.

## The Retry Loop

`runTurnWithReliability` (`src/agent/reliability.ts`) runs one turn. The user message goes out on the first attempt.
A later attempt sends it again only after a session reset.

![Live turn retry loop: attempt, classify, safety rung, model switch, retry gate, backoff and the two outcomes](../diagrams/reliability-retry.svg)

_After a failed attempt the loop tries a safety rung, then one model switch, then the ordinary retry gate._

- **Attempt Timeout:** an attempt aborts after its route's `timeoutMs`. A model entry without one uses
  `gemini.timeout`; the legacy fallback uses `fallback.timeoutMs`. A timed-out attempt with no text is `network`.
- **Retry Limit:** `liveMaxRetries`, or 1 for `recitation` and `session_corrupt`. The gate compares the attempt
  number, so attempts spent on a rung or a switch count toward it.
- **Backoff:** `min(base × 2^attempt, cap) × (0.5 + random × 0.5)`, clipped so the total sleep stays within
  `retryBackoffCapMs`. When the total reaches the cap, the loop stops. It never reads the payload's `retryDelay`.
- **Deadline:** checked before every retry and every rung, never before the first attempt. A retry starts only if the
  time left in `turnDeadlineMs` holds the planned backoff plus one attempt timeout.
- **RPM Floor:** each retry and each rung calls `tryConsumeAboveFloor(retryRpmFloor)` on the main model's limiter. That
  call takes one slot and one daily unit, and refuses when fewer than `retryRpmFloor` slots remain.
- **Session Reset:** before a `session_corrupt` retry the loop destroys the ADK session and rehydrates it from SQLite.
  If the reset throws, the turn ends with the terminal line.
- **Session Destroy:** a turn that ends on `terminal` or `session_corrupt` destroys the channel's session.
- **Stop Paths:** shutdown ends the loop with the line for the last kind seen. "Session not found" ends it as
  `network`, with a generic line.

The turn's outcome metric is `ok`, `fallback` (`transient_http`, `network`, `empty_text`) or `deflection` (any other
kind). A failed turn writes no session history. It writes one `failure_diagnostics` row with the kind, marker, block
side and safety rungs used. `gemini.maxRetries` plays no part in this loop.

At startup `src/config.ts` logs a warning in three cases: `session.ttl` is not above
`liveMaxRetries × (gemini.timeout + retryBackoffCapMs)`; the backoff cap makes `liveMaxRetries` unreachable; or
`turnDeadlineMs` is too short for every attempt.

## Safety De-Escalation Ladder

A `safety` block never resends the same prompt. The loop climbs one rung and tries again. Each rung removes carried
context and keeps the current message. `createTurnContext` (`src/agent/turnContext.ts`) returns the rung names and the
`composePrompt(rung)` builder.

| Rung | Name             | What Changes                                                                                                                            |
| ---- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | First attempt    | Full prompt: memory, `## Who Is Mentioned`, server facts, episodes, media memory, overheard messages, looked-up block, `## Reply Shape` |
| 1    | `drop_overheard` | Drops overheard messages, the looked-up block and the reply shape. Adds the `## Redirect This One` steer.                               |
| 2    | `drop_facts`     | Also drops memory, `## Who Is Mentioned`, server facts, episodes and media memory.                                                      |
| 3    | `clear_history`  | Builds the core prompt in the `sincere` tone, empties the session with no SQLite rehydration, and drops images and watched media.       |

The `## Redirect This One` steer tells Roka to answer the person, not the topic, in character, and never to mention
rules or filters.

- **Cost:** a rung needs the deadline check and one RPM slot above the floor. If either fails, the turn ends with the
  safety line.
- **Ceiling:** rungs raise the loop's attempt ceiling, so all 3 can run even when `liveMaxRetries` is lower.
- **Exhausted:** a safety block after rung 3 ends the turn with the safety line.

## Model Switch

After `transient_http`, `network`, `quota_exhausted`, `billing_exhausted`, `refusal`, `malformed_tool_args` or
`context_length`, the loop moves the rest of the turn to the other model once, if a fallback is configured. The switch takes no slot and no
backoff. Only the first three kinds open the sticky window (`llm.stickyMs`). Routing, hedging and pinning are in
[models.md](models.md).

## A Spent Day Is Not a Spent Minute

Gemini returns both as `429 RESOURCE_EXHAUSTED`. Only the `quotaId` tells them apart.

| `quotaId` Contains                          | Recovers Within a Turn?        | Kind              | Response                |
| ------------------------------------------- | ------------------------------ | ----------------- | ----------------------- |
| `...RequestsPerMinutePerProjectPerModel...` | Yes, in seconds                | `transient_http`  | Retry                   |
| `...RequestsPerDayPerProjectPerModel...`    | No, not until midnight Pacific | `quota_exhausted` | Switch model, or a line |

- **Ambiguous Payloads:** a payload that names both the day and the minute stays `transient_http`.
- **Server Delay:** a daily refusal still advertises a short `retryDelay`. `computeBackoff` takes only the attempt
  number, so the loop cannot honour it. Keep it that way.
- **Restarts:** the local `rpd` counter lives in memory and starts at zero after a restart. After a redeploy, only the
  provider's quota guards the day.

## Request Slots and Daily Units

`RateLimiter` (`src/utils/rateLimiter.ts`) keeps one instance per provider and model. `rpm` counts requests, and a turn
can make up to `gemini.maxLlmCalls` of them: one call, plus one more after each tool result.

- **Reserve, Then Release:** a turn holds `maxLlmCalls` slots while it runs. `release(used)` keeps the calls the turn
  made and frees the rest. `used` counts every model call of the turn, watcher and retry calls included, up to the
  reservation.
- **Sustained Rate:** a turn needs a whole reservation free, so single-call turns settle at `rpm - maxLlmCalls + 1` a
  minute (12 at `rpm: 15`).
- **Floor:** a `rateLimit.rpm` below `gemini.maxLlmCalls` stops startup, because no turn could ever fit.
- **Unknown Spend:** a turn that throws before it reports keeps its whole reservation.
- **Daily Units:** `rpd` takes one unit per admitted turn, one per retry or rung, and one per call that takes its own
  slot. `release(0)` returns the turn's unit; any other release keeps it. The counter resets at UTC midnight.
- **Not Counted:** `/anime` and `/remind` take no slot. `jikanThrottle` spaces Jikan calls 350 ms apart.
- **Unlimited Routes:** a model entry without `limits` never refuses on `rpm`, `rpd` or `tpm`. A Gemini entry inherits
  `rateLimit` and `gemini.maxTokensPerMinute`. The main route in the repository's `config.yml`, `haiku`, sets no
  `limits`, so the peek, the reservation, the retry floor and the token floor never refuse there.

## The Per-Minute Token Budget

`rateLimit.rpm` limits how many turns run, not what they cost, and bytes do not predict tokens. `TokenBucket`
(`src/agent/tokenBudget.ts`) meters tokens per rolling minute, one bucket per model, because TPM is the provider's
quota on the model.

- **Admission:** an attachment turn needs room for the costliest turn `gemini.maxAttachmentTokens` allows. The check
  runs before the call and byte reservations. A refusal sends the busy line and charges nothing.
- **Text Turns:** never gated. `rpm` already limits their spend.
- **Charge:** after the retry loop, `roka.ts` charges one estimate, `tokensInEst`, once per turn. It covers the final
  system prompt, history, tool declarations, the message, the attachment term `mediaTokens` and watched-media text.
  The `tokensInEst` metric uses the same expression. [media.md](media.md) explains how `mediaTokens` is measured.
- **Knob Ceiling:** the bucket drains continuously, so a burst into an empty bucket can spend 2x the setting in one
  rolling minute. `gemini.maxTokensPerMinute` is therefore capped at 125,000, half the measured 250,000 TPM.
- **Paired Bounds:** `maxTokensPerMinute` must be at least `maxAttachmentTokens`, and `maxAttachmentTokens` is also
  capped at 125,000. A lower budget could never admit an attachment turn.

## The Two Limiters' Windows

A bucket whose capacity equals its rate admits `capacity + rate × T` over a window `T`: twice the setting at one
minute. The two per-minute guards remove that 2x in different ways, on purpose.

| Limiter                  | Window                       | How It Holds the Ceiling                                                         |
| ------------------------ | ---------------------------- | -------------------------------------------------------------------------------- |
| `rateLimiter.ts` (`rpm`) | Exact 60 s sliding window    | Keeps at most `rpm` timestamps. A slot frees only when strictly older than 60 s. |
| `tokenBudget.ts` (`tpm`) | Continuously draining bucket | Keeps the bucket and caps the knob at half the real ceiling.                     |

The rule: exact where exactness is cheap, halved where it is not. An exact token window would have to keep every
charge, and halving `rpm` would give up half the request budget.

## Per-Call Budgets

Every provider call passes `startCall` (`src/agent/llm/budget.ts`) before it is sent. That covers replies, background
memory jobs, both watchers and both sides of a hedge.

- **Legacy Config:** without an `llm:` block (`config.llm.main.key` is `legacy-gemini`), `startCall` counts nothing,
  never waits and never refuses. Spend still goes to `llm_spend`, with no cap.
- **Limits Per Model:** an `llm.models` entry may set `limits: { rpm, rpd, tpm }`. On the main route, `rpm` must be at
  least `gemini.maxLlmCalls` and `tpm` at least `gemini.maxAttachmentTokens`, or startup stops. A model that is
  neither main nor fallback has no limits.
- **Covered by the Turn:** the turn reservation and the turn's token charge already count reply and watcher calls on
  the main model. Every other call takes one `rpm` slot and one `rpd` unit and charges its model's minute at its
  estimate. On release, the provider's reported prompt tokens replace the estimate.
- **Replies First:** a background call (any workload but `reply` and `watcher`) is refused unless one whole reply turn
  still fits after it: `maxLlmCalls` slots, daily units and Magicubes (ModelScope), plus `maxAttachmentTokens` tokens.
  Reply and watcher calls are never refused on tokens. Nothing in flight is preempted.
- **ModelScope:** one request in flight per account. A later call waits, for as long as its own abort signal allows.
  Reply and watcher calls queue ahead of background calls. All ModelScope models share
  `llm.modelscopeDailyMagicubes` (250): one per call, counted at start, reset at UTC midnight, kept in memory.
- **Monthly Spend:** each usage event is priced from the model profile and added to `llm_spend`. Cache reads cost the
  cached rate, cache writes the profile's write price or 1.25x input, and reasoning the output rate. Completed retries
  and losing hedge calls count; an aborted call adds nothing. At `llm.monthlyBudgetUsd[provider]`, every call to that
  provider is refused until the UTC month turns, across restarts. Background calls stop at 80% of the cap. An `llm:`
  block without `monthlyBudgetUsd` caps `anthropic` and `openai` at 5 USD; setting the key replaces both defaults.
- **Provider Billing Errors:** when an adapter sees the provider's own billing error, it disables that provider in
  memory until the month turns. A restart turns it back on.
- **Store Failures:** a failed `llm_spend` read counts the month as unspent. A failed write is logged, and the estimate
  survives only in the running process. Neither fails the call. The provider's bill stays the source of truth.
- **Not Metered:** embeddings.

| Budget Spent       | Error Kind          | `retryAfterMs`              |
| ------------------ | ------------------- | --------------------------- |
| `monthly`          | `billing_exhausted` | None                        |
| `rpm` or `tpm`     | `quota_exhausted`   | 60,000 ms                   |
| `rpd` or Magicubes | `quota_exhausted`   | Until the next UTC midnight |

Each refusal logs `Budget declined a model call` and names the budget. The retry loop does not read `retryAfterMs`.

## Concurrency and Lifecycle Under Retry

- **Same Channel:** a message that arrives during a retry gets the busy line. The handler drops it: no queue, no
  cancel, no slot. It stays in the passive buffer for a later turn.
- **Guard Lifetime:** the busy flag covers the pre-loop work (prompt assembly, memory retrieval, media) and the retry
  loop, which starts no attempt past `turnDeadlineMs`. The handler's `finally` frees it on every exit.
- **Other Channels:** may retry at the same time. `tryConsumeAboveFloor` is synchronous, so two channels cannot both
  slip past the floor. The memory scheduler runs on its own.
- **Idle TTL:** `session.ttl` is far longer than the retry window. If a session still goes away mid-loop, the loop
  ends with a generic line and does not throw.
- **Shutdown:** on `SIGTERM` or `SIGINT`, `destroyAllSessions` marks shutdown and aborts every running attempt within
  the 5 s force-exit budget in `src/index.ts`.
- **First Attempt:** on the main model, the turn reservation covers the first attempt and its tool calls. Only retries
  and rungs take extra slots. The Gemini watcher's single 503 retry uses the same floor ([media.md](media.md)).

## ADK Error Delivery Constraint

ADK yields model errors as runner events. It does not throw them from `runner.runAsync()`, so a `try`/`catch` around
the runner misses them. Reliability code must classify the yielded events and `LlmResponse` fields.

- **Error Plugin:** `ErrorRecoveryPlugin.onModelErrorCallback` turns a thrown model error into an `LlmResponse` with
  `errorCode` (the error's name), `errorMessage` and `customMetadata.reliabilityKind`. A `ProviderError` arrives as
  `errorCode: 'ProviderError'` and keeps its kind.
- **First Error Wins:** `runTurn` returns on the first event that has an `errorCode`.
- **Lost Safety Ratings:** for a Gemini candidate with no content parts, ADK's `createLlmResponse` copies
  `finishReason` (for example `SAFETY`) into `errorCode` and drops `candidate.safetyRatings`. The loop sees the coarse
  `finishReason` only, never the per-category rating.

## Configuration

| Key                            | Default                        | Bounds                                                                                  |
| ------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------- |
| `gemini.liveMaxRetries`        | 2                              | min 0                                                                                   |
| `gemini.retryRpmFloor`         | 2                              | min 0                                                                                   |
| `gemini.retryBackoffBaseMs`    | 1,000                          | min 0                                                                                   |
| `gemini.retryBackoffCapMs`     | 12,000                         | min 1                                                                                   |
| `gemini.turnDeadlineMs`        | 60,000; 63,000 in `config.yml` | min 1                                                                                   |
| `gemini.timeout`               | 15,000; 20,000 in `config.yml` | min 1                                                                                   |
| `gemini.maxLlmCalls`           | 4                              | min 1                                                                                   |
| `gemini.maxAttachmentTokens`   | 125,000                        | 10,890 to 125,000                                                                       |
| `gemini.maxTokensPerMinute`    | 125,000                        | `maxAttachmentTokens` to 125,000                                                        |
| `gemini.safetyThreshold`       | `OFF`                          | `OFF`, `BLOCK_NONE`, `BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_LOW_AND_ABOVE` |
| `rateLimit.rpm`                | 15                             | min `gemini.maxLlmCalls`                                                                |
| `rateLimit.rpd`                | 500                            | min 1                                                                                   |
| `llm.modelscopeDailyMagicubes` | 250                            | min 1                                                                                   |

Environment overrides are wired in `src/config.ts` (for example `GEMINI_LIVE_MAX_RETRIES`, `RATE_LIMIT_RPM`).

## Source Files

- `src/agent/reliability.ts`: retry loop, model switch, `ErrorRecoveryPlugin`, attempt aborts
- `src/agent/geminiReliability.ts`: failure kinds, classification order, backoff
- `src/agent/roka.ts`: loop wiring, safety rung actions, reply lines, token charge, failure diagnostics
- `src/agent/turnContext.ts`: safety ladder and `composePrompt`
- `src/utils/rateLimiter.ts`: sliding-window limiter, call reservations, retry floor
- `src/agent/tokenBudget.ts`: per-model token bucket and attachment admission
- `src/agent/llm/budget.ts`: per-call budgets, ModelScope slot, monthly spend
- `src/discord/events/messageCreate.ts`, `src/discord/events/interactionCreate.ts`: turn admission
- `src/discord/concurrency.ts`, `src/discord/byteBudget.ts`, `src/discord/responses.ts`: busy flag, byte budget, reply
  pools
- `src/config.ts`: defaults, environment overrides, `NUMERIC_BOUNDS`, startup warnings
