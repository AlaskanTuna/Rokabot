# Decisions

The lasting choices behind Rokabot, with why they were made. Check here before reversing one. Add a row in the PR that makes a new decision.

## Agent and Prompts

| Date       | Decision                                                                                                                                                          | Why                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 2026-07-22 | Retries are rate-aware and bounded, and sessions are destroyed only on terminal errors                                                                            | One slow turn must not burn quota or strand channels        |
| 2026-07-22 | Untrusted content travels in labelled inert envelopes, and every fact write funnels through one validating chokepoint                                             | Structure, not per-field checks, is the injection guarantee |
| 2026-07-26 | Harm-block thresholds are set explicitly at every call site instead of inheriting model defaults                                                                  | A model upgrade once silently changed blocking behavior     |
| 2026-07-29 | The retry loop runs under a turn deadline by admission control, and attempt zero is never gated                                                                   | Bounds the worst turn without throttling the common one     |
| 2026-08-05 | A timed-out attempt stays retryable as the most transient failure, with the backoff sleep on a fresh signal; only shutdown and the deadline stop the loop         | A slow call must not cancel its own retry                   |
| 2026-08-05 | Safety blocks walk a three-rung ladder shedding optional context while keeping the current message, and the last rung destroys the session without rehydrating it | Re-sending the rejected context re-blocked every time       |
| 2026-08-18 | Prompt layers can contradict with the later layer winning, and the system prompt cannot branch on what a turn will contain                                        | New rules must be written against all layers at once        |
| 2026-09-25 | Question-answering turns are memory-free by filtering tool declarations at the model boundary, with no second agent                                               | Keeps factual answers from reading or writing memory        |
| 2026-10-07 | Model-narrated tool calls are stripped at the model boundary, matching real tool names only                                                                       | A prompt rule cannot deterministically suppress leaks       |
| 2026-07-23 | Replies run short beats inside a stated word band with natural endings, and the token cap is headroom only                                                        | Keeps her voice compact without clipping thoughts           |
| 2026-07-23 | Faces are kaomoji only, with object and decor emoji sparing                                                                                                       | Purely facial emoji are banned, faces stay typed            |
| 2026-11-03 | A retry resends the message, marked so the session does not store it twice                                                                                        | ADK runs the agent only when a message is present           |

## Memory

