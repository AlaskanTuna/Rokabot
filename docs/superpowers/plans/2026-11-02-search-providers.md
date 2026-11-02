# Selectable Web Search Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `search.provider` in `config.yml` choose `off`, `native`, `tavily` or `exa`, with every backend behind the existing `search_web` tool.

**Architecture:** `searchWeb()` stays the only entry point and dispatches to one backend per provider, each returning the same result shape. Native search is a separate one-shot request to the exact `llm.main` model, bounded so it fits inside the reply attempt's timer. When search cannot run, the tool, its mentions in other tool descriptions and the prompt's search rules all disappear together.

**Tech Stack:** TypeScript, `@google/adk`, `@anthropic-ai/sdk`, `@google/genai`, plain `fetch`, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-02-search-providers-design.md`

## Global Constraints

- **Base:** `origin/main` (`be8e160` when written), never local `main`, which was 11 commits behind. Work in a git worktree from the superpowers:using-git-worktrees skill.
- **Branches:** Tasks 1-5 go on `feat/search-providers` (PR 1). Tasks 6-10 go on `feat/native-search`, branched from `origin/main` after PR 1 merges (PR 2).
- **Authorization:** approving this plan does not authorize commits, pushes or merges. Ask the owner before the first commit on each branch, and again before each merge, because a merge deploys the bot.
- **Merging:** `gh pr merge --squash --delete-branch` only. Never `--auto`, `--admin` or `--force`. Poll `test` and `images-ok` to a terminal state, and stop and report on a failure.
- **Commits:** Conventional Commits, one imperative sentence, no period, no body or footer. Scopes: `discord`, `agent`, `session`, `utils`, `config`.
- **PR Body:** ends with `https://claude.ai/code/session_01Am9mnhz5WJJmQ2qQ7sC5Bh`.
- **Production:** the committed `config.yml` keeps `search.provider: tavily` in both PRs.
- **Tavily:** the request body and all search-available prompts and tool descriptions stay byte-identical. `tests/fixtures/prompt-golden.json` must not change, so never set `UPDATE_PROMPT_GOLDEN`.
- **Failure Text:** exactly `Web search is not configured.`, `Search quota exceeded. Try again later.`, `Search request failed.` and `No summary available.`
- **`search_web` Never Throws:** every backend failure becomes failure text.
- **Native Model:** always `config.llm.main`, whichever side is answering the turn.
- **Docs:** Markdown labels and headings use TitleCase. Never re-case identifiers.
- **Comments:** only where the why is not obvious.
- **Full Verification:** `npm run typecheck && npm run format:check && npm test && npm run test:perf && npm run character -- check`.

## Review Focus

1. An Exa result with a null `title` or no `highlights` keeps its URL as the citation and does not crash the search. Pinned in Task 3.
2. The model passes `max_results` of 0, -3, 2.5 or 50 to Exa, because the tool schema states 1-10 without enforcing it. The request stays within 1-10. Pinned in Task 3.
3. A search fails after an earlier search succeeded in the same turn. The earlier citations stay in the footer. Pinned in Task 2.
4. `native` on a legacy config whose `gemini.model` has no tested profile. `legacyProfile()` copies the family's profile, so this must still count as unsupported. Pinned in Task 6.
5. A shutdown or abandoned attempt aborts a native search mid-call. `search_web` returns the failure text and does not throw. Pinned in Task 7.

---

## PR 1: Setting, Boundary, Exa and `off`

### Task 1: Search Setting and Test Pins

**Files:**

- Create: `src/searchSettings.ts`, `tests/harness/searchPin.ts`
- Modify: `src/config.ts`, `config.yml`, `.env.example`, `tests/vitest.setup.ts`, `tests/harness/env.ts`, `scripts/persona-replay.ts`, `studio/ui/src/screens/Discord.tsx`, `studio/ui/e2e/worst-case.ts`
- Test: `src/__tests__/config.test.ts`, `src/__tests__/vitestEnvironment.test.ts`, `studio/server/__tests__/app.test.ts`

**Interfaces:**

- Produces in `src/config.ts`: `export type SearchProvider = 'off' | 'native' | 'tavily' | 'exa'`, `config.search: { provider: SearchProvider; available: boolean }`, and `config.jev.prefetch` holding the effective mode.
- Produces in `src/searchSettings.ts`: `searchProviderSetting(): SearchProvider` and `searchIsAvailable(): boolean`.

- [ ] **Step 1: Write the failing tests in `src/__tests__/config.test.ts`**

Add `vi.stubEnv('TAVILY_API_KEY', 'test-tavily-key')` to `setRequiredEnvVars()`, and `vi.stubEnv('SEARCH_PROVIDER', '')` and `vi.stubEnv('EXA_API_KEY', '')` to `clearTunableEnvVars()`, so existing no-warning tests stay valid. Add:

```ts
it('defaults search.provider to tavily while no native backend exists')
// withYamlOverride removes the block: config.search toEqual { provider: 'tavily', available: true }
it('reads search.provider from config.yml, and SEARCH_PROVIDER overrides it')
// yaml exa -> 'exa'; yaml exa + env off -> 'off'
it.each(['Exa', 'brave'])('rejects the unknown search provider %s')
// import rejects with 'Environment variable SEARCH_PROVIDER must be off, native, tavily or exa, got: Exa'
it('rejects an unknown value in config.yml')
// 'Config value search.provider must be off, native, tavily or exa, got: brave'
it('marks off and unsupported native as unavailable, and warns only for native')
// off: available false, warn not called. native: available false,
// warn called with expect.stringContaining('search.provider') naming config.llm.main.model and 'tavily'
it.each([
  ['tavily', 'TAVILY_API_KEY'],
  ['exa', 'EXA_API_KEY']
])('warns when %s has no %s, and stays available')
it.each(['native', 'off'])('runs jev.prefetch on as shadow under %s, and warns')
// config.jev.prefetch toBe 'shadow'
it('leaves jev.prefetch on under tavily and exa')
```

Wait for the warnings the way existing tests in this file wait for `warnAfterStartup`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: FAIL, because `config.search` is undefined.

- [ ] **Step 3: Implement the setting in `src/config.ts`**

Add `search?: { provider?: string }` to `YamlConfig`. Add `searchProvider(): SearchProvider`, following `jevMode()`, reading `SEARCH_PROVIDER` then `yaml.search?.provider`, defaulting to `'tavily'`. Add `search: { provider: searchProvider() }` to `baseConfig`, then merge `available` into `config` beside `llm`, where `available` is `provider === 'tavily' || provider === 'exa'` for now. Merge `jev: { ...baseConfig.jev, prefetch }`, where `on` becomes `shadow` when the provider is `native` or `off`.

Beside the other startup checks, call `warnAfterStartup({ provider }, message)` with:

- `search.provider is native, but ${model} has no web search, so Roka runs without it. Set search.provider to tavily or exa to search with an API key.`
- `search.provider is ${provider}, but ${key} is not set, so search_web will report that search is not configured.`
- `jev.prefetch is on, but search.provider is ${provider}, so prefetch runs as shadow.`

- [ ] **Step 4: Create `src/searchSettings.ts`**

Many tests mock `config.js` with only the keys they read, so these reads tolerate an absent `search` block:

```ts
export function searchProviderSetting(): SearchProvider {
  return config.search?.provider ?? 'tavily'
}
export function searchIsAvailable(): boolean {
  return config.search?.available ?? true
}
```

- [ ] **Step 5: Pin test and script runs**

- `tests/vitest.setup.ts`: set `process.env.EXA_API_KEY = ''` and `process.env.SEARCH_PROVIDER = 'tavily'`.
- `src/__tests__/vitestEnvironment.test.ts`: assert `EXA_API_KEY` is `''` and `config.search.provider` is `'tavily'`.
- `tests/harness/searchPin.ts`: only `process.env.SEARCH_PROVIDER = 'tavily'`, with a comment that the harness deletes `TAVILY_API_KEY` to keep `search_web` declared and unreachable, which holds only on Tavily.
- `tests/harness/env.ts` and `scripts/persona-replay.ts`: import `searchPin` first, ahead of every other import. `persona-replay.ts` needs this because `replyShape.js` will load config at import time after Task 4.

- [ ] **Step 6: Add the setting to shipped files**

`config.yml`, after the `socialPosts` block:

```yaml
search:
  provider: tavily # off | native | tavily | exa; unset means tavily. tavily needs TAVILY_API_KEY, exa needs EXA_API_KEY; no model supports native yet
```

`.env.example`, replacing the Tavily comment. Update the literal in `studio/server/__tests__/app.test.ts` to match:

```env
# Optional: Tavily API key, used when search.provider is tavily (free: 1,000 credits/month; each search spends 2)
# Sign up at https://tavily.com to get a key
TAVILY_API_KEY=

# Optional: Exa API key, used when search.provider is exa
# Sign up at https://exa.ai to get a key
EXA_API_KEY=
```

