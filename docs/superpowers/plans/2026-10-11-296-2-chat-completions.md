# Chat Completions Providers (#296 Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Roka's main or fallback brain on OpenAI (`gpt-6-luna`) or ModelScope (`Qwen/Qwen3.5-35B-A3B`, `deepseek-ai/DeepSeek-V4.1-Flash`) through one `ChatCompletionsLlm` adapter that generalises today's `ModelScopeLlm`.

**Architecture:** The request and response translation in `src/agent/fallbackModel.ts` moves to `src/agent/llm/chatCompletionsLlm.ts` and becomes provider-aware (`openai` | `modelscope`), profile-aware (image input, effort, structured output), id-exact for tool calls, and typed in its failures (`ProviderError`). `ModelScopeLlm` stays as a thin subclass, so the legacy fallback builds the same request as today, and 1A's `createLlm` sends both providers to the new adapter. The media watcher gets its own credentials instead of borrowing `config.fallback`'s.

**Tech Stack:** TypeScript (Node 24), `@google/adk` 2.2.1 `BaseLlm`, `@google/genai` types, global `fetch`, vitest, Biome + Prettier.

---

## Conventions

- **Base:** plan 1A (Provider Foundation) has merged to `main`. This plan uses only the names in `docs/superpowers/plans/2026-10-11-296-contract.md`, plus the few 1A internals that Task 1 confirms.
- **Shell:** every command runs from the repo root with Node 24 first on `PATH`:

  ```bash
  export PATH=/home/user/.config/nvm/versions/node/v24.21.0/bin:$PATH
  ```

- **Line Numbers:** line numbers quote `origin/main` at `d57597d` (before 1A). If 1A moved code, find it by the quoted text.
- **Formatting:** before every commit run `npx biome check --write <the .ts files you touched>` and `npx prettier --write <the .json/.md/.yml files you touched>`.
- **Commits:** AGENTS.md requires explicit human authorization for every commit. Each task ends with a ready commit command. Run it only once the human has authorised commits for this plan. Messages are one line, Conventional Commits, no body or footer.
- **Legacy Guarantee:** with no `llm:` block, the bot must behave exactly as today after every task. `src/agent/__tests__/fallbackModel.test.ts` (the `ModelScopeLlm` suites) is the request/response regression suite. Task 9 adds an end-to-end legacy test through config and `createLlm`.

## File Structure

| File                                                 | Change                                           | Responsibility                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/agent/llm/chatCompletionsLlm.ts`                | Create                                           | `ChatCompletionsLlm` for `openai` and `modelscope`: message and tool translation, structured output, failure classification, usage, budget reservation; `ModelScopeLlm` legacy alias |
| `src/agent/llm/profiles.ts`                          | Modify                                           | Add the `gpt-6-luna`, `Qwen/Qwen3.5-35B-A3B` and `deepseek-ai/DeepSeek-V4.1-Flash` profiles                                                                                          |
| `src/agent/fallbackModel.ts`                         | Modify                                           | Loses the adapter code; re-exports `ModelScopeLlm`                                                                                                                                   |
| `src/agent/llm/createModel.ts`                       | Modify                                           | `createLlm` sends `openai` and `modelscope` to `ChatCompletionsLlm`                                                                                                                  |
| `src/agent/llm/usage.ts`                             | Modify only if Task 1 finds no workload accessor | `currentWorkload()`                                                                                                                                                                  |
| `src/config.ts`                                      | Modify                                           | `media.qwen.apiKey` / `media.qwen.baseUrl`; `OPENAI_API_KEY` mapping only if 1A lacks it                                                                                             |
| `src/agent/media/turnMedia.ts`                       | Modify                                           | Each watcher needs its own key; Qwen reads `config.media.qwen`                                                                                                                       |
| `config.yml`                                         | Modify                                           | `llm.models` entries `luna`, `qwen`, `deepseek`                                                                                                                                      |
| `.env.example`                                       | Modify                                           | `OPENAI_API_KEY`; wider `MODELSCOPE_API_KEY` comment                                                                                                                                 |
| `tests/vitest.setup.ts`                              | Modify                                           | Blank `OPENAI_API_KEY` so a developer shell key never leaks into tests                                                                                                               |
| `tsconfig.test.json`                                 | Modify                                           | Type-check `scripts/probe-llm-profile.ts`                                                                                                                                            |
| `scripts/probe-llm-profile.ts`                       | Create                                           | Owner-run live probe: one text, one tool, one JSON call per profile                                                                                                                  |
| `tests/fixtures/chatCompletions/openai.json`         | Create                                           | Sanitised OpenAI reply fixtures                                                                                                                                                      |
| `tests/fixtures/chatCompletions/modelscope.json`     | Create                                           | Sanitised ModelScope reply fixtures                                                                                                                                                  |
| `src/agent/llm/__tests__/chatCompletionsLlm.test.ts` | Create                                           | Profile and adapter tests                                                                                                                                                            |
| `src/agent/llm/__tests__/routingMatrix.test.ts`      | Create                                           | Every ordered main/fallback pair plus "no fallback", through `RoutedLlm` and the ladder                                                                                              |
| `scripts/__tests__/probe-llm-profile.test.ts`        | Create                                           | Offline tests for the probe's argument guard and checks                                                                                                                              |
| `src/agent/__tests__/fallbackModel.test.ts`          | Modify                                           | Three legacy expectations change: tool call id, malformed arguments, network failure                                                                                                 |
| `src/__tests__/config.test.ts`                       | Modify                                           | OpenAI resolution, unverified candidates, legacy route, watcher key                                                                                                                  |
| `src/__tests__/vitestEnvironment.test.ts`            | Modify                                           | Asserts the blank `OPENAI_API_KEY`                                                                                                                                                   |
| `src/agent/media/__tests__/turnMedia.test.ts`        | Modify                                           | Config mock without `fallback`; credential tests                                                                                                                                     |
| `docs/trd.md`, `docs/runbook.md`                     | Modify                                           | Adapter contract; how to run the probe                                                                                                                                               |

---

### Task 1: Preflight the 1A Surface

**Files:** none changed.

- [ ] **Step 1: Branch from `main` after 1A**

```bash
git fetch origin
git switch -c feat/296-chat-completions origin/main
ls src/agent/llm/
```

Expected: `profiles.ts`, `providerError.ts`, `usage.ts`, `requestShape.ts`, `createModel.ts`, `anthropicLlm.ts`, `budget.ts` exist. If `src/agent/llm/` is missing, 1A has not merged: stop and report.

- [ ] **Step 2: Read the names this plan builds on**

```bash
grep -n "^export" src/agent/llm/profiles.ts src/agent/llm/providerError.ts src/agent/llm/usage.ts src/agent/llm/budget.ts src/agent/llm/createModel.ts src/agent/llm/requestShape.ts
grep -n "workload\|shape\|reserveCall\|recordUsage" src/agent/llm/anthropicLlm.ts
grep -n "case '\|ModelScopeLlm\|openai" src/agent/llm/createModel.ts
grep -n "OPENAI_API_KEY\|ANTHROPIC_API_KEY" src/config.ts
grep -n "Qwen/Qwen3.5-122B-A10B" -A 16 src/agent/llm/profiles.ts
grep -n "class RoutedLlm\|constructor(\|export type AnswerModel\|pinned" src/agent/fallbackModel.ts
grep -n "class ModelScopeLlm\|type JsonObject" src/agent/fallbackModel.ts
```

Check each row. Where 1A differs, apply the rule in the last column everywhere in this plan; never add a second mechanism next to 1A's.

| Plan Uses                                                                                                                                            | Expected In        | If 1A Differs                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProviderId`, `ModelProfile`, `MODEL_PROFILES`, `profileFor`                                                                                         | `profiles.ts`      | Contract names; they must match                                                                                                                                                                                                     |
| `ProviderError` with public `provider`, `kind`, `status`, `retryAfterMs` and Error `cause`                                                           | `providerError.ts` | Tests assert these with `toMatchObject`; assert only the fields 1A exposes                                                                                                                                                          |
| `recordUsage`, `onUsage`, `CallUsage`, `Workload`                                                                                                    | `usage.ts`         | Contract names; they must match                                                                                                                                                                                                     |
| `currentWorkload(): Workload`, `'reply'` when unset                                                                                                  | `usage.ts`         | Use whatever `anthropicLlm.ts` uses to fill `workload`. If 1A has nothing, Task 8 Step 3 adds `currentWorkload`                                                                                                                     |
| `reserveCall` (stub that always grants)                                                                                                              | `budget.ts`        | Contract name; it must match                                                                                                                                                                                                        |
| Request shaping                                                                                                                                      | `requestShape.ts`  | If `anthropicLlm.ts` calls the shaping helper inside its own `generateContentAsync`, call it the same way as the first line of `ChatCompletionsLlm.generateContentAsync` (Task 4). If `RoutedLlm` or `createLlm` shapes, do nothing |
| `createLlm` switches on `resolved.provider` and returns the adapter itself (not a wrapper)                                                           | `createModel.ts`   | Task 9 edits whichever branch builds `openai` and `modelscope`. If a wrapper is returned, change the `toBeInstanceOf` assertions in Task 9 to check the wrapped adapter                                                             |
| Provider `openai` maps to `OPENAI_API_KEY`                                                                                                           | `src/config.ts`    | Task 9 Step 3 adds the mapping beside 1A's `ANTHROPIC_API_KEY`                                                                                                                                                                      |
| Legacy profile `Qwen/Qwen3.5-122B-A10B`: `input.image: true`, no `thinking.defaultEffort`, `structuredOutput: 'json_object'`, `verified: true`       | `profiles.ts`      | Today's fallback sends images and no effort. Correct the profile to these values in Task 2 so the legacy request stays identical                                                                                                    |
| `new RoutedLlm(primary, fallback, hedgeAfterMs)`; `ModelRoute` = `{ useFallback, hedged, answeredBy, pinned }`; `AnswerModel = 'main' \| 'fallback'` | `fallbackModel.ts` | Adjust the route literal and constructor call in Task 10 to 1A's shapes                                                                                                                                                             |
| `ModelScopeLlm` still lives in `fallbackModel.ts`                                                                                                    | `fallbackModel.ts` | If 1A moved it, Task 3 moves it from where it now is                                                                                                                                                                                |

- [ ] **Step 3: Record a green baseline**

```bash
npm run lint && npm run format:check && npm run typecheck && npm run build && TZ=UTC npm test && npm run test:perf
```

Expected: all pass. If not, stop: the failure belongs to `main`, not to this plan.

---

### Task 2: Chat Completions Profiles

**Files:**

- Modify: `src/agent/llm/profiles.ts` (the `MODEL_PROFILES` array)
- Test: `src/agent/llm/__tests__/chatCompletionsLlm.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/agent/llm/__tests__/chatCompletionsLlm.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MODEL_PROFILES, profileFor } from '../profiles.js'

describe('Chat Completions profiles', () => {
  it('describes gpt-6-luna: tools only at effort none, strict JSON schema, image input', () => {
    expect(profileFor('openai', 'gpt-6-luna')).toMatchObject({
      provider: 'openai',
      input: { image: true, pdf: false, audio: false, video: false },
      tools: { supported: true, parallel: true },
      thinking: { efforts: ['none'], defaultEffort: 'none', replayWithinTurn: false },
      sampling: { temperature: true, topP: true },
      structuredOutput: 'json_schema_strict',
      promptCaching: 'implicit',
      tokenCounter: 'estimate',
      price: { input: 0.1, output: 0.5, cachedInput: 0.01 },
      verified: true
    })
  })

  it.each(['Qwen/Qwen3.5-35B-A3B', 'deepseek-ai/DeepSeek-V4.1-Flash'])(
    'keeps %s a json_object candidate with thinking off until the probe passes',
    (model) => {
      expect(profileFor('modelscope', model)).toMatchObject({
        provider: 'modelscope',
        tools: { supported: true, parallel: true },
        thinking: { efforts: [], replayWithinTurn: false },
        structuredOutput: 'json_object',
        promptCaching: 'none',
        tokenCounter: 'estimate',
        price: { input: 0, output: 0 },
        verified: false
      })
    }
  )

  it('reads images on Qwen but not yet on DeepSeek', () => {
    expect(profileFor('modelscope', 'Qwen/Qwen3.5-35B-A3B')?.input.image).toBe(true)
    expect(profileFor('modelscope', 'deepseek-ai/DeepSeek-V4.1-Flash')?.input.image).toBe(false)
  })

  it('leaves the legacy ModelScope fallback profile as it was and lists each new model once', () => {
    expect(profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B')).toMatchObject({
      input: { image: true },
      structuredOutput: 'json_object',
      verified: true
    })
    expect(profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B')?.thinking.defaultEffort).toBeUndefined()
    for (const model of ['gpt-6-luna', 'Qwen/Qwen3.5-35B-A3B', 'deepseek-ai/DeepSeek-V4.1-Flash']) {
      expect(MODEL_PROFILES.filter((profile) => profile.model === model)).toHaveLength(1)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/agent/llm/__tests__/chatCompletionsLlm.test.ts`
Expected: FAIL. `profileFor('openai', 'gpt-6-luna')` returns `undefined`, so the first three tests fail. The legacy test passes, unless Task 1 found the 122B profile wrong; if so, correct that profile now.

- [ ] **Step 3: Add the three profiles**

Append these entries to `MODEL_PROFILES` in `src/agent/llm/profiles.ts`, after 1A's ModelScope entry:

```ts
  {
    provider: 'openai',
    model: 'gpt-6-luna',
    input: { image: true, pdf: false, audio: false, video: false },
    tools: { supported: true, parallel: true },
    // Chat Completions accepts tools only at effort none; higher efforts need the Responses API (D9).
    thinking: { efforts: ['none'], defaultEffort: 'none', replayWithinTurn: false },
    sampling: { temperature: true, topP: true },
    structuredOutput: 'json_schema_strict',
    maxOutputTokens: 128_000,
    // The documented maximum input; the 1.05M window also holds the output.
    contextWindow: 922_000,
    promptCaching: 'implicit',
    tokenCounter: 'estimate',
    price: { input: 0.1, output: 0.5, cachedInput: 0.01 },
    verified: true
  },
  {
    provider: 'modelscope',
    model: 'Qwen/Qwen3.5-35B-A3B',
    input: { image: true, pdf: false, audio: false, video: false },
    tools: { supported: true, parallel: true },
    thinking: { efforts: [], replayWithinTurn: false },
    sampling: { temperature: true, topP: true },
    structuredOutput: 'json_object',
    // ModelScope does not publish its serving caps, so both limits stay well under the model's own.
    maxOutputTokens: 32_768,
    contextWindow: 131_072,
    promptCaching: 'none',
    tokenCounter: 'estimate',
    price: { input: 0, output: 0 },
    // D12: a candidate until scripts/probe-llm-profile.ts passes against the live endpoint.
    verified: false
  },
  {
    provider: 'modelscope',
    model: 'deepseek-ai/DeepSeek-V4.1-Flash',
    // The model reads images, but image input on ModelScope is unverified.
    input: { image: false, pdf: false, audio: false, video: false },
    tools: { supported: true, parallel: true },
    thinking: { efforts: [], replayWithinTurn: false },
    sampling: { temperature: true, topP: true },
    structuredOutput: 'json_object',
    maxOutputTokens: 32_768,
    contextWindow: 131_072,
    promptCaching: 'none',
    tokenCounter: 'estimate',
    price: { input: 0, output: 0 },
    verified: false
  }
```

- [ ] **Step 4: Run the new test and 1A's profile tests**