| Date       | Decision                                                                                                                                                        | Why                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 2026-07-23 | Tool usage is recorded as names only, never arguments                                                                                                           | Arguments can carry message content                           |
| 2026-08-01 | Tenancy is per-guild and per-channel with no shared fallback, and memory tools fail closed on a missing tenant                                                  | One shared tenant once leaked facts across conversations      |
| 2026-08-01 | Persisted failure markers store a bounded error code, finish reason or status code, never the full provider message                                             | Error text can echo request content                           |
| 2026-08-05 | Failure diagnostics live apart from reply metrics with shorter retention, recording which side blocked                                                          | Verbatim trigger text must not share metrics retention        |
| 2026-08-19 | Requested facts store as explicit and observed facts as passive via extraction, and an outright request bypasses the already-known skip                         | The extractor owns passing mentions at a fraction of the cost |
| 2026-08-19 | A code-level privacy floor blocks contact, money, identifier and credential facts on key or value signals, while everyday facts stay storable                   | The vocabulary already encodes general, not specific          |
| 2026-09-25 | Server facts are typed expiring claims while conversations recall by brute-force embedding cosine per server                                                    | No vector extension at this row count                         |
| 2026-09-25 | Unpinned facts expire by tier from their last mention — identity and social 180 days, lifestyle 30, opinions and misc 14 — and recall never refreshes the clock | Repeating a fact must not keep it alive                       |
| 2026-09-25 | Expired or superseded values revive on re-sighting, but deliberately forgotten ones return only by explicit request                                             | Restating is an add through the verified duplicate path       |
| 2026-09-25 | The memory key stays free text with normalization and examples, never an enum                                                                                   | Listing categories once cut live triggering sharply           |
| 2026-09-25 | Extraction dates require month and day with year only when stated, and month-precision server facts use a separate branch with a nullable event date            | Required days made the model invent dates                     |
| 2026-10-08 | Recall privacy runs relaxed, balanced, strict or off, changing recall only so switching needs no backfill                                                       | Levels, not migrations                                        |
| 2026-10-08 | Public means viewable by everyone and not age-restricted, computed at recall time, with unknown channels counting as private                                    | Channel changes need no migration                             |
| 2026-10-08 | Unverified writes stage as candidates and never touch active facts, and unverified repeats never demote them                                                    | One write once hid both the fact and its correction           |
| 2026-10-08 | Relevance recall ships behind a mode flag as one ranked block under a token budget, gated on calibrated similarity floors                                       | Switching modes needs labelled calibration, not a flip        |
| 2026-10-09 | Past facts never supersede, revive or replace current ones, and evict first at the cap                                                                          | History stays history on every surface                        |
| 2026-10-14 | A Jev gate decides recall relevance: similarity only proposes candidates, core facts bypass the gate, and a Jev outage leaves core-only recall                  | Similarity floors reached 9% precision on blind labels (#262) |
| 2026-11-04 | The recall gate waits up to its full deadline for the query embedding                                                                                           | Pi embeddings take 465-823 ms                                 |

## Models and Search

| Date       | Decision                                                                                                                               | Why                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 2026-08-18 | Web search carries no domain blocklist; filtering for restricted installs would key on the channel flag, never a repo list             | The bot serves unrestricted servers too                                       |
| 2026-09-24 | Outage fallback is an in-process routed model, with one switch per turn plus a short sticky window                                     | A sidecar could not set the options that keep fallback fast                   |
| 2026-09-24 | Jev takes pick-from-a-list decisions only, per feature defaulting to shadow and failing open inside the reply deadline                 | It cannot write, route tools or verify facts                                  |
| 2026-09-25 | Slow calls hedge per model call with first success winning, never a second session run, and hedge wins never latch the fallback window | A second run would double-append to session history                           |
| 2026-10-07 | Tone judging switches on at a low probability cutoff chosen against human labels, not detector agreement                               | The cutoff targets the detector being replaced                                |
| 2026-10-07 | Search prefetch stays in shadow after a live test lost recall and added latency                                                        | Waiting for prefetch cannot beat the first model call                         |
| 2026-11-03 | `search.provider` picks off, native, tavily or exa behind one `search_web` tool, and native is a separate call to the main model       | Chat adapters stay unchanged, and search still runs when the fallback answers |
| 2026-11-03 | A native search takes at most `search.nativeTimeoutMs` and leaves `search.nativeReserveMs` for the next chat call                      | An overrun would waste a paid result and force a fallback switch              |

## Media

| Date       | Decision                                                                                                                        | Why                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 2026-08-19 | Attachment bytes are stripped from session history after the turn, ending cross-turn media recall                               | Retained bytes grew memory per turn and re-billed every round            |
| 2026-08-19 | Oversized media is admitted by bounded byte prefix with range requests, refusing video whose index trails the data              | Whole-file ingestion can exceed the per-minute token ceiling in one turn |
| 2026-08-20 | Attachment turns are admitted by measured token cost independently of byte size and request rate                                | Small files measured tens of thousands of tokens                         |
| 2026-08-20 | The model is told what was dropped or refused instead of meeting silence                                                        | Silence measured four fabrications in four turns                         |
| 2026-10-08 | Audio and video reach the character as a tool-less digest call producing structured text, never raw bytes                       | Stops tool rounds re-billing the media and gives memory a text form      |
| 2026-10-08 | Provider-side files stream up and are deleted after the watch, splitting long videos only when budget allows and never retrying | Keeps large uploads inside token and call budgets                        |
| 2026-10-08 | Watched media is remembered as server-scoped text under exact content keys for 90 days, with embeddings for recall only         | Reposts match without re-watching                                        |

## Discord

| Date       | Decision                                                                                                          | Why                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 2026-07-22 | Hatching runs on a rolling cooldown from one timestamp, with streaks surviving a 48-hour grace period             | One timestamp means no timezone math                  |
| 2026-08-01 | The reply ceiling is the shared component budget minus the derived tool-footer allowance, sent as components only | A fixed ceiling once permitted unsendable messages    |
| 2026-08-01 | Timing-out games stay guild-only for their out-of-band completion push while the companion command ships portable | Their completion push needs a guild channel           |
| 2026-08-18 | Long replies split at newline, then space, then hard cut past the halfway mark, stepping back off surrogate pairs | Hard cuts rendered emoji as replacement characters    |
| 2026-08-18 | Factual questions go through one ask command with optional image, retiring the model-free direct search           | Trades the zero-model path for one surface, knowingly |
| 2026-08-26 | Markdown safety for faces and code lives on the send path, not in the prompt                                      | An escape the model must remember is a hope           |

## Deployment

| Date       | Decision                                                                              | Why                                        |
| ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| 2026-07-22 | Reply metrics persist locally with bounded retention under a never-throw write policy | A failed write must never fail a reply     |
| 2026-07-24 | Chart fonts ship baked into the runtime image, with output verified in-container      | Dev machines render what production cannot |

## Repository

| Date       | Decision                                                                                     | Why                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 2026-07-29 | Live-model behavior runs in its own gate outside the offline correctness and latency gates   | A network hiccup must not read as a regression                                         |
| 2026-07-30 | Every numeric tunable lives in one bounded registry with environment overrides               | One registry means one place to keep in sync                                           |
| 2026-09-24 | The generated knowledge graph is committed, and graph-only changes skip deployment           | Keeps the map fresh without redeploying the bot                                        |
| 2026-11-03 | `AGENTS.md` is a short router to modular rule files                                          | Agents read it on every turn, so it stays short                                        |
| 2026-11-03 | `README.md` lives at the root, reversing the 2026-07-23 choice of `docs/README.md`           | It is where readers and tools look first                                               |
| 2026-11-03 | Issue and PR labels come from Conventional Commit titles, and a required check enforces them | One vocabulary, and a valid title is all a contributor needs                           |
| 2026-11-03 | Design documents are tracked in `docs/specs/`, while plans and run notes stay local          | Designs outlast the work, and plans go stale once merged                               |
| 2026-11-04 | The Pi watches video with Gemini, with Qwen as the backup                                    | A 202-second video went from 78 s to 21 s end to end; removing Qwen is tracked in #442 |
| 2026-11-04 | Embed videos are watched only through Discord's proxy URL                                    | A sender's own URL would make the Pi contact a host they chose                         |
