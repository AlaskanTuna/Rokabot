<a id="readme-top"></a>

<div align="center">
  <img src="../assets/app-icon.jpg" alt="Rokabot" width="128" height="128" style="border-radius: 50%;" />

  <h1>Rokabot</h1>

  <p>
    A server-wide Discord character chatbot embodying <strong>Maniwa Roka</strong> from <em>Senren*Banka</em>.<br />
    In-character conversation, useful tools, and small games—self-hosted on a Raspberry Pi.
  </p>

  <p>
    <img src="https://img.shields.io/badge/TypeScript-ES2022-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Node.js-24-5FA04E?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 24" />
    <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="discord.js v14" />
    <img src="https://img.shields.io/badge/Gemini-3.5_Flash_Lite-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini 3.5 Flash Lite" />
    <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Compose" />
    <img src="https://img.shields.io/badge/Raspberry_Pi-5_ARM64-C51A4E?style=for-the-badge&logo=raspberrypi&logoColor=white" alt="Raspberry Pi 5" />
  </p>
</div>

<details>
  <summary><strong>Table of Contents</strong></summary>
  <ol>
    <li><a href="#who-is-maniwa-roka">Who Is Maniwa Roka?</a></li>
    <li><a href="#features">Features</a></li>
    <li><a href="#architecture">Architecture</a></li>
    <li><a href="#prompt-system">Prompt System</a></li>
    <li><a href="#memory">Memory</a></li>
    <li><a href="#expressions--tones">Expressions &amp; Tones</a></li>
    <li><a href="#tech-stack">Tech Stack</a></li>
    <li><a href="#getting-started">Getting Started</a></li>
    <li><a href="#configuration">Configuration</a></li>
    <li><a href="#deployment--operations">Deployment &amp; Operations</a></li>
    <li><a href="#documentation">Documentation</a></li>
    <li><a href="#privacy">Privacy</a></li>
    <li><a href="#license">License</a></li>
  </ol>
</details>

---

## Who is Maniwa Roka and Rokabot?

<img align="left" src="../assets/roka-sticker-1.png" alt="Roka serving drinks" width="100" />

