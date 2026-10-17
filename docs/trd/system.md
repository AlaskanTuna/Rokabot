# System Architecture

How the Rokabot process is built, what it accepts from Discord, and how one turn runs from message to reply.

## At a Glance

| Item              | Value                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Process           | One Node.js service (`src/index.ts`): Discord gateway, reply generation, local storage   |
| Agent             | Google ADK `LlmAgent` and `Runner` (`src/agent/roka.ts`), 14 function tools              |
| Conversation Unit | One ADK session per Discord channel; one active turn per channel                         |
| Durable Store     | SQLite at `data/rokabot.db` (better-sqlite3, WAL); `ROKABOT_DB_PATH` overrides the path  |
| Models            | `llm.main` and optional `llm.fallback` in `config.yml`; see [Models](models.md)          |
| Host              | Docker Compose on a Raspberry Pi 5; the `roka` container is capped at 1 GB, with no swap |
| Health            | HTTP on port 3000: `200` while the Discord client is ready, `503` otherwise              |

## Architecture

![System Overview](../diagrams/system-overview.svg)

_The bot process and its sidecar on the Pi, with Discord on the left and remote model and Jev APIs on the right._

| Layer                 | Responsibility                                                                           | Code                                            |
| --------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Discord Gateway Layer | Detect triggers, run admission guards, show typing, build and send replies               | `src/discord/`                                  |
| Turn Context          | Start Jev and prefetch work at handler entry; build tone, memory and prompt for the turn | `src/agent/turnContext.ts`                      |
| Roka Agent            | Run the ADK runner under retry and fallback; save the turn; report metrics               | `src/agent/roka.ts`, `src/agent/reliability.ts` |
| Session               | Keep a per-channel ADK window; rebuild it from SQLite after a restart or idle expiry     | `src/agent/session.ts`                          |
| Media Watcher         | Turn audio and video into a text digest before the reply call                            | `src/agent/media/`                              |
| Passive Memory        | Capture episodes in monitored channels, queue them, extract claims in the background     | `src/agent/memory/`                             |
| Storage               | Open SQLite and own its schema, migrations and table helpers                             | `src/storage/`                                  |
| `asr` Sidecar         | Transcribe speech for the Qwen watcher over HTTP (`http://asr:8000`, no published port)  | `asr/server.py`, `docker-compose.yml`           |

### Durable State

- SQLite is the source of truth. The in-memory ADK window is a hot cache.
- `roka.ts` writes both sides of a successful turn to `session_history`. A failed turn writes a `failure_diagnostics`
  row instead.
- A new session loads at most `session.windowSize` (20) messages younger than `session.maxRehydrationAge` (2 h).
- `session_history` rows older than `session.historyRetentionDays` (7) are pruned every hour.
- The window holds `session.windowSize × 2` events. A session idle for `session.ttl` ms (500,000; `SESSION_TTL_MS`
  overrides) is destroyed.
- A bot restart keeps all retained history and other durable state.

Table contracts live in [Data](data.md).

## Process Lifecycle

1. **Boot:** set IPv4-first DNS, check for `yt-dlp` (`initializeSocialPosts`), create the Discord client, start the
   health server on port 3000, then log in with `DISCORD_TOKEN`.
2. **Ready:** register the slash commands globally over REST, start the status cycler and the release notifier, open
   SQLite, restore monitored channels, start the reminder scheduler, run the first prune pass, and start the memory
   tasks and the extraction scheduler.
3. **Timers:** prune `session_history` and failure diagnostics hourly; prune metrics and extraction samples daily;
   clear expired channel monitors and emoji cooldowns hourly; prune stale claims, reclassify claims, prune failed
   extraction jobs and prune episodes daily.
4. **Shutdown (`SIGTERM`, `SIGINT`):** flush open episodes, stop the schedulers and memory tasks, end Shiritori
   games, destroy every ADK session (which aborts active turns), wait for in-flight extractions, close SQLite,
   destroy the Discord client, exit.

The health body is JSON: `status`, `uptime`, `memory` (RSS in MB) and `discord` (`connected` or `disconnected`).

## Core Code Modules