Run: `npx vitest run src/agent/llm/`
Expected: PASS. If a 1A test asserts a fixed profile count, update that count by 3.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/agent/llm/profiles.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts
git add src/agent/llm/profiles.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts
git commit -m "feat(agent): add the gpt-6-luna, Qwen3.5-35B-A3B and DeepSeek-V4.1-Flash profiles"
```

---

### Task 3: Move the ModelScope Adapter Into `chatCompletionsLlm.ts`

A pure move: `ModelScopeLlm`'s requests and responses stay byte-for-byte the same.

**Files:**

- Create: `src/agent/llm/chatCompletionsLlm.ts`
- Modify: `src/agent/fallbackModel.ts:4-5` (imports), `:21-368` (moved out)
- Test: `src/agent/llm/__tests__/chatCompletionsLlm.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the imports of `src/agent/llm/__tests__/chatCompletionsLlm.test.ts`:

```ts
import type { LlmRequest } from '@google/adk'
import { ModelScopeLlm as ReexportedModelScopeLlm } from '../../fallbackModel.js'
import { ChatCompletionsLlm, ModelScopeLlm } from '../chatCompletionsLlm.js'
```

Append:

```ts
describe('ModelScopeLlm', () => {
  it('is a modelscope ChatCompletionsLlm, still exported from fallbackModel', () => {
    const legacy = new ReexportedModelScopeLlm({
      model: 'Qwen/test-model',
      apiKey: 'test-key',
      baseUrl: 'https://modelscope.test/v1',
      timeoutMs: 1000
    })

    expect(ReexportedModelScopeLlm).toBe(ModelScopeLlm)
    expect(legacy).toBeInstanceOf(ChatCompletionsLlm)
    expect(legacy.provider).toBe('modelscope')
    expect(() => legacy.connect({} as LlmRequest)).toThrow('ModelScopeLlm does not support live connections')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/agent/llm/__tests__/chatCompletionsLlm.test.ts`
Expected: FAIL, because `../chatCompletionsLlm.js` cannot be resolved.

- [ ] **Step 3: Move the code**

1. Create `src/agent/llm/chatCompletionsLlm.ts` with these imports:

   ```ts
   import { BaseLlm } from '@google/adk'
   import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
   import { FinishReason } from '@google/genai'
   import type { Part } from '@google/genai'
   ```

2. Cut the block from `type JsonObject = Record<string, unknown>` through the closing `}` of `class ModelScopeLlm` out of `src/agent/fallbackModel.ts` (lines 21–368 on `d57597d`). Paste it under the imports.
3. In the new file, rename `interface ModelScopeResponse` to `ChatCompletionsResponse`, and rename its one use (`as ModelScopeResponse`).
4. In the new file, replace everything from `export class ModelScopeLlm extends BaseLlm {` through the end of its constructor with:

   ```ts
   export type ChatCompletionsProvider = 'openai' | 'modelscope'

   const PROVIDER_LABELS: Readonly<Record<ChatCompletionsProvider, string>> = {
     openai: 'OpenAI',
     modelscope: 'ModelScope'
   }

   export interface ChatCompletionsOptions {
     provider: ChatCompletionsProvider
     model: string
     apiKey: string
     baseUrl: string
     timeoutMs: number
     fetchImpl?: typeof fetch
   }

   export class ChatCompletionsLlm extends BaseLlm {
     readonly provider: ChatCompletionsProvider
     private readonly apiKey: string
     private readonly baseUrl: string
     private readonly timeoutMs: number
     private readonly fetchImpl: typeof fetch

     constructor(options: ChatCompletionsOptions) {
       super({ model: options.model })
       this.provider = options.provider
       this.apiKey = options.apiKey
       this.baseUrl = options.baseUrl
       this.timeoutMs = options.timeoutMs
       this.fetchImpl = options.fetchImpl ?? fetch
     }
   ```

5. In `generateContentAsync`, make two replacements. Replace `` `ModelScope ${response.status}: ${bodyText.slice(0, 300)}` `` with `` `${PROVIDER_LABELS[this.provider]} ${response.status}: ${bodyText.slice(0, 300)}` ``. Replace `'ModelScope returned malformed tool arguments'` with `` `${PROVIDER_LABELS[this.provider]} returned malformed tool arguments` ``.
6. In `connect`, replace the thrown message with `` `${this.constructor.name} does not support live connections` ``.
7. At the end of the new file, add:

   ```ts
   /** Today's fallback constructor, kept so the legacy route builds the adapter it always did. */
   export class ModelScopeLlm extends ChatCompletionsLlm {
     constructor(options: Omit<ChatCompletionsOptions, 'provider'>) {
       super({ ...options, provider: 'modelscope' })
     }
   }
   ```

8. In `src/agent/fallbackModel.ts`, delete `import { FinishReason } from '@google/genai'` and `import type { Part } from '@google/genai'`; only the moved code used them. After the remaining imports, add:

   ```ts
   export { ModelScopeLlm } from './llm/chatCompletionsLlm.js'
   ```

   `errorText`, `isHedgeEligible`, `raceForWinner` and `RoutedLlm` stay in `fallbackModel.ts`.

- [ ] **Step 4: Run the new test and the legacy suite**

Run: `npx vitest run src/agent/llm/__tests__/chatCompletionsLlm.test.ts src/agent/__tests__/fallbackModel.test.ts src/agent/__tests__/modelHedge.test.ts src/agent/__tests__/modelFallback.test.ts && npm run typecheck`
Expected: PASS. Every `ModelScopeLlm` test in `fallbackModel.test.ts` passes unchanged.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/agent/llm/chatCompletionsLlm.ts src/agent/fallbackModel.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts
git add src/agent/llm/chatCompletionsLlm.ts src/agent/fallbackModel.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts
git commit -m "refactor(agent): move the ModelScope adapter into a Chat Completions adapter"
```

---

### Task 4: Provider-Aware Requests

OpenAI gets `reasoning_effort` and `max_completion_tokens` and never `enable_thinking`. ModelScope keeps `enable_thinking: false` and `max_tokens`. A profile without image input gets a marker instead of image bytes.

**Files:**

- Create: `tests/fixtures/chatCompletions/openai.json`, `tests/fixtures/chatCompletions/modelscope.json`
- Modify: `src/agent/llm/chatCompletionsLlm.ts`
- Test: `src/agent/llm/__tests__/chatCompletionsLlm.test.ts`

- [ ] **Step 1: Add the fixtures**

These fixtures are hand-built from the providers' documented reply shapes, with fake ids and no real keys. The live probe (Task 12) is the check against real replies.

Create `tests/fixtures/chatCompletions/openai.json`:

```json
{
  "text": {
    "status": 200,
    "body": {
      "id": "chatcmpl-fixture-text",
      "object": "chat.completion",
      "model": "gpt-6-luna",
      "choices": [
        {
          "index": 0,
          "message": { "role": "assistant", "content": "Hello there~", "refusal": null },
          "finish_reason": "stop"
        }
      ],
      "usage": {
        "prompt_tokens": 120,
        "completion_tokens": 9,
        "total_tokens": 129,
        "prompt_tokens_details": { "cached_tokens": 64 },
        "completion_tokens_details": { "reasoning_tokens": 0 }
      }
    }
  },
  "parallelToolCalls": {
    "status": 200,
    "body": {
      "id": "chatcmpl-fixture-tools",
      "object": "chat.completion",
      "model": "gpt-6-luna",
      "choices": [
        {
          "index": 0,
          "message": {
            "role": "assistant",
            "content": null,
            "refusal": null,
            "tool_calls": [
              {
                "id": "call_fixture_a",
                "type": "function",
                "function": { "name": "roll_dice", "arguments": "{\"sides\":6}" }
              },
              { "id": "call_fixture_b", "type": "function", "function": { "name": "flip_coin", "arguments": "{}" } }
            ]
          },
          "finish_reason": "tool_calls"
        }
      ],
      "usage": { "prompt_tokens": 210, "completion_tokens": 31, "total_tokens": 241 }
    }
  },
  "malformedToolArgs": {
    "status": 200,
    "body": {
      "choices": [
        {
          "index": 0,
          "message": {
            "role": "assistant",
            "content": null,
            "tool_calls": [
              {
                "id": "call_fixture_c",
                "type": "function",
                "function": { "name": "roll_dice", "arguments": "{\"sides\":" }
              }
            ]
          },
          "finish_reason": "tool_calls"
        }
      ],
      "usage": { "prompt_tokens": 90, "completion_tokens": 7, "total_tokens": 97 }
    }
  },
  "jsonSchema": {
    "status": 200,
    "body": {
      "choices": [
        {
          "index": 0,
          "message": {
            "role": "assistant",
            "content": "{\"city\":\"Kyoto\",\"note\":null,\"ops\":[{\"op\":\"add\",\"value\":\"likes tea\",\"reason\":null},{\"op\":\"drop\",\"id\":3}]}",
            "refusal": null
          },
          "finish_reason": "stop"
        }
      ],
      "usage": { "prompt_tokens": 300, "completion_tokens": 40, "total_tokens": 340 }
    }
  },
  "refusal": {
    "status": 200,
    "body": {
      "choices": [
        {
          "index": 0,
          "message": { "role": "assistant", "content": null, "refusal": "I can't help with that request." },
          "finish_reason": "stop"
        }
      ],
      "usage": { "prompt_tokens": 80, "completion_tokens": 8, "total_tokens": 88 }
    }
  },
  "insufficientQuota": {
    "status": 429,
    "body": {
      "error": {
        "message": "You exceeded your current quota, please check your plan and billing details.",
        "type": "insufficient_quota",
        "param": null,
        "code": "insufficient_quota"
      }
    }
  },
  "rateLimited": {
    "status": 429,
    "headers": { "retry-after": "7" },
    "body": {
      "error": {
        "message": "Rate limit reached for gpt-6-luna on requests per min (RPM): Limit 5000, Used 5000, Requested 1.",
        "type": "requests",
        "param": null,
        "code": "rate_limit_exceeded"
      }
    }
  },
  "contextLength": {
    "status": 400,
    "body": {
      "error": {
        "message": "This model's maximum context length is 922000 tokens. However, your messages resulted in 930112 tokens.",
        "type": "invalid_request_error",
        "param": "messages",
        "code": "context_length_exceeded"
      }
    }
  },
  "serverError": {
    "status": 500,
    "body": {
      "error": {
        "message": "The server had an error while processing your request. Sorry about that!",
        "type": "server_error",
        "param": null,
        "code": null
      }
    }
  }
}
```

Create `tests/fixtures/chatCompletions/modelscope.json`. The `magicubeExhausted` and `deepseekChoicesNull` bodies are best guesses: ModelScope does not document them. The second follows modelscope#1801.

````json
{
  "qwenText": {
    "status": 200,
    "body": {
      "id": "fixture-qwen-text",
      "object": "chat.completion",
      "model": "Qwen/Qwen3.5-35B-A3B",
      "choices": [{ "index": 0, "message": { "role": "assistant", "content": "Mm, hello~" }, "finish_reason": "stop" }],
      "usage": { "prompt_tokens": 98, "completion_tokens": 6, "total_tokens": 104 }
    }
  },
  "qwenToolCall": {
    "status": 200,
    "body": {
      "id": "fixture-qwen-tool",
      "object": "chat.completion",
      "model": "Qwen/Qwen3.5-35B-A3B",
      "choices": [
        {
          "index": 0,
          "message": {
            "role": "assistant",
            "content": "",
            "tool_calls": [
              {
                "id": "call_ms_fixture",
                "type": "function",
                "function": { "name": "get_current_time", "arguments": "{\"timezone\":\"Asia/Tokyo\"}" }
              }
            ]
          },
          "finish_reason": "tool_calls"
        }
      ],
      "usage": { "prompt_tokens": 150, "completion_tokens": 20, "total_tokens": 170 }
    }
  },
  "qwenJsonObject": {
    "status": 200,
    "body": {
      "id": "fixture-qwen-json",
      "object": "chat.completion",
      "model": "Qwen/Qwen3.5-35B-A3B",
      "choices": [
        {
          "index": 0,
          "message": { "role": "assistant", "content": "```json\n{\"city\":\"Kyoto\",\"population\":1460000}\n```" },
          "finish_reason": "stop"
        }
      ],
      "usage": { "prompt_tokens": 120, "completion_tokens": 14, "total_tokens": 134 }
    }
  },
  "deepseekChoicesNull": {
    "status": 200,
    "body": {
      "id": "fixture-deepseek-null",
      "object": "chat.completion",
      "model": "deepseek-ai/DeepSeek-V4.1-Flash",
      "choices": null,
      "usage": null
    }
  },
  "magicubeExhausted": {
    "status": 429,
    "body": { "errors": { "message": "Magicube balance exhausted for today; try again after it resets." } }
  },
  "overloaded": { "status": 503, "body": { "errors": { "message": "Service is busy, please retry later." } } },
  "unauthorized": { "status": 401, "body": { "errors": { "message": "Invalid token." } } }
}
````

Run: `npx prettier --write tests/fixtures/chatCompletions`

- [ ] **Step 2: Write the failing tests**

In `src/agent/llm/__tests__/chatCompletionsLlm.test.ts`, replace the import block with the following. The later tasks reuse these helpers.

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BaseLlm, LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import { describe, expect, it } from 'vitest'
import { ModelScopeLlm as ReexportedModelScopeLlm } from '../../fallbackModel.js'
import { ChatCompletionsLlm, ModelScopeLlm } from '../chatCompletionsLlm.js'
import { MODEL_PROFILES, profileFor } from '../profiles.js'

interface Fixture {
  status: number
  headers?: Record<string, string>
  body: unknown
}

type RequestCall = { input: unknown; init?: RequestInit }

function loadFixtures(name: string): Record<string, Fixture> {
  return JSON.parse(readFileSync(resolve('tests/fixtures/chatCompletions', `${name}.json`), 'utf8')) as Record<
    string,
    Fixture
  >
}

const openai = loadFixtures('openai')
const modelscope = loadFixtures('modelscope')

function replay(fixture: Fixture | undefined) {
  if (!fixture) throw new Error('Unknown fixture')
  const calls: RequestCall[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ input, init })
    return new Response(JSON.stringify(fixture.body), { status: fixture.status, headers: fixture.headers })
  }
  return { fetchImpl, calls }
}

function request(contents: unknown[], config: Record<string, unknown> = {}): LlmRequest {
  return { model: 'roka', contents, config, toolsDict: {}, liveConnectConfig: undefined } as unknown as LlmRequest
}

const hello = () => request([{ role: 'user', parts: [{ text: 'hello' }] }])

async function responses(model: BaseLlm, llmRequest: LlmRequest): Promise<LlmResponse[]> {
  const result: LlmResponse[] = []
  for await (const response of model.generateContentAsync(llmRequest)) result.push(response)
  return result
}

function bodyOf(call: RequestCall | undefined): Record<string, unknown> {
  return JSON.parse(call?.init?.body as string) as Record<string, unknown>
}

function luna(fetchImpl: typeof fetch): ChatCompletionsLlm {
  return new ChatCompletionsLlm({
    provider: 'openai',
    model: 'gpt-6-luna',
    apiKey: 'openai-key',
    timeoutMs: 2000,
    profile: profileFor('openai', 'gpt-6-luna'),
    fetchImpl
  })
}