Add `'search'` after `'socialPosts'` in `OWN` in `studio/ui/src/screens/Discord.tsx` and in `OPTIONAL_BLOCKS` in `studio/ui/e2e/worst-case.ts`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/config.test.ts src/__tests__/vitestEnvironment.test.ts studio/server`
Expected: PASS.

- [ ] **Step 8: Commit, once the owner authorizes**

```bash
git add -A src tests scripts studio config.yml .env.example
git commit -m "feat(config): add a search.provider setting that selects off, native, tavily or exa"
```

### Task 2: Backend Boundary

**Files:**

- Create: `src/agent/tools/search/types.ts`, `src/agent/tools/search/tavily.ts`
- Modify: `src/agent/tools/searchWeb.ts`
- Test: create `src/agent/tools/__tests__/searchDispatch.test.ts`, extend `src/agent/tools/__tests__/searchWeb.test.ts`

**Interfaces:**

- Consumes: `searchProviderSetting()` and `searchIsAvailable()` from Task 1.
- Produces in `types.ts`:

```ts
export interface SearchWebParams {
  query: string
  topic?: 'general' | 'news'
  max_results?: number
  signal?: AbortSignal
}
export interface SearchResult {
  answer: string
  results: { title: string; url: string; snippet: string }[]
  resultCount: number
}
export interface BackendOutcome extends SearchResult {
  succeeded: boolean
}
export type SearchBackend = (params: SearchWebParams) => Promise<BackendOutcome>
export const SEARCH_TEXT: { notConfigured: string; quota: string; failed: string; noSummary: string }
export function failedSearch(answer: string): BackendOutcome // no results, succeeded false
export function clipSnippet(text: string): string // today's rule: over 200 chars becomes the first 200 + '...'
```

- Produces in `tavily.ts`: `tavilySearch: SearchBackend`.
- `searchWeb(params: SearchWebParams): Promise<SearchResult>` keeps its signature, and `searchWeb.ts` re-exports `SearchWebParams`.

- [ ] **Step 1: Write the failing tests in `searchDispatch.test.ts`**

Mock `../search/tavily.js`, `../../searchCitations.js`, `../../../searchSettings.js` and the logger.

```ts
it('returns the not-configured text without calling a backend when search is unavailable')
it('returns only the public result fields') // toEqual with no `succeeded` key
it('records citations once after a successful search')
it('replaces citations when a search succeeds with no results') // recordSearchCitations called with []
it('leaves earlier citations in place when a later search fails') // Review Focus 3: not called on succeeded false
it('logs the provider, elapsed time and result count at info, without the query')
// JSON.stringify(logger.info.mock.calls) does not contain the query
```

In `searchWeb.test.ts`, add `it('sends Tavily exactly today\'s request body')`, asserting `sentBody()` toEqual `{ query, topic: 'general', max_results: 5, search_depth: 'advanced', include_answer: 'advanced' }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/agent/tools/__tests__/searchDispatch.test.ts`
Expected: FAIL, because `../search/tavily.js` does not exist.

- [ ] **Step 3: Move Tavily and add the dispatch**

Move the request, its comment block and its error mapping into `tavilySearch` unchanged, using `SEARCH_TEXT`, `clipSnippet` and `failedSearch`. `recordSearchCitations()` moves out to `searchWeb()`. In `searchWeb()`:

- `BACKENDS: Record<SearchProvider, SearchBackend>` maps `tavily` to `tavilySearch`, and the others to a backend returning the not-configured text until later tasks fill them.
- Log `logger.info({ provider, elapsedMs, resultCount, succeeded }, 'Web search finished')`.
- Record citations only when `succeeded` is true.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/agent/tools/__tests__ src/agent/__tests__/searchCitations.test.ts src/agent/__tests__/searchPrefetch.test.ts`
Expected: PASS, with the existing Tavily and citation tests unedited.

- [ ] **Step 5: Commit, once the owner authorizes**

```bash
git add src/agent/tools
git commit -m "refactor(agent): put Tavily behind a search backend boundary that records citations and logs each search"
```

### Task 3: Exa Backend

**Files:**

- Create: `src/agent/tools/search/exa.ts`
- Modify: `src/agent/tools/searchWeb.ts`
- Test: create `src/agent/tools/__tests__/searchExa.test.ts`, extend `searchDispatch.test.ts`

**Interfaces:**

- Consumes: everything in `types.ts`.
- Produces: `exaSearch: SearchBackend`.

- [ ] **Step 1: Write the failing tests in `searchExa.test.ts`**

Stub `globalThis.fetch` as `searchWeb.test.ts` does.

```ts
it('sends only the query, type, result count and highlights')
// POST https://api.exa.ai/search, header x-api-key,
// body toEqual { query: 'q', type: 'auto', numResults: 5, contents: { highlights: true } }
it('ignores topic and sends the query verbatim') // topic: 'news' gives the same body
it.each([
  [0, 1],
  [-3, 1],
  [2.5, 2],
  [7, 7],
  [50, 10]
])('clamps max_results %s to %s') // Review Focus 2
it('passes an optional abort signal through')
it('maps results, using the first highlight as a clipped snippet')
it('fills answer with highlights in rank order, within 1,500 characters')
it('keeps a result with a null title or no highlights') // Review Focus 1: title falls back to url, snippet ''
it('uses the no-summary text when no result has a highlight, and keeps the results')
it('reports itself unconfigured without calling out when EXA_API_KEY is unset')
it.each([402, 429])('maps %s to the quota text')
it.each([401, 500])('maps %s to the failure text')
it('maps a network error or a body with no results to the failure text')
it('produces a ready prefetch') // startSearchPrefetch({ query, signal, search: exaSearch }) has status 'ready', text and sources
```

