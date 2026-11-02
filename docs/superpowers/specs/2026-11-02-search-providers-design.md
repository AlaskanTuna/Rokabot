# Selectable Web Search Providers Design

> Brainstormed with the owner on 2026-11-02. Status: awaiting owner review of this spec.

## Intent

- **Outcome:** the operator picks how Roka searches the web with one setting in `config.yml`: `off`, `native`, `tavily` or `exa`.
- **Why:** Tavily is the only backend today. The owner holds Exa credit, and wants a deployment to be able to search with its own main model and no separate search account.
- **Who It Is For:** the owner's Pi and anyone self-hosting Rokabot.
- **Core Idea:** every provider is a backend behind the existing `search_web` tool. The chat model, citations, metrics and tool-trigger tests keep working as they do today, because the tool's contract does not change.

## Owner Decisions

| Question                  | Decision                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------- |
| Setting Values            | `off`, `native`, `tavily`, `exa` in `config.yml`                                       |
| Default When Unset        | `native`                                                                               |
| Meaning of `native`       | The same model as `llm.main`, on the platform that serves it                           |
| Native Unsupported        | Error handling, not silent failure                                                     |
| Exa Credential            | `EXA_API_KEY`, listed in `.env.example`                                                |
| Existing Search Logic     | Kept                                                                                   |
| Provider Benchmark Trial  | Not wanted; the owner declined a Tavily vs Exa comparison run                          |
| Native as a Separate Call | Accepted: a separate request counts as native while it uses the exact `llm.main` model |
| Gemini Native             | Included; the owner accepts the terms risk described under Gemini Terms                |

## Goals

- One setting selects the backend. `SEARCH_PROVIDER` overrides it, following the existing environment override pattern in `src/config.ts`.
- `search_web` returns the same shape from every backend: `{ answer, results: [{ title, url, snippet }], resultCount }`.
- A deployment whose chosen backend cannot run still boots, and says why in the log.
- Native search spend counts toward `llm.monthlyBudgetUsd`.

## Non-Goals

- A chain of backends, such as trying Tavily when native fails.
- Native search for OpenAI, ModelScope or `openai-compatible` models in this work.
- Per-guild or per-channel provider choice.
- Prefetch on native search.
- A domain blocklist on any provider. Issue #90 closed this as won't fix because Rokabot also runs on NSFW servers, and that decision applies to every backend here.
- The `exa-js` dependency. The Tavily code uses plain `fetch`, and Exa matches it.

## Anti-Goals

This work has failed, even if the code runs, when any of these happens:

- Merging a PR changes which backend production uses, or starts paid search on the Pi.
- A search setting stops the bot from starting, except an invalid setting value.
- Search-related text from a model reaches a Discord reply directly, such as "I'll search for that".
- Native search spends money that the monthly cap does not see.

## Current State

- `src/agent/tools/searchWeb.ts` calls Tavily with `search_depth: 'advanced'` and `include_answer: 'advanced'`, which issue #19 found necessary for correct answers. The query goes out verbatim, also on purpose.
- `searchWeb()` has two callers: the `search_web` tool and `startSearchPrefetch()` in `src/agent/searchPrefetch.ts`.
- `startSearchPrefetch()` treats an empty `answer`, or the text `No summary available.`, as no result.
- `searchWeb()` records citations with `recordSearchCitations()`. The Discord footer reads them.
- `rokaTools` in `src/agent/tools/index.ts` is a static list of 14 tools, and `src/agent/__tests__/tools.test.ts` asserts that count.
- Model-facing text names `search_web` unconditionally: `prompts/tools.md` lines 4-6, `prompts/answering.md` line 10, and the `search_anime`, `get_anime_schedule` and `read_replies` descriptions in `src/agent/tools/index.ts`. `tests/harness/__tests__/tokens.test.ts` asserts the `answering.md` text.
- `src/character/load.ts` fills `{{memory_tools}}` per memory mode, and builds `prompts.stable` for each mode. `src/agent/promptAssembler.ts` matches those prefixes in `STABLE_PREFIXES`.
- One attempt timer covers the first chat call, every tool and the next chat call. It is 20 s for `haiku` and `qwen122` (`gemini.timeout`). It cannot interrupt a running tool, so an overrun is detected after the tool returns. An overrun classifies as `network`, moves the turn to the fallback, and opens the sticky window.
- `ROKA_TOOL_NAMES` in `src/agent/tools/toolNames.ts` feeds narrated tool call stripping, separately from `rokaTools`.
- Production runs `main: haiku` and `fallback: qwen122`. `jev.prefetch` is `shadow`.
- `tests/harness/toolTrigger.ts` deletes `TAVILY_API_KEY` for the run, so `search_web` is declared but spends nothing.
- At the last measurement (2026-11-02) Roka made 129 searches in 30 days, counted as turns that searched. Each Tavily advanced search costs 2 credits against a free 1,000 per month.

