# Character Harness Research 2026

Researched 2026-10-17 from seven source-reading and web reports. Goal: a conversation-first harness that loads any
character from files and runs on any OpenAI-compatible main and fallback model.

**Checks:** sources marked **(re-checked)** were fetched again on 2026-10-17 to confirm the claims this document leans
on. Other claims rest on the worker reports. **UNVERIFIED** means no primary page confirmed the claim.

## Summary

- **Shared Core:** platforms split a character into persona, greeting, examples, a style directive, lore and a late
  steering note. Rokabot's pack covers all but greetings (unused on Discord), examples and lore.
- **Assembly:** SillyTavern, RisuAI and Agnai build the prompt from an ordered block list. All three inject notes at a
  depth counted from the newest message and keep a post-history slot.
- **Formats:** Character Card V2 is the interchange baseline. V3 adds a `ccv3` PNG chunk and the CHARX zip. Import
  both. Export V2 JSON.
- **Drift:** drift is measurable within eight rounds, and late repetition of instructions helps. Caching rewards a
  static prefix. Most other persona tips are practitioner lore.
- **Providers:** OpenAI-compatible endpoints differ silently. Use capability flags, and keep native adapters for
  Anthropic and Gemini.

## What Platforms Converge On

Commercial counts are confirmed platforms out of 10 checked (Character.AI, Janitor, Kindroid, Nomi, Shapes, Talkie,
Chai, Replika, Poe, Backyard) [21].

| Concept           | Card Field (V2/V3)                   | SillyTavern, RisuAI, Agnai         | Commercial              | Rokabot Pack Home         |
| ----------------- | ------------------------------------ | ---------------------------------- | ----------------------- | ------------------------- |
| Persona Text      | `description`, `personality`         | All                                | 10/10                   | Markdown sections         |
| Style Directive   | `system_prompt`                      | All; replaces global by default    | 7/10                    | Sections plus `voice.yml` |
| Greeting          | `first_mes`, `alternate_greetings`   | All                                | 8/10                    | Not used on Discord       |
| Example Dialogue  | `mes_example`, `<START>` blocks      | All                                | 5/10                    | Roadmap                   |
| Post-History Note | `post_history_instructions`          | ST, Agnai; Risu uses the chat note | None found              | Reply Shape note          |
| Depth Note        | `extensions.depth_prompt` (de facto) | All three                          | None found              | Roadmap                   |
| Lore              | `character_book`                     | All read a core subset             | Backyard, Kindroid, Poe | Roadmap                   |
| Memory            | None                                 | Risu summaries, Agnai embeddings   | 6/10                    | Harness passive memory    |
| Sampling          | None                                 | Presets, outside the card          | 4/10                    | `character.yml` hints     |
| Expressions       | `assets` (emotion type)              | Risu `emotionImages`               | 6/10 avatar or voice    | `moods.yml`               |
| Triggers          | None                                 | None (one human per chat)          | Shapes reply toggles    | `character.yml`           |
| Groups            | `group_only_greetings` (Risu only)   | All three                          | Kindroid, Nomi          | Roadmap                   |

## Prompt Assembly Patterns

| Pattern         | SillyTavern [3]                                                                   | RisuAI [6]                                        | Agnai [7]                                              |
| --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Ordered Blocks  | 12-entry list; index sets position; code fills markers                            | Typed `promptTemplate` blocks                     | Fixed order, or a `{{#if}}` template                   |
| Card Overrides  | Card text replaces `main` and `jailbreak`; `forbid_overrides` locks a block       | Card text moves to the chat or global note        | Used unless `ignoreCharacterUjb`                       |
| Depth Injection | Author's Note, depth prompt, lore `@D`; default depth 4, role system, from newest | `depth_prompt` from newest; `@@depth` from oldest | `insert {depth}` from newest                           |
| Post-History    | `jailbreak` after history                                                         | Auto-appended `postEverything`                    | Post text, then `Name:` cue; sent as user or assistant |
| Examples        | `<START>` blocks as `example_user` and `example_assistant`; whole blocks only     | Assistant turns before history                    | `{{#lowpriority}}`, dropped first                      |
| Budget          | Reply reserve, fixed blocks, history newest-first with a hard stop, examples      | Summary memory split 0.2 / 0.4 / 0.4              | Lore capped at 500 tokens, by priority                 |
| Speakers        | `Name: ` prefixes; `[Write the next reply only as {{char}}.]`                     | Same reminder                                     | Per-character message visibility                       |

Lessons for Rokabot:

1. Keep the order in data. Fail loudly when a required block is missing. SillyTavern fails silently.
2. Count depth from the newest message. RisuAI mixes both directions.
3. Refuse to send when fixed blocks overflow. SillyTavern builds a partial prompt (whether it always sends is
   UNVERIFIED).