function onModelScope(model: string, fetchImpl: typeof fetch): ChatCompletionsLlm {
  return new ChatCompletionsLlm({
    provider: 'modelscope',
    model,
    apiKey: 'modelscope-key',
    timeoutMs: 2000,
    profile: profileFor('modelscope', model),
    fetchImpl
  })
}
```

Append:

```ts
describe('ChatCompletionsLlm requests', () => {
  it('sends gpt-6-luna to OpenAI with reasoning_effort none and max_completion_tokens, never enable_thinking', async () => {
    const { fetchImpl, calls } = replay(openai.text)

    await responses(
      luna(fetchImpl),
      request([{ role: 'user', parts: [{ text: 'hi' }] }], {
        systemInstruction: 'Be Roka.',
        temperature: 0.9,
        topP: 0.95,
        maxOutputTokens: 300
      })
    )

    expect(calls[0]?.input).toBe('https://api.openai.com/v1/chat/completions')
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer openai-key')
    expect(bodyOf(calls[0])).toEqual({
      model: 'gpt-6-luna',
      messages: [
        { role: 'system', content: 'Be Roka.' },
        { role: 'user', content: 'hi' }
      ],
      reasoning_effort: 'none',
      temperature: 0.9,
      top_p: 0.95,
      max_completion_tokens: 300,
      stream: false
    })
  })

  it.each(['Qwen/Qwen3.5-35B-A3B', 'deepseek-ai/DeepSeek-V4.1-Flash'])(
    'sends %s to ModelScope with thinking off and max_tokens',
    async (model) => {
      const { fetchImpl, calls } = replay(modelscope.qwenText)

      await responses(
        onModelScope(model, fetchImpl),
        request([{ role: 'user', parts: [{ text: 'hi' }] }], { maxOutputTokens: 300 })
      )

      expect(calls[0]?.input).toBe('https://api-inference.modelscope.ai/v1/chat/completions')
      expect(bodyOf(calls[0])).toEqual({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        enable_thinking: false,
        max_tokens: 300,
        stream: false
      })
    }
  )

  it('sends image bytes only to a profile that reads images', async () => {
    const contents = [
      { role: 'user', parts: [{ text: 'look' }, { inlineData: { mimeType: 'image/png', data: 'AA==' } }] }
    ]
    const qwen = replay(modelscope.qwenText)
    const deepseek = replay(modelscope.qwenText)

    await responses(onModelScope('Qwen/Qwen3.5-35B-A3B', qwen.fetchImpl), request(contents))
    await responses(onModelScope('deepseek-ai/DeepSeek-V4.1-Flash', deepseek.fetchImpl), request(contents))

    expect(bodyOf(qwen.calls[0]).messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }
        ]
      }
    ])
    expect(bodyOf(deepseek.calls[0]).messages).toEqual([
      { role: 'user', content: "look\n(a file attachment that can't be opened right now)" }
    ])
  })

  it('reads an OpenAI reply into one model response with usage metadata', async () => {
    const result = await responses(luna(replay(openai.text).fetchImpl), hello())

    expect(result).toEqual([
      {
        content: { role: 'model', parts: [{ text: 'Hello there~' }] },
        finishReason: FinishReason.STOP,
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 9, totalTokenCount: 129 }
      }
    ])
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/agent/llm/__tests__/chatCompletionsLlm.test.ts`
Expected: FAIL. The URL is `undefined/chat/completions` (there is no default base URL yet). There is no `reasoning_effort`. `enable_thinking` is sent to OpenAI, and the DeepSeek image is still sent as bytes.

- [ ] **Step 4: Implement**

In `src/agent/llm/chatCompletionsLlm.ts`:

1. Add the import `import type { ModelProfile } from './profiles.js'`.
2. Replace `interface ChatCompletionsResponse` with the full reply shape. Later tasks read `id`, `refusal` and the usage details.

   ```ts
   interface ChatCompletionsResponse {
     choices?: Array<{
       message?: {
         content?: string | null
         refusal?: string | null
         tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>
       }
       finish_reason?: string | null
     }> | null
     usage?: {
       prompt_tokens?: number
       completion_tokens?: number
       total_tokens?: number
       prompt_tokens_details?: { cached_tokens?: number }
       completion_tokens_details?: { reasoning_tokens?: number }
     } | null
   }
   ```

3. Change `function openAiMessages(llmRequest: LlmRequest): ChatMessage[]` to `function openAiMessages(llmRequest: LlmRequest, acceptsImages: boolean): ChatMessage[]`. In its user branch, change `if (inlineData && mimeType?.startsWith('image/')) {` to `if (acceptsImages && inlineData && mimeType?.startsWith('image/')) {`.
4. Replace `ChatCompletionsOptions` and add the base URLs above it:

   ```ts
   export const CHAT_COMPLETIONS_BASE_URLS: Readonly<Record<ChatCompletionsProvider, string>> = {
     openai: 'https://api.openai.com/v1',
     modelscope: 'https://api-inference.modelscope.ai/v1'
   }

   export interface ChatCompletionsOptions {
     provider: ChatCompletionsProvider
     model: string
     apiKey: string
     baseUrl?: string
     timeoutMs: number
     /** Absent only on the legacy ModelScopeLlm path, which keeps today's request shape. */
     profile?: ModelProfile
     effort?: string
     fetchImpl?: typeof fetch
   }
   ```

5. Replace the whole `ChatCompletionsLlm` class (keep `ModelScopeLlm` after it) with:

   ```ts
   export class ChatCompletionsLlm extends BaseLlm {
     readonly provider: ChatCompletionsProvider
     private readonly apiKey: string
     private readonly baseUrl: string
     private readonly timeoutMs: number
     private readonly profile: ModelProfile | undefined
     private readonly effort: string | undefined
     private readonly fetchImpl: typeof fetch

     constructor(options: ChatCompletionsOptions) {
       super({ model: options.model })
       this.provider = options.provider
       this.apiKey = options.apiKey
       this.baseUrl = (options.baseUrl ?? CHAT_COMPLETIONS_BASE_URLS[options.provider]).replace(/\/+$/, '')
       this.timeoutMs = options.timeoutMs
       this.profile = options.profile
       this.effort = options.effort ?? options.profile?.thinking.defaultEffort
       this.fetchImpl = options.fetchImpl ?? fetch
     }

     private get label(): string {
       return PROVIDER_LABELS[this.provider]
     }

     async *generateContentAsync(llmRequest: LlmRequest, _stream?: boolean): AsyncGenerator<LlmResponse, void> {
       this.maybeAppendUserContent(llmRequest)
       const result = await this.post(JSON.stringify(this.requestBody(llmRequest)), llmRequest.config?.abortSignal)
       yield this.toResponse(result)
     }

     private requestBody(llmRequest: LlmRequest): JsonObject {
       const body: JsonObject = {
         model: this.model,
         messages: openAiMessages(llmRequest, this.profile?.input.image ?? true),
         stream: false
       }
       // ModelScope serves Qwen and DeepSeek with thinking on unless told otherwise; OpenAI rejects the field.
       if (this.provider === 'modelscope') body.enable_thinking = false
       if (this.effort !== undefined) body.reasoning_effort = this.effort
       const temperature = llmRequest.config?.temperature
       const topP = llmRequest.config?.topP
       const maxTokens = llmRequest.config?.maxOutputTokens
       if (temperature !== undefined) body.temperature = temperature
       if (topP !== undefined) body.top_p = topP
       // GPT-6 models refuse max_tokens and take max_completion_tokens instead.
       if (maxTokens !== undefined)
         body[this.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = maxTokens
       const tools = openAiTools(llmRequest)
       if (tools.length) body.tools = tools
       return body
     }

     private async post(body: string, signal: AbortSignal | undefined): Promise<ChatCompletionsResponse> {
       const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
         method: 'POST',
         headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
         body,
         signal: signal
           ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
           : AbortSignal.timeout(this.timeoutMs)
       })
       if (!response.ok) {
         const bodyText = await response.text()
         throw new Error(`${this.label} ${response.status}: ${bodyText.slice(0, 300)}`)
       }
       return (await response.json()) as ChatCompletionsResponse
     }

     private toResponse(result: ChatCompletionsResponse): LlmResponse {
       const choice = result.choices?.[0]
       const message = choice?.message
       const text = typeof message?.content === 'string' ? message.content.trim() : ''
       const functionCalls: Array<{ name: string; args: JsonObject }> = []
       for (const toolCall of message?.tool_calls ?? []) {
         const args = parseJson(toolCall.function?.arguments ?? '')
         if (!isRecord(args)) {
           return {
             errorCode: 'MALFORMED_FUNCTION_CALL',
             errorMessage: `${this.label} returned malformed tool arguments`,
             finishReason: FinishReason.MALFORMED_FUNCTION_CALL
           }
         }
         functionCalls.push({ name: toolCall.function?.name ?? '', args })
       }

       const parts: Part[] = []
       if (text) parts.push({ text })
       for (const call of functionCalls) {
         parts.push({
           functionCall: { name: call.name, args: call.args },
           thoughtSignature: 'skip_thought_signature_validator'
         })
       }
       if (parts.length === 0) parts.push({ text: '' })

       const finishReason =
         choice?.finish_reason === 'length'
           ? FinishReason.MAX_TOKENS
           : choice?.finish_reason === 'content_filter'
             ? FinishReason.SAFETY
             : FinishReason.STOP
       const usage = result.usage
       return {
         content: { role: 'model', parts },
         finishReason,
         ...(usage
           ? {
               usageMetadata: {
                 promptTokenCount: usage.prompt_tokens,
                 candidatesTokenCount: usage.completion_tokens,
                 totalTokenCount: usage.total_tokens
               }
             }
           : {})
       }
     }

     connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
       throw new Error(`${this.constructor.name} does not support live connections`)
     }
   }
   ```

6. Add this helper next to `isRecord`:

   ```ts
   function parseJson(text: string): unknown {
     try {
       return JSON.parse(text)
     } catch {
       return undefined
     }
   }
   ```

7. If Task 1 found that `anthropicLlm.ts` shapes its own request, add the same shaping call as the first line of `generateContentAsync`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/agent/llm/__tests__/chatCompletionsLlm.test.ts src/agent/__tests__/fallbackModel.test.ts && npm run typecheck`
Expected: PASS, including every legacy `ModelScopeLlm` test. With no profile, images still pass, there is no effort and `max_tokens` is used.

- [ ] **Step 6: Commit**

```bash
npx biome check --write src/agent/llm/chatCompletionsLlm.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts
npx prettier --write tests/fixtures/chatCompletions
git add src/agent/llm/chatCompletionsLlm.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts tests/fixtures/chatCompletions
git commit -m "feat(agent): shape Chat Completions requests for OpenAI and ModelScope profiles"
```

---

### Task 5: Tool Call Ids End to End

Today the adapter drops the provider's call id. ADK then assigns an `adk-` id and strips it again before the next call (`getContents` → `removeClientFunctionCallId`), so results pair FIFO by name. This task keeps the provider id on the returned `functionCall` and pairs results by that id. Only id-less calls (ADK-stripped ones) still pair by name. It also leaves out an unanswered call, because Chat Completions rejects a `tool_call_id` with no tool message.

**Files:**

- Modify: `src/agent/llm/chatCompletionsLlm.ts` (`GeneratedCall` / `MessageGroup` / `MessageEntry`, `openAiMessages`, `toResponse`)
- Modify: `src/agent/__tests__/fallbackModel.test.ts:299-330`
- Test: `src/agent/llm/__tests__/chatCompletionsLlm.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/agent/llm/__tests__/chatCompletionsLlm.test.ts`:

```ts
describe('ChatCompletionsLlm tool calls', () => {
  it('pairs tool results with their calls by id, whatever order the results arrive in', async () => {
    const { fetchImpl, calls } = replay(openai.text)

    await responses(
      luna(fetchImpl),
      request([
        { role: 'user', parts: [{ text: 'roll twice' }] },
        {
          role: 'model',
          parts: [
            { functionCall: { id: 'call_first', name: 'roll_dice', args: { sides: 6 } } },
            { functionCall: { id: 'call_second', name: 'roll_dice', args: { sides: 20 } } }
          ]
        },
        {
          role: 'user',
          parts: [
            { functionResponse: { id: 'call_second', name: 'roll_dice', response: { result: 17 } } },
            { functionResponse: { id: 'call_first', name: 'roll_dice', response: { result: 4 } } }
          ]
        }
      ])
    )

    expect(bodyOf(calls[0]).messages).toEqual([
      { role: 'user', content: 'roll twice' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_first', type: 'function', function: { name: 'roll_dice', arguments: '{"sides":6}' } },
          { id: 'call_second', type: 'function', function: { name: 'roll_dice', arguments: '{"sides":20}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_first', content: '{"result":4}' },
      { role: 'tool', tool_call_id: 'call_second', content: '{"result":17}' }
    ])
  })

  it('leaves out a tool call that never got a result', async () => {
    const { fetchImpl, calls } = replay(openai.text)

    await responses(
      luna(fetchImpl),
      request([
        {
          role: 'model',
          parts: [{ text: 'Let me check.' }, { functionCall: { id: 'call_lost', name: 'get_current_time', args: {} } }]
        },
        { role: 'model', parts: [{ functionCall: { id: 'call_gone', name: 'flip_coin', args: {} } }] },
        { role: 'user', parts: [{ text: 'well?' }] }
      ])
    )

    expect(bodyOf(calls[0]).messages).toEqual([
      { role: 'assistant', content: 'Let me check.' },
      { role: 'user', content: 'well?' }
    ])
  })

  it('returns each provider call id on its function call', async () => {
    const [response] = await responses(luna(replay(openai.parallelToolCalls).fetchImpl), hello())

    expect(response?.content?.parts).toEqual([
      {
        functionCall: { id: 'call_fixture_a', name: 'roll_dice', args: { sides: 6 } },
        thoughtSignature: 'skip_thought_signature_validator'
      },
      {
        functionCall: { id: 'call_fixture_b', name: 'flip_coin', args: {} },
        thoughtSignature: 'skip_thought_signature_validator'
      }
    ])
  })
})
```

In `src/agent/__tests__/fallbackModel.test.ts`, replace the test `'returns tool calls with parsed arguments, a skip signature and no id'` (lines 299–330) with:

```ts
it('returns tool calls with parsed arguments, a skip signature and the provider id', async () => {
  const { fetchImpl } = createFetch({
    choices: [
      {
        message: {
          content: 'Searching',
          tool_calls: [
            { id: 'provider-id', type: 'function', function: { name: 'search', arguments: '{"query":"tea"}' } }
          ]
        },
        finish_reason: 'tool_calls'
      }
    ]
  })

  const result = await responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'search' }] }]))

  expect(result[0]).toMatchObject({
    content: {
      role: 'model',
      parts: [
        { text: 'Searching' },
        {
          functionCall: { id: 'provider-id', name: 'search', args: { query: 'tea' } },
          thoughtSignature: 'skip_thought_signature_validator'
        }
      ]
    },
    finishReason: FinishReason.STOP
  })
})

it('leaves the call id unset when the provider sends none, so ADK assigns its own', async () => {
  const { fetchImpl } = createFetch({
    choices: [
      { message: { tool_calls: [{ function: { name: 'search', arguments: '{}' } }] }, finish_reason: 'tool_calls' }
    ]
  })

  const result = await responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'search' }] }]))

  expect(result[0]?.content?.parts?.[0]?.functionCall).not.toHaveProperty('id')
})
```

Keep the test `'pairs repeated tool responses FIFO and marks unmatched results as user text'` unchanged. Its calls carry no ids, so it now covers the id-less path.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/agent/llm/__tests__/chatCompletionsLlm.test.ts src/agent/__tests__/fallbackModel.test.ts`
Expected: FAIL. The by-id test gets `call_1`/`call_2` with the results swapped. The unanswered calls are still sent. Returned calls carry no `id`.

- [ ] **Step 3: Implement**

In `src/agent/llm/chatCompletionsLlm.ts`, replace the interfaces `GeneratedCall`, `MessageGroup` and `MessageEntry` with:

```ts
interface GeneratedCall {
  id: string
  name: string
  args: unknown
  answered?: ChatMessage
}

interface MessageEntry {
  message: ChatMessage
  /** Present on assistant entries; only the answered calls are sent. */
  calls?: GeneratedCall[]
}
```

Replace the whole `openAiMessages` function with:

```ts
function openAiMessages(llmRequest: LlmRequest, acceptsImages: boolean): ChatMessage[] {
  const messages: ChatMessage[] = []
  const instruction = systemText(llmRequest.config?.systemInstruction)
  if (instruction) messages.push({ role: 'system', content: instruction })

  const callsById = new Map<string, GeneratedCall>()
  const idlessCalls = new Map<string, GeneratedCall[]>()
  const entries: MessageEntry[] = []
  let callSequence = 0
  const addFunctionResponse = (
    functionResponse: { id?: string; name?: string; response?: unknown },
    onUnmatched: (text: string) => void
  ) => {
    const name = functionResponse.name ?? ''
    // ADK strips its own `adk-` ids before every call, so a call that came without a provider id comes back without
    // one; only those pair by name, earliest unanswered first.
    const call = functionResponse.id
      ? callsById.get(functionResponse.id)
      : idlessCalls.get(name)?.find((candidate) => candidate.answered === undefined)
    if (!call || call.answered) {
      onUnmatched(`(result of ${name}: ${JSON.stringify(functionResponse.response ?? {})})`)
      return
    }
    call.answered = { role: 'tool', tool_call_id: call.id, content: JSON.stringify(functionResponse.response ?? {}) }
  }

  for (const content of llmRequest.contents) {
    const parts = content.parts ?? []

    if (content.role === 'model') {
      const textParts: string[] = []
      const unmatchedResponses: string[] = []
      const calls: GeneratedCall[] = []
      for (const part of parts) {
        if (part.thought) continue
        if (part.functionResponse) {
          addFunctionResponse(part.functionResponse, (text) => unmatchedResponses.push(text))
          continue
        }
        if (part.text !== undefined) textParts.push(part.text)
        if (part.functionCall) {
          const providerId = part.functionCall.id
          const call: GeneratedCall = {
            id: providerId || `call_${++callSequence}`,
            name: part.functionCall.name ?? '',
            args: part.functionCall.args ?? {}
          }
          calls.push(call)
          if (providerId) callsById.set(providerId, call)
          else idlessCalls.set(call.name, [...(idlessCalls.get(call.name) ?? []), call])
        }
        if (part.inlineData || part.fileData) {
          textParts.push(attachmentMarker(attachmentKind(part.inlineData?.mimeType ?? part.fileData?.mimeType)))
        }
      }
      if (textParts.length || calls.length) {
        entries.push({ message: { role: 'assistant', content: textParts.length ? textParts.join('\n') : null }, calls })
      }
      if (unmatchedResponses.length) entries.push({ message: { role: 'user', content: unmatchedResponses.join('\n') } })
      continue
    }

    const userParts: ContentPart[] = []
    for (const part of parts) {
      if (part.thought) continue
      if (part.functionResponse) {
        addFunctionResponse(part.functionResponse, (text) => userParts.push({ type: 'text', text }))
        continue
      }
      if (part.text !== undefined) userParts.push({ type: 'text', text: part.text })
      if (part.inlineData || part.fileData) {
        const inlineData = part.inlineData
        const mimeType = inlineData?.mimeType
        if (acceptsImages && inlineData && mimeType?.startsWith('image/')) {
          userParts.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${inlineData.data}` } })
        } else {
          userParts.push({
            type: 'text',
            text: attachmentMarker(attachmentKind(inlineData?.mimeType ?? part.fileData?.mimeType))
          })
        }
      }
    }
    if (userParts.length) entries.push({ message: { role: 'user', content: textContent(userParts) } })
  }

  for (const entry of entries) {
    const answered = (entry.calls ?? []).filter((call) => call.answered !== undefined)
    // Chat Completions rejects a tool call with no tool message after it, so an unanswered call is left out.
    if (entry.calls && entry.message.content === null && answered.length === 0) continue
    messages.push(
      answered.length
        ? {
            ...entry.message,
            tool_calls: answered.map((call) => ({
              id: call.id,
              type: 'function',
              function: { name: call.name, arguments: JSON.stringify(call.args) }
            }))
          }
        : entry.message
    )
    messages.push(...answered.flatMap((call) => (call.answered ? [call.answered] : [])))
  }
  return messages
}
```

Add the content-part alias next to `ChatMessage`, and use it in `textContent`'s signature in place of the inline union:

```ts
type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
```

In `toResponse`, carry the id. Change `const functionCalls: Array<{ name: string; args: JsonObject }> = []` to `Array<{ id?: string; name: string; args: JsonObject }>`. Change the push to `functionCalls.push({ id: toolCall.id || undefined, name: toolCall.function?.name ?? '', args })`. Change the part to:

```ts
parts.push({
  functionCall: { ...(call.id ? { id: call.id } : {}), name: call.name, args: call.args },
  thoughtSignature: 'skip_thought_signature_validator'
})
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/agent/llm/__tests__/chatCompletionsLlm.test.ts src/agent/__tests__/fallbackModel.test.ts src/agent/__tests__/modelHedge.test.ts && npm run typecheck`
Expected: PASS. The FIFO test (id-less) gives the same messages as before.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/agent/llm/chatCompletionsLlm.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts src/agent/__tests__/fallbackModel.test.ts
git add src/agent/llm/chatCompletionsLlm.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts src/agent/__tests__/fallbackModel.test.ts
git commit -m "fix(agent): keep provider tool call ids and pair tool results by id"
```

---

### Task 6: Structured Output

When `llmRequest.config.responseJsonSchema` is set, the adapter returns the JSON object as the text of the first part (contract: Adapter Rules). For `json_schema_strict`, it sends `response_format.json_schema` with `strict: true`. Optional fields become required-nullable, `oneOf` becomes `anyOf`, and unsupported keywords are dropped from the sent schema. The nulls are then removed from the reply. For `json_object`, it sends `response_format: json_object` with the schema in the system prompt and unwraps a fenced reply. The transform is idempotent, so a schema that 1B already made strict passes through unchanged.

**Files:**

- Modify: `src/agent/llm/chatCompletionsLlm.ts`
- Test: `src/agent/llm/__tests__/chatCompletionsLlm.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
const MEMORY_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    city: { type: 'string', minLength: 1 },
    note: { type: 'string' },
    ops: {
      type: 'array',
      items: {
        oneOf: [
          {
            type: 'object',
            properties: { op: { type: 'string', const: 'add' }, value: { type: 'string' }, reason: { type: 'string' } },
            required: ['op', 'value'],
            additionalProperties: false
          },
          {
            type: 'object',
            properties: { op: { type: 'string', const: 'drop' }, id: { type: 'integer' } },
            required: ['op', 'id'],
            additionalProperties: false
          }
        ]
      }
    }
  },
  required: ['city', 'ops'],
  additionalProperties: false
}

const STRICT_MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    city: { type: 'string' },
    note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    ops: {
      type: 'array',
      items: {
        anyOf: [
          {
            type: 'object',
            properties: {
              op: { type: 'string', const: 'add' },
              value: { type: 'string' },
              reason: { anyOf: [{ type: 'string' }, { type: 'null' }] }
            },
            required: ['op', 'value', 'reason'],
            additionalProperties: false
          },
          {
            type: 'object',
            properties: { op: { type: 'string', const: 'drop' }, id: { type: 'integer' } },
            required: ['op', 'id'],
            additionalProperties: false
          }
        ]
      }
    }
  },
  required: ['city', 'note', 'ops'],
  additionalProperties: false
}

describe('ChatCompletionsLlm structured output', () => {
  it('asks gpt-6-luna for a strict json_schema and drops the nulls strict mode puts in optional fields', async () => {
    const { fetchImpl, calls } = replay(openai.jsonSchema)

    const [response] = await responses(
      luna(fetchImpl),
      request([{ role: 'user', parts: [{ text: 'Remember Kyoto.' }] }], { responseJsonSchema: MEMORY_SCHEMA })
    )

    expect(bodyOf(calls[0]).response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'response', strict: true, schema: STRICT_MEMORY_SCHEMA }
    })
    expect(bodyOf(calls[0]).messages).toEqual([{ role: 'user', content: 'Remember Kyoto.' }])
    expect(JSON.parse(response?.content?.parts?.[0]?.text ?? '')).toEqual({
      city: 'Kyoto',
      ops: [
        { op: 'add', value: 'likes tea' },
        { op: 'drop', id: 3 }
      ]
    })
  })

  it('sends an already strict schema unchanged', async () => {
    const { fetchImpl, calls } = replay(openai.jsonSchema)

    await responses(
      luna(fetchImpl),
      request([{ role: 'user', parts: [{ text: 'x' }] }], { responseJsonSchema: STRICT_MEMORY_SCHEMA })
    )

    expect(bodyOf(calls[0]).response_format).toMatchObject({ json_schema: { schema: STRICT_MEMORY_SCHEMA } })
  })

  it('asks ModelScope for json_object with the schema in the system prompt and unwraps a fenced reply', async () => {
    const { fetchImpl, calls } = replay(modelscope.qwenJsonObject)
    const schema = {
      type: 'object',
      properties: { city: { type: 'string' }, population: { type: 'integer' } },
      required: ['city', 'population']
    }

    const [response] = await responses(
      onModelScope('Qwen/Qwen3.5-35B-A3B', fetchImpl),
      request([{ role: 'user', parts: [{ text: 'Kyoto?' }] }], {
        systemInstruction: 'Extract facts.',
        responseJsonSchema: schema
      })
    )

    expect(bodyOf(calls[0]).response_format).toEqual({ type: 'json_object' })
    expect(bodyOf(calls[0]).messages).toEqual([
      {
        role: 'system',
        content: `Extract facts.\n\nReply with only a JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}`
      },
      { role: 'user', content: 'Kyoto?' }
    ])
    expect(response?.content?.parts).toEqual([{ text: '{"city":"Kyoto","population":1460000}' }])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/agent/llm/__tests__/chatCompletionsLlm.test.ts -t "structured output"`
Expected: FAIL, because `response_format` is `undefined`.

- [ ] **Step 3: Implement**

In `src/agent/llm/chatCompletionsLlm.ts`, add these module-level helpers after `parseJson`:

````ts
const JSON_OBJECT_INSTRUCTION = 'Reply with only a JSON object that matches this JSON Schema:'
// OpenAI strict mode rejects these keywords; the caller's own validation still enforces them on the reply.
const STRICT_UNSUPPORTED_KEYWORDS = new Set([
  '$schema',
  'default',
  'minLength',
  'maxLength',
  'minProperties',
  'maxProperties',
  'patternProperties',
  'propertyNames',
  'unevaluatedProperties',
  'uniqueItems',
  'contains',
  'minContains',
  'maxContains',
  'unevaluatedItems'
])

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function withSystemText(messages: ChatMessage[], text: string): void {
  const first = messages[0]
  if (first?.role === 'system') first.content = `${String(first.content)}\n\n${text}`
  else messages.unshift({ role: 'system', content: text })
}

function strictSchemas(value: unknown): unknown {
  return isRecord(value)
    ? Object.fromEntries(Object.entries(value).map(([name, child]) => [name, strictSchema(child)]))
    : value
}

/** OpenAI strict mode: every property required, an optional one nullable instead, no extra keys, anyOf for oneOf. */
function strictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictSchema)
  if (!isRecord(value)) return value
  const schema: JsonObject = {}
  for (const [key, child] of Object.entries(value)) {
    if (STRICT_UNSUPPORTED_KEYWORDS.has(key)) continue
    schema[key === 'oneOf' ? 'anyOf' : key] =
      key === 'properties' || key === '$defs' ? strictSchemas(child) : strictSchema(child)
  }
  if (isRecord(schema.properties)) {
    const required = new Set(arrayOf(value.required))
    schema.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([name, child]) => [
        name,
        required.has(name) ? child : { anyOf: [child, { type: 'null' }] }
      ])
    )
    schema.required = Object.keys(schema.properties)
    schema.additionalProperties = false
  }
  return schema
}

function constsMatch(value: JsonObject, branch: unknown): boolean {
  const properties = isRecord(branch) && isRecord(branch.properties) ? branch.properties : {}
  return Object.entries(properties).every(
    ([name, property]) => !isRecord(property) || !('const' in property) || value[name] === property.const
  )
}

/** Strict mode answers an omitted optional field with null, where the caller's own schema expects no key at all. */
function withoutOptionalNulls(value: unknown, schema: unknown): unknown {
  if (!isRecord(schema)) return value
  if (Array.isArray(value)) return value.map((item) => withoutOptionalNulls(item, schema.items))
  if (!isRecord(value)) return value
  let result: JsonObject = value
  for (const branch of [...arrayOf(schema.anyOf), ...arrayOf(schema.oneOf)]) {
    if (constsMatch(result, branch)) result = withoutOptionalNulls(result, branch) as JsonObject
  }
  if (!isRecord(schema.properties)) return result
  const properties = schema.properties
  const required = new Set(arrayOf(schema.required))
  return Object.fromEntries(
    Object.entries(result)
      .filter(([name, child]) => !(child === null && name in properties && !required.has(name)))
      .map(([name, child]) => [name, name in properties ? withoutOptionalNulls(child, properties[name]) : child])
  )
}

function structuredText(text: string, strictOriginal: JsonObject | undefined): string {
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  if (!strictOriginal) return unfenced
  const parsed = parseJson(unfenced)
  return parsed === undefined ? unfenced : JSON.stringify(withoutOptionalNulls(parsed, strictOriginal))
}
````

In the class, replace `generateContentAsync` and `requestBody` whole, then change the `text` line of `toResponse`:

```ts
  async *generateContentAsync(llmRequest: LlmRequest, _stream?: boolean): AsyncGenerator<LlmResponse, void> {
    this.maybeAppendUserContent(llmRequest)
    const requested = llmRequest.config?.responseJsonSchema
    const schema = isRecord(requested) ? requested : undefined
    const strict = schema !== undefined && this.profile?.structuredOutput === 'json_schema_strict'
    const result = await this.post(JSON.stringify(this.requestBody(llmRequest, schema, strict)), llmRequest.config?.abortSignal)
    yield this.toResponse(result, schema, strict)
  }

  private requestBody(llmRequest: LlmRequest, schema: JsonObject | undefined, strict: boolean): JsonObject {
    const messages = openAiMessages(llmRequest, this.profile?.input.image ?? true)
    if (schema && !strict) withSystemText(messages, `${JSON_OBJECT_INSTRUCTION}\n${JSON.stringify(schema)}`)
    const body: JsonObject = { model: this.model, messages, stream: false }
    // ModelScope serves Qwen and DeepSeek with thinking on unless told otherwise; OpenAI rejects the field.
    if (this.provider === 'modelscope') body.enable_thinking = false
    if (this.effort !== undefined) body.reasoning_effort = this.effort
    const temperature = llmRequest.config?.temperature
    const topP = llmRequest.config?.topP
    const maxTokens = llmRequest.config?.maxOutputTokens
    if (temperature !== undefined) body.temperature = temperature
    if (topP !== undefined) body.top_p = topP
    // GPT-6 models refuse max_tokens and take max_completion_tokens instead.
    if (maxTokens !== undefined) body[this.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = maxTokens
    const tools = openAiTools(llmRequest)
    if (tools.length) body.tools = tools
    if (schema) {
      body.response_format = strict
        ? { type: 'json_schema', json_schema: { name: 'response', strict: true, schema: strictSchema(schema) } }
        : { type: 'json_object' }
    }
    return body
  }
```

Change `toResponse`'s signature to `private toResponse(result: ChatCompletionsResponse, schema: JsonObject | undefined, strict: boolean): LlmResponse`. Replace its `text` line with:

```ts
const content = typeof message?.content === 'string' ? message.content.trim() : ''
const text = schema ? structuredText(content, strict ? schema : undefined) : content
```

Profiles without `structuredOutput` (the legacy `ModelScopeLlm`) use `json_object`, which ModelScope already serves to the Qwen watcher.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/agent/llm/__tests__/chatCompletionsLlm.test.ts src/agent/__tests__/fallbackModel.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/agent/llm/chatCompletionsLlm.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts
git add src/agent/llm/chatCompletionsLlm.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts
git commit -m "feat(agent): send structured output as strict json_schema or json_object"
```

---

### Task 7: Failures as `ProviderError`

| Reply                                                     | Kind                                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 429, including Magicube exhaustion                        | `quota_exhausted` (`retryAfterMs` from `Retry-After`)                                           |
| OpenAI 429 `insufficient_quota` (spent balance)           | `billing_exhausted`                                                                             |
| 5xx                                                       | `transient_http`                                                                                |
| 400/413 naming the context length                         | `context_length`                                                                                |
| Other 4xx                                                 | `terminal`                                                                                      |
| 200 with `choices` null, empty or missing                 | `transient_http`, message `<Provider> returned HTTP 200 with no choices`                        |
| `message.refusal`                                         | `refusal`                                                                                       |
| Unparseable or non-object tool arguments                  | `malformed_tool_args` (thrown, so no tool runs and a malformed hedge reply cannot win the race) |
| Transport failure or own timeout                          | `network` with `cause`                                                                          |
| The caller's abort (hedge loser, turn deadline, shutdown) | Rethrown untouched                                                                              |

**Files:**

- Modify: `src/agent/llm/chatCompletionsLlm.ts`
- Modify: `src/agent/__tests__/fallbackModel.test.ts:332-351`, `:382-391`
- Test: `src/agent/llm/__tests__/chatCompletionsLlm.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `import { ProviderError } from '../providerError.js'` to the test file's imports, then append:

```ts
describe('ChatCompletionsLlm failures', () => {
  it.each<[string, string, string, number]>([
    ['openai', 'insufficientQuota', 'billing_exhausted', 429],
    ['openai', 'rateLimited', 'quota_exhausted', 429],
    ['openai', 'contextLength', 'context_length', 400],
    ['openai', 'serverError', 'transient_http', 500],
    ['modelscope', 'magicubeExhausted', 'quota_exhausted', 429],
    ['modelscope', 'overloaded', 'transient_http', 503],
    ['modelscope', 'unauthorized', 'terminal', 401]
  ])('classifies the %s %s reply as %s', async (provider, name, kind, status) => {
    const { fetchImpl } = replay(provider === 'openai' ? openai[name] : modelscope[name])
    const llm = provider === 'openai' ? luna(fetchImpl) : onModelScope('Qwen/Qwen3.5-35B-A3B', fetchImpl)

    const failure = responses(llm, hello())

    await expect(failure).rejects.toBeInstanceOf(ProviderError)
    await expect(failure).rejects.toMatchObject({ provider, kind, status })
  })

  it('carries Retry-After as retryAfterMs', async () => {
    await expect(responses(luna(replay(openai.rateLimited).fetchImpl), hello())).rejects.toMatchObject({
      retryAfterMs: 7000
    })
  })

  it('treats an HTTP 200 with choices: null as transient_http with a clear message', async () => {
    const llm = onModelScope('deepseek-ai/DeepSeek-V4.1-Flash', replay(modelscope.deepseekChoicesNull).fetchImpl)

    await expect(responses(llm, hello())).rejects.toMatchObject({
      kind: 'transient_http',
      status: 200,
      message: 'ModelScope returned HTTP 200 with no choices'
    })
  })

  it('turns an OpenAI refusal into a refusal failure', async () => {
    await expect(responses(luna(replay(openai.refusal).fetchImpl), hello())).rejects.toMatchObject({ kind: 'refusal' })
  })

  it('throws malformed_tool_args for arguments that do not parse, so no tool runs', async () => {
    await expect(responses(luna(replay(openai.malformedToolArgs).fetchImpl), hello())).rejects.toMatchObject({
      kind: 'malformed_tool_args',
      message: 'OpenAI returned malformed tool arguments'
    })
  })

  it("passes the caller's own abort through untouched", async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl: typeof fetch = async (_input, init) => {
      throw init?.signal?.reason
    }

    const error = await responses(
      luna(fetchImpl),
      request([{ role: 'user', parts: [{ text: 'hello' }] }], { abortSignal: controller.signal })
    ).catch((caught: unknown) => caught)

    expect(error).toBe(controller.signal.reason)
  })

  it('wraps any other transport failure as network, keeping the cause', async () => {
    const cause = new TypeError('fetch failed')
    const fetchImpl: typeof fetch = async () => {
      throw cause
    }

    await expect(responses(luna(fetchImpl), hello())).rejects.toMatchObject({
      kind: 'network',
      message: 'OpenAI request failed: fetch failed',
      cause
    })
  })
})
```

In `src/agent/__tests__/fallbackModel.test.ts`, replace the malformed test (lines 332–351) with:

```ts
it.each(['{bad json', '[]'])('throws malformed_tool_args for invalid object arguments: %s', async (args) => {
  const { fetchImpl } = createFetch({
    choices: [
      {
        message: { tool_calls: [{ function: { name: 'search', arguments: args } }] },
        finish_reason: 'tool_calls'
      }
    ]
  })

  await expect(
    responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'search' }] }]))
  ).rejects.toMatchObject({ kind: 'malformed_tool_args', message: 'ModelScope returned malformed tool arguments' })
})
```

Replace `'propagates a fetch rejection unchanged'` (lines 382–391) with:

```ts
it('wraps a fetch rejection as a network failure that keeps the cause', async () => {
  const networkError = new Error('socket closed')
  const fetchImpl: typeof fetch = async () => {
    throw networkError
  }

  await expect(
    responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'hello' }] }]))
  ).rejects.toMatchObject({ kind: 'network', cause: networkError })
})
```

The test `'throws the HTTP status and response body on non-2xx responses'` stays as it is. Its message `ModelScope 503: …` does not change.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/agent/llm/__tests__/chatCompletionsLlm.test.ts src/agent/__tests__/fallbackModel.test.ts`
Expected: FAIL. Errors are plain `Error`s with no `kind`. A malformed call yields a response instead of throwing. A null `choices` returns an empty reply.

