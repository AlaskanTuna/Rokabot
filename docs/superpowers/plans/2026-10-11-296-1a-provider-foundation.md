# 1A Provider Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Rokabot a provider-neutral model layer (profiles, `ProviderError`, usage, request shaping, an `llm:` config block and a direct Anthropic adapter) while the legacy Gemini + Qwen configuration keeps behaving exactly as today.

**Architecture:** `src/config.ts` resolves `config.llm` (main and optional fallback `ResolvedModel`s) from a new `llm:` block, or synthesises today's Gemini main and ModelScope fallback when the block is absent. `createRokaModel()` (new `src/agent/llm/createModel.ts`) builds one adapter per side (`GeminiLlm`, `AnthropicLlm`, or today's `ModelScopeLlm`) and wraps them in `RoutedLlm`, whose sides are now `main`/`fallback` and which pins a turn to one side when a side replays thinking. Adapters throw `ProviderError` with a `FailureKind`; the reliability ladder switches once on the new kinds and arms the sticky window only for outage-shaped ones.

**Tech Stack:** TypeScript (Node 24, ESM), `@google/adk` 2.2.1, `@google/genai` 2.28, `@anthropic-ai/sdk` 0.133.x (Messages API), better-sqlite3, vitest, Biome + Prettier.

---

## Ground Rules For The Executor

- **Shell:** every command assumes `export PATH=/home/user/.config/nvm/versions/node/v24.21.0/bin:$PATH` and the repository root as the working directory.
- **Branch:** work on a branch from `origin/main`: `git fetch origin && git switch -c feat/296-1a-provider-foundation origin/main` (in a worktree if the main checkout is busy).
- **Commits:** each task ends with a commit step. Commit only if the owner has authorized commits on this branch (AGENTS.md); otherwise stage the files and continue. Messages are single-line Conventional Commits, no body.
- **Formatting:** before every commit run `npx biome check --write <the task's .ts/.json files>` (it fixes import order and formatting); for Markdown/YAML run `npx prettier --write <files>`. lint-staged repeats this on commit.
- **Style:** single quotes (double quotes when a string holds an apostrophe), no semicolons, no trailing commas, 120 columns, comments only for a non-obvious why.
- **Line numbers** refer to `origin/main` at `d57597d`; earlier tasks shift them by a few lines, so match the quoted code, not the number.
- **Never** run `npm run test:live`.

## Legacy Invariant

The checked-in `config.yml` has no active `llm:` block, and the Pi runs it. After every task the existing suites below must stay green unchanged except where a task names an edit, because they encode today's behaviour; the listed new tests prove the invariant explicitly.

| What Stays The Same                                                                                                                    | Proven By                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Config synthesis: Gemini main, Qwen fallback only with `MODELSCOPE_API_KEY`, `gemini.hedgeAfterMs`, `fallback.stickyMs`, env overrides | Task 7 config tests, including "config.yml has no active llm block"                                                    |
| Gemini requests are sent unchanged (sampling, safety, cap, shared `contents`)                                                          | Task 6 `shapeRequest` test, Task 15 `GeminiLlm` test                                                                   |
| ModelScope request and response translation                                                                                            | Existing `src/agent/__tests__/fallbackModel.test.ts` ModelScope suites                                                 |
| Ladder: same kinds switch, same sticky window, same deflections                                                                        | Existing `modelFallback.test.ts`, `reliability.eval.test.ts`; Task 3 "Gemini MALFORMED_FUNCTION_CALL stays empty_text" |
| Hedging per call, including tool round-trips                                                                                           | Existing `modelHedge.test.ts`; Task 11 "keeps hedging every call when pinning is off"                                  |
| Legacy route construction                                                                                                              | Task 15 `createRokaModel` legacy tests                                                                                 |

## File Structure

| File                                                                         | Status | Responsibility                                                                                                       |
| ---------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `src/agent/llm/profiles.ts`                                                  | Create | `ProviderId`, `ModelProfile`, `MODEL_PROFILES` (Gemini flash-lite, Claude Haiku 5.5, legacy Qwen 122B), `profileFor` |
| `src/agent/llm/providerError.ts`                                             | Create | `ProviderError` carrying provider, `FailureKind`, status, retry hint, cause                                          |
| `src/agent/llm/usage.ts`                                                     | Create | `Workload`, `CallUsage`, `recordUsage`, `onUsage`, the workload request label                                        |
| `src/agent/llm/budget.ts`                                                    | Create | `reserveCall` stub (always grants), `grantOrThrow`, `requestTokenEstimate`                                           |
| `src/agent/llm/requestShape.ts`                                              | Create | Shared request readers (system text, declarations, schema conversion, attachment markers) and `shapeRequest`         |
| `src/agent/llm/anthropicLlm.ts`                                              | Create | `AnthropicLlm` (Messages API via `@anthropic-ai/sdk`) and `classifyAnthropicError`                                   |
| `src/agent/llm/createModel.ts`                                               | Create | `GeminiLlm` (ADK Gemini + shaping + usage), `createLlm`, `createRokaModel`                                           |
| `src/agent/llm/__tests__/anthropicFixtures.ts`                               | Create | Sanitised Messages API responses typed against the SDK                                                               |
| `src/agent/llm/__tests__/*.test.ts`                                          | Create | Unit tests for every new module                                                                                      |
| `tests/harness/__tests__/anthropicMain.eval.test.ts`                         | Create | A `main: haiku` reply turn through the real Discord handlers with a mocked SDK                                       |
| `src/agent/geminiReliability.ts`                                             | Modify | New `FailureKind`s; `ProviderError` kinds pass through classification                                                |
| `src/agent/reliability.ts`                                                   | Modify | `SWITCH_KINDS`/`STICKY_KINDS`, deflection text for new kinds, `createRokaModel` import, model name helper            |
| `src/agent/fallbackModel.ts`                                                 | Modify | `RoutedLlm` sides `main`/`fallback`, provider pinning, shared helpers, ModelScope usage; `createRokaModel` moves out |
| `src/agent/roka.ts`                                                          | Modify | Timeouts and sticky window from `config.llm`, pin reset on switch, new metrics fields                                |
| `src/agent/promptAssembler.ts`                                               | Modify | `splitStablePrefix` for the cached core + speech layers                                                              |
| `src/config.ts`                                                              | Modify | `ResolvedModel`, `LlmConfig`, legacy synthesis, `llm:` block, `LLM_MAIN`/`LLM_FALLBACK`, validation, bounds          |
| `config.yml`                                                                 | Modify | Commented `llm:` example (inactive, so the Pi stays legacy)                                                          |
| `src/storage/database.ts`                                                    | Modify | `response_events.provider`, `model_id`, `route_role`, `workload` and their migration                                 |
| `src/storage/metricsStore.ts`                                                | Modify | `ResponseMetrics` route fields; new rows leave the legacy `model` column `NULL`                                      |
| `.env.example`, `tests/vitest.setup.ts`, `package.json`, `package-lock.json` | Modify | `ANTHROPIC_API_KEY`, hermetic test env, SDK dependency                                                               |
| `docs/trd.md`, `docs/runbook.md`                                             | Modify | Model Providers contract, new failure kinds, columns, switching the reply model                                      |

---

### Task 1: Add The Anthropic SDK And Key Placeholders

**Files:**

- Modify: `package.json`, `package-lock.json`
- Modify: `.env.example`
- Modify: `tests/vitest.setup.ts`

- [ ] **Step 1: Confirm the current stable release**

