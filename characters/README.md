# Character Packs

A character pack is a folder that holds everything the model is told about who it is: prompts, voice, moods and the
tables keyed by mood. The bot loads one pack at startup, validates it, and refuses to start if anything is wrong.
`characters/roka` is the shipped pack.

The bot picks its pack from `CHARACTER_DIR`, else the `character:` key in `config.yml`, else `characters/roka`. A
relative path starts at the repo root. A pack outside the Docker image needs a volume that mounts it.

## Layout

```
characters/<id>/
  character.yml       identity, name triggers, sampling, prompt order, time-of-day phrases, Jev questions
  voice.yml           reply-shape dice: paragraphs, openers, endings, faces, beats, threats and the note's lines
  moods.yml           moods, mood detection and every mood-keyed table
  prompts/            Markdown sections, named in prompt.system; moods/<mood>.md holds each mood's prompt
prompts/              harness prompts every pack shares (repo root)
```

A prompt name such as `intro` or `moods/playful` resolves to `characters/<id>/prompts/<name>.md` first, then to
`prompts/<name>.md`. A pack overrides a harness prompt by shipping a file with the same name.

## Locked Prompts

`boundaries.md` and `safety-steer.md` are locked: a pack that ships either one fails to load. They hold the hard
limits and the safety redirect, so every character keeps them. Edit them in `prompts/` instead. The list is
`LOCKED_PROMPTS` in `src/character/load.ts`.

## Prompt Files

- **Encoding:** UTF-8. The loader strips one trailing newline and trims nothing else.
- **Assembly:** the sections in `prompt.system` are joined with a blank line, then the mood prompt, then
  `situation.md`. The joined sections never change between turns, so a provider can cache them.
- **Formatting:** Prettier skips these files, because it would rewrite `*italic*` to `_italic_`.

## Macros

| Macro                                                               | Where                                   | Becomes                                          |
| ------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------ |
| `{{char}}`                                                          | Prompt files and model-facing YAML text | `name`                                           |
| `{{char_full}}`                                                     | Prompt files and model-facing YAML text | `fullName`                                       |
| `{{world}}`                                                         | Prompt files and model-facing YAML text | `world`                                          |
| `{{user}}`                                                          | `situation.md`, `openers.name`          | The speaker's display name                       |
| `{{time_of_day}}`                                                   | `situation.md`                          | The `situation.timeOfDay` phrase for the hour    |
| `{{memory_tools}}`                                                  | `tools.md`, on a line of its own        | The memory-tool rules for the turn's memory mode |
| `{{word}}`, `{{bit}}`                                               | `openers.*.instruction` in `voice.yml`  | The drawn opener word or comedy bit              |
| `{{length}}`, `{{opener}}`, `{{ending}}`, `{{faces}}`, `{{threat}}` | The matching `note` line in `voice.yml` | The drawn value                                  |

Any other `{{…}}` is a load error that names the file. With full memory `{{memory_tools}}` becomes
`memory-tools.md` and `forget-tool.md`; with memory off it becomes `forget-tool.md`; on `/ask` the line is removed.

## Field Reference

- **character.yml:** `id`, `name`, `fullName`, `world`; `triggers.names` (whole words, any case, that wake the bot);
  `model.temperature` and `model.topP`; `prompt.system` (section order); `situation.timeOfDay` (bands of hours
  `[from, to)` that may wrap past midnight and must cover all 24 hours); `judge.lookupQuestion` and
  `judge.moodQuestion` for Jev.
- **voice.yml:** `paragraphs` (weighted counts by message weight), `lengths`, `openers` (the six styles in fixed
  order, each with `instruction`, optional `skipMoods` and `skipOnHardLine`, plus `words`, `moodWords` or `bits`),
  `endings`, `faces` (named groups), `hardLineFaces`, `beats` (name, edges it may fire on, line), `threats` (text and
  a case-insensitive `seen` pattern), and `note` (the rendered lines).
- **moods.yml:** `default` and `safe` moods; `lateNight` (a mood that fires on one keyword hit in its hours);
  `detection` (rules tried in order; the first with `minMatches` pattern hits wins); `moods` (in display order, each
  with `prompt`, `faces`, `beats`, `judge`, `color`, `placeholder`, `portraits`, `emoji`, `adjective`, `season`);
  `moodPairs` and `portraitUrls`.

Each YAML file carries comments on its own fields. An unknown key is an error, so a typo cannot pass silently.

## Making a New Character

1. Copy `tests/fixtures/characters/minimal` to `characters/<id>`; it uses only the harness prompts and one mood.
2. Fill in `character.yml`, then add persona sections under `prompts/` and list them in `prompt.system`.
3. Add moods to `moods.yml`, each with `prompts/moods/<mood>.md`, and faces and beats to `voice.yml`.
4. Run `npm run character -- check characters/<id>` until it passes.
5. Run `npm run character -- preview characters/<id> --mood <mood> --hour 21 --memory full` to read the prompt.
6. Point `character:` in `config.yml`, or `CHARACTER_DIR`, at the folder.
