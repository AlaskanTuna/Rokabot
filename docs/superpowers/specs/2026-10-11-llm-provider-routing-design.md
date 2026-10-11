# Modular LLM Providers Design (#296)

Status: **draft for owner review**. Every open decision below is answered by the owner (2026-10-11); nothing is implemented yet. Inputs: two systems-engineering consults (`codex exec`, gpt-6-astra, xhigh) and a primary-source model survey.

## Goal

Rokabot becomes a modular chatbot that runs on any major LLM API: the owner or a self-hoster swaps Roka's "brain" to match taste and the API keys at hand. One provider key is enough to run the whole bot, memory included. Gemini stays the default.

## Owner Decisions

| #   | Decision                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `config.yml` selects a **main** model (required) and a **fallback** model (always optional). Any of the five providers can be either: Gemini, Anthropic, OpenAI, Qwen, DeepSeek.                                       |
| D2  | Every provider's default model is its **budget tier**, the equivalent of `gemini-3.5-flash-lite`.                                                                                                                      |
| D3  | Keys: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MODELSCOPE_API_KEY`. Qwen **and** DeepSeek both go through ModelScope API-Inference. A key is required only when a configured role uses that provider. |
| D4  | Memory extraction and reclassification are ordinary LLM calls and run on the main model (fallback when it fails).                                                                                                      |
| D5  | Embeddings get their own setting: `local` (default), `gemini` or `openai`.                                                                                                                                             |
| D6  | `local` embeddings run in a sidecar container capped at 1 GiB. Inputs past 512 tokens are truncated and the truncation is logged.                                                                                      |
| D7  | Jev stays when `TYPESAFE_API_KEY` is set. Without it, the main model makes the admit and verify judgments as structured output, calibrated separately.                                                                 |
| D8  | The media watcher keeps its own setting: `off`, `gemini` or `qwen`. It is the only workload that stays tied to those two providers.                                                                                    |
| D9  | Delivery order: Gemini and Anthropic first, then the Chat Completions family (Qwen, DeepSeek, OpenAI). OpenAI uses Chat Completions first; the Responses API only if reasoning-with-tools becomes necessary.           |
| D10 | Thinking is carried only inside one turn's tool loop, never between Discord turns.                                                                                                                                     |
| D11 | Paid routes start with hedging off and a local monthly cap of $5 per paid provider; Anthropic Console auto-reload stays off.                                                                                           |
| D12 | Only tested model profiles are accepted; an unknown model ID fails validation at startup.                                                                                                                              |
| D13 | Switching models is a `config.yml` edit (or env override) plus a restart.                                                                                                                                              |

## Default Model Profiles

From the provider docs on 2026-10-11 (budget-model survey). ModelScope rows are candidates until an endpoint test passes (D12).

| Provider              | Model ID                          | Setting                                                                                   | Notes                                                                                                                                                                                                           |
| --------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini (default)      | `gemini-3.5-flash-lite`           | Today's settings                                                                          | 1M context, 65K output                                                                                                                                                                                          |
| Anthropic             | `claude-haiku-5-5`                | `effort: low`, thinking on (D10); no `temperature`, `top_p`, `top_k` or assistant prefill | #296's benchmark: thinking off missed `recall_user` and drifted from the persona. Earlier-turn thinking blocks are never sent back, which avoids Haiku's 400 on changed history. Fallback setting: thinking off |
| OpenAI                | `gpt-6-luna`                      | `reasoning_effort: none` on Chat Completions                                              | Chat Completions accepts tools only at effort `none`; higher efforts need the Responses API (D9)                                                                                                                |
| Qwen (ModelScope)     | `Qwen/Qwen3.5-35B-A3B`            | `enable_thinking: false`                                                                  | Hosted twin of Qwen3.5-Flash; already used by the watcher. `Qwen/Qwen3.8-Flash-Next` is a later candidate                                                                                                       |
| DeepSeek (ModelScope) | `deepseek-ai/DeepSeek-V4.1-Flash` | Thinking off                                                                              | Tool calling and JSON mode on ModelScope are undocumented: verify first. DeepSeek's own API needs every earlier `reasoning_content` sent back with thinking plus tools, another reason for thinking off         |

ModelScope bills in Magicubes, not tokens: about 250 a day, 0.5–2 per call by model size, one shared balance for Qwen and DeepSeek, and guaranteed concurrency of one request. ModelScope serves no embedding models.

## Workloads

| Workload                   | Today (Gemini Only)                                                | After                                                                                                           |
| -------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Replies                    | `src/agent/fallbackModel.ts:524`, `src/agent/roka.ts:155`          | Main model, optional fallback, through `RoutedLlm`                                                              |
| Memory extraction          | `src/agent/memory/extractor.ts:122`                                | `generateObject` on the main model                                                                              |
| Reclassification           | `src/agent/memory/reclassifyModels.ts:64`                          | `generateObject` on the main model                                                                              |
| Admission and verification | Jev (`src/agent/memory/admission.ts:27`), needs `TYPESAFE_API_KEY` | Jev when set; otherwise main-model judgments through `generateObject` (D7)                                      |
| Episode embeddings         | `src/agent/memory/episodeEmbeddings.ts:23`                         | `EmbeddingClient`: `local` sidecar, Gemini or OpenAI (D5)                                                       |
| Attachment token counting  | `src/agent/attachmentCost.ts:50`                                   | The main profile's counter (Anthropic `count_tokens`) or an estimate from text tokens, image size and PDF pages |
| Safety settings            | `src/agent/safetySettings.ts:32`                                   | Sent only with Gemini requests                                                                                  |
| Media watcher              | `src/agent/media/watch.ts:200`, `filesUpload.ts`, `turnMedia.ts`   | Unchanged providers (D8); stops borrowing `config.fallback` credentials (`turnMedia.ts:645`)                    |
| Harness diagnostics        | `tests/harness/quotaDiagnostic.ts:50`, `measure.ts:151`            | Follow the selected profile; keep explicit Gemini diagnostics                                                   |

## Architecture

```text
LlmAgent (roka.ts)
  RoutedLlm (fallbackModel.ts)            main / optional fallback, hedging, pinning
    Gemini (ADK)                          gemini
    AnthropicLlm                          anthropic, @anthropic-ai/sdk, SDK retries off
    ChatCompletionsLlm                    openai (api.openai.com), modelscope (qwen, deepseek profiles)
