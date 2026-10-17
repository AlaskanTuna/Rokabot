# Prompt Engine

How one Discord turn becomes the system prompt and user message the model reads.

## At a Glance

| Item             | Contract                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Character Source | One character pack, loaded and validated once at startup. See [Characters](../guide/characters.md).         |
| System Prompt    | 14 blocks in a fixed order. Blocks 1-2 are static and cached. Blocks 3-14 change per turn.                  |
| Mood             | Rule-based detection on the last 3 messages. Jev can replace it when `jev.tone: on`.                        |
| Reply Shape      | Length, opener, ending, faces, beats and the saying-no scene are rolled in code, then rendered as block 14. |
| Safety Ladder    | Up to 3 rungs. Each rung removes carried context. The current message always stays.                         |
| Size Cap         | Blocks 1-4 stay at or under `MAX_SYSTEM_PROMPT_TOKENS` (6,500) for every mood.                              |
| Regression Gate  | `promptGolden.test.ts` pins every prompt and reply shape by hash.                                           |

![Prompt Stack](../diagrams/prompt-stack.svg)

_The loader reads the pack and harness prompts once; each turn adds per-turn blocks and the reply shape, and
`composePrompt` joins them into one system instruction._

## System Prompt Blocks

`createTurnContext` builds the blocks and `composePrompt(rung)` joins them. `assembleSystemPrompt` builds blocks 1-4
and joins them with a blank line. Every later block starts with a blank line. An empty block adds nothing.

| #   | Block             | Heading in the Prompt                                                                        | Scope          | Source                                                    |
| --- | ----------------- | -------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------- |
| 1   | Core Sections     | The pack's sections, e.g. `## Who You Are`, `## Hard Boundaries`                             | Static, cached | Every `prompt.system` entry except `speech`               |
| 2   | Speech Section    | `## Speech Patterns`                                                                         | Static, cached | The `speech` entry of `prompt.system`                     |
| 3   | Mood              | `## Current Mood: …`                                                                         | Per turn       | The mood's prompt file, default `prompts/moods/<mood>.md` |
| 4   | Situation         | `## Situation`                                                                               | Per turn       | `situation.md`                                            |
| 5   | What You Remember | Legacy: `## What You Remember About People In This Channel`. Unified: `## What You Remember` | Memory         | `memory/retriever.ts` or `memory/recall.ts`               |
| 6   | Who Is Mentioned  | `## Who Is Mentioned`                                                                        | Memory         | `turnContext.ts`                                          |
| 7   | Server Facts      | `## Things You Remember About This Server`                                                   | Memory         | `memory/retriever.ts` (legacy and shadow recall)          |
| 8   | Episodes          | `## Things you remember happening here`                                                      | Memory         | `memory/episodeRetriever.ts` (legacy and shadow recall)   |
| 9   | Media Watched     | `## Media You Watched Here Before`                                                           | Memory         | `memory/mediaRecall.ts` (legacy and shadow recall)        |
| 10  | Overheard         | `## Recent Channel Activity (messages you overheard)`                                        | Per turn       | Passive buffer, `promptSafety.ts`                         |
| 11  | Discord ID Tail   | `- The current user's Discord ID is "<id>".`                                                 | Per turn       | `turnContext.ts`                                          |
| 12  | Looked It Up      | `## Looked It Up`                                                                            | Per turn       | `searchPrefetch.ts`                                       |
| 13  | Redirect This One | `## Redirect This One`                                                                       | Code-picked    | `prompts/safety-steer.md` (locked)                        |
| 14  | Reply Shape       | `## Reply Shape`                                                                             | Code-picked    | `replyShape.ts` with the pack's `voice.yml`               |

- **Blocks 1-2:** one string in the request. They are the pack's `prompt.system` sections in list order. The split
  between them exists only for the token test and the `core.ts` and `speech.ts` exports.
- **Block 5:** `memory.recall: unified` sends one ranked block. `legacy` and `shadow` send the people facts here and
  build blocks 7-9. DMs always use the legacy blocks.
- **Block 6:** lists a nickname or username that differs from the display name, and each Jev referent that passed
  `jev.referentMinConfidence`. It appears on any memory turn, also with `memory.privacy: off`.
- **Block 10:** the last `memory.contextSize` (10) overheard messages. Each message is capped at 300 characters and
  the block at 2,000. `/ask` turns get it too.
- **Block 11:** always present. With long-term memory on, it adds that `remember_user` and `recall_user` target the
  current user, and that `user_name` recalls another member.
- **Block 12:** only with `jev.prefetch: on` and a search that finished within `jev.prefetchWaitMs`.

### When Each Block Is Present