Run: `npm view @anthropic-ai/sdk dist-tags --json`
Expected: `"latest": "0.133.0"` (or a later `0.x`; use whatever `latest` prints in the next step and in this plan's version notes).

- [ ] **Step 2: Install it**

Run: `npm install @anthropic-ai/sdk@0.133.0`
Expected: `package.json` `dependencies` gains `"@anthropic-ai/sdk": "^0.133.0"` and `package-lock.json` changes.

- [ ] **Step 3: Check the ESM entry resolves**

Run: `node -e "import('@anthropic-ai/sdk').then((m) => console.log(typeof m.default, typeof m.APIError, typeof m.APIConnectionError))"`
Expected: `function function function`

- [ ] **Step 4: Document the key**

Append to `.env.example` after the `MODELSCOPE_API_KEY=` block:

```bash

# Optional: Anthropic API key, required only when llm.main or llm.fallback in config.yml uses provider anthropic
ANTHROPIC_API_KEY=
```

- [ ] **Step 5: Keep tests hermetic**

Append to `tests/vitest.setup.ts`:

```ts
process.env.ANTHROPIC_API_KEY = ''
process.env.LLM_MAIN = ''
process.env.LLM_FALLBACK = ''
```

- [ ] **Step 6: Run the suite as a baseline**

Run: `TZ=UTC npm test`
Expected: PASS (same count as `main`).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.example tests/vitest.setup.ts
git commit -m "chore(config): add the Anthropic SDK and an ANTHROPIC_API_KEY placeholder"
```

---

### Task 2: Model Profiles

**Files:**

- Create: `src/agent/llm/profiles.ts`
- Test: `src/agent/llm/__tests__/profiles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { MODEL_PROFILES, profileFor } from '../profiles.js'

describe('model profiles', () => {
  it('ships the three tested profiles this phase needs', () => {
    expect(MODEL_PROFILES.map(({ provider, model, verified }) => ({ provider, model, verified }))).toEqual([
      { provider: 'gemini', model: 'gemini-3.5-flash-lite', verified: true },
      { provider: 'anthropic', model: 'claude-haiku-5-5', verified: true },
      { provider: 'modelscope', model: 'Qwen/Qwen3.5-122B-A10B', verified: true }
    ])
  })

  it('finds a profile by provider and exact model id only', () => {
    expect(profileFor('anthropic', 'claude-haiku-5-5')?.structuredOutput).toBe('forced_tool')
    expect(profileFor('gemini', 'claude-haiku-5-5')).toBeUndefined()
    expect(profileFor('anthropic', 'claude-haiku-5-5-20261007')).toBeUndefined()
  })

  it('gives Haiku low-effort thinking that replays inside a turn, and no sampling parameters', () => {
    const haiku = profileFor('anthropic', 'claude-haiku-5-5')

    expect(haiku?.thinking).toEqual({
      efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'low',
      replayWithinTurn: true
    })
    expect(haiku?.sampling).toEqual({ temperature: false, topP: false })
    expect(haiku?.input).toEqual({ image: true, pdf: true, audio: false, video: false })
    expect(haiku?.maxOutputTokens).toBe(128_000)
  })

  it('keeps Gemini and the ModelScope fallback as today: sampling allowed, no thinking replay', () => {
    for (const profile of [
      profileFor('gemini', 'gemini-3.5-flash-lite'),
      profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B')
    ]) {
      expect(profile?.sampling).toEqual({ temperature: true, topP: true })
      expect(profile?.thinking).toEqual({ efforts: [], replayWithinTurn: false })
    }
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/agent/llm/__tests__/profiles.test.ts`
Expected: FAIL with `Failed to load url ../profiles.js` (module does not exist).

- [ ] **Step 3: Write the module**

`src/agent/llm/profiles.ts` (a pure leaf: `src/config.ts` imports it, so it must import nothing):

```ts
export type ProviderId = 'gemini' | 'anthropic' | 'openai' | 'modelscope'

export interface ModelProfile {
  provider: ProviderId
  model: string
  input: { image: boolean; pdf: boolean; audio: boolean; video: boolean }
  tools: { supported: boolean; parallel: boolean }
  thinking: { efforts: readonly string[]; defaultEffort?: string; replayWithinTurn: boolean }
  sampling: { temperature: boolean; topP: boolean }
  structuredOutput: 'response_json_schema' | 'json_schema_strict' | 'forced_tool' | 'json_object'
  maxOutputTokens: number
  contextWindow: number
  promptCaching: 'implicit' | 'explicit' | 'none'
  tokenCounter: 'gemini' | 'anthropic' | 'estimate'
  /** USD per 1M tokens; 0 for free or quota-billed (ModelScope Magicubes). */
  price: { input: number; output: number; cachedInput?: number }
  /** D12: false means "candidate"; startup rejects it as main or fallback. */
  verified: boolean
}

export const MODEL_PROFILES: readonly ModelProfile[] = [
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    input: { image: true, pdf: true, audio: true, video: true },
    tools: { supported: true, parallel: true },
    thinking: { efforts: [], replayWithinTurn: false },
    sampling: { temperature: true, topP: true },
    structuredOutput: 'response_json_schema',
    maxOutputTokens: 65_536,
    contextWindow: 1_048_576,
    promptCaching: 'implicit',
    tokenCounter: 'gemini',
    price: { input: 0.3, output: 2.5, cachedInput: 0.03 },
    verified: true
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    input: { image: true, pdf: true, audio: false, video: false },
    tools: { supported: true, parallel: true },
    // `none` is this codebase's spelling of thinking disabled, which Haiku 5.5 accepts at effort high or below.
    thinking: {
      efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'low',
      replayWithinTurn: true
    },
    sampling: { temperature: false, topP: false },
    structuredOutput: 'forced_tool',
    maxOutputTokens: 128_000,
    contextWindow: 1_000_000,
    promptCaching: 'explicit',
    tokenCounter: 'anthropic',
    price: { input: 0.1, output: 0.5, cachedInput: 0.01 },
    verified: true
  },
  {
    provider: 'modelscope',
    model: 'Qwen/Qwen3.5-122B-A10B',
    input: { image: true, pdf: false, audio: false, video: false },
    tools: { supported: true, parallel: true },
    thinking: { efforts: [], replayWithinTurn: false },
    sampling: { temperature: true, topP: true },
    structuredOutput: 'json_object',
    maxOutputTokens: 32_768,
    contextWindow: 262_144,
    promptCaching: 'none',
    tokenCounter: 'estimate',
    price: { input: 0, output: 0 },
    verified: true
  }
]

export function profileFor(provider: ProviderId, model: string): ModelProfile | undefined {
  return MODEL_PROFILES.find((profile) => profile.provider === provider && profile.model === model)
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/agent/llm/__tests__/profiles.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/llm/profiles.ts src/agent/llm/__tests__/profiles.test.ts
git commit -m "feat(agent): add tested model profiles for Gemini, Claude Haiku and the ModelScope fallback"
```

---

### Task 3: ProviderError And The New Failure Kinds

**Files:**

- Create: `src/agent/llm/providerError.ts`
- Modify: `src/agent/geminiReliability.ts:1-11` (union), `:57-73` (`result`), `:99-123` (`classifyGeminiFailure`)
- Test: `src/agent/llm/__tests__/providerError.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

import { classifyGeminiFailure } from '../../geminiReliability.js'
import { ErrorRecoveryPlugin } from '../../reliability.js'
import { ProviderError } from '../providerError.js'

describe('ProviderError', () => {
  it('carries the provider, kind, status, retry hint and cause', () => {
    const cause = new Error('upstream')
    const error = new ProviderError({
      provider: 'anthropic',
      kind: 'transient_http',
      message: 'Anthropic 529',
      status: 529,
      retryAfterMs: 2000,
      cause
    })

    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      name: 'ProviderError',
      provider: 'anthropic',
      kind: 'transient_http',
      message: 'Anthropic 529',
      status: 529,
      retryAfterMs: 2000,
      cause
    })
  })
})

describe('classifyGeminiFailure with provider errors', () => {
  it.each([
    ['billing_exhausted', { retryable: false, deflect: true }],
    ['refusal', { retryable: false, deflect: true }],
    ['malformed_tool_args', { retryable: true, deflect: false }],
    ['context_length', { retryable: false, deflect: true }],
    ['transient_http', { retryable: true, deflect: false }]
  ] as const)('returns the own %s kind of a ProviderError unchanged', (kind, flags) => {
    // The message alone would read as terminal, which proves the carried kind wins.
    const error = new ProviderError({ provider: 'anthropic', kind, message: 'Anthropic 400 INVALID_ARGUMENT' })

    expect(classifyGeminiFailure(error)).toEqual({ kind, ...flags })
  })

  it('reads the kind the error plugin carried on a ProviderError turn outcome', () => {
    const outcome = {
      errorCode: 'ProviderError',
      errorMessage: 'Anthropic 400 INVALID_ARGUMENT',
      customMetadata: { reliabilityKind: 'refusal' },
      hasText: false,
      hasFunctionCall: false
    }

    expect(classifyGeminiFailure(outcome).kind).toBe('refusal')
  })

  it('ignores a carried kind on an outcome that did not come from a ProviderError', () => {
    const outcome = {
      errorCode: 'ApiError',
      errorMessage: '503 UNAVAILABLE',
      customMetadata: { reliabilityKind: 'refusal' },
      hasText: false,
      hasFunctionCall: false
    }

    expect(classifyGeminiFailure(outcome).kind).toBe('transient_http')
  })

  it('keeps a MALFORMED_FUNCTION_CALL response classified as empty_text, as today', () => {
    const outcome = {
      errorCode: 'MALFORMED_FUNCTION_CALL',
      errorMessage: 'ModelScope returned malformed tool arguments',
      finishReason: 'MALFORMED_FUNCTION_CALL',
      hasText: false,
      hasFunctionCall: false
    }

    expect(classifyGeminiFailure(outcome).kind).toBe('empty_text')
  })

  it('lets the error plugin hand a ProviderError kind to the ladder', async () => {
    const response = await new ErrorRecoveryPlugin('error-recovery').onModelErrorCallback({
      callbackContext: {},
      llmRequest: {},
      error: new ProviderError({ provider: 'anthropic', kind: 'billing_exhausted', message: 'Anthropic 402' })
    })

    expect(response).toMatchObject({
      errorCode: 'ProviderError',
      customMetadata: { reliabilityKind: 'billing_exhausted' }
    })
    expect(classifyGeminiFailure({ ...response, hasText: false, hasFunctionCall: false }).kind).toBe(
      'billing_exhausted'
    )
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/agent/llm/__tests__/providerError.test.ts`
Expected: FAIL with `Failed to load url ../providerError.js`.

- [ ] **Step 3: Write `src/agent/llm/providerError.ts`**

```ts
import type { FailureKind } from '../geminiReliability.js'
import type { ProviderId } from './profiles.js'

export class ProviderError extends Error {
  readonly provider: ProviderId
  readonly kind: FailureKind
  readonly status?: number
  readonly retryAfterMs?: number

  constructor(input: {
    provider: ProviderId
    kind: FailureKind
    message: string
    status?: number
    retryAfterMs?: number
    cause?: unknown
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause })
    // ErrorRecoveryPlugin turns error.name into the outcome's errorCode, which is how the ladder recognises it.
    this.name = 'ProviderError'
    this.provider = input.provider
    this.kind = input.kind
    this.status = input.status
    this.retryAfterMs = input.retryAfterMs
  }
}
```

- [ ] **Step 4: Extend `src/agent/geminiReliability.ts`**

Add the import at the top of the file:

```ts
import { ProviderError } from './llm/providerError.js'
```

Replace the union at lines 1-11 with:

```ts
export type FailureKind =
  | 'transient_http'
  | 'network'
  | 'empty_text'
  | 'safety'
  | 'recitation'
  | 'session_corrupt'
  /** The key is out of requests for the day. A 429 like every other, and the only one that cannot recover. */
  | 'quota_exhausted'
  /** Provider credit or a local monthly cap is spent; only a ProviderError carries the four kinds below. */
  | 'billing_exhausted'
  | 'refusal'
  | 'malformed_tool_args'
  | 'context_length'
  | 'terminal'
  | 'ok'
```

Replace `result` (lines 57-73) with:

```ts
function result(kind: FailureKind): GeminiFailureResult {
  return {
    kind,
    retryable:
      kind === 'transient_http' ||
      kind === 'network' ||
      kind === 'empty_text' ||
      kind === 'recitation' ||
      kind === 'session_corrupt' ||
      kind === 'malformed_tool_args',
    deflect:
      kind === 'safety' ||
      kind === 'recitation' ||
      kind === 'session_corrupt' ||
      kind === 'terminal' ||
      kind === 'quota_exhausted' ||
      kind === 'billing_exhausted' ||
      kind === 'refusal' ||
      kind === 'context_length'
  }
}
```

In `classifyGeminiFailure` (line 99), make these two edits. First, the first line of the body becomes:

```ts
export function classifyGeminiFailure(input: unknown): GeminiFailureResult {
  if (input instanceof ProviderError) return result(input.kind)

  if (typeof input === 'string') {
```

Second, directly after `const name = stringValue(input.name) ?? ''` add:

```ts
const carried = isRecord(input.customMetadata) ? input.customMetadata.reliabilityKind : undefined
if (errorCode === 'ProviderError' && typeof carried === 'string') return result(carried as FailureKind)
```

- [ ] **Step 5: Run the new and existing classification tests**

Run: `npx vitest run src/agent/llm/__tests__/providerError.test.ts src/agent/__tests__/geminiReliability.test.ts src/agent/__tests__/reliability.eval.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/agent/llm/providerError.ts src/agent/geminiReliability.ts src/agent/llm/__tests__/providerError.test.ts
git commit -m "feat(agent): add ProviderError and the billing, refusal, tool-argument and context failure kinds"
```

---

### Task 4: Switch Policy For The New Kinds

**Files:**

- Modify: `src/agent/reliability.ts:104-122` (`fallbackResult`), `:259-273` (switch condition)
- Test: `src/agent/__tests__/modelFallback.test.ts` (new `describe` after `describe('retry model switching')`)

- [ ] **Step 1: Write the failing test**

In `src/agent/__tests__/modelFallback.test.ts`, change the reliability import to:

```ts
import { STICKY_KINDS, SWITCH_KINDS, __resetModelFallbackForTest, runTurnWithReliability } from '../reliability.js'
```

add `import type { FailureKind } from '../geminiReliability.js'` next to it, and add this block directly before `describe('generateResponse model fallback'`:

```ts
describe('provider failure switching', () => {
  const providerOutcome = (kind: FailureKind) => ({
    errorCode: 'ProviderError',
    errorMessage: `Anthropic ${kind}`,
    customMetadata: { reliabilityKind: kind },
    hasText: false,
    hasFunctionCall: false
  })

  it.each(['billing_exhausted', 'refusal', 'malformed_tool_args', 'context_length'] as const)(
    'switches once on %s without sleeping',
    async (kind) => {
      const runTurn = vi
        .fn()
        .mockResolvedValueOnce(providerOutcome(kind))
        .mockResolvedValueOnce({ text: 'Recovered~', hasText: true, hasFunctionCall: false })
      const switchModel = vi.fn(() => 40)
      const testOptions = reliabilityOptions({ runTurn, switchModel, maxRetries: 0 })

      const result = await runTurnWithReliability(testOptions)

      expect(result).toMatchObject({ success: true, text: 'Recovered~', attempts: 2 })
      expect(switchModel).toHaveBeenCalledWith(kind)
      expect(testOptions.sleep).not.toHaveBeenCalled()
    }
  )

  it('opens the sticky window only for outage-shaped kinds', () => {
    expect([...SWITCH_KINDS].sort()).toEqual([
      'billing_exhausted',
      'context_length',
      'malformed_tool_args',
      'network',
      'quota_exhausted',
      'refusal',
      'transient_http'
    ])
    expect([...STICKY_KINDS].sort()).toEqual(['network', 'quota_exhausted', 'transient_http'])
  })

  it.each([
    ['refusal', safetyDeflection],
    ['billing_exhausted', genericFallback],
    ['context_length', terminalDeflection]
  ] as const)('answers %s in character without a retry when there is no fallback', async (kind, text) => {
    const runTurn = vi.fn().mockResolvedValue(providerOutcome(kind))
    const testOptions = reliabilityOptions({ runTurn })

    const result = await runTurnWithReliability(testOptions)

    expect(result).toMatchObject({ success: false, kind, text, attempts: 1 })
    expect(testOptions.tryConsumeRetry).not.toHaveBeenCalled()
  })

  it('retries malformed tool arguments on the same model when there is no fallback', async () => {
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce(providerOutcome('malformed_tool_args'))
      .mockResolvedValueOnce({ text: 'Second try~', hasText: true, hasFunctionCall: false })

    const result = await runTurnWithReliability(reliabilityOptions({ runTurn }))

    expect(result).toMatchObject({ success: true, text: 'Second try~', attempts: 2 })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/agent/__tests__/modelFallback.test.ts -t "provider failure switching"`
Expected: FAIL (`SWITCH_KINDS` is undefined, and `refusal` is answered with the generic fallback).

- [ ] **Step 3: Implement**

In `src/agent/reliability.ts`, after `let fallbackUntilMs = 0` (line 21) add:

```ts
/** Kinds after which the turn moves to the other model once. Only the outage-shaped ones also open the sticky
 * window: a refusal or a bad tool call says nothing about the next turn, and a spent month is 1D's to disable. */
export const SWITCH_KINDS: ReadonlySet<FailureKind> = new Set<FailureKind>([
  'transient_http',
  'network',
  'quota_exhausted',
  'billing_exhausted',
  'refusal',
  'malformed_tool_args',
  'context_length'
])
export const STICKY_KINDS: ReadonlySet<FailureKind> = new Set<FailureKind>([
  'transient_http',
  'network',
  'quota_exhausted'
])
```

In `fallbackResult` (lines 112-119) replace the `text` expression with:

```ts
const text =
  kind === 'safety' || kind === 'refusal'
    ? options.safetyDeflection
    : kind === 'recitation'
      ? options.recitationDeflection
      : kind === 'terminal' || kind === 'session_corrupt' || kind === 'context_length'
        ? options.terminalDeflection
        : options.genericFallback
```

Replace line 262:

```ts
      (failure.kind === 'transient_http' || failure.kind === 'network' || failure.kind === 'quota_exhausted') &&
```

with:

```ts
      SWITCH_KINDS.has(failure.kind) &&
```

- [ ] **Step 4: Run the reliability suites**

Run: `npx vitest run src/agent/__tests__/modelFallback.test.ts src/agent/__tests__/reliability.eval.test.ts`
Expected: PASS (the existing "does not switch on safety/recitation/terminal/session corruption/empty text" rows still pass).

- [ ] **Step 5: Commit**

```bash
git add src/agent/reliability.ts src/agent/__tests__/modelFallback.test.ts
git commit -m "feat(agent): switch to the fallback once for the new failure kinds without a sticky window"
```

---

### Task 5: Usage Recording And The Budget Stub

**Files:**

- Create: `src/agent/llm/usage.ts`, `src/agent/llm/budget.ts`
- Test: `src/agent/llm/__tests__/usage.test.ts`, `src/agent/llm/__tests__/budget.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/agent/llm/__tests__/usage.test.ts`:

```ts
import type { LlmRequest } from '@google/adk'
import { describe, expect, it, vi } from 'vitest'
import { type CallUsage, WORKLOAD_LABEL, onUsage, recordUsage, workloadOf } from '../usage.js'

const call: CallUsage = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  workload: 'reply',
  inputTokens: 10,
  outputTokens: 5
}

describe('usage', () => {
  it('delivers each recorded call to every listener until it unsubscribes', () => {
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = onUsage(first)
    const stopSecond = onUsage(second)

    recordUsage(call)
    stopFirst()
    recordUsage(call)
    stopSecond()

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledWith(call)
  })

  it('keeps delivering when one listener throws', () => {
    const after = vi.fn()
    const stopBroken = onUsage(() => {
      throw new Error('broken listener')
    })
    const stopAfter = onUsage(after)

    expect(() => recordUsage(call)).not.toThrow()
    expect(after).toHaveBeenCalledOnce()
    stopBroken()
    stopAfter()
  })

  it('reads the workload label and treats an unlabelled ADK request as a reply', () => {
    const labelled = { contents: [], config: { labels: { [WORKLOAD_LABEL]: 'extraction' } } } as unknown as LlmRequest
    const unknown = { contents: [], config: { labels: { [WORKLOAD_LABEL]: 'gossip' } } } as unknown as LlmRequest

    expect(workloadOf(labelled)).toBe('extraction')
    expect(workloadOf(unknown)).toBe('reply')
    expect(workloadOf({ contents: [] } as unknown as LlmRequest)).toBe('reply')
  })
})
```

`src/agent/llm/__tests__/budget.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { grantOrThrow, requestTokenEstimate, reserveCall } from '../budget.js'

const input = { provider: 'anthropic', model: 'claude-haiku-5-5', workload: 'reply', estTokens: 100 } as const

describe('budget stub', () => {
  it('always grants, and the grant accepts the call usage on release', () => {
    const reservation = reserveCall(input)

    expect('denied' in reservation).toBe(false)
    const grant = grantOrThrow('anthropic', reservation)
    expect(() =>
      grant.release({
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        workload: 'reply',
        inputTokens: 1,
        outputTokens: 1
      })
    ).not.toThrow()
  })

  it.each([
    ['monthly', 'billing_exhausted'],
    ['rpm', 'quota_exhausted'],
    ['rpd', 'quota_exhausted'],
    ['tpm', 'quota_exhausted']
  ] as const)('turns a %s denial into a %s ProviderError', (denied, kind) => {
    let caught: unknown
    try {
      grantOrThrow('anthropic', { denied })
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({ name: 'ProviderError', provider: 'anthropic', kind })
  })

  it('estimates tokens without counting inline media bytes', () => {
    const withImage = requestTokenEstimate({
      text: 'hello there',
      inlineData: { mimeType: 'image/png', data: 'A'.repeat(40_000) }
    })

    expect(withImage).toBeLessThan(50)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/agent/llm/__tests__/usage.test.ts src/agent/llm/__tests__/budget.test.ts`
Expected: FAIL with `Failed to load url ../usage.js` / `../budget.js`.

- [ ] **Step 3: Write `src/agent/llm/usage.ts`**

```ts
import type { LlmRequest } from '@google/adk'
import type { ProviderId } from './profiles.js'

export type Workload = 'reply' | 'extraction' | 'reclassify' | 'admission' | 'verification' | 'embedding' | 'watcher'

export interface CallUsage {
  provider: ProviderId
  model: string
  workload: Workload
  /** Uncached input tokens; cache reads and writes are counted on their own. */
  inputTokens: number
  outputTokens: number
  reasoningTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** Background jobs put their workload in `config.labels` under this key; ADK reply requests carry none. */
export const WORKLOAD_LABEL = 'rokabot_workload'

const WORKLOADS: readonly Workload[] = [
  'reply',
  'extraction',
  'reclassify',
  'admission',
  'verification',
  'embedding',
  'watcher'
]
const listeners = new Set<(usage: CallUsage) => void>()

export function recordUsage(usage: CallUsage): void {
  for (const listener of listeners) {
    try {
      listener(usage)
    } catch {
      // A listener's failure must never fail the model call it observes.
    }
  }
}

export function onUsage(listener: (usage: CallUsage) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function workloadOf(llmRequest: LlmRequest): Workload {
  const label = llmRequest.config?.labels?.[WORKLOAD_LABEL]
  return WORKLOADS.find((workload) => workload === label) ?? 'reply'
}
```

- [ ] **Step 4: Write `src/agent/llm/budget.ts`**

```ts
import { estimateTokens } from '../../utils/tokens.js'
import type { ProviderId } from './profiles.js'
import { ProviderError } from './providerError.js'
import type { CallUsage, Workload } from './usage.js'

export interface CallReservation {
  release(usage?: CallUsage): void
}

export interface BudgetDenial {
  denied: 'rpm' | 'rpd' | 'tpm' | 'monthly'
}

/** 1A stub that always grants; 1D replaces it with per-call RPM, TPM and monthly-spend reservations. */
export function reserveCall(_input: {
  provider: ProviderId
  model: string
  workload: Workload
  estTokens: number
}): CallReservation | BudgetDenial {
  return { release: () => {} }
}

export function grantOrThrow(provider: ProviderId, reservation: CallReservation | BudgetDenial): CallReservation {
  if (!('denied' in reservation)) return reservation
  throw new ProviderError({
    provider,
    kind: reservation.denied === 'monthly' ? 'billing_exhausted' : 'quota_exhausted',
    message: `${provider} call denied by the local ${reservation.denied} budget`
  })
}

/** Inline media is left out: its base64 length says nothing about what an image or PDF costs in tokens. */
export function requestTokenEstimate(value: unknown): number {
  return estimateTokens(JSON.stringify(value, (key, child) => (key === 'data' ? undefined : child)) ?? '')
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `npx vitest run src/agent/llm/__tests__/usage.test.ts src/agent/llm/__tests__/budget.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/agent/llm/usage.ts src/agent/llm/budget.ts src/agent/llm/__tests__/usage.test.ts src/agent/llm/__tests__/budget.test.ts
git commit -m "feat(agent): add per-call usage recording and a budget reservation stub"
```

---

### Task 6: Shared Request Reading And Shaping

Moves the request readers `ModelScopeLlm` already uses into a neutral module so `AnthropicLlm` (and plan 2's Chat Completions adapter) reuse them, adds `shapeRequest`, and makes `ModelScopeLlm` record usage. The existing ModelScope translation tests are the regression guard.

**Files:**

- Create: `src/agent/llm/requestShape.ts`
- Modify: `src/agent/fallbackModel.ts:53-123` (helpers move out, `openAiTools` uses `functionDeclarations`), `:314` (usage)
- Test: `src/agent/llm/__tests__/requestShape.test.ts`, `src/agent/__tests__/fallbackModel.test.ts` (one new test)

- [ ] **Step 1: Write the failing tests**

`src/agent/llm/__tests__/requestShape.test.ts`:

```ts
import type { LlmRequest } from '@google/adk'
import { describe, expect, it } from 'vitest'
import { profileFor } from '../profiles.js'
import { functionDeclarations, shapeRequest, systemText } from '../requestShape.js'

const GEMINI = {
  provider: 'gemini',
  profile: profileFor('gemini', 'gemini-3.5-flash-lite')!,
  maxOutputTokens: 500
} as const
const HAIKU = {
  provider: 'anthropic',
  profile: profileFor('anthropic', 'claude-haiku-5-5')!,
  maxOutputTokens: 400
} as const
const SAFETY = [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' }]

function request(config: Record<string, unknown> | undefined): LlmRequest {
  return { model: 'm', contents: [], config, toolsDict: {}, liveConnectConfig: {} } as unknown as LlmRequest
}

describe('shapeRequest', () => {
  it('leaves a Gemini request as today: sampling and safety kept, cap unchanged, contents shared', () => {
    const original = request({ temperature: 0.9, topP: 0.95, maxOutputTokens: 500, safetySettings: SAFETY })

    const shaped = shapeRequest(original, GEMINI)

    expect(shaped.config).toEqual(original.config)
    expect(shaped.contents).toBe(original.contents)
  })

  it('drops sampling and safety for Claude and clamps the output cap to the resolved value', () => {
    const shaped = shapeRequest(
      request({ temperature: 0.9, topP: 0.95, maxOutputTokens: 500, safetySettings: SAFETY, systemInstruction: 'sys' }),
      HAIKU
    )

    expect(shaped.config).toEqual({ maxOutputTokens: 400, systemInstruction: 'sys' })
  })

  it('never raises a lower cap the request asked for, and fills a missing one', () => {
    expect(shapeRequest(request({ maxOutputTokens: 100 }), HAIKU).config?.maxOutputTokens).toBe(100)
    expect(shapeRequest(request({}), HAIKU).config?.maxOutputTokens).toBe(400)
  })

  it('does not mutate the request it shapes', () => {
    const original = request({ temperature: 0.9, maxOutputTokens: 500 })

    shapeRequest(original, HAIKU)

    expect(original.config).toEqual({ temperature: 0.9, maxOutputTokens: 500 })
  })
})

describe('request readers', () => {
  it('reads system text from a string, a part or a content', () => {
    expect(systemText('plain')).toBe('plain')
    expect(systemText({ text: 'part' })).toBe('part')
    expect(systemText({ parts: [{ text: 'a' }, { text: 'b' }] })).toBe('a\nb')
    expect(systemText(undefined)).toBeUndefined()
  })

  it('reads declarations, converting Gemini Schema and passing JSON Schema through', () => {
    const declared = functionDeclarations(
      request({
        tools: [
          {
            functionDeclarations: [
              {
                name: 'roll_dice',
                description: 'Roll',
                parameters: { type: 'OBJECT', properties: { sides: { type: 'INTEGER' } }, propertyOrdering: ['sides'] }
              },
              { name: 'recall_user', parametersJsonSchema: { type: 'object', properties: {} } },
              { name: 'flip_coin' }
            ]
          }
        ]
      })
    )

    expect(declared).toEqual([
      {
        name: 'roll_dice',
        description: 'Roll',
        parameters: { type: 'object', properties: { sides: { type: 'integer' } } }
      },
      { name: 'recall_user', parameters: { type: 'object', properties: {} } },
      { name: 'flip_coin' }
    ])
  })
})
```

Append to the `describe('ModelScopeLlm response translation'` block in `src/agent/__tests__/fallbackModel.test.ts` (add `import { type CallUsage, onUsage } from '../llm/usage.js'` beside the other imports):

```ts
it('records the usage of each call once', async () => {
  const { fetchImpl } = createFetch({
    choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 }
  })
  const seen: CallUsage[] = []
  const stop = onUsage((usage) => seen.push(usage))

  await responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'hello' }] }]))
  stop()

  expect(seen).toEqual([
    { provider: 'modelscope', model: 'Qwen/test-model', workload: 'reply', inputTokens: 120, outputTokens: 8 }
  ])
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/agent/llm/__tests__/requestShape.test.ts src/agent/__tests__/fallbackModel.test.ts`
Expected: FAIL (`../requestShape.js` missing; the usage test sees `[]`).

- [ ] **Step 3: Write `src/agent/llm/requestShape.ts`**

`isRecord`, `attachmentKind`, `attachmentMarker`, `systemText` and `toJsonSchema` are moved verbatim from `src/agent/fallbackModel.ts:53-97`.

```ts
import type { LlmRequest } from '@google/adk'
import type { ModelProfile, ProviderId } from './profiles.js'

type JsonObject = Record<string, unknown>

/** What shaping needs to know about the target; a `ResolvedModel` from `src/config.ts` satisfies it. */
export interface ShapeTarget {
  provider: ProviderId
  profile: ModelProfile
  maxOutputTokens: number
}

export interface DeclaredFunction {
  name: string
  description?: string
  /** JSON Schema; converted from Gemini's Schema when the declaration carries no JSON Schema of its own. */
  parameters?: unknown
}

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function attachmentKind(mimeType: string | undefined): string {
  if (mimeType?.startsWith('audio/')) return 'audio'
  if (mimeType?.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf') return 'PDF'
  return 'file'
}

export function attachmentMarker(kind: string): string {
  return `(a ${kind} attachment that can't be opened right now)`
}

export function systemText(instruction: unknown): string | undefined {
  if (typeof instruction === 'string') return instruction
  if (!isRecord(instruction)) return undefined
  if (typeof instruction.text === 'string') return instruction.text
  const parts = Array.isArray(instruction.parts) ? instruction.parts : []
  const text = parts
    .filter(isRecord)
    .map((part) => (typeof part.text === 'string' ? part.text : undefined))
    .filter((part): part is string => part !== undefined)
    .join('\n')
  return text || undefined
}

function toJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toJsonSchema)
  if (!isRecord(value)) return value

  const schema: JsonObject = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'propertyOrdering') continue
    if (key === 'type' && typeof child === 'string') {
      schema[key] = child.toLowerCase()
    } else if (key === 'type' && Array.isArray(child)) {
      schema[key] = child.map((type) => (typeof type === 'string' ? type.toLowerCase() : type))
    } else {
      schema[key] = toJsonSchema(child)
    }
  }
  return schema
}

export function functionDeclarations(llmRequest: LlmRequest): DeclaredFunction[] {
  return (llmRequest.config?.tools ?? []).flatMap((tool) => {
    const declarationTool = tool as unknown as {
      functionDeclarations?: Array<{
        name?: string
        description?: string
        parameters?: unknown
        parametersJsonSchema?: unknown
      }>
    }
    return (declarationTool.functionDeclarations ?? []).map((declaration) => ({
      name: declaration.name ?? '',
      ...(declaration.description === undefined ? {} : { description: declaration.description }),
      ...(declaration.parametersJsonSchema !== undefined
        ? { parameters: declaration.parametersJsonSchema }
        : declaration.parameters !== undefined
          ? { parameters: toJsonSchema(declaration.parameters) }
          : {})
    }))
  })
}

/** Drops what the target rejects and clamps the output cap; `contents` stays shared, as ADK's Gemini expects. */
export function shapeRequest(llmRequest: LlmRequest, target: ShapeTarget): LlmRequest {
  if (!llmRequest.config) return llmRequest
  const { temperature, topP, safetySettings, maxOutputTokens, ...rest } = llmRequest.config
  return {
    ...llmRequest,
    config: {
      ...rest,
      ...(temperature !== undefined && target.profile.sampling.temperature ? { temperature } : {}),
      ...(topP !== undefined && target.profile.sampling.topP ? { topP } : {}),
      ...(safetySettings !== undefined && target.provider === 'gemini' ? { safetySettings } : {}),
      maxOutputTokens: Math.min(maxOutputTokens ?? target.maxOutputTokens, target.maxOutputTokens)
    }
  }
}
```

- [ ] **Step 4: Point `src/agent/fallbackModel.ts` at the shared module**

1. Delete `isRecord`, `attachmentKind`, `attachmentMarker`, `systemText` and `toJsonSchema` (lines 53-97).
2. Add the imports:

```ts
import { attachmentKind, attachmentMarker, functionDeclarations, isRecord, systemText } from './llm/requestShape.js'
import { recordUsage, workloadOf } from './llm/usage.js'
```

3. Replace `openAiTools` (lines 99-123) with:

```ts
function openAiTools(llmRequest: LlmRequest): ChatMessage[] {
  return functionDeclarations(llmRequest).map((declaration) => ({
    type: 'function',
    function: {
      name: declaration.name,
      ...(declaration.description === undefined ? {} : { description: declaration.description }),
      ...(declaration.parameters === undefined ? {} : { parameters: declaration.parameters })
    }
  }))
}
```

4. In `ModelScopeLlm.generateContentAsync`, directly after `const result = (await response.json()) as ModelScopeResponse` (line 314), add:

```ts
recordUsage({
  provider: 'modelscope',
  model: this.model,
  workload: workloadOf(llmRequest),
  inputTokens: result.usage?.prompt_tokens ?? 0,
  outputTokens: result.usage?.completion_tokens ?? 0
})
```

- [ ] **Step 5: Run the shaping and ModelScope suites**

Run: `npx vitest run src/agent/llm/__tests__/requestShape.test.ts src/agent/__tests__/fallbackModel.test.ts src/agent/__tests__/modelHedge.test.ts`
Expected: PASS (every existing ModelScope request and response test unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/agent/llm/requestShape.ts src/agent/fallbackModel.ts src/agent/llm/__tests__/requestShape.test.ts src/agent/__tests__/fallbackModel.test.ts
git commit -m "refactor(agent): share request reading and shaping helpers across model adapters"
```

---

### Task 7: Legacy LLM Config Synthesis

**Files:**

- Modify: `src/config.ts:1-10` (import), after `:222` (types and `legacyLlm`), `:229-230` and `:394` (config object), `:552` (bounds)
- Test: `src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/config.test.ts`, append to `clearTunableEnvVars` after `vi.stubEnv('SOCIAL_POSTS_ENABLED', '')`:

```ts
vi.stubEnv('ANTHROPIC_API_KEY', '')
vi.stubEnv('LLM_MAIN', '')
vi.stubEnv('LLM_FALLBACK', '')
vi.stubEnv('GEMINI_HEDGE_AFTER_MS', '')
```

In the `bounds every numeric tunable` test, replace the last row `      { path: 'statusCycleMs', min: 1 }` with:

```ts
      { path: 'statusCycleMs', min: 1 },
      { path: 'llm.hedgeAfterMs', min: 0 },
      { path: 'llm.stickyMs', min: 0 }
```

Append inside `describe('config module'`, before its closing `})`:

```ts
it('synthesises the Gemini main and no fallback when config.yml has no llm block', async () => {
  setRequiredEnvVars()
  clearTunableEnvVars()

  const { config } = await import('../config.js')

  expect(config.llm).toMatchObject({
    main: {
      key: 'legacy-gemini',
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      apiKey: 'test-api-key',
      timeoutMs: 20_000,
      maxOutputTokens: 500
    },
    fallback: null,
    hedgeAfterMs: 5000,
    stickyMs: 300_000,
    monthlyBudgetUsd: {}
  })
  expect(config.llm.main.profile).toMatchObject({ provider: 'gemini', model: 'gemini-3.5-flash-lite', verified: true })
  expect(config.llm.main.effort).toBeUndefined()
})

it('synthesises the ModelScope fallback when MODELSCOPE_API_KEY is set', async () => {
  setRequiredEnvVars()
  clearTunableEnvVars()
  vi.stubEnv('MODELSCOPE_API_KEY', 'test-modelscope-key')

  const { config } = await import('../config.js')

  expect(config.llm.fallback).toMatchObject({
    key: 'legacy-fallback',
    provider: 'modelscope',
    model: 'Qwen/Qwen3.5-122B-A10B',
    apiKey: 'test-modelscope-key',
    baseUrl: 'https://api-inference.modelscope.ai/v1',
    timeoutMs: 15_000
  })
  expect(config.llm.fallback?.profile.verified).toBe(true)
})

it('carries the existing env overrides into the legacy route, untested model ids included', async () => {
  setRequiredEnvVars()
  clearTunableEnvVars()
  vi.stubEnv('MODELSCOPE_API_KEY', 'test-modelscope-key')
  vi.stubEnv('GEMINI_MODEL', 'gemini-legacy-test')
  vi.stubEnv('FALLBACK_MODEL', 'Qwen/legacy-test')
  vi.stubEnv('GEMINI_TIMEOUT', '12345')
  vi.stubEnv('GEMINI_HEDGE_AFTER_MS', '0')
  withYamlOverride({ fallback: { stickyMs: 0, timeoutMs: 9000 } })

  const { config } = await import('../config.js')

  expect(config.llm.main).toMatchObject({
    model: 'gemini-legacy-test',
    timeoutMs: 12_345,
    profile: { provider: 'gemini', model: 'gemini-legacy-test' }
  })
  expect(config.llm.fallback).toMatchObject({
    model: 'Qwen/legacy-test',
    timeoutMs: 9000,
    profile: { provider: 'modelscope', model: 'Qwen/legacy-test' }
  })
  expect(config.llm).toMatchObject({ hedgeAfterMs: 0, stickyMs: 0 })
})

it('ships config.yml without an active llm block, so the Pi keeps the synthesised route', async () => {
  const { readFileSync } = await import('node:fs')
  const { load } = await import('js-yaml')

  expect(load(readFileSync('config.yml', 'utf8'))).not.toHaveProperty('llm')
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: FAIL — `config.llm` is undefined, and the bounds list lacks `llm.hedgeAfterMs`/`llm.stickyMs`. (The `config.yml` test already passes.)

- [ ] **Step 3: Implement in `src/config.ts`**

Add after `import { GEMINI_IMAGE_TOKENS } from './agent/attachmentLimits.js'`:

```ts
import { MODEL_PROFILES, type ModelProfile, type ProviderId, profileFor } from './agent/llm/profiles.js'
```

Add after `memoryEnum` (line 222):

```ts
export interface ResolvedModel {
  /** The llm.models key, e.g. 'haiku'; 'legacy-gemini' / 'legacy-fallback' when synthesised. */
  key: string
  provider: ProviderId
  model: string
  profile: ModelProfile
  apiKey: string
  baseUrl?: string
  timeoutMs: number
  maxOutputTokens: number
  effort?: string
  limits?: { rpm?: number; rpd?: number; tpm?: number }
}

export interface LlmConfig {
  main: ResolvedModel
  fallback: ResolvedModel | null
  hedgeAfterMs: number
  stickyMs: number
  monthlyBudgetUsd: Partial<Record<ProviderId, number>>
}

interface LegacyModelSettings {
  gemini: { apiKey: string; model: string; timeout: number; maxOutputTokens: number; hedgeAfterMs: number }
  fallback: { apiKey: string | undefined; model: string; baseUrl: string; timeoutMs: number; stickyMs: number }
}

// Inherits the family's tested capabilities so a GEMINI_MODEL or FALLBACK_MODEL override keeps working as it
// does today; D12's tested-profile rule applies to llm.models entries only.
function legacyProfile(provider: ProviderId, model: string): ModelProfile {
  const family = MODEL_PROFILES.find((profile) => profile.provider === provider)
  if (!family) throw new Error(`No ${provider} profile to synthesise the legacy route from`)
  return profileFor(provider, model) ?? { ...family, model }
}

function legacyLlm(settings: LegacyModelSettings): LlmConfig {
  return {
    main: {
      key: 'legacy-gemini',
      provider: 'gemini',
      model: settings.gemini.model,
      profile: legacyProfile('gemini', settings.gemini.model),
      apiKey: settings.gemini.apiKey,
      timeoutMs: settings.gemini.timeout,
      maxOutputTokens: settings.gemini.maxOutputTokens
    },
    fallback: settings.fallback.apiKey
      ? {
          key: 'legacy-fallback',
          provider: 'modelscope',
          model: settings.fallback.model,
          profile: legacyProfile('modelscope', settings.fallback.model),
          apiKey: settings.fallback.apiKey,
          baseUrl: settings.fallback.baseUrl,
          timeoutMs: settings.fallback.timeoutMs,
          maxOutputTokens: settings.gemini.maxOutputTokens
        }
      : null,
    hedgeAfterMs: settings.gemini.hedgeAfterMs,
    stickyMs: settings.fallback.stickyMs,
    monthlyBudgetUsd: {}
  }
}
```

Replace lines 229-230:

```ts
/** Merged config: env overrides > config.yml > hardcoded defaults */
export const config = {
```

with:

```ts
const baseConfig = {
```

and directly after the object's closing `} as const` (line 394) add:

```ts
/** Merged config: env overrides > config.yml > hardcoded defaults */
export const config = { ...baseConfig, llm: legacyLlm(baseConfig) } as const
```

In `NUMERIC_BOUNDS`, replace the last row `  { path: 'statusCycleMs', value: config.statusCycleMs, min: 1 }` with:

```ts
  { path: 'statusCycleMs', value: config.statusCycleMs, min: 1 },
  { path: 'llm.hedgeAfterMs', value: config.llm.hedgeAfterMs, min: 0 },
  { path: 'llm.stickyMs', value: config.llm.stickyMs, min: 0 }
```

- [ ] **Step 4: Run the config suite**

Run: `npx vitest run src/__tests__/config.test.ts && npm run typecheck`
Expected: PASS (all existing rows, including `fallback.timeoutMs`/`gemini.timeout` error messages, still fire first because the new rows sit last); no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/__tests__/config.test.ts
git commit -m "feat(config): synthesise the llm route from the gemini and fallback settings"
```

---

### Task 8: The `llm:` Block, Env Overrides And Startup Validation

**Files:**

- Modify: `src/config.ts` (`YamlConfig`, new resolver, bounds)
- Modify: `config.yml` (commented example after the `fallback:` block)
- Test: `src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/config.test.ts` add `vi.doUnmock('../agent/llm/profiles.js')` to the existing `afterEach`. Append inside `describe('config module'`:

```ts
const HAIKU_LLM = {
  main: 'haiku',
  models: {
    flash: { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
    haiku: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'low' }
  }
}

it('resolves an anthropic main from the llm block with the paid-route defaults', async () => {
  setRequiredEnvVars()
  clearTunableEnvVars()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
  withYamlOverride({ llm: HAIKU_LLM })

  const { config } = await import('../config.js')

  expect(config.llm).toMatchObject({
    main: {
      key: 'haiku',
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      apiKey: 'test-anthropic-key',
      effort: 'low',
      timeoutMs: 20_000,
      maxOutputTokens: 500
    },
    fallback: null,
    hedgeAfterMs: 0,
    stickyMs: 300_000
  })
  expect(config.llm.monthlyBudgetUsd).toEqual({ anthropic: 5, openai: 5 })
})

it('resolves a fallback, per-model settings and block tunables', async () => {
  setRequiredEnvVars()
  clearTunableEnvVars()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
  withYamlOverride({
    llm: {
      ...HAIKU_LLM,
      fallback: 'flash',
      hedgeAfterMs: 2500,
      stickyMs: 60_000,
      monthlyBudgetUsd: { anthropic: 2 },
      models: {
        ...HAIKU_LLM.models,
        haiku: { ...HAIKU_LLM.models.haiku, timeoutMs: 9000, maxOutputTokens: 800, limits: { rpm: 50 } }
      }
    }
  })

  const { config } = await import('../config.js')

  expect(config.llm.main).toMatchObject({ timeoutMs: 9000, maxOutputTokens: 800, limits: { rpm: 50 } })
  expect(config.llm.fallback).toMatchObject({
    key: 'flash',
    provider: 'gemini',
    apiKey: 'test-api-key',
    timeoutMs: 20_000
  })
  expect(config.llm).toMatchObject({ hedgeAfterMs: 2500, stickyMs: 60_000 })
  expect(config.llm.monthlyBudgetUsd).toEqual({ anthropic: 2 })
})

it('lets LLM_MAIN and LLM_FALLBACK override the block', async () => {
  setRequiredEnvVars()
  clearTunableEnvVars()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
  vi.stubEnv('LLM_MAIN', 'flash')
  vi.stubEnv('LLM_FALLBACK', 'haiku')
  withYamlOverride({ llm: HAIKU_LLM })

  const { config } = await import('../config.js')

  expect(config.llm.main.key).toBe('flash')
  expect(config.llm.fallback?.key).toBe('haiku')
})

it('disables a block fallback with LLM_FALLBACK=none', async () => {
  setRequiredEnvVars()
  clearTunableEnvVars()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
  vi.stubEnv('LLM_FALLBACK', 'none')
  withYamlOverride({ llm: { ...HAIKU_LLM, fallback: 'flash' } })

  const { config } = await import('../config.js')

  expect(config.llm.fallback).toBeNull()
})

it('disables the synthesised fallback with LLM_FALLBACK=none and no llm block', async () => {
  setRequiredEnvVars()
  clearTunableEnvVars()
  vi.stubEnv('MODELSCOPE_API_KEY', 'test-modelscope-key')
  vi.stubEnv('LLM_FALLBACK', 'none')

  const { config } = await import('../config.js')

  expect(config.llm.main.key).toBe('legacy-gemini')
  expect(config.llm.fallback).toBeNull()
})

it.each([
  ['LLM_MAIN', 'Environment variable LLM_MAIN needs an llm: block in config.yml, got: haiku'],
  ['LLM_FALLBACK', 'Environment variable LLM_FALLBACK needs an llm: block in config.yml, got: haiku']
] as const)('rejects %s without an llm block', async (key, message) => {
  setRequiredEnvVars()
  clearTunableEnvVars()
  vi.stubEnv(key, 'haiku')

  await expect(() => import('../config.js')).rejects.toThrow(message)
})

it.each([
  [
    'an llm block without main',
    { models: HAIKU_LLM.models },
    {},
    'Config value llm.main is required when config.yml has an llm: block'
  ],
  [
    'a main that names no model',
    { ...HAIKU_LLM, main: 'nope' },
    {},
    'Config value llm.main must name a key under llm.models, got: nope'
  ],
  [
    'an LLM_MAIN that names no model',
    HAIKU_LLM,
    { LLM_MAIN: 'nope' },
    'Environment variable LLM_MAIN must name a key under llm.models, got: nope'
  ],
  [
    'a fallback that names no model',
    { ...HAIKU_LLM, fallback: 'nope' },
    {},
    'Config value llm.fallback must name a key under llm.models, got: nope'
  ],
  [
    'an unknown provider',
    { main: 'haiku', models: { haiku: { provider: 'mistral', model: 'x' } } },
    {},
    'Config value llm.models.haiku.provider must be gemini, anthropic, openai or modelscope, got: mistral'
  ],
  [
    'a model with no tested profile',
    { main: 'haiku', models: { haiku: { provider: 'anthropic', model: 'claude-haiku-4-5' } } },
    {},
    'Config value llm.models.haiku.model has no tested anthropic profile, got: claude-haiku-4-5'
  ],
  [
    'an effort the profile does not take',
    { main: 'haiku', models: { haiku: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'turbo' } } },
    {},
    'Config value llm.models.haiku.effort must be one of none, low, medium, high, xhigh, max, got: turbo'
  ],
  [
    'an effort on a model that takes none',
    { main: 'flash', models: { flash: { provider: 'gemini', model: 'gemini-3.5-flash-lite', effort: 'low' } } },
    {},
    'Config value llm.models.flash.effort is not accepted by gemini-3.5-flash-lite, got: low'
  ],
  [
    'a missing Anthropic key',
    HAIKU_LLM,
    { ANTHROPIC_API_KEY: '' },
    'Missing required environment variable: ANTHROPIC_API_KEY (llm.main uses anthropic)'
  ],
  [
    'a missing ModelScope key for the fallback',
    {
      ...HAIKU_LLM,
      fallback: 'qwen',
      models: { ...HAIKU_LLM.models, qwen: { provider: 'modelscope', model: 'Qwen/Qwen3.5-122B-A10B' } }
    },
    { MODELSCOPE_API_KEY: '' },
    'Missing required environment variable: MODELSCOPE_API_KEY (llm.fallback uses modelscope)'
  ],
  [
    'a timeout below one',
    { main: 'haiku', models: { haiku: { ...HAIKU_LLM.models.haiku, timeoutMs: 0 } } },
    {},
    'Config value llm.main.timeoutMs must be >= 1, got: 0'
  ],
  [
    'an output cap above the profile',
    { main: 'haiku', models: { haiku: { ...HAIKU_LLM.models.haiku, maxOutputTokens: 200_000 } } },
    {},
    'Config value llm.main.maxOutputTokens must be <= 128000, got: 200000'
  ],
  [
    'a negative monthly budget',
    { ...HAIKU_LLM, monthlyBudgetUsd: { anthropic: -1 } },
    {},
    'Config value llm.monthlyBudgetUsd.anthropic must be >= 0, got: -1'
  ],
  [
    'a negative hedge delay',
    { ...HAIKU_LLM, hedgeAfterMs: -5 },
    {},
    'Config value llm.hedgeAfterMs must be >= 0, got: -5'
  ]
] as const)('stops startup with one clear message for %s', async (_name, llm, env, message) => {
  setRequiredEnvVars()
  clearTunableEnvVars()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  withYamlOverride({ llm })

  await expect(() => import('../config.js')).rejects.toThrow(message)
})

it('rejects an untested candidate profile as main', async () => {
  setRequiredEnvVars()
  clearTunableEnvVars()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
  vi.doMock('../agent/llm/profiles.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../agent/llm/profiles.js')>()
    const candidate = {
      ...actual.profileFor('anthropic', 'claude-haiku-5-5')!,
      model: 'claude-candidate',
      verified: false
    }
    return {
      ...actual,
      MODEL_PROFILES: [...actual.MODEL_PROFILES, candidate],
      profileFor: (provider: Parameters<typeof actual.profileFor>[0], model: string) =>
        provider === 'anthropic' && model === 'claude-candidate' ? candidate : actual.profileFor(provider, model)
    }
  })
  withYamlOverride({ llm: { main: 'cand', models: { cand: { provider: 'anthropic', model: 'claude-candidate' } } } })

  await expect(() => import('../config.js')).rejects.toThrow(
    'Config value llm.models.cand.model claude-candidate is an untested candidate and cannot be llm.main'
  )
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: FAIL — the block is ignored (main stays `legacy-gemini`) and no validation error is thrown.

- [ ] **Step 3: Extend `YamlConfig`**

In `src/config.ts`, add to `interface YamlConfig` after the `fallback?:` line:

```ts
  llm?: {
    main?: string
    fallback?: string | null
    hedgeAfterMs?: number
    stickyMs?: number
    monthlyBudgetUsd?: Record<string, number>
    models?: Record<
      string,
      {
        provider?: string
        model?: string
        effort?: string
        timeoutMs?: number
        maxOutputTokens?: number
        baseUrl?: string
        limits?: { rpm?: number; rpd?: number; tpm?: number }
      }
    >
  }
```

- [ ] **Step 4: Add the resolver after `legacyLlm`**

```ts
const PROVIDER_KEY_ENV: Record<ProviderId, string> = {
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  modelscope: 'MODELSCOPE_API_KEY'
}
const DEFAULT_MONTHLY_BUDGET_USD: Partial<Record<ProviderId, number>> = { anthropic: 5, openai: 5 }

type YamlModels = NonNullable<NonNullable<YamlConfig['llm']>['models']>

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && Object.hasOwn(PROVIDER_KEY_ENV, value)
}

function resolveRole(
  models: YamlModels | undefined,
  settings: LegacyModelSettings,
  role: 'main' | 'fallback',
  key: string,
  fromEnv: boolean
): ResolvedModel {
  const source = fromEnv ? `Environment variable LLM_${role.toUpperCase()}` : `Config value llm.${role}`
  const entry = models?.[key]
  if (!entry) throw new Error(`${source} must name a key under llm.models, got: ${key}`)
  const at = `Config value llm.models.${key}`
  if (!isProviderId(entry.provider)) {
    throw new Error(`${at}.provider must be gemini, anthropic, openai or modelscope, got: ${String(entry.provider)}`)
  }
  const profile = profileFor(entry.provider, String(entry.model))
  if (!profile) throw new Error(`${at}.model has no tested ${entry.provider} profile, got: ${String(entry.model)}`)
  if (!profile.verified)
    throw new Error(`${at}.model ${profile.model} is an untested candidate and cannot be llm.${role}`)
  const efforts = profile.thinking.efforts
  if (entry.effort !== undefined && !efforts.includes(entry.effort)) {
    throw new Error(
      efforts.length === 0
        ? `${at}.effort is not accepted by ${profile.model}, got: ${entry.effort}`
        : `${at}.effort must be one of ${efforts.join(', ')}, got: ${entry.effort}`
    )
  }
  const keyEnv = PROVIDER_KEY_ENV[entry.provider]
  const apiKey = entry.provider === 'gemini' ? settings.gemini.apiKey : envString(keyEnv)
  if (!apiKey) throw new Error(`Missing required environment variable: ${keyEnv} (llm.${role} uses ${entry.provider})`)
  return {
    key,
    provider: entry.provider,
    model: profile.model,
    profile,
    apiKey,
    baseUrl: entry.baseUrl ?? (entry.provider === 'modelscope' ? settings.fallback.baseUrl : undefined),
    timeoutMs: entry.timeoutMs ?? settings.gemini.timeout,
    maxOutputTokens: entry.maxOutputTokens ?? settings.gemini.maxOutputTokens,
    effort: entry.effort ?? profile.thinking.defaultEffort,
    ...(entry.limits ? { limits: entry.limits } : {})
  }
}

function resolveLlm(settings: LegacyModelSettings): LlmConfig {
  const block = yaml.llm
  const envMain = envString('LLM_MAIN')
  const envFallback = envString('LLM_FALLBACK')
  if (!block) {
    if (envMain) throw new Error(`Environment variable LLM_MAIN needs an llm: block in config.yml, got: ${envMain}`)
    if (envFallback && envFallback !== 'none') {
      throw new Error(`Environment variable LLM_FALLBACK needs an llm: block in config.yml, got: ${envFallback}`)
    }
    const legacy = legacyLlm(settings)
    return envFallback === 'none' ? { ...legacy, fallback: null } : legacy
  }

  const mainKey = envMain ?? block.main
  if (!mainKey) throw new Error('Config value llm.main is required when config.yml has an llm: block')
  const fallbackKey = envFallback === 'none' ? null : (envFallback ?? block.fallback ?? null)
  return {
    main: resolveRole(block.models, settings, 'main', mainKey, envMain !== undefined),
    fallback:
      fallbackKey === null
        ? null
        : resolveRole(block.models, settings, 'fallback', fallbackKey, envFallback !== undefined),
    hedgeAfterMs: block.hedgeAfterMs ?? 0,
    stickyMs: block.stickyMs ?? 300_000,
    monthlyBudgetUsd: block.monthlyBudgetUsd ?? DEFAULT_MONTHLY_BUDGET_USD
  }
}
```

Change the config line from Task 7 to:

```ts
export const config = { ...baseConfig, llm: resolveLlm(baseConfig) } as const
```

- [ ] **Step 5: Bound the block's numbers**

Add before `export const NUMERIC_BOUNDS`:

```ts
function modelBounds(role: 'main' | 'fallback', model: ResolvedModel) {
  return [
    { path: `llm.${role}.timeoutMs`, value: model.timeoutMs, min: 1 },
    // Config can lower a profile's limit; it cannot raise it.
    { path: `llm.${role}.maxOutputTokens`, value: model.maxOutputTokens, min: 1, max: model.profile.maxOutputTokens }
  ]
}
```

Replace the two `llm.*` rows added in Task 7 with:

```ts
  { path: 'llm.hedgeAfterMs', value: config.llm.hedgeAfterMs, min: 0 },
  { path: 'llm.stickyMs', value: config.llm.stickyMs, min: 0 },
  // Synthesised legacy values are already bounded as gemini.* and fallback.*, so only a block adds rows.
  ...(yaml.llm
    ? [
        ...modelBounds('main', config.llm.main),
        ...(config.llm.fallback ? modelBounds('fallback', config.llm.fallback) : []),
        ...Object.entries(config.llm.monthlyBudgetUsd).map(([provider, value]) => ({
          path: `llm.monthlyBudgetUsd.${provider}`,
          value: value as number,
          min: 0
        }))
      ]
    : [])
```

- [ ] **Step 6: Document the block in `config.yml` (inactive)**

Insert after the `fallback:` block (after the `stickyMs: 300000 ...` line, line 38), keeping it commented so the Pi stays on the synthesised route:

```yaml
# llm: # Main and fallback model selection; without this block the bot runs gemini.model with the fallback model above
#   main: flash # Required; a key under llm.models (LLM_MAIN overrides)
#   fallback: null # Optional; a key under llm.models (LLM_FALLBACK overrides; LLM_FALLBACK=none disables)
#   hedgeAfterMs: 0 # Start the same call on the fallback after this many ms; paid routes start at 0 (off)
#   stickyMs: 300000 # After the main model fails and the fallback answers, later turns start on the fallback this long
#   monthlyBudgetUsd: # Local monthly spend cap per paid provider (enforced once per-call budgets land)
#     anthropic: 5
#     openai: 5
#   models: # Only tested profiles start (src/agent/llm/profiles.ts); optional per model: timeoutMs, maxOutputTokens, baseUrl
#     flash: { provider: gemini, model: gemini-3.5-flash-lite }
#     haiku: { provider: anthropic, model: claude-haiku-5-5, effort: low } # Needs ANTHROPIC_API_KEY; effort none turns thinking off (for a Haiku fallback)
```

- [ ] **Step 7: Run the config suite**

Run: `npx vitest run src/__tests__/config.test.ts && npx prettier --check config.yml`
Expected: PASS; Prettier reports `config.yml` formatted (run `npx prettier --write config.yml` if not).

- [ ] **Step 8: Commit**

```bash
git add src/config.ts config.yml src/__tests__/config.test.ts
git commit -m "feat(config): read the llm block with env overrides and startup validation"
```

---

### Task 9: Expose The Stable Prompt Prefix

**Files:**

- Modify: `src/agent/promptAssembler.ts`
- Test: `src/agent/__tests__/promptAssembler.test.ts`

- [ ] **Step 1: Write the failing test**

Change the imports in `src/agent/__tests__/promptAssembler.test.ts` to:

```ts
import { type AssemblerInput, assembleSystemPrompt, splitStablePrefix } from '../promptAssembler.js'
import { CORE_PROMPT, CORE_PROMPT_FORGET_ONLY, CORE_PROMPT_MEMORY_FREE } from '../prompts/core.js'
```

Append at the end of the file:

```ts
describe('splitStablePrefix', () => {
  const input: AssemblerInput = { tone: 'playful', hour: 14, displayName: 'Alice', memory: true }

  it.each([
    ['memory', { memory: true }, CORE_PROMPT],
    ['forget-only', { memory: true, forgetOnly: true }, CORE_PROMPT_FORGET_ONLY],
    ['memory-free', { memory: false }, CORE_PROMPT_MEMORY_FREE]
  ] as const)('splits the %s core and speech layers from the per-turn layers', (_name, flags, core) => {
    const prompt = `${assembleSystemPrompt({ ...input, ...flags })}\n\n## Memory\n- Alice likes tea`

    const split = splitStablePrefix(prompt)

    expect(split?.stable).toBe(`${core}\n\n${SPEECH_PROMPT}`)
    expect(`${split?.stable}${split?.rest}`).toBe(prompt)
    expect(split?.rest).toContain(TONE_PROMPTS.playful)
  })

  it('returns undefined for a prompt that does not start with the Roka layers', () => {
    expect(splitStablePrefix('You extract facts from a chat.')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/agent/__tests__/promptAssembler.test.ts`
Expected: FAIL with `splitStablePrefix is not a function`.

- [ ] **Step 3: Implement**

Append to `src/agent/promptAssembler.ts`:

```ts
const STABLE_PREFIXES = [CORE_PROMPT, CORE_PROMPT_FORGET_ONLY, CORE_PROMPT_MEMORY_FREE].map(
  (core) => `${core}\n\n${SPEECH_PROMPT}`
)

/** Splits off the core and speech layers, which never change between turns, so a provider can cache them. */
export function splitStablePrefix(prompt: string): { stable: string; rest: string } | undefined {
  const stable = STABLE_PREFIXES.find((prefix) => prompt.startsWith(prefix))
  return stable === undefined ? undefined : { stable, rest: prompt.slice(stable.length) }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/agent/__tests__/promptAssembler.test.ts tests/harness/__tests__/tokens.test.ts`
Expected: PASS (the prompt itself is unchanged, so the size cap test is unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/agent/promptAssembler.ts src/agent/__tests__/promptAssembler.test.ts
git commit -m "feat(agent): expose the stable core and speech prompt prefix for caching"
```

---

### Task 10: Provider Columns On `response_events`

**Files:**

- Modify: `src/storage/database.ts:125` (CREATE), `:317-329` (migration)
- Modify: `src/storage/metricsStore.ts:11-25`, `:105-110`, `:199-225`
- Test: `src/storage/__tests__/metricsStore.test.ts`, `src/storage/__tests__/database.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/storage/__tests__/metricsStore.test.ts`:

1. In the `responseEvent` fixture, after `model: 'gemini',` add `routeRole: 'main', provider: 'gemini', modelId: 'gemini-3.5-flash-lite',`.
2. In the column list, after `'hedged',` add `'provider', 'model_id', 'route_role', 'workload',`.
3. Add this test after `persists which model answered and whether a hedge fired...`:

```ts
it('persists the answering provider, model id and route role, and marks the row as a reply', () => {
  recordResponseEvent({
    ...responseEvent,
    routeRole: 'fallback',
    provider: 'modelscope',
    modelId: 'Qwen/Qwen3.5-122B-A10B'
  })
  recordResponseEvent({ ...responseEvent, routeRole: undefined, provider: undefined, modelId: undefined })

  const rows = getDb()
    .prepare('SELECT provider, model_id, route_role, workload FROM response_events ORDER BY id DESC LIMIT 2')
    .all()

  expect(rows[0]).toEqual({ provider: null, model_id: null, route_role: null, workload: 'reply' })
  expect(rows[1]).toEqual({
    provider: 'modelscope',
    model_id: 'Qwen/Qwen3.5-122B-A10B',
    route_role: 'fallback',
    workload: 'reply'
  })
})
```

In `src/storage/__tests__/database.test.ts`, add before the closing `})` of `describe('runMigrations'` (line 538):

```ts
it('adds provider columns to a legacy response_events table without losing rows', () => {
  testDb = new Database(':memory:')
  testDb.exec(`
      CREATE TABLE session_history (
        channel_id TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        user_id TEXT DEFAULT NULL,
        username TEXT DEFAULT NULL
      );

      CREATE TABLE gacha_daily (
        user_id TEXT NOT NULL,
        PRIMARY KEY (user_id)
      );

      CREATE TABLE response_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        tone TEXT NOT NULL,
        outcome TEXT NOT NULL,
        kind TEXT NOT NULL,
        e2e_ms INTEGER NOT NULL,
        generate_ms INTEGER NOT NULL,
        llm_ms INTEGER NOT NULL,
        retry_latency_ms INTEGER NOT NULL,
        retries INTEGER NOT NULL,
        tokens_in_est INTEGER NOT NULL,
        tokens_out_est INTEGER NOT NULL,
        tools_used TEXT DEFAULT NULL,
        failure_marker TEXT DEFAULT NULL,
        model TEXT DEFAULT NULL,
        hedged INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `)
  testDb
    .prepare(
      `INSERT INTO response_events (guild_id, channel_id, user_id, trigger, tone, outcome, kind, e2e_ms, generate_ms,
          llm_ms, retry_latency_ms, retries, tokens_in_est, tokens_out_est, model, hedged, created_at)
         VALUES ('g', 'c', 'u', 'mention', 'playful', 'ok', 'ok', 1, 1, 1, 0, 0, 1, 1, 'fallback', 1, 1)`
    )
    .run()

  const runMigrations = (database as unknown as DatabaseModule).runMigrations
  runMigrations?.(testDb)
  runMigrations?.(testDb)

  const columns = (testDb.prepare("PRAGMA table_info('response_events')").all() as Array<{ name: string }>).map(
    (column) => column.name
  )
  expect(columns).toEqual(expect.arrayContaining(['provider', 'model_id', 'route_role', 'workload']))
  expect(
    testDb.prepare('SELECT model, hedged, provider, model_id, route_role, workload FROM response_events').get()
  ).toEqual({
    model: 'fallback',
    hedged: 1,
    provider: null,
    model_id: null,
    route_role: null,
    workload: null
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/storage/__tests__/metricsStore.test.ts src/storage/__tests__/database.test.ts`
Expected: FAIL (`no such column: provider`; the column list and the migration test differ). If the migration test fails on a missing table other than `response_events`, create that table in the test DDL the same way the gacha test does.

- [ ] **Step 3: Implement the schema and migration**

In `src/storage/database.ts`, in `CREATE TABLE IF NOT EXISTS response_events`, after `hedged INTEGER NOT NULL DEFAULT 0,` add:

```sql
      provider TEXT DEFAULT NULL,
      model_id TEXT DEFAULT NULL,
      route_role TEXT DEFAULT NULL,
      workload TEXT DEFAULT NULL,
```

After the `hedged` migration block (line 329) add:

```ts
for (const column of ['provider', 'model_id', 'route_role', 'workload']) {
  if (responseEventCols.length > 0 && !responseEventCols.some(({ name }) => name === column)) {
    database.exec(`ALTER TABLE response_events ADD COLUMN ${column} TEXT DEFAULT NULL`)
  }
}
```

- [ ] **Step 4: Implement the store fields**

In `src/storage/metricsStore.ts`, add to `ResponseMetrics` after `model?`:

```ts
  /** Which side of the route answered; absent on turns that produced none. */
  routeRole?: 'main' | 'fallback'
  /** The answering side's provider and API model id. */
  provider?: string
  modelId?: string
```

Replace the INSERT column list and placeholders (lines 106-109) with:

```ts
;`INSERT INTO response_events (
      guild_id, channel_id, user_id, trigger, tone, outcome, kind, e2e_ms, generate_ms, llm_ms,
      retry_latency_ms, retries, tokens_in_est, tokens_out_est, tools_used, failure_marker, model, hedged,
      provider, model_id, route_role, workload, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
```

and in `recordResponseEvent`, after `row.hedged,` add:

```ts
      row.provider ?? null,
      row.modelId ?? null,
      row.routeRole ?? null,
      'reply',
```

- [ ] **Step 5: Run the storage and stats suites**

Run: `npx vitest run src/storage src/discord/events/stats src/agent/memory/__tests__/identityResolver.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/storage/database.ts src/storage/metricsStore.ts src/storage/__tests__/metricsStore.test.ts src/storage/__tests__/database.test.ts
git commit -m "feat(agent): record the answering provider, model id and route role on response events"
```

---

### Task 11: RoutedLlm Sides `main`/`fallback` And Provider Pinning

Pinning binds only when the route is built with `pinTurns: true` (Task 15 turns it on when a side replays thinking within a turn). The legacy route keeps hedging every call, tool round-trips included (docs/trd.md "Hedging Slow Gemini Calls").

**Files:**

- Modify: `src/agent/fallbackModel.ts:9-17`, `:370-374`, `:401-461`, `:463-522`
- Modify: `src/agent/roka.ts:404-408`, `:625-637`
- Modify: `src/storage/metricsStore.ts` (drop `model` from `ResponseMetrics` and the INSERT)
- Test: `src/agent/__tests__/modelHedge.test.ts`, `src/agent/__tests__/fallbackModel.test.ts`, `src/agent/__tests__/modelFallback.test.ts`, `src/storage/__tests__/metricsStore.test.ts`

- [ ] **Step 1: Update the existing tests to the new names**

```bash
sed -i "s/toBe('gemini')/toBe('main')/; s/winner: 'gemini'/winner: 'main'/" src/agent/__tests__/modelHedge.test.ts
sed -i "s/return { useFallback: false, hedged: false, answeredBy: null, ...overrides }/return { useFallback: false, hedged: false, answeredBy: null, pinned: null, ...overrides }/" src/agent/__tests__/modelHedge.test.ts
sed -i "s/{ useFallback: true, hedged: false, answeredBy: null }/{ useFallback: true, hedged: false, answeredBy: null, pinned: null }/g" src/agent/__tests__/fallbackModel.test.ts
```

In `src/agent/__tests__/modelFallback.test.ts` (`records the answering model on every answered turn...`):

- `expect(first.metrics).toMatchObject({ model: 'fallback', hedged: 1 })` → `expect(first.metrics).toMatchObject({ routeRole: 'fallback', hedged: 1 })` (same for `second`)
- `if (route) route.answeredBy = 'gemini'` → `if (route) route.answeredBy = 'main'`
- `expect(next.metrics).toMatchObject({ model: 'gemini', hedged: 0 })` → `expect(next.metrics).toMatchObject({ routeRole: 'main', provider: 'gemini', modelId: config.llm.main.model, hedged: 0 })`

In `src/storage/__tests__/metricsStore.test.ts`: remove `model: 'gemini',` from the `responseEvent` fixture, and replace the test `persists which model answered and whether a hedge fired, and NULLs the model when there was no answer` with:

```ts
it('persists whether a hedge fired, and leaves the legacy model column NULL on new rows', () => {
  recordResponseEvent({ ...responseEvent, routeRole: 'fallback', hedged: 1 })

  const row = getDb().prepare('SELECT model, route_role, hedged FROM response_events ORDER BY id DESC LIMIT 1').get()

  expect(row).toEqual({ model: null, route_role: 'fallback', hedged: 1 })
})
```

- [ ] **Step 2: Write the failing pinning tests**

Append to `src/agent/__tests__/modelHedge.test.ts`:

```ts
describe('RoutedLlm provider pinning', () => {
  it('sends later calls of a turn straight to the side that won the first hedge', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS, { pinTurns: true })
    const turn = route()

    const first = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await afterHedge(fallback)
    fallback.resolve(0, { text: 'fallback answer' })
    await first
    expect(turn.pinned).toBe('fallback')

    const second = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await new Promise((resolve) => setTimeout(resolve, 0))
    fallback.resolve(1, { text: 'pinned answer' })

    expect((await second)[0]?.content?.parts?.[0]?.text).toBe('pinned answer')
    expect(primary.calls).toBe(1)
  })

  it('stops hedging later calls once the main model answered first', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS, { pinTurns: true })
    const turn = route()

    const first = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await new Promise((resolve) => setTimeout(resolve, 5))
    primary.resolve(0, { text: 'main answer' })
    await first
    expect(turn.pinned).toBe('main')

    const second = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(fallback.calls).toBe(0)
    primary.resolve(1, { text: 'still main' })

    expect((await second)[0]?.content?.parts?.[0]?.text).toBe('still main')
    expect(turn.hedged).toBe(false)
  })

  it('keeps hedging every call of a turn when pinning is off, as the legacy route does', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const turn = route()

    const first = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await new Promise((resolve) => setTimeout(resolve, 5))
    primary.resolve(0, { text: 'main answer' })
    await first
    expect(turn.pinned).toBeNull()

    const second = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await afterHedge(fallback)
    fallback.resolve(0, { text: 'hedged second call' })

    expect((await second)[0]?.content?.parts?.[0]?.text).toBe('hedged second call')
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/agent/__tests__/modelHedge.test.ts src/agent/__tests__/fallbackModel.test.ts src/agent/__tests__/modelFallback.test.ts src/storage/__tests__/metricsStore.test.ts`
Expected: FAIL (`answeredBy` is `'gemini'`, `pinned` is undefined, `routeRole` is absent from metrics).

- [ ] **Step 4: Implement in `src/agent/fallbackModel.ts`**

Replace lines 9-17:

```ts
export type AnswerModel = 'main' | 'fallback'

export interface ModelRoute {
  useFallback: boolean
  /** 1 once any model call of the turn has fired a hedge. */
  hedged: boolean
  /** Which side produced the turn's answer; null until a call answers, and on a turn that produced none. */
  answeredBy: AnswerModel | null
  /** Set by the first answer of the turn; later calls in the turn use the same side (provider pinning). */
  pinned: AnswerModel | null
}
```

Replace `type RaceSide = 'gemini' | 'fallback'` (line 370) with `type RaceSide = AnswerModel`. In `raceForWinner`, replace `side === 'gemini'` (line 436) with `side === 'main'` and `void run('gemini', primary, ...)` (line 456) with `void run('main', primary, withAbort(llmRequest, primaryAbort.signal))`. In the `RoutedLlm` error branch (line 505) replace `failure.side === 'gemini'` with `failure.side === 'main'`.

Replace the `RoutedLlm` constructor and `generateContentAsync` (lines 463-517) with:

```ts
export class RoutedLlm extends BaseLlm {
  readonly fallbackModelName: string | undefined
  readonly hedgeAfterMs: number
  private readonly pinTurns: boolean

  constructor(
    private readonly primary: BaseLlm,
    private readonly fallback: BaseLlm | null,
    hedgeAfterMs: number = config.gemini.hedgeAfterMs,
    { pinTurns = false }: { pinTurns?: boolean } = {}
  ) {
    super({ model: primary.model })
    this.fallbackModelName = fallback?.model
    this.hedgeAfterMs = hedgeAfterMs
    this.pinTurns = pinTurns
  }

  get hasFallback(): boolean {
    return this.fallback !== null
  }

  async *generateContentAsync(llmRequest: LlmRequest, stream?: boolean): AsyncGenerator<LlmResponse, void> {
    const route = modelRouteForRequest.getStore()
    const fallback = this.fallback
    const pinned = fallback ? (route?.pinned ?? null) : null
    const onFallback = fallback !== null && (pinned ? pinned === 'fallback' : Boolean(route?.useFallback))
    const side: AnswerModel = onFallback ? 'fallback' : 'main'
    if (pinned || onFallback || !fallback || !route || this.hedgeAfterMs <= 0 || !isHedgeEligible(llmRequest)) {
      if (route) route.answeredBy = side
      yield* (onFallback && fallback ? fallback : this.primary).generateContentAsync(llmRequest, stream)
      if (route && this.pinTurns) route.pinned = side
      return
    }

    // route.hedged is turn-wide, so a later call in a turn that already hedged cannot tell whether it hedged itself.
    let hedgeFired = false
    const outcome = await raceForWinner(llmRequest, this.primary, fallback, this.hedgeAfterMs, () => {
      hedgeFired = true
      route.hedged = true
    })
    if (outcome.winner === null) {
      // One turn-level failure, unchanged for the ladder: the fallback's loss is logged and dropped, because
      // it is Gemini's outage that the switch policy, the sticky window and the retry budget are all keyed on.
      for (const failure of outcome.errors) {
        if (failure.side === 'fallback') {
          logger.warn({ err: failure.error }, 'Hedged fallback call failed while Gemini was still running')
        }
      }
      const mainError = outcome.errors.find((failure) => failure.side === 'main')?.error
      throw mainError ?? new Error(`Both models failed (${errorText(outcome.errors[0]?.error)})`)
    }

    route.answeredBy = outcome.winner
    if (this.pinTurns) route.pinned = outcome.winner
    if (hedgeFired) {
      logger.warn(
        { winner: outcome.winner, hedgeAfterMs: this.hedgeAfterMs },
        'Hedged slow Gemini call; kept the faster answer'
      )
    }
    yield* outcome.responses[Symbol.iterator]()
  }
```

(Keep `connect` and `createRokaModel` as they are; Task 15 moves `createRokaModel`.)

- [ ] **Step 5: Wire roka metrics and drop the legacy metric field**

In `src/agent/roka.ts`, add `pinned: null` to the `route` literal (line 404-408):

```ts
const route: ModelRoute = {
  useFallback: rokaModel.hasFallback && hasStickyFallback(),
  hedged: false,
  answeredBy: null,
  pinned: null
}
```

Directly before `const metrics: ResponseMetrics = {` (line 625) add:

```ts
const answeredModel =
  route.answeredBy === 'fallback' ? config.llm.fallback : route.answeredBy === 'main' ? config.llm.main : null
```

and in the `metrics` object replace `model: route.answeredBy ?? undefined,` with:

```ts
    routeRole: route.answeredBy ?? undefined,
    provider: answeredModel?.provider,
    modelId: answeredModel?.model,
```

In `src/storage/metricsStore.ts` delete the `model?: 'gemini' | 'fallback'` field and its doc comment from `ResponseMetrics`, remove `model, ` from the INSERT column list, remove one `?, ` from `VALUES`, and delete the `row.model ?? null,` argument.

- [ ] **Step 6: Run the affected suites**

Run: `npx vitest run src/agent src/storage && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/agent/fallbackModel.ts src/agent/roka.ts src/storage/metricsStore.ts src/agent/__tests__/modelHedge.test.ts src/agent/__tests__/fallbackModel.test.ts src/agent/__tests__/modelFallback.test.ts src/storage/__tests__/metricsStore.test.ts
git commit -m "feat(agent): name the route sides main and fallback and pin a turn to the side that answered"
```

---

### Task 12: AnthropicLlm Requests

**Files:**

- Create: `src/agent/llm/anthropicLlm.ts`
- Create: `src/agent/llm/__tests__/anthropicFixtures.ts`
- Test: `src/agent/llm/__tests__/anthropicLlm.test.ts`

- [ ] **Step 1: Write the fixtures module**

`src/agent/llm/__tests__/anthropicFixtures.ts` (typed against the SDK, so `npm run typecheck` catches a fixture that drifts from the real response shape):

```ts
import type Anthropic from '@anthropic-ai/sdk'

/**
 * Sanitised Messages API responses in the exact shape the SDK returns, one per case the adapter handles.
 * Swap any of them for a response captured on an owner-run live session.
 */
type ContentBlock = Anthropic.ContentBlock

function usage(counts: {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
  thinkingTokens?: number
}): Anthropic.Usage {
  return {
    input_tokens: counts.input,
    output_tokens: counts.output,
    cache_read_input_tokens: counts.cacheRead ?? 0,
    cache_creation_input_tokens: counts.cacheWrite ?? 0,
    cache_creation: null,
    inference_geo: 'global',
    output_tokens_details: { thinking_tokens: counts.thinkingTokens ?? 0 },
    server_tool_use: null,
    service_tier: 'standard'
  }
}

function message(
  id: string,
  content: ContentBlock[],
  stopReason: Anthropic.Message['stop_reason'],
  messageUsage: Anthropic.Usage,
  stopDetails: Anthropic.Message['stop_details'] = null
): Anthropic.Message {
  return {
    id,
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    container: null,
    diagnostics: null,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: stopDetails,
    usage: messageUsage
  }
}

const text = (value: string): ContentBlock => ({ type: 'text', text: value, citations: null })
const thinking = (signature: string): ContentBlock => ({ type: 'thinking', thinking: '', signature })
const toolUse = (id: string, name: string, input: unknown): ContentBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
  caller: { type: 'direct' }
})

export const fixtures = {
  text: message(
    'msg_fixture_text',
    [thinking('sig-text'), text('Ehehe, good morning to you too~')],
    'end_turn',
    usage({ input: 412, output: 96, cacheRead: 3880, thinkingTokens: 64 })
  ),
  toolUse: message(
    'msg_fixture_tool',
    [
      thinking('sig-tool'),
      text('Let me check what I remember.'),
      toolUse('toolu_01Fixture', 'recall_user', { query: 'favourite tea' })
    ],
    'tool_use',
    usage({ input: 500, output: 80, thinkingTokens: 40 })
  ),
  parallelToolUse: message(
    'msg_fixture_parallel',
    [toolUse('toolu_a', 'roll_dice', { sides: 6 }), toolUse('toolu_b', 'roll_dice', { sides: 20 })],
    'tool_use',
    usage({ input: 300, output: 60 })
  ),
  refusal: message('msg_fixture_refusal', [], 'refusal', usage({ input: 200, output: 0 }), {
    type: 'refusal',
    category: 'cyber',
    explanation: 'The request could enable cyber harm.'
  }),
  maxTokens: message(
    'msg_fixture_max',
    [thinking('sig-max'), text('I was about to say')],
    'max_tokens',
    usage({ input: 300, output: 2548, thinkingTokens: 2400 })
  ),
  thinkingOnly: message(
    'msg_fixture_thinking_only',
    [thinking('sig-only')],
    'max_tokens',
    usage({ input: 300, output: 2548, thinkingTokens: 2548 })
  ),
  structured: message(
    'msg_fixture_structured',
    [toolUse('toolu_struct', 'emit_result', { ok: true, facts: [] })],
    'tool_use',
    usage({ input: 700, output: 30 })
  ),
  malformedToolUse: message(
    'msg_fixture_malformed',
    [toolUse('toolu_bad', 'roll_dice', 'sides=6')],
    'tool_use',
    usage({ input: 300, output: 20 })
  )
} satisfies Record<string, Anthropic.Message>
```

- [ ] **Step 2: Write the failing request tests**

`src/agent/llm/__tests__/anthropicLlm.test.ts`:

```ts
import type Anthropic from '@anthropic-ai/sdk'
import type { LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import type { Content } from '@google/genai'
import { describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ options: [] as unknown[] }))

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>()
  class FakeAnthropic {
    messages = {
      create: async () => {
        throw new Error('unit tests inject a client')
      }
    }

    constructor(options: unknown) {
      sdk.options.push(options)
    }
  }
  return { ...actual, default: FakeAnthropic }
})

import type { ResolvedModel } from '../../../config.js'
import { assembleSystemPrompt } from '../../promptAssembler.js'
import { CORE_PROMPT } from '../../prompts/core.js'
import { SPEECH_PROMPT } from '../../prompts/speech.js'
import { AnthropicLlm, STRUCTURED_OUTPUT_TOOL } from '../anthropicLlm.js'
import { profileFor } from '../profiles.js'
import { fixtures } from './anthropicFixtures.js'

type CreateOptions = { signal?: AbortSignal; timeout?: number }

const HAIKU: ResolvedModel = {
  key: 'haiku',
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  profile: profileFor('anthropic', 'claude-haiku-5-5')!,
  apiKey: 'test-anthropic-key',
  timeoutMs: 20_000,
  maxOutputTokens: 500,
  effort: 'low'
}
const hi: Content = { role: 'user', parts: [{ text: '[Mio]: hi' }] }

function fakeClient() {
  const create =
    vi.fn<(body: Anthropic.MessageCreateParamsNonStreaming, options?: CreateOptions) => Promise<Anthropic.Message>>()
  return { client: { messages: { create } }, create }
}

function request(contents: Content[], config: Record<string, unknown> = {}): LlmRequest {
  return {
    model: 'claude-haiku-5-5',
    contents,
    config: { maxOutputTokens: 500, ...config },
    toolsDict: {},
    liveConnectConfig: {}
  } as unknown as LlmRequest
}

async function run(llm: AnthropicLlm, llmRequest: LlmRequest): Promise<LlmResponse[]> {
  const result: LlmResponse[] = []
  for await (const response of llm.generateContentAsync(llmRequest)) result.push(response)
  return result
}

async function sent(contents: Content[], config: Record<string, unknown> = {}, resolved: ResolvedModel = HAIKU) {
  const { client, create } = fakeClient()
  create.mockResolvedValueOnce(fixtures.text)
  await run(new AnthropicLlm({ resolved, client }), request(contents, config))
  const call = create.mock.calls[0]
  if (!call) throw new Error('no request was sent')
  return { body: call[0], options: call[1] }
}

describe('AnthropicLlm requests', () => {
  it('builds the SDK client with retries off and the resolved key, base URL and timeout', () => {
    expect(new AnthropicLlm({ resolved: { ...HAIKU, baseUrl: 'https://anthropic.test' } })).toBeInstanceOf(AnthropicLlm)
    expect(sdk.options.at(-1)).toEqual({
      apiKey: 'test-anthropic-key',
      baseURL: 'https://anthropic.test',
      maxRetries: 0,
      timeout: 20_000
    })
  })

  it('caches the core and speech layers as one system block and sends the per-turn layers after it', async () => {
    const prompt = `${assembleSystemPrompt({ tone: 'playful', hour: 14, displayName: 'Mio', memory: true })}\n\n## Memory\n- Mio likes tea`
    const stable = `${CORE_PROMPT}\n\n${SPEECH_PROMPT}`

    const { body } = await sent([hi], { systemInstruction: prompt })

    expect(body.system).toEqual([
      { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: prompt.slice(stable.length) }
    ])
  })

  it('sends a system prompt it does not recognise as one uncached block', async () => {
    const { body } = await sent([hi], { systemInstruction: { parts: [{ text: 'You extract facts.' }] } })

    expect(body.system).toEqual([{ type: 'text', text: 'You extract facts.' }])
  })

  it('never sends sampling parameters or safety settings and leaves thinking headroom at low effort', async () => {
    const { body, options } = await sent([hi], {
      temperature: 0.9,
      topP: 0.95,
      safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' }]
    })

    expect(body).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 2548,
      messages: [{ role: 'user', content: [{ type: 'text', text: '[Mio]: hi' }] }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' }
    })
    expect(options).toEqual({ signal: undefined, timeout: 20_000 })
  })

  it('turns thinking off for effort none and adds no headroom', async () => {
    const { body } = await sent([hi], {}, { ...HAIKU, effort: 'none' })

    expect(body).toMatchObject({ max_tokens: 500, thinking: { type: 'disabled' } })
    expect(body).not.toHaveProperty('output_config')
  })

  it('passes the request abort signal to the SDK', async () => {
    const controller = new AbortController()

    const { options } = await sent([hi], { abortSignal: controller.signal })

    expect(options?.signal).toBe(controller.signal)
  })

  it('declares tools with JSON Schema inputs, converting Gemini schemas', async () => {
    const { body } = await sent([hi], {
      tools: [
        {
          functionDeclarations: [
            {
              name: 'roll_dice',
              description: 'Roll a die',
              parameters: {
                type: 'OBJECT',
                properties: { sides: { type: 'INTEGER' } },
                required: ['sides'],
                propertyOrdering: ['sides']
              }
            },
            {
              name: 'recall_user',
              parametersJsonSchema: { type: 'object', properties: { query: { type: 'string' } } }
            },
            { name: 'flip_coin' }
          ]
        }
      ]
    })

    expect(body.tools).toEqual([
      {
        name: 'roll_dice',
        description: 'Roll a die',
        input_schema: { type: 'object', properties: { sides: { type: 'integer' } }, required: ['sides'] }
      },
      { name: 'recall_user', input_schema: { type: 'object', properties: { query: { type: 'string' } } } },
      { name: 'flip_coin', input_schema: { type: 'object', properties: {} } }
    ])
    expect(body).not.toHaveProperty('tool_choice')
  })

  it('keeps tool_use and tool_result paired by provider id across parallel calls', async () => {
    const { body } = await sent([
      hi,
      {
        role: 'model',
        parts: [
          { text: 'Rolling both~' },
          { functionCall: { id: 'toolu_a', name: 'roll_dice', args: { sides: 6 } } },
          { functionCall: { id: 'toolu_b', name: 'roll_dice', args: { sides: 20 } } }
        ]
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { id: 'toolu_b', name: 'roll_dice', response: { value: 17 } } },
          { functionResponse: { id: 'toolu_a', name: 'roll_dice', response: { value: 4 } } }
        ]
      }
    ])

    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: '[Mio]: hi' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Rolling both~' },
          { type: 'tool_use', id: 'toolu_a', name: 'roll_dice', input: { sides: 6 } },
          { type: 'tool_use', id: 'toolu_b', name: 'roll_dice', input: { sides: 20 } }
        ]
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_b', content: '{"value":17}' },
          { type: 'tool_result', tool_use_id: 'toolu_a', content: '{"value":4}' }
        ]
      }
    ])
  })

  it('pairs id-less calls from older history in order and turns an unmatched result into text', async () => {
    const { body } = await sent([
      hi,
      { role: 'model', parts: [{ functionCall: { name: 'roll_dice', args: { sides: 6 } } }] },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'roll_dice', response: { value: 3 } } },
          { functionResponse: { name: 'web_search', response: { results: [] } } }
        ]
      }
    ])

    expect(body.messages.slice(1)).toEqual([
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_rk1_0', name: 'roll_dice', input: { sides: 6 } }] },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_rk1_0', content: '{"value":3}' },
          { type: 'text', text: '(result of web_search: {"results":[]})' }
        ]
      }
    ])
  })

  it('drops leading assistant turns and tool calls that never got a result', async () => {
    const { body } = await sent([
      { role: 'model', parts: [{ text: 'An earlier reply' }] },
      hi,
      { role: 'model', parts: [{ functionCall: { id: 'toolu_lost', name: 'roll_dice', args: {} } }] },
      { role: 'user', parts: [{ text: '[Mio]: never mind' }] }
    ])

    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: '[Mio]: hi' },
          { type: 'text', text: '[Mio]: never mind' }
        ]
      }
    ])
  })

  it('sends images and PDFs as content blocks and other media as a text marker', async () => {
    const { body } = await sent([
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: 'cG5n' } },
          { inlineData: { mimeType: 'application/pdf', data: 'cGRm' } },
          { inlineData: { mimeType: 'audio/ogg', data: 'b2dn' } },
          { fileData: { mimeType: 'video/mp4', fileUri: 'files/abc' } },
          { text: '[Mio]: what are these?' }
        ]
      }
    ])

    expect(body.messages[0]?.content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'cG5n' } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'cGRm' } },
      { type: 'text', text: "(a audio attachment that can't be opened right now)" },
      { type: 'text', text: "(a video attachment that can't be opened right now)" },
      { type: 'text', text: '[Mio]: what are these?' }
    ])
  })

  it('skips thought parts and ends on a user turn when the history ends on the model', async () => {
    const { body } = await sent([
      hi,
      { role: 'model', parts: [{ text: 'secret plan', thought: true }, { text: 'Hello~' }] }
    ])

    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: '[Mio]: hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hello~' }] },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Continue processing previous requests as instructed. Exit or provide a summary if no more outputs are needed.'
          }
        ]
      }
    ])
  })

  it('forces one strict output tool for a structured request', async () => {
    const schema = {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false
    }

    const { body } = await sent([hi], { responseJsonSchema: schema })

    expect(body.tools).toEqual([
      {
        name: STRUCTURED_OUTPUT_TOOL,
        description: 'Return the requested JSON object as the input of this tool.',
        input_schema: schema,
        strict: true
      }
    ])
    expect(body.tool_choice).toEqual({ type: 'tool', name: STRUCTURED_OUTPUT_TOOL })
  })

  it('answers with the text of a recorded end_turn message and keeps thinking out of the parts', async () => {
    const { client, create } = fakeClient()
    create.mockResolvedValueOnce(fixtures.text)

    const [response] = await run(new AnthropicLlm({ resolved: HAIKU, client }), request([hi]))

    expect(response?.content).toEqual({ role: 'model', parts: [{ text: 'Ehehe, good morning to you too~' }] })
    expect(response?.finishReason).toBe(FinishReason.STOP)
  })
})
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run src/agent/llm/__tests__/anthropicLlm.test.ts`
Expected: FAIL with `Failed to load url ../anthropicLlm.js`.

- [ ] **Step 4: Write `src/agent/llm/anthropicLlm.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk'
import { BaseLlm } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import type { Content, Part } from '@google/genai'
import type { ResolvedModel } from '../../config.js'
import { splitStablePrefix } from '../promptAssembler.js'
import type { ModelProfile } from './profiles.js'
import { attachmentKind, attachmentMarker, functionDeclarations, shapeRequest, systemText } from './requestShape.js'