generateObject(schema, prompt)            background jobs; same adapters, no ADK runner or tools
EmbeddingClient.embed(text, role)         local sidecar | gemini | openai
profiles.ts                               tested model capabilities and prices
```

- **One seam for generation.** Replies, extraction, reclassification and fallback judgments all use the same adapters. A separate general-purpose client would duplicate routing, deadlines, usage accounting and failure classification.
- **Provider pinning.** Once a provider answers in a turn, it handles the rest of that turn's tool loop. Executed tools are never replayed to switch providers. Each background job routes on its own.
- **Profiles live in code** (`src/agent/llm/profiles.ts`): image, PDF, audio/video, tools, parallel tools, thinking and effort values, accepted sampling parameters, max output, context window, caching, price. Config can lower a limit; it cannot add an ability.
- **Request shaping.** Each adapter drops what its target rejects: Claude gets no sampling parameters; only Gemini gets safety settings.

## Config

```yaml
llm:
  main: flash # required; a key under llm.models
  fallback: null # optional; a key under llm.models
  hedgeAfterMs: 0 # paid routes start at 0 (D11)
  stickyMs: 300000
  monthlyBudgetUsd:
    anthropic: 5
    openai: 5
  models:
    flash: { provider: gemini, model: gemini-3.5-flash-lite }
    haiku: { provider: anthropic, model: claude-haiku-5-5, effort: low }
    luna: { provider: openai, model: gpt-6-luna, effort: none }
    qwen: { provider: modelscope, model: Qwen/Qwen3.5-35B-A3B }
    deepseek: { provider: modelscope, model: deepseek-ai/DeepSeek-V4.1-Flash }

embeddings:
  provider: local # local | gemini | openai
  timeoutMs: 1500

media:
  watcher: gemini # off | gemini | qwen