In `searchDispatch.test.ts`, add `it('routes exa to the Exa backend')`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/agent/tools/__tests__/searchExa.test.ts`
Expected: FAIL, because `../search/exa.js` does not exist.

- [ ] **Step 3: Implement `exaSearch` and register it in `BACKENDS`**

Read `process.env.EXA_API_KEY` at call time, as Tavily does. Clamp with `Math.min(10, Math.max(1, Math.trunc(max_results ?? 5)))`. Exa bills per result above 10, and `402` covers both exhausted credit and exceeded budgets. Log failures with `logger.warn` as `tavily.ts` does.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/agent/tools/__tests__/searchExa.test.ts src/agent/tools/__tests__/searchDispatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit, once the owner authorizes**

```bash
git add src/agent/tools
git commit -m "feat(agent): add an Exa search backend behind search_web"
```

### Task 4: No-Search Prompt and Tool List

**Files:**

- Create: `prompts/search-tools.md`, `prompts/no-search-tools.md`, `prompts/search-before-judging.md`
- Modify: `prompts/tools.md`, `prompts/answering.md`, `src/character/load.ts`, `src/character/index.ts`, `src/agent/tools/index.ts`, `src/agent/roka.ts`
- Test: `src/character/__tests__/load.test.ts`, `src/agent/__tests__/tools.test.ts`, create `src/agent/__tests__/searchUnavailable.test.ts`

**Interfaces:**

- Consumes: `searchIsAvailable()` from Task 1.
- Produces: `loadCharacter(dir: string, harnessDir: string, options?: { search?: boolean }): Character`, where `search` defaults to `true`. `scripts/character.ts` and Persona Studio keep calling it with two arguments.

- [ ] **Step 1: Write the failing tests**

In `load.test.ts`:

```ts
it('fills the search macros when search is available')
// loadCharacter(ROKA, HARNESS).prompts.stable.full contains 'quietly call `search_web` first'
// and 'Before judging, call `search_web` on the people', and no '{{search'
it.each(['full', 'forget', 'none'])('uses the no-search rule in the %s prompt when search is unavailable')
// loadCharacter(ROKA, HARNESS, { search: false }): no 'search_web', contains 'Never offer to look it up.',
// and contains 'as a pitch.\n'
it('rejects a prompt that names search_web outside the search prompts')
// copyOf(ROKA), write prompts/images.md naming search_web; loadError contains 'names search_web'
it('lets a pack override search-tools.md')
```

Add to the `it.each` of misplaced macros: `{{search_tools}}` mid-line in `prompts/tools.md`, `{{search_tools}}` in `prompts/images.md`, and `{{search_before_judging}}` in `prompts/images.md`.

In `tools.test.ts`, add `it('keeps the descriptions that name search_web byte-identical while search is available')`, with these exact strings and the 14-tool count:

- `search_anime`: `Search for anime by title or keyword. ALWAYS use this first for anime questions before trying search_web.`
- `get_anime_schedule`: `Get anime airing schedule. ALWAYS use this first for schedule/airing questions before trying search_web. Can check a specific day, the full week, or current season.`
- `read_replies`: contains `and then call it instead of search_web. Never call it just because`

In `searchUnavailable.test.ts`, use `vi.resetModules()`, `vi.stubEnv` and dynamic imports. `it.each(['off', 'native'])`:

```ts
it('offers no search under %s')
// rokaTools length 13 and no search_web tool;
// JSON.stringify(rokaTools.map(t => t._getDeclaration())) does not contain 'search_web';
// character.prompts.stable.{full,forget,none} do not contain 'search_web';
// search_anime description toBe 'Search for anime by title or keyword.';
// get_anime_schedule description toBe 'Get anime airing schedule. Can check a specific day, the full week, or current season.'
it('still strips a search_web call the model narrates under %s')
// stripNarratedToolCalls('*(search_web: x)* hi', ROKA_TOOL_NAMES from toolNames.js) strips it
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/character/__tests__/load.test.ts src/agent/__tests__/tools.test.ts src/agent/__tests__/searchUnavailable.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Split the prompts**

- `prompts/search-tools.md`: the three lines from `prompts/tools.md` starting `- When answering would need a fact`, `- The anime tools own catalogue data` and `- When asked to look something up`, moved verbatim.
- `prompts/tools.md`: those three lines become one line, `{{search_tools}}`.
- `prompts/search-before-judging.md`: ``Before judging, call `search_web` on the people, products and claims it names unless your notes or results already settle them.``
- `prompts/answering.md`: that sentence and its leading space are replaced, so the line ends `as a pitch.{{search_before_judging}}`.
- `prompts/no-search-tools.md`: `- When you aren't sure of a fact, leave it out, or make a playful guess and say it's a guess. Never offer to look it up.`

- [ ] **Step 4: Teach the loader the macros in `src/character/load.ts`**

- Add `search_tools` and `search_before_judging` to `SLOT_HOMES`, and add them to the `slots` for `tools` and `answering` in `prompt()`.
- Report `{{search_tools}} must be on a line of its own`, as for `MEMORY_LINE`.
- In `prompt()`, report any prompt except `search-tools` and `search-before-judging` whose text contains `search_web`: `${name}.md names search_web, which a deployment without search does not have; move that line to search-tools.md`.
- When mapping `sections`, replace the `{{search_tools}}` line with `prompt('search-tools', …)` or `prompt('no-search-tools', …)`, and replace `{{search_before_judging}}` with a space plus `prompt('search-before-judging', …)`, or with nothing.

`src/character/index.ts` passes `{ search: searchIsAvailable() }`. This is the first import of config from `src/character/`, so check nothing that `src/config.ts` imports reaches `src/character/`.

- [ ] **Step 5: Make the tool list conditional in `src/agent/tools/index.ts`**

Read `searchIsAvailable()` once at module level. The three descriptions drop their `search_web` clauses when it is false, and `read_replies` becomes `and then call it. Never call it just because`. `rokaTools` spreads `searchWebTool` in its current position only when available. `searchWebTool` stays exported.

In `src/agent/roka.ts`, delete the local `ROKA_TOOL_NAMES` and import it from `./tools/toolNames.js`, so narrated calls are stripped even when the tool is absent.

- [ ] **Step 6: Run the tests to verify they pass, and that the prompts did not move**

Run: `npx vitest run src/character src/agent/__tests__/tools.test.ts src/agent/__tests__/searchUnavailable.test.ts src/agent/__tests__/promptGolden.test.ts tests/harness/__tests__/tokens.test.ts && git status --short tests/fixtures`
Expected: PASS, and no change under `tests/fixtures`.

- [ ] **Step 7: Run the full unit suite**