type Params = Anthropic.MessageCreateParamsNonStreaming
type Block = Anthropic.ContentBlockParam
type Effort = NonNullable<NonNullable<Params['output_config']>['effort']>
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export const STRUCTURED_OUTPUT_TOOL = 'emit_result'
// Thinking counts toward max_tokens on Claude, so a cap sized for the visible reply alone can be spent before any
// text is written, and the turn then ends empty.
const THINKING_HEADROOM_TOKENS = 2048
const IMAGE_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export interface AnthropicMessagesClient {
  messages: {
    create(body: Params, options?: { signal?: AbortSignal; timeout?: number }): PromiseLike<Anthropic.Message>
  }
}

interface Rendered {
  role: 'user' | 'assistant'
  content: Block[]
}

interface PendingCall {
  id: string
  name: string
  hasProviderId: boolean
  answered: boolean
}

function markerBlock(mimeType: string | undefined): Block {
  return { type: 'text', text: attachmentMarker(attachmentKind(mimeType)) }
}

function mediaBlock(mimeType: string | undefined, data: string | undefined, input: ModelProfile['input']): Block {
  if (data && mimeType && IMAGE_TYPES.has(mimeType) && input.image) {
    return { type: 'image', source: { type: 'base64', media_type: mimeType as ImageMediaType, data } }
  }
  if (data && mimeType === 'application/pdf' && input.pdf) {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  }
  return markerBlock(mimeType)
}

