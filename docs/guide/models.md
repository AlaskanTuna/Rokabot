# Models

How to pick the model that writes Roka's replies, add a backup model, and keep the spend in check.

## At a Glance

| Topic             | Rule                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Where             | The `llm:` block in `config.yml`. Each model is one entry under `llm.models`.                         |
| Main Model        | `llm.main` names an entry key. It writes every reply.                                                 |
| Fallback Model    | `llm.fallback` names another entry key, or is left out. It answers when the main model fails.         |
| Shipped Choice    | `main: haiku` (`claude-haiku-5-5`), `fallback: qwen122` (`Qwen/Qwen3.5-122B-A10B` on ModelScope).     |
| Tested Providers  | `gemini`, `anthropic`, `openai`, `modelscope`. Only tested model profiles start.                      |
| Any Other Server  | `provider: openai-compatible` runs any `/chat/completions` endpoint you declare.                      |
| Quick Switch      | `LLM_MAIN` and `LLM_FALLBACK` in `.env` override the block. `LLM_FALLBACK=none` turns the backup off. |
| Spend Cap         | `llm.monthlyBudgetUsd` per provider. Background jobs stop at 80%, replies at 100%.                    |
| Applying a Change | Restart the bot. It reads `config.yml` once at startup.                                               |

The full contract is in [Models (TRD)](../trd/models.md). Every `llm` key is listed in
[Configuration](configuration.md#llm).

## Choose the Main and Fallback

1. Pick an entry key from the table in [Tested Providers](#tested-providers), or add your own entry.
2. Set `llm.main` to that key. Set `llm.fallback` to a second key, or leave it out.
3. Put each provider's key in `.env`. A missing key stops startup and names the variable.
4. Restart the bot. Deploys need the owner's authorization.

```yaml
llm:
  main: haiku
  fallback: qwen122
  models:
    haiku: { provider: anthropic, model: claude-haiku-5-5, effort: low }
    qwen122: { provider: modelscope, model: Qwen/Qwen3.5-122B-A10B }
```

Pick a fallback from a different provider than the main model. Then one provider's outage does not stop both.

## Tested Providers

These entries ship in `config.yml`. Each one points at a tested profile in `src/agent/llm/profiles.ts`.

| Provider     | Key in `.env`        | Shipped `llm.models` Keys                                                                                             | Notes                                                                        |
| ------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `gemini`     | `GEMINI_API_KEY`     | `flash` (`gemini-3.5-flash-lite`)                                                                                     | Inherits `rateLimit` and `gemini.maxTokensPerMinute` as its limits.          |
| `anthropic`  | `ANTHROPIC_API_KEY`  | `haiku` (`claude-haiku-5-5`, effort `low`), `sonnet` (`claude-sonnet-5-5`, effort `low`)                              | Effort `none` turns thinking off. Sonnet costs 20x Haiku per token.          |
| `openai`     | `OPENAI_API_KEY`     | `luna` (`gpt-6-luna`, effort `none`), `sol` (`gpt-6-sol`, effort `none`)                                              | Tools work only at effort `none`. Sol costs 20x Luna per token.              |
| `modelscope` | `MODELSCOPE_API_KEY` | `qwen122` (`Qwen/Qwen3.5-122B-A10B`), `qwen` (`Qwen/Qwen3.5-35B-A3B`), `deepseek` (`deepseek-ai/DeepSeek-V4.1-Flash`) | Billed in Magicubes, not USD. All ModelScope models share one daily balance. |

### Profile Facts

| Model                             | Price In / Out (USD per 1M Tokens) | Output Cap | Reads                         |
| --------------------------------- | ---------------------------------- | ---------- | ----------------------------- |
| `gemini-3.5-flash-lite`           | 0.3 / 2.5                          | 65,536     | Images, PDFs, audio and video |
| `claude-haiku-5-5`                | 0.1 / 0.5                          | 128,000    | Images and PDFs               |
| `claude-sonnet-5-5`               | 2 / 10                             | 128,000    | Images and PDFs               |
| `gpt-6-luna`                      | 0.1 / 0.5                          | 128,000    | Images                        |
| `gpt-6-sol`                       | 2 / 10                             | 128,000    | Images                        |
| `Qwen/Qwen3.5-122B-A10B`          | 0 (Magicubes)                      | 32,768     | Images                        |
| `Qwen/Qwen3.5-35B-A3B`            | 0 (Magicubes)                      | 32,768     | Images                        |
| `deepseek-ai/DeepSeek-V4.1-Flash` | 0 (Magicubes)                      | 32,768     | Text only                     |

Attachments a model cannot read reach it as a short text marker.

`gemini-3.8-flash`, `gemini-3.1-flash-lite` and `Qwen/Qwen3.5-27B` are candidates. Startup refuses a candidate as
`llm.main` or `llm.fallback`. The runbook explains how to verify a profile.

### Entry Options

| Field             | Default                                                  | What It Does                                                            |
| ----------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `provider`        | Required                                                 | `gemini`, `anthropic`, `openai`, `modelscope` or `openai-compatible`.   |
| `model`           | Required                                                 | The model id. Tested providers need a tested profile.                   |
| `effort`          | The profile's default (`low` on Claude, `none` on GPT-6) | Thinking effort. Must be one the profile lists.                         |
| `timeoutMs`       | `gemini.timeout` (20,000 in `config.yml`)                | Per-request deadline.                                                   |
| `maxOutputTokens` | `gemini.maxOutputTokens` (500 in `config.yml`)           | Reply cap. Cannot exceed the profile's output cap.                      |
| `baseUrl`         | Provider default. `modelscope` uses `fallback.baseUrl`.  | Endpoint override.                                                      |
| `limits`          | `gemini`: inherited. Others: none.                       | `{ rpm, rpd, tpm }` for this model. See [Budgets](#budgets-and-limits). |

## Any OpenAI-Compatible Model

Any server with a `/chat/completions` endpoint can be the main or the fallback model. Examples are OpenRouter,
DeepSeek, Groq, Ollama, vLLM and LM Studio. No code change is needed. You vouch for the model, so no profile test
runs.

1. Add an entry with `provider: openai-compatible`, a `model` and a `baseUrl`.
2. If the server needs a key, set `apiKeyEnv` to a variable name and put the key in `.env` under that name.
3. Declare what the model can do under `capabilities`. Leave out a field to keep its default.
4. Set `price` if the server bills you. Then its spend counts against `llm.monthlyBudgetUsd.openai-compatible`.
5. Point `llm.main` or `llm.fallback` at the entry key and restart.

Errors from the endpoint name the entry key. Its turns record `"provider":"openai-compatible"`.

### Copy-Paste Entries

```yaml
llm:
  main: openrouter
  fallback: qwen122
  monthlyBudgetUsd:
    anthropic: 5
    openai: 5
    openai-compatible: 5
  models:
    qwen122: { provider: modelscope, model: Qwen/Qwen3.5-122B-A10B }

    # Ollama on the same machine, no key. Inside the bot's container, use the host's address instead of localhost.
    local: { provider: openai-compatible, model: 'qwen3:32b', baseUrl: 'http://localhost:11434/v1' }

    # OpenRouter. Any OpenRouter model id. Needs OPENROUTER_API_KEY in .env.
    openrouter:
      provider: openai-compatible
      model: qwen/qwen3-235b-a22b
      baseUrl: 'https://openrouter.ai/api/v1'
      apiKeyEnv: OPENROUTER_API_KEY
      price: { input: 0.2, output: 0.6 } # Copy the real prices from the model's page

    # DeepSeek's own API, billed by DeepSeek. Needs DEEPSEEK_API_KEY in .env.
    deepseekApi:
      provider: openai-compatible
      model: deepseek-chat
      baseUrl: 'https://api.deepseek.com/v1'
      apiKeyEnv: DEEPSEEK_API_KEY

    # vLLM. Use the model name the server lists at /v1/models.
    vllm: { provider: openai-compatible, model: Qwen/Qwen3-32B, baseUrl: 'http://localhost:8000/v1' }

    # LM Studio. Use the model id the server lists at /v1/models.
    lmstudio: { provider: openai-compatible, model: qwen3-32b, baseUrl: 'http://localhost:1234/v1' }
```

The OpenRouter price above is an example. The vLLM and LM Studio ports are those servers' usual defaults; check your
own server.

### Fields for OpenAI-Compatible Entries

| Field       | Default  | Meaning                                                                                                                                                     |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`   | Required | An `http` or `https` URL. The bot posts to `<baseUrl>/chat/completions`.                                                                                    |
| `apiKeyEnv` | None     | The `.env` variable that holds the key. Without it, the bot sends no `Authorization` header.                                                                |
| `extraBody` | None     | A mapping merged into every request body. Fields the bot sets for a call (sampling, token cap, tools, `response_format`, `reasoning_effort`, `stream`) win. |
| `price`     | `0`, `0` | `{ input, output }` in USD per 1M tokens. Only these two fields exist.                                                                                      |
| `effort`    | None     | Sent as `reasoning_effort`. It must appear in `capabilities.efforts`, or startup stops.                                                                     |

`extraBody`, `apiKeyEnv`, `price` and `capabilities` apply to `openai-compatible` entries only. Other providers ignore
them.

### Capabilities Reference

| Field               | Default       | Meaning                                                                                                           |
| ------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `tools`             | `true`        | Send Roka's tools (search, reminders and others). `false` sends none, so those features stop on this model.       |
| `parallelToolCalls` | `true`        | `false` sends `parallel_tool_calls: false` with the tools.                                                        |
| `vision`            | `false`       | `true` sends images as data URLs. `false` sends a text marker instead. PDFs, audio and video are always markers.  |
| `structuredOutput`  | `json_object` | `json_schema` sends a strict JSON schema. `json_object` asks for a JSON object and puts the schema in the prompt. |
| `maxTokensParam`    | `max_tokens`  | The request field for the output cap: `max_tokens` or `max_completion_tokens`.                                    |
| `temperature`       | `true`        | `false` never sends `temperature`.                                                                                |
| `topP`              | `true`        | `false` never sends `top_p`.                                                                                      |
| `efforts`           | `[]`          | The effort names the server accepts. An empty list means no `effort` is allowed.                                  |
| `contextWindow`     | `131072`      | The model's context size, kept on the profile. No runtime check reads it yet.                                     |
| `maxOutputTokens`   | `8192`        | The highest `maxOutputTokens` the entry may set.                                                                  |

An unknown field, a wrong type or an unset `apiKeyEnv` variable stops startup with one message.

## Switch Without Editing `config.yml`

| Variable       | Effect                                                   |
| -------------- | -------------------------------------------------------- |
| `LLM_MAIN`     | Replaces `llm.main`. Must name a key under `llm.models`. |
| `LLM_FALLBACK` | Replaces `llm.fallback`. `none` turns the fallback off.  |

Both need an `llm:` block. Without one, `LLM_MAIN` or `LLM_FALLBACK` stops startup. `LLM_FALLBACK=none` is the
one exception: it turns off the legacy fallback.

## Budgets and Limits

- **Monthly Cap:** `llm.monthlyBudgetUsd` maps a provider to USD per UTC month. Background jobs stop at 80% of the
  cap. Replies stop at 100%. The cap resets when the UTC month turns, and survives restarts.
- **Default Caps:** an `llm:` block without `monthlyBudgetUsd` caps `anthropic` and `openai` at 5 USD each. Setting
  the key replaces both defaults, so list every provider you want capped.
- **OpenAI-Compatible Cap:** every `openai-compatible` entry adds to one key, `openai-compatible`. An entry with price
  `0` adds nothing.
- **No Cap:** a provider with no key in the map is never refused for spend. Its spend is still recorded.
- **Provider Says No Credit:** when Anthropic or OpenAI reports spent credit, the bot stops calling it until the month
  turns. A restart turns it back on after you top up.
- **Magicubes:** `llm.modelscopeDailyMagicubes` (250) is the daily ModelScope balance. Each call counts as one. All
  ModelScope models and the `qwen` media watcher share it. It resets at UTC midnight.
- **Per-Model Limits:** an entry may set `limits: { rpm, rpd, tpm }`. A `gemini` entry inherits `rateLimit` and
  `gemini.maxTokensPerMinute`. Other providers have no limits unless you set them.
- **Main Model Floors:** on the main entry, `rpm` must be at least `gemini.maxLlmCalls` (4) and `tpm` at least
  `gemini.maxAttachmentTokens` (125,000), or startup stops.
- **Set `tpm` to Half:** set `tpm` to half the provider's real tokens-per-minute limit. The bucket can admit twice its
  value in the worst minute.
- **Replies First:** a background job runs only if one whole reply turn still fits in the limits after it.

Spend figures are local estimates from the profile price. The provider's bill is the truth. The full budget rules are
in [Reliability](../trd/reliability.md#per-call-budgets).

## How the Fallback Behaves

![Model routing for one reply turn](../diagrams/models-routing.svg)

_One reply turn: the sticky window picks the start side, a hedge can race the fallback, and a failure switches sides
once._

- **Switch:** when a call fails with an outage, a spent quota or credit, a refusal, a bad tool call or an over-long
  prompt, the rest of the turn moves to the other model. This happens once per turn. Safety blocks and other errors
  use the retry rules instead.
- **Sticky Window:** when the main model has an outage (`transient_http`, `network` or `quota_exhausted`) and the
  fallback then answers, later turns start on the fallback for `llm.stickyMs` (300,000 ms, 5 minutes). A main-model
  answer closes the window. `0` turns it off.
- **Hedge:** with `llm.hedgeAfterMs` above `0`, a main call that has not answered in that time starts the same call on
  the fallback. The first answer wins. This costs a second call. `config.yml` sets `0` (off) for paid routes.
- **No Hedge When:** the turn already runs on the fallback, the turn is pinned, or the request holds audio, video, a
  PDF or another non-image file.
- **Pinning:** when either model is Claude, the first answer in a turn pins the rest of that turn to the same side.
  Claude's thinking cannot move to another model mid-turn. Pinned calls do not hedge.
- **No Fallback:** without `llm.fallback`, failures go straight to the retry rules.

## What Side Tasks Use

| Task                                   | Model                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory extraction and reclassification | The main model, then the fallback once.                                                                                                                               |
| Memory admission and verification      | Jev on TypeSafe when `TYPESAFE_API_KEY` is set. Otherwise the main model, then the fallback once. Without the key and without an `llm:` block, passive memory is off. |
| Tone, name and search judgments        | Jev on TypeSafe (`jev.model`). Not an `llm.models` entry.                                                                                                             |
| Memory embeddings                      | `embeddings.provider`: `local`, `gemini` or `openai`. Not an `llm.models` entry.                                                                                      |
| Media watcher, `gemini`                | `gemini.model` with `GEMINI_API_KEY`. Skipped while the sticky window is open.                                                                                        |
| Media watcher, `qwen`                  | `media.qwen.model` with `MODELSCOPE_API_KEY`. Spends Magicubes.                                                                                                       |
| Media watcher, `direct`                | The reply model reads the file itself.                                                                                                                                |

`GEMINI_API_KEY` is needed only when the main or fallback model is Gemini, `embeddings.provider` is `gemini`, or
`media.watcher` is `gemini`. Details are in [Memory](../trd/memory.md), [Jev](../trd/jev.md) and
[Media](../trd/media.md).

## Known Limits

- **Anthropic's OpenAI Endpoint:** do not reach Claude through `openai-compatible`. Anthropic calls its OpenAI
  compatibility layer
  [not production-ready](https://platform.claude.com/docs/en/api/openai-sdk), and it ignores `response_format` and has
  no prompt caching. Use `provider: anthropic`.
- **One Budget for All Compatible Servers:** every `openai-compatible` entry shares
  `llm.monthlyBudgetUsd.openai-compatible`. A spent-credit error from one server switches that turn, but disables
  nothing.
- **Same Model Id, Same Limits:** two routes with the same provider and model id share one rate limiter and token
  bucket. Their limits and price come from the main entry. Do not run main and fallback on the same provider and model id if they need separate limits.
- **Compatible Models Get Less:** an `openai-compatible` model gets no prompt caching and no thinking carried across
  tool calls.
- **Only Main and Fallback Run:** an entry that neither role names is not loaded.

## Source Files

- `config.yml` (`llm:` block and its commented examples)
- `.env.example`
- `src/config.ts` (`resolveLlm`, `resolveRole`, `compatibleEntry`)
- `src/agent/llm/profiles.ts`
- `src/agent/llm/budget.ts`
- `src/agent/fallbackModel.ts`
- `src/agent/reliability.ts`
