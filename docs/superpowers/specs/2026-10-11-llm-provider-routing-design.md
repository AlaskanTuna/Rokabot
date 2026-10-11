# LLM Provider Routing Design (#296)

Status: **draft for owner review**. Nothing here is implemented. Items marked **Pending** use the recommended answer until the owner says otherwise.

## Goal

`config.yml` chooses which model writes Roka's replies (**main**) and which one takes over when it fails (**fallback**). Five providers can fill either role: Gemini, Anthropic, OpenAI, Qwen and DeepSeek.

### What the Owner Said

- A `config.yml` setting selects the main and the fallback LLM.
- Supported now: Gemini, Anthropic, OpenAI, Qwen, DeepSeek.
- Consult a systems engineer first (done: `codex exec`, gpt-6-astra, xhigh, 2026-10-11).

### Assumptions (Pending)

| #   | Assumption        | Recommended Answer                                                                                                                                                                   |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Main purpose      | Try models on Roka's persona and keep the best (quality), then spend free or cheap credit first (cost). Resilience stays at today's level.                                           |
| A2  | Scope             | Chat replies only. Embeddings, memory extraction, reclassification, attachment token counting and the media watcher stay on their current providers.                                 |
| A3  | Fallback depth    | One fallback, not a chain.                                                                                                                                                           |
| A4  | Switching         | Edit `config.yml` (or an env override) and restart. No live switching.                                                                                                               |
| A5  | Endpoints         | Qwen through ModelScope (today's endpoint). DeepSeek, OpenAI and Anthropic through their official APIs. Keys in `.env`.                                                              |
| A6  | OpenAI protocol   | Chat Completions first, shared with Qwen and DeepSeek. Add the Responses API only if the chosen OpenAI model needs reasoning carried across tool calls.                              |
| A7  | Spend control     | Paid routes start with hedging off and a local monthly cap (default $5 per provider); Anthropic Console auto-reload stays off.                                                       |
| A8  | Thinking          | Carried only inside one turn's tool loop, never between Discord turns. This corrects #296's "never send thinking back": Claude rejects tool results without its own thinking blocks. |
| A9  | Model choice      | Only model profiles that have been tested are accepted; an unknown model ID fails validation at startup.                                                                             |
| A10 | Unsupported media | Audio and video reach a model that can't read them as media-watcher notes, never silently dropped.                                                                                   |

## Current State

- One ADK `LlmAgent` (`src/agent/roka.ts:155`) uses `RoutedLlm` (`src/agent/fallbackModel.ts:463`), which wraps ADK's `Gemini` as primary and an optional `ModelScopeLlm` (`fallbackModel.ts:253`, OpenAI Chat Completions shape) as fallback, built in `createRokaModel` (`fallbackModel.ts:524`).
- `RoutedLlm` hedges after `gemini.hedgeAfterMs` and records the answering side in `modelRouteForRequest` (`fallbackModel.ts:19`). The turn ladder switches models on `transient_http`, `network` and `quota_exhausted` (`src/agent/reliability.ts:260`) and keeps a sticky fallback window (`fallback.stickyMs`).
- Generation settings are Gemini's: `temperature 0.9`, `topP 0.95`, safety settings, `gemini.maxOutputTokens` (`roka.ts:163`).
- The rate limiter takes one daily unit per turn, not per call (`src/utils/rateLimiter.ts:128`), with Gemini free-tier numbers.
- `response_events.model` holds only `gemini | fallback` (`src/storage/metricsStore.ts:22`).
- ADK 2.2.1 registers only Gemini, Apigee and Chrome models; it has no Claude or LiteLLM adapter.

## Approaches

| Approach                                        | Summary                                                                                                                          | Verdict                                                                                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Protocol adapters behind `RoutedLlm`**     | Reuse ADK `Gemini`; add `AnthropicLlm`; generalise `ModelScopeLlm` into one Chat Completions adapter with per-provider profiles. | **Recommended.** Smallest change to a design that already works, no new service on the Pi, every provider feature reachable.                                           |
| B. One proxy (CLIProxyAPI, LiteLLM, OpenRouter) | One OpenAI-shaped adapter; the proxy talks to every provider.                                                                    | Rejected. #296 measured that CLIProxyAPI's OpenAI path drops `cache_control` and PDFs and maps effort its own way; it adds a service to run and another failure point. |
| C. Vercel AI SDK inside one adapter             | ADK request → AI SDK → provider.                                                                                                 | Rejected. A second translation boundary, a second zod/JSON-schema dialect, and more install size on the Pi for three wire formats we can write directly.               |

## Design

### Config

A new optional `llm:` block. Without it, the bot behaves exactly as today (synthesised from `gemini:` and `fallback:`), so the Pi's config keeps working.

```yaml
llm:
  main: flash # a key under llm.models
  fallback: qwen # a key under llm.models, or null
  hedgeAfterMs: 5000 # 0 disables; paid routes start at 0
  stickyMs: 300000
  models:
    flash:
      provider: gemini
      model: gemini-3.5-flash-lite
    haiku:
      provider: anthropic
      model: claude-haiku-5-5
      effort: low # fixed: changing it between requests breaks prompt caching
      maxOutputTokens: 2000 # thinking counts against this
      monthlyBudgetUsd: 5
    qwen:
      provider: modelscope
      model: Qwen/Qwen3.5-122B-A10B
    deepseek:
      provider: deepseek
      model: deepseek-chat
      monthlyBudgetUsd: 5
    gpt:
      provider: openai
      model: gpt-4.1-mini
      monthlyBudgetUsd: 5
```

- Env overrides `LLM_MAIN` and `LLM_FALLBACK` pick keys, so the Pi can switch without editing the file.
- `src/config.ts` validates at load: `main` and `fallback` name existing entries, the provider is known, the model has a profile, the provider's key is present, and numbers sit inside `NUMERIC_BOUNDS`. A bad config stops startup with one clear message.
- New secrets, names only in `.env.example`: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`. `GEMINI_API_KEY` and `MODELSCOPE_API_KEY` stay.

### Capability Profiles (Code, Not Config)

`src/agent/llm/profiles.ts` holds what each tested model can do: images, PDF, audio/video, tool calling, parallel tool calls, thinking and allowed effort values, which sampling parameters it accepts, max output and context window, prompt caching. Config can lower a limit; it cannot claim an ability the profile lacks.

### Components

| Unit                                  | Responsibility                                                                                                                                                             | Depends On                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `src/agent/llm/profiles.ts`           | Tested model capabilities                                                                                                                                                  | none                       |
| `src/agent/llm/anthropicLlm.ts`       | `BaseLlm` over `@anthropic-ai/sdk` Messages: system blocks with `cache_control`, `tool_use`/`tool_result` by id, image/PDF blocks, thinking kept per turn, SDK retries off | profiles                   |
| `src/agent/llm/chatCompletionsLlm.ts` | `ModelScopeLlm` generalised for ModelScope, DeepSeek and OpenAI: base URL, key, profile; tool call ids kept, not matched by name                                           | profiles                   |
| `src/agent/llm/createModel.ts`        | Builds main and fallback from `config.llm`                                                                                                                                 | the adapters, ADK `Gemini` |
| `src/agent/fallbackModel.ts`          | `RoutedLlm` unchanged in shape; sides become `main`/`fallback`; hedging eligibility asks the profile, not "is it an image"                                                 | profiles                   |
| `src/agent/llm/requestShape.ts`       | Drops settings the target rejects (Claude: no `temperature`/`topP`; safety settings only for Gemini)                                                                       | profiles                   |

### Data Flow

1. A turn starts; `RoutedLlm` picks main, or fallback when the sticky window is open.
2. The adapter turns ADK's `LlmRequest` into the provider's request and back into `LlmResponse`.
3. **The provider is pinned for the rest of the turn's tool loop.** The first call that answers decides it. A switch mid-loop would lose thinking blocks and could run a tool twice.
4. The answer, its provider, model ID and usage are recorded.

### Prompt Caching (Anthropic)

The system prompt is 4 layers: core, speech, tone, context (`src/agent/promptAssembler.ts:17`). The first two are stable; tone and context change per turn. `promptAssembler` exports the stable prefix so `AnthropicLlm` can send it as the first system block with `cache_control`, and the rest uncached. Tool order and effort stay fixed. Cache reads and writes are logged to measure hits.

### Failures

Each adapter classifies its own errors into shared kinds; the ladder in `reliability.ts` decides what to do.

| Kind                        | Examples                                                                              | Action                                                             |
| --------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `transient_http`, `network` | 5xx, Anthropic 529, timeout                                                           | Switch to fallback this turn (today's policy); short sticky window |
| `quota_exhausted`           | 429 / RESOURCE_EXHAUSTED                                                              | Switch; sticky until the provider's reset                          |
| `billing_exhausted` (new)   | Anthropic credit used up (400/402/429 with a billing code), local monthly cap reached | Switch; disable that route until the month resets                  |
| `refusal` (new)             | Claude `stop_reason: refusal`, a safety stop                                          | Switch once this turn; no sticky state                             |
| `malformed_tool_args`       | Bad JSON arguments                                                                    | Run nothing; switch once; no sticky state                          |
| `context_length`            | Request too large                                                                     | Trim history once, then switch; no sticky state                    |

### Budgets and Rate Limits

- Optional `limits: { rpm, rpd }` per model entry. The Gemini entry keeps today's numbers. An exhausted Gemini quota no longer blocks a Claude turn.
- `monthlyBudgetUsd` uses a local estimate from returned usage and a price table in the profile. When reached, the route is treated as `billing_exhausted`. The provider's own bill remains the source of truth.
- The daily unit becomes per model call rather than per turn (`rateLimiter.ts:128`), so tool chains and hedges are counted.

### Observability

`response_events` gains `provider`, `model_id` and `route_role` (`main`/`fallback`). Old rows keep `model = gemini | fallback`. Per call: latency, failure kind, input/output/reasoning tokens, cache reads/writes, estimated cost. Losing hedge calls are recorded too.

## Testing

- **Adapters:** recorded, sanitised request/response fixtures per adapter: text, a tool call, parallel and repeated tool calls, images, PDF, refusal, billing error, 529, truncation, cancellation, usage.
- **Routing:** every ordered (main, fallback) pair of the five providers, offline, through `RoutedLlm` and the reliability ladder. Extends `src/agent/__tests__/fallbackModel.test.ts` and `modelHedge.test.ts`.
- **Config:** legacy config (no `llm:`) produces today's behaviour; each validation error has a test.
- **Live (owner-run, costs money):** `npm run test:live` with a provider selector, per provider: persona turns, tool triggers, a multi-step tool chain, an image, warm-cache hit rate, and a forced fallback. Each run asserts which provider answered, so a silent fallback cannot pass for the main model.

## Phases

| Phase | Delivers                                                                                                                         | Size     | Done When                                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `llm:` config with back-compat, profiles, `AnthropicLlm`, provider pinning, new failure kinds, per-model limits, metrics columns | 4–6 days | Legacy config unchanged; Haiku main → Gemini fallback recovers in the same turn on 529, refusal and billing errors; `test:live` passes on Haiku |
| 2     | `ChatCompletionsLlm` for ModelScope and DeepSeek in either role                                                                  | 2–3 days | Every pair among Gemini, Haiku, Qwen and DeepSeek passes offline; DeepSeek live check passes                                                    |
| 3     | OpenAI on Chat Completions (Responses API only if A6 says so), cost calibration                                                  | 2–4 days | OpenAI live check passes; cost estimates within 10% of the invoice                                                                              |

## Risks

- **Persona drift:** each model voices Roka differently. Mitigation: the persona live check per model before it can be `main`.
- **Tool-call shape:** a provider's arguments can drift from the zod schema. Mitigation: validate arguments locally before running any tool.
- **Prompt cache misses:** a reordered tool list or an effort change breaks the cache. Mitigation: fixed order and effort, plus a logged hit rate.
- **Cost surprise:** paid hedging doubles calls. Mitigation: hedging off on paid routes until measured; local monthly cap.
- **Pi footprint:** two more SDKs. Mitigation: Anthropic SDK only; the other three use `fetch`, as `ModelScopeLlm` does today.

## Owner Decisions Needed

1. Is A1 right: quality first, then cost?
2. Phase 1 as Haiku main with Gemini fallback, then the Chat Completions family (A6)?
3. Thinking kept only inside one turn's tool loop (A8)?
4. Paid hedging off and a $5 monthly cap per paid provider (A7)?
5. Only tested model profiles accepted (A9)?