| Block  | Mention, Reply or Name Turn        | `/ask` Turn | Safety Rungs |
| ------ | ---------------------------------- | ----------- | ------------ |
| 1-4    | Yes                                | Yes         | 0-3          |
| 5, 7-9 | When `memory.privacy` is not `off` | No          | 0-1          |
| 6      | When a name resolves               | No          | 0-1          |
| 10     | When the buffer holds messages     | Same rule   | 0            |
| 11     | Yes                                | Yes         | 0-3          |
| 12     | When a prefetch is ready           | Same rule   | 0            |
| 13     | No                                 | No          | 1-3          |
| 14     | Yes                                | Yes         | 0            |

## Memory Modes

The loader builds blocks 1-2 three times, once per memory mode. Only the `{{memory_tools}}` line differs.

| Mode     | Used When                                               | `{{memory_tools}}` Becomes              | Roka Prefix Size |
| -------- | ------------------------------------------------------- | --------------------------------------- | ---------------- |
| `full`   | Mention, reply or name turn, `memory.privacy` not `off` | `memory-tools.md` then `forget-tool.md` | ~5,284 tokens    |
| `forget` | Mention, reply or name turn, `memory.privacy: off`      | `forget-tool.md`                        | ~5,115 tokens    |
| `none`   | `/ask`                                                  | The line is removed                     | ~5,042 tokens    |

Sizes are `estimateTokens` (characters / 4) from `npm run character -- check`. The tool declarations follow the
same rule: `/ask` withholds the memory tools, and `memory.privacy: off` withholds `remember_user` and
`recall_user`.

## Stable Prefix and Caching

- **What Is Stable:** `character.prompts.stable[mode]`, built once at startup. Mood, hour, speaker and safety rung
  never change it.
- **Split:** `splitStablePrefix` finds which of the three stable strings starts the prompt. It returns that prefix
  and the rest.
- **Anthropic:** the adapter sends the prefix as the first system block with `cache_control: { type: 'ephemeral' }`.
  The rest goes as a second block when it is not blank. A prompt with no known prefix goes as one block.
- **Other Providers:** they receive the system instruction as one string, prefix first.
- **Size Cap:** `MAX_SYSTEM_PROMPT_TOKENS` in `tests/harness/tokens.ts` (6,500) bounds blocks 1-4 for every mood at
  hour 5 with a long display name. `tests/harness/__tests__/tokens.test.ts` enforces it. Blocks 5-14 are outside
  the cap, because memory scales with the channel.

## Situation Block

`situation.md` fills two macros each turn:

| Macro             | Value                                                    |
| ----------------- | -------------------------------------------------------- |
| `{{time_of_day}}` | The `situation.timeOfDay` band text for the current hour |
| `{{user}}`        | The speaker's display name                               |

- **Hour:** `getLocalHour()` in the `timezone` from `config.yml`; `TZ` overrides it. Test harness runs can pin it
  with `ROKABOT_FIXED_HOUR` when `ROKABOT_HARNESS_LIVE=1`.
- **Bands:** `[from, to)`. A band whose `to` is not after `from` wraps past midnight.
- **Names:** the block names only the speaker. It lists no other channel members.

A pack may override `situation.md`. It is not locked.

## Mood Detection

`detectToneWithSource` in `src/agent/toneDetector.ts` picks the rule mood. `createTurnContext` then applies Jev.

1. **Input:** the text of the session's events (user and assistant, thought parts left out) plus the current
   message. The detector joins the last 3 with spaces.
2. **Rules:** the `detection` list in `moods.yml`, in file order. Each pattern is a case-insensitive regular
   expression. A pattern counts once, however often it matches.
3. **Winner:** the first rule with at least `minMatches` matching patterns wins. Order sets priority.
4. **Late Night:** for the rule whose mood is `lateNight.mood`, one match is enough during `[lateNight.from,
lateNight.to)`. The rule keeps its place in the order. Roka: `sleepy`, 22:00 to 04:59.
5. **Default:** no rule fires, so the mood is `default` (Roka: `playful`).
6. **Jev Override:** with `jev.tone: on`, the turn waits for the Jev judgment. Jev's mood replaces the rule mood when
   its probability is at least `jev.toneMinProbability` (0.3). A missing judgment or probability keeps the rule
   mood. `shadow` logs the pick and changes nothing. `off` asks no mood question. Jev's choices are the moods, each
   described by its `judge` text, under `judge.moodQuestion`. See [Jev](jev.md).

The final mood selects block 3, the opener skips and extra words, the face groups and the beat odds. It also sets
the reply's accent colour and portrait.

Roka's rule order: `flustered`, `tender`, `curious`, `annoyed`, `sleepy`, `sincere`, `nostalgic`, `domestic`,
`mischievous`, `competitive`, `confident`. Every rule needs 2 matches.