Run: `npm test`
Expected: PASS. A test whose `config.js` mock has no `config` export now fails on import through `src/character/index.ts`. Fix such a mock by adding `config: {}`, not by weakening the loader.

- [ ] **Step 8: Commit, once the owner authorizes**

```bash
git add -A prompts src
git commit -m "feat(agent): drop search_web and its prompt rules when no search backend can run"
```

### Task 5: PR 1 Docs and Pull Request

**Files:**

- Modify: `docs/guide/configuration.md`, `docs/guide/features.md`, `docs/guide/getting-started.md`, `docs/guide/characters.md`, `characters/README.md`, `docs/README.md`, `docs/runbook.md`, `docs/trd/jev.md`, `docs/trd/prompt-engine.md`

- [ ] **Step 1: Update the docs**

- `configuration.md`: add `EXA_API_KEY` to Secrets, and add a `## search` table with `search.provider`, default `tavily`, env override `SEARCH_PROVIDER`.
- `features.md` line for `search_web`, `getting-started.md` `TAVILY_API_KEY` bullet, and `docs/README.md` What Leaves the Host: searches go to the selected provider.
- `characters.md` and `characters/README.md`: add both macros, the three prompts to the harness prompt table, and the new load error to the error table.
- `prompt-engine.md`: the search state is fixed at startup, so each process still builds three memory-mode prefixes.
- `jev.md` and `runbook.md` Prefetch notes: `on` needs `tavily` or `exa`, and runs as `shadow` otherwise.
- `runbook.md`: add `### Web Search Provider` under Configuration Changes, covering how to switch and that `off` removes the tool, and add `SEARCH_PROVIDER` to Environment Switches.

- [ ] **Step 2: Run full verification and read the output**

Run: the Full Verification command from Global Constraints.
Expected: all pass.

- [ ] **Step 3: Refresh the code graph**

Run: `graphify update .`
Expected: `graphify-out/` updates. Commit only the current-graph files AGENTS.md lists.

- [ ] **Step 4: Commit and open the PR, once the owner authorizes**

Use the `pr` skill for the body. Link #19 (provider evaluation) and #90 (no domain filter, which still stands). State that production stays on Tavily.

```bash
git add -A docs characters graphify-out
git commit -m "docs: document search.provider, its macros and how to switch provider"
git push -u origin feat/search-providers
gh pr create --title "feat(agent): let config.yml choose off, tavily or exa for web search" --body-file <body file>
```

- [ ] **Step 5: Poll the checks**

Run: `gh pr checks <number>`, polling until `test` and `images-ok` reach a terminal state.
Expected: both pass. On a failure, stop and report the PR URL and the failing check. Ask the owner before merging.

---

## PR 2: Native Search

Start after PR 1 merges. Branch `feat/native-search` from `origin/main`.

### Task 6: Native Capability and Search Spend

**Files:**

- Modify: `src/agent/llm/profiles.ts`, `src/agent/llm/usage.ts`, `src/agent/llm/budget.ts`, `src/agent/llm/generateObject.ts`, `src/config.ts`
- Test: `src/agent/llm/__tests__/budget.test.ts`, `src/__tests__/config.test.ts`, `src/agent/__tests__/searchUnavailable.test.ts`

**Interfaces:**

- Produces: `ModelProfile.nativeSearch?: { tool: 'web_search_20250305' | 'google_search'; usdPerSearch: number }`.
- Produces: `Workload` gains `'search'`, and `CallUsage` gains `searchRequests?: number`.

- [ ] **Step 1: Write the failing tests**

In `budget.test.ts`:

```ts
it('adds the search fee to the estimated cost')
// claude-haiku-5-5, 1 search, 0 tokens: 0.01. gemini-3.5-flash-lite, 3 searches: 0.042
it('records the search fee as monthly spend')
it('takes a search call its own RPM slot on the main model') // remainingRpm drops by 1, unlike a reply call
it('lets a search call use the last fifth of the monthly cap') // at 90% granted while extraction is denied; at 100% denied
it('takes an RPM slot for a search call on the legacy config') // remainingRpm drops by 1; denied 'rpm' at 0
```

In `config.test.ts`:

```ts
it('names exactly the four models that support native search')
// claude-haiku-5-5, claude-sonnet-5-5 at 0.01; gemini-3.5-flash-lite, gemini-3.8-flash at 0.014
it('makes native available on a supporting main model') // override llm.main to haiku: available true, no warning
it('treats native on a legacy Gemini model with no tested profile as unsupported') // Review Focus 4
// no llm block, gemini.model 'gemini-2.0-flash-lite': available false, warns
```

In `searchUnavailable.test.ts`, change the `native` case to also stub `GEMINI_MODEL=gemini-2.0-flash-lite`, because tests run a legacy Gemini route that now supports native.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/agent/llm/__tests__/budget.test.ts src/__tests__/config.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

- `profiles.ts`: add `nativeSearch` to the four profiles, with `web_search_20250305` on Claude and `google_search` on Gemini.
- `config.ts`: `native` is available when `profileFor(main.provider, main.model)?.nativeSearch` exists. Read it with `profileFor`, not `main.profile`, because of Review Focus 4.
- `usage.ts`: add `'search'` to `Workload` and `WORKLOADS`. `estimateCostUsd()` adds `searchRequests` times `profileFor(provider, model)?.nativeSearch?.usdPerSearch ?? 0`.
- `generateObject.ts`: exclude `'search'` from `BackgroundWorkload`.
- `budget.ts`: add `'search'` to `REPLY_SIDE`. `coveredByTurn` also requires `workload !== 'search'`. The legacy early return in `reserveCall()` also requires `workload !== 'search'`, because RPM is the binding limit on Gemini and a config with no `llm:` block now searches natively.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/agent/llm src/__tests__/config.test.ts src/agent/__tests__/searchUnavailable.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit, once the owner authorizes**

