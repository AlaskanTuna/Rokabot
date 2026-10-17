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
    <img src="https://img.shields.io/badge/LLM-Any_OpenAI--compatible-412991?style=for-the-badge&logo=openai&logoColor=white" alt="Any OpenAI-compatible LLM" />
    <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Compose" />
    <img src="https://img.shields.io/badge/Raspberry_Pi-5_ARM64-C51A4E?style=for-the-badge&logo=raspberrypi&logoColor=white" alt="Raspberry Pi 5" />
  </p>
</div>

<details>
  <summary><strong>Table of Contents</strong></summary>
  <ol>
    <li><a href="#highlights">Highlights</a></li>
    <li><a href="#how-it-fits-together">How It Fits Together</a></li>
    <li><a href="#tech-stack">Tech Stack</a></li>
    <li><a href="#quick-start">Quick Start</a></li>
    <li><a href="#documentation">Documentation</a></li>
    <li><a href="#who-is-maniwa-roka">Who Is Maniwa Roka</a></li>
    <li><a href="#privacy">Privacy</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
  </ol>
</details>

---

## Highlights

| Area                   | What You Get                                                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Conversation First** | She answers @mentions, replies to her, her name and `/ask`. Each channel keeps its own window of recent messages, rebuilt from SQLite after a restart.                                                                                   |
| **Any Character**      | Persona, voice and moods live in a pack folder. `characters/roka` ships. Point `character:` or `CHARACTER_DIR` at another folder, and check it with `npm run character -- check`.                                                        |
| **Any Model**          | `llm.main` writes the replies. `llm.fallback` takes over when it fails. Tested profiles cover Gemini, Anthropic, OpenAI and ModelScope. `provider: openai-compatible` runs any `/chat/completions` server, such as Ollama or OpenRouter. |
| **Memory**             | She learns member and server facts in channels where someone talked to her, and brings a bounded set back into later replies. Memory never leaves its server. `memory.privacy` limits recall further.                                    |
| **Eyes and Ears**      | She reads images and PDFs, watches audio and video into notes before she replies, and opens X, Bluesky, Threads, YouTube, TikTok, Reddit, Instagram and Bilibili links.                                                                  |
| **Tools and Games**    | Web search, weather, time, dice, anime lookups and reminders in chat. `/gacha`, `/hangman`, `/shiritori` and `/stats` as commands.                                                                                                       |
| **Spend Guards**       | One turn per channel, request and token limits per model, and a monthly USD cap per paid provider.                                                                                                                                       |
| **Runs Anywhere**      | One Docker Compose stack. Published amd64 and arm64 images run on a Pi 5, any Docker host, Railway, Render, Fly.io or Coolify.                                                                                                           |

## How It Fits Together

![System Overview](diagrams/system-overview.svg)

_The bot and its speech sidecar in Docker Compose, between Discord and the remote model and Jev APIs. SQLite holds all durable state._

| Path                  | Holds                                                                    |
| --------------------- | ------------------------------------------------------------------------ |
| `config.yml`          | Every tunable, each with an inline comment                               |
| `.env.example`        | The secrets the bot reads, with empty values                             |
| `characters/roka/`    | The shipped character pack: persona prompts, voice and moods             |
| `prompts/`            | Harness prompts that every pack shares, including the locked safety ones |
| `src/discord/`        | Gateway events, slash commands, admission guards, reply rendering        |
| `src/agent/`          | The ADK agent, prompt assembly, models, memory, media, Jev, tools        |
| `src/storage/`        | The SQLite schema and table helpers                                      |
| `asr/`                | The speech recognition sidecar                                           |
| `sidecar/embeddings/` | The optional local embeddings sidecar                                    |
| `tests/`              | The test harness, fixtures and the prompt size cap                       |

## Tech Stack

| Area                 | Technology                                                             |
| -------------------- | ---------------------------------------------------------------------- |
| Language and Runtime | TypeScript (ES2022), Node.js 24                                        |
| Discord              | discord.js v14                                                         |
| Agent                | Google ADK                                                             |
| Models               | Gemini, Anthropic, OpenAI, ModelScope, or any OpenAI-compatible server |
| Judgments            | TypeSafe Jev (optional)                                                |
| Storage              | SQLite via better-sqlite3                                              |
| Media                | sharp, ffmpeg, yt-dlp, and a sherpa-onnx speech sidecar                |
| Quality              | Vitest, Biome, Prettier, commitlint                                    |
| Deployment           | Docker Compose; images on GHCR, built for amd64 and arm64              |

## Quick Start

1. Create a Discord application. Turn on **Message Content Intent**. Install it with the `bot` and `applications.commands` scopes.
2. Get the code and the secrets file:

   ```bash
   git clone https://github.com/AlaskanTuna/Rokabot.git && cd Rokabot
   cp .env.example .env
   ```

3. Fill in `.env`: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` and the model keys. The shipped `config.yml` needs `ANTHROPIC_API_KEY`, `MODELSCOPE_API_KEY` and `GEMINI_API_KEY`. To run on one Gemini key, add `LLM_MAIN=flash` and `LLM_FALLBACK=none`.
4. Start the stack:

   ```bash
   mkdir -p data
   docker compose pull && docker compose up -d
   ```

5. Check it. `curl http://localhost:3000/` returns HTTP 200 once she is online. Then mention the bot in a channel.

[Getting Started](guide/getting-started.md) has the full steps, local development, tests and startup errors. To run without a clone, follow [Docker](deploy/docker.md).

## Documentation