| Module                                    | Responsibility                                                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                            | Boot, timers, health server and graceful shutdown.                                                                                                                                       |
| `src/discord/client.ts`                   | Build the discord.js client with its intents and partials, and wire the event handlers.                                                                                                  |
| `src/discord/events/messageCreate.ts`     | Detect triggers, admit turns, reserve call and byte budgets, and send replies.                                                                                                           |
| `src/discord/events/interactionCreate.ts` | Route slash commands; run `/ask` through the same admission and reply path.                                                                                                              |
| `src/discord/messageContent.ts`           | Convert messages, embeds, polls, stickers, forwards, Components V2 and reply context into prompt text and attachments.                                                                   |
| `src/discord/markdownGuard.ts`            | Guard reply markdown before the split: keep fenced and inline code, turn a kaomoji backtick into `｀`, escape `*` `_` `~` inside kaomoji, and escape stray backticks and `~~` elsewhere. |
| `src/discord/responses.ts`                | In-character busy, decline and error lines; `splitResponse` closes and reopens a code block cut across chunks.                                                                           |
| `src/discord/messageBuilder.ts`           | Build the Components V2 reply: accent color, expression thumbnail, `---` separators, tool footer, citations.                                                                             |
| `src/discord/socialPosts/`                | Validate social post URLs, fetch bounded metadata, cache posts, and format them as untrusted quoted context. See [Media](media.md).                                                      |
| `src/discord/events/reportCommand.ts`     | Store `/report` submissions and bounded Discord CDN attachment copies without entering the model path.                                                                                   |
| `src/agent/roka.ts`                       | Configure the ADK agent and runner, then orchestrate `generateResponse`.                                                                                                                 |
| `src/agent/turnContext.ts`                | Assemble session, tone, Jev, identity, retrieval and prompt context for each turn.                                                                                                       |
| `src/agent/session.ts`                    | Own the ADK session service, the idle timers and SQLite rehydration.                                                                                                                     |
| `src/agent/narratedToolCalls.ts`          | Strip tool calls the model wrote as text (`*(recall_user: X)*`, a `tool_code` fence, Qwen's `<tool_call>`) in `afterModelCallback`, so they never reach Discord or session history.      |
| `src/agent/replyBlocks.ts`                | Hold every reply to three blocks in `afterModelCallback`; a `---` divider does not count as a block.                                                                                     |
| `src/agent/replyShape.ts`                 | Pick each reply's shape in code and render the `## Reply Shape` note that closes the prompt. See [Prompt Engine](prompt-engine.md).                                                      |
| `src/agent/attachments.ts`                | Download and measure media, prepare model parts, and provide attachment markers.                                                                                                         |
| `src/agent/media/`                        | Plan, watch and validate audio and video digests. See [Media](media.md).                                                                                                                 |
| `src/agent/reliability.ts`                | Run retry and fallback orchestration and register the error recovery plugin. See [Reliability](reliability.md).                                                                          |
| `src/agent/llm/`                          | Model profiles and provider adapters (Gemini, Anthropic, Chat Completions). See [Models](models.md).                                                                                     |
| `src/agent/jev/`                          | TypeSafe Jev client and judgments. See [Jev](jev.md).                                                                                                                                    |
| `src/agent/memory/`                       | Episode capture, extraction, verification, retrieval and recall. See [Memory](memory.md).                                                                                                |
| `src/agent/tools/`                        | The 14 ADK function tools offered to the model.                                                                                                                                          |
| `src/utils/rateLimiter.ts`                | Sliding 60 s RPM window and UTC-day RPD count per provider and model; turns reserve and release call slots.                                                                              |
| `src/storage/database.ts`                 | Open SQLite in WAL mode, create tables and run migrations.                                                                                                                               |
| `src/storage/reportStore.ts`              | Enforce the per-user report window and persist report rows with bounded channel snapshots.                                                                                               |

## Technology Stack

| Area               | Technology                                                                                        | Version or Source                  |
| ------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Language           | TypeScript, target ES2022, `Node16` modules                                                       | `^5.8.0`                           |
| Runtime            | Node.js on `node:24-alpine`, ARM64 on the Pi                                                      | `engines.node >=24.13.0`           |
| Package Manager    | npm with a committed `package-lock.json` (`npm ci` in the image)                                  | bundled                            |
| Discord            | discord.js, gateway and REST                                                                      | `^14.26.4`                         |
| Agent              | `@google/adk`                                                                                     | `^2.2.1`                           |
| Model SDKs         | `@google/genai`, `@anthropic-ai/sdk`; OpenAI and ModelScope through Chat Completions over `fetch` | `^2.28.0`, `^0.133.0`              |
| Judgments          | `@typesafe-ai/sdk` (Jev)                                                                          | `^0.6.0`                           |
| Storage            | SQLite through better-sqlite3                                                                     | `^12.9.0`                          |
| Media and Images   | sharp, `@napi-rs/canvas`, ffmpeg (Alpine package), yt-dlp onedir build                            | yt-dlp `2026.08.19`                |
| Validation         | Zod                                                                                               | `^4.6.5`                           |
| Config and Logging | js-yaml, dotenv, pino (pino-pretty in development)                                                | `^4.1.1`, `^16.5.0`, `^9.6.0`      |
| Dev Runner         | tsx watch mode (`npm run dev`)                                                                    | `^4.19.0`                          |
| Quality            | Vitest with v8 coverage, Biome, Prettier, commitlint, husky, lint-staged                          | Vitest `^3.1.0`                    |
| Deployment         | Docker multi-stage build, Docker Compose, Raspberry Pi 5 (8 GB)                                   | `Dockerfile`, `docker-compose.yml` |

Compose services:

| Service      | Role                                                                       | Limits                | Starts                               |
| ------------ | -------------------------------------------------------------------------- | --------------------- | ------------------------------------ |
| `roka`       | The bot; publishes port 3000; mounts `./data` and a read-only `config.yml` | 1 GB, no swap         | Always                               |
| `asr`        | Speech recognition (sherpa-onnx)                                           | 2 GB, no swap, 3 CPUs | Always                               |
| `embeddings` | Local embedding sidecar on `http://embeddings:8080`                        | 1 GB, no swap, 1 CPU  | Only with profile `local-embeddings` |
| `watchtower` | Pulls new `roka` and `asr` images daily at 04:07 (container time)          | none set              | Only with profile `autoupdate`       |

Deployment detail lives in [Deployment](deployment.md).

## Discord Events (Inbound)

### Gateway Setup

- **Intents:** `Guilds`, `GuildMessages`, `MessageContent`. `MessageContent` is a privileged intent. There is no
  `DirectMessages` intent, so a DM never yields a message trigger.
- **Partials:** `Channel`, `Message`. Reply detection needs them.
- **Handlers:** `clientReady`, `interactionCreate`, `messageCreate`, plus `error` and `warn` logging.
- **Guild Label:** a turn with no guild is labelled `dm:<channelId>` for metrics and session identity. It is never a
  memory tenant.

### MessageCreate (Mention, Reply, Name)

```text
Event:    messageCreate
Triggers: @mention of Roka                        (human authors only)
          reply to one of Roka's messages         (human authors only)
          the word "roka" in the text             (/\broka\b/i over content and Components V2 text; bots may trigger)
Ignore:   Roka's own messages (recorded for passive memory only)
Extract:  content with mentions resolved, reply context, embeds, polls, stickers, forwards, attachments,
          channelId, member display name
Flow:     start post lookup, reply fetch and turn entry work without waiting
          → admission guards → sendTyping (repeats every 7 s) → await post lookup
          → reserve call slots and attachment bytes → generateResponse(memory: true)
          → message.reply(first chunk) → channel.send(other chunks) → response_events row
```

- **Empty Ping:** a trigger with no text and no attachment becomes `(pinged you without saying anything)`.
- **Gacha Shortcut:** a message that is exactly `gacha`, `draw`, `fortune` or `omikuji` goes to the gacha handler.
  When the handler replies, no model call is made.
- **Monitoring:** any trigger marks the channel monitored for `memory.channelMonitorTtlMs` (24 h), stored in
  `monitored_channels`. In a monitored guild channel, every message, Roka's own included, feeds the episode tracker
  unless `memory.privacy` is `off`.
- **Emoji Reactions:** a non-bot guild message may get a keyword reaction (`emoji.probability`, per-channel
  `emoji.cooldownMs`).

### InteractionCreate (`/ask`)

```text
Event:    interactionCreate
Filter:   isChatInputCommand() && commandName === 'ask'
Extract:  question (required), attachment_1..attachment_3, attachment_url, channelId, member or user display name
Flow:     start post lookup and turn entry work → busy check → call-ceiling check → deferReply()
          → await post lookup → fit attachments → token check → reserve call slots and attachment bytes
          → generateResponse(memory: false) → editReply(first chunk) → followUp(other chunks) → response_events row
```

`/ask` is memory-free. It reads no long-term memory, is offered no memory tools, and records no `context_build`
event. `attachment_url` takes the same formats as the upload slots and shares their `MAX_ATTACHMENTS` (10) budget.

### Other Commands

| Command                            | Install Types | Contexts                       | Uses the Model |
| ---------------------------------- | ------------- | ------------------------------ | -------------- |
| `/ask`                             | Guild, User   | Guild, Bot DM, Private Channel | Yes            |
| `/report`                          | Guild, User   | Guild, Bot DM, Private Channel | No             |
| `/anime`, `/remind`                | Guild, User   | Guild, Bot DM, Private Channel | No             |
| `/gacha`                           | Guild, User   | Guild, Bot DM, Private Channel | No             |
| `/hangman`, `/shiritori`, `/stats` | Guild         | Guild                          | No             |

- Commands that do not use the model take no call slot from the model rate limiter.
- **`/report`:** takes a required `type` (`bug`, `wrong_answer`, `unsafe`, `other`), a required `message` up to 1,500
  characters and one optional `attachment`. It defers ephemerally, writes straight to SQLite and confirms with the
  report ID. It never touches the model, the rate limiter or session state. One user may file
  `report.maxPerUserPerHour` (5) reports per rolling hour. An attachment is copied to `data/reports/` only from
  `cdn.discordapp.com` or `media.discordapp.net` and only up to `report.maxAttachmentBytes` (8 MiB). Row and snapshot
  contracts are in [Data](data.md).

### Installation and Context Policy

Commands register globally (`src/discord/events/ready.ts`). Each command builder sets its installation context
(`GuildInstall`, `UserInstall`) and interaction context (`Guild`, `BotDM`, `PrivateChannel`).
`src/discord/commands/__tests__/registration.test.ts` pins the whole policy and is the authoritative list. A
user-install context delivers interactions only, with no gateway message stream. So there is no mention or reply
trigger and no passive extraction there. `src/discord/__tests__/client.test.ts` pins that absence.

### Turn Admission

Both reply paths run the same guards, in this order. Each decline sends an in-character line that deletes itself
after 5 s.

1. **Busy Channel:** one active turn per channel. A second message gets a busy line; it is not queued.
2. **Call Ceiling:** an advisory check that `gemini.maxLlmCalls` (4) slots are free in the main model's limiter.
3. **Attachment Fit:** attachments past the per-turn count or byte limits are skipped with a note.
4. **Token Budget:** an attachment turn needs `gemini.maxAttachmentTokens` left in this minute's token bucket.
5. **Call Reservation:** reserve `gemini.maxLlmCalls` slots. A lost race declines.
6. **Byte Reservation:** reserve the turn's bytes against `discord.maxInFlightAttachmentBytes` (32 MiB).

A `finally` block always frees the channel, releases the bytes and returns unused call slots. A turn that throws is
charged the full reservation. Limits and failure handling are in [Reliability](reliability.md).

## Turn Walkthrough

![One Mention Turn](../diagrams/system-turn.svg)

_One @mention from Discord to reply, with admission guards and media work folded away._

1. **Trigger:** `messageCreate` matches a trigger. Without waiting, it fetches the replied-to message, starts any
   social post lookup and calls `startTurnEntryWork`. That starts the Jev turn judgment (tone, ambiguous names,
   lookup need), the search prefetch decision and, in guilds, the recall query embedding. See [Jev](jev.md).
2. **Admit:** the guards above run. Typing starts. The post lookup settles and enriches the message text.
3. **Generate:** `generateResponse` starts `prepareTurnMedia` and `createTurnContext` side by side.
   See [Media](media.md).
4. **Context:** `createTurnContext` calls `ensureSession`, which rebuilds a missing session from `session_history`.
   It detects tone by rule, resolves names, and waits for the Jev judgment when `jev.tone` is `on`. It then
   retrieves memory and overheard channel lines, awaits the prefetch, and composes the system prompt. See
   [Memory](memory.md) and [Prompt Engine](prompt-engine.md).
5. **Model Call:** `runTurnWithReliability` drives `runner.runAsync`. ADK may call tools, up to
   `gemini.maxLlmCalls` minus the watcher's calls. Retries, model switching and the safety ladder are in
   [Reliability](reliability.md).
6. **Persist:** attachment bytes and full digests in the session are swapped for compact markers. On success, both
   messages are saved to `session_history`. Token use is charged to the token bucket.
7. **Reply:** the gateway appends attachment notes, guards markdown, splits the text, and sends the chunks. It then
   writes one `response_events` row.

### Prompt Engine Summary

The system prompt has four layers: core identity, speech patterns, a tone variant and channel context
(`assembleSystemPrompt` in `src/agent/promptAssembler.ts`). `createTurnContext` appends the turn's sections:
memory, who is mentioned, overheard channel activity, the speaker's Discord ID, any looked-up results, and a
`## Reply Shape` note chosen in code. The detector picks one of 12 tones by rule, with no model call. The full
contract is in [Prompt Engine](prompt-engine.md).

### Models Summary

`rokaModel` routes each request to the main model and, when configured, the fallback
(`src/agent/llm/createModel.ts`). `llm.main` and `llm.fallback` name entries under `llm.models`. Config load fails
for a model with no verified profile in `src/agent/llm/profiles.ts`. Without an `llm:` block the bot runs
`gemini.model` with `fallback.model`. The full contract is in [Models](models.md).

## Reply Rendering

- **Format:** every conversational reply is a Components V2 container (`MessageFlags.IsComponentsV2`).
- **Split:** text is cut at `discord.maxMessageLength` (1,500 in `config.yml`). The first chunk replies to the
  message or edits the `/ask` reply. Later chunks go to the channel, or as `/ask` follow-ups, with the same tone
  styling and no footer.
- **Separators:** up to two `---` lines in the reply become divider separators.
- **Footer:** the first chunk carries a footer of what she did (post opened, media watched, replies read, tools
  used). It shows two labels, then `+N`. Citations follow the footer.
- **Budget:** text, footer and citations share one 4,000-character `TextDisplay` budget. Citations take only what is
  left.
- **Attachment Notes:** separate in-character notes follow the reply for unsupported, partly read, refused and
  skipped files.

Each tone sets the accent color and draws one expression thumbnail from its pool (`src/discord/toneStyles.ts`,
`src/discord/expressions.ts`):

| Tone        | Accent Color | Expression Pool                           |
| ----------- | ------------ | ----------------------------------------- |
| playful     | `#FFB3D9`    | smile, cheerful, delighted, gentle_smile  |
| sincere     | `#A8D8FF`    | sad, pained, sorrowful                    |
| domestic    | `#FFD4B5`    | content, gentle_smile, relieved           |
| flustered   | `#FFB3B3`    | flustered, nervous, awkward               |
| curious     | `#B2EBF2`    | thinking, surprised, blank_stare          |
| annoyed     | `#F8B4B8`    | exasperated, dissatisfied, dissatisfied_2 |
| tender      | `#E1BEE7`    | worried, troubled, anxious                |
| confident   | `#C8E6C9`    | composed, base, explaining                |
| nostalgic   | `#D4A574`    | melancholy, downcast, somber              |
| mischievous | `#FFD700`    | delighted, attentive                      |
| sleepy      | `#B0C4DE`    | serene, resigned                          |
| competitive | `#FF6B6B`    | frustrated, dissatisfied_3, uncertain     |

## Source Files

- `src/index.ts`
- `src/discord/client.ts`, `src/discord/events/ready.ts`
- `src/discord/events/messageCreate.ts`, `src/discord/events/interactionCreate.ts`
- `src/discord/commands/`, `src/discord/events/reportCommand.ts`
- `src/discord/concurrency.ts`, `src/discord/byteBudget.ts`, `src/agent/tokenBudget.ts`, `src/utils/rateLimiter.ts`
- `src/discord/messageBuilder.ts`, `src/discord/responses.ts`, `src/discord/markdownGuard.ts`
- `src/agent/roka.ts`, `src/agent/turnContext.ts`, `src/agent/session.ts`
- `src/storage/database.ts`, `src/storage/sessionStore.ts`
- `docker-compose.yml`, `Dockerfile`, `package.json`