## Reply Shape

`chooseReplyShape` in `src/agent/replyShape.ts` rolls one shape per turn. `renderReplyShape` writes it as block 14
with the lines in `voice.yml` `note`. The tables come from `voice.yml` and `moods.yml`. The classifiers are code.

![Reply Shape Dice](../diagrams/prompt-reply-shape.svg)

_Weight and edge are read from the message; the rolls run in a fixed order, and the edge adds the saying-no line._

### Message Weight

Weight counts only the user's own words. It removes a leading `[Replying to …]` block, URLs and Discord tokens
(`<@…>`, `<#…>`, `<:…>`).

| Weight     | Rule (Checked in This Order)                                                          |
| ---------- | ------------------------------------------------------------------------------------- |
| `quick`    | 4 words or fewer, or 8 words or fewer with no `?`                                     |
| `rich`     | 40 words or more; or a heavy word and 10 words or more; or a `?` and 25 words or more |
| `ordinary` | Anything else                                                                         |

Heavy words: sad, tired, exhausted, stressed, lonely, cry, crying, depressed, anxious, scared, hurt, sick, miss you,
love you, broke up, passed away.

### Paragraphs

A weighted pick from `voice.paragraphs[weight]`. The `lengths` line for that count goes in the note.

| Weight     | Roka Odds                |
| ---------- | ------------------------ |
| `quick`    | 1: 0.65, 2: 0.35         |
| `ordinary` | 1: 0.15, 2: 0.7, 3: 0.15 |
| `rich`     | 2: 0.35, 3: 0.65         |

### Edge

`messageEdge` reads the whole message. When the leading reply quote contains `[Container:` (her own earlier reply),
it reads only the text after the quote, so her own refusal cannot mark the next turn.

| Edge   | Rule                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `hard` | A hard-line word (sexual violence, a slur or a term that sexualises minors), or a minor word and a sexual word in one message |
| `lewd` | A lewd word or phrase, such as `nsfw` or `good in bed`                                                                        |
| `none` | Anything else                                                                                                                 |

The word lists are code (`HARD_LINE`, `MINOR`, `SEXUAL`, `LEWD`). A pack cannot change them.

### Opener

1. **Styles:** `content`, `soft`, `particle`, `gasp`, `comedy`, `name`, in that fixed order.
2. **Allowed:** a style is out when the mood is in its `skipMoods`, or when the edge is `hard` and it has
   `skipOnHardLine`.
3. **Fresh:** the style of her last reply is out too, read from that reply's first word. If nothing is left, any
   allowed style may repeat.
4. **Pick:** one style, uniformly.
5. **Word Styles:** `soft`, `particle` and `gasp` pick from `words` plus `moodWords[mood]`. Words that opened any of
   her last 3 replies are skipped while others remain.
6. **Others:** `comedy` picks one of `bits`. `name` fills `{{user}}` with the display name. `content` has no word.

Roka's skips:

| Style      | Skipped in Moods                           | Skipped on a Hard Line |
| ---------- | ------------------------------------------ | ---------------------- |
| `content`  | None                                       | No                     |
| `soft`     | None (`sleepy` adds `Nn...`)               | No                     |
| `particle` | `sincere`, `tender`, `nostalgic`           | Yes                    |
| `gasp`     | `sincere`, `tender`, `nostalgic`, `sleepy` | No                     |
| `comedy`   | `sincere`, `tender`, `nostalgic`, `sleepy` | Yes                    |
| `name`     | `sincere`, `tender`, `nostalgic`           | No                     |

### Ending

- **Hard Edge:** always `statement`, with no roll.
- **Otherwise:** a weighted pick from `endings` (Roka: statement 0.55, question 0.25, aside 0.2).
- **No Double Question:** the roll leaves out `question` when her last reply ended in `?` followed only by
  non-letters, such as a face or an emoji.

### Faces

1. **Groups:** the mood's `faces` groups, or `hardLineFaces` on a hard edge (Roka: `furious`, `pouty`).
2. **Pool:** every face in those groups, minus any face in the user's message.
3. **Fresh:** faces in her last 5 replies are left out, unless fewer than 4 would remain.
4. **Pick:** shuffle, then take the first 4.

### Beats

Each `voice.yml` beat whose `edges` include this turn's edge rolls once against the mood's odds in `moods.yml`
(missing means 0). A fired beat adds its `line` to the note, in `voice.yml` order.

| Beat      | Edges          | Roka Line (Short)                         |
| --------- | -------------- | ----------------------------------------- |
| `flirt`   | `none`, `lewd` | One plainly sweet or suggestive line      |
| `oneesan` | `none`, `lewd` | Call herself onee-san                     |
| `drama`   | `none`         | One dramatic overreaction, then snap back |

