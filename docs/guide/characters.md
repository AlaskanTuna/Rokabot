# Characters

How to run Rokabot as Roka or as a character of your own, and how to write a character pack.

## At a Glance

| Topic             | Rule                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| What a Pack Is    | One folder with `character.yml`, `voice.yml`, `moods.yml` and a `prompts/` folder.               |
| Shipped Pack      | `characters/roka` (Maniwa Roka, 12 moods).                                                       |
| Picking the Pack  | `CHARACTER_DIR`, else `character:` in `config.yml`, else `characters/roka`.                      |
| Validation        | At startup. Any problem stops the bot and names the file and the key.                            |
| Shared Prompts    | `prompts/` at the repo root. A pack overrides one by shipping a file with the same name.         |
| Locked Prompts    | `boundaries.md` and `safety-steer.md`. A pack that ships either one fails to load.               |
| Tools             | `npm run character -- check` validates a pack. `npm run character -- preview` prints its prompt. |
| Applying a Change | Restart the bot. The pack loads once at startup.                                                 |

The prompt contract (block order, mood detection, reply shape, safety ladder) is in
[Prompt Engine](../trd/prompt-engine.md). Every line the bot posts outside the model's replies (busy and error
replies, status text, command copy, `/stats` labels) lives in the pack's `lines.yml`.

`npm run studio` starts [Persona Studio](../../studio/README.md), a local API that edits a pack and checks every save
with this same validation.

## How the Bot Picks a Pack

1. `CHARACTER_DIR` in `.env`, if set.
2. Else the top-level `character:` key in `config.yml` (shipped: `characters/roka`).
3. Else `characters/roka`.

A relative path starts at the repo root (`/app` in the Docker image). A `character:` value that is not a non-empty
string stops startup.

## Pack Layout

```text
characters/<id>/
  character.yml       identity, name triggers, sampling, prompt order, time-of-day phrases, Jev questions
  voice.yml           reply-shape tables: paragraphs, openers, endings, faces, beats, threats, note lines
  moods.yml           moods, mood detection rules and every table keyed by mood
  lines.yml           every line posted outside the model's replies, grouped by surface
  prompts/            your Markdown sections; prompts/moods/<mood>.md holds each mood's prompt
prompts/              harness prompts every pack shares (repo root)
```

Each YAML file carries comments on its own fields. An unknown key is an error, so a typo cannot pass.

## character.yml

| Key                    | Rule                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | Lowercase id, such as `roka`. Letters, digits, `-` and `_`.                                                                                              |
| `name`                 | Short name. Fills `{{char}}`. Saved as the speaker name of her replies. A leading `[Name]:` tag is stripped from replies.                                |
| `fullName`             | Fills `{{char_full}}`.                                                                                                                                   |
| `world`                | The place the character calls home. Fills `{{world}}`.                                                                                                   |
| `triggers.names`       | At least one name. A whole-word, any-case match in a channel wakes the bot.                                                                              |
| `model.temperature`    | `0` to `2`. A sampling hint; a model whose profile takes no sampling drops it.                                                                           |
| `model.topP`           | Above `0`, up to `1`. Same as above.                                                                                                                     |
| `prompt.system`        | Prompt names in order, such as `[intro, who-you-are, answering, tools, boundaries, speech]`. This is the cached part of the prompt.                      |
| `situation.timeOfDay`  | Bands of `{ from, to, text }`. Hours `[from, to)` in the `timezone` from `config.yml`. A band may wrap past midnight. The bands must cover all 24 hours. |
| `judge.lookupQuestion` | The question Jev answers to decide whether a message needs a web search.                                                                                 |
| `judge.moodQuestion`   | The question Jev answers to pick the mood. Name the character, so Jev reads the message from its side.                                                   |

## voice.yml

These tables set the `## Reply Shape` note that closes every prompt. Code rolls the dice; the pack sets the odds and
the words. Weights are relative within each list.