4. Put speaker names in the message text. Groq rejects the `name` field and Anthropic's layer ignores it [16][31].

## Character Formats

| Format          | Shape                                                             | Takeaway for Us                                                                    |
| --------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Card V2 [1]     | JSON in a PNG `chara` chunk                                       | Read everywhere. Card `system_prompt` replaces the global prompt by default.       |
| Card V3 [2]     | `ccv3` chunk; CHARX zip with `card.json` and `assets/`            | Last content commit 2024-07-20. V3-only fields mostly RisuAI. Agnai reads V2 only. |
| ElizaOS [8]     | Object with `bio[]`, `style`, `messageExamples`, `templates`      | Key-level fallback. Only keys the runtime reads can be overridden.                 |
| Letta `.af` [9] | One JSON file; blocks with `label`, `value`, `limit`, `read_only` | Labelled, capped persona parts. Export format, not authoring.                      |
| OpenClaw [10]   | Markdown folder: `IDENTITY.md`, `SOUL.md`, `MEMORY.md`            | Per-file caps (20k, 60k total). Closest to our folder pack.                        |

No active open-source Discord bot that imports cards was found. llmcord [11] has one YAML prompt and no character
object.

### Import and Export Recommendation

1. **Authoring Format:** the folder pack stays the source of truth. Cards are for exchange.
2. **Import:** read `ccv3`, then `chara`, then plain JSON. Accept 3.x and warn on newer versions [2]. Map the core text
   fields and the core `character_book` fields. Add CHARX later.
3. **Trust:** a card `system_prompt` becomes a pack section below the harness core and never replaces a locked
   section. Keep `creator_notes` out of the prompt [1]. Cap field lengths. Do not fetch remote assets.
4. **Export:** write V2 JSON, since Agnai reads only V2. Put pack-only data under `extensions.rokabot`. Keep unknown
   `extensions` keys, as the spec requires [1].

## Model Guidance and Persona Drift

### Evidence-Backed

| Finding                                                                                                     | Source   |
| ----------------------------------------------------------------------------------------------------------- | -------- |
| Set the role in the system prompt, with detailed personality, background and quirks                         | [12]     |
| List common scenarios with the expected response                                                            | [12]     |
| Prefill is not supported on Claude 4.6 and later                                                            | [12]     |
| Cache order is tools, system, messages; a change invalidates later levels; break on the last static block   | [13]     |
| Cache minimum: 512 tokens on Haiku 5.5, 4,096 on Haiku 4.5; shorter prefixes fail silently                  | [13]     |
| OpenAI: stable instructions first, user-specific content last                                               | [17]     |
| Gemini: a few structurally identical examples; too many overfit                                             | [18]     |
| Contradictory instructions hurt GPT-5 more; a reminder every 3 to 5 messages kept formatting                | [19]     |
| Drift is significant within eight rounds (LLaMA2-chat-70B, GPT-3.5); attention decay is the suggested cause | [20]     |
| Repeating the system prompt before each user turn works best in later turns, at a context cost              | [20]     |
| Drift follows questions about the model's own processes and emotionally vulnerable users                    | [22]     |
| Personas add no factual accuracy; bigger models are not reliably better personas                            | [23][24] |
| Never deny being an AI when sincerely asked; always give emergency information                              | [15]     |

### Practitioner Lore

All UNVERIFIED as general rules:

- Depth reminders fix drift. SillyTavern documents only the mechanics [4].
- Example dialogue beats persona description. No ablation found.
- Openers and lengths picked in code beat asking for variety. Rokabot's v3 replays support it: Haiku copied a quoted
  interjection into a third of openers and wrote two paragraphs in 98% of replies [25].
- Anthropic warns of slipping "over long conversations". The re-check did not find this sentence.

## OpenAI-Compatible Providers

Sources: [16], [27], [31].

| Provider           | Tools                                      | Structured Output                      | Vision             | Max Tokens              | Reasoning                      |
| ------------------ | ------------------------------------------ | -------------------------------------- | ------------------ | ----------------------- | ------------------------------ |
| OpenAI             | All `tool_choice` values                   | `json_schema` strict, `json_object`    | Data URL           | `max_completion_tokens` | `reasoning_effort`             |
| OpenRouter         | Yes                                        | `json_schema`, `json_object`           | UNVERIFIED         | `max_tokens`            | `reasoning` object             |
| Gemini (compat)    | Yes                                        | Raw field UNVERIFIED                   | Data URL           | UNVERIFIED              | `reasoning_effort`             |
| Anthropic (compat) | Forced choice errors on 5.5 and 5.1 models | Ignored                                | URL                | Both                    | Ignored; `thinking` in body    |
| DeepSeek           | Functions; forced choice 400 when thinking | `json_object` only                     | URL or data URL    | `max_tokens`            | `thinking`, `reasoning_effort` |
| Qwen (DashScope)   | Yes                                        | UNVERIFIED                             | URL or data URL    | `max_tokens`            | `enable_thinking` in body      |
| ModelScope         | UNVERIFIED                                 | UNVERIFIED                             | UNVERIFIED         | UNVERIFIED              | UNVERIFIED                     |
| Groq               | Model-specific                             | Strict on 4 models, no stream or tools | 2 models           | UNVERIFIED              | UNVERIFIED                     |
| Ollama             | Yes; no `tool_choice`                      | `json_object`                          | Base64 only        | UNVERIFIED              | Model-dependent                |
| llama.cpp          | With `--jinja`                             | `json_object`, `json_schema`           | Base64, `--mmproj` | UNVERIFIED              | Server flags                   |

