# Docker

Run Rokabot from the published images on any host with Docker Compose. You need no clone and no build.

## At a Glance

| Item    | Value                                                                                       |
| ------- | ------------------------------------------------------------------------------------------- |
| Images  | `ghcr.io/alaskantuna/rokabot`, `ghcr.io/alaskantuna/rokabot-asr` (speech recognition)       |
| Tags    | `vX.Y.Z`, `vX.Y`, `stable`                                                                  |
| Memory  | Bot about 1 GB (`mem_limit: 1g`); `asr` about 2 GB more                                     |
| Files   | `docker-compose.yml`, `.env`, `config.yml`, `data/`                                         |
| Health  | `curl http://localhost:3000/` contains `"status":"ok"` once the bot is connected to Discord |
| Updates | Manual by default; Watchtower is opt-in                                                     |

## Steps

1. Find the newest version on the [latest release](https://github.com/AlaskanTuna/Rokabot/releases/latest) page. Below, `vX.Y.Z` stands for it.
2. Download three files into a new folder.

   ```bash
   # Fetch the compose file, the env example and the config for one release
   mkdir rokabot && cd rokabot
   for f in docker-compose.yml .env.example config.yml; do
     curl -fsSLO "https://raw.githubusercontent.com/AlaskanTuna/Rokabot/vX.Y.Z/$f"
   done
   ```

3. Copy the example environment file: `cp .env.example .env`.
4. Edit `.env`. Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`, then the model keys your `config.yml` needs. The comment on each model in `config.yml` names its key. `.env.example` explains every key.
5. Create the data folder: `mkdir data`. Compose mounts it at `/app/data`, where the bot keeps its SQLite database. The bot runs as user `node` (UID 1000). If your login is not UID 1000, run `sudo chown 1000:1000 data`.
6. Start it: `docker compose pull && docker compose up -d`. This also starts `asr`. To skip it, read [Speech Recognition Off](#speech-recognition-off) first.
7. Check it: `curl http://localhost:3000/`.

## Configuration

Edit `config.yml` next to `docker-compose.yml`, then run `docker compose restart roka`.

- Updates never overwrite your `config.yml`.
- New settings default in code, so an older `config.yml` keeps working. To see a new setting, read the `config.yml` of the newer release.
- A few settings also read an environment variable, for example `LLM_MAIN` and `MEDIA_WATCHER`. The variable wins over `config.yml`. Set it in `.env`. Only the settings that `src/config.ts` wires to a variable work this way.

### Automatic Updates

Nothing updates by itself by default. `stable` moves only when a release is published. To update by hand, run `docker compose pull && docker compose up -d`.

To let Watchtower update for you:

1. Add `COMPOSE_PROFILES=autoupdate` to `.env`, or set it in your shell.
2. Run `docker compose up -d`.

- **Schedule:** once a day at 04:07 UTC. The service sets no `TZ`, so container time is UTC.
- **Scope:** only `roka` and `asr`, the two containers labelled `com.centurylinklabs.watchtower.enable=true`. It removes the replaced image.
- **Tag:** it watches the exact image reference. On `stable`, it updates only when a release moves `stable`.
- **Access:** it mounts `/var/run/docker.sock`, which gives it root-equivalent control of Docker on the host.
- **Image:** `nickfedor/watchtower:1.23.1`, the maintained fork. `containrrr/watchtower` was archived on 2025-12-17. The fork's README does not recommend Watchtower for production use.

The bot also DMs its Discord application owner once when a newer release is published. To turn the DM off, set `UPDATES_NOTIFY=false` in `.env` and run `docker compose up -d`. Or set `updates.notify: false` in `config.yml` and run `docker compose restart roka`.

Sources: [Watchtower fork](https://github.com/nicholas-fedor/watchtower), [archive notice](https://github.com/containrrr/watchtower/discussions/2135).

### Pinning a Version

1. Add `ROKA_TAG=vX.Y.Z` to `.env`.
2. Run `docker compose pull && docker compose up -d`.

- `vX.Y.Z` never changes, so the bot stays on that release, with or without Watchtower. `ROKA_TAG=vX.Y` follows patch releases of one minor version.
- Put the variable in `.env`. A shell prefix such as `ROKA_TAG=vX.Y.Z docker compose up -d` applies to that one command only.
- To follow releases again, delete the `ROKA_TAG` line and run `docker compose pull && docker compose up -d`.

### Rolling Back

1. Find the previous version on the [releases page](https://github.com/AlaskanTuna/Rokabot/releases).
2. Set `ROKA_TAG` in `.env` to that `vX.Y.Z`.
3. Run `docker compose pull && docker compose up -d`.

Your `config.yml` and `data` folder stay as they are.

### Speech Recognition Off

The `asr` service turns the audio of videos into text for the qwen media watcher. It needs about 2 GB of memory. It runs only on the qwen watcher path, which needs `MODELSCOPE_API_KEY`. That path is the main watcher when `media.watcher` is `qwen`, and the backup when it is `gemini`. Without that key, `asr` is never used.

1. Add `MEDIA_TRANSCRIBER_URL=` (empty) to `.env`.
2. Run `docker compose pull roka && docker compose up -d roka`.

Name `roka` in later commands too, so that `asr` stays off. If `asr` is already running, stop it with `docker compose stop asr`.

## Caveats

- **Data Folder Owner:** a folder that Compose creates belongs to root. The bot then fails at startup with `SqliteError: unable to open database file`.
- **Missing `config.yml`:** `roka` refuses to start with `bind source path does not exist`. Compose mounts the file read-only and does not create it. Download it again (step 2).
- **Shell Prefix:** a `ROKA_TAG` shell prefix lasts one command. The next command without it returns to `stable`.