| Key             | Rule                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `paragraphs`    | `quick`, `ordinary` and `rich`, each a list of `{ count: 1-3, weight }`.                                                    |
| `lengths`       | The note's length line for counts `1`, `2` and `3`.                                                                         |
| `openers`       | All six styles, tried in this order: `content`, `soft`, `particle`, `gasp`, `comedy`, `name`.                               |
| `endings`       | `statement`, `question` and `aside`, each `{ weight, line }`.                                                               |
| `faces`         | Named groups of faces, such as `happy` or `pouty`. Each group needs one face or more.                                       |
| `hardLineFaces` | The face groups offered when a message crosses a hard line.                                                                 |
| `beats`         | Optional. Each `{ name, edges, line }`. `edges` lists `none`, `lewd` or `hard`. `moods.yml` sets the odds.                  |
| `threats`       | At least one `{ text, seen }`. `seen` is a case-insensitive regular expression that spots the threat in her last 3 replies. |
| `note`          | The rendered lines: `header`, `intro`, `length`, `open`, `end`, `faces`, `lewd`, `hard`, `nameOnce`.                        |

Each opener style has an `instruction`. `skipMoods` leaves the style out for those moods. `skipOnHardLine: true`
leaves it out on a hard line. `soft`, `particle` and `gasp` also need `words`, and may add `moodWords` per mood.
`comedy` needs `bits`.

Keep each face plain-bracketed, at most 20 characters inside the brackets, and free of two ASCII letters or digits in
a row. Then the markdown guard renders it as typed.

## moods.yml

| Key            | Rule                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `default`      | The mood when no detection rule fires.                                                                                                                                   |
| `safe`         | The mood forced on the last rung of the safety ladder.                                                                                                                   |
| `lateNight`    | Optional `{ mood, from, to }`. In those hours one keyword match is enough for that mood. The mood needs a detection rule.                                                |
| `detection`    | Rules tried in order, each `{ mood, minMatches, patterns }`. The first rule with `minMatches` matching patterns wins. Patterns are case-insensitive regular expressions. |
| `moods`        | Each mood, keyed by a lowercase name, in the order `/stats` and Jev show them. At least one.                                                                             |
| `moodPairs`    | Optional `/stats` season titles for a `dominant:runnerUp` pair.                                                                                                          |
| `portraitUrls` | Optional image URL for each portrait name.                                                                                                                               |

Each mood takes these keys:

| Key           | Rule                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `prompt`      | Optional prompt name. Default: `moods/<mood>`.                                                  |
| `faces`       | `voice.yml` face groups, at least one.                                                          |
| `beats`       | Optional odds (`0` to `1`) for each `voice.yml` beat. A missing beat never fires in this mood.  |
| `judge`       | Jev's description of when the mood fits.                                                        |
| `color`       | `#rrggbb`. The reply's accent colour and the `/stats` chart colour.                             |
| `placeholder` | Image URL for the reply thumbnail when the mood has no portrait.                                |
| `portraits`   | Optional portrait names from `portraitUrls`. Each reply shows one, not the same twice in a row. |
| `emoji`       | The mood's label in `/stats` charts.                                                            |
| `adjective`   | The mood's adjective in `/stats` text.                                                          |
| `season`      | The `/stats` season title when this mood leads.                                                 |

## lines.yml

Every line the bot posts in the character's voice outside the model's own replies. A list is a pool: each post draws
one line at random. A pack without `lines.yml` fails to load; there are no built-in English defaults.

