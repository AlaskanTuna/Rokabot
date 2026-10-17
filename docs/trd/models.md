# Models

The contract for model providers, profiles, config resolution, request shaping, main/fallback routing and model
spend.

## At a Glance

| Concern         | Rule                                                                                       | Default                              |
| --------------- | ------------------------------------------------------------------------------------------ | ------------------------------------ |
| Roles           | `config.llm.main` and an optional `config.llm.fallback`, each a `ResolvedModel`.           | Shipped: `haiku` and `qwen122`       |
| Providers       | `gemini`, `anthropic`, `openai`, `modelscope`, `openai-compatible`.                        | n/a                                  |
| Tested Profiles | Tested providers start only with a `verified: true` profile from `MODEL_PROFILES`.         | n/a                                  |
| Declared Models | `openai-compatible` entries build their own profile from `capabilities`.                   | `COMPATIBLE_DEFAULTS`                |
| Overrides       | `LLM_MAIN`, `LLM_FALLBACK` (`none` disables). A change takes a restart.                    | Unset                                |
| Switch          | Seven failure kinds move the rest of the turn to the other model, once.                    | n/a                                  |
| Sticky Window   | After the fallback answers a main outage, later turns start on the fallback.               | `llm.stickyMs` 300,000 ms            |
| Hedge           | A slow main call starts the same call on the fallback. The first answer wins.              | `llm.hedgeAfterMs` 0 (off)           |
| Pinning         | With a Claude side, the first answer pins the turn's later calls to that side.             | On when either side replays thinking |
| Spend Caps      | `llm.monthlyBudgetUsd[provider]` per UTC month. Background stops at 80%.                   | `anthropic: 5`, `openai: 5`          |
| Legacy          | No `llm:` block: `gemini.model` main, `fallback.model` on ModelScope, no per-call budgets. | n/a                                  |

The deployer guide is [Models](../guide/models.md).

## Provider IDs

| Provider            | Adapter                                                      | Key                                     | Default Endpoint                                              |
| ------------------- | ------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------- |
| `gemini`            | `GeminiLlm` (ADK `Gemini` plus shaping and usage)            | `GEMINI_API_KEY`                        | Google GenAI SDK default                                      |
| `anthropic`         | `AnthropicLlm` (`@anthropic-ai/sdk` Messages API)            | `ANTHROPIC_API_KEY`                     | SDK default, or the entry's `baseUrl`                         |
| `openai`            | `ChatCompletionsLlm`                                         | `OPENAI_API_KEY`                        | `https://api.openai.com/v1`                                   |
| `modelscope`        | `ChatCompletionsLlm`; `ModelScopeLlm` on the legacy fallback | `MODELSCOPE_API_KEY`                    | `fallback.baseUrl` (`https://api-inference.modelscope.ai/v1`) |
| `openai-compatible` | `ChatCompletionsLlm`                                         | The variable `apiKeyEnv` names, or none | The entry's `baseUrl` (required)                              |

`createLlm` (`src/agent/llm/createModel.ts`) picks the adapter by `provider`. `ModelScopeLlm` serves only the
synthesised `legacy-fallback` route, and only when its provider is `modelscope`. An `llm.models` entry named
`legacy-fallback` gets `ChatCompletionsLlm`.

## Model Profiles

`ModelProfile` (`src/agent/llm/profiles.ts`) describes one model. Adapters and shaping read it.

