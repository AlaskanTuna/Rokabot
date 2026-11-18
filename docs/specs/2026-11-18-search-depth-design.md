# Search Depth Design

Date: 2026-11-18. Status: approved by the owner.

## Intent

Roka should look things up the way Claude.ai or ChatGPT does: she decides on her own when to dig deeper, inside a normal chat turn, with no `/research` command. Two more gaps belong to the same work: she cannot read a link she is given, and she guesses who a pictured character or product is instead of finding out.

The bar is the owner's: a reply is acceptable when it carries enough relevant findings. It need not be complete. A partial list with its gaps named passes.

## Evidence

A live baseline ran 38 questions through the real `generateResponse` on `af9210c`, with `claude-haiku-5-5` at effort low and Exa, as in production. The owner reviewed the grades.

| Result     | Count | Cases                                                     |
| ---------- | ----- | --------------------------------------------------------- |
| Pass       | 31    | Quick facts, prices, news, comparisons, how-to, opinions  |
| Pass, Flag | 5     | L2 and J1 (partial or wrong detail); A1, A2, A7 (17-21 s) |
| Fail       | 2     | L1 (cafe menu, no drinks); J2 (cafe set price not found)  |

- **No Second Search:** Roka never ran `search_web` twice in any case. Both failures need a page the 200-character snippets cannot carry (`src/agent/tools/search/types.ts:40`).
- **Anime Latency:** three anime turns called Jikan twice (English, then Japanese title) and then searched the web anyway, taking 17-21 s against the 20 s attempt timer. `search_anime`'s description says "ALWAYS use this first", which contradicts `prompts/search-tools.md:2`. A2 searched "romance" as a title keyword.
- **Citations:** `recordSearchCitations` replaces rather than appends (`src/agent/searchCitations.ts:22`), so a second lookup would erase the first one's sources.
- **Reply Length:** `prompts/answering.md:5` caps a looked-up reply at about 120 words, lists included.

Two advisors reviewed the plan independently: Claude Fable 5.2 and GPT-6.2 Astra. The design below follows the second review, which kept the persona agent unchanged and moved depth into code.

## Design

### Shape

Roka stays the single persona `LlmAgent`. Depth lives inside `search_web` as a bounded TypeScript loop that returns a compact evidence brief. Roka alone writes the reply.

```text
"List the Marufuku menu"
 -> Roka calls search_web with the query and the fields she needs ("menu items, including drinks")
 -> code: search -> the branch page has hours and hotcakes, no drinks
 -> code: Japanese menu search -> read the menu page
 -> brief: cited items, plus the fields still missing
 -> Roka writes the point-form reply
```

The rejected alternative gave Roka more tools and a larger call budget. Every dependent choice would then cost another model round with the whole context resent, ADK awaits a step's tools serially, and each fallback model would have to learn when to continue and when to stop. A code loop behaves the same on Haiku, Gemini and Qwen, keeps page text out of session history, and can be tested with fixtures.

### Depth Signal

`search_web` gains an optional `fields` argument: what the answer needs (items, a price, hours). Code checks whether the retrieved passages cover each field. A missing price, an incomplete list, a conflict or a truncated page justifies one more lookup. A provider's "no answer" counts as one signal. Jev stays in shadow: its live prefetch trial lost recall and added latency (`docs/DECISIONS.md`, 2026-10-07).

If replays show the coverage check missing evidence, especially on Japanese pages, a small model judge may replace it. It is not part of the first build.

### Budget

| Limit                   | Value                                                |
| ----------------------- | ---------------------------------------------------- |
| `gemini.maxLlmCalls`    | Stays 4, reduced by watcher calls                    |
| Searches per turn       | 2                                                    |
| Page reads per turn     | 2                                                    |
| Provider calls per turn | 3 in total, shared across retries                    |
| Text per page           | 8 KB                                                 |
| Brief                   | About 1,000 tokens                                   |
| Deadline                | 20 s for the whole text turn, 6 s kept for the reply |

When the budget or the deadline runs out, the loop returns what it has, with the gaps named. Provider timeouts and 429s are handled inside retrieval and never count as a model failure, so they cannot trigger the sticky fallback.

### Reading Links

The loop reads pages through the configured provider: Exa `/contents`, Tavily `/extract`, or Anthropic `web_fetch` for `native`. It reads only URLs that came from this turn's message, embeds or search results, and it refers to them by turn-scoped source IDs. When the user asks Roka to look into a link, the loop starts with a read. Social links keep their existing path.

### Citations

Citations accumulate across the lookups of one successful attempt. The sources that support the answer rank first, and three fit inside Discord's shared 4,000-character budget (`src/discord/messageBuilder.ts:117`).

### Reply Length

A requested list is exempt from the 120-word guidance in `prompts/answering.md`.

### Anime Routing

Both anime tool descriptions and `prompts/search-tools.md` describe the fields Jikan returns (titles, synopsis, score, episodes, status, schedule) instead of claiming every anime question. Opinions, merch, prices, news, cast and manga go straight to `search_web`. A complete catalogue match ends the lookup. `search_anime` gains a genre filter for ranked recommendations. D3's fallback from an empty schedule to the web stays.

### Identifying Images

A 20-photo bake-off comes first, including lookalikes and unknown items. It compares three options: Roka's own vision plus a text search, Google Cloud Vision Web Detection, and Google Lens through SerpApi. The tool takes an attachment index and sends the processed bytes the Pi already holds. An image match only proposes candidates. An exact identity needs a matching maker or retailer listing, and availability is checked separately.

## Evaluation

The 38 cases become a dated regression set. Changing facts carry the date they were checked. Each PR runs the offline replay through `npm run test:contract`. Live comparisons are capped in spend, run several trials, and are graded blind on facts, citation support and voice.

| Gate                 | Pass                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| Depth                | L1 and J2 pass                                                           |
| Regressions          | No offline case gets worse                                               |
| Quick facts          | p95 under 9 s                                                            |
| Timer                | No turn crosses 20 s                                                     |
| Image identification | Exact-ID precision, abstentions, latency and cost beat Roka's own vision |

## Build Order

Each step is one PR with its own issue.

1. Freeze the 38 cases as dated fixtures with a replay gate.
2. Route anime questions by the fields Jikan returns.
3. Add page extraction, accumulated citations and the per-turn budget and deadline.
4. Turn on the depth loop in `search_web` and read links on request.
5. Run the image bake-off, then build `identify_image` on the winner.

## Non-Goals

- A `/research` command or any multi-agent fan-out.
- Raising `maxLlmCalls`.
- Turning Jev prefetch on.
- Parallel's image search (#520).
- Roka sending images herself.

## Risks

| Risk                                       | Mitigation                                                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A slow provider looks like a model outage  | Cancellation reaches every provider; lookup errors stay inside retrieval                                                                              |
| Page text carries instructions             | Credential-free provider extraction, pages kept out of history, follow-up queries built from the user's intent, side-effect tools closed after a read |
| Japanese, blocked or JavaScript-only pages | One native-language attempt; branch, date, currency and gaps kept in the brief                                                                        |
| Cost runaway                               | Per-page and brief caps, deduplication across retries, provider spend limits                                                                          |
| Lists that look complete but are not       | The brief names missing fields, and Roka says what is partial                                                                                         |