Quirks that affect us:

1. **Silent Drops:** Anthropic's layer ignores `response_format`, `reasoning_effort` and `strict` [16]. OpenRouter
   providers ignore unknown parameters unless `require_parameters: true` [27]. Validate structured replies locally.
2. **No Caching on Anthropic's Layer:** it also merges every system message into one top-level string [16].
3. **Sampling:** Claude 4.7 and later return 400 for `temperature` below 1 [16]. DeepSeek ignores sampling when
   thinking. Send sampling only where a flag allows it.
4. **Fallback Policy:** retry on 408, 429, 5xx and timeouts, then fall back [26][28]. A 400 naming a parameter is a
   config bug, not a fallback trigger.

## Decisions for Rokabot

### 1. Character as a Folder Pack

**Decision:** `characters/<id>/` holds `character.yml` (identity, triggers, sampling, ordered static sections),
`voice.yml` (reply-shape dice), `moods.yml` (mood rules, faces, odds, look) and Markdown sections. Harness defaults in
`prompts/` can be overridden by file name. Zod validates at start. A byte-identical golden test pins Roka's prompt.

**Evidence:**

- All platforms split a character into the same named parts (first table).
- Letta, OpenClaw and CHARX package a character as labelled parts in a folder or archive [2][9][10].
- Ordered sections match SillyTavern's index-placed blocks and the reorderable lists in RisuAI and Agnai.
- ElizaOS limits overrides to keys the runtime reads [8]. A strict zod schema that rejects unknown keys does the same.

**Caveats:**

- Unrestricted override is risky. A card `system_prompt` replaces the global prompt by default [1], and SillyTavern had
  to add `forbid_overrides`. AI disclosure and crisis help must survive any persona [15]. Lock the safety sections: a
  pack may add to them, never replace them.
- Cap each section's size, as Letta and OpenClaw do.
- Treat `sampling` as hints. Several models reject or ignore it.

### 2. Static First, Dynamic After, Reply Shape Last

**Decision:** the static persona comes first and is cached. Dynamic per-turn blocks follow. A code-picked Reply Shape
note comes last.

**Evidence:**

- Anthropic and OpenAI caching need an identical prefix with variable text after it [13][17]. Rokabot's Anthropic
  adapter already marks the stable block with `cache_control`.
- The static block must pass the cache minimum, 512 tokens on Haiku 5.5. The prompt cap is 6,500 tokens.
- All three front ends steer late. Repeating the system prompt late holds up best in later turns [20].
- Code-picked shapes fixed measured repetition in Rokabot v3 [25].

**Caveat:** today the note is the tail of the system prompt. A system message after history is not portable:
Anthropic's layer hoists it to the top [16], and Agnai sends post-history text as a user or assistant message. Keep the
system tail as the default. Replay-test a last-user-turn placement before moving it.

### 3. Any OpenAI-Compatible Endpoint

**Decision:** `provider: openai-compatible` with `baseUrl`, `apiKeyEnv`, capability flags (`tools`, `vision`,
`structuredOutput`, `maxTokensParam`, `efforts`, `sampling`) and `extraBody`.

**Evidence:**

- No two providers in the matrix match. Flags are the only safe way to decide what to send.
- The Vercel AI SDK ships two flags only [29], too few for this spread.
- `extraBody` carries Anthropic `thinking`, DashScope `enable_thinking`, OpenRouter preferences, `top_k` and `min_p`.

**Caveat:** do not route Claude through it. Anthropic's layer drops caching, ignores structured output and effort, and
is "not considered a long-term or production-ready solution" [16]. Keep the native `anthropic` and `gemini` providers.
Consider two more flags: `toolChoice` (allowed values) and `systemRole` (`system` or `developer`).

### 4. Files First, Dashboard Later

**Decision:** edit packs as files now. Later, add a local React, Vite and Tailwind dashboard launched by an npm script
and driven by the zod schema exported as JSON Schema.

**Evidence:**

