# Docker

Run Rokabot from the published images on any host with Docker Compose. You need no clone and no build.

Each release publishes two images to GHCR: `ghcr.io/alaskantuna/rokabot` and `ghcr.io/alaskantuna/rokabot-asr` (speech recognition). Both carry the tags `vX.Y.Z`, `vX.Y` and `stable`.

The bot needs about 1 GB of memory (the compose file sets `mem_limit: 1g`). The `asr` service needs about 2 GB more.

## Quick Start

1. Find the newest version on the [latest release](https://github.com/AlaskanTuna/Rokabot/releases/latest) page. Below, `vX.Y.Z` stands for it.
2. Download three files into a new folder.

   ```bash
   mkdir rokabot && cd rokabot
   for f in docker-compose.yml .env.example config.yml; do
     curl -fsSLO "https://raw.githubusercontent.com/AlaskanTuna/Rokabot/vX.Y.Z/$f"
   done
   ```

3. Copy the example environment file: `cp .env.example .env`.
4. Edit `.env`. Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Then set the model keys your `config.yml` needs. The comment on each model in `config.yml` names its key, and `.env.example` explains every key.
5. Create the data folder: `mkdir data`. Compose mounts it at `/app/data`, where the bot keeps its SQLite database. The bot runs as user `node` (UID 1000). A folder that Compose creates belongs to root, and the bot then fails at startup with `SqliteError: unable to open database file`. If your login is not UID 1000, run `sudo chown 1000:1000 data`.
6. Start it: `docker compose pull && docker compose up -d`. This also starts `asr`. To skip it, read [Speech Recognition Off](#speech-recognition-off) first.
7. Check it: `curl http://localhost:3000/`. The answer contains `"status":"ok"` once the bot is connected to Discord.

If `config.yml` is missing, `roka` refuses to start with `bind source path does not exist`. Compose mounts the file read-only and does not create it. Download it again (step 2).

## Configuration

Edit `config.yml` next to `docker-compose.yml`, then run `docker compose restart roka`.

- Updates never overwrite your `config.yml`.
- New settings default in code, so an older `config.yml` keeps working. To see a new setting, read the `config.yml` of the newer release.
- A few settings also read an environment variable (for example `LLM_MAIN`, `MEDIA_WATCHER`). The variable wins over `config.yml`. Set it in `.env`. Only the settings that `src/config.ts` wires to a variable work this way.

## Automatic Updates

By default nothing updates by itself. `stable` moves only when a release is published. To update by hand, run `docker compose pull && docker compose up -d`.

To let Watchtower update for you:

1. Add `COMPOSE_PROFILES=autoupdate` to `.env` (or set it in your shell).
2. Run `docker compose up -d`.

Watchtower then checks once a day at 04:07 UTC. The compose service sets no `TZ`, so container time is UTC.

- It updates only `roka` and `asr`, the two containers labelled `com.centurylinklabs.watchtower.enable=true`. It removes the replaced image.
- It watches the exact image reference. On `stable`, it updates only when a release moves `stable`.
- It mounts `/var/run/docker.sock`, which gives it root-equivalent control of Docker on the host.
- The image is `nickfedor/watchtower:1.23.1`. It is the maintained fork: `containrrr/watchtower` was archived on 2025-12-17. The fork's README does not recommend Watchtower for production use.

Sources: [Watchtower fork](https://github.com/nicholas-fedor/watchtower), [archive notice](https://github.com/containrrr/watchtower/discussions/2135).

## Pinning a Version

1. Add `ROKA_TAG=vX.Y.Z` to `.env`.
2. Run `docker compose pull && docker compose up -d`.

The tag `vX.Y.Z` never changes, so the bot stays on that release, with or without Watchtower. Use `ROKA_TAG=vX.Y` to follow patch releases of one minor version only.

Put the variable in `.env`. A shell prefix such as `ROKA_TAG=vX.Y.Z docker compose up -d` applies to that one command, and the next command without it returns to `stable`.

To follow releases again, delete the `ROKA_TAG` line and run `docker compose pull && docker compose up -d`.

## Rolling Back

1. Find the previous version on the [releases page](https://github.com/AlaskanTuna/Rokabot/releases).
2. Set `ROKA_TAG` in `.env` to that `vX.Y.Z`.
3. Run `docker compose pull && docker compose up -d`.

Your `config.yml` and `data` folder stay as they are.

## Speech Recognition Off

The `asr` service turns the audio of videos into text for the qwen media watcher. It needs about 2 GB of memory.

Speech recognition runs only on the qwen watcher path, which needs `MODELSCOPE_API_KEY`. That path is the main watcher when `media.watcher` is `qwen`, and the backup when it is `gemini`. Without that key, the `asr` service is never used, so you can skip it.

To run without it:

1. Add `MEDIA_TRANSCRIBER_URL=` (empty) to `.env`.
2. Run `docker compose pull roka && docker compose up -d roka`.

Name `roka` in later commands too, so that `asr` stays off. If `asr` is already running, stop it with `docker compose stop asr`.