No Roka beat lists `hard`, so none fires on a hard edge.

### Threats and the Saying-No Scene

- **When:** the edge is `lewd` or `hard`.
- **Pick:** one `threats` entry whose `seen` pattern does not match her last 3 replies. If all match, any entry.
- **Note Line:** `note.lewd` (the flustered scene) or `note.hard` (one burst of real outrage), with `{{threat}}`
  filled.

### The Rendered Note

Lines in order: `header`, `intro`, the length line, the open line, the end line, the faces line, each fired beat,
the lewd or hard line, then `nameOnce` unless the opener is `name`.

### RNG Order

With a seeded RNG, the same message, recent replies, mood and pack give the same shape. The rolls run in this
order:

1. Paragraphs.
2. Opener style.
3. Opener word or comedy bit (none for `content` and `name`).
4. Ending (none on a hard edge).
5. Face shuffle (one roll per candidate after the first).
6. Beats (one roll per beat the edge allows, even at zero odds).
7. Threat (only on a lewd or hard edge).

The beat rolls depend on the edge, never on the mood's odds. The golden test relies on this order.

## Safety Ladder

A model reply blocked for safety climbs one rung and retries. Each rung needs a retry slot above
`gemini.retryRpmFloor` and enough turn deadline left for one more request. Otherwise the turn ends with the safety
deflection. See [Reliability](reliability.md).

| Rung | Name             | Prompt Change                                             | Other Change                                                                             |
| ---- | ---------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 0    | None             | All blocks except 13                                      | None                                                                                     |
| 1    | `drop_overheard` | Removes 10, 12 and 14. Adds 13                            | None                                                                                     |
| 2    | `drop_facts`     | Also removes 5-9                                          | None                                                                                     |
| 3    | `clear_history`  | Blocks 1-4 rebuilt with the `safe` mood (Roka: `sincere`) | The session is destroyed and rebuilt empty, without rehydration. Media parts are dropped |

Blocks 1, 2, 4 and 11, the current message text and the attachment notices stay at every rung. A failed turn
records its rung count in `failure_diagnostics.safety_rungs_used`.

## User Message

`buildNewMessage` in `src/agent/roka.ts` sends one user content with these parts, in order:

1. **Media Parts:** images, video and audio sent to the model directly. Dropped at rung 3.
2. **Media Notes:** the text notes from watched media. Dropped at rung 3.
3. **Attachment Notices:** one line each for files that could not be retrieved, files left out over the per-turn
   limit, and files too long to read.
4. **Speaker Line:** `[<displayName>]: <message>`. A reply starts the message with `[Replying to <author>: …]`.

The current message goes on the first attempt and again after a session reset. `beforeModelCallback` sets the system
prompt on every model call, from the rung's rebuilt prompt or the turn's `_systemPrompt` state.

## Golden Test

`src/agent/__tests__/promptGolden.test.ts` pins every prompt the bot can send as SHA-256 hashes in
`tests/fixtures/prompt-golden.json`.

| Key                      | What It Pins                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `system.<mood>.<mode>`   | Blocks 1-4 for every mood, memory mode (`memory`, `forgetOnly`, `memoryFree`) and hour 0-23, plus the prefix split |
| `replyShape.<mood>`      | Block 14 for 40 seeds × 10 messages × 3 sets of recent replies                                                     |
| `replyShape.classifiers` | `messageEdge` and `messageWeight` for the 10 messages                                                              |
| `tones`                  | `detectToneWithSource` for the 10 messages at hours 3, 14 and 23                                                   |
| `faces`                  | The face groups and each mood's groups                                                                             |
| `jevToneCriteria`        | Each mood's `judge` text                                                                                           |

A prompt change that is intended regenerates the fixture with `UPDATE_PROMPT_GOLDEN=1 npm test`. Any other diff is
a regression. The test pins the shipped Roka pack.

## Source Files

- `src/character/load.ts`, `src/character/schema.ts`, `src/character/prompt.ts`, `src/character/paths.ts`
- `src/agent/promptAssembler.ts`
- `src/agent/turnContext.ts` (`createTurnContext`, `composePrompt`)
- `src/agent/toneDetector.ts`
- `src/agent/replyShape.ts`
- `src/agent/roka.ts` (`buildNewMessage`, `beforeModelCallback`, `escalateSafety`)
- `src/agent/llm/anthropicLlm.ts` (`systemBlocks`)
- `src/agent/promptSafety.ts`, `src/agent/searchPrefetch.ts`
- `characters/roka/`, `prompts/`
- `src/agent/__tests__/promptGolden.test.ts`, `tests/harness/tokens.ts`