/** One message per ADK content, before same-role merging. Leading model turns are dropped (Claude must open on
 * a user turn), and a tool call is kept only when the next content answers it, since Claude 400s on either. */
function renderContents(contents: Content[], input: ModelProfile['input']): Rendered[] {
  const rendered: Rendered[] = []
  let open: { message: Rendered; calls: PendingCall[] } | undefined
  const close = () => {
    if (!open) return
    const answered = new Set(open.calls.filter((call) => call.answered).map((call) => call.id))
    open.message.content = open.message.content.filter((block) => block.type !== 'tool_use' || answered.has(block.id))
    open = undefined
  }
  const firstUser = contents.findIndex((content) => content.role !== 'model')

  for (const [index, content] of contents.entries()) {
    if (firstUser === -1 || index < firstUser) continue
    const parts = (content.parts ?? []).filter((part) => !part.thought)

    if (content.role === 'model') {
      close()
      const message: Rendered = { role: 'assistant', content: [] }
      const calls: PendingCall[] = []
      for (const [partIndex, part] of parts.entries()) {
        if (part.functionCall) {
          const name = part.functionCall.name ?? ''
          // ADK strips its own adk- ids before the model sees them, so id-less history needs a stable stand-in.
          const id = part.functionCall.id ?? `toolu_rk${index}_${partIndex}`
          calls.push({ id, name, hasProviderId: part.functionCall.id !== undefined, answered: false })
          message.content.push({ type: 'tool_use', id, name, input: part.functionCall.args ?? {} })
        } else if (part.text?.trim()) {
          message.content.push({ type: 'text', text: part.text })
        } else if (part.inlineData || part.fileData) {
          message.content.push(markerBlock(part.inlineData?.mimeType ?? part.fileData?.mimeType))
        }
      }
      rendered.push(message)
      open = { message, calls }
      continue
    }

    const results: Block[] = []
    const others: Block[] = []
    for (const part of parts) {
      const response = part.functionResponse
      if (response) {
        const body = JSON.stringify(response.response ?? {})
        const call = open?.calls.find(
          (candidate) =>
            !candidate.answered &&
            (response.id ? candidate.id === response.id : !candidate.hasProviderId && candidate.name === response.name)
        )
        if (call) {
          call.answered = true
          results.push({ type: 'tool_result', tool_use_id: call.id, content: body })
        } else {
          others.push({ type: 'text', text: `(result of ${response.name ?? 'a tool'}: ${body})` })
        }
      } else if (part.text?.trim()) {
        others.push({ type: 'text', text: part.text })
      } else if (part.inlineData) {
        others.push(mediaBlock(part.inlineData.mimeType, part.inlineData.data, input))
      } else if (part.fileData) {
        others.push(markerBlock(part.fileData.mimeType))
      }
    }
    close()
    rendered.push({ role: 'user', content: [...results, ...others] })
  }
  close()
  return rendered.filter((message) => message.content.length > 0)
}