## Design

### Setting

```yaml
search:
  provider: tavily # off | native | tavily | exa; unset means native. native uses llm.main's own search and bills that provider
  nativeTimeoutMs: 8000 # Longest one native search may take
  nativeReserveMs: 5000 # Attempt time a native search must leave for the chat model's next call
```

Both numbers go in `NUMERIC_BOUNDS`. The 8 s default is a placeholder until the check under Verification measures real latency.

The committed `config.yml` stays on `tavily`. The `native` default applies only where the setting is absent.

### What Each Value Does

| Value    | `search_web` Tool | Backend                                                   |
| -------- | ----------------- | --------------------------------------------------------- |
| `off`    | Not registered    | None                                                      |
| `native` | Registered        | One-shot call to the `llm.main` model with its own search |
| `tavily` | Registered        | Today's request, unchanged                                |
| `exa`    | Registered        | `POST https://api.exa.ai/search` with highlights          |

### Error Handling

| Situation                                   | Behaviour                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Setting holds an unknown value              | Startup throws, in the same form as `media.watcher` and `jev.prefetch`                                                   |
| `native`, and the main model has no support | Startup warns naming the model and the fix. `search_web` is not registered, so turns spend no model round on it          |
| `tavily` or `exa`, and the key is missing   | Startup warns. The tool stays registered and returns `Web search is not configured.`, as a missing Tavily key does today |
| Quota, rate limit or credit exhausted       | The tool returns `Search quota exceeded. Try again later.`                                                               |
| Any other runtime failure                   | The tool returns `Search request failed.` and logs a warning                                                             |
| Monthly budget refuses the native call      | The tool returns the quota text. The reply continues                                                                     |

The two "cannot run" rows differ on purpose. A native-unsupported deployment is a default state that can last for the life of the install, so it must not spend a model round on each lookup. A missing key is an operator mistake, and keeping today's behaviour keeps the harness's key-deletion seam and the tests that run with blank keys.

### Backend Boundary

`searchWeb()` stays the only entry point, and its signature does not change. It dispatches on the resolved provider. Each backend returns the shared result shape, and `searchWeb()` records citations once for all of them.

Add one `info` log per search with the provider, elapsed milliseconds and result count, and without the query. Today's completion line is at `debug`, so production has no count of real search calls. The turn metric counts a turn that searched twice as one.

### Exa Backend

- **Request:** `{ query, type: 'auto', numResults, contents: { highlights: true } }`, with the `x-api-key` header. Nothing else is sent, following Exa's own integration guidance.
- **Query:** sent verbatim, matching the issue #19 rule.
- **Topic:** `topic` is ignored. Exa's guidance says that mapping a news task to `category: news` is a mistake, and adding recency words would break the verbatim rule.
- **Result Count:** `max_results` becomes `numResults`, clamped to 10. Exa bills per result above 10, and the tool's schema states 1-10 without enforcing it.
- **Answer:** Exa `/search` returns no generated answer, and prefetch rejects an empty `answer`. The backend fills `answer` with the top results' highlights, joined and bounded so that the tool result stays near today's size. It uses `No summary available.` only when no result has a highlight.
- **Snippet:** the first highlight, clipped as Tavily's content is clipped today.

### Native Backend

Native search is a separate request from the chat request, so nothing about a server-side search enters the chat adapters or session history.

- **Model:** always `config.llm.main`, whichever side is answering the turn. A turn answered by the fallback model still searches on the main model.
- **Main Model Down:** the tool returns the failure text, and Roka's existing rules for a failed lookup apply.
- **Capability:** `ModelProfile` gains an optional `nativeSearch` entry holding the tool type and USD per search. A profile without it does not support native search.
- **Supported in This Work:** `claude-haiku-5-5` and `claude-sonnet-5-5`, with `web_search_20250305` at $0.01 per search; `gemini-3.5-flash-lite` and `gemini-3.8-flash`, with Google Search grounding at $0.014 per query.
- **Call Limit:** on Claude, `max_uses: 1`. Gemini offers no cap, so one call can bill several queries, and the spend record counts the queries it reports. The chat model can call `search_web` again when the results are thin and the attempt has time left.
- **Thinking:** off, spelled the way the model's profile requires, because this call only summarises results.
- **Instruction:** a short fixed system prompt tells the model to search first and state the findings plainly. `topic: 'news'` adds one line asking for recent coverage. The query itself stays verbatim.

A Claude response maps as follows:

- **Answer:** the text blocks after the last search result block. Text before that block is discarded.
- **Results:** title and URL from `web_search_tool_result`. The snippet is the matching citation's `cited_text`, or empty when no citation names that URL.
- **No Search Ran:** when `usage.server_tool_use.web_search_requests` is 0, the result is `No summary available.` with no results. The chat model is the same model, so unsearched text adds nothing and could be wrong.
- **Search Error:** a `web_search_tool_result` whose `content` is an error object arrives inside an HTTP 200. `too_many_requests` maps to the quota text, and every other code maps to the failure text.
- **`pause_turn`:** resend the paused assistant message once. A second pause is a failure, and partial text is never returned as an answer.

A Gemini response maps as follows, through the existing `@google/genai` dependency with only the Google Search tool in the request:

- **Answer:** the response text.
- **Results:** title and URI from the grounding chunks. The snippet is the text of the grounding support that names the chunk, or empty when none does.
- **No Search Ran:** when the response reports no search queries, the result is `No summary available.` with no results, for the same reason as on Claude.
- **Errors:** a 429 maps to the quota text, and every other failure maps to the failure text.
- **Search Suggestions:** not displayed, under the owner's decision below.

### Gemini Terms

The owner chose to include Gemini and accepts the terms risk. The Gemini API terms say the app "will not modify, or intersperse any other content with, the Grounded Results or Search Suggestions", and that it displays associated Search Suggestions with the result. Roka rewrites results in character, and Discord cannot render the HTML snippet, so this design meets neither condition. The terms also limit storing result text to two years, in limited cases such as end-user chat history. The operator guidance in `docs/runbook.md` and the `config.yml` comment state this, so a self-hoster on Gemini can choose another provider.

### Native Time Budget

A native search must fit inside the attempt timer. An overrun would throw away a paid result, move the turn to the fallback, open the sticky window, and pay for the same search again on the retry.

- A native search gets the smaller of `search.nativeTimeoutMs` and the attempt's remaining time minus `search.nativeReserveMs`.
- When that time is too short to run, `search_web` returns the failure text at once and makes no provider call.
- The attempt exposes its deadline and abort signal through `AsyncLocalStorage`, as `src/agent/roka.ts` already does for per-request state. A shutdown or an abandoned attempt also cancels the search.
- `src/agent/reliability.ts` does not change. The attempt timer stays the one clock, and Tavily and Exa keep their current timing.
- Native search still runs during the sticky window. One transient failure on the main model must not remove search for five minutes, and a hung provider costs the turn at most `search.nativeTimeoutMs`.

### Budget

- `Workload` gains `search`, and `CallUsage` gains an optional `searchRequests`.
- `estimateCostUsd()` adds `searchRequests` times the profile's USD per search, so the existing spend listener records it.
- The call goes through `startCall()`. `search` counts as reply-side for priority, so it can use the last fifth of the monthly cap.
- `search` must not count as covered by the turn. The turn's reservation does not include this call, so it takes its own RPM slot and token charge.
- `reserveCall()` skips all accounting when `legacyAccounting()` is true, which is a config with no `llm:` block. That config now runs native search on Gemini by default, so a `search` call must still take an RPM slot there. RPM is the binding limit on Gemini.
- Gemini queries count at the $14 per 1,000 list price, ignoring the 5,000 free each month. The record can overstate Gemini spend, and it cannot understate it. No Gemini monthly cap is set by default.

### When Search Is Unavailable

These rules apply to `off`, and to `native` on a main model without support. A prompt that names a missing tool invites "let me look that up", so the model-facing text changes with the tool list.

- `search_web` is left out of the registered tools.
- `search_web` stays in `ROKA_TOOL_NAMES`, so a call the model narrates anyway is still stripped from the reply.
- The search lines leave `prompts/tools.md` and `prompts/answering.md`, and return through a new `{{search_tools}}` macro, filled the way `{{memory_tools}}` is. A character pack that overrides these files gets the same validation as the memory macro.
- The search state is fixed at startup, so one process still needs only the three stable prefixes in `STABLE_PREFIXES`, built for that state.
- The `search_anime`, `get_anime_schedule` and `read_replies` descriptions drop their mention of `search_web`.
- The macro's no-search text gives one rule: when you aren't sure of a fact, leave it out, or make a playful guess and say it's a guess, and never offer to look it up. The first half repeats the rule in `prompts/answering.md` line 8, so no new voice is introduced.

With search available, the assembled prompt and tool descriptions must be byte-identical to today's, because the voice is tuned and measured against them.

### Prefetch

`jev.prefetch: on` works with `tavily` and `exa`. With `native` or `off` it runs as `shadow`, and startup warns. Prefetch exists to answer inside `jev.prefetchWaitMs` (4 s) with no model RPM, and a native call meets neither condition. Production stays on `shadow`, so this changes nothing today.