**Maniwa Roka** (馬庭 芦花) is a warm, gently teasing onee-san side character from [Senren\*Banka](https://vndb.org/v19073) (千恋＊万花). **Rokabot** brings her observant, affectionate energy to a Discord server through in-character conversation.

<img align="right" src="../assets/roka-sticker-2.png" alt="Roka in casual outfit" width="80" />

She can chat with a server, remember useful context without carrying it into another server or DM, help with everyday requests, and make downtime more playful.

<img src="../assets/banner.png" alt="Yuzucook" />

<p align="right"><a href="#readme-top">↑</a></p>

---

## Features

- **Conversation & Perception:** `/ask`, mentions, replies, and supported name-keyword triggers; she takes images, PDFs, audio and video, on both the `/ask` and mention surfaces, plus by link, and reads recent channel context.
- **Memory:** Passive context monitoring and claims-based memory, isolated per tenant — a guild, or a single DM or group chat — and surfaced only through a bounded prompt envelope.
- **Tools:** In chat, Roka can roll dice, flip coins, check the time and weather, search the web, discover anime and airing schedules, and manage reminders; a cute footer notes the little ritual she performed.
- **Stats:** Fun server analytics with a mood ring, charts, and a peek at who she's remembered lately, across four Last 30 Days views.
- **Games:** Buddy Pets, Hangman, and Shiritori, with SQLite-backed progress and leaderboards.
- **Interaction & UX:** Rule-based tone detection, expression thumbnails, Components V2 replies, emoji reactions, rate limits, and per-channel concurrency protection.
- **Files & Media:** Image, PDF, audio, and video attachments on `/ask` and the mention path, each held to its own size ceiling, with graceful in-character notices when a file can't be read — see [Handing Her a File](#handing-her-a-file) below.

| Command or Capability  | Use                                                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ask`                 | Ask Roka anything or just talk; she searches the web herself when she needs to. Optionally attach a file, or link one — see [Handing Her a File](#handing-her-a-file).                                                                                                                   |
| `/gacha`               | Hatch, view, pet, inspect stats, browse collection, read the guide, or view the leaderboard.                                                                                                                                                                                             |
| `/hangman`             | Start and play a word-guessing game.                                                                                                                                                                                                                                                     |
| `/shiritori`           | Start, join, and score a word-chain game.                                                                                                                                                                                                                                                |
| `/anime`               | Search or browse anime, or search or browse airing schedules.                                                                                                                                                                                                                            |
| `/remind`              | Create, list, and cancel reminders.                                                                                                                                                                                                                                                      |
| `/stats`               | Explore four fixed, non-overlapping Last 30 Days views with no window selector: Overview (activity, heatmap, channel histogram); Mood (label, donut); Memory (the 5 most recently-remembered members and their latest memory, growth curve); Nerd (latency, reliability, volume, trend). |
| In-Conversation Memory | Recall or save useful user facts within the current server or DM.                                                                                                                                                                                                                        |

### Tool Footer

When Roka uses a tool mid-conversation, her reply ends with a small footer line (e.g. `🌸 cast the fortune dice · divined today's weather • <relative timestamp>`, rendered by Discord as "2 minutes ago") noting each tool she invoked, phrased as a little shrine ritual. Up to three labels are shown (`…and more` beyond that). When she searched the web, a second small line cites the sources the answer was built on — up to three, shown as linked domains (e.g. `🔗 crunchyroll.com · polygon.com`) so the footer says what she did and the citations say where it came from.

Every tool below is available implicitly in chat — Roka decides when to call it. The **Slash Command** column names the command built around that tool: `/anime` and `/remind` invoke theirs directly, and `/ask` is listed against `search_web` because looking things up is what that command is for. The rest are reached only by talking to her.

<details>
<summary><strong>Footer Labels & Tool Availability</strong></summary>

| Tool                 | Footer Label                 | Slash Command | Implicit In Chat |
| -------------------- | ---------------------------- | ------------- | ---------------- |
| `roll_dice`          | cast the fortune dice        | —             | ✅               |
| `flip_coin`          | tossed a shrine coin         | —             | ✅               |
| `get_current_time`   | peeked at the temple clock   | —             | ✅               |
| `get_weather`        | divined today's weather      | —             | ✅               |
| `search_web`         | searched the wider world     | `/ask`        | ✅               |
| `search_anime`       | leafed through anime scrolls | `/anime`      | ✅               |
| `get_anime_schedule` | checked the airing almanac   | `/anime`      | ✅               |
| `set_reminder`       | tied a reminder charm        | `/remind`     | ✅               |
| `list_reminders`     | counted her reminder charms  | `/remind`     | ✅               |
| `cancel_reminder`    | untied a reminder charm      | `/remind`     | ✅               |
| `remember_user`      | pressed a memory flower      | —             | ✅               |
| `recall_user`        | recalled a pressed memory    | —             | ✅               |

Passive memory extraction runs automatically in the background through the per-message pipeline, while `remember_user` is only invoked when someone explicitly asks Roka to remember something.

</details>

### Handing Her a File

Roka reads four kinds of attachment — image, PDF, audio, and video — on both `/ask` (upload or link) and the mention path, each held to its own size ceiling: 4 MB for an image, 10 MB for a PDF, 8 MB for audio, and 10 MB for video. The ceilings come from how long an upload takes to reach the Pi against `gemini.timeout`, not from memory.

- **One attachment per turn, on every surface.** The reason is fairness rather than quota: the in-flight byte budget is shared across every channel, so a turn allowed several attachments would reserve most of that budget and hold off everyone else.
- **Oversized media is truncated, not dropped.** The file is fetched down to its ceiling and sent as its opening — but only for container formats that survive being cut short; some formats are refused instead.
- **She says so when a file couldn't be read**, with a different notice for a file that could not be retrieved than for one too long to read in one turn. Without that distinction she would search the web on the user's own phrasing and report the results as the file's contents.
- **`attachment_url`** reads the file's type from a HEAD request rather than trusting the link's path, and checks the host against the addresses it actually resolves to — re-checked on whatever host a redirect chain lands on.
- Beyond attachments, she also reads forwarded messages, embeds, polls, stickers, and files carried inside Components V2 messages.

`docs/trd.md` is the canonical contract for the behavior above; `docs/multimodal.md` is its derivation.

<p align="right"><a href="#readme-top">↑</a></p>

---

## System Architecture

### High-Level Overview

<details>
<summary>View Diagram</summary>

```mermaid
flowchart LR
    Discord[Discord] <--> Gateway[discord.js Gateway]
    Gateway <--> Sessions[Session Manager]
    Sessions <--> Agent[Roka Agent]
    Agent <--> Gemini[Gemini API]
    Agent <--> SQLite[(SQLite)]
    Agent <--> Tools[Tools and Games]
    Gateway --> Metrics[Metrics]
```

</details>

- One Node.js service handles Discord events, response generation, and local storage.
- SQLite is the durable store; the active session window is rehydrated for a live conversation.
- Tools and games remain available to the agent while its responses stay in character.

### Message Pipeline

<details>
<summary>View Diagram</summary>

```mermaid
flowchart LR
    Trigger[Slash command, mention, reply, or name keyword] --> Guards[Rate and concurrency guards]
    Guards --> Session[SQLite-backed session window]
    Session --> Tone[Rule-based tone detection]
    Tone --> Prompt[Layered prompt assembly and bounded memory retrieval]
    Prompt --> ADK[Google ADK]
    ADK <--> Tools[Tools]
    ADK --> Gemini[Gemini]
    Gemini --> Reply[Components V2 reply]
```

</details>

- The concurrency guard permits one active response per channel.
- An attachment turn passes four admission guards in order — an advisory rate-limit check, a per-minute token-budget check, an authoritative call-slot reservation, and a global in-flight byte-budget reservation — each declining in character rather than silently.
- `/anime` and `/remind` no longer take a Gemini call slot they never use.
- A spent daily quota and a transient rate limit both arrive as an HTTP 429, but are now classified apart so the bot can respond to each appropriately.
- Tone detection examines recent conversation without an extra model call.
- Read the [technical reference](./trd.md) for request contracts, data models, and failure behavior.

### Prompt System

<details>
<summary>View Diagram</summary>

```mermaid
flowchart TD
    Recent[Recent messages] --> Detector[Rule-based tone detector]
    Detector --> Tone[Tone variant]
    Core[Core identity] --> Assembly[System prompt]
    Speech[Speech patterns] --> Assembly
    Tone --> Assembly
    Context[Channel context: participants, time of day, and memory claims in a safety envelope] --> Assembly
```

</details>

- The four layers are core identity, speech patterns, a tone variant, and channel context.
- The detector selects from 12 tones using recent messages; it adds no LLM cost.
- The assembled system prompt is size-capped for change detection, not tuned for a target size. See the [technical reference](./trd.md) for the deeper contract.

### Memory

<details>
<summary>View Diagram</summary>

```mermaid
flowchart LR
    Passive[Passive buffer] --> Gate[Candidate gate]
    Gate --> Queue[extraction_queue]
    Queue --> Scheduler[Per-guild scheduler]
    Scheduler --> Extractor[Extractor]
    Extractor --> Claims[(memory_claim)]
    Claims --> Retriever[Bounded retriever]
    Retriever --> Envelope[Prompt safety envelope]

    subgraph Lifecycle[Claim Lifecycle]
        Candidate[candidate] --> Active[active]
        Active --> Superseded[superseded]
        Active --> Rejected[rejected]
    end

    Extractor --> Candidate
```

</details>

- Roka retains useful facts and relationships for the place they were observed — a guild, or a single DM or group chat; memory never crosses between them.
- A fact the user asks her outright to remember is pinned and survives the active-claim ceiling.
- `recall_user` ranks by relevance to the current message rather than by recency.
- Extraction is asynchronous, while retrieval remains bounded before a response is generated.
- The exported memory graph is browseable in Obsidian; see [Browsing Memory in Obsidian](#browsing-memory-in-obsidian).
- For schema, lifecycle, and retrieval details, see [Memory Architecture (Claims)](./trd.md#memory-architecture-claims).

### Expressions & Tones

<details>
<summary>View Diagram</summary>

```mermaid
flowchart LR
    Tone[Detected tone] --> Prompt[Tone prompt variant]
    Tone --> Style[Accent color]
    Tone --> Expression[Expression thumbnail]
    Prompt --> Message[Components V2 reply]
    Style --> Message
    Expression --> Message
```

</details>

Each detected tone selects a prompt variant, an accent color, and one of its mapped expression thumbnails before Roka's Components V2 reply is built.

| Tone        | Accent Color | Expression Pool                           |
| ----------- | ------------ | ----------------------------------------- |
| playful     | `#FFB3D9`    | smile, cheerful                           |
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

<p align="right"><a href="#readme-top">↑</a></p>

---

## Tech Stack

| Area                 | Technology                                                  |
| -------------------- | ----------------------------------------------------------- |
| Language and Runtime | TypeScript (ES2022), Node.js 24                             |
| Discord              | discord.js v14                                              |
| Agent and Model      | Google ADK, Gemini 3.5 Flash Lite (`gemini-3.5-flash-lite`) |
| Storage              | SQLite via better-sqlite3                                   |
| Media and Validation | sharp, @napi-rs/canvas, @google/genai, Zod                  |
| Quality              | Vitest, Biome, Prettier, commitlint                         |
| Deployment           | Docker Compose on Raspberry Pi 5 (ARM64)                    |

<p align="right"><a href="#readme-top">↑</a></p>

---

## Getting Started

### Prerequisites

- Node.js 24.13.0 or newer.
- A Discord bot token and client ID, with the Message Content privileged intent enabled.
- A Gemini API key.
- Docker and Docker Compose for containerized deployment.
- Optional: a Tavily API key for web search.

### Install & Configure

```bash
git clone https://github.com/AlaskanTuna/rokabot.git
cd rokabot
npm ci
cp .env.example .env
```

### `.env` Secrets

| Variable              | Required | Purpose                                                               |
| --------------------- | -------- | --------------------------------------------------------------------- |
| `DISCORD_TOKEN`       | Yes      | Discord bot token.                                                    |
| `DISCORD_CLIENT_ID`   | Yes      | Discord application client ID.                                        |
| `GEMINI_API_KEY`      | Yes      | Gemini API key for response generation and extraction.                |
| `TAVILY_API_KEY`      | No       | Tavily API key for web search.                                        |
| `DEV_GEMINI_API_KEY`  | No       | Second Gemini key, harness-only, for `npm run test:live`.             |
| `ROKABOT_HARNESS_KEY` | No       | Names which `.env` key funds a `npm run test:live` run, harness-only. |

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
GEMINI_API_KEY=your_gemini_api_key
TAVILY_API_KEY=your_tavily_api_key
```

Other optional environment values, including `GRAPHIFY_GEMINI_API_KEY` and `ROKABOT_DB_PATH`, are documented in [`.env.example`](../.env.example).

### Run

```bash
# Development
npm run dev

# Production
npm run build
npm start

# Docker
docker compose up -d
```

Quick checks: `npm run lint`, `npm run format:check`, and `npm run typecheck` — the last of these is the only gate that type-checks the `tests/` tree ([#151](https://github.com/AlaskanTuna/Rokabot/pull/151)); `npm run build` type-checks `src/` only. Full test verification is `npm test && npm run test:perf`; `npm run test:perf` is a separate performance-evaluation gate. `npm run test:live` is a third, opt-in gate: `ROKABOT_HARNESS_KEY` names which `.env` key funds a run (default `GRAPHIFY_GEMINI_API_KEY`); `DEV_GEMINI_API_KEY` is a documented second key so an exhausted daily quota can redirect a run rather than stall it. It is excluded from both `npm test` and full verification. `npm run measure -- <path>` prints an attachment's measured token cost and which ceilings it meets, and costs nothing against the generate quota.

`npm run test:live` benchmarks whether the live model fires a tool on a labelled should-fire/shouldn't-fire dialogue set, scored separately across three case sets under `tests/harness/tool-trigger/` — `recall-user.jsonl`, `search-web.jsonl`, and `remember-user.jsonl`. It is the pre-ship acceptance gate for prompt and tool-description changes. Each case set's verdict rests on a precision floor and a per-tool recall floor, not an accuracy floor or a zero-systematic-failures rule; `systematicFailures` is a diagnostic and does not gate the verdict. `remember_user` is judged against its own lower recall floor because the shared floor false-fails it at its measured rate, so a green `remember_user` is a collapse detector rather than a regression detector — it is not evidence that nothing else regressed. One run costs roughly half of one Gemini key's daily request allowance and about an hour of wall clock, so budget for two runs per key per day. Each run prints its own per-case report; no verdict is quoted here, because one is only true of the prompt and the day it was measured on.

<p align="right"><a href="#readme-top">↑</a></p>

---

## Configuration

Secrets belong in `.env`; tunables belong in [`config.yml`](../config.yml). Environment variables override the values listed below when the loader supports them.

### Gemini

<details>
<summary>View Tunables</summary>

| YAML Path                     | Env Override                    | Purpose                                                                                                                                                                                       |
| ----------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gemini.model`                | `GEMINI_MODEL`                  | Live Gemini model ID.                                                                                                                                                                         |
| `gemini.extractionModel`      | `GEMINI_EXTRACTION_MODEL`       | Optional background extraction model; defaults to the live model.                                                                                                                             |
| `gemini.timeout`              | `GEMINI_TIMEOUT`                | Request timeout in milliseconds.                                                                                                                                                              |
| `gemini.maxRetries`           | `GEMINI_MAX_RETRIES`            | Maximum retries for transient failures.                                                                                                                                                       |
| `gemini.maxOutputTokens`      | `GEMINI_MAX_OUTPUT_TOKENS`      | Response token safety cap.                                                                                                                                                                    |
| `gemini.safetyThreshold`      | `GEMINI_SAFETY_THRESHOLD`       | Harm block threshold — one of `OFF`, `BLOCK_NONE`, `BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_LOW_AND_ABOVE` — applied uniformly to all four Gemini-API-supported safety categories. |
| `gemini.maxLlmCalls`          | —                               | Maximum chained tool calls per request.                                                                                                                                                       |
| `gemini.liveMaxRetries`       | `GEMINI_LIVE_MAX_RETRIES`       | Retry attempts after a failed live response.                                                                                                                                                  |
| `gemini.retryRpmFloor`        | `GEMINI_RETRY_RPM_FLOOR`        | Minimum remaining RPM required for a live retry.                                                                                                                                              |
| `gemini.extractionRpmFloor`   | `GEMINI_EXTRACTION_RPM_FLOOR`   | Minimum remaining RPM required for background extraction.                                                                                                                                     |
| `gemini.extractionMaxRetries` | `GEMINI_EXTRACTION_MAX_RETRIES` | Retry attempts after a transient extraction failure.                                                                                                                                          |
| `gemini.retryBackoffBaseMs`   | `GEMINI_RETRY_BACKOFF_BASE_MS`  | Initial full-jitter retry backoff in milliseconds.                                                                                                                                            |
| `gemini.retryBackoffCapMs`    | `GEMINI_RETRY_BACKOFF_CAP_MS`   | Maximum full-jitter retry backoff in milliseconds.                                                                                                                                            |
| `gemini.turnDeadlineMs`       | `GEMINI_TURN_DEADLINE_MS`       | Wall-clock budget for the live retry loop; a retry starts only if a full `gemini.timeout` still fits, and the first attempt is never gated.                                                   |

</details>

### Rate Limit, Session, and Discord

<details>
<summary>View Tunables</summary>

| YAML Path                      | Env Override                 | Purpose                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rateLimit.rpm`                | `RATE_LIMIT_RPM`             | Exact sliding-window cap on requests (not turns) per minute, enforced in [`src/utils/rateLimiter.ts`](../src/utils/rateLimiter.ts); each turn reserves `gemini.maxLlmCalls` slots up front, so the sustained turn ceiling sits below the nominal `rpm` ([#149](https://github.com/AlaskanTuna/Rokabot/issues/149), [#167](https://github.com/AlaskanTuna/Rokabot/issues/167)). |
| `rateLimit.rpd`                | `RATE_LIMIT_RPD`             | Requests per day cap.                                                                                                                                                                                                                                                                                                                                                          |
| `session.ttl`                  | `SESSION_TTL_MS`             | Idle session lifetime in milliseconds.                                                                                                                                                                                                                                                                                                                                         |
| `session.windowSize`           | `SESSION_WINDOW_SIZE`        | Maximum messages rehydrated into the ADK session.                                                                                                                                                                                                                                                                                                                              |
| `session.maxRehydrationAge`    | —                            | Maximum age of a message rehydrated from SQLite.                                                                                                                                                                                                                                                                                                                               |
| `session.historyRetentionDays` | —                            | Days before session history is pruned.                                                                                                                                                                                                                                                                                                                                         |
| `discord.maxMessageLength`     | `DISCORD_MAX_MESSAGE_LENGTH` | Character cap for a bot reply.                                                                                                                                                                                                                                                                                                                                                 |

</details>

### Attachments and Budgets

<details>
<summary>View Tunables</summary>

| YAML Path                            | Env Override                            | Purpose                                                                                                                                                                             |
| ------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gemini.maxAttachmentTokens`         | `GEMINI_MAX_ATTACHMENT_TOKENS`          | Max measured token cost of one turn's attachments before they are refused. Size does not bound this — a small PDF can cost tens of thousands of tokens because the driver is pages. |
| `gemini.maxTokensPerMinute`          | `GEMINI_MAX_TOKENS_PER_MINUTE`          | Tokens per rolling minute before new attachment turns are declined.                                                                                                                 |
| `discord.maxInFlightAttachmentBytes` | `DISCORD_MAX_INFLIGHT_ATTACHMENT_BYTES` | Ceiling on attachment bytes downloading across all channels at once, reserved before download.                                                                                      |
| `metrics.diagnosticsRetentionHours`  | `METRICS_DIAGNOSTICS_RETENTION_HOURS`   | Retention for stored failure diagnostics.                                                                                                                                           |

</details>

### Memory

<details>
<summary>View Tunables</summary>

| YAML Path                           | Env Override                            | Purpose                                                    |
| ----------------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| `memory.bufferSize`                 | `MEMORY_BUFFER_SIZE`                    | Passive in-memory buffer size per channel.                 |
| `memory.contextSize`                | —                                       | Overheard messages injected into one prompt.               |
| `memory.extractionInterval`         | `MEMORY_EXTRACTION_INTERVAL`            | Messages between background fact extraction attempts.      |
| `memory.extractionGapMs`            | `MEMORY_EXTRACTION_GAP_MS`              | Minimum time between extractions.                          |
| `memory.maxFactsPerUser`            | —                                       | Legacy stored-fact cap per user.                           |
| `memory.factRetentionDays`          | —                                       | Legacy unused-fact retention period.                       |
| `memory.channelMonitorTtlMs`        | —                                       | Monitoring lifetime after the latest mention.              |
| `memory.claimsBackend`              | `MEMORY_CLAIMS_BACKEND`                 | Enables typed claims extraction and retrieval.             |
| `memory.maxClaimsPerTurn`           | `MEMORY_MAX_CLAIMS_PER_TURN`            | Maximum claims included in one response.                   |
| `memory.retrievalTokenBudget`       | `MEMORY_RETRIEVAL_TOKEN_BUDGET`         | Approximate claims-envelope token budget.                  |
| `memory.recentParticipantLimit`     | `MEMORY_RECENT_PARTICIPANT_LIMIT`       | Non-speaker participants considered for retrieval.         |
| `memory.speakerMinShare`            | `MEMORY_SPEAKER_MIN_SHARE`              | Minimum share of selected claims reserved for the speaker. |
| `memory.maxActiveClaimsPerUser`     | `MEMORY_MAX_ACTIVE_CLAIMS_PER_USER`     | Active claim cap per user; pinned claims are exempt.       |
| `memory.claimRetentionDays`         | `MEMORY_CLAIM_RETENTION_DAYS`           | Retention period for inactive, unpinned claims.            |
| `memory.extractionDailyBudgetRatio` | `MEMORY_EXTRACTION_DAILY_BUDGET_RATIO`  | Gemini daily budget share reserved for extraction.         |
| `memory.perGuildGapMs`              | `MEMORY_PER_GUILD_GAP_MS`               | Minimum time between extraction batches for one guild.     |
| `memory.extractionQueueMaxPerGuild` | `MEMORY_EXTRACTION_QUEUE_MAX_PER_GUILD` | Maximum queued extraction payloads for one guild.          |
| `memory.vaultExportDir`             | `MEMORY_VAULT_EXPORT_DIR`               | Output directory for read-only Obsidian vault exports.     |

</details>

### Metrics, Emoji, Reminders, Games, and Runtime

<details>
<summary>View Tunables</summary>

| YAML Path                    | Env Override             | Purpose                                       |
| ---------------------------- | ------------------------ | --------------------------------------------- |
| `metrics.retentionDays`      | `METRICS_RETENTION_DAYS` | Days before metrics events are pruned.        |
| `emoji.probability`          | —                        | Chance of a keyword-matched emoji reaction.   |
| `emoji.cooldownMs`           | —                        | Per-channel cooldown between emoji reactions. |
| `reminders.checkIntervalMs`  | —                        | Reminder scheduler polling interval.          |
| `reminders.maxPerUser`       | —                        | Maximum active reminders per user.            |
| `reminders.staleThresholdMs` | —                        | Lateness threshold for dropping a reminder.   |
| `games.hangmanLives`         | —                        | Wrong guesses allowed in Hangman.             |
| `games.hangmanTimeoutMs`     | —                        | Hangman inactivity timeout.                   |
| `games.shiritoriTimeoutMs`   | —                        | Shiritori turn inactivity timeout.            |
| `games.shinyChance`          | —                        | Probability of hatching a shiny Buddy Pet.    |
| `statusCycleMs`              | —                        | Discord status rotation interval.             |
| `timezone`                   | `TZ`                     | IANA timezone for time-of-day features.       |
| `logging.level`              | `LOG_LEVEL`              | Pino log verbosity.                           |

</details>

For defaults and the full behavior behind these settings, see [`config.yml`](../config.yml) and the [technical reference](./trd.md).

<p align="right"><a href="#readme-top">↑</a></p>

---

## Deployment & Operations

```mermaid
flowchart LR
    Push[Push to main] --> Runner[Self-hosted GitHub Actions runner on Pi]
    Runner --> Pull[Fetch target branch]
    Pull --> Build[docker compose up -d --build]
    Build --> Health[Health check]

    Database[(Pi SQLite DB)] --> Export[npm run export:vault]
    Export --> Vault[data/vault]
    Vault --> Transfer[Copy to your desktop]
    Transfer --> Desktop[Desktop]
    Desktop --> Obsidian[Obsidian]
```

- Docker Compose runs Rokabot on a Raspberry Pi 5 with `mem_limit: 1g`, `memswap_limit: 1g` (equal values disable swap entirely — Docker otherwise defaults swap to twice the cap and pages onto the SD card), and `restart: unless-stopped`.
- The self-hosted GitHub Actions runner builds and health-checks code changes pushed to `main`; the workflow's `paths-ignore` skips `*.md`, `docs/**`, `.claude/**`, `.coderabbit.yaml`, and `.agents/**`.
- Use the [operations runbook](./runbook.md) for Pi commands, runner setup, troubleshooting, and database operations.

### Browsing Memory in Obsidian

1. On the Pi, run the export against the live SQLite database.
2. The default destination is `data/vault/`; set `MEMORY_VAULT_EXPORT_DIR` to write a different destination.
3. Treat the result as a read-only static snapshot. Re-run the export whenever you want it refreshed.
4. Copy it to a desktop machine, then open the copied folder as an Obsidian vault to browse the per-guild memory graph.

```bash
cd /path/to/rokabot
npm run export:vault
rsync -av data/vault/ desktop-user@desktop-host:~/Rokabot-vault/
```

Obsidian belongs on the desktop, not the Pi: it is a graphical desktop application, while the Pi is kept focused on the bot as a headless server.

<p align="right"><a href="#readme-top">↑</a></p>

---

## Documentation

- [Product Requirements](./prd.md)
- [Technical Reference](./trd.md)
- [Multimodal Attachments](./multimodal.md)
- [Deployment and Operations Runbook](./runbook.md)

<p align="right"><a href="#readme-top">↑</a></p>

---

## Privacy

Rokabot is self-hosted and stores session history, memory claims, reminders, game data, metrics, and failure diagnostics (which retain the triggering message verbatim for a bounded window, configured by `metrics.diagnosticsRetentionHours`) in local SQLite. Claims are isolated per tenant: a guild, or an individual DM or group chat, never crossing between them. Messages used to generate responses and extract memory are sent to the Gemini API. Attachments are never written to disk or to SQLite — only text content is persisted, so a restart drops them entirely. Server operators should disclose passive monitoring in channels where Roka has been mentioned.

<p align="right"><a href="#readme-top">↑</a></p>

---

## License

MIT. 2026.

<p align="right"><a href="#readme-top">↑</a></p>