| Group         | Holds                                                                         |
| ------------- | ----------------------------------------------------------------------------- |
| `replies`     | Rate-limit, busy and error replies                                            |
| `attachments` | Notes added when a file was unsupported, cut short, too large or skipped      |
| `reliability` | Lines sent in place of a reply when a turn goes wrong                         |
| `tools`       | `/anime` and tool-command lines                                               |
| `reminders`   | `/remind` replies and the reminder she delivers                               |
| `games`       | Game lines outside each game's own rules                                      |
| `status`      | Discord status text by hour; the bands must cover all 24 hours                |
| `commands`    | Slash command descriptions (Discord's limit: 100 characters; checked at load) |
| `stats`       | `/stats` notebook copy, including one label per memory predicate              |
| `footers`     | Labels in the line under a reply that says what she did (one per footer tool) |

`{{char}}`, `{{char_full}}` and `{{world}}` work in every line. A runtime slot such as `{{task}}` or `{{mention}}` works
only in the key that declares it (`LINE_SLOTS` in `src/character/schema.ts`); the comment on each key names its slots.
Adding a footer tool or a memory predicate in code means adding its label to every pack.

## Prompt Files and Macros

- **Encoding:** UTF-8. The loader strips one trailing newline and nothing else.
- **Assembly:** the loader joins the `prompt.system` sections with a blank line. The mood prompt and `situation.md`
  follow. The joined sections never change between turns, so a provider can cache them.
- **Formatting:** Prettier skips these files. It would rewrite `*italic*` to `_italic_`.

| Macro                                                               | Where It Works                          | Becomes                                      |
| ------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------- |
| `{{char}}`, `{{char_full}}`, `{{world}}`                            | Prompt files and model-facing YAML text | `name`, `fullName`, `world`                  |
| `{{user}}`                                                          | `situation.md`, `openers.name`          | The speaker's display name                   |
| `{{time_of_day}}`                                                   | `situation.md`                          | The `situation.timeOfDay` text for the hour  |
| `{{memory_tools}}`                                                  | `tools.md`, on a line of its own        | The memory-tool rules for the turn           |
| `{{word}}`, `{{bit}}`                                               | `openers.*.instruction` in `voice.yml`  | The opener word or comedy bit that was drawn |
| `{{length}}`, `{{opener}}`, `{{ending}}`, `{{faces}}`, `{{threat}}` | The matching `note` line in `voice.yml` | The value that was drawn                     |

Any other `{{…}}` is a load error that names the file. `{{memory_tools}}` becomes `memory-tools.md` and
`forget-tool.md` on a normal turn, `forget-tool.md` alone with `memory.privacy: off`, and nothing on `/ask`.

## Harness Prompts and Overrides

A prompt name such as `intro` or `moods/playful` resolves to `characters/<id>/prompts/<name>.md` first, then to
`prompts/<name>.md`. A pack overrides a harness prompt by shipping a file with the same name.

| Harness Prompt    | Used When                          | Override |
| ----------------- | ---------------------------------- | -------- |
| `answering.md`    | Named in `prompt.system`           | Allowed  |
| `audio-video.md`  | Named in `prompt.system`           | Allowed  |
| `images.md`       | Named in `prompt.system`           | Allowed  |
| `tools.md`        | Named in `prompt.system`           | Allowed  |
| `memory-tools.md` | A section holds `{{memory_tools}}` | Allowed  |
| `forget-tool.md`  | A section holds `{{memory_tools}}` | Allowed  |
| `situation.md`    | Every turn                         | Allowed  |
| `boundaries.md`   | Named in `prompt.system`           | Locked   |
| `safety-steer.md` | Safety ladder rungs 1-3            | Locked   |

Locked prompts hold the hard limits and the safety redirect, so every character keeps them. Edit them in `prompts/`.
The list is `LOCKED_PROMPTS` in `src/character/load.ts`. A lock stops a pack from replacing `boundaries.md`. It does
not make the pack list it, so keep `boundaries` in `prompt.system`.

## Make a New Character

1. Copy a starting point to `characters/<id>`:
   - `characters/roka` for a full pack with persona sections, 12 moods and every table.
   - `tests/fixtures/characters/minimal` for the smallest valid pack: only harness prompts and one mood.
2. Edit `character.yml`: `id`, names, `triggers.names`, `world`, the time-of-day bands and both Jev questions.
3. Write persona sections in `prompts/` and list them in `prompt.system`. Keep `boundaries` in the list.
4. Add moods to `moods.yml`. Give each one `prompts/moods/<mood>.md`, face groups and beat odds.
5. Add faces, openers, beats and threats to `voice.yml`.
6. Validate until it passes:

   ```bash
   npm run character -- check characters/<id>
   ```

7. Read the assembled prompt for one turn:

   ```bash
   npm run character -- preview characters/<id> --mood <mood> --hour 21 --memory full
   ```

   `--memory` takes `full`, `forget` or `none`. Without `--mood` it uses `default`. Without `--hour` it uses the
   machine's local hour. The speaker is named `User`. The preview shows the sections, the mood and the situation.
   It leaves out memory, channel lines and the Reply Shape note. Without a folder, `check` and `preview` use the
   pack the bot would pick.

8. Point the bot at the pack: `character: characters/<id>` in `config.yml`, or `CHARACTER_DIR=characters/<id>` in
   `.env`.
9. Restart the bot. With Docker, run `docker compose restart roka` after a `config.yml` edit, and
   `docker compose up -d` after a `.env` or compose edit. Deploys need the owner's authorization.

### A Pack Outside the Image

The image holds `characters/` and `prompts/` as they were at build time. A pack edited on the host needs a rebuild
(`docker compose up -d --build`) or a volume:

```yaml
services:
  roka:
    volumes:
      - ./characters/mina:/app/characters/mina:ro
```

Then set `CHARACTER_DIR=characters/mina` in `.env` and run `docker compose up -d`. With the volume in place, an edit
to the pack needs only `docker compose restart roka`.

## Reading Validation Errors

`check` and startup report every problem at once, one per line:

```text
broken is not a valid character pack:
broken/prompts/boundaries.md: boundaries.md is a locked harness prompt; edit prompts/boundaries.md instead
broken/prompts/answering.md: unknown macro {{usr}}
broken/character.yml: situation.timeOfDay: no band covers hour 6
broken/moods.yml: moods.calm.faces[1]: unknown face group "happy"
```

Each line is `<file>: <YAML path>: <problem>`. The YAML path is left out when the problem is the whole file. YAML
schema errors (a missing file, bad YAML, an unknown key, a wrong type) come first, on their own. Fix those, then run
`check` again to see the cross-reference problems.

| Message                                         | Fix                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `Unrecognized key: "…"`                         | Remove or rename the key. Unknown keys are errors.                     |
| `file is missing`                               | Add `character.yml`, `voice.yml` or `moods.yml`.                       |
| `no prompt file "x.md" in … or …`               | Add `prompts/x.md`, or fix the name in `prompt.system` or the mood.    |
| `unknown macro {{x}}`                           | Use a macro from the table. The message names the file where it works. |
| `{{memory_tools}} must be on a line of its own` | Move it to its own line in `tools.md`.                                 |
| `… is a locked harness prompt`                  | Delete the file from the pack. Edit the harness copy instead.          |
| `unknown mood "x"`                              | Add the mood to `moods`, or fix the name.                              |
| `unknown face group "x"`                        | Add the group to `voice.yml` `faces`.                                  |
| `unknown beat "x"`                              | Add the beat to `voice.yml` `beats`.                                   |
| `no URL for portrait "x" in portraitUrls`       | Add the portrait to `portraitUrls`.                                    |
| `no band covers hour n`                         | Add or widen a `situation.timeOfDay` band.                             |
| `"x" has no detection rule to relax`            | Add a `detection` rule for the `lateNight` mood.                       |

## Writing Tips

From [Character Harness Research](../research/character-harness-2026.md):

- **Static Persona First:** keep everything that varies out of `prompt.system`. The cache needs an identical prefix.
  A prefix under the provider's cache minimum is not cached (Anthropic lists 512 tokens for Haiku 5.5).
- **Show, Do Not Only Tell:** list common situations with the reply you expect. A few examples in the same shape
  work best; too many make the model copy them. Roka's `speech.md` ends with example lines and example replies.
- **Keep Facts Out of the Persona:** a persona adds no factual accuracy. Write who the character is and how they
  talk. Let `search_web` and memory supply facts.
- **No Contradictions:** the Reply Shape note sets length, opener and ending each turn. Do not fix a different length
  or opener in a persona section.
- **Measure Drift:** test a pack with replays of eight turns or more, including questions about the bot itself and
  upset users.

## Source Files

- `characters/README.md`
- `characters/roka/`, `prompts/`
- `tests/fixtures/characters/minimal/`
- `src/character/schema.ts`, `src/character/load.ts`, `src/character/paths.ts`, `src/character/prompt.ts`
- `scripts/character.ts`
- `.env.example`, `config.yml`, `Dockerfile`, `docker-compose.yml`
