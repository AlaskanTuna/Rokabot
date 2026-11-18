**Change the plan.** Keep Roka’s single persona agent and existing `search_web` entry point, but put deeper retrieval behind one bounded TypeScript function that returns evidence for Roka to answer in her own voice.

## Recommended architecture

```text
“List the Marufuku menu” → Roka requests menu items, including drinks
  → search → branch page has hours and hotcakes, but no drinks
  → Japanese menu search → read menu → cited items + remaining gaps
  → Roka answers in point form
```

| Shape                                    | Pi latency and cost                                                                                                       | Fallbacks and testing                                                                      | Persona                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| More tools on `LlmAgent`                 | Each dependent choice adds a remote model round and resends context. Installed ADK 2.2.1 awaits same-step tools serially. | Each model must learn when to continue and stop. Tests need model trials.                  | Roka sees raw pages and intermediate failures. |
| **Bounded function behind `search_web`** | Normally two persona calls for a lookup. Extra provider requests happen only when evidence is missing.                    | Haiku, Gemini and Qwen receive the same brief. Fixtures can exercise every stop condition. | Roka alone writes the reply.                   |

The second shape keeps the Pi’s work to network I/O and passage selection. A sub-model would add another paid call and failure point. Consider one only if replay shows passage selection repeatedly misses relevant evidence. [ADK tool execution](https://github.com/google/adk-js/blob/main/core/src/agents/functions.ts) · [Installed execution loop](/home/adam/CS/rokabot/node_modules/@google/adk/dist/esm/agents/functions.js:308)

## Changes to the five steps

1. **Page reading.** Accept a turn-scoped source ID from the message, embeds or search results. An explicit link request starts with a read. Roka supplies requested fields and, where useful, a local-language query. Code checks whether passages support those fields. Missing prices, incomplete lists, conflicts and truncation justify another lookup. A provider’s “no answer” is one signal. Keep Jev in shadow. Its live prefetch trial lost recall and added latency. [Jev contract](/home/adam/CS/rokabot/docs/trd/jev.md:76)
2. **Anime.** Align both tool descriptions and the prompt around fields Jikan actually returns. Add genre filtering for ranked recommendations and expose studios before promising them. A2 searched `romance` twice as a title keyword, changing the status filter. Stop on a complete catalogue match, send opinions and commerce straight to web, and preserve D3’s successful empty-schedule fallback. [Tool declarations](/home/adam/CS/rokabot/src/agent/tools/index.ts:56) · [Jikan fields](/home/adam/CS/rokabot/src/agent/tools/searchAnime.ts:14) · [Routing prompt](/home/adam/CS/rokabot/prompts/search-tools.md:2)
3. **Budget.** Keep `maxLlmCalls=4`, reduced by watcher calls. Start with **two searches, two page reads, three provider operations total**, shared across retries. Use an absolute 20-second text-turn deadline, reserving six seconds for synthesis and delivery. Return partial evidence and close the tools when time expires. Keep Discord typing. Current 20 seconds is **per attempt**; 63 seconds governs retry admission. [Run configuration](/home/adam/CS/rokabot/src/agent/roka.ts:584) · [Timers](/home/adam/CS/rokabot/config.yml:22) · [Existing reserve calculation](/home/adam/CS/rokabot/src/agent/tools/search/attemptBudget.ts:28)
4. **Image identification.** Run the 20-photo bake-off first, including lookalikes and unknowns. Compare existing vision plus tag/OCR text search against Vision Web Detection and Lens. Resolve an attachment index to processed bytes. Image matches supply candidates. Require a matching maker or retailer listing for exact identity, then verify availability separately. Vision accepts bytes. SerpApi supports an uploaded image ID with a 500 KB upload limit. [Vision](https://docs.cloud.google.com/vision/docs/detecting-web) · [SerpApi upload](https://serpapi.com/image-api)
5. **Regression gate.** Preserve the owner’s 30 passes, six flags and two failures as the historical record. Date changing facts. J3’s cited official store page actually confirms **LUCUA SOUTH 13F**. For J2, grade a sourced branch-specific set price and caveat. Hoshino’s national menu names the pancakes without giving that price. [Pokémon Center Osaka](https://shop.pokemon.co.jp/en/shop/pokemoncenter-osaka/) · [Hoshino menu](https://hoshinocoffee.com/menu.html)

## Top five risks

1. **False model outage.** Propagate cancellation to every provider. Handle lookup timeouts and 429s inside retrieval. Only genuine model failures should trigger sticky fallback. Native search uses the main route even when fallback answers. Capability-gate extraction and support a partial reply during outages. [Native routing](/home/adam/CS/rokabot/src/agent/tools/search/native.ts:44) · [Stickiness](/home/adam/CS/rokabot/src/agent/roka.ts:659)
2. **Injection or disclosure.** Use public, credential-free URLs and provider-side extraction. Keep pages outside session history. Derive follow-up queries from user intent. Enforce tool-less synthesis and execution-time side-effect guards, including same-batch calls. [Existing tool filter](/home/adam/CS/rokabot/src/agent/roka.ts:203)
3. **Missing Japanese, blocked or JS-only content.** Try a native-language branch or menu source once. Preserve branch, date, currency and gaps. Marufuku’s first official result really does emphasize hours and hotcakes. [Branch page](https://marufukucoffeeten.com/store/marufukucoffee-sennichimae/)
4. **Cost runaway.** Cap retrieved text at 8 KB/page and the brief at roughly 1,000 tokens. Deduplicate paid work across retries and enforce provider spend limits. Current snippets keep 200 characters; Exa’s combined answer keeps 1,500. [Snippet cap](/home/adam/CS/rokabot/src/agent/tools/search/types.ts:40) · [Exa cap](/home/adam/CS/rokabot/src/agent/tools/search/exa.ts:18)
5. **Incomplete lists or misleading citations.** Relax the 120-word guidance for requested lists. Accumulate citations within the successful attempt, rank sources supporting the answer, and fit three into Discord’s shared 4,000-character budget. [Answering](/home/adam/CS/rokabot/prompts/answering.md:5) · [Citation replacement](/home/adam/CS/rokabot/src/agent/searchCitations.ts:22) · [Renderer](/home/adam/CS/rokabot/src/discord/messageBuilder.ts:117)

## PR order and verification

1. Freeze 38 dated cases and record missing provider payloads. Run `rtk npm run test:contract` on every PR.
2. Fix anime routing. Replay A1–A8 and D3 across Haiku, Gemini and Qwen.
3. Add extraction, citation handling and budgets. Test cancellation, retries, injection, provider failures and `off` with fixtures and a fake clock.
4. Enable depth. Replay all 38. Require L1/J2 passes and zero offline regressions. Run spend-capped, repeated live comparisons. Blind-grade facts, citation support and voice. Measure quick-fact p95 under nine seconds and every 20-second breach.
5. Gate image rollout on exact-ID precision, abstentions, latency and cost against the existing vision baseline.

**Verified** against `af9210c`, all 38 traces, and provider documentation. Exa and Tavily expose extraction endpoints. Anthropic fetch is a URL-restricted server tool, and search errors can arrive inside HTTP 200. **Inferred:** the latency advantage and proposed budgets need Pi measurements. [Exa](https://exa.ai/docs/reference/get-contents) · [Tavily](https://docs.tavily.com/documentation/api-reference/endpoint/extract) · [Anthropic fetch](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool) · [Anthropic search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)
