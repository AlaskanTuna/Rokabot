# Fly.io

Run Rokabot on Fly.io from the published image. Fly has no watcher that notices a new image, so updates come from a scheduled job that you own.

## Deploy

1. Create the Fly app in a new folder. Fly's [Deploy an App](https://docs.fly.io/launch/deploy) page covers this.
2. Add a `fly.toml` with the sections below, then run `fly deploy` in that folder. Fly describes `[build]` with `image` for an existing public image with no build process. Its own example is `flyio/hellofly:latest`, and it does not name `ghcr.io`.
3. Store the keys as secrets, not in `fly.toml`. The [configuration reference](https://docs.fly.io/reference/configuration) names the `fly secrets` command for sensitive values. Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`, plus the model keys the built-in `config.yml` needs. [`.env.example`](../../.env.example) explains every key.

Example `fly.toml`, adapted from the configuration reference. Use your own app name and volume name:

```toml
app = "your-rokabot"

[build]
  image = "ghcr.io/alaskantuna/rokabot:stable"

[mounts]
  source = "rokabot_data"
  destination = "/app/data"

[checks]
  [checks.health]
    type = "http"
    port = 3000
    path = "/"
    interval = "30s"
    timeout = "5s"
    grace_period = "30s"
```

The bot answers every path on port 3000. `/` returns 200 with `"status":"ok"` once Discord is connected, and 503 before that. The `[checks]` section is for apps without a public service.

The image carries a built-in `config.yml`, so the bot starts with its defaults. An environment variable overrides a single value where `src/config.ts` wires one (for example `LLM_MAIN`, `LLM_FALLBACK` and `MEDIA_WATCHER`). Put non-sensitive ones in an `[env]` section of `fly.toml`. To use your own file instead, mount it and set `ROKABOT_CONFIG_PATH` to its path. How Fly mounts a file is not covered here.

## Speech Recognition

Speech recognition is off until you set `MEDIA_TRANSCRIBER_URL`, because the built-in `config.yml` leaves the address empty. It serves the qwen media watcher.

To turn it on:

1. Deploy a second app from `ghcr.io/alaskantuna/rokabot-asr:stable`, with its own `fly.toml`. It needs about 2 GB of memory. Keep it private. It listens on port 8000 and answers `GET /health`.
2. In the `[env]` section of the bot's `fly.toml`, set `MEDIA_TRANSCRIBER_URL` to the private address of that app, with port 8000.

Fly's private address format is not covered here. To keep speech recognition off, leave `MEDIA_TRANSCRIBER_URL` unset or set it to empty.

## Automatic Updates

`fly deploy --image <ref>` deploys a named image, and an image set this way takes priority over any Dockerfile. A scheduled GitHub Action in your own repository can run it.

1. Create a deploy token from the project directory: `fly tokens create deploy -x 999999h`.
2. Copy the whole output, including the `FlyV1` prefix and the space after it.
3. Store it as the repository secret `FLY_API_TOKEN`.
4. Commit your `fly.toml` and this workflow to the repository. The checkout step is there only so that `fly.toml` is present.

Example workflow. It is untested. It is adapted from Fly's GitHub Actions page for a prebuilt image:

```yaml
name: Redeploy On Fly
on:
  schedule:
    - cron: '23 */6 * * *'
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --image ghcr.io/alaskantuna/rokabot:stable
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

To update the speech recognition app too, add the same step with `ghcr.io/alaskantuna/rokabot-asr:stable` and that app's own `fly.toml`.

Notes:

- The `fly deploy` reference does not say where `--image` pulls from. The `ghcr.io` case rests on the `[build]` page, which says an existing public image deploys with no build process. It is not documented explicitly for GHCR.
- It is not documented what a run does when the digest has not changed since the last deploy. A run may restart the bot, so lower the schedule if restarts matter. For example, `23 4 * * *` runs once a day.
- The default deploy strategy is `rolling`.

Sources: [`fly deploy`](https://docs.fly.io/flyctl/deploy), [GitHub Actions](https://docs.fly.io/launch/continuous-deployment-with-github-actions), [Prebuilt images](https://docs.fly.io/blueprints/working-with-docker).

## Data

The bot keeps its SQLite database in `/app/data`. The `[mounts]` section above mounts a Fly volume there. A volume with that name must exist in some region for the app to deploy: create it with `fly volume create`, or let `fly deploy` create it (the `initial_size` key sets its size). The bot runs as user `node` (UID 1000), so the volume must be writable by that user. Fly's ownership rules for volumes are not covered here.