| For               | Read                                                                                                                                                                                                     | What You Get                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Deployers         | [Getting Started](guide/getting-started.md)                                                                                                                                                              | Discord app setup, keys, first run with npm or Docker                                               |
| Deployers         | [Configuration](guide/configuration.md)                                                                                                                                                                  | Every `config.yml` key with its default, env override and bounds; every secret                      |
| Deployers         | [Persona Studio](../studio/README.md)                                                                                                                                                                    | `npm run studio`: a local dashboard for the pack, `config.yml` and `.env`, checked before each save |
| Deployers         | [Models](guide/models.md)                                                                                                                                                                                | How to pick the main and fallback models, add an OpenAI-compatible server, cap spend                |
| Deployers         | [Features](guide/features.md)                                                                                                                                                                            | Triggers, commands, tools, media, games and stats, as members see them                              |
| Deployers         | [Memory](guide/memory.md)                                                                                                                                                                                | What she remembers, privacy levels, forgetting, maintenance scripts                                 |
| Deployers         | [Docker](deploy/docker.md), [Railway](deploy/railway.md), [Render](deploy/render.md), [Fly.io](deploy/fly.md), [Coolify](deploy/coolify.md)                                                              | The published image on each platform, with updates and rollback                                     |
| Character Writers | [Characters](guide/characters.md)                                                                                                                                                                        | How to build a character pack: layout, prompts, voice, moods, checks                                |
| Character Writers | [Prompt Engine](trd/prompt-engine.md)                                                                                                                                                                    | How a pack becomes the system prompt each turn: blocks, mood detection, reply shape                 |
| Character Writers | [Character Harness](research/character-harness-2026.md), [Roka Voice v3](research/roka-voice-v3.md), [Roka Voice v4](research/roka-voice-v4.md)                                                          | The research behind the harness and Roka's voice                                                    |
| Operators         | [Runbook](runbook.md)                                                                                                                                                                                    | Pi access, deploy and rollback, config switches, database work, troubleshooting                     |
| Operators         | [Deployment](trd/deployment.md)                                                                                                                                                                          | CI jobs, image tags, compose services, the release flow                                             |
| Contributors      | [TRD Index](trd.md)                                                                                                                                                                                      | The module list and the rules every module follows                                                  |
| Contributors      | [System](trd/system.md)                                                                                                                                                                                  | The process, Discord events, one turn from message to reply                                         |
| Contributors      | [Memory](trd/memory.md)                                                                                                                                                                                  | Write path, claim lifecycle, privacy gate, recall                                                   |
| Contributors      | [Models](trd/models.md)                                                                                                                                                                                  | Providers, profiles, routing, hedging, spend                                                        |
| Contributors      | [Media](trd/media.md)                                                                                                                                                                                    | Attachments, audio and video watching, social posts                                                 |
| Contributors      | [Jev Judgments](trd/jev.md)                                                                                                                                                                              | Turn judgments, search prefetch, the memory judge                                                   |
| Contributors      | [Reliability](trd/reliability.md)                                                                                                                                                                        | Turn admission, retries, the safety ladder, rate and token budgets                                  |
| Contributors      | [Data](trd/data.md)                                                                                                                                                                                      | Shared data shapes, SQLite tables, retention                                                        |
| Contributors      | [Product Requirements](prd.md)                                                                                                                                                                           | Goals, users, requirements and how far each has shipped                                             |
| Contributors      | [Multimodal](research/multimodal.md), [Jev Integration](research/jev-integration.md), [Social Post Viewing](research/social-post-viewing.md), [Auto-Deploy Platforms](research/auto-deploy-platforms.md) | The research behind media limits, Jev, post links and platform updates                              |

## Who Is Maniwa Roka

<img align="right" src="../assets/roka-sticker-1.png" alt="Roka serving drinks" width="100" />

**Maniwa Roka** (馬庭 芦花) is a warm, gently teasing onee-san side character from [Senren\*Banka](https://vndb.org/v19073) (千恋＊万花). Rokabot brings her observant, affectionate energy to a Discord server through in-character conversation. She chats with the server, remembers useful context without carrying it into another server or a DM, helps with everyday requests and makes downtime more playful. She is the shipped character pack, `characters/roka`.

<img src="../assets/banner.png" alt="Maniwa Roka banner" />

## Privacy

- **Self-Hosted:** all state sits in local SQLite (`data/rokabot.db`): session history, memory, reminders, game data, metrics, failure diagnostics and bug reports.
- **Retained Text:** failure diagnostics keep the triggering message verbatim for `metrics.diagnosticsRetentionHours` (72 h). A sample of rejected conversations (at most 200, for `memory.extractionSampleDays`, 14 days) is kept for offline review. `memory.extractionSampleRate: 0` stops it.
- **Scope:** memory stays in its Discord server. DMs and `/ask` never read or write it. `memory.privacy` can keep memories inside one channel.
- **What Leaves the Host:** messages go to the configured model providers, and web searches go to Tavily. With `TYPESAFE_API_KEY`, conversation text and candidate facts go to TypeSafe Jev. Memory text and the message she answers go to the embedding provider, unless it is `local`.
- **Attachments:** chat files are never written to disk or SQLite. Only text is kept, including notes on watched media. A file attached to `/report` is the exception: a bounded copy goes to `data/reports/`.
- **Disclosure:** tell your members that Roka reads channels where she was mentioned.

## Contributing

1. Branch from `main`. Every change, small ones included, lands through a pull request.
2. Run the gates: `npm test && npm run test:perf`, then `npm run lint`, `npm run format:check` and `npm run typecheck`.
3. Write commits as [Conventional Commits](https://www.conventionalcommits.org/). A commit hook checks them.
4. Open the pull request. It can merge only after the `test` check passes.
5. When a change alters a contract, update its [TRD](trd.md) module in the same pull request.

## License

[MIT](../LICENSE).
