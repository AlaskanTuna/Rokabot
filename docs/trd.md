# Technical Requirements

The canonical index of Rokabot's technical contracts. Each subsystem has one module under `docs/trd/`.

## At a Glance

- **Canonical:** this index and its modules are the contract. Code, tests and guides follow them.
- **One Owner per Fact:** a behavior, limit, default or key lives in one module. Other pages link to it.
- **Start Here:** [System](trd/system.md) walks one turn end to end and links every other module.
- **Requirements:** [Product Requirements](prd.md) says what the bot must do. These modules say how.
- **Operations:** the [Runbook](runbook.md) holds commands. The guides under [`guide/`](guide/getting-started.md) hold setup.

## Modules

| Module                                 | Covers                                                                                                                               | File                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| [System Architecture](trd/system.md)   | The process and its lifecycle, core code modules, tech stack, Discord events and install contexts, one turn from message to reply    | `docs/trd/system.md`        |
| [Prompt Engine](trd/prompt-engine.md)  | System prompt blocks and their order, memory modes, the cached prefix, mood detection, the per-turn reply shape, the golden test     | `docs/trd/prompt-engine.md` |
| [Memory](trd/memory.md)                | Claim schema, the passive write path, verification, lifecycle and retention, reclassification, privacy modes, recall, embeddings     | `docs/trd/memory.md`        |
| [Models](trd/models.md)                | Provider IDs, model profiles, config resolution, request shaping, failure classification, main and fallback routing, spend           | `docs/trd/models.md`        |
| [Media](trd/media.md)                  | Attachment intake and ceilings, download and token admission, audio and video watching, social post viewing                          | `docs/trd/media.md`         |
| [Jev Judgments](trd/jev.md)            | The Jev client, turn judgments (tone, names, lookup need), search prefetch, the memory judge                                         | `docs/trd/jev.md`           |
| [Reliability](trd/reliability.md)      | Turn admission, failure kinds, the retry loop, the safety ladder, request slots, token and per-call budgets, concurrency under retry | `docs/trd/reliability.md`   |
| [Data Models and Storage](trd/data.md) | Shared data shapes, the SQLite file and tables, retention, bug reports, the outbound model request                                   | `docs/trd/data.md`          |
| [Deployment](trd/deployment.md)        | CI jobs, image tags, the Pi deploy, release-please, the Docker build, compose services, Pi notes                                     | `docs/trd/deployment.md`    |

## Rules Across Modules

These rules hold in every module. A change that breaks one changes this page first.

### SQLite Is Canonical

`data/rokabot.db` (better-sqlite3, WAL; `ROKABOT_DB_PATH` overrides the path) holds every durable fact: session
history, memory, episodes, media notes, the extraction queue, reminders, games, telemetry, reports and spend.
In-memory state, such as the per-channel ADK window and the post cache, is a cache. A restart loses no durable fact.
Schema changes are forward-only. [Data](trd/data.md) owns the tables.

### The Character Pack Is the Persona Source

The persona (prompts, voice, moods, name triggers) comes from one pack folder: `CHARACTER_DIR`, else `character:` in
`config.yml`, else `characters/roka`. `src/character/` loads and validates it at startup, and a bad pack stops the
bot. Harness prompts that every pack shares live in `prompts/`. `boundaries.md` and `safety-steer.md` are locked
(`LOCKED_PROMPTS` in `src/character/load.ts`), so a pack cannot replace them. Persona text in the system prompt comes only from the
pack and the harness prompts. [Characters](guide/characters.md) owns the pack format, and
[Prompt Engine](trd/prompt-engine.md) owns how it becomes a prompt.

### Untrusted Text Is Labelled

Text from members or the outside world enters a prompt only as data, under an untrusted-data label. The labels for
memory facts, overheard lines, linked posts, post replies and watched-media notes live in `src/agent/promptSafety.ts`.
Episode summaries carry the same kind of heading in `src/agent/memory/episodeRetriever.ts`. Fact keys and values pass
`isSafeFactScalar` before they render. A new prompt input follows the same rule.

### The System Prompt Has a Size Cap

`MAX_SYSTEM_PROMPT_TOKENS` (6,500) in `tests/harness/tokens.ts` caps blocks 1-4 of the system prompt (core sections,
speech, mood and situation) for every mood. `tests/harness/__tests__/tokens.test.ts` enforces it. The cap catches
runaway prompt growth. It is not a latency budget. Later blocks have their own limits, described in
[Prompt Engine](trd/prompt-engine.md) and [Memory](trd/memory.md).

## Changing a Contract

1. Edit the module that owns the contract, in the same pull request as the code change.
2. Keep each module's shape: H1 title, a one-line purpose, an "At a Glance" block, sections and a "Source Files"
   list.
3. When a module is added, renamed or split, or its scope changes, update the [Modules](#modules) table here.
4. When a config key changes, update its comment in `config.yml`, its bounds in `NUMERIC_BOUNDS` (`src/config.ts`) and
   [Configuration](guide/configuration.md).
5. When members or deployers see the change, update the matching page under `docs/guide/`.
6. When a diagram's flow changes, edit its source in `docs/diagrams/src/<name>.json` and export the SVG again.
