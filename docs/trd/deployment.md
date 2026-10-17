# Deployment

How a merged change becomes a running bot on the Raspberry Pi: CI jobs, images, tags, compose services and Pi notes.

## At a Glance

| Item       | Contract                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Workflow   | `.github/workflows/deploy.yml` ("Deploy to Pi").                                                    |
| Merge Gate | `main` is PR-only. The `test` check must pass; `images-ok` is the second gate check.                |
| Images     | `ghcr.io/alaskantuna/rokabot` and `ghcr.io/alaskantuna/rokabot-asr`, built for amd64 and arm64.     |
| Deploy     | A self-hosted runner on the Pi pulls `sha-<7>` and restarts with `docker compose up -d --no-build`. |
| Releases   | release-please opens release PRs. Merging one moves `stable`, `vX.Y` and `vX.Y.Z`.                  |
| Host       | Raspberry Pi 5 (8 GB), arm64, Docker Compose.                                                       |

## Pipeline

![Deployment Pipeline](../diagrams/deployment-pipeline.svg)

_A PR runs the checks; a merge builds both images, tags them in GHCR, and the Pi pulls and restarts._

### Triggers

- **Pull Request:** every PR to `main` runs `test`, `compose`, `images` (build only, cache output) and `images-ok`.
- **Push to `main`:** runs every job. A push whose changed paths all match `paths-ignore` runs nothing.
- **`paths-ignore`:** `*.md`, `docs/**`, `.claude/**`, `graphify-out/**`.

### Jobs

