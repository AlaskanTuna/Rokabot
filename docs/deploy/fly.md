# Fly.io

Run Rokabot on Fly.io from the published image. Fly has no watcher that notices a new image, so updates come from a scheduled job that you own.

## At a Glance

| Item               | Value                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| Image              | `ghcr.io/alaskantuna/rokabot:stable` (public, no credentials)                       |
| Memory             | About 1 GB (the compose file caps the bot at `mem_limit: 1g`)                       |
| Volume             | Fly volume at `/app/data`, writable by UID 1000                                     |
| Health             | Port 3000, any path: 200 with `"status":"ok"` once Discord is connected, 503 before |
| Speech Recognition | Optional second app from `ghcr.io/alaskantuna/rokabot-asr:stable`                   |
| Updates            | Scheduled `fly deploy --image` from your own repository                             |

## Steps

1. Create the Fly app in a new folder. Fly's [Deploy an App](https://docs.fly.io/launch/deploy) page covers this.
2. Add a `fly.toml` like the one below, with your own app name and volume name.
3. Store the keys as secrets with `fly secrets`, not in `fly.toml`. Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`, plus the model keys the built-in `config.yml` needs. [`.env.example`](../../.env.example) explains every key.
4. Run `fly deploy` in that folder.

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

- **`[build]`:** Fly describes `image` for an existing public image with no build process. Its own example is `flyio/hellofly:latest`; it does not name `ghcr.io`.
- **`[mounts]`:** a volume with that name must exist in some region before the app deploys. Create it with `fly volume create`, or let `fly deploy` create it (`initial_size` sets its size). If the first deploy fails, create the volume and deploy again.
- **`[checks]`:** for apps without a public service.

The example is adapted from the [configuration reference](https://docs.fly.io/reference/configuration).

## Configuration

The image carries a built-in `config.yml`, so the bot starts with its defaults. An environment variable overrides a single value where `src/config.ts` wires one, for example `LLM_MAIN`, `LLM_FALLBACK` and `MEDIA_WATCHER`. Put non-sensitive ones in an `[env]` section of `fly.toml`. To use your own file, mount it and set `ROKABOT_CONFIG_PATH` to its path.

### Speech Recognition

Speech recognition is off until you set `MEDIA_TRANSCRIBER_URL`; the built-in `config.yml` leaves it empty. It serves only the qwen media watcher, which needs `MODELSCOPE_API_KEY`. That watcher is the main one when `media.watcher` is `qwen`, and the backup when it is `gemini`. Without that key, skip this.

1. Deploy a second app from `ghcr.io/alaskantuna/rokabot-asr:stable`, with its own `fly.toml`. Give it about 2 GB of memory and keep it private. It listens on port 8000 and answers `GET /health`.
2. In the `[env]` section of the bot's `fly.toml`, set `MEDIA_TRANSCRIBER_URL` to the private address of that app, with port 8000.

To keep speech recognition off, leave `MEDIA_TRANSCRIBER_URL` unset or empty.

### Automatic Updates

`fly deploy --image <ref>` deploys a named image. An image set this way takes priority over any Dockerfile. A scheduled GitHub Action in your own repository can run it.

1. Create a deploy token from the project directory: `fly tokens create deploy -x 999999h`.
2. Copy the whole output, including the `FlyV1` prefix and the space after it.
3. Store it as the repository secret `FLY_API_TOKEN`.
4. Commit your `fly.toml` and the workflow below. The checkout step is there only so that `fly.toml` is present.

Example workflow, adapted from Fly's GitHub Actions page for a prebuilt image. It is untested:

```yaml
name: Redeploy On Fly
on:
  schedule:
    - cron: '23 4 * * *'
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

Sources: [`fly deploy`](https://docs.fly.io/flyctl/deploy), [GitHub Actions](https://docs.fly.io/launch/continuous-deployment-with-github-actions), [Prebuilt images](https://docs.fly.io/blueprints/working-with-docker).

## Caveats

- **Data Volume:** without a volume at `/app/data`, startup fails with `EACCES: permission denied, mkdir '/app/data'`, because `/app` belongs to root. With a volume that UID 1000 cannot write, it fails with `SqliteError: unable to open database file`. The bot keeps `rokabot.db` there.
- **GHCR Pulls:** the `fly deploy` reference does not say where `--image` pulls from. The `ghcr.io` case rests on the `[build]` page, which says an existing public image deploys with no build process.
- **Unchanged Digest:** what a run does when the digest has not changed is not documented. A run may restart the bot, so keep the schedule slow. The example runs once a day.
- **Strategy:** the default deploy strategy is `rolling`.
- **Quiet Forks:** GitHub turns off scheduled workflows in a public repository after 60 days without activity. To turn one back on, open the Actions tab, select the workflow and choose Enable workflow, or run `gh workflow enable`. Source: [Disabling and enabling a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).
- **Not Covered:** how Fly mounts a file, its private address format, and its volume ownership rules. The volume must be writable by UID 1000.