| Field               | Type                                                                       | Use                                                                                      |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `provider`, `model` | `ProviderId`, string                                                       | Lookup key for `profileFor`.                                                             |
| `input`             | `{ image, pdf, audio, video }`                                             | Which attachments go as content. Others become a text marker.                            |
| `tools`             | `{ supported, parallel }`                                                  | `supported: false` sends no tools. `parallel: false` sends `parallel_tool_calls: false`. |
| `thinking`          | `{ efforts, defaultEffort?, offMode?, replayWithinTurn }`                  | Allowed efforts, the default, how to spell "off", and whether to pin turns.              |
| `sampling`          | `{ temperature, topP }`                                                    | `false` drops that field from the request.                                               |
| `structuredOutput`  | `response_json_schema`, `json_schema_strict`, `forced_tool`, `json_object` | How a JSON-schema request is encoded.                                                    |
| `maxOutputTokens`   | number                                                                     | Ceiling for the entry's `maxOutputTokens`.                                               |
| `contextWindow`     | number                                                                     | Documented input size. No runtime check reads it.                                        |
| `promptCaching`     | `implicit`, `explicit`, `none`                                             | No code reads it. `AnthropicLlm` always caches.                                          |
| `tokenCounter`      | `gemini`, `anthropic`, `estimate`                                          | How the main model's attachment tokens are counted.                                      |
| `price`             | `{ input, output, cachedInput?, cacheWrite? }` USD per 1M tokens           | Spend estimate. `0` for Magicube-billed ModelScope.                                      |
| `verified`          | boolean                                                                    | `false` marks a candidate.                                                               |

### Tested-Profile Rule

For `gemini`, `anthropic`, `openai` and `modelscope`, `testedProfile` requires a profile with the same provider and
model, and `verified: true`. A profile ships as a candidate (`verified: false`) until the live probe
(`scripts/probe-llm-profile.ts`) passes; the runbook covers the probe.

| Verified                                                                                                                                                                         | Candidates                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `gemini-3.5-flash-lite`, `claude-haiku-5-5`, `claude-sonnet-5-5`, `gpt-6-luna`, `gpt-6-sol`, `Qwen/Qwen3.5-122B-A10B`, `Qwen/Qwen3.5-35B-A3B`, `deepseek-ai/DeepSeek-V4.1-Flash` | `gemini-3.8-flash`, `gemini-3.1-flash-lite`, `Qwen/Qwen3.5-27B` |

### The `openai-compatible` Exception

An `openai-compatible` entry has no row in `MODEL_PROFILES`. `compatibleEntry` validates the entry, merges its
`capabilities` over `COMPATIBLE_DEFAULTS`, and `compatibleProfile` builds a profile with `verified: true`. The
deployer vouches for the model.

| Capability          | Default       | Profile Field                                                   |
| ------------------- | ------------- | --------------------------------------------------------------- |
| `tools`             | `true`        | `tools.supported`                                               |
| `parallelToolCalls` | `true`        | `tools.parallel`                                                |
| `vision`            | `false`       | `input.image` (`pdf`, `audio`, `video` stay `false`)            |
| `structuredOutput`  | `json_object` | `json_schema` maps to `json_schema_strict`; `json_object` stays |
| `maxTokensParam`    | `max_tokens`  | `ResolvedModel.maxTokensParam`                                  |
| `temperature`       | `true`        | `sampling.temperature`                                          |
| `topP`              | `true`        | `sampling.topP`                                                 |
| `efforts`           | `[]`          | `thinking.efforts`; no default effort                           |
| `contextWindow`     | `131072`      | `contextWindow`                                                 |
| `maxOutputTokens`   | `8192`        | `maxOutputTokens`                                               |

The built profile always has `thinking.replayWithinTurn: false`, `promptCaching: 'none'` and
`tokenCounter: 'estimate'`. `price` comes from the entry (`input`, `output`; default `0`).

## Resolution

`resolveLlm` (`src/config.ts`) runs once at startup.

![From an llm.models entry to a model adapter](../diagrams/models-config.svg)

_Each role's entry, key and profile resolve to a `ResolvedModel`, and `createLlm` wraps it in the provider's adapter._