- [ ] **Step 3: Implement**

In `src/agent/llm/chatCompletionsLlm.ts`, add these imports:

```ts
import type { FailureKind } from '../geminiReliability.js'
import { ProviderError } from './providerError.js'
```

Add these module-level helpers:

```ts
const CONTEXT_LENGTH_PATTERN =
  /context_length_exceeded|context length|too many tokens|input is too long|prompt is too long/i
// ModelScope does not document which status a spent Magicube balance returns, so its wording counts too.
const MAGICUBE_PATTERN = /magicube/i

function httpFailureKind(status: number, body: string): FailureKind {
  // OpenAI's insufficient_quota is a spent balance, not a busy minute, and stays spent until billing changes.
  if (status === 429) return /insufficient_quota/.test(body) ? 'billing_exhausted' : 'quota_exhausted'
  if (status >= 500) return 'transient_http'
  if (MAGICUBE_PATTERN.test(body)) return 'quota_exhausted'
  if (status === 413 || CONTEXT_LENGTH_PATTERN.test(body)) return 'context_length'
  return 'terminal'
}

function retryAfterMs(response: Response): number | undefined {
  const seconds = Number(response.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
```

In the class, add `fail` and replace `generateContentAsync`, `post` and `toResponse`:

```ts
  private fail(
    kind: FailureKind,
    message: string,
    details: { status?: number; retryAfterMs?: number; cause?: unknown } = {}
  ): ProviderError {
    return new ProviderError({ provider: this.provider, kind, message, ...details })
  }

  async *generateContentAsync(llmRequest: LlmRequest, _stream?: boolean): AsyncGenerator<LlmResponse, void> {
    this.maybeAppendUserContent(llmRequest)
    const requested = llmRequest.config?.responseJsonSchema
    const schema = isRecord(requested) ? requested : undefined
    const strict = schema !== undefined && this.profile?.structuredOutput === 'json_schema_strict'
    const body = JSON.stringify(this.requestBody(llmRequest, schema, strict))
    const { status, result } = await this.post(body, llmRequest.config?.abortSignal)
    yield this.toResponse(result, status, schema, strict)
  }

  private async post(
    body: string,
    signal: AbortSignal | undefined
  ): Promise<{ status: number; result: ChatCompletionsResponse | undefined }> {
    let response: Response
    let text: string
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs)
      })
      text = await response.text()
    } catch (error) {
      // A cancelled hedge loser or turn is the caller's own decision, not a provider failure.
      if (signal?.aborted) throw error
      throw this.fail('network', `${this.label} request failed: ${errorText(error)}`, { cause: error })
    }
    if (!response.ok) {
      throw this.fail(httpFailureKind(response.status, text), `${this.label} ${response.status}: ${text.slice(0, 300)}`, {
        status: response.status,
        retryAfterMs: retryAfterMs(response)
      })
    }
    const parsed = parseJson(text)
    return { status: response.status, result: isRecord(parsed) ? (parsed as ChatCompletionsResponse) : undefined }
  }

  private toResponse(
    result: ChatCompletionsResponse | undefined,
    status: number,
    schema: JsonObject | undefined,
    strict: boolean
  ): LlmResponse {
    const choice = result?.choices?.[0]
    // ModelScope answers json_schema on DeepSeek with HTTP 200 and choices: null (modelscope#1801).
    if (!choice) throw this.fail('transient_http', `${this.label} returned HTTP ${status} with no choices`, { status })
    const message = choice.message
    if (typeof message?.refusal === 'string' && message.refusal.trim()) {
      throw this.fail('refusal', `${this.label} refused the request: ${message.refusal.slice(0, 300)}`)
    }
    const content = typeof message?.content === 'string' ? message.content.trim() : ''
    const text = schema ? structuredText(content, strict ? schema : undefined) : content

    const parts: Part[] = []
    if (text) parts.push({ text })
    for (const toolCall of message?.tool_calls ?? []) {
      const args = parseJson(toolCall.function?.arguments ?? '')
      if (!isRecord(args)) throw this.fail('malformed_tool_args', `${this.label} returned malformed tool arguments`)
      parts.push({
        functionCall: { ...(toolCall.id ? { id: toolCall.id } : {}), name: toolCall.function?.name ?? '', args },
        thoughtSignature: 'skip_thought_signature_validator'
      })
    }
    if (parts.length === 0) parts.push({ text: '' })

    const finishReason =
      choice.finish_reason === 'length'
        ? FinishReason.MAX_TOKENS
        : choice.finish_reason === 'content_filter'
          ? FinishReason.SAFETY
          : FinishReason.STOP
    const usage = result?.usage
    return {
      content: { role: 'model', parts },
      finishReason,
      ...(usage
        ? {
            usageMetadata: {
              promptTokenCount: usage.prompt_tokens,
              candidatesTokenCount: usage.completion_tokens,
              totalTokenCount: usage.total_tokens
            }
          }
        : {})
    }
  }
```