function mergeTurns(rendered: Rendered[]): Anthropic.MessageParam[] {
  const messages: Array<{ role: 'user' | 'assistant'; content: Block[] }> = []
  for (const message of rendered) {
    const last = messages.at(-1)
    if (last?.role === message.role) last.content.push(...message.content)
    else messages.push({ role: message.role, content: [...message.content] })
  }
  for (const message of messages) {
    // Claude requires a user turn's tool results ahead of anything else in it; sort is stable, so order holds.
    if (message.role === 'user') {
      message.content.sort((left, right) => Number(right.type === 'tool_result') - Number(left.type === 'tool_result'))
    }
  }
  return messages
}

function systemBlocks(instruction: unknown): Anthropic.TextBlockParam[] | undefined {
  const text = systemText(instruction)
  if (!text) return undefined
  const split = splitStablePrefix(text)
  if (!split) return [{ type: 'text', text }]
  return [
    { type: 'text', text: split.stable, cache_control: { type: 'ephemeral' } },
    ...(split.rest.trim() ? [{ type: 'text' as const, text: split.rest }] : [])
  ]
}

function toolList(llmRequest: LlmRequest): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = functionDeclarations(llmRequest).map((declaration) => ({
    name: declaration.name,
    ...(declaration.description === undefined ? {} : { description: declaration.description }),
    input_schema: (declaration.parameters ?? { type: 'object', properties: {} }) as Anthropic.Tool['input_schema']
  }))
  const schema = llmRequest.config?.responseJsonSchema
  if (schema !== undefined) {
    tools.push({
      name: STRUCTURED_OUTPUT_TOOL,
      description: 'Return the requested JSON object as the input of this tool.',
      input_schema: schema as Anthropic.Tool['input_schema'],
      strict: true
    })
  }
  return tools
}