```

- **Back-compat.** With no `llm:` block, the bot synthesises today's setup: Gemini main, Qwen fallback when `MODELSCOPE_API_KEY` is set, current hedge and sticky values, Gemini embeddings and the current watcher. The Pi's config works unchanged at every phase. `gemini.extractionModel` is deprecated; the main model is authoritative.
- **Overrides.** `LLM_MAIN`, `LLM_FALLBACK` (`none` allowed), `EMBEDDINGS_PROVIDER`, plus the existing media overrides. New settings outrank deprecated ones.
- **Startup validation.** `main` and `fallback` name entries with a known provider and a tested profile; the key for each used provider is present (`requiredEnv('GEMINI_API_KEY')` at `src/config.ts:286` becomes conditional); numeric bounds hold; the local embedding model's files exist. A bad config stops startup with one clear message.

## Structured Output

`extractionSchema.ts` keeps two schema definitions today: zod (`:101`) and a hand-written Gemini schema (`:235`). The zod schema becomes the single source; each provider's request schema is generated from it, then adjusted for that provider.

| Provider          | Encoding                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini            | `responseJsonSchema` from the generated JSON Schema                                                                                                              |
| OpenAI            | `response_format.json_schema` with `strict: true`; optional fields sent as required-nullable, normalised back                                                    |
| Anthropic         | One forced output tool with `strict: true`; its input is the result                                                                                              |
| Qwen and DeepSeek | `json_object`, the schema in the prompt, and local validation. ModelScope returned HTTP 200 with `choices: null` for `json_schema` on DeepSeek (modelscope#1801) |

Every result is re-validated with the original zod schema, including the date refinements. Unsupported bounds are removed only from the transmitted schema. Reclassification's predicate becomes an enum from the predicate registry. Refusals, truncation and invalid objects are rejected before any write; the fallback is tried once; no partial operation is ever applied.

## Local Embeddings

- **Stack.** A sidecar on a Debian Node 24 image running Transformers.js with `onnxruntime-node`. The bot image is Alpine (`Dockerfile:16`), and the native ONNX runtime targets glibc.
- **Model.** `Xenova/multilingual-e5-small`, q8 quantised. It is MIT-licensed, multilingual, 384 dimensions, 512-token input limit, about 140 MB with tokenizer. It uses `query:`/`passage:` prefixes, mean pooling and L2 normalisation.
- **Footprint (estimate, not measured on the Pi).** 300–650 MiB RSS; 0.2–1 s per 64–128-token text; 2–10 s cold start. Release gate: peak RSS under 800 MiB while speech recognition and attachments run concurrently.
- **Limits.** One inference thread and one request at a time under a 1 GiB cap (D6). Queries get priority, and backfill pauses during media work. Containers total about 4 GiB: bot 1, speech 2, embeddings 1.
- **Offline.** Pinned, checksummed model files are baked into the image and remote downloads are disabled. The sidecar warms up before it reports ready.
- **Quality.** Today's `gemini-embedding-2` (768 dimensions here, 8K-token input) is stronger. The loss on Rokabot's own recall is unknown until measured.

## Vector Migration

- Episodes, media digests and claims store vectors (`src/storage/database.ts:223`, `:240`, `src/storage/memoryClaimSchema.ts:151`). The encoder and cosine hard-code 768 (`memoryEpisodeStore.ts:29`, `episodeRetriever.ts:15`).
- Each vector gains `embedding_model_id`, `embedding_dim` and `embedding_fingerprint` (provider, revision, quantisation, preprocessing). Recall compares only matching fingerprints and checks `bytes = dim × 4` and a nonzero norm.
- Legacy vectors stay "unknown provenance" until re-embedded. Text recall and privacy filtering keep working throughout.
- A backfill job extends `episodeMaintenance.ts:29`: bounded batches at one document per second, resumable from stored metadata, replacing a vector only if its source text is unchanged. Paid backfill draws on that provider's monthly cap.
- Recall thresholds (`config.yml:109`, `:122`) are recalibrated per fingerprint. E5 scores cluster between 0.7 and 1.0, so Gemini's thresholds don't carry over.

## Failures

Each adapter classifies its own errors; the ladder in `src/agent/reliability.ts:260` decides recovery.

| Kind                        | Examples                                                                      | Action                                            |
| --------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `transient_http`, `network` | 5xx, Anthropic 529, timeout                                                   | Fallback this turn; short sticky window           |
| `quota_exhausted`           | 429, Gemini RESOURCE_EXHAUSTED, Magicubes spent                               | Fallback; sticky until the provider resets        |
| `billing_exhausted` (new)   | Anthropic credit used up (400/402/429 with a billing code), local cap reached | Fallback; route disabled until the month resets   |
| `refusal` (new)             | Claude `stop_reason: refusal`, a safety stop                                  | Fallback once this turn; no sticky state          |
| `malformed_tool_args`       | Unparseable arguments                                                         | Run nothing; fallback once; no sticky state       |
| `context_length`            | Request too large                                                             | Trim history once, then fallback; no sticky state |

With no fallback configured, the ladder retries what is retryable and then sends today's in-character failure reply.

## Budgets and Limits

- Per-call reservations of RPM, TPM and estimated spend, across every workload, replace today's per-turn daily unit (`src/utils/rateLimiter.ts:128`) and the Gemini-only token budget (`src/agent/tokenBudget.ts:26`). Replies outrank background jobs.
- Each profile carries its own limits. ModelScope gets one in-flight request and a daily Magicube estimate shared by Qwen and DeepSeek.
- Monthly spend is estimated from returned usage and profile prices, persisted, and counts cache writes, reasoning tokens, retries and losing hedge calls. The provider's bill stays the source of truth.

## Observability

`response_events` gains `provider`, `model_id`, `route_role` and `workload`; old rows keep `model = gemini | fallback`. Each call records latency, failure kind, input/output/reasoning tokens, cache reads and writes, and estimated cost.

## Testing

- **Adapters.** Recorded, sanitised fixtures per adapter: text, single, parallel and repeated tool calls, images, PDF, refusal, billing error, 529, truncation, cancellation and usage.
- **Routing.** Every ordered main/fallback pair, plus "no fallback", offline through `RoutedLlm` and the ladder. This extends `src/agent/__tests__/fallbackModel.test.ts` and `modelHedge.test.ts`.
- **Structured output.** The extraction and reclassification schemas are encoded for each provider and valid and invalid replies decoded, including nullable normalisation.
- **Embeddings.** Golden vectors for the sidecar, fingerprint mismatch handling, and backfill resumption.
- **Config.** A legacy config (no `llm:`) behaves exactly as today. Each single-key setup starts. Every validation error has a test.
- **Live (owner-run, paid).** `npm run test:live` with a provider selector covering persona turns, tool triggers, a multi-step chain, an image, extraction, warm-cache hits and a forced fallback. Each run asserts which provider answered.

## Phases

| Phase | Size      | Delivers                                                                                                                                                                                                                                                 | Gate                                                                                              |
| ----- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1     | 8–12 days | `llm:` and `embeddings:` config with back-compat, profiles, `AnthropicLlm`, `generateObject` for extraction, reclassification and fallback judgments, pinning, new failure kinds, per-call budgets, metrics, local sidecar, vector metadata and backfill | Legacy config unchanged; an Anthropic-only key runs replies, tools, memory and local embeddings   |
| 2     | 4–6 days  | `ChatCompletionsLlm` for OpenAI and ModelScope (Qwen, DeepSeek profiles)                                                                                                                                                                                 | Every ordered pair and "no fallback" pass offline; ModelScope tool and JSON support verified live |
| 3     | 2–4 days  | OpenAI embedding profile (`text-embedding-3-small`), paid-backfill accounting, recall threshold calibration per fingerprint                                                                                                                              | Recall on a labelled set at least matches today's before thresholds go live                       |

## Risks

- **Self-verification.** Without Jev, the main model checks its own extraction, so errors can correlate. Mitigation: separate calibration and a metric on admitted versus later-retracted facts.
- **Embedding drift.** Smaller local vectors recall differently. Mitigation: per-fingerprint thresholds and a labelled recall check before cut-over.
- **Pi load.** The sidecar competes with speech recognition for CPU. Mitigation: one thread, query priority, backfill pausing.
- **Shared ModelScope quota.** Qwen and DeepSeek drain one Magicube balance with a concurrency of one. Mitigation: per-provider limiter and a daily estimate.
- **Unverified ModelScope features.** DeepSeek tool calling, JSON mode and thinking control, context caps, and whether an API-key-only account gets the daily Magicube grant. Mitigation: endpoint tests before those profiles are accepted (D12).
- **Persona drift.** Each brain voices Roka differently. Mitigation: a persona live check per profile before it can be `main`.