The `functionCalls` array from Task 5 is gone, because calls are pushed straight into `parts`. If no tool call throws, the parts are the same as before.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/agent/ && npm run typecheck`
Expected: PASS, including `fallbackModel.test.ts`, `modelHedge.test.ts`, `modelFallback.test.ts` and `geminiReliability.test.ts`.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/agent/llm/chatCompletionsLlm.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts src/agent/__tests__/fallbackModel.test.ts
git add src/agent/llm/chatCompletionsLlm.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts src/agent/__tests__/fallbackModel.test.ts
git commit -m "feat(agent): classify Chat Completions failures as provider errors"
```

---

### Task 8: Usage and Budget Reservation

Every completed call (a 2xx reply, with or without choices) calls `recordUsage` once, with numbers from the reply's `usage` block (zeros when the block is missing). Before each request, the adapter calls `reserveCall` (contract: Budgets). A denial throws `billing_exhausted` for `monthly` and `quota_exhausted` for the rest, without calling the provider.

**Files:**

- Modify: `src/agent/llm/chatCompletionsLlm.ts`
- Modify (only if Task 1 found no workload accessor): `src/agent/llm/usage.ts`
- Test: `src/agent/llm/__tests__/chatCompletionsLlm.test.ts`

- [ ] **Step 1: Write the failing tests**

At the top of the test file, change the vitest import to `import { beforeEach, describe, expect, it, vi } from 'vitest'`. Add `import { onUsage } from '../usage.js'` and `import type { CallUsage } from '../usage.js'`. Add this below the imports:

```ts
const budget = vi.hoisted(() => ({ release: vi.fn(), reserveCall: vi.fn() }))

vi.mock('../budget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../budget.js')>()),
  reserveCall: budget.reserveCall
}))

beforeEach(() => {
  budget.release.mockReset()
  budget.reserveCall.mockReset()
  budget.reserveCall.mockImplementation(() => ({ release: budget.release }))
})
```

Append:

```ts
describe('ChatCompletionsLlm usage and budget', () => {
  async function usageOf(run: () => Promise<unknown>): Promise<CallUsage[]> {
    const seen: CallUsage[] = []
    const stop = onUsage((usage) => seen.push(usage))
    try {
      await run().catch(() => undefined)
    } finally {
      stop()
    }
    return seen
  }

  it('records the usage block once per call', async () => {
    const seen = await usageOf(() => responses(luna(replay(openai.text).fetchImpl), hello()))

    expect(seen).toEqual([
      {
        provider: 'openai',
        model: 'gpt-6-luna',
        workload: 'reply',
        inputTokens: 120,
        outputTokens: 9,
        reasoningTokens: 0,
        cacheReadTokens: 64
      }
    ])
  })

  it('still counts a 200 that brought no choices, and nothing for a call that failed before answering', async () => {
    const deepseek = onModelScope('deepseek-ai/DeepSeek-V4.1-Flash', replay(modelscope.deepseekChoicesNull).fetchImpl)

    expect(await usageOf(() => responses(deepseek, hello()))).toEqual([
      {
        provider: 'modelscope',
        model: 'deepseek-ai/DeepSeek-V4.1-Flash',
        workload: 'reply',
        inputTokens: 0,
        outputTokens: 0
      }
    ])
    expect(await usageOf(() => responses(luna(replay(openai.serverError).fetchImpl), hello()))).toEqual([])
  })

  it('reserves before calling and releases with the recorded usage', async () => {
    await responses(luna(replay(openai.text).fetchImpl), hello())

    expect(budget.reserveCall).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'gpt-6-luna',
      workload: 'reply',
      estTokens: expect.any(Number)
    })
    expect(budget.release).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 120, outputTokens: 9 }))
  })

  it.each([
    ['monthly', 'billing_exhausted'],
    ['rpm', 'quota_exhausted']
  ])('turns a %s denial into %s without calling the provider', async (denied, kind) => {
    budget.reserveCall.mockImplementation(() => ({ denied }))
    const { fetchImpl, calls } = replay(openai.text)

    await expect(responses(luna(fetchImpl), hello())).rejects.toMatchObject({ kind })
    expect(calls).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/agent/llm/__tests__/chatCompletionsLlm.test.ts -t "usage and budget"`
Expected: FAIL. No usage is recorded and `reserveCall` is never called.

- [ ] **Step 3: Add the workload accessor if 1A has none**

Skip this step if Task 1 found how `anthropicLlm.ts` learns its workload. Otherwise add to `src/agent/llm/usage.ts`:

```ts
import { AsyncLocalStorage } from 'node:async_hooks'

export const workloadForRequest = new AsyncLocalStorage<Workload>()

/** Replies run outside any store; a background job wraps its call in workloadForRequest.run. */
export function currentWorkload(): Workload {
  return workloadForRequest.getStore() ?? 'reply'
}
```

List this as a contract gap in the PR description.

- [ ] **Step 4: Implement**

In `src/agent/llm/chatCompletionsLlm.ts`, add these imports, using 1A's accessor name if it differs:

```ts
import { GEMINI_IMAGE_TOKENS } from '../attachmentLimits.js'
import { reserveCall } from './budget.js'
import { currentWorkload, recordUsage } from './usage.js'
import type { CallUsage, Workload } from './usage.js'
```

Add these module-level helpers:

```ts
/** Image data URLs are base64 bytes, not text, so each counts at the flat per-image rate instead. */
function estimateTokens(body: string): number {
  let images = 0
  const text = body.replace(/data:image\/[^"]*/g, () => {
    images++
    return ''
  })
  return Math.ceil(text.length / 4) + images * GEMINI_IMAGE_TOKENS
}

function callUsage(
  provider: ChatCompletionsProvider,
  model: string,
  workload: Workload,
  usage: ChatCompletionsResponse['usage']
): CallUsage {
  const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens
  const cacheReadTokens = usage?.prompt_tokens_details?.cached_tokens
  return {
    provider,
    model,
    workload,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens })
  }
}
```