1. **No `llm:` Block:** `LLM_MAIN` set, or `LLM_FALLBACK` set to anything but `none`, stops startup. Otherwise the legacy
   route is built (see [Legacy Config](#legacy-config)). `LLM_FALLBACK=none` drops its fallback.
2. **Main Key:** `LLM_MAIN`, else `llm.main`. If neither is set, startup stops.
3. **Fallback Key:** `LLM_FALLBACK=none` gives no fallback. Else `LLM_FALLBACK`, else `llm.fallback`, else none.
4. **Each Role:** `resolveRole` looks up the key in `llm.models`, checks the provider, builds the profile (tested or
   declared), checks `effort`, reads the key, and fills defaults.
5. **Block Values:** `hedgeAfterMs` (default `0`), `stickyMs` (`300000`), `monthlyBudgetUsd`
   (`{ anthropic: 5, openai: 5 }`), `modelscopeDailyMagicubes` (`250`).
6. **Gemini Key:** `geminiKeyRequired` demands `GEMINI_API_KEY` when the main or fallback provider is `gemini`,
   embeddings resolve to `gemini`, or `media.watcher` is `gemini`.
7. **Bounds:** `NUMERIC_BOUNDS` checks the resolved numbers (see [Validation Errors](#validation-errors)).

### `ResolvedModel` Defaults

| Field                         | Value                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `key`                         | The `llm.models` key; `legacy-gemini` or `legacy-fallback` when synthesised.                                                             |
| `apiKey`                      | `gemini`: `GEMINI_API_KEY`. Others: the provider's variable, or the `apiKeyEnv` variable. Empty for a keyless `openai-compatible` entry. |
| `baseUrl`                     | The entry's `baseUrl`. `modelscope` falls back to `fallback.baseUrl`.                                                                    |
| `timeoutMs`                   | The entry's `timeoutMs`, else `gemini.timeout`.                                                                                          |
| `maxOutputTokens`             | The entry's `maxOutputTokens`, else `gemini.maxOutputTokens`.                                                                            |
| `effort`                      | The entry's `effort`, else `profile.thinking.defaultEffort`.                                                                             |
| `limits`                      | `gemini`: `rateLimit.rpm`, `rateLimit.rpd`, `gemini.maxTokensPerMinute`, overridden by the entry. Others: the entry's own, else none.    |
| `maxTokensParam`, `extraBody` | `openai-compatible` only.                                                                                                                |

`apiKeyEnv`, `extraBody`, `price` and `capabilities` are read for `openai-compatible` entries only. Other providers
ignore them.

### Validation Errors

Each problem stops startup with one message. `<at>` is `Config value llm.models.<key>`.

| Condition                                     | Message                                                                                                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role key not under `llm.models`               | `Config value llm.main must name a key under llm.models, got: <key>` (or `Environment variable LLM_MAIN …`)                                                                            |
| Unknown provider                              | `<at>.provider must be gemini, anthropic, openai, modelscope or openai-compatible, got: <value>`                                                                                       |
| No tested profile                             | `<at>.model has no tested <provider> profile, got: <model>`                                                                                                                            |
| Candidate profile                             | `<at>.model <model> is an untested candidate and cannot be llm.<role>`                                                                                                                 |
| Effort not listed                             | `<at>.effort must be one of <efforts>, got: <effort>`                                                                                                                                  |
| Effort on a model with no efforts             | `<at>.effort is not accepted by <model>, got: <effort>`                                                                                                                                |
| Key variable unset                            | `Missing required environment variable: <VAR> (llm.<role> uses <provider>)`                                                                                                            |
| Missing `model` (`openai-compatible`)         | `<at>.model must be a non-empty string, got: <value>`                                                                                                                                  |
| Missing `baseUrl`                             | `<at>.baseUrl is required for provider openai-compatible`                                                                                                                              |
| `baseUrl` not `http`/`https`                  | `<at>.baseUrl must be an http or https URL, got: <value>`                                                                                                                              |
| Bad `apiKeyEnv`                               | `<at>.apiKeyEnv must name an environment variable, got: <value>`                                                                                                                       |
| `extraBody` not a mapping                     | `<at>.extraBody must be a mapping, got: <value>`                                                                                                                                       |
| `capabilities` not a mapping                  | `<at>.capabilities must be a mapping, got: <value>`                                                                                                                                    |
| Unknown capability                            | `<at>.capabilities.<field> is not a known capability; use <fields>`                                                                                                                    |
| Wrong capability value                        | `… must be json_schema or json_object`, `… must be max_tokens or max_completion_tokens`, `… must be true or false`, `… must be a positive integer`, `… must be a list of effort names` |
| Bad price                                     | `<at>.price.<field> is not a known price; use input or output`, or `… must be a number >= 0`                                                                                           |
| Output cap above the profile                  | `Config value llm.<role>.maxOutputTokens must be <= <cap>, got: <value>`                                                                                                               |
| Main `rpm` below `gemini.maxLlmCalls`         | `Config value llm.models.<key>.limits.rpm must be >= <maxLlmCalls>, got: <value>`                                                                                                      |
| Main `tpm` below `gemini.maxAttachmentTokens` | `Config value llm.models.<key>.limits.tpm must be >= <maxAttachmentTokens>, got: <value>`                                                                                              |

`llm.hedgeAfterMs`, `llm.stickyMs` and each `llm.monthlyBudgetUsd.<provider>` must be `>= 0`;
`llm.<role>.timeoutMs` and `llm.modelscopeDailyMagicubes` must be `>= 1`.

## Request Shaping

`shapeRequest` (`src/agent/llm/requestShape.ts`) runs first on every adapter. It drops `temperature` and `topP` when
the profile rejects them, drops `safetySettings` for non-Gemini targets, and clamps `maxOutputTokens` to the
resolved cap.

| Provider            | Output Cap Field                                | Extra Body               | Auth Header                         | Structured Output                                                       | Thinking and Effort                                                                                       |
| ------------------- | ----------------------------------------------- | ------------------------ | ----------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `gemini`            | `maxOutputTokens`                               | None                     | SDK, `GEMINI_API_KEY`               | `responseJsonSchema`                                                    | No profile lists efforts.                                                                                 |
| `anthropic`         | `max_tokens`, plus 2,048 headroom when thinking | None                     | SDK, `ANTHROPIC_API_KEY`            | Haiku: forced strict `emit_result` tool. Sonnet: `output_config.format` | `none`: `thinking.type` `disabled` (Sonnet: `between_tools`). Else `adaptive` and `output_config.effort`. |
| `openai`            | `max_completion_tokens`                         | None                     | `Bearer OPENAI_API_KEY`             | `response_format.json_schema`, `strict: true`                           | `reasoning_effort` (`none` on GPT-6; tools need it).                                                      |
| `modelscope`        | `max_tokens`                                    | `enable_thinking: false` | `Bearer MODELSCOPE_API_KEY`         | `response_format: json_object`, schema in the system prompt             | None.                                                                                                     |
| `openai-compatible` | `capabilities.maxTokensParam`                   | The entry's `extraBody`  | `Bearer <apiKeyEnv value>`, or none | `json_schema` strict or `json_object`, per `capabilities`               | `reasoning_effort` when `effort` is set.                                                                  |

- **Chat Completions Body:** `{ model, messages, ...extraBody, stream: false }`. Fields set later for the call
  (`reasoning_effort`, `temperature`, `top_p`, the cap field, `tools`, `parallel_tool_calls`, `response_format`)
  replace the same keys in `extraBody`.
- **Strict Schemas:** a `json_schema_strict` profile makes optional fields required-nullable, turns `oneOf` into
  `anyOf`, closes objects with `additionalProperties: false`, and drops unsupported keywords. The reply's nulls are
  stripped again.
- **JSON Object Mode:** the schema goes into the system prompt, and a fenced reply is unwrapped.
- **Media on Chat Completions:** images go as data URLs when `input.image` is true (the legacy fallback always sends
  them). Audio, video, PDFs and other files become a text marker.
- **Tool Calls on Chat Completions:** the provider's call id is kept, and results pair by id. A result without an id
  pairs with the earliest unanswered id-less call of the same name. A call with no result is left out. The legacy
  fallback numbers calls `call_1`, `call_2` and pairs results first-in-first-out by name.
- **Claude Requests:** the stable core and speech prefix goes as one `cache_control` system block; the rest goes
  uncached. Images and PDFs go as content blocks when the profile reads them. Tool calls and results pair by id.
  The SDK runs with `maxRetries: 0` and `timeout: timeoutMs`.
- **Thinking Within a Turn:** Claude's thinking blocks are kept per turn route. They go back only inside that turn's
  tool loop, and only while the system, tools and earlier messages are byte-identical. Session history never holds
  them.
- **Gemini Interop:** calls returned by Claude or Chat Completions carry
  `thoughtSignature: 'skip_thought_signature_validator'`, so a Gemini side can read that history.

## Failure Classification

Adapters throw `ProviderError` (`src/agent/llm/providerError.ts`) with a `FailureKind`. The legacy fallback keeps
plain `ModelScope <status>: …` errors, except for malformed tool arguments. Failure kinds and the retry loop are in
[Reliability](reliability.md#failure-kinds).

| Signal                                    | Chat Completions                                                                  | Anthropic                            |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------ |
| 429                                       | `quota_exhausted`; `billing_exhausted` with `insufficient_quota` (not ModelScope) | `transient_http`, with `retry-after` |
| 402, `billing_error`, billing wording     | n/a                                                                               | `billing_exhausted`                  |
| 5xx, Anthropic `overloaded_error`         | `transient_http`                                                                  | `transient_http`                     |
| 4xx body naming Magicubes                 | `quota_exhausted`                                                                 | n/a                                  |
| 413 or an over-long prompt                | `context_length`                                                                  | `context_length`                     |
| HTTP 200 with no choices                  | `transient_http`                                                                  | n/a                                  |
| Refusal                                   | `refusal`                                                                         | `refusal` (`stop_reason: refusal`)   |
| Tool arguments that are not a JSON object | `malformed_tool_args`                                                             | `malformed_tool_args`                |
| Transport failure or timeout              | `network`                                                                         | `network`                            |
| Any other 4xx or error                    | `terminal`                                                                        | `terminal`                           |

`billing_exhausted` calls `markBillingExhausted(provider)`, which disables that provider until the UTC month turns or
the process restarts. `openai-compatible` is exempt: all such endpoints share one provider id, so one spent account
must not disable the others. Errors from an `openai-compatible` endpoint start with the entry key.

## Routing

`rokaModel` is a `RoutedLlm` (`src/agent/fallbackModel.ts`) built by `createRokaModel`. Each reply turn runs inside
one `ModelRoute` store (`modelRouteForRequest`):

| Field         | Meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `useFallback` | Start side. Set to "sticky window open" at turn start; flipped by a switch. |
| `hedged`      | `true` once any call of the turn fired a hedge.                             |
| `answeredBy`  | `main` or `fallback`: the side that produced the answer.                    |
| `pinned`      | The side the turn's first answer came from, when pinning is on.             |

![Model routing for one reply turn](../diagrams/models-routing.svg)

_A reply turn starts on the side the sticky window picks, may hedge, and switches sides once on a switch kind._

### Switch

After a failed attempt, `runTurnWithReliability` (`src/agent/reliability.ts`) consults `switchModel` once per turn
when the kind is in `SWITCH_KINDS` and a fallback exists. The rest of the turn moves to the other side, with no
backoff and no RPM-floor check, on top of the retry budget. The pin resets. The attempt timeout becomes the new
side's `timeoutMs`.

| Kind                  | Switches | Opens the Sticky Window |
| --------------------- | -------- | ----------------------- |
| `transient_http`      | Yes      | Yes                     |
| `network`             | Yes      | Yes                     |
| `quota_exhausted`     | Yes      | Yes                     |
| `billing_exhausted`   | Yes      | No                      |
| `refusal`             | Yes      | No                      |
| `malformed_tool_args` | Yes      | No                      |
| `context_length`      | Yes      | No                      |

`safety`, `recitation`, `terminal`, `session_corrupt` and `empty_text` never switch.

### Sticky Window

- **Opens:** a turn that switched from main to fallback for a `STICKY_KINDS` failure, and then succeeded on the
  fallback, sets `fallbackUntilMs = now + llm.stickyMs`. `stickyMs: 0` sets nothing.
- **Effect:** while it is open, `useFallback` starts `true`, and the Gemini media watcher is skipped.
- **Closes:** any turn that succeeds on the main side sets it to `0`.
- **No Extension:** a turn that only started on the fallback does not extend it. If that turn fails with a switch
  kind, it switches back to the main side.
- **Scope:** process memory. A restart clears it.

### Hedge

The hedge runs inside `RoutedLlm.generateContentAsync`, per model call. ADK sees one call per call, and
`maxLlmCalls` is unaffected.

- **Eligible:** a fallback exists, the turn is not pinned, `useFallback` is `false`, `hedgeAfterMs > 0`, and no
  content part carries non-image media. Images do not block a hedge.
- **Timer:** after `hedgeAfterMs`, the same request starts on the fallback. Each side gets its own `AbortController`.
- **Winner:** the first side to answer wins, because the bot runs non-streaming. The loser is aborted at once. An
  aborted loser logs nothing, counts as no failure, and arms nothing.
- **Failures:** a side that fails drops out of the race. A main failure before the timer fires ends the call at once,
  with no hedge. When both fail, the main side's error is rethrown, and the fallback's error is logged at warn.
- **Sticky:** a hedge win never opens the sticky window.
- **Recording:** `route.hedged` becomes `true`, and `answeredBy` names the winner.

### Pinning

`createRokaModel` sets `pinTurns` when either side's profile has `thinking.replayWithinTurn: true` (every Claude
profile). The turn's first answer sets `route.pinned`. Later calls of that turn go straight to the pinned side,
with no hedge. Gemini, OpenAI, ModelScope and `openai-compatible` profiles never replay thinking, so a route made only
of them never pins and hedges every eligible call.

### Logs

The log text predates provider choice and still says "Gemini" for any main model.

| Message                                                           | When                                        |
| ----------------------------------------------------------------- | ------------------------------------------- |
| `Switching turn to the other model`                               | A switch kind moved the turn.               |
| `Gemini unavailable, answering this turn with the fallback model` | The switch moved the turn to the fallback.  |
| `Fallback model answered`                                         | The turn succeeded with `useFallback` true. |
| `Hedged slow Gemini call; kept the faster answer`                 | A hedge fired; names the winner.            |
| `Hedged fallback call failed while Gemini was still running`      | Both hedge sides failed.                    |

## Budgets, Usage and Cost

Every adapter, both watchers and both hedge sides call `startCall` (`src/agent/llm/budget.ts`) before each provider
request, and release the reservation with the call's usage. The rules for slots, daily units, tokens, Magicubes and
replies-first admission are in [Reliability](reliability.md#per-call-budgets). Model-specific parts:

- **Limits Key:** limiters and token buckets are keyed by `provider/model`. `routeFor` takes limits from the first of
  main, then fallback, whose provider and model match. Two routes with the same model id share one limiter and the
  main entry's limits.
- **Price:** a tested provider prices a call from `profileFor(provider, model)`. An `openai-compatible` call uses the
  matching route's declared `price`, so two such routes on one model id share the main entry's price.
- **Cost:** `estimateCostUsd` = input x `input` + cache reads x `cachedInput` (else `input`) + cache writes x
  `cacheWrite` (else 1.25 x `input`) + (output + reasoning) x `output`, per 1M tokens.
- **Monthly Cap:** spend accumulates per provider id in `llm_spend` (UTC month). Background calls stop at 80% of
  `llm.monthlyBudgetUsd[provider]`; every call stops at 100%. A provider with no cap is recorded, never refused. All
  `openai-compatible` entries share the `openai-compatible` key.
- **`CallUsage`:** buckets are disjoint. `inputTokens` excludes cache reads and writes. `outputTokens` excludes
  `reasoningTokens` when the provider reports reasoning apart; Anthropic does not, so its `outputTokens` is the
  billed output.
- **Recording:** `recordUsage` feeds `onUsage` listeners. `response_events` gets `provider`, `model_id`,
  `route_role` (`main` or `fallback`), `workload` and `hedged`.

## Background Jobs

Extraction, reclassification and main-model memory judgments call `generateObject`
(`src/agent/llm/generateObject.ts`).

- **Request:** one JSON request. `responseJsonSchema` comes from the job's zod schema, adjusted per encoding by
  `requestSchema` (`objectSchema.ts`). Claude Haiku receives it as the forced output tool.
- **Order:** the main model, then the fallback once. An aborted signal skips the fallback. When both fail, the main
  model's error is thrown, because the extraction queue's retry policy judges that one.
- **Validation:** the reply is re-parsed against the zod schema. A blocked, truncated, empty or invalid reply throws
  `StructuredOutputError`. No partial object is returned.
- **Cap:** the job's own cap (default 1,024), limited by the profile's `maxOutputTokens`.
- **Workload:** carried in `labels.rokabot_workload` (`extraction`, `reclassify`, `admission`, `verification`).
  Adapters read it for usage and budgets.
- **Judge:** `memory.judge` is `jev` when `TYPESAFE_API_KEY` is set, `model` with an `llm:` block, else `none`.

## Legacy Config

Without an `llm:` block, `legacyLlm` synthesises the route the bot ran before model selection.

| Part             | Legacy Value                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main             | `legacy-gemini`: `gemini.model` (`GEMINI_MODEL`), timeout `gemini.timeout`, cap `gemini.maxOutputTokens`.                                                      |
| Fallback         | `legacy-fallback`: `fallback.model` (`FALLBACK_MODEL`) on ModelScope, only when `MODELSCOPE_API_KEY` is set. Uses `fallback.baseUrl` and `fallback.timeoutMs`. |
| Profiles         | The tested profile when one matches. Otherwise the provider's first profile with the model name swapped in. The tested-profile rule does not apply.            |
| Hedge and Sticky | `gemini.hedgeAfterMs`, `fallback.stickyMs`.                                                                                                                    |
| Limits           | Gemini: `rateLimit` and `gemini.maxTokensPerMinute`. ModelScope: none.                                                                                         |
| Per-Call Budgets | Off. `startCall` counts nothing and refuses nothing. Spend is recorded with no cap.                                                                            |
| Background Jobs  | `gemini.extractionModel`, `gemini.timeout`, no fallback. Extraction and reclassification send their hand-written Gemini `responseSchema`.                      |
| Memory Judge     | `jev` with `TYPESAFE_API_KEY`, else `none`: passive extraction is disabled.                                                                                    |
| Fallback Adapter | `ModelScopeLlm`: plain errors, transport errors passed through, an HTTP 200 with no choices read as an empty reply.                                            |
| Gemini Key       | Always required.                                                                                                                                               |

## Source Files

- `src/config.ts` (`resolveLlm`, `resolveRole`, `compatibleEntry`, `legacyLlm`, `NUMERIC_BOUNDS`)
- `src/agent/llm/profiles.ts`
- `src/agent/llm/createModel.ts`
- `src/agent/llm/requestShape.ts`, `src/agent/llm/objectSchema.ts`
- `src/agent/llm/anthropicLlm.ts`, `src/agent/llm/chatCompletionsLlm.ts`
- `src/agent/llm/budget.ts`, `src/agent/llm/usage.ts`, `src/agent/llm/generateObject.ts`
- `src/agent/fallbackModel.ts`
- `src/agent/reliability.ts`, `src/agent/roka.ts`
- `config.yml`, `.env.example`