function thinkingParams(resolved: ResolvedModel): Pick<Params, 'thinking' | 'output_config'> {
  const effort = resolved.effort ?? resolved.profile.thinking.defaultEffort
  if (!effort) return {}
  if (effort === 'none') return { thinking: { type: 'disabled' } }
  return { thinking: { type: 'adaptive' }, output_config: { effort: effort as Effort } }
}

function toLlmResponse(message: Anthropic.Message): LlmResponse {
  const parts: Part[] = message.content.flatMap((block) =>
    block.type === 'text' && block.text.trim() ? [{ text: block.text }] : []
  )
  return {
    content: { role: 'model', parts: parts.length > 0 ? parts : [{ text: '' }] },
    finishReason: FinishReason.STOP
  }
}

export class AnthropicLlm extends BaseLlm {
  private readonly resolved: ResolvedModel
  private readonly client: AnthropicMessagesClient

  constructor({ resolved, client }: { resolved: ResolvedModel; client?: AnthropicMessagesClient }) {
    super({ model: resolved.model })
    this.resolved = resolved
    this.client =
      client ??
      new Anthropic({
        apiKey: resolved.apiKey,
        ...(resolved.baseUrl ? { baseURL: resolved.baseUrl } : {}),
        maxRetries: 0,
        timeout: resolved.timeoutMs
      })
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    _stream?: boolean,
    abortSignal?: AbortSignal
  ): AsyncGenerator<LlmResponse, void> {
    const shaped = shapeRequest(llmRequest, this.resolved)
    const working: LlmRequest = { ...shaped, contents: [...shaped.contents] }
    this.maybeAppendUserContent(working)
    const system = systemBlocks(working.config?.systemInstruction)
    const tools = toolList(working)
    const rendered = renderContents(working.contents, this.resolved.profile.input)
    const params = this.params(working, system, tools, rendered)
    const message = await this.client.messages.create(params, {
      signal: abortSignal ?? working.config?.abortSignal,
      timeout: this.resolved.timeoutMs
    })
    yield toLlmResponse(message)
  }

  connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error('AnthropicLlm does not support live connections')
  }

  private params(
    llmRequest: LlmRequest,
    system: Anthropic.TextBlockParam[] | undefined,
    tools: Anthropic.Tool[],
    rendered: Rendered[]
  ): Params {
    const config = llmRequest.config
    const thinking = thinkingParams(this.resolved)
    const headroom = thinking.thinking?.type === 'adaptive' ? THINKING_HEADROOM_TOKENS : 0
    return {
      model: this.model,
      max_tokens: (config?.maxOutputTokens ?? this.resolved.maxOutputTokens) + headroom,
      messages: mergeTurns(rendered),
      ...(system ? { system } : {}),
      ...(tools.length > 0 ? { tools } : {}),
      ...(config?.responseJsonSchema === undefined
        ? {}
        : { tool_choice: { type: 'tool' as const, name: STRUCTURED_OUTPUT_TOOL } }),
      ...(config?.temperature === undefined ? {} : { temperature: config.temperature }),
      ...(config?.topP === undefined ? {} : { top_p: config.topP }),
      ...thinking
    }
  }
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `npx vitest run src/agent/llm/__tests__/anthropicLlm.test.ts && npm run typecheck`
Expected: PASS (14 tests); no type errors. If `typecheck` names an SDK type that differs in the installed version (for example a required field on a fixture block), fix the fixture or the cast to match the installed `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/agent/llm/anthropicLlm.ts src/agent/llm/__tests__/anthropicLlm.test.ts src/agent/llm/__tests__/anthropicFixtures.ts
git commit -m "feat(agent): translate ADK requests into Claude Messages API calls"
```

---

### Task 13: AnthropicLlm Responses, Usage And Errors

**Files:**

- Modify: `src/agent/llm/anthropicLlm.ts`
- Test: `src/agent/llm/__tests__/anthropicLlm.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/agent/llm/__tests__/anthropicLlm.test.ts`:

1. Change the vitest import to `import { afterEach, describe, expect, it, vi } from 'vitest'`.
2. After the SDK `vi.mock` block add:

```ts
const budget = vi.hoisted(() => ({ denied: undefined as 'rpm' | 'rpd' | 'tpm' | 'monthly' | undefined }))

vi.mock('../budget.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../budget.js')>()
  return {
    ...actual,
    reserveCall: (input: Parameters<typeof actual.reserveCall>[0]) =>
      budget.denied ? { denied: budget.denied } : actual.reserveCall(input)
  }
})
```

3. Add these imports beside the others:

```ts
import { APIConnectionTimeoutError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import { ProviderError } from '../providerError.js'
import { type CallUsage, WORKLOAD_LABEL, onUsage } from '../usage.js'
```

4. Append at the end of the file:

```ts
afterEach(() => {
  budget.denied = undefined
})

async function answer(message: Anthropic.Message, config: Record<string, unknown> = {}) {
  const { client, create } = fakeClient()
  create.mockResolvedValueOnce(message)
  return run(new AnthropicLlm({ resolved: HAIKU, client }), request([hi], config))
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (caught: unknown) => caught
  )
}

describe('AnthropicLlm responses', () => {
  it('returns tool calls with their provider ids and the tag Gemini needs to read them later', async () => {
    const [response] = await answer(fixtures.toolUse)

    expect(response?.content?.parts).toEqual([
      { text: 'Let me check what I remember.' },
      {
        functionCall: { id: 'toolu_01Fixture', name: 'recall_user', args: { query: 'favourite tea' } },
        thoughtSignature: 'skip_thought_signature_validator'
      }
    ])
    expect(response?.content?.parts?.some((part) => part.thought)).toBe(false)
  })

  it('returns parallel tool calls in the order Claude made them', async () => {
    const [response] = await answer(fixtures.parallelToolUse)

    expect(response?.content?.parts?.map((part) => part.functionCall?.id)).toEqual(['toolu_a', 'toolu_b'])
  })

  it('maps a max_tokens stop to MAX_TOKENS and keeps the partial text', async () => {
    const [response] = await answer(fixtures.maxTokens)

    expect(response?.finishReason).toBe(FinishReason.MAX_TOKENS)
    expect(response?.content?.parts).toEqual([{ text: 'I was about to say' }])
  })

  it('returns the empty-text shape when thinking used every token', async () => {
    const [response] = await answer(fixtures.thinkingOnly)

    expect(response?.content?.parts).toEqual([{ text: '' }])
    expect(response?.finishReason).toBe(FinishReason.MAX_TOKENS)
  })

  it('returns the forced tool input as the JSON text of the first part for a structured request', async () => {
    const [response] = await answer(fixtures.structured, { responseJsonSchema: { type: 'object' } })

    expect(response?.content?.parts).toEqual([{ text: '{"ok":true,"facts":[]}' }])
  })

  it('throws a refusal ProviderError and still records the billed call', async () => {
    const seen: CallUsage[] = []
    const stop = onUsage((usage) => seen.push(usage))

    const failure = await failureOf(answer(fixtures.refusal))
    stop()

    expect(failure).toBeInstanceOf(ProviderError)
    expect(failure).toMatchObject({ provider: 'anthropic', kind: 'refusal' })
    expect(seen).toHaveLength(1)
  })

  it('throws malformed_tool_args when tool input is not an object, so nothing runs', async () => {
    const failure = await failureOf(answer(fixtures.malformedToolUse))

    expect(failure).toMatchObject({ name: 'ProviderError', kind: 'malformed_tool_args' })
  })

  it('records usage once per call and reports it on the response', async () => {
    const seen: CallUsage[] = []
    const stop = onUsage((usage) => seen.push(usage))

    const [response] = await answer(fixtures.text)
    stop()

    expect(seen).toEqual([
      {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        workload: 'reply',
        inputTokens: 412,
        outputTokens: 96,
        reasoningTokens: 64,
        cacheReadTokens: 3880
      }
    ])
    expect(response?.usageMetadata).toEqual({
      promptTokenCount: 4292,
      candidatesTokenCount: 96,
      totalTokenCount: 4388,
      cachedContentTokenCount: 3880,
      thoughtsTokenCount: 64
    })
  })

  it('attributes a labelled background workload', async () => {
    const seen: CallUsage[] = []
    const stop = onUsage((usage) => seen.push(usage))

    await answer(fixtures.structured, {
      responseJsonSchema: { type: 'object' },
      labels: { [WORKLOAD_LABEL]: 'extraction' }
    })
    stop()

    expect(seen[0]?.workload).toBe('extraction')
  })

  it('asks the budget before calling, and makes no call when it is denied', async () => {
    budget.denied = 'monthly'
    const { client, create } = fakeClient()

    const failure = await failureOf(run(new AnthropicLlm({ resolved: HAIKU, client }), request([hi])))

    expect(failure).toMatchObject({ name: 'ProviderError', kind: 'billing_exhausted' })
    expect(create).not.toHaveBeenCalled()
  })
})

describe('Anthropic error classification', () => {
  const body = (type: string, message: string) => ({ type: 'error', error: { type, message } })

  it.each([
    [
      '529 overloaded',
      APIError.generate(529, body('overloaded_error', 'Overloaded'), undefined, new Headers()),
      { kind: 'transient_http', status: 529 }
    ],
    [
      '500 api error',
      APIError.generate(500, body('api_error', 'Internal server error'), undefined, new Headers()),
      { kind: 'transient_http', status: 500 }
    ],
    [
      '429 rate limit',
      APIError.generate(429, body('rate_limit_error', 'Rate limited'), undefined, new Headers({ 'retry-after': '7' })),
      { kind: 'transient_http', status: 429, retryAfterMs: 7000 }
    ],
    [
      '402 billing',
      APIError.generate(402, body('billing_error', 'Out of credit'), undefined, new Headers()),
      { kind: 'billing_exhausted', status: 402 }
    ],
    [
      '400 low credit balance',
      APIError.generate(
        400,
        body('invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'),
        undefined,
        new Headers()
      ),
      { kind: 'billing_exhausted', status: 400 }
    ],
    [
      '400 prompt too long',
      APIError.generate(
        400,
        body('invalid_request_error', 'prompt is too long: 1048577 tokens > 1000000 maximum'),
        undefined,
        new Headers()
      ),
      { kind: 'context_length', status: 400 }
    ],
    [
      '413 request too large',
      APIError.generate(413, body('request_too_large', 'Request too large'), undefined, new Headers()),
      { kind: 'context_length', status: 413 }
    ],
    [
      '401 authentication',
      APIError.generate(401, body('authentication_error', 'invalid x-api-key'), undefined, new Headers()),
      { kind: 'terminal', status: 401 }
    ],
    [
      '400 invalid request',
      APIError.generate(400, body('invalid_request_error', 'messages: roles must alternate'), undefined, new Headers()),
      { kind: 'terminal', status: 400 }
    ],
    ['a connection timeout', new APIConnectionTimeoutError(), { kind: 'network' }],
    ['an aborted request', new APIUserAbortError(), { kind: 'network' }]
  ])('classifies %s', async (_name, error, expected) => {
    const { client, create } = fakeClient()
    create.mockRejectedValueOnce(error)

    const failure = await failureOf(run(new AnthropicLlm({ resolved: HAIKU, client }), request([hi])))

    expect(failure).toBeInstanceOf(ProviderError)
    expect(failure).toMatchObject({ provider: 'anthropic', ...expected })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/agent/llm/__tests__/anthropicLlm.test.ts`
Expected: FAIL (tool calls missing from parts, no `ProviderError`, no usage, no budget call).

- [ ] **Step 3: Implement**

In `src/agent/llm/anthropicLlm.ts`:

1. Change the SDK import to `import Anthropic, { APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'` and add:

```ts
import { grantOrThrow, requestTokenEstimate, reserveCall } from './budget.js'
import { ProviderError } from './providerError.js'
import { type CallUsage, type Workload, recordUsage, workloadOf } from './usage.js'
```

and add `isRecord` to the `./requestShape.js` import.

2. After `IMAGE_TYPES` add:

```ts
const BILLING_PATTERN = /credit balance|billing/i
const CONTEXT_PATTERN = /prompt is too long|context window|too many (?:input )?tokens/i
```

3. Replace `toLlmResponse` with:

```ts
function replyParts(message: Anthropic.Message): Part[] {
  return message.content.flatMap((block): Part[] => {
    if (block.type === 'text') return block.text.trim() ? [{ text: block.text }] : []
    if (block.type !== 'tool_use') return []
    if (!isRecord(block.input)) {
      throw new ProviderError({
        provider: 'anthropic',
        kind: 'malformed_tool_args',
        message: `Anthropic returned non-object arguments for ${block.name}`
      })
    }
    // Gemini rejects an unsigned function call in the current turn; the tag lets it continue a turn Claude began.
    return [
      {
        functionCall: { id: block.id, name: block.name, args: block.input },
        thoughtSignature: 'skip_thought_signature_validator'
      }
    ]
  })
}

function structuredParts(message: Anthropic.Message): Part[] {
  const result = message.content.find((block) => block.type === 'tool_use' && block.name === STRUCTURED_OUTPUT_TOOL)
  return result?.type === 'tool_use' ? [{ text: JSON.stringify(result.input) }] : []
}

function callUsage(model: string, workload: Workload, usage: Anthropic.Usage): CallUsage {
  const reasoning = usage.output_tokens_details?.thinking_tokens
  return {
    provider: 'anthropic',
    model,
    workload,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    ...(reasoning ? { reasoningTokens: reasoning } : {}),
    ...(usage.cache_read_input_tokens ? { cacheReadTokens: usage.cache_read_input_tokens } : {}),
    ...(usage.cache_creation_input_tokens ? { cacheWriteTokens: usage.cache_creation_input_tokens } : {})
  }
}

function usageMetadata(usage: Anthropic.Usage): NonNullable<LlmResponse['usageMetadata']> {
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const prompt = usage.input_tokens + cacheRead + (usage.cache_creation_input_tokens ?? 0)
  const reasoning = usage.output_tokens_details?.thinking_tokens
  return {
    promptTokenCount: prompt,
    candidatesTokenCount: usage.output_tokens,
    totalTokenCount: prompt + usage.output_tokens,
    ...(cacheRead ? { cachedContentTokenCount: cacheRead } : {}),
    ...(reasoning ? { thoughtsTokenCount: reasoning } : {})
  }
}

function toLlmResponse(message: Anthropic.Message, structured: boolean): LlmResponse {
  if (message.stop_reason === 'refusal') {
    throw new ProviderError({
      provider: 'anthropic',
      kind: 'refusal',
      message: `Anthropic refused the request (${message.stop_details?.category ?? 'no category'})`
    })
  }
  const parts = structured ? structuredParts(message) : replyParts(message)
  const truncated = message.stop_reason === 'max_tokens' || message.stop_reason === 'model_context_window_exceeded'
  return {
    content: { role: 'model', parts: parts.length > 0 ? parts : [{ text: '' }] },
    finishReason: truncated ? FinishReason.MAX_TOKENS : FinishReason.STOP,
    usageMetadata: usageMetadata(message.usage)
  }
}

function retryAfterMs(headers: Headers | undefined): number | undefined {
  const value = headers?.get('retry-after')
  const seconds = value ? Number(value) : Number.NaN
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined
}

export function classifyAnthropicError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error
  if (error instanceof APIUserAbortError || error instanceof APIConnectionError) {
    return new ProviderError({
      provider: 'anthropic',
      kind: 'network',
      message: `Anthropic ${error.message}`,
      cause: error
    })
  }
  if (!(error instanceof APIError)) {
    const message = error instanceof Error ? error.message : String(error)
    return new ProviderError({ provider: 'anthropic', kind: 'terminal', message, cause: error })
  }
  const { status } = error
  const failure = {
    provider: 'anthropic' as const,
    message: `Anthropic ${status ?? ''} ${error.type ?? 'error'}: ${error.message}`.slice(0, 300),
    status,
    cause: error
  }
  if (status === 402 || error.type === 'billing_error' || BILLING_PATTERN.test(error.message)) {
    return new ProviderError({ ...failure, kind: 'billing_exhausted' })
  }
  if (status === 413 || (status === 400 && CONTEXT_PATTERN.test(error.message))) {
    return new ProviderError({ ...failure, kind: 'context_length' })
  }
  if (status === 429) {
    return new ProviderError({ ...failure, kind: 'transient_http', retryAfterMs: retryAfterMs(error.headers) })
  }
  if (error.type === 'overloaded_error' || (status !== undefined && status >= 500)) {
    return new ProviderError({ ...failure, kind: 'transient_http' })
  }
  return new ProviderError({ ...failure, kind: 'terminal' })
}
```

4. Replace the body of `generateContentAsync` with:

```ts
const shaped = shapeRequest(llmRequest, this.resolved)
const working: LlmRequest = { ...shaped, contents: [...shaped.contents] }
this.maybeAppendUserContent(working)
const system = systemBlocks(working.config?.systemInstruction)
const tools = toolList(working)
const rendered = renderContents(working.contents, this.resolved.profile.input)
const structured = working.config?.responseJsonSchema !== undefined
const params = this.params(working, system, tools, rendered)
const workload = workloadOf(working)
const grant = grantOrThrow(
  'anthropic',
  reserveCall({ provider: 'anthropic', model: this.model, workload, estTokens: requestTokenEstimate(params) })
)
let message: Anthropic.Message
try {
  message = await this.client.messages.create(params, {
    signal: abortSignal ?? working.config?.abortSignal,
    timeout: this.resolved.timeoutMs
  })
} catch (error) {
  grant.release()
  throw classifyAnthropicError(error)
}
const usage = callUsage(this.model, workload, message.usage)
recordUsage(usage)
grant.release(usage)
yield toLlmResponse(message, structured)
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/agent/llm/__tests__/anthropicLlm.test.ts && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/agent/llm/anthropicLlm.ts src/agent/llm/__tests__/anthropicLlm.test.ts
git commit -m "feat(agent): map Claude responses, usage and errors onto ADK and ProviderError"
```

---

### Task 14: AnthropicLlm Thinking Within One Turn

D10: thinking travels only inside one turn's tool loop and never into ADK session history. The adapter keeps each tool call's original content (thinking blocks included) in a `WeakMap` keyed by the turn's `ModelRoute`, and sends it back only when every byte before it is unchanged, so Haiku's history-binding check never sees an edited prefix (a FIFO window trim or a safety-ladder prompt change simply drops the thinking instead of costing a 400).