```bash
git add src
git commit -m "feat(agent): declare which models support native search and count its fees in the monthly budget"
```

### Task 7: Native Time Budget and Backend

**Files:**

- Create: `src/agent/tools/search/attemptBudget.ts`, `src/agent/tools/search/native.ts`
- Modify: `src/agent/tools/searchWeb.ts`, `src/agent/roka.ts`, `src/config.ts`, `config.yml`, `studio/ui/src/screens/models/configShared.tsx`
- Test: create `src/agent/tools/__tests__/searchNative.test.ts`, extend `src/agent/__tests__/searchCitations.test.ts`, `src/__tests__/config.test.ts`

**Interfaces:**

- Produces in `attemptBudget.ts`:

```ts
export interface SearchAttempt {
  deadlineAtMs: number
  signal: AbortSignal
}
export function withSearchAttempt<T>(attempt: SearchAttempt, run: () => T): T
export function currentSearchAttempt(): SearchAttempt | undefined
export function nativeSearchTimeMs(nowMs?: number): number | null
```

- Produces in `native.ts`:

```ts
export interface NativeCall {
  query: string
  topic: 'general' | 'news'
  maxResults: number
  signal: AbortSignal
}
export type NativeCaller = (route: ResolvedModel, call: NativeCall) => Promise<BackendOutcome>
export function nativeSearchPrompt(topic: 'general' | 'news'): string
export function createNativeSearch(callers: Partial<Record<ProviderId, NativeCaller>>): SearchBackend
export const nativeSearch: SearchBackend
```

- Produces: `config.search.nativeTimeoutMs` and `config.search.nativeReserveMs`.

- [ ] **Step 1: Write the failing tests in `searchNative.test.ts`**

Mock `config.js` with `search: { nativeTimeoutMs: 8000, nativeReserveMs: 5000 }` and a main route. Use `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })`.

```ts
it('gives a search the full timeout outside an attempt') // 8000
it('gives a search the full timeout when the attempt has plenty left') // deadline now + 18000: 8000
it('shortens the search to leave the reserve') // deadline now + 10000: 5000
it('returns null when less than 2 seconds would remain') // deadline now + 6500: null
it('fails at once and calls no provider when the time is too short')
it('returns the failure text when a provider call outlives its time')
it('returns the failure text without throwing when the attempt aborts mid-call') // Review Focus 5
it('passes the main route even on a fallback-answered turn') // modelRouteForRequest.run({ useFallback: true }): caller got config.llm.main
it('passes the query verbatim, the topic and max_results or 5')
it('adds the recent-coverage line only for news')
it('finishes a hung search inside the attempt with no fallback or sticky window')
// runTurnWithReliability, requestTimeoutMs 20_000. runTurn advances 2_200 ms, runs nativeSearch against a caller
// that waits on its signal, advances 2_000 ms, returns text.
// success true, switchModel not called, hasStickyFallback() false, elapsed under 20_000
it('makes no provider call for a later search with too little time left')
```

In `searchCitations.test.ts`, which drives the real runner, add `it('runs search_web inside the attempt\'s search budget')`: the `fetch` stub captures `currentSearchAttempt()`, which is defined with a deadline in the future.

In `config.test.ts`, add `search.nativeTimeoutMs` (default 8000, bounds 1..60000) and `search.nativeReserveMs` (default 5000, bounds 0..60000) to the bounds expectations.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/agent/tools/__tests__/searchNative.test.ts src/agent/__tests__/searchCitations.test.ts`
Expected: FAIL, because `attemptBudget.js` does not exist.

- [ ] **Step 3: Implement `attemptBudget.ts`**

Use `AsyncLocalStorage`. `nativeSearchTimeMs` returns the smaller of `nativeTimeoutMs` and `deadlineAtMs - now - nativeReserveMs`, or `nativeTimeoutMs` with no attempt, and `null` below `MIN_NATIVE_SEARCH_MS = 2000`, where a call would almost always time out.

- [ ] **Step 4: Implement `native.ts`**

`createNativeSearch` returns a backend that:

1. Returns the not-configured text when `callers[config.llm.main.provider]` is absent.
2. Returns the failure text when `nativeSearchTimeMs()` is `null`.
3. Combines a timer-driven `AbortController` with the attempt's signal and `params.signal` using `AbortSignal.any`. Use `setTimeout`, not `AbortSignal.timeout`, so fake timers reach it.
4. Races the caller against that signal, so a caller that ignores it cannot overrun.
5. Catches everything, logs `logger.warn`, and returns the failure text.

`nativeSearchPrompt` returns this exact copy, and for `news` appends ` Prefer recent news coverage.`:

`Search the web for the user's message before answering. Then state what the results say in a few plain sentences, with no preamble and no mention of searching.`

Export `nativeSearch = createNativeSearch({})`, and map `native` to it in `BACKENDS`.

- [ ] **Step 5: Wire the attempt in `src/agent/roka.ts`**

