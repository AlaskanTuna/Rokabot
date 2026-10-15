# Railway

Run Rokabot on Railway from the published image. Railway can redeploy it by itself when a release moves `stable`.

## Deploy

1. Create a new service. The [Railway services page](https://docs.railway.com/services) names the New button on the project canvas and the command palette.
2. When Railway asks for an image, enter `ghcr.io/alaskantuna/rokabot:stable`. The image is public, so it needs no credentials.
3. Review and deploy the staged change.
4. Set the variables `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`, plus the model keys the built-in `config.yml` needs. [`.env.example`](../../.env.example) explains every key.
5. Point a health check at port 3000. The bot answers every path there: `/` returns 200 with `"status":"ok"` once Discord is connected, and 503 before that.

The image carries a built-in `config.yml`, so the bot starts with its defaults. An environment variable overrides a single value where `src/config.ts` wires one (for example `LLM_MAIN`, `LLM_FALLBACK` and `MEDIA_WATCHER`). To use your own file instead, mount it and set `ROKABOT_CONFIG_PATH` to its path.

Not covered here: where Railway takes variables, how it mounts a file and how it sets a health check. See Railway's own documentation.

## Speech Recognition

Speech recognition is off until you set `MEDIA_TRANSCRIBER_URL`, because the built-in `config.yml` leaves the address empty. It serves the qwen media watcher.

To turn it on:

1. Create a second service from `ghcr.io/alaskantuna/rokabot-asr:stable`. It needs about 2 GB of memory. Keep it private. It listens on port 8000 and answers `GET /health`.
2. On the bot service, set `MEDIA_TRANSCRIBER_URL` to the private address of that service, with port 8000.

Railway's private address format is not covered here. To keep speech recognition off, leave `MEDIA_TRANSCRIBER_URL` unset or set it to empty.

## Automatic Updates

Railway checks the registry for a new image and redeploys. For a tag that is not a version number, such as `stable`, it watches only that tag. When the digest behind the tag changes, Railway redeploys the service. Railway supports GHCR for this.

1. Open the service settings, find the Source section and choose Configure Auto Updates.
2. Pick an update type. The Railway page describes any non-semver tag (it lists `latest`, `canary` and `staging`) and does not name `stable`. Which update type to pick for `stable` is not documented.
3. Pick a maintenance window: Weekends, Night (02:00 to 06:00 UTC), Anytime or Custom. All windows are UTC.
4. Repeat for the speech recognition service, if you run one.

What to expect:

- A release can take hours to arrive. Railway caches its detection results for up to a few hours, even with the window set to Anytime.
- Each update redeploys the service. With a volume attached, the service may be down for a short time, typically under 2 minutes. Pro plan users get an automatic volume backup before the update.
- `railway redeploy [-s <service>] [-y]` redeploys the current deployment without uploading new code. The CLI page does not cover image-based services, so it is not documented that this pulls the new digest. Prefer the built-in auto update.

Sources: [Image Auto Updates](https://docs.railway.com/deployments/image-auto-updates), [Redeploy CLI](https://docs.railway.com/cli/redeploy).

## Data

The bot keeps its SQLite database in `/app/data`. Add a volume to the service and mount it at `/app/data`. The Railway services page says files outside a volume do not persist across deployments. The bot runs as user `node` (UID 1000), so the volume must be writable by that user.

Railway's mount steps and volume ownership rules are not covered here.
