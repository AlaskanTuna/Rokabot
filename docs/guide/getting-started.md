# Getting Started

Set up a Discord app, configure Rokabot, and run it locally or with Docker.

## At a Glance

| Item           | Value                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Node.js        | `>=24.13.0` (`package.json` `engines`). The Docker image uses `node:24-alpine`.                                         |
| Package Tool   | npm (`package-lock.json`)                                                                                               |
| Always Needed  | `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`                                                                                    |
| Model Keys     | Depend on the models `config.yml` selects. See [Model Keys for the Shipped Config](#model-keys-for-the-shipped-config). |
| Slash Commands | Registered by the bot on every start. No manual step.                                                                   |
| Health Check   | `curl http://localhost:3000/`                                                                                           |
| Data           | SQLite at `data/rokabot.db` (`ROKABOT_DB_PATH` overrides)                                                               |

## Prerequisites

| What                     | Why                                                                    | Required                |
| ------------------------ | ---------------------------------------------------------------------- | ----------------------- |
| Node.js 24.13.0 or newer | Runs the bot and the tests.                                            | For local runs          |
| Docker with Compose      | Runs the published image or a local build.                             | For Docker runs         |
| A Discord application    | Gives the bot token and client ID.                                     | Yes                     |
| Model API keys           | Pay for the main model, fallback, embeddings and media watcher.        | Yes, per `config.yml`   |
| `ffmpeg` and `yt-dlp`    | Video frames, speech audio and social video links. The image has both. | Optional for local runs |

### Model Keys for the Shipped Config

The bot checks keys at startup. It needs one key for each provider that `config.yml` assigns to a role. The shipped file assigns these:

| Role           | Shipped Setting               | Key                  |
| -------------- | ----------------------------- | -------------------- |
| Main model     | `llm.main: haiku`             | `ANTHROPIC_API_KEY`  |
| Fallback model | `llm.fallback: qwen122`       | `MODELSCOPE_API_KEY` |
| Embeddings     | `embeddings.provider: gemini` | `GEMINI_API_KEY`     |
| Media watcher  | `media.watcher: gemini`       | `GEMINI_API_KEY`     |

To run on one Gemini key only, add `LLM_MAIN=flash` and `LLM_FALLBACK=none` to `.env`.

Optional keys:

- **`TAVILY_API_KEY`:** turns on web search.
- **`TYPESAFE_API_KEY`:** turns on Jev judgments for tone, names and passive memory.
- **`YOUTUBE_API_KEY`:** lets Roka read top comments on YouTube links.

[Configuration](configuration.md#secrets) lists every key and when it is required. [Models](models.md) explains each model profile.

## Set Up the Discord App

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. On the **Bot** page, reset the token. Save it as `DISCORD_TOKEN`.
3. On the **Bot** page, turn on **Message Content Intent**. The bot connects with the Guilds, GuildMessages and MessageContent intents, and MessageContent is privileged.
4. On the **General Information** page, copy the **Application ID**. Save it as `DISCORD_CLIENT_ID`.
5. Install the app in your server with both scopes, `bot` and `applications.commands`. With `applications.commands` alone, only `/ask` works. Mentions, replies and name triggers never fire.
6. Grant these permissions: View Channels, Send Messages, Read Message History, Add Reactions, Attach Files and Embed Links.

## Install and Configure

1. Clone the repository.

   ```bash
   git clone https://github.com/AlaskanTuna/Rokabot.git
   cd Rokabot
   ```

2. Install dependencies: `npm ci`.
3. Copy the example secrets file: `cp .env.example .env`.
4. Edit `.env`. Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` and the model keys from the table above.
5. Read `config.yml` and change what you need. [Configuration](configuration.md) explains every key.

## Register Slash Commands

You do not run a command for this. On each Discord `ready` event, the bot sends its full command list to Discord as global application commands for `DISCORD_CLIENT_ID` (`src/discord/events/ready.ts`).

- **Success:** the log shows `Slash commands registered`.
- **Failure:** the log shows `Failed to register slash commands` with the Discord error. The bot keeps running.

## Run in Development

1. Start the bot with hot reload: `npm run dev`. This runs `tsx watch src/index.ts` with `LOG_LEVEL=debug`.
2. Wait for `Roka is online!` in the terminal.
3. To run a production build without Docker, run `npm run build`, then `npm start`.

## Run Tests

1. Run the main gate: `npm test`. It sets fake keys and an in-memory database, so it needs no `.env`.
2. Run the performance gate: `npm run test:perf`. Full verification is `npm test && npm run test:perf`.
3. Run the static checks: `npm run lint`, `npm run format:check` and `npm run typecheck`. Only `typecheck` checks the types in `tests/`.

Other tools:

| Command                     | What It Does                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:live`         | Opt-in live-model gate. It spends real Gemini calls. `ROKABOT_HARNESS_KEY` names the key; the default is `GRAPHIFY_GEMINI_API_KEY`. |
| `npm run preview`           | Writes a reply as Discord draws it to `preview-out/preview.html`, without posting.                                                  |
| `npm run measure -- <path>` | Prints the measured token cost of an attachment.                                                                                    |

## Run With Docker

`docker-compose.yml` defines `roka` (the bot) and `asr` (speech recognition). Pick one image source.

| Source          | Command                                       | Image                                                          |
| --------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Published image | `docker compose pull && docker compose up -d` | `ghcr.io/alaskantuna/rokabot:${ROKA_TAG:-stable}`              |
| Local build     | `docker compose up -d --build`                | Built from `Dockerfile` and `asr/`, under the same image names |

A local build takes the compose image name, so it replaces your local copy of the published tag. Run `docker compose pull` to get the published image back.

1. Create the data folder: `mkdir -p data`. Compose mounts it at `/app/data`.
2. If your login is not UID 1000, run `sudo chown 1000:1000 data`. The container runs as user `node` (UID 1000).
3. Check that `config.yml` and `.env` sit next to `docker-compose.yml`. Compose mounts `config.yml` read-only and does not create it.
4. Start the stack with one command from the table above.
5. To skip `asr` (it needs about 2 GB), add `MEDIA_TRANSCRIBER_URL=` to `.env` and start only the bot: `docker compose up -d roka`.

Compose settings that matter:

- **Memory:** `roka` has `mem_limit: 1g`. `asr` has `mem_limit: 2g`.
- **Port:** `3000:3000` for the health check.
- **Tag:** `ROKA_TAG` in `.env` pins a release (`vX.Y.Z`) or a minor line (`vX.Y`). The default is `stable`.
- **Profiles:** `COMPOSE_PROFILES=autoupdate` starts Watchtower. `local-embeddings` starts the embeddings sidecar.

To run without a clone, or to update and roll back, follow [Docker](../deploy/docker.md).

## First-Run Checks

1. Call the health endpoint: `curl http://localhost:3000/`. Any path answers. HTTP 200 with `"status":"ok"` and `"discord":"connected"` means the bot is connected. HTTP 503 with `"status":"unhealthy"` means it is not yet connected.
2. Read the logs. Docker: `docker compose logs -f roka`. Local: the terminal.
3. Find `Roka is online!` and then `Slash commands registered`.
4. In Discord, run `/ask` in a channel the bot can see.
5. Mention the bot in the same channel. A reply confirms the `bot` scope and the Message Content intent.

### Startup Errors

| Log Message                                                               | Cause                                                 | Fix                                                                   |
| ------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| `Missing required environment variable: <KEY>`                            | A required key is empty.                              | Set it in `.env`.                                                     |
| `Missing required environment variable: <KEY> (llm.main uses <provider>)` | The selected model needs that provider key.           | Set the key, or pick another model with `LLM_MAIN` or `LLM_FALLBACK`. |
| `Cannot read config.yml at <path>`                                        | The file is missing.                                  | Restore `config.yml`, or set `ROKABOT_CONFIG_PATH`.                   |
| `Config value <path> must be >= <min>, got: <value>`                      | A tunable is out of range.                            | Change it. [Configuration](configuration.md) lists the bounds.        |
| `SqliteError: unable to open database file`                               | The container cannot write to `data/`.                | Run `sudo chown 1000:1000 data`.                                      |
| `bind source path does not exist`                                         | `config.yml` is missing next to `docker-compose.yml`. | Download or copy `config.yml` there.                                  |

## Next Steps

- **Tune the Bot:** [Configuration](configuration.md).
- **Choose Models:** [Models](models.md).
- **Deploy to a Platform:** [Docker](../deploy/docker.md), [Coolify](../deploy/coolify.md), [Fly.io](../deploy/fly.md), [Railway](../deploy/railway.md), [Render](../deploy/render.md).
- **Operate the Bot:** [Runbook](../runbook.md).

## Source Files

- `package.json`
- `.env.example`
- `config.yml`
- `src/config.ts`
- `src/index.ts` (health server on port 3000)
- `src/discord/client.ts` (gateway intents)
- `src/discord/events/ready.ts` (slash command registration)
- `src/storage/database.ts` (database path)
- `docker-compose.yml`
- `Dockerfile`