At the top of `runTurn`, build `const searchAttempt = { deadlineAtMs: performance.now() + requestTimeoutFor(route.useFallback), signal }`. Wrap both `testRunTurn(attempt, signal, testRequest)` and the `eventStream.next()` call in `withSearchAttempt(searchAttempt, …)`. `src/agent/reliability.ts` does not change.

- [ ] **Step 6: Add the settings**

Add both numbers to `YamlConfig`, `baseConfig`, `config.search` and `NUMERIC_BOUNDS`, and mirror the bounds in `BOUNDS` in `configShared.tsx`. In `config.yml`:

```yaml
nativeTimeoutMs: 8000 # Longest one native search may take
nativeReserveMs: 5000 # Attempt time a native search must leave for the chat model's next call
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/agent/tools/__tests__ src/agent/__tests__/searchCitations.test.ts src/agent/__tests__/roka.test.ts src/__tests__/config.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit, once the owner authorizes**

```bash
git add -A src studio config.yml
git commit -m "feat(agent): bound native search to the time the reply attempt has left"
```

### Task 8: Claude Native Search

**Files:**

- Create: `src/agent/tools/search/nativeAnthropic.ts`
- Modify: `src/agent/llm/anthropicLlm.ts` (export `thinkingParams` and `callUsage`), `src/agent/tools/search/native.ts`
- Test: create `src/agent/tools/__tests__/searchNativeAnthropic.test.ts`

**Interfaces:**

- Consumes: `NativeCall`, `nativeSearchPrompt` from Task 7, `startCall` and `recordUsage`, `AnthropicMessagesClient`, `classifyAnthropicError`.
- Produces: `anthropicNativeSearch(route: ResolvedModel, call: NativeCall, client?: AnthropicMessagesClient): Promise<BackendOutcome>`.

- [ ] **Step 1: Write the failing tests, with a fake client**

```ts
it('sends one web search tool, the query verbatim and thinking off')
// tools toEqual [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }]
// messages toEqual [{ role: 'user', content: query }], max_tokens 1024, model is the route's
it.each([
  ['claude-haiku-5-5', 'disabled'],
  ['claude-sonnet-5-5', 'between_tools']
])('spells thinking off for %s as %s')
it('discards text written before the search') // "I'll search" + server_tool_use + result + "Found it." -> answer 'Found it.'
it('maps results with the cited text as snippet, cited results first, capped at maxResults, without duplicates')
it('leaves the snippet empty when no citation names a result')
it('returns the no-summary text with no results when no search ran') // web_search_requests 0, succeeded true
it('maps too_many_requests to the quota text') // a web_search_tool_result whose content is an error object
it.each(['max_uses_exceeded', 'invalid_tool_input', 'query_too_long', 'request_too_large', 'unavailable'])(
  'maps %s to the failure text'
)
it('resends a paused turn once with the assistant content') // stop_reason 'pause_turn': the second request ends with the paused assistant content
it('fails on a second pause and never returns partial text')
it('maps a refusal to the failure text')
it.each([
  [429, 'quota'],
  [402, 'quota'],
  [400, 'failed'],
  [500, 'failed']
])('maps HTTP %s to the %s text')
it('maps a budget refusal to the quota text') // startCall throws ProviderError kind billing_exhausted or quota_exhausted
it('records usage per request with workload search and searchRequests') // onUsage spy
it('takes a budget reservation for each request, including a resend')
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/agent/tools/__tests__/searchNativeAnthropic.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement `anthropicNativeSearch` and register it in `native.ts`**

- Default client: a lazily built `new Anthropic({ apiKey: route.apiKey, maxRetries: 0 })`.
- Thinking: `thinkingParams({ ...route, effort: 'none' }, undefined)`.
- Tool type: `route.profile.nativeSearch.tool`.
- Budget: `startCall({ provider: 'anthropic', model, workload: 'search', estTokens: requestTokenEstimate([system, query]), signal })`, released with the usage in `finally`.
- Answer: text blocks after the last `web_search_tool_result`. A success `content` is a list, and an error `content` is an object.
- Pause: on `stop_reason: 'pause_turn'`, send the assistant content back unchanged once.
- Errors: `classifyAnthropicError()`. Kinds `billing_exhausted` and `quota_exhausted`, or status 429, give the quota text, and everything else the failure text, each with `logger.warn` carrying kind and status.
- A text-free answer after a search gives the no-summary text with the results kept.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/agent/tools/__tests__/searchNativeAnthropic.test.ts src/agent/tools/__tests__/searchNative.test.ts src/agent/llm`
Expected: PASS.

- [ ] **Step 5: Commit, once the owner authorizes**

```bash
git add src
git commit -m "feat(agent): search natively on Claude through its web search tool"
```

### Task 9: Gemini Native Search

**Files:**

- Create: `src/agent/tools/search/nativeGemini.ts`
- Modify: `src/agent/llm/usage.ts` and `src/agent/llm/createModel.ts` (move `geminiUsage` into `usage.ts`, because `createModel.ts` imports the routed model and importing it from a tool risks a cycle), `src/agent/tools/search/native.ts`
- Test: create `src/agent/tools/__tests__/searchNativeGemini.test.ts`

**Interfaces:**

- Consumes: `NativeCall`, `nativeSearchPrompt`, `startCall`, `recordUsage`, `geminiUsage`, `SAFETY_SETTINGS`.
- Produces: `geminiNativeSearch(route: ResolvedModel, call: NativeCall, client?: { models: { generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> } }): Promise<BackendOutcome>`.

- [ ] **Step 1: Write the failing tests, with a fake client**

```ts
it('sends only the Google Search tool and the query verbatim')
// config.tools toEqual [{ googleSearch: {} }], contents toBe query, model is the route's,
// config.safetySettings toBe SAFETY_SETTINGS, config.abortSignal toBe call.signal
it('maps grounding chunks to results, capped at maxResults')
it('uses the text of the grounding support that names a chunk as its snippet')
it('skips a chunk with no web source')
it('returns the no-summary text with no results when no search ran') // webSearchQueries empty or absent
it('keeps the results and uses the no-summary text when the response has no text')
it('counts each reported query as one search in the usage record') // 3 queries, one blank -> searchRequests 2, workload search
it('maps a 429 or a budget refusal to the quota text')
it('maps any other failure to the failure text')
it('takes a budget reservation with workload search')
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/agent/tools/__tests__/searchNativeGemini.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement `geminiNativeSearch`, move `geminiUsage`, and register it in `native.ts`**