- Zod 4 (the repo pins `^4.6.5`) has `z.toJSONSchema()`, default target draft-2020-12 [14].
- It throws by default on `transform`, `date`, `map`, `set` and `custom` [14]. Keep these out of the pack schema.
- react-jsonschema-form renders forms from JSON Schema [30]. No persona dashboard of this kind was found.
- Worth copying: RisuAI's drag-to-reorder with token counts and missing-block warnings, and Agnai's order lock.

## Roadmap Candidates

| Rank | Candidate                  | Why                                                                          | Evidence        | Size |
| ---- | -------------------------- | ---------------------------------------------------------------------------- | --------------- | ---- |
| 1    | Depth-Injected Reminder    | `depthNote {depth, role, text}` in history. Limits drift; keeps the cache.   | [20], [3]       | S    |
| 2    | Example Dialogues per Pack | `examples.md` in `<START>` blocks, few, same shape, dropped first.           | [12], [18], [7] | S    |
| 3    | Token-Based History Budget | Replace `windowSize: 20` with a reply reserve and newest-first history fill. | [3]             | M    |
| 4    | Card V3 and V2 Import      | A CLI that turns a card into a pack.                                         | [1], [2]        | M    |
| 5    | Keyword Lore Entries       | `lore/*.md` with keys, priority, constant; scan 2 messages; token budget.    | [1], [5]        | M    |
| 6    | Multi-Character            | Several packs per guild, per-character visibility, a speaker reminder.       | [3], [6], [7]   | L    |

Test each with replays of eight or more turns that include meta questions and emotional users [20][22].

## Sources

1. Character Card V2 spec (re-checked): https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md
2. Character Card V3 spec (re-checked): https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md
3. SillyTavern source at `06bde939`:
   https://github.com/SillyTavern/SillyTavern/tree/06bde939fb1e9c4c8d8641d810f0a916b5bce127/public/scripts
4. SillyTavern Author's Note: https://docs.sillytavern.app/usage/core-concepts/authors-note/
5. SillyTavern World Info: https://docs.sillytavern.app/usage/worldinfo
6. RisuAI source at `e773240`: https://github.com/kwaroran/RisuAI/tree/e773240bfab72f3704f3efa52722ec7d105cdcf3
7. Agnai source at `fccee00`: https://github.com/luminai-companion/agn-ai/tree/fccee00f5f7628d150760c787c4be87e6b1a652c
8. ElizaOS character type: https://github.com/elizaOS/eliza/blob/main/packages/core/src/types/agent.ts
9. Letta Agent File: https://github.com/letta-ai/agent-file
10. OpenClaw workspace: https://docs.openclaw.ai/concepts/agent-workspace
11. llmcord: https://github.com/jakobdylanc/llmcord
12. Anthropic, increase output consistency (re-checked):
    https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency
13. Anthropic prompt caching (re-checked): https://platform.claude.com/docs/en/build-with-claude/prompt-caching
14. Zod JSON Schema (re-checked): https://zod.dev/json-schema
15. Anthropic constitution: https://www.anthropic.com/constitution
16. Anthropic OpenAI SDK compatibility (re-checked):
    https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk
17. OpenAI prompt caching: https://developers.openai.com/api/docs/guides/prompt-caching
18. Gemini prompting strategies: https://ai.google.dev/gemini-api/docs/prompting-strategies
19. OpenAI GPT-5 prompting guide: https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
20. Li et al., instruction drift (re-checked): https://arxiv.org/abs/2402.10962 and https://arxiv.org/html/2402.10962v4
21. Commercial creator docs: https://book.character.ai/character-guide/character-attributes/definition,
    https://kindroid.ai/docs/article/customizing-personality/, https://docs.shapes.inc/how-to-make-a-shape,
    https://creator.poe.com/docs/how-to-create-a-prompt-bot, https://backyard.ai/docs/creating-characters/advanced-tips
22. Lu et al., drift triggers: https://arxiv.org/abs/2601.10387
23. Zheng et al., personas and accuracy: https://arxiv.org/abs/2311.10054
24. PersonaGym: https://arxiv.org/abs/2407.18416
25. Rokabot voice v3 write-up: `docs/research/roka-voice-v3.md`
26. OpenRouter fallbacks: https://openrouter.ai/docs/guides/routing/model-fallbacks
27. OpenRouter provider selection (re-checked): https://openrouter.ai/docs/guides/routing/provider-selection
28. LiteLLM routing: https://docs.litellm.ai/docs/routing
29. Vercel AI SDK, OpenAI-compatible providers: https://ai-sdk.dev/providers/openai-compatible-providers
30. react-jsonschema-form: https://github.com/rjsf-team/react-jsonschema-form
31. Provider pages: https://ai.google.dev/gemini-api/docs/openai, https://api-docs.deepseek.com/api/create-chat-completion,
    https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope,
    https://console.groq.com/docs/openai, https://raw.githubusercontent.com/ollama/ollama/main/docs/openai.md,
    https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