**Files:**

- Modify: `src/agent/llm/anthropicLlm.ts`
- Test: `src/agent/llm/__tests__/anthropicLlm.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `import { type ModelRoute, modelRouteForRequest } from '../../fallbackModel.js'` to the test imports and append:

```ts
describe('AnthropicLlm thinking within a turn', () => {
  const route = (): ModelRoute => ({ useFallback: false, hedged: false, answeredBy: null, pinned: null })
  const toolResult: Content = {
    role: 'user',
    parts: [{ functionResponse: { id: 'toolu_01Fixture', name: 'recall_user', response: { facts: ['likes oolong'] } } }]
  }
  const replayed = {
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: '', signature: 'sig-tool' },
      { type: 'text', text: 'Let me check what I remember.' },
      { type: 'tool_use', id: 'toolu_01Fixture', name: 'recall_user', input: { query: 'favourite tea' } }
    ]
  }
  const withoutThinking = {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Let me check what I remember.' },
      { type: 'tool_use', id: 'toolu_01Fixture', name: 'recall_user', input: { query: 'favourite tea' } }
    ]
  }

  /** Runs a tool call and its follow-up, as ADK would, and returns the follow-up's assistant message. */
  async function followUp(options: {
    firstTurn?: ModelRoute
    secondTurn?: ModelRoute
    firstContents?: Content[]
    secondPrefix?: Content[]
    secondSystem?: string
  }) {
    const { client, create } = fakeClient()
    create.mockResolvedValueOnce(fixtures.toolUse).mockResolvedValueOnce(fixtures.text)
    const llm = new AnthropicLlm({ resolved: HAIKU, client })
    const inTurn = <T>(turn: ModelRoute | undefined, work: () => Promise<T>) =>
      turn ? modelRouteForRequest.run(turn, work) : work()

    const [first] = await inTurn(options.firstTurn, () =>
      run(llm, request(options.firstContents ?? [hi], { systemInstruction: 'You are Roka.' }))
    )
    const prefix = options.secondPrefix ?? options.firstContents ?? [hi]
    await inTurn(options.secondTurn, () =>
      run(
        llm,
        request([...prefix, first!.content!, toolResult], {
          systemInstruction: options.secondSystem ?? 'You are Roka.'
        })
      )
    )
    const messages = create.mock.calls[1]?.[0].messages ?? []
    return messages[prefix.length === 0 ? 0 : 1]
  }

  it('sends the thinking back with its tool result, exactly as Claude produced it', async () => {
    const turn = route()

    expect(await followUp({ firstTurn: turn, secondTurn: turn })).toEqual(replayed)
  })

  it('never carries thinking into the next turn', async () => {
    expect(await followUp({ firstTurn: route(), secondTurn: route() })).toEqual(withoutThinking)
  })

  it('drops the thinking when the system prompt changed inside the turn', async () => {
    const turn = route()

    expect(await followUp({ firstTurn: turn, secondTurn: turn, secondSystem: 'You are Roka. Be brief.' })).toEqual(
      withoutThinking
    )
  })

  it('drops the thinking when earlier history changed inside the turn', async () => {
    const turn = route()
    const earlier: Content = { role: 'user', parts: [{ text: '[Ren]: morning all' }] }

    expect(
      await followUp({ firstTurn: turn, secondTurn: turn, firstContents: [earlier, hi], secondPrefix: [hi] })
    ).toEqual(withoutThinking)
  })

  it('keeps nothing for calls made outside a turn', async () => {
    expect(await followUp({})).toEqual(withoutThinking)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/agent/llm/__tests__/anthropicLlm.test.ts -t "thinking within a turn"`
Expected: FAIL only on "sends the thinking back..." (received the message without the thinking block); the other four already pass, which pins the D10 boundary before the store exists.

- [ ] **Step 3: Implement**

In `src/agent/llm/anthropicLlm.ts` add `import { createHash } from 'node:crypto'` at the top and `import { type ModelRoute, modelRouteForRequest } from '../fallbackModel.js'` with the other relative imports. After the `PendingCall` interface add:

```ts
interface ThinkingReplay {
  prefixHash: string
  toolUseIds: string[]
  content: Block[]
}

// Keyed by the turn's route, so a turn's thinking is dropped with the turn and never reaches the next (D10).
const thinkingByTurn = new WeakMap<ModelRoute, Map<string, ThinkingReplay>>()

function prefixHash(system: unknown, tools: unknown, messages: Rendered[]): string {
  return createHash('sha256').update(JSON.stringify({ system, tools, messages })).digest('hex')
}

function toolUseIds(content: Block[]): string[] {
  return content.flatMap((block) => (block.type === 'tool_use' ? [block.id] : []))
}

function toParam(block: Anthropic.ContentBlock): Block[] {
  switch (block.type) {
    case 'thinking':
      return [{ type: 'thinking', thinking: block.thinking, signature: block.signature }]
    case 'redacted_thinking':
      return [{ type: 'redacted_thinking', data: block.data }]
    case 'text':
      return block.text.trim() ? [{ type: 'text', text: block.text }] : []
    case 'tool_use':
      return [{ type: 'tool_use', id: block.id, name: block.name, input: block.input }]
    default:
      return []
  }
}

/** Claude rejects a thinking block whose prefix (system, tools, earlier messages) changed, so a block goes back
 * only when the prefix hash taken when it was produced still matches; otherwise the plain ADK rendering is sent. */
function replayThinking(
  rendered: Rendered[],
  system: unknown,
  tools: unknown,
  route: ModelRoute | undefined
): Rendered[] {
  const turn = route ? thinkingByTurn.get(route) : undefined
  if (!turn) return rendered
  const replayed: Rendered[] = []
  for (const message of rendered) {
    const ids = message.role === 'assistant' ? toolUseIds(message.content) : []
    const record = ids.length > 0 ? turn.get(ids[0]) : undefined
    const intact =
      record !== undefined &&
      record.toolUseIds.join() === ids.join() &&
      record.prefixHash === prefixHash(system, tools, replayed)
    replayed.push(intact && record ? { role: 'assistant', content: record.content } : message)
  }
  return replayed
}

function rememberThinking(
  route: ModelRoute | undefined,
  message: Anthropic.Message,
  replayWithinTurn: boolean,
  prefix: string
): void {
  if (!route || !replayWithinTurn || message.stop_reason !== 'tool_use') return
  const content = message.content.flatMap(toParam)
  const ids = toolUseIds(content)
  if (ids.length === 0 || !content.some((block) => block.type === 'thinking' || block.type === 'redacted_thinking'))
    return
  const turn = thinkingByTurn.get(route) ?? new Map<string, ThinkingReplay>()
  turn.set(ids[0], { prefixHash: prefix, toolUseIds: ids, content })
  thinkingByTurn.set(route, turn)
}
```

In `generateContentAsync`, replace

```ts
const rendered = renderContents(working.contents, this.resolved.profile.input)
```

with

```ts
const route = modelRouteForRequest.getStore()
const rendered = replayThinking(renderContents(working.contents, this.resolved.profile.input), system, tools, route)
```

and replace `yield toLlmResponse(message, structured)` with

```ts
rememberThinking(route, message, this.resolved.profile.thinking.replayWithinTurn, prefixHash(system, tools, rendered))
yield toLlmResponse(message, structured)
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/agent/llm/__tests__/anthropicLlm.test.ts && npm run typecheck`
Expected: PASS (all Anthropic suites); no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/agent/llm/anthropicLlm.ts src/agent/llm/__tests__/anthropicLlm.test.ts
git commit -m "feat(agent): carry Claude thinking through one turn's tool loop and never into history"
```

---

### Task 15: `createModel.ts` And The Reliability Wiring

**Files:**

- Create: `src/agent/llm/createModel.ts`
- Modify: `src/agent/fallbackModel.ts` (remove `createRokaModel` and the `Gemini` import; default hedge from `config.llm`)
- Modify: `src/agent/reliability.ts:6`, `:27-31`
- Test: `src/agent/llm/__tests__/createModel.test.ts`; update `src/agent/__tests__/fallbackModel.test.ts`, `src/agent/__tests__/modelHedge.test.ts`, `src/agent/__tests__/modelFallback.test.ts`, `src/agent/__tests__/reliability.eval.test.ts`

- [ ] **Step 1: Write the failing test**

`src/agent/llm/__tests__/createModel.test.ts`:

```ts
import { Gemini } from '@google/adk'
import type { LlmRequest, LlmResponse } from '@google/adk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const configState = vi.hoisted(() => ({
  logging: { level: 'silent' },
  gemini: { hedgeAfterMs: 5000 },
  fallback: { baseUrl: 'https://api-inference.modelscope.ai/v1' },
  llm: {
    main: undefined as unknown,
    fallback: null as unknown,
    hedgeAfterMs: 5000,
    stickyMs: 300_000,
    monthlyBudgetUsd: {}
  }
}))

vi.mock('../../../config.js', () => ({ config: configState }))

import type { ResolvedModel } from '../../../config.js'
import { ModelScopeLlm, RoutedLlm } from '../../fallbackModel.js'
import { AnthropicLlm } from '../anthropicLlm.js'
import { createLlm, createRokaModel } from '../createModel.js'
import { profileFor } from '../profiles.js'
import { type CallUsage, onUsage } from '../usage.js'

const legacyGemini: ResolvedModel = {
  key: 'legacy-gemini',
  provider: 'gemini',
  model: 'gemini-3.5-flash-lite',
  profile: profileFor('gemini', 'gemini-3.5-flash-lite')!,
  apiKey: 'vitest-gemini-token',
  timeoutMs: 20_000,
  maxOutputTokens: 500
}
const legacyFallback: ResolvedModel = {
  key: 'legacy-fallback',
  provider: 'modelscope',
  model: 'Qwen/Qwen3.5-122B-A10B',
  profile: profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B')!,
  apiKey: 'modelscope-key',
  baseUrl: 'https://api-inference.modelscope.ai/v1',
  timeoutMs: 15_000,
  maxOutputTokens: 500
}
const haiku: ResolvedModel = {
  key: 'haiku',
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  profile: profileFor('anthropic', 'claude-haiku-5-5')!,
  apiKey: 'anthropic-key',
  timeoutMs: 20_000,
  maxOutputTokens: 500,
  effort: 'low'
}

beforeEach(() => {
  configState.llm.main = legacyGemini
  configState.llm.fallback = null
  configState.llm.hedgeAfterMs = 5000
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createRokaModel', () => {
  it('builds the legacy route: Gemini main, no fallback, per-call hedging', () => {
    const model = createRokaModel()

    expect(model).toBeInstanceOf(RoutedLlm)
    expect(model.model).toBe('gemini-3.5-flash-lite')
    expect(Reflect.get(model, 'primary')).toBeInstanceOf(Gemini)
    expect(model.hasFallback).toBe(false)
    expect(model.hedgeAfterMs).toBe(5000)
    expect(Reflect.get(model, 'pinTurns')).toBe(false)
  })

  it('builds the legacy ModelScope fallback with its own endpoint and timeout', () => {
    configState.llm.fallback = legacyFallback

    const model = createRokaModel()
    const fallback = Reflect.get(model, 'fallback')

    expect(fallback).toBeInstanceOf(ModelScopeLlm)
    expect(fallback).toMatchObject({
      model: 'Qwen/Qwen3.5-122B-A10B',
      apiKey: 'modelscope-key',
      baseUrl: 'https://api-inference.modelscope.ai/v1',
      timeoutMs: 15_000
    })
    expect(model.fallbackModelName).toBe('Qwen/Qwen3.5-122B-A10B')
    expect(Reflect.get(model, 'pinTurns')).toBe(false)
  })

  it('builds AnthropicLlm for a Claude main and pins turns, because Claude replays thinking within a turn', () => {
    configState.llm.main = haiku
    configState.llm.fallback = legacyGemini
    configState.llm.hedgeAfterMs = 0

    const model = createRokaModel()

    expect(Reflect.get(model, 'primary')).toBeInstanceOf(AnthropicLlm)
    expect(Reflect.get(model, 'fallback')).toBeInstanceOf(Gemini)
    expect(model.hedgeAfterMs).toBe(0)
    expect(Reflect.get(model, 'pinTurns')).toBe(true)
  })
})

describe('createLlm', () => {
  it('has no adapter for openai until the Chat Completions phase', () => {
    expect(() => createLlm({ ...haiku, provider: 'openai', model: 'gpt-6-luna' })).toThrow(
      'No adapter serves openai yet'
    )
  })

  it('sends Gemini requests unchanged and records Gemini usage', async () => {
    const seen: LlmRequest[] = []
    vi.spyOn(Gemini.prototype, 'generateContentAsync').mockImplementation(async function* (llmRequest: LlmRequest) {
      seen.push(llmRequest)
      const response: LlmResponse = {
        content: { role: 'model', parts: [{ text: 'hi' }] },
        usageMetadata: {
          promptTokenCount: 120,
          cachedContentTokenCount: 20,
          candidatesTokenCount: 30,
          thoughtsTokenCount: 5,
          totalTokenCount: 155
        }
      }
      yield response
    })
    const usages: CallUsage[] = []
    const stop = onUsage((usage) => usages.push(usage))
    const config = {
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: 500,
      safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' }]
    }
    const llmRequest = {
      model: 'gemini-3.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      config,
      toolsDict: {},
      liveConnectConfig: {}
    } as unknown as LlmRequest

    const responses: LlmResponse[] = []
    for await (const response of createLlm(legacyGemini).generateContentAsync(llmRequest)) responses.push(response)
    stop()

    expect(seen[0]?.config).toEqual(config)
    expect(seen[0]?.contents).toBe(llmRequest.contents)
    expect(responses[0]?.content?.parts?.[0]?.text).toBe('hi')
    expect(usages).toEqual([
      {
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        workload: 'reply',
        inputTokens: 100,
        outputTokens: 30,
        reasoningTokens: 5,
        cacheReadTokens: 20
      }
    ])
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/agent/llm/__tests__/createModel.test.ts`
Expected: FAIL with `Failed to load url ../createModel.js`.

- [ ] **Step 3: Write `src/agent/llm/createModel.ts`**

```ts
import { Gemini } from '@google/adk'
import type { BaseLlm, LlmRequest, LlmResponse } from '@google/adk'
import { config } from '../../config.js'
import type { ResolvedModel } from '../../config.js'
import { ModelScopeLlm, RoutedLlm } from '../fallbackModel.js'
import { AnthropicLlm } from './anthropicLlm.js'
import { grantOrThrow, requestTokenEstimate, reserveCall } from './budget.js'
import { shapeRequest } from './requestShape.js'
import { type CallUsage, type Workload, recordUsage, workloadOf } from './usage.js'

function geminiUsage(
  model: string,
  workload: Workload,
  metadata: NonNullable<LlmResponse['usageMetadata']>
): CallUsage {
  const cached = metadata.cachedContentTokenCount ?? 0
  return {
    provider: 'gemini',
    model,
    workload,
    inputTokens: Math.max(0, (metadata.promptTokenCount ?? 0) - cached),
    outputTokens: metadata.candidatesTokenCount ?? 0,
    ...(metadata.thoughtsTokenCount ? { reasoningTokens: metadata.thoughtsTokenCount } : {}),
    ...(cached ? { cacheReadTokens: cached } : {})
  }
}

/** ADK's Gemini with request shaping, a budget reservation and usage recording around each call. */
class GeminiLlm extends Gemini {
  constructor(private readonly resolved: ResolvedModel) {
    super({ model: resolved.model })
  }

  override async *generateContentAsync(
    llmRequest: LlmRequest,
    stream = false,
    abortSignal?: AbortSignal
  ): AsyncGenerator<LlmResponse, void> {
    const workload = workloadOf(llmRequest)
    const shaped = shapeRequest(llmRequest, this.resolved)
    const grant = grantOrThrow(
      'gemini',
      reserveCall({
        provider: 'gemini',
        model: this.model,
        workload,
        estTokens: requestTokenEstimate([shaped.config?.systemInstruction, shaped.contents])
      })
    )
    let usage: CallUsage | undefined
    try {
      for await (const response of super.generateContentAsync(shaped, stream, abortSignal)) {
        if (response.usageMetadata) usage = geminiUsage(this.model, workload, response.usageMetadata)
        yield response
      }
    } finally {
      if (usage) recordUsage(usage)
      grant.release(usage)
    }
  }
}

export function createLlm(resolved: ResolvedModel): BaseLlm {
  switch (resolved.provider) {
    case 'gemini':
      return new GeminiLlm(resolved)
    case 'anthropic':
      return new AnthropicLlm({ resolved })
    case 'modelscope':
      return new ModelScopeLlm({
        model: resolved.model,
        apiKey: resolved.apiKey,
        baseUrl: resolved.baseUrl ?? config.fallback.baseUrl,
        timeoutMs: resolved.timeoutMs
      })
    case 'openai':
      throw new Error('No adapter serves openai yet; the Chat Completions adapter lands in a later phase')
  }
}

export function createRokaModel(): RoutedLlm {
  const { main, fallback, hedgeAfterMs } = config.llm
  // Pinning only binds when a side carries turn state the other cannot continue (Claude's thinking); Gemini and
  // ModelScope keep hedging every call, tool round-trips included, as they do today.
  const pinTurns = [main, fallback].some((resolved) => resolved?.profile.thinking.replayWithinTurn === true)
  return new RoutedLlm(createLlm(main), fallback ? createLlm(fallback) : null, hedgeAfterMs, { pinTurns })
}
```

- [ ] **Step 4: Remove the old factory and rewire reliability**

In `src/agent/fallbackModel.ts`:

- delete `createRokaModel` (lines 524-536);
- change `import { BaseLlm, Gemini } from '@google/adk'` to `import { BaseLlm } from '@google/adk'`;
- change the `RoutedLlm` default `hedgeAfterMs: number = config.gemini.hedgeAfterMs` to `hedgeAfterMs: number = config.llm.hedgeAfterMs`.

In `src/agent/reliability.ts`:

- replace line 6 with:

```ts
import { modelRouteForRequest } from './fallbackModel.js'
import { createRokaModel } from './llm/createModel.js'
```

- replace `modelNameForCurrentRequest` (lines 27-31) with:

```ts
export function modelNameForCurrentRequest(): string {
  return modelRouteForRequest.getStore()?.useFallback && rokaModel.hasFallback
    ? (rokaModel.fallbackModelName ?? rokaModel.model)
    : rokaModel.model
}
```

- [ ] **Step 5: Update the tests that mock the old factory or a partial config**

1. `src/agent/__tests__/fallbackModel.test.ts`: remove `createRokaModel` from the import on line 23, delete the whole `describe('createRokaModel'` block (lines 474-501), and add `llm: { hedgeAfterMs: 0 },` to `configState`.
2. `src/agent/__tests__/modelHedge.test.ts`: change both mocks to `vi.mock('../../config.js', () => ({ config: { gemini: { model: 'gemini-test' }, llm: { hedgeAfterMs: 0 } } }))` (and the same object for `'../src/agent/../config.js'`).
3. `src/agent/__tests__/modelFallback.test.ts`: replace the `vi.mock('../fallbackModel.js', ...)` block (lines 6-18) with:

```ts
vi.mock('../llm/createModel.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../llm/createModel.js')>()
  const { Gemini } = await import('@google/adk')
  const { RoutedLlm } = await import('../fallbackModel.js')

  return {
    ...original,
    createRokaModel: () => {
      const model = new RoutedLlm(new Gemini({ model: 'gemini-test' }), new Gemini({ model: 'fallback-test' }))
      Object.defineProperty(model, 'hasFallback', { get: () => mocks.hasFallback })
      return model
    }
  }
})
```

4. `src/agent/__tests__/reliability.eval.test.ts`: make the config mock factory async and add an `llm` entry to the mocked `config` object:

```ts
vi.mock('../../config.js', async () => {
  const { profileFor } = await import('../llm/profiles.js')
  return {
    config: {
      // ...every existing key stays exactly as it is...
      llm: {
        main: {
          key: 'legacy-gemini',
          provider: 'gemini',
          model: 'gemini-test',
          profile: { ...profileFor('gemini', 'gemini-3.5-flash-lite')!, model: 'gemini-test' },
          apiKey: 'test-key',
          timeoutMs: 100,
          maxOutputTokens: 300
        },
        fallback: null,
        hedgeAfterMs: 0,
        stickyMs: 300_000,
        monthlyBudgetUsd: {}
      }
    }
  }
})
```

5. Run `grep -rn "createRokaModel\|fallbackModel.js'" src tests --include=*.ts` and confirm no test still mocks `createRokaModel` on `../fallbackModel.js`.

- [ ] **Step 6: Run the agent suites**

Run: `npx vitest run src/agent && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/agent/llm/createModel.ts src/agent/llm/__tests__/createModel.test.ts src/agent/fallbackModel.ts src/agent/reliability.ts src/agent/__tests__/fallbackModel.test.ts src/agent/__tests__/modelHedge.test.ts src/agent/__tests__/modelFallback.test.ts src/agent/__tests__/reliability.eval.test.ts
git commit -m "feat(agent): build the reply route from config.llm through one adapter per provider"
```

---

### Task 16: Roka Reads `config.llm` For Timeouts, Stickiness And Pins

**Files:**

- Modify: `src/agent/roka.ts:18`, `:23-32`, `:292-295`, `:409`, `:418-434`, `:539-541`
- Test: `src/agent/__tests__/modelFallback.test.ts`

- [ ] **Step 1: Move the tests to `config.llm`**

In `src/agent/__tests__/modelFallback.test.ts`:

1. Add imports: `import type { ResolvedModel } from '../../config.js'` and `import { profileFor } from '../llm/profiles.js'`.
2. Replace `const mutableFallbackConfig = config.fallback as unknown as { timeoutMs: number; stickyMs: number }` with:

```ts
const mutableLlm = config.llm as unknown as { main: ResolvedModel; fallback: ResolvedModel | null; stickyMs: number }
const testFallback: ResolvedModel = {
  key: 'test-fallback',
  provider: 'modelscope',
  model: 'fallback-test',
  profile: profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B')!,
  apiKey: 'test-modelscope-key',
  baseUrl: 'https://fallback.test/v1',
  timeoutMs: 15_000,
  maxOutputTokens: 500
}
```

3. Remove `timeout: number` from the `mutableGeminiConfig` type. In `originalConfig` replace `fallbackTimeoutMs`, `stickyMs` and `geminiTimeout` with `llmMain: mutableLlm.main, llmFallback: mutableLlm.fallback, llmStickyMs: mutableLlm.stickyMs,`.
4. In `beforeEach`, replace the three lines setting `mutableFallbackConfig.timeoutMs`, `mutableFallbackConfig.stickyMs` and `mutableGeminiConfig.timeout` with:

```ts
mutableLlm.main = { ...originalConfig.llmMain }
mutableLlm.fallback = { ...testFallback }
mutableLlm.stickyMs = originalConfig.llmStickyMs
```

and in `afterEach` replace the same three lines with:

```ts
mutableLlm.main = originalConfig.llmMain
mutableLlm.fallback = originalConfig.llmFallback
mutableLlm.stickyMs = originalConfig.llmStickyMs
```

5. In the test bodies: `mutableFallbackConfig.timeoutMs = 12` → `mutableLlm.fallback!.timeoutMs = 12`; every `mutableFallbackConfig.stickyMs = X` → `mutableLlm.stickyMs = X`; `mutableGeminiConfig.timeout = 1_000` → `mutableLlm.main.timeoutMs = 1_000`.
6. Add to `describe('generateResponse model fallback'`:

```ts
it('does not arm the sticky window when a refusal moved the turn to the fallback', async () => {
  mutableLlm.stickyMs = 10_000
  const routes: Array<boolean | undefined> = []
  __setTestRunTurnFactory(() => async (attempt) => {
    routes.push(modelRouteForRequest.getStore()?.useFallback)
    return attempt === 0
      ? {
          errorCode: 'ProviderError',
          errorMessage: 'Anthropic refused the request (cyber)',
          customMetadata: { reliabilityKind: 'refusal' },
          hasText: false,
          hasFunctionCall: false
        }
      : { text: 'Fallback answer~', hasText: true, hasFunctionCall: false }
  })

  expect((await generateResponse(responseOptions())).text).toBe('Fallback answer~')

  const nextRoutes: Array<boolean | undefined> = []
  __setTestRunTurnFactory(() => async () => {
    nextRoutes.push(modelRouteForRequest.getStore()?.useFallback)
    return { text: 'Main again~', hasText: true, hasFunctionCall: false }
  })
  await generateResponse(responseOptions('Next turn.'))

  expect(routes).toEqual([false, true])
  expect(nextRoutes).toEqual([false])
})

it('starts the other side unpinned after the ladder switches', async () => {
  const pins: Array<string | null | undefined> = []
  __setTestRunTurnFactory(() => async (attempt) => {
    const route = modelRouteForRequest.getStore()
    pins.push(route?.pinned)
    if (route && attempt === 0) route.pinned = 'main'
    return attempt === 0
      ? { errorCode: '503', hasText: false, hasFunctionCall: false }
      : { text: 'Fallback answer~', hasText: true, hasFunctionCall: false }
  })

  await generateResponse(responseOptions())

  expect(pins).toEqual([null, null])
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/agent/__tests__/modelFallback.test.ts`
Expected: FAIL — the 12 ms fallback timeout is ignored (roka still reads `config.fallback.timeoutMs`), the refusal arms the window (`nextRoutes` is `[true]`), and the pin survives the switch (`['main']` on attempt 1).

- [ ] **Step 3: Implement in `src/agent/roka.ts`**

Add `import type { FailureKind } from './geminiReliability.js'` below the `computeBackoff` import, and add `STICKY_KINDS` to the `./reliability.js` import list.

After `getRandomFallback` (line 295) add:

```ts
function requestTimeoutFor(useFallback: boolean): number {
  return useFallback && config.llm.fallback ? config.llm.fallback.timeoutMs : config.llm.main.timeoutMs
}
```

After `let movedAwayFromGemini = false` (line 409) add `let switchKind: FailureKind | undefined`.

Replace line 418 with `              requestTimeoutMs: requestTimeoutFor(route.useFallback),` and the `switchModel` callback (lines 420-434) with:

```ts
              switchModel: (kind) => {
                if (!rokaModel.hasFallback) return undefined

                route.useFallback = !route.useFallback
                // A ladder switch is a new attempt on the other side, so that side's first answer sets the pin.
                route.pinned = null
                switchKind = kind
                if (route.useFallback) {
                  movedAwayFromGemini = true
                  logger.warn(
                    { channelId, kind, model: rokaModel.fallbackModelName },
                    'Gemini unavailable, answering this turn with the fallback model'
                  )
                  return requestTimeoutFor(true)
                }

                return requestTimeoutFor(false)
              },
```

Replace lines 539-541:

```ts
if (movedAwayFromGemini) {
  setFallbackUntilMs(config.fallback.stickyMs > 0 ? Date.now() + config.fallback.stickyMs : 0)
}
```

with:

```ts
if (movedAwayFromGemini && switchKind !== undefined && STICKY_KINDS.has(switchKind)) {
  setFallbackUntilMs(config.llm.stickyMs > 0 ? Date.now() + config.llm.stickyMs : 0)
}
```

- [ ] **Step 4: Run the agent and harness suites**

Run: `npx vitest run src/agent tests/harness/__tests__/harness.eval.test.ts && npm run typecheck`
Expected: PASS (the legacy synthesis makes `config.llm.main.timeoutMs === config.gemini.timeout` and `config.llm.stickyMs === config.fallback.stickyMs`, so production timing is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/agent/roka.ts src/agent/__tests__/modelFallback.test.ts
git commit -m "feat(agent): take reply timeouts and the sticky window from config.llm and reset the pin on a switch"
```

---

### Task 17: Harness Test, A Claude Haiku Main Through The Real Handlers

**Files:**

- Create: `tests/harness/__tests__/anthropicMain.eval.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../env.js'

const mocks = vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'harness-anthropic-key'
  return { create: vi.fn(), clientOptions: [] as unknown[] }
})

vi.mock('js-yaml', async (importOriginal) => {
  const actual = await importOriginal<typeof import('js-yaml')>()
  return {
    ...actual,
    load: (raw: string) => ({
      ...(actual.load(raw) as Record<string, unknown>),
      llm: { main: 'haiku', models: { haiku: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'low' } } }
    })
  }
})

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>()
  class FakeAnthropic {
    messages = { create: mocks.create }

    constructor(options: unknown) {
      mocks.clientOptions.push(options)
    }
  }
  return { ...actual, default: FakeAnthropic }
})