Replace `generateContentAsync` with:

```ts
  async *generateContentAsync(llmRequest: LlmRequest, _stream?: boolean): AsyncGenerator<LlmResponse, void> {
    this.maybeAppendUserContent(llmRequest)
    const requested = llmRequest.config?.responseJsonSchema
    const schema = isRecord(requested) ? requested : undefined
    const strict = schema !== undefined && this.profile?.structuredOutput === 'json_schema_strict'
    const body = JSON.stringify(this.requestBody(llmRequest, schema, strict))
    const workload = currentWorkload()
    const reservation = reserveCall({ provider: this.provider, model: this.model, workload, estTokens: estimateTokens(body) })
    if ('denied' in reservation) {
      throw this.fail(
        reservation.denied === 'monthly' ? 'billing_exhausted' : 'quota_exhausted',
        `${this.label} ${reservation.denied} budget for ${this.model} is spent`
      )
    }
    let usage: CallUsage | undefined
    try {
      const { status, result } = await this.post(body, llmRequest.config?.abortSignal)
      usage = callUsage(this.provider, this.model, workload, result?.usage)
      recordUsage(usage)
      yield this.toResponse(result, status, schema, strict)
    } finally {
      reservation.release(usage)
    }
  }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/agent/ && npm run typecheck`
Expected: PASS. If `src/agent/__tests__/fallbackModel.test.ts` now fails at import, the cause is its hoisted `configState` mock missing a field that `usage.ts` or `budget.ts` reads at import. Add only that field to `configState`, with the value `config.yml` gives it.

- [ ] **Step 6: Commit**

```bash
npx biome check --write src/agent/llm/chatCompletionsLlm.ts src/agent/llm/usage.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts
git add src/agent/llm/chatCompletionsLlm.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts
git add src/agent/llm/usage.ts src/agent/__tests__/fallbackModel.test.ts  # only if Step 3 or Step 5 changed them
git commit -m "feat(agent): record Chat Completions usage and reserve each call"
```

---

### Task 9: Wire OpenAI and ModelScope Models Into Config and `createLlm`

**Files:**

- Modify: `src/agent/llm/createModel.ts` (`createLlm`)
- Modify: `src/config.ts` (only if Task 1 found no `OPENAI_API_KEY` mapping)
- Modify: `config.yml` (`llm.models`), `.env.example`, `tests/vitest.setup.ts`
- Test: `src/__tests__/config.test.ts`, `src/__tests__/vitestEnvironment.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/vitestEnvironment.test.ts`, add after the `MODELSCOPE_API_KEY` line:

```ts
expect(process.env.OPENAI_API_KEY).toBe('')
```

In `src/__tests__/config.test.ts`, add `import type { LlmRequest } from '@google/adk'` to the imports. Then add this block inside `describe('config module', ...)`, just before its final `})`, so it can use `withYamlOverride`, `setRequiredEnvVars` and `clearTunableEnvVars`:

```ts
describe('Chat Completions models', () => {
  const LUNA = { provider: 'openai', model: 'gpt-6-luna', effort: 'none' }

  beforeEach(() => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('LLM_MAIN', '')
    vi.stubEnv('LLM_FALLBACK', '')
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('MODELSCOPE_API_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves gpt-6-luna from OPENAI_API_KEY and builds it on the Chat Completions adapter', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'openai-test-key')
    withYamlOverride({ llm: { main: 'luna', fallback: null, models: { luna: LUNA } } })

    const { config } = await import('../config.js')
    const { createLlm } = await import('../agent/llm/createModel.js')
    const { ChatCompletionsLlm } = await import('../agent/llm/chatCompletionsLlm.js')

    expect(config.llm.main).toMatchObject({
      key: 'luna',
      provider: 'openai',
      model: 'gpt-6-luna',
      apiKey: 'openai-test-key',
      effort: 'none'
    })
    expect(config.llm.fallback).toBeNull()
    const main = createLlm(config.llm.main)
    expect(main).toBeInstanceOf(ChatCompletionsLlm)
    expect(main.model).toBe('gpt-6-luna')
  })

  it('stops startup when an openai model has no OPENAI_API_KEY', async () => {
    withYamlOverride({ llm: { main: 'luna', fallback: null, models: { luna: LUNA } } })

    await expect(import('../config.js')).rejects.toThrow(/OPENAI_API_KEY/)
  })

  it.each([
    ['qwen', 'Qwen/Qwen3.5-35B-A3B'],
    ['deepseek', 'deepseek-ai/DeepSeek-V4.1-Flash']
  ])('refuses the unverified %s candidate as main until the probe passes', async (key, model) => {
    vi.stubEnv('MODELSCOPE_API_KEY', 'modelscope-test-key')
    withYamlOverride({ llm: { main: key, fallback: null, models: { [key]: { provider: 'modelscope', model } } } })

    await expect(import('../config.js')).rejects.toThrow(new RegExp(`${key}|${model.replaceAll('.', '\\.')}`))
  })

  it('keeps the legacy fallback and its exact ModelScope request when there is no llm block', async () => {
    vi.stubEnv('MODELSCOPE_API_KEY', 'modelscope-test-key')
    withYamlOverride({ llm: undefined })
    const calls: Array<{ input: unknown; init?: RequestInit }> = []
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
    })

    const { config } = await import('../config.js')
    const { createLlm } = await import('../agent/llm/createModel.js')
    const { ChatCompletionsLlm } = await import('../agent/llm/chatCompletionsLlm.js')

    expect(config.llm.main).toMatchObject({ provider: 'gemini' })
    expect(config.llm.fallback).toMatchObject({ provider: 'modelscope', model: 'Qwen/Qwen3.5-122B-A10B' })
    const fallback = createLlm(config.llm.fallback!)
    expect(fallback).toBeInstanceOf(ChatCompletionsLlm)
    const llmRequest = {
      model: 'roka',
      contents: [{ role: 'user', parts: [{ text: 'hi' }, { inlineData: { mimeType: 'image/png', data: 'AA==' } }] }],
      config: {},
      toolsDict: {},
      liveConnectConfig: undefined
    } as unknown as LlmRequest
    const texts: string[] = []
    for await (const response of fallback.generateContentAsync(llmRequest))
      texts.push(response.content?.parts?.[0]?.text ?? '')

    expect(texts).toEqual(['ok'])
    expect(calls[0]?.input).toBe('https://api-inference.modelscope.ai/v1/chat/completions')
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer modelscope-test-key')
    const body = JSON.parse(calls[0]?.init?.body as string) as Record<string, unknown>
    expect(body).toMatchObject({
      model: 'Qwen/Qwen3.5-122B-A10B',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hi' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }
          ]
        }
      ],
      enable_thinking: false,
      stream: false
    })
    for (const field of ['reasoning_effort', 'max_completion_tokens', 'response_format']) {
      expect(body).not.toHaveProperty(field)
    }
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/config.test.ts src/__tests__/vitestEnvironment.test.ts`
Expected: FAIL. `OPENAI_API_KEY` is `undefined` rather than `''`. `createLlm` for `openai` does not return a `ChatCompletionsLlm`; 1A throws or returns something else. The candidate and legacy tests may already pass, because they lock in behaviour that 1A and Tasks 2–3 already give.

- [ ] **Step 3: Implement**

1. In `src/agent/llm/createModel.ts`, add `import { ChatCompletionsLlm } from './chatCompletionsLlm.js'`. Replace 1A's `openai` and `modelscope` branches of `createLlm` (a `throw` or a `new ModelScopeLlm(...)`) with:

   ```ts
       case 'openai':
       case 'modelscope':
         return new ChatCompletionsLlm({ ...resolved, provider: resolved.provider })
   ```

   Remove the `ModelScopeLlm` import from `createModel.ts` if nothing else in it uses it.

2. Only if Task 1 found no mapping: in `src/config.ts`, add `openai: 'OPENAI_API_KEY'` to the provider-to-env-key map, next to 1A's `anthropic: 'ANTHROPIC_API_KEY'`.
3. In `tests/vitest.setup.ts`, add after the `MODELSCOPE_API_KEY` line:

   ```ts
   process.env.OPENAI_API_KEY = ''
   ```

4. In `.env.example`, replace the `MODELSCOPE_API_KEY` comment block and add `OPENAI_API_KEY` after it:

   ```dotenv
   # Optional: ModelScope API-Inference token. It funds the legacy Qwen fallback (Qwen/Qwen3.5-122B-A10B), the qwen
   # media watcher, and any llm.models entry with provider: modelscope (Qwen and DeepSeek share one Magicube balance)
   MODELSCOPE_API_KEY=

   # Optional: OpenAI API key, required only when llm.main or llm.fallback names a provider: openai model (gpt-6-luna)
   OPENAI_API_KEY=
   ```

5. In `config.yml`, under the `llm.models` map that 1A added, add these entries next to `haiku`, in the same form as 1A's entries (commented out or live). Leave `llm.main` and `llm.fallback` as 1A set them. If 1A validates every `llm.models` entry at startup, not only the selected ones, keep `qwen` and `deepseek` commented out so the unverified profiles cannot stop startup.

   ```yaml
   luna: { provider: openai, model: gpt-6-luna, effort: none } # OpenAI budget model; Chat Completions takes tools only at effort none; needs OPENAI_API_KEY
   qwen: { provider: modelscope, model: Qwen/Qwen3.5-35B-A3B } # ModelScope candidate, refused until scripts/probe-llm-profile.ts verifies it; needs MODELSCOPE_API_KEY
   deepseek: { provider: modelscope, model: deepseek-ai/DeepSeek-V4.1-Flash } # ModelScope candidate, refused until the probe verifies it; shares qwen's Magicube balance
   ```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/__tests__/ src/agent/ && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/agent/llm/createModel.ts src/config.ts src/__tests__/config.test.ts src/__tests__/vitestEnvironment.test.ts tests/vitest.setup.ts
npx prettier --write config.yml
git add src/agent/llm/createModel.ts src/__tests__/config.test.ts src/__tests__/vitestEnvironment.test.ts tests/vitest.setup.ts .env.example config.yml
git add src/config.ts  # only if Step 3.2 changed it
git commit -m "feat(config): route openai and modelscope models to the Chat Completions adapter"
```

---

### Task 10: Routing Matrix

The 20 ordered pairs of distinct brains across gemini, anthropic, openai, qwen and deepseek, plus each brain with no fallback. Each case runs offline through `RoutedLlm` and the turn ladder (`runTurnWithReliability`). Gemini and Anthropic are scripted `BaseLlm` doubles, since 1A tests their adapters. The three Chat Completions brains are real `ChatCompletionsLlm` instances on a stubbed `fetch`.

**Files:**

- Create: `src/agent/llm/__tests__/routingMatrix.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { BaseLlm } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { describe, expect, it } from 'vitest'
import { RoutedLlm, modelRouteForRequest } from '../../fallbackModel.js'
import type { ModelRoute } from '../../fallbackModel.js'
import { runTurnWithReliability } from '../../reliability.js'
import { ChatCompletionsLlm } from '../chatCompletionsLlm.js'
import type { ChatCompletionsProvider } from '../chatCompletionsLlm.js'
import { profileFor } from '../profiles.js'
import { ProviderError } from '../providerError.js'

type Brain = 'gemini' | 'anthropic' | 'openai' | 'qwen' | 'deepseek'

const BRAINS: Brain[] = ['gemini', 'anthropic', 'openai', 'qwen', 'deepseek']
const CHAT_COMPLETIONS: Partial<Record<Brain, { provider: ChatCompletionsProvider; model: string }>> = {
  openai: { provider: 'openai', model: 'gpt-6-luna' },
  qwen: { provider: 'modelscope', model: 'Qwen/Qwen3.5-35B-A3B' },
  deepseek: { provider: 'modelscope', model: 'deepseek-ai/DeepSeek-V4.1-Flash' }
}
const PAIRS = BRAINS.flatMap((main) =>
  BRAINS.filter((fallback) => fallback !== main).map((fallback): [Brain, Brain] => [main, fallback])
)
const FAILURE_REPLY = 'in-character failure reply'

/** Gemini and Anthropic have their own adapter suites; here they only answer or fail the way an adapter does. */
class ScriptedLlm extends BaseLlm {
  calls = 0

  constructor(
    private readonly brain: Brain,
    private readonly healthy: boolean
  ) {
    super({ model: `${brain}-model` })
  }

  async *generateContentAsync(): AsyncGenerator<LlmResponse, void> {
    this.calls++
    if (!this.healthy) {
      throw new ProviderError({
        provider: this.brain === 'gemini' ? 'gemini' : 'anthropic',
        kind: 'transient_http',
        message: `${this.brain} 503: overloaded`,
        status: 503
      })
    }
    yield { content: { role: 'model', parts: [{ text: `${this.brain} answer` }] } }
  }

  connect(): Promise<BaseLlmConnection> {
    throw new Error('ScriptedLlm does not support live connections')
  }
}