| Job                     | Runs On                 | When                                              | Does                                                                                                                         |
| ----------------------- | ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `test`                  | `ubuntu-latest`         | PR and push                                       | `npm ci`, `npx tsc --noEmit` (src only), `biome check .`, `npm test`, `npm run test:perf`. Dummy Discord and Gemini secrets. |
| `compose`               | `ubuntu-24.04`          | PR and push                                       | Validates both compose profiles, checks the `config.yml` mount is read-only and refuses a missing file, lints workflows.     |
| `images`                | amd64 and arm64 runners | After `test`                                      | Builds `rokabot` and `rokabot-asr` per platform with `GIT_COMMIT`. On push, pushes by digest to GHCR.                        |
| `manifest`              | `ubuntu-24.04`          | Push, after `images`                              | Joins the digests into `sha-<7>` and `edge`. Fails if an anonymous pull does not work.                                       |
| `images-ok`             | `ubuntu-24.04`          | Always                                            | Fails unless `images` and `compose` both succeeded. One stable check name for the ruleset.                                   |
| `notify-images-failure` | `ubuntu-24.04`          | Push, on failure                                  | Posts to `DISCORD_WEBHOOK_URL` when `images` or `manifest` failed.                                                           |
| `deploy`                | `self-hosted` (the Pi)  | Push, after `test` and `manifest`                 | Pulls and restarts the bot. See [Deploy on the Pi](#deploy-on-the-pi).                                                       |
| `release`               | `ubuntu-24.04`          | Push, after `test`                                | Runs release-please. Outputs whether a release was created, its tag, major, minor and SHA.                                   |
| `promote`               | `ubuntu-24.04`          | After a successful `deploy` of the release commit | Re-tags `sha-<7>` as `vX.Y.Z`, `vX.Y` and `stable` for both images. Nothing is rebuilt.                                      |

`npm run typecheck`, which also checks `tests/`, is not part of CI.

### Image Tags

| Tag       | Points At                                      | Set By     |
| --------- | ---------------------------------------------- | ---------- |
| `sha-<7>` | The image built for that commit (first 7 hex). | `manifest` |
| `edge`    | The newest `main` build.                       | `manifest` |
| `vX.Y.Z`  | The release commit's image.                    | `promote`  |
| `vX.Y`    | The newest release in that minor line.         | `promote`  |
| `stable`  | The newest release. Users run this tag.        | `promote`  |

- **Public Packages:** the Pi and users pull without logging in. A private package fails the `manifest` job.
- **Promote Check:** `promote` confirms `stable` and `sha-<7>` resolve to the same digest.
- **Skipped Promote:** if the release commit's deploy failed, never ran or was superseded, `stable` stays on the previous release. [Runbook](../runbook.md) has the manual steps.

### Deploy on the Pi

The `deploy` job runs on the Pi's self-hosted runner. The runner polls GitHub outbound, so the Pi needs no inbound access. Deploys run one at a time in the `pi-deploy` concurrency group, and a running deploy is never canceled. The job timeout is 25 minutes.

1. Reset `~/rokabot` to the pushed commit (`git fetch origin main && git reset --hard <sha>`).
2. Archive the outgoing `roka` container's logs to `~/rokabot/logs/roka-<UTC time>.log.gz`. Archives older than 30 days are deleted.
3. Set `ROKA_TAG=sha-<7>` and run `docker compose pull roka asr`.
4. After a successful pull, write `ROKA_TAG` into `.env`, so a manual compose command keeps this image.
5. Run `docker compose up -d --no-build`.
6. Health check: `GET http://localhost:3000/` must return `status: ok`. It tries 10 times, 5 s apart, then prints the last 20 log lines and fails.
7. Prune local `sha-*` images with `scripts/prune-images.sh`. It keeps the deployed tag and one previous tag for rollback.
8. Post success or failure to `DISCORD_WEBHOOK_URL`, when set.

- **Failed Pull:** the old container keeps running. There is no automatic rollback.
- **Rollback:** set an older `ROKA_TAG` in `.env` and restore that commit's `config.yml`. The [Runbook](../runbook.md) lists the steps.
- **Authorization:** a merge to `main` restarts production unless every changed path is in `paths-ignore`. It needs the same human authorization as a restart.

### release-please

| Setting                    | Value                                                  |
| -------------------------- | ------------------------------------------------------ |
| Config                     | `release-please-config.json`                           |
| Manifest                   | `.release-please-manifest.json`                        |
| `release-type`             | `node`                                                 |
| `bump-minor-pre-major`     | `true`                                                 |
| `include-component-in-tag` | `false`                                                |
| `changelog-path`           | `CHANGELOG.md`                                         |
| Token                      | `RELEASE_PLEASE_TOKEN`, falling back to `github.token` |

A release PR opened with `github.token` never triggers CI, so its required `test` check never passes. `RELEASE_PLEASE_TOKEN` avoids this.

## Docker Build

### Bot Image (`Dockerfile`)

| Stage   | Base             | Steps                                                                                                                                                                         |
| ------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build` | `node:24-alpine` | Add `python3`, `make`, `g++`. `npm ci`. Copy `tsconfig.json` and `src/`. `npm run build` to `dist/`.                                                                          |
| Runtime | `node:24-alpine` | Add build tools, fonts and `ffmpeg`. `npm ci --omit=dev`, then remove the build tools. Install pinned yt-dlp. Copy `dist/` and `config.yml`. Set `GIT_COMMIT`. Run as `node`. |

- **Command:** `node dist/index.js`.
- **yt-dlp:** version `2026.08.19`, the musllinux onedir zip for `amd64` or `arm64`. The build checks the release SHA-256 list and a pinned hash. Another architecture fails the build.
- **Layer Order:** `GIT_COMMIT` is set last, so a new commit does not reinstall ffmpeg or npm packages.
- **Health Endpoint:** the bot serves `GET :3000/`. It returns 200 with `status: ok` when the Discord client is ready, else 503. The body also reports uptime, RSS in MB and Discord state.

### Sidecar Images

- **`asr` (`asr/Dockerfile`):** `python:3.12-slim` pinned by digest. A model stage downloads Silero VAD, SenseVoice and Moonshine. The runtime installs `sherpa-onnx` and `numpy`, runs as user `asr`, listens on 8000 and has a Docker `HEALTHCHECK` on `/health`.
- **`embeddings` (`sidecar/embeddings/Dockerfile`):** `node:24-bookworm-slim` pinned by digest, because onnxruntime needs glibc. It downloads `Xenova/multilingual-e5-small` at a pinned revision and checks its hashes. It listens on 8080 with a `HEALTHCHECK` on `/health`. CI does not publish this image; compose builds it locally.

## Docker Compose

| Service      | Image                                      | Memory (`mem_limit` = `memswap_limit`) | CPUs | Started                    |
| ------------ | ------------------------------------------ | -------------------------------------- | ---- | -------------------------- |
| `roka`       | `${ROKA_REGISTRY}/rokabot:${ROKA_TAG}`     | 1g                                     | n/a  | Always                     |
| `asr`        | `${ROKA_REGISTRY}/rokabot-asr:${ROKA_TAG}` | 2g                                     | 3    | Always                     |
| `embeddings` | Built from `./sidecar/embeddings`          | 1g                                     | 1    | Profile `local-embeddings` |
| `watchtower` | `nickfedor/watchtower:1.23.1`              | n/a                                    | n/a  | Profile `autoupdate`       |

- **Image Defaults:** `ROKA_REGISTRY` defaults to `ghcr.io/alaskantuna`, and `ROKA_TAG` to `stable`.
- **No Swap:** each capped service sets `memswap_limit` equal to `mem_limit`.
- **Restart:** every service uses `restart: unless-stopped`.
- **Logs:** `json-file`, `max-size: 10m`, `max-file: 3` on every service.

### `roka` Service

- **Environment:** `env_file: .env`, plus `ADK_QUIET=1` and `MEDIA_TRANSCRIBER_URL` (default `http://asr:8000`; an empty value in `.env` turns transcription off).
- **Port:** `3000:3000` for the health endpoint.
- **Volumes:** `./data` at `/app/data` (SQLite and report attachments). `./config.yml` at `/app/config.yml`, read-only, with `create_host_path: false`, so a missing file fails the start instead of creating a directory.
- **Labels:** `com.centurylinklabs.watchtower.enable: 'true'`, plus `panel.type`, `panel.name`, `panel.icon` and `panel.db` labels.

### Sidecars

- **`asr`:** speech recognition for the Qwen media watcher. `ASR_THREADS=3`. No published port; the bot reaches it on the compose network.
- **`embeddings`:** local embedding sidecar for `embeddings.provider: local`, reached at `http://embeddings:8080`.
- **`watchtower`:** opt-in auto-update for users running `stable`. It updates only containers labeled `true` (`roka`, `asr`), removes replaced images, and runs daily at 04:07 container time (6-field cron `0 7 4 * * *`). It mounts the Docker socket, so it is never on by default. It watches the exact tag the container runs.

## Raspberry Pi Notes

- **Architecture:** arm64. CI builds the arm64 image on `ubuntu-24.04-arm`, so the Pi builds nothing.
- **Memory:** the Pi has 8 GB. The caps above total 4 GB with the `embeddings` profile on.
- **Disk:** log rotation and the image prune keep disk use bounded. The first pull after a speech-model change downloads about 1 GB of layers.
- **Boot:** Docker must start on boot for `restart: unless-stopped` to bring the bot back after a reboot.
- **Runner:** a systemd service. The [Runbook](../runbook.md) covers setup and management.

## Source Files

- `.github/workflows/deploy.yml`
- `Dockerfile`, `asr/Dockerfile`, `sidecar/embeddings/Dockerfile`
- `docker-compose.yml`
- `release-please-config.json`, `.release-please-manifest.json`
- `scripts/prune-images.sh`
- `src/index.ts` (health server)