// Embeddings and token counting would otherwise reach Google with the harness's fake key.
vi.mock('@google/genai', async (importOriginal) => {
  const offline = async () => {
    throw new Error('offline harness: no Google calls')
  }
  return {
    ...(await importOriginal<object>()),
    GoogleGenAI: class {
      models = { generateContent: offline, embedContent: offline, countTokens: offline }
    }
  }
})

import type Anthropic from '@anthropic-ai/sdk'
import { destroySession } from '../../../src/agent/session.js'
import { createMessageHandler } from '../../../src/discord/events/messageCreate.js'
import { getDb } from '../../../src/storage/database.js'
import { RateLimiter } from '../../../src/utils/rateLimiter.js'
import { createCaptureSink } from '../captureSink.js'
import { makeClient, makeGuild, makeMessage } from '../discordDoubles.js'
import { renderPayload } from '../renderPayload.js'

const CHANNEL = 'haiku-main-channel'
const REPLY = 'Ehehe, Haiku answered you through the real handlers~'

afterEach(async () => {
  await destroySession(CHANNEL)
  mocks.create.mockReset()
})

describe('a Claude Haiku main model through the real handlers', () => {
  it('answers a mention with Haiku and records the provider that answered', async () => {
    mocks.create.mockResolvedValueOnce({
      id: 'msg_harness',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      container: null,
      diagnostics: null,
      content: [
        { type: 'thinking', thinking: '', signature: 'sig-harness' },
        { type: 'text', text: REPLY, citations: null }
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      stop_details: null,
      usage: {
        input_tokens: 900,
        output_tokens: 40,
        cache_creation_input_tokens: 4100,
        cache_read_input_tokens: 0,
        cache_creation: null,
        inference_geo: 'global',
        output_tokens_details: { thinking_tokens: 12 },
        server_tool_use: null,
        service_tier: 'standard'
      }
    } satisfies Anthropic.Message)
    const sink = createCaptureSink()

    await createMessageHandler(
      makeClient() as never,
      new RateLimiter({ rpm: 4, rpd: 1 })
    )(
      makeMessage({
        mentions: ['roka'],
        guild: makeGuild(),
        guildId: 'haiku-guild',
        content: '<@roka> Hello Haiku, are you there?',
        channelId: CHANNEL,
        sink
      }) as never
    )

    const reply = sink.all().find((record) => record.kind === 'reply')
    expect(reply).toBeDefined()
    expect(renderPayload({ ...reply!, channelId: null, ts: 0 })).toContain(REPLY)

    expect(mocks.clientOptions).toContainEqual(
      expect.objectContaining({ apiKey: 'harness-anthropic-key', maxRetries: 0 })
    )
    expect(mocks.create).toHaveBeenCalledOnce()
    const [body] = mocks.create.mock.calls[0] as [Anthropic.MessageCreateParamsNonStreaming]
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' }
    })
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('top_p')
    expect(Array.isArray(body.system) ? body.system[0] : undefined).toMatchObject({
      cache_control: { type: 'ephemeral' }
    })
    expect(JSON.stringify(body.messages)).toContain('Hello Haiku, are you there?')
    expect(body.tools?.length).toBeGreaterThan(0)

    expect(
      getDb()
        .prepare('SELECT provider, model_id, route_role, workload FROM response_events WHERE channel_id = ?')
        .get(CHANNEL)
    ).toEqual({ provider: 'anthropic', model_id: 'claude-haiku-5-5', route_role: 'main', workload: 'reply' })
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/harness/__tests__/anthropicMain.eval.test.ts`
Expected: PASS. Before Tasks 1-16 it cannot pass, so there is no separate red step; to see it guard the wiring, temporarily change `effort: 'low'` in the YAML mock to `effort: 'none'` and confirm the `thinking` assertion fails, then revert. If the turn makes another outbound call the failure names it; mock that client the same way `@google/genai` is mocked here.

- [ ] **Step 3: Commit**

```bash
git add tests/harness/__tests__/anthropicMain.eval.test.ts
git commit -m "test(agent): drive a Claude Haiku main reply through the real Discord handlers"
```

---

### Task 18: Document The Provider Layer

**Files:**

- Modify: `docs/trd.md` (new `### Model Providers` before `### The Fallback Model`; failure taxonomy rows; hedging recording bullet)
- Modify: `docs/runbook.md` (new `## Switching the Reply Model`; hedging query)

- [ ] **Step 1: Add the contract to `docs/trd.md`**

Insert before `### The Fallback Model`:

```md
### Model Providers

`config.llm` (`src/config.ts`) holds a main model and an optional fallback, each a `ResolvedModel` naming a
key under `llm.models`. Without an `llm:` block, startup synthesises the route the bot has always run:
`gemini.model` as main, `fallback.model` on ModelScope when `MODELSCOPE_API_KEY` is set, with
`gemini.hedgeAfterMs` and `fallback.stickyMs`. `LLM_MAIN` and `LLM_FALLBACK` (`none` disables) override the
block; a switch takes a restart.

- **Profiles:** `src/agent/llm/profiles.ts` lists the tested models and their inputs, tools, thinking efforts,
  sampling, output cap, caching and price. An `llm.models` entry naming an untested model, an effort its profile
  does not take, an output cap above the profile's, or a provider whose key is unset stops startup with one
  message.
- **Adapters:** `createLlm` builds `GeminiLlm` (ADK's Gemini plus shaping and usage), `AnthropicLlm`
  (`@anthropic-ai/sdk` Messages API, SDK retries off) or `ModelScopeLlm`. `shapeRequest` drops sampling
  parameters a profile rejects and safety settings for non-Gemini targets, and clamps the output cap.
- **Claude Requests:** the core and speech layers go as one cached system block (`cache_control`), the per-turn
  layers after it uncached. Tool calls and results pair by id; images and PDFs go as content blocks, other media
  as a text marker; `responseJsonSchema` becomes one forced, strict output tool. Effort `low` runs adaptive
  thinking with 2,048 tokens of `max_tokens` headroom; effort `none` turns thinking off.
- **Thinking Within a Turn:** Claude's thinking blocks are held per turn route and sent back only inside that
  turn's tool loop, and only while everything before them is byte-identical; ADK session history never holds them.
- **Pinning:** when either side replays thinking, the first answer of a turn pins its later calls to that side.
  Gemini and ModelScope routes never pin, so they keep hedging every call.
- **Failures:** adapters throw `ProviderError`; `classifyGeminiFailure` returns its kind unchanged. The ladder
  switches once for `transient_http`, `network`, `quota_exhausted`, `billing_exhausted`, `refusal`,
  `malformed_tool_args` and `context_length`; only the first three arm the sticky window.
- **Recording:** every provider call reports its tokens through `recordUsage` (`onUsage` listeners).
  `response_events` gains `provider`, `model_id`, `route_role` (`main`/`fallback`) and `workload`; rows written
  before keep `model`, which new rows leave `NULL`.
```

Add four rows to the failure taxonomy table after `quota_exhausted`:

```md
| `billing_exhausted` | `ProviderError` only: Anthropic 402 `billing_error`, a 400 naming the credit balance, or a denied local monthly budget | No | None | None | No | Preserve | Generic fallback; with a fallback the turn switches once and arms no sticky window |
| `refusal` | `ProviderError` only: Claude `stop_reason: refusal` | No | None | None | No | Preserve | The static safety deflection; with a fallback the turn switches once and arms no sticky window |
| `malformed_tool_args` | `ProviderError` only: tool arguments that are not a JSON object (Gemini's `MALFORMED_FUNCTION_CALL` stays `empty_text`) | Yes | `liveMaxRetries = 2` retries | As `transient_http` | As `transient_http` | Preserve | Nothing runs; with a fallback the turn switches once |
| `context_length` | `ProviderError` only: a 400 saying the prompt is too long, or a 413 | No | None | None | No | Preserve | The same in-character decline as `terminal`; with a fallback the turn switches once |
```

In `#### Hedging Slow Gemini Calls`, append to the **Per Model Call, Not Per Turn** bullet: `A route that pins turns (see Model Providers) sends later calls straight to the pinned side.` In the **Accounting And Recording** bullet replace the sentence about the `model` column with: `` `response_events.route_role` records `main` or `fallback` on every answered turn (`NULL` on none) and `hedged` records `1` once any call of the turn fired a hedge; rows from before #296 carry the same answer in `model` (`'gemini'` or `'fallback'`). ``

- [ ] **Step 2: Add the operator steps to `docs/runbook.md`**

Before `## Hedging Slow Gemini Calls` insert:

````md
## Switching the Reply Model

The reply model is `llm.main` in `config.yml`; `LLM_MAIN` in `.env` overrides it. Without an `llm:` block the bot
runs Gemini with the ModelScope fallback above.

1. Uncomment the `llm:` example in `config.yml` and set `main` to a key under `llm.models` (for example `haiku`).
2. Put the provider's key in `.env` (`ANTHROPIC_API_KEY` for `haiku`); a missing key stops startup with its name.
3. Rebuild and restart the bot, with the owner's authorization.
4. Check which provider answered:

```bash
sudo docker logs rokabot-roka-1 2>&1 | grep '"msg":"Response completed"' | grep -o '"provider":"[a-z]*"' | sort | uniq -c
```

`LLM_FALLBACK=none` turns the fallback off without editing `config.yml`.
````

In `## Hedging Slow Gemini Calls`, replace the win-rate query with:

```bash
sqlite3 data/rokabot.db "SELECT COALESCE(route_role, model) AS side, COUNT(*) FROM response_events WHERE hedged = 1 GROUP BY side"
```

- [ ] **Step 3: Format and check**

Run: `npx prettier --write docs/trd.md docs/runbook.md && npx prettier --check docs/trd.md docs/runbook.md`
Expected: both files reported formatted (Prettier realigns the table).

- [ ] **Step 4: Commit**

```bash
git add docs/trd.md docs/runbook.md
git commit -m "docs: describe the model provider layer, its failure kinds and switching the reply model"
```

---

### Task 19: Full Verification

**Files:** none new.

- [ ] **Step 1: Run the full gate**

Run: `npm run lint && npm run format:check && npm run typecheck && npm run build && TZ=UTC npm test && npm run test:perf`
Expected: every command exits 0. (No task changes date handling, so the `TZ=America/New_York` run is not required; run `TZ=America/New_York npx vitest run` anyway if any date test flaked.)

- [ ] **Step 2: Confirm the legacy route is the shipped one**

Run: `npx vitest run src/__tests__/config.test.ts -t "config.yml without an active llm block" && grep -n "^llm:" config.yml || echo "no active llm block"`
Expected: PASS and `no active llm block`.

- [ ] **Step 3: Refresh the graph (only if graphify is installed)**

Run: `which graphify && graphify update .`
Then stage only the current graph files AGENTS.md allows:

```bash
git add graphify-out/graph.json graphify-out/graph.html graphify-out/GRAPH_REPORT.md graphify-out/manifest.json
git commit -m "chore(agent): refresh the code graph for the provider foundation"
```

- [ ] **Step 4: Open the PR (only with the owner's authorization)**

Push the branch, open a PR that links #296, poll `gh pr checks` until `test` is terminal, and stop on a failure with the PR URL (AGENTS.md "Shipping").

---

## Risks and Open Questions

- **Fixtures are constructed, not recorded.** `anthropicFixtures.ts` follows the SDK 0.133 types and the documented Messages API shape. Replace them with sanitised captures from the first owner-run live session.
- **Thinking headroom lengthens Claude replies.** `max_tokens` is the reply cap plus 2,048 when thinking is on; if Haiku thinks little, a reply can exceed today's 500-token cap. `capReplyBlocks` and the prompt still bound it; measure on the first live run.
- **The prompt cache misses when tools change.** `/ask` and memory-off turns withhold tools, and tools precede the system breakpoint, so those turns write a fresh cache entry.
- **Anthropic 429s are `transient_http`.** They are per-minute limits with `retry-after`, so with no fallback the ladder retries them like a Gemini minute 429. The spec table lists 429 under `quota_exhausted`; 1D may revisit with real budgets.
- **`GEMINI_API_KEY` stays required.** An Anthropic-only setup cannot start until 1B makes the key conditional, as the contract assigns.

## Contract Issues

1. **Pinning versus the legacy invariant.** Unconditional pinning would stop the legacy route from hedging tool round-trips (documented behaviour). This plan pins only when a side has `thinking.replayWithinTurn` (`RoutedLlm` option `pinTurns`); the `ModelRoute.pinned` shape is unchanged. If the owner wants pinning everywhere, pass `pinTurns: true` in `createRokaModel`.
2. **Workload attribution needs a convention.** Adapters read the workload from `llmRequest.config.labels.rokabot_workload` (`WORKLOAD_LABEL` in `usage.ts`), and ADK replies default to `reply`. 1B's `generateObject` must set that label; the contract should name it.
3. **Id-less tool history.** ADK strips its own `adk-` ids before a model sees them, so history from Gemini can carry calls without ids. The adapter pairs such a result with the earliest unanswered id-less call of the same name in the preceding model turn; calls with ids still match only by id.
4. **`context_length` does not trim history yet.** It switches once like the other new kinds; "trim history once" (spec Failures table) has no owner in the contract.
5. **Budget denials map onto existing kinds.** `grantOrThrow` turns `monthly` into `billing_exhausted` and `rpm`/`rpd`/`tpm` into `quota_exhausted`; 1D should keep that mapping or change it in the contract.