function side(brain: Brain, healthy: boolean): { llm: BaseLlm; calls: () => number } {
  const target = CHAT_COMPLETIONS[brain]
  if (!target) {
    const scripted = new ScriptedLlm(brain, healthy)
    return { llm: scripted, calls: () => scripted.calls }
  }
  let calls = 0
  const fetchImpl: typeof fetch = async () => {
    calls++
    return healthy
      ? Response.json({
          choices: [{ message: { content: `${brain} answer` }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
        })
      : Response.json({ error: { message: 'busy' } }, { status: 503 })
  }
  const llm = new ChatCompletionsLlm({
    ...target,
    apiKey: 'test-key',
    timeoutMs: 2000,
    profile: profileFor(target.provider, target.model),
    fetchImpl
  })
  return { llm, calls: () => calls }
}

function hello(signal: AbortSignal): LlmRequest {
  return {
    model: 'roka',
    contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    config: { abortSignal: signal },
    toolsDict: {},
    liveConnectConfig: undefined
  } as unknown as LlmRequest
}

/** One turn as roka.ts runs it: the ladder retries, and switchModel moves the rest of the turn to the fallback. */
async function runTurn(routed: RoutedLlm) {
  const route: ModelRoute = { useFallback: false, hedged: false, answeredBy: null, pinned: null }
  const result = await modelRouteForRequest.run(route, () =>
    runTurnWithReliability({
      runTurn: async (_attempt, signal) => {
        let text = ''
        for await (const response of routed.generateContentAsync(hello(signal))) {
          text += (response.content?.parts ?? []).map((part) => part.text ?? '').join('')
        }
        return { text, hasText: text.length > 0, hasFunctionCall: false }
      },
      switchModel: () => {
        if (!routed.hasFallback) return undefined
        route.useFallback = true
        return 2000
      },
      tryConsumeRetry: () => true,
      computeBackoff: () => 0,
      sleep: async () => {},
      isShuttingDown: () => false,
      maxRetries: 1,
      retryBackoffCapMs: 12_000,
      genericFallback: FAILURE_REPLY,
      safetyDeflection: 'safety deflection',
      recitationDeflection: 'recitation deflection',
      terminalDeflection: 'terminal deflection'
    })
  )
  return { result, route }
}

describe('routing across every provider', () => {
  it('covers all 20 ordered main and fallback pairs', () => {
    expect(PAIRS).toHaveLength(20)
  })

  describe.each(PAIRS)('main %s with fallback %s', (main, fallback) => {
    it('answers from the main model while it is healthy', async () => {
      const primary = side(main, true)
      const backup = side(fallback, true)

      const { result, route } = await runTurn(new RoutedLlm(primary.llm, backup.llm, 0))

      expect(result).toMatchObject({ success: true, text: `${main} answer`, attempts: 1 })
      expect(route.answeredBy).toBe('main')
      expect(backup.calls()).toBe(0)
    })

    it('moves the turn to the fallback after a main outage', async () => {
      const primary = side(main, false)
      const backup = side(fallback, true)

      const { result, route } = await runTurn(new RoutedLlm(primary.llm, backup.llm, 0))

      expect(result).toMatchObject({ success: true, text: `${fallback} answer`, attempts: 2 })
      expect(route.answeredBy).toBe('fallback')
      expect([primary.calls(), backup.calls()]).toEqual([1, 1])
    })
  })

  describe.each(BRAINS)('main %s with no fallback', (main) => {
    it('answers from the main model', async () => {
      const { result, route } = await runTurn(new RoutedLlm(side(main, true).llm, null, 0))

      expect(result).toMatchObject({ success: true, text: `${main} answer` })
      expect(route.answeredBy).toBe('main')
    })

    it('retries the outage once, then sends the in-character failure reply', async () => {
      const primary = side(main, false)

      const { result } = await runTurn(new RoutedLlm(primary.llm, null, 0))

      expect(result).toMatchObject({ success: false, kind: 'transient_http', text: FAILURE_REPLY, attempts: 2 })
      expect(primary.calls()).toBe(2)
    })
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/agent/llm/__tests__/routingMatrix.test.ts`
Expected: PASS (51 tests). This task adds coverage, not behaviour. If a pair fails, the bug is in an adapter or in `RoutedLlm`: fix the code, not the test. If the failure is a type or shape mismatch with 1A's `ModelRoute` or `RoutedLlm`, adjust the route literal or the constructor call as the Task 1 table says.

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npx biome check --write src/agent/llm/__tests__/routingMatrix.test.ts
git add src/agent/llm/__tests__/routingMatrix.test.ts
git commit -m "test(agent): route every main and fallback pair through RoutedLlm and the ladder"
```

---

### Task 11: Media Watcher Credentials

The Qwen watcher stops borrowing `config.fallback`'s key and URL. Each watcher runs only when its own key is present: Gemini needs `GEMINI_API_KEY` (conditional once 1B lands), and Qwen needs `MODELSCOPE_API_KEY`. With the legacy config, both values match today's, so the watch order does not change.

**Files:**

- Modify: `src/config.ts:270-277` (`media.qwen`)
- Modify: `src/agent/media/turnMedia.ts:393-402` (`watcherOrder`), `:644-646` (`watchFramesWithQwen` settings)
- Test: `src/agent/media/__tests__/turnMedia.test.ts`, `src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/agent/media/__tests__/turnMedia.test.ts`:

1. In `mocks` (line 5), add `geminiKey: 'gemini-test-key' as string | undefined,` after `qwenKey`.
2. In the config mock (lines 32–68), delete the `get fallback() { ... }` getter. Add a Gemini key getter:

   ```ts
       gemini: {
         maxAttachmentTokens: 50_000,
         get apiKey() {
           return mocks.geminiKey
         },
         get maxLlmCalls() {
           return mocks.maxLlmCalls
         }
       },
   ```

   In `media.qwen`, add `apiKey: mocks.qwenKey,` and `baseUrl: 'https://modelscope.test/v1',` before `model`.

3. In the top-level `beforeEach` (line 190), add `mocks.geminiKey = 'gemini-test-key'`.
4. In `describe('the qwen watcher', ...)`, after `'watches with Qwen while turns are pinned to the fallback model instead of skipping the video'`, add:

   ```ts
   it('watches with Qwen on its own ModelScope key when there is no Gemini key', async () => {
     mocks.geminiKey = undefined

     const result = await prepareTurnMedia(input([upload]))

     expect(mocks.watchMedia).not.toHaveBeenCalled()
     expect(mocks.watchFramesWithQwen).toHaveBeenCalledTimes(1)
     expect(mocks.watchFramesWithQwen.mock.calls[0][1]).toMatchObject({
       apiKey: 'ms-key',
       baseUrl: 'https://modelscope.test/v1'
     })
     expect(result.watchOutcome).toMatchObject({ status: 'watched' })
   })
   ```

it('gives the notice when neither watcher has a key', async () => {
mocks.geminiKey = undefined
mocks.qwenKey = undefined

    const result = await prepareTurnMedia(input([upload]))

    expect(mocks.watchMedia).not.toHaveBeenCalled()
    expect(mocks.watchFramesWithQwen).not.toHaveBeenCalled()
    expect(result.mediaTextParts[0].text).toContain("couldn't be watched right now")

})

````

In `src/__tests__/config.test.ts`, inside `describe('Chat Completions models', ...)` from Task 9, add:

```ts
 it('gives the qwen watcher its own ModelScope key, whatever the fallback model is', async () => {
   vi.stubEnv('MODELSCOPE_API_KEY', 'modelscope-test-key')
   withYamlOverride({
     llm: { main: 'flash', fallback: null, models: { flash: { provider: 'gemini', model: 'gemini-3.5-flash-lite' } } }
   })

   const { config } = await import('../config.js')

   expect(config.llm.fallback).toBeNull()
   expect(config.media.qwen).toMatchObject({
     apiKey: 'modelscope-test-key',
     baseUrl: 'https://api-inference.modelscope.ai/v1'
   })
 })
````

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/agent/media/__tests__/turnMedia.test.ts src/__tests__/config.test.ts`
Expected: FAIL. Every Qwen test throws a `TypeError` reading `apiKey` of the now-missing `config.fallback`. The no-Gemini-key test calls `watchMedia`. `config.media.qwen.apiKey` is `undefined`.

- [ ] **Step 3: Implement**

In `src/config.ts`, change the start of `media.qwen` to:

```ts
    qwen: {
      apiKey: envString('MODELSCOPE_API_KEY'),
      // Read from the legacy fallback block so a custom ModelScope endpoint still reaches the watcher.
      baseUrl: yaml.fallback?.baseUrl ?? 'https://api-inference.modelscope.ai/v1',
      model: envString('MEDIA_QWEN_MODEL') ?? yaml.media?.qwen?.model ?? 'Qwen/Qwen3.5-35B-A3B',
```

In `src/agent/media/turnMedia.ts`, replace the comment and body of `watcherOrder` (lines 393–402) with:

```ts
// Whichever watcher is not configured is the backup, and each runs only on its own key. Gemini is skipped while turns
// are pinned to the fallback model, since waiting on it would only add delay; Qwen hears audio only through the
// transcriber.
function watcherOrder(kind: MediaKind, geminiUnavailable?: boolean): Array<'gemini' | 'qwen'> {
  const order: Array<'gemini' | 'qwen'> = config.media.watcher === 'qwen' ? ['qwen', 'gemini'] : ['gemini', 'qwen']
  return order.filter((watcher) =>
    watcher === 'gemini'
      ? Boolean(config.gemini.apiKey) && !geminiUnavailable
      : Boolean(config.media.qwen.apiKey) && (kind === 'video' || Boolean(config.media.transcriber.url))
  )
}
```

In `watchWithQwen`, replace

```ts
      apiKey: config.fallback.apiKey,
      baseUrl: config.fallback.baseUrl,
```

with

```ts
      apiKey: config.media.qwen.apiKey,
      baseUrl: config.media.qwen.baseUrl,
```

Then run `grep -n "config.fallback" src/agent/media/` and confirm there are no matches.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/agent/media/ src/__tests__/ && npm run typecheck`
Expected: PASS. The existing Qwen tests pass unchanged on `media.qwen` credentials.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/config.ts src/agent/media/turnMedia.ts src/agent/media/__tests__/turnMedia.test.ts src/__tests__/config.test.ts
git add src/config.ts src/agent/media/turnMedia.ts src/agent/media/__tests__/turnMedia.test.ts src/__tests__/config.test.ts
git commit -m "fix(agent): give the media watchers their own credentials"
```

---

### Task 12: Live Profile Probe

An owner-run script that makes three real calls per named profile (one text reply, one tool call, one JSON object) and reports whether thinking stayed off. It is not a test file, so `npm test` never runs it. It needs `--live` and refuses to run when `CI` is set. Its offline unit test only proves those guards and the pass/fail logic.

**Files:**

- Create: `scripts/probe-llm-profile.ts`
- Create: `scripts/__tests__/probe-llm-profile.test.ts`
- Modify: `tsconfig.test.json` (`include`)

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/probe-llm-profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ChatCompletionsLlm } from '../../src/agent/llm/chatCompletionsLlm.js'
import { profileFor } from '../../src/agent/llm/profiles.js'
import { parseProbeArgs, probeProfile, renderProbeReport } from '../probe-llm-profile.js'

const reply = (message: Record<string, unknown>) => ({
  choices: [{ message, finish_reason: 'stop' }],
  usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }
})
const TEXT = reply({ content: 'pong' })
const TOOL = reply({
  content: null,
  tool_calls: [
    {
      id: 'call_probe',
      type: 'function',
      function: { name: 'get_current_time', arguments: '{"timezone":"Asia/Tokyo"}' }
    }
  ]
})
const OBJECT = reply({ content: '{"city":"Kyoto","population":1460000}' })

function scripted(replies: unknown[]) {
  let last: unknown
  const fetchImpl: typeof fetch = async () => {
    last = replies.shift()
    return Response.json(last)
  }
  const llm = new ChatCompletionsLlm({
    provider: 'modelscope',
    model: 'Qwen/Qwen3.5-35B-A3B',
    apiKey: 'test-key',
    timeoutMs: 1000,
    profile: profileFor('modelscope', 'Qwen/Qwen3.5-35B-A3B'),
    fetchImpl
  })
  const takeBody = () => {
    const body = last
    last = undefined
    return body
  }
  return { llm, takeBody }
}

describe('parseProbeArgs', () => {
  it('refuses to run under CI', () => {
    expect(() => parseProbeArgs(['--live', '--model', 'Qwen/Qwen3.5-35B-A3B'], { CI: 'true' })).toThrow(
      'never runs in CI'
    )
  })

  it('needs --live and at least one model', () => {
    expect(() => parseProbeArgs(['--model', 'Qwen/Qwen3.5-35B-A3B'], {})).toThrow('--live')
    expect(() => parseProbeArgs(['--live'], {})).toThrow('--model')
  })

  it('collects every --model', () => {
    expect(parseProbeArgs(['--live', '--model', 'a', '--model', 'b'], {})).toEqual({ models: ['a', 'b'] })
  })
})

describe('probeProfile', () => {
  it('is ready when the model answers text, calls the tool and returns the object with thinking off', async () => {
    const { llm, takeBody } = scripted([TEXT, TOOL, OBJECT])

    const checks = await probeProfile(llm, takeBody)

    expect(checks.map(({ check, ok, thinkingSeen }) => ({ check, ok, thinkingSeen }))).toEqual([
      { check: 'text', ok: true, thinkingSeen: false },
      { check: 'tool', ok: true, thinkingSeen: false },
      { check: 'json', ok: true, thinkingSeen: false }
    ])
    expect(renderProbeReport('Qwen/Qwen3.5-35B-A3B', checks).ready).toBe(true)
  })

  it('is not ready when thinking comes back or the tool is skipped', async () => {
    const thinking = reply({ content: 'pong', reasoning_content: 'Let me think about pong.' })
    const { llm, takeBody } = scripted([thinking, TEXT, OBJECT])

    const checks = await probeProfile(llm, takeBody)

    expect(checks[0]).toMatchObject({ check: 'text', ok: true, thinkingSeen: true })
    expect(checks[1]).toMatchObject({ check: 'tool', ok: false })
    expect(renderProbeReport('Qwen/Qwen3.5-35B-A3B', checks).ready).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/__tests__/probe-llm-profile.test.ts`
Expected: FAIL, because `../probe-llm-profile.js` cannot be resolved.

- [ ] **Step 3: Write the script**

Create `scripts/probe-llm-profile.ts`:

```ts
/**
 * Live check of a Chat Completions model profile (D12): one text reply, one tool call and one JSON object, plus whether
 * thinking stayed off. It spends real quota (Magicubes on ModelScope, dollars on OpenAI), so it needs --live and
 * refuses to run under CI. When every check passes, set `verified: true` on the profile in src/agent/llm/profiles.ts.
 *
 * Usage: npx tsx scripts/probe-llm-profile.ts --live --model Qwen/Qwen3.5-35B-A3B [--model <model id> ...]
 */
import { pathToFileURL } from 'node:url'
import type { BaseLlm, LlmRequest, LlmResponse } from '@google/adk'
import type { ChatCompletionsProvider } from '../src/agent/llm/chatCompletionsLlm.js'
import type { ModelProfile } from '../src/agent/llm/profiles.js'

export interface ProbeCheck {
  check: 'text' | 'tool' | 'json'
  ok: boolean
  detail: string
  /** The reply carried reasoning_content, so the profile's thinking-off setting did not hold. */
  thinkingSeen: boolean
}

const USAGE = 'Usage: npx tsx scripts/probe-llm-profile.ts --live --model <model id> [--model <model id>]'

export function parseProbeArgs(argv: string[], env: Record<string, string | undefined>): { models: string[] } {
  if (env.CI) throw new Error('probe-llm-profile spends real provider quota and never runs in CI')
  if (!argv.includes('--live')) throw new Error(`Live probing requires --live. ${USAGE}`)
  const models: string[] = []
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--live') continue
    if (argument !== '--model') throw new Error(`Unknown argument: ${argument}. ${USAGE}`)
    const model = argv[++index]
    if (!model) throw new Error(`--model needs a model id. ${USAGE}`)
    models.push(model)
  }
  if (models.length === 0) throw new Error(`Name at least one --model. ${USAGE}`)
  return { models }
}

const TIME_TOOL = {
  functionDeclarations: [
    {
      name: 'get_current_time',
      description: 'Get the current time in an IANA timezone',
      parametersJsonSchema: {
        type: 'object',
        properties: { timezone: { type: 'string', description: 'IANA timezone, for example Asia/Tokyo' } },
        required: ['timezone'],
        additionalProperties: false
      }
    }
  ]
}

const CITY_SCHEMA = {
  type: 'object',
  properties: { city: { type: 'string' }, population: { type: 'integer' } },
  required: ['city', 'population'],
  additionalProperties: false
}

function probeRequest(text: string, config: Record<string, unknown> = {}): LlmRequest {
  return {
    model: 'probe',
    contents: [{ role: 'user', parts: [{ text }] }],
    config: { maxOutputTokens: 200, ...config },
    toolsDict: {},
    liveConnectConfig: undefined
  } as unknown as LlmRequest
}

function textOf(response: LlmResponse): string {
  return (response.content?.parts ?? []).map((part) => part.text ?? '').join('')
}

function thinkingIn(body: unknown): boolean {
  const reasoning = (body as { choices?: Array<{ message?: { reasoning_content?: unknown } }> } | undefined)
    ?.choices?.[0]?.message?.reasoning_content
  return typeof reasoning === 'string' && reasoning.trim().length > 0
}

function judgeText(response: LlmResponse): string | null {
  return textOf(response).trim() ? null : 'empty reply'
}

function judgeTool(response: LlmResponse): string | null {
  const call = response.content?.parts?.find((part) => part.functionCall)?.functionCall
  if (!call) return `no tool call; replied "${textOf(response).slice(0, 120)}"`
  if (call.name !== 'get_current_time' || typeof call.args?.timezone !== 'string') {
    return `unexpected call ${JSON.stringify(call).slice(0, 200)}`
  }
  return null
}

function judgeJson(response: LlmResponse): string | null {
  const text = textOf(response)
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return `not JSON: ${text.slice(0, 200)}`
  }
  const object = value as { city?: unknown; population?: unknown } | null
  return typeof object?.city === 'string' && Number.isInteger(object?.population)
    ? null
    : `wrong shape: ${text.slice(0, 200)}`
}

/** `takeBody` returns the last raw reply body and forgets it, so a failed call never reports an earlier one. */
export async function probeProfile(llm: BaseLlm, takeBody: () => unknown): Promise<ProbeCheck[]> {
  const cases: Array<[ProbeCheck['check'], LlmRequest, (response: LlmResponse) => string | null]> = [
    ['text', probeRequest('Reply with the single word: pong'), judgeText],
    ['tool', probeRequest('What time is it in Tokyo right now? Use the tool.', { tools: [TIME_TOOL] }), judgeTool],
    [
      'json',
      probeRequest('Give the city Kyoto and its population as a JSON object.', { responseJsonSchema: CITY_SCHEMA }),
      judgeJson
    ]
  ]
  const checks: ProbeCheck[] = []
  for (const [check, llmRequest, judge] of cases) {
    let problem: string | null = 'no response'
    try {
      for await (const response of llm.generateContentAsync(llmRequest)) problem = judge(response)
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error)
    }
    checks.push({ check, ok: problem === null, detail: problem ?? 'ok', thinkingSeen: thinkingIn(takeBody()) })
  }
  return checks
}

export function renderProbeReport(model: string, checks: ProbeCheck[]): { text: string; ready: boolean } {
  const ready = checks.length === 3 && checks.every((check) => check.ok && !check.thinkingSeen)
  const lines = [
    model,
    ...checks.map(
      (check) =>
        `  ${check.check.padEnd(4)}  ${check.ok ? 'ok  ' : 'FAIL'}  ${check.thinkingSeen ? 'thinking ON ' : 'thinking off'}  ${check.detail}`
    ),
    ready
      ? '  ready: set verified: true on this profile in src/agent/llm/profiles.ts'
      : '  not ready: keep verified: false'
  ]
  return { text: lines.join('\n'), ready }
}

const KEY_NAMES: Record<ChatCompletionsProvider, string> = {
  openai: 'OPENAI_API_KEY',
  modelscope: 'MODELSCOPE_API_KEY'
}

function isChatCompletionsProfile(
  profile: ModelProfile
): profile is ModelProfile & { provider: ChatCompletionsProvider } {
  return profile.provider === 'openai' || profile.provider === 'modelscope'
}

async function main(): Promise<number> {
  const { models } = parseProbeArgs(process.argv.slice(2), process.env)
  await import('dotenv/config')
  process.env.DISCORD_TOKEN ||= 'probe-unused'
  process.env.DISCORD_CLIENT_ID ||= 'probe-unused'
  process.env.GEMINI_API_KEY ||= 'probe-unused'
  process.env.ROKABOT_DB_PATH = ':memory:'
  process.env.LOG_LEVEL = 'error'
  const [{ ChatCompletionsLlm }, { MODEL_PROFILES }] = await Promise.all([
    import('../src/agent/llm/chatCompletionsLlm.js'),
    import('../src/agent/llm/profiles.js')
  ])

  let allReady = true
  for (const model of models) {
    const profile = MODEL_PROFILES.find((candidate) => candidate.model === model)
    if (!profile || !isChatCompletionsProfile(profile)) {
      process.stderr.write(`${model}: no openai or modelscope profile in src/agent/llm/profiles.ts\n`)
      allReady = false
      continue
    }
    const keyName = KEY_NAMES[profile.provider]
    const apiKey = process.env[keyName]
    if (!apiKey) {
      process.stderr.write(`${model}: ${keyName} is not set\n`)
      allReady = false
      continue
    }
    let lastBody: unknown
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await fetch(input, init)
      lastBody = await response
        .clone()
        .json()
        .catch(() => undefined)
      return response
    }
    const takeBody = () => {
      const body = lastBody
      lastBody = undefined
      return body
    }
    const llm = new ChatCompletionsLlm({
      provider: profile.provider,
      model,
      apiKey,
      timeoutMs: 60_000,
      profile,
      fetchImpl
    })
    const report = renderProbeReport(model, await probeProfile(llm, takeBody))
    process.stdout.write(`${report.text}\n`)
    allReady &&= report.ready
  }
  return allReady ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
```

In `tsconfig.test.json`, change `include` to:

```json
  "include": ["src/**/*", "tests/**/*", "scripts/measure-prefetch.ts", "scripts/probe-llm-profile.ts"],
```

- [ ] **Step 4: Run the test, type-check, and prove the guards**

```bash
npx vitest run scripts/__tests__/probe-llm-profile.test.ts
npm run typecheck
CI=true npx tsx scripts/probe-llm-profile.ts --live --model Qwen/Qwen3.5-35B-A3B; echo "exit $?"
npx tsx scripts/probe-llm-profile.ts --model Qwen/Qwen3.5-35B-A3B; echo "exit $?"
```

Expected: the test passes and the type-check passes. The first script run prints `probe-llm-profile spends real provider quota and never runs in CI` and `exit 1`. The second prints `Live probing requires --live. Usage: …` and `exit 1`. Neither makes a network call. Do not run it with `--live` here; Task 15 is owner-only.

- [ ] **Step 5: Commit**

```bash
npx biome check --write scripts/probe-llm-profile.ts scripts/__tests__/probe-llm-profile.test.ts
npx prettier --write tsconfig.test.json
git add scripts/probe-llm-profile.ts scripts/__tests__/probe-llm-profile.test.ts tsconfig.test.json
git commit -m "feat(agent): add a live probe for Chat Completions model profiles"
```

---

### Task 13: Documentation

**Files:**

- Modify: `docs/trd.md:106` (the watcher sentence), `docs/trd.md:975-1002` (the fallback model section's `Translation` bullet)
- Modify: `docs/runbook.md` (new section after `## Fallback Model`)

- [ ] **Step 1: Update the TRD**

In `docs/trd.md` line 106, replace `on the fallback's ModelScope endpoint.` with:

```markdown
on ModelScope with its own `MODELSCOPE_API_KEY` (`media.qwen.apiKey`), whatever the fallback model is. The Gemini watcher likewise needs `GEMINI_API_KEY`, and a watcher without its key is skipped.
```

In the fallback model section, which 1A may have retitled, replace the `- **Translation:** …` bullet with:

```markdown
- **Translation:** `ChatCompletionsLlm` (`src/agent/llm/chatCompletionsLlm.ts`) turns Gemini-shaped requests into
  OpenAI Chat Completions for `openai` (`https://api.openai.com/v1`) and `modelscope`
  (`https://api-inference.modelscope.ai/v1`); `ModelScopeLlm` is its legacy `modelscope` alias. ModelScope gets
  `enable_thinking: false` (thinking on measured 9–15 s a call) and `max_tokens`. OpenAI gets the profile's
  `reasoning_effort` (`none` for `gpt-6-luna`, the only effort that allows tools on Chat Completions) and
  `max_completion_tokens`. Images pass through as data URLs when the profile reads images; audio, video and PDFs
  become a text marker.
- **Tool Calls:** the provider's call id is kept on the returned call and results pair by id. Only calls that came
  without an id pair by name, since ADK strips its own `adk-` ids before each call. A call with no result is left
  out, because Chat Completions rejects it. Returned calls carry
  `thoughtSignature: 'skip_thought_signature_validator'`, because Gemini rejects an unsigned function call in the
  current turn (400) but accepts the tagged one, so it can read the fallback's history when it recovers.
- **Structured Output:** with `responseJsonSchema` set, a `json_schema_strict` profile sends `response_format.json_schema`
  with `strict: true` (optional fields become required-nullable, `oneOf` becomes `anyOf`, unsupported keywords are
  dropped from the sent schema) and strips those nulls from the reply. A `json_object` profile sends
  `response_format: json_object` with the schema in the system prompt and unwraps a fenced reply.
- **Failures:** every error is a `ProviderError`. A 429 is `quota_exhausted` (spent Magicubes included), or
  `billing_exhausted` for OpenAI's `insufficient_quota`. 5xx and an HTTP 200 with no choices are `transient_http`. An
  over-long request is `context_length`. Unparseable tool arguments are `malformed_tool_args`, and no tool runs. An
  OpenAI refusal is `refusal`, and a transport failure is `network`. The caller's own abort passes through untouched.
  Every 2xx reply records usage once, and every call is reserved through `reserveCall` first.
```

- [ ] **Step 2: Add the runbook section**

In `docs/runbook.md`, after the `## Fallback Model` section, add:

````markdown
## Verifying a Model Profile

`Qwen/Qwen3.5-35B-A3B` and `deepseek-ai/DeepSeek-V4.1-Flash` ship as candidates (`verified: false` in
`src/agent/llm/profiles.ts`), so startup refuses them as `llm.main` or `llm.fallback` until a live probe passes. The
probe makes three calls per model (a text reply, one tool call, one JSON object), about 1.5–6 Magicubes on ModelScope.
It refuses to run when `CI` is set.

```bash
npx tsx scripts/probe-llm-profile.ts --live --model Qwen/Qwen3.5-35B-A3B --model deepseek-ai/DeepSeek-V4.1-Flash
```

It reads `MODELSCOPE_API_KEY`, or `OPENAI_API_KEY` for an `openai` model, from `.env`. A model is ready only when all
three checks pass and no `reasoning_content` came back. Then set `verified: true` on that profile and open a PR with
the probe output in its description.
````

- [ ] **Step 3: Check formatting**

Run: `npx prettier --check docs/trd.md docs/runbook.md`
Expected: PASS. If it fails, run `npx prettier --write docs/trd.md docs/runbook.md` and re-read the changed lines.

- [ ] **Step 4: Commit**

```bash
git add docs/trd.md docs/runbook.md
git commit -m "docs(agent): document the Chat Completions adapter and the profile probe"
```

---

### Task 14: Full Verification

**Files:** none, unless a check fails.

- [ ] **Step 1: Run the full gate**

```bash
npm run lint && npm run format:check && npm run typecheck && npm run build && TZ=UTC npm test && npm run test:perf
```

Expected: every command passes. Never run `npm run test:live`.

- [ ] **Step 2: Confirm the legacy route by reading, not guessing**

```bash
grep -rn "config.fallback" src/agent/media/
TZ=UTC npx vitest run src/agent/__tests__/fallbackModel.test.ts src/__tests__/config.test.ts -t "ModelScopeLlm|legacy"
```

Expected: the `grep` prints nothing. The `ModelScopeLlm` suites and `keeps the legacy fallback and its exact ModelScope request when there is no llm block` pass.

- [ ] **Step 3: Refresh the graph (if `graphify` is installed)**

```bash
which graphify && graphify update . && git status --short graphify-out/
```

If the current graph files changed, commit only `graphify-out/graph.json graph.html GRAPH_REPORT.md manifest.json .graphify_labels.json .graphify_labels.json.sig .graphify_analysis.json`:

```bash
git add graphify-out/graph.json graphify-out/graph.html graphify-out/GRAPH_REPORT.md graphify-out/manifest.json
git commit -m "chore(agent): refresh the graph for the Chat Completions adapter"
```

- [ ] **Step 4: Hand over**

Push and open the PR only with the human's authorization. Follow AGENTS.md: `main` is PR-only, poll the `test` check to a terminal state, and stop and report on failure. List any contract gaps from Task 1 or Task 8 Step 3 in the PR description. Merging redeploys the bot, so it needs the same explicit authorization as a restart.

---

### Task 15: Verify the ModelScope Candidates Live (Owner Only)

This task spends Magicubes and touches the owner's ModelScope account. An agent runs it only after the owner explicitly says so. It ships as its own PR.

**Files:**

- Modify: `src/agent/llm/profiles.ts` (`verified`)
- Modify: `src/agent/llm/__tests__/chatCompletionsLlm.test.ts`, `src/__tests__/config.test.ts` (the candidate expectations)

- [ ] **Step 1: Run the probe**

```bash
npx tsx scripts/probe-llm-profile.ts --live --model Qwen/Qwen3.5-35B-A3B --model deepseek-ai/DeepSeek-V4.1-Flash | tee /tmp/probe-296.txt
```

Expected: one block per model ending `ready: …` or `not ready: …`. Keep `/tmp/probe-296.txt` for the PR description.

- [ ] **Step 2: Flip only the ready profiles**

For each model whose block ends `ready:`, set `verified: true` on it in `src/agent/llm/profiles.ts`. Move that model out of the `verified: false` `it.each` in `chatCompletionsLlm.test.ts`, into its own test that expects `verified: true`. Remove it from `refuses the unverified %s candidate` in `config.test.ts`. If a model shows `thinking ON`, leave it unverified and record which thinking-off parameter it ignored.

- [ ] **Step 3: Run the gate and commit**

```bash
npm run lint && npm run format:check && npm run typecheck && npm run build && TZ=UTC npm test && npm run test:perf
git add src/agent/llm/profiles.ts src/agent/llm/__tests__/chatCompletionsLlm.test.ts src/__tests__/config.test.ts
git commit -m "feat(agent): verify the Qwen3.5-35B-A3B profile on ModelScope"
```

Adjust the message to name the profiles actually verified.

---

## Risks and Open Questions

- **Unwritten 1A:** this plan was written before plan 1A existed. Task 1 maps 1A's real names, with one rule per mismatch. The workload accessor, the request-shaping call site and `ProviderError` field visibility are the likeliest mismatches.
- **Unverified ModelScope Behaviour:** several things are unknown: DeepSeek tool calls and `json_object`, whether `enable_thinking: false` turns its thinking off, the status and wording of a spent Magicube balance, and ModelScope's real context and output caps. The profiles use conservative caps and stay `verified: false`. `magicubeExhausted` and `deepseekChoicesNull` are guessed fixtures; replace them with sanitised real bodies the first time they are seen.
- **One Legacy Path Change:** a malformed tool call from the legacy fallback now throws `malformed_tool_args` (the contract's switch-once kind) instead of yielding a response that classified as `empty_text`. It also can no longer win a hedge race as an "answer". Every other legacy request and response is unchanged and covered by tests.
- **`insufficient_quota`:** the brief says "429 → `quota_exhausted`". This plan maps OpenAI's `insufficient_quota` 429 to `billing_exhausted`, the spec's kind for a spent balance, so the route is disabled rather than retried every sticky window. Revert that one line if the owner prefers the brief's literal mapping.
- **Strict Null Stripping:** a key that is optional in one `anyOf` branch and required-nullable in a sibling branch with no `const` discriminator could lose its `null`. 1B's zod re-validation rejects the object and the fallback is tried; no partial write is possible.
- **`geminiUnavailable`:** `roka.ts:321` means "turns pinned to the fallback". Once the main model is not Gemini, that skips the Gemini watcher for the wrong reason. This is 1A's `roka.ts`; this plan does not change it.

## Contract Issues

1. **Workload Propagation:** `recordUsage` needs a `workload`, and `reserveCall` takes one, but the contract does not say how an adapter learns which workload a call belongs to. Suggest pinning `currentWorkload()` (AsyncLocalStorage, default `'reply'`) in `usage.ts`.
2. **Request Shaping Call Site:** "Request shaping (`requestShape.ts`, 1A)" does not say whether the adapter or the router calls it.
3. **Strict Schema Ownership:** 1B's `generateObject` does "per-profile adjustments", and the Adapter Rules give Chat Completions `json_schema` (strict) to plan 2. Who makes optional fields required-nullable and normalises the nulls back is ambiguous. Plan 2 does both in the adapter, idempotently; 1B can skip them.
4. **"Matched by Id, Never by Name":** this cannot hold for every call. ADK strips its own `adk-` ids in `getContents`, so a call that arrives without a provider id reaches the next request id-less. Plan 2 pairs by id whenever an id exists and by name only for id-less calls. The contract wording should allow that.
5. **Budget Denial Kind:** the contract does not map `reserveCall`'s `{ denied }` to a `FailureKind`. Plan 2 uses `monthly` → `billing_exhausted` and the rest → `quota_exhausted`.
6. **`ProviderError` Fields:** the contract gives only the constructor input. Adapters' tests and the ladder need `kind`, `provider`, `status` and `retryAfterMs` readable on the instance.
7. **Legacy Profile Values:** the contract should state that 1A's `Qwen/Qwen3.5-122B-A10B` profile keeps `input.image: true`, no `defaultEffort` and `structuredOutput: 'json_object'`, since anything else changes the legacy fallback's request.