Default client: lazily built `new GoogleGenAI({ apiKey: route.apiKey })`. Read `candidates[0].groundingMetadata`: `webSearchQueries`, `groundingChunks[].web.{uri,title}`, and `groundingSupports[].{segment.text,groundingChunkIndices}`. Set `maxOutputTokens` to 1024. Search Suggestions are not displayed, under the owner's decision in the spec.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/agent/tools/__tests__/searchNativeGemini.test.ts src/agent/tools/__tests__/searchNative.test.ts src/agent/llm`
Expected: PASS.

- [ ] **Step 5: Commit, once the owner authorizes**

```bash
git add src
git commit -m "feat(agent): search natively on Gemini through Google Search grounding"
```

### Task 10: Native Default, Live Check and PR 2

**Files:**

- Create: `scripts/measure-native-search.ts`
- Modify: `src/config.ts`, `config.yml`, `docs/guide/configuration.md`, `docs/guide/features.md`, `docs/runbook.md`, `docs/trd/models.md`, `docs/trd/reliability.md`
- Test: `src/__tests__/config.test.ts`

- [ ] **Step 1: Change the default test**

Rename the Task 1 test to `it('defaults search.provider to native when unset')`, and assert `{ provider: 'native' }`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: FAIL, received `tavily`.

- [ ] **Step 3: Flip the default**

Change the `searchProvider()` default to `'native'`. `config.yml` keeps `provider: tavily`, and its comment becomes:

```yaml
provider: tavily # off | native | tavily | exa; unset means native. native uses llm.main's own search and bills that provider (see docs/runbook.md, including the Gemini terms)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. `tests/vitest.setup.ts` still pins Tavily, so other suites do not change.

- [ ] **Step 5: Write `scripts/measure-native-search.ts`**

Import `../tests/harness/env.js` first, so Gemini uses the harness key. Take `--provider anthropic|gemini|exa` and `--trials N`, and run N of 10 fixed factual queries. Call the backend directly, with a `ResolvedModel` built from `profileFor` and the provider's key. Print each trial's elapsed ms, result count and first URL, then p50 and p95.

- [ ] **Step 6: Update the docs**

- `configuration.md`: default `native`, the two timing keys and their bounds.
- `features.md`: `search_web` covers native, Tavily and Exa.
- `runbook.md` `### Web Search Provider`: the native model table, costs, the self-hoster table from the spec, and the Gemini Terms section's wording, so a self-hoster on Gemini can choose another provider.
- `trd/models.md`: `nativeSearch` on profiles and the `search` workload.
- `trd/reliability.md`: the Native Time Budget rules.

- [ ] **Step 7: Run full verification and read the output**

Run: the Full Verification command from Global Constraints.
Expected: all pass.

- [ ] **Step 8: Run the live check, once the owner approves the spend**

Ask first: this costs about $0.12 and needs `EXA_API_KEY` and `ANTHROPIC_API_KEY` in the local `.env`, plus the harness Gemini key.

```bash
npx tsx scripts/measure-native-search.ts --provider exa --trials 1
npx tsx scripts/measure-native-search.ts --provider gemini --trials 1 --live
npx tsx scripts/measure-native-search.ts --provider anthropic --trials 10
```

Expected: each returns results. Report p50 and p95 to the owner. Keep `nativeTimeoutMs` at 8000 when p95 is at or under 8 s, and otherwise ask before changing it. Check whether Gemini's URIs are redirect links, and tell the owner what the citation footer would display.

- [ ] **Step 9: Commit and open the PR, once the owner authorizes**

The commit title carries the self-hoster warning into the release notes. Use the `pr` skill for the body, and state the live check's numbers, the self-hoster change and that production stays on Tavily.

```bash
graphify update .
git add -A src scripts config.yml docs graphify-out
git commit -m "feat(agent): default web search to the main model, so set search.provider: tavily to keep Tavily"
git push -u origin feat/native-search
gh pr create --title "feat(agent): add native web search on Claude and Gemini and make it the default" --body-file <body file>
```

- [ ] **Step 10: Poll the checks**

Run: `gh pr checks <number>`, polling until `test` and `images-ok` reach a terminal state.
Expected: both pass. On a failure, stop and report the PR URL and the failing check. Ask the owner before merging.
