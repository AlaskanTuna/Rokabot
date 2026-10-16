# Railway

Run Rokabot on Railway from the published image. Railway can redeploy it by itself when a release moves `stable`.

## Deploy

1. Create a new service. The [Railway services page](https://docs.railway.com/services) names the New button on the project canvas and the command palette.
2. When Railway asks for an image, enter `ghcr.io/alaskantuna/rokabot:stable`. The image is public, so it needs no credentials.
3. Review and deploy the staged change.
4. Set the variables `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`, plus the model keys the built-in `config.yml` needs. [`.env.example`](../../.env.example) explains every key.
5. Point a health check at port 3000. The bot answers every path there: `/` returns 200 with `"status":"ok"` once Discord is connected, and 503 before that.

The image carries a built-in `config.yml`, so the bot starts with its defaults. An environment variable overrides a single value where `src/config.ts` wires one (for example `LLM_MAIN`, `LLM_FALLBACK` and `MEDIA_WATCHER`). To use your own file instead, mount it and set `ROKABOT_CONFIG_PATH` to its path.

Give the service about 1 GB of memory. The compose file caps the bot at `mem_limit: 1g`.

The bot does not start without the volume described under [Data](#data). If the first deploy fails, add the volume and deploy again.

Not covered here: where Railway takes variables, how it mounts a file and how it sets a health check. See Railway's own documentation.

## Speech Recognition

Speech recognition is off until you set `MEDIA_TRANSCRIBER_URL`, because the built-in `config.yml` leaves the address empty. It serves the qwen media watcher.

Speech recognition runs only on the qwen watcher path, which needs `MODELSCOPE_API_KEY`. That path is the main watcher when `media.watcher` is `qwen`, and the backup when it is `gemini`. Without that key, the second service is never used, so you can skip it.

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

The bot needs a persistent volume mounted at `/app/data` that user `node` (UID 1000) can write to. Without one, it does not start. `/app` belongs to root, so with no volume at that path startup fails with `EACCES: permission denied, mkdir '/app/data'`. With a volume that UID 1000 cannot write to, it fails with `SqliteError: unable to open database file`. The bot keeps its SQLite database, `rokabot.db`, in that folder.

Add a volume to the service and mount it at `/app/data`. The Railway services page says to add a volume for data that must persist between deployments.

Railway's mount steps and volume ownership rules are not covered here. Whatever you use, the volume must be writable by UID 1000.