### Self-Hosters

A self-hoster whose `config.yml` has no `search:` block moves to `native` on upgrade. The result depends on their main model:

- **Anthropic:** paid search starts, at $0.01 per search plus tokens.
- **Gemini:** search moves to grounding, free for the first 5,000 queries a month, then $14 per 1,000.
- **Any Other Model:** search stops, even with a Tavily key set.

The startup warning names `search.provider: tavily` as the fix, and the release notes for the second PR must say this.

## Delivery

1. **PR 1:** the setting, `SEARCH_PROVIDER`, the backend boundary, `off`, the Exa backend, the search log line, `.env.example` and docs. An unset setting still means `tavily` here, because native does not exist yet.
2. **PR 2:** the native backend, the profile entries, the budget changes, and the switch of the unset default to `native`. Docs and release notes cover the self-hoster change.

Both PRs leave `search.provider: tavily` in the committed `config.yml`. Merging runs the deploy workflow, so each merge needs the owner's authorization. Switching production to another backend is a separate config change that the owner makes.

Docs to update: `docs/trd.md`, `docs/runbook.md`, `docs/README.md` and the `config.yml` comments. The `.env.example` Tavily comment says 1000 queries per month, and advanced search spends 2 credits each, so correct it while adding `EXA_API_KEY`.

## Test Seams

- **Harness Spend:** `tests/harness/toolTrigger.ts` must keep `search_web` declared and unreachable under any `search.provider`. Deleting `TAVILY_API_KEY` no longer guarantees this once a developer sets another backend.
- **Vitest Environment:** `src/__tests__/vitestEnvironment.test.ts` asserts blank keys, and `EXA_API_KEY` joins it.
- **Scripts:** `scripts/measure-prefetch.ts`, `scripts/persona-replay.ts` and `scripts/bench-claude-capture.ts` touch Tavily or `searchWeb()` directly, and must keep doing what they do today under any setting.

## Verification

Run these and read the output before calling a PR done:

1. `npm run typecheck && npm run lint && npm test && npm run test:perf`.
2. **`tavily`:** a test asserts the request body is unchanged from today.
3. **`exa`:** mocked tests cover the request body, the result shape, a filled `answer`, the prefetch `ready` path, the 10-result clamp and the error mapping.
4. **`off`:** the agent registers 13 tools, the bot starts, and no assembled prompt or tool description contains `search_web`.
5. **`native` on an unsupported main model:** the bot starts and warns, and the checks in item 4 hold.
6. **Search Available:** tests assert the assembled prompt and tool descriptions are byte-identical to today's.
7. **`native` on Haiku:** mocked tests cover `max_uses: 1`, discarded pre-search text, each error code, `pause_turn`, the no-search case, the spend record at $0.01 per search, and a fallback-answered turn searching on the main model.
8. **`native` on Gemini:** mocked tests cover the request's tool list, the grounding mapping, the no-search case, a spend record per reported query, and an RPM slot taken under a config with no `llm:` block.
9. **Native Time Budget:** a test with a slow mocked provider shows the attempt finishes inside its timer, with no switch to the fallback and no sticky window. A second search with too little time left makes no provider call.
10. **Unknown setting value:** startup throws.
11. **Live Check, With Owner Approval:** one real search through each of Exa, native Haiku and native Gemini, then 10 native Haiku searches to measure latency and set `search.nativeTimeoutMs`. This costs about $0.12 and uses `llm.main`'s key. The Gemini search uses the harness key, not the bot's. It also shows whether grounding URIs are redirect links, which decides what the citation footer displays.

## Left to the Builder

- File layout under `src/agent/tools/`.
- Bounds for the two native timing settings, and the exact cap on Exa's `answer` length.
- Exa's HTTP status codes for exhausted credit, from its current docs.
- How `rokaTools` becomes conditional while keeping tests simple.
- How `src/character/load.ts` learns the search state, given that it builds prompts at startup.

## Calls Made by the Author

The owner did not decide these, and can overrule any of them:

- The committed `config.yml` stays on `tavily`, and an unset setting means `tavily` until PR 2.
- A missing key keeps today's behaviour, while unsupported `native` removes the tool.
- Exa uses `/search` with highlights, fills `answer` from those highlights, and ignores `topic`.
- Native search gets 8 s at most, leaves 5 s of the attempt for the next chat call, and still runs during the sticky window.
- The no-search prompt text reuses the existing leave-it-out-or-guess rule.
- Gemini queries count at list price in the spend record.
- OpenAI native search waits for later work.
- `jev.prefetch: on` runs as `shadow` under `native` or `off`.
- Each search writes one `info` log line, without the query.
