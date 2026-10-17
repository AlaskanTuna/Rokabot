# Railway

Run Rokabot on Railway from the published image. Railway can redeploy it by itself when a release moves `stable`.

## At a Glance

| Item               | Value                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| Image              | `ghcr.io/alaskantuna/rokabot:stable` (public, no credentials)                       |
| Memory             | About 1 GB (the compose file caps the bot at `mem_limit: 1g`)                       |
| Volume             | Persistent, at `/app/data`, writable by UID 1000                                    |
| Health             | Port 3000, any path: 200 with `"status":"ok"` once Discord is connected, 503 before |
| Speech Recognition | Optional second service from `ghcr.io/alaskantuna/rokabot-asr:stable`               |
| Updates            | Railway image auto updates                                                          |

## Steps

1. Create a new service. The [Railway services page](https://docs.railway.com/services) names the New button on the project canvas and the command palette.
2. When Railway asks for an image, enter `ghcr.io/alaskantuna/rokabot:stable`.
3. Review and deploy the staged change.
4. Add a volume and mount it at `/app/data`. Railway's services page says to add a volume for data that must persist between deployments.
5. Set the variables `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`, plus the model keys the built-in `config.yml` needs. [`.env.example`](../../.env.example) explains every key.
6. Point a health check at port 3000.

If the first deploy fails, add the volume and deploy again.

## Configuration

The image carries a built-in `config.yml`, so the bot starts with its defaults. An environment variable overrides a single value where `src/config.ts` wires one, for example `LLM_MAIN`, `LLM_FALLBACK` and `MEDIA_WATCHER`. To use your own file, mount it and set `ROKABOT_CONFIG_PATH` to its path.

### Speech Recognition

Speech recognition is off until you set `MEDIA_TRANSCRIBER_URL`; the built-in `config.yml` leaves it empty. It serves only the qwen media watcher, which needs `MODELSCOPE_API_KEY`. That watcher is the main one when `media.watcher` is `qwen`, and the backup when it is `gemini`. Without that key, skip this.

1. Create a second service from `ghcr.io/alaskantuna/rokabot-asr:stable`. Give it about 2 GB of memory and keep it private. It listens on port 8000 and answers `GET /health`.
2. On the bot service, set `MEDIA_TRANSCRIBER_URL` to the private address of that service, with port 8000.

To keep speech recognition off, leave `MEDIA_TRANSCRIBER_URL` unset or empty.

### Automatic Updates

Railway checks the registry and redeploys when the digest behind a tag changes. For a tag that is not a version number, such as `stable`, it watches only that tag. Railway supports GHCR for this.

1. Open the service settings, find Source and choose Configure Auto Updates.
2. Pick an update type. The Railway page lists `latest`, `canary` and `staging` as non-semver tags and does not name `stable`. Which type to pick for `stable` is not documented.
3. Pick a maintenance window: Weekends, Night (02:00 to 06:00 UTC), Anytime or Custom. All windows are UTC.
4. Repeat for the speech recognition service, if you run one.

Sources: [Image Auto Updates](https://docs.railway.com/deployments/image-auto-updates), [Redeploy CLI](https://docs.railway.com/cli/redeploy).

## Caveats

- **Data Volume:** without a volume at `/app/data`, startup fails with `EACCES: permission denied, mkdir '/app/data'`, because `/app` belongs to root. With a volume that UID 1000 cannot write, it fails with `SqliteError: unable to open database file`. The bot keeps `rokabot.db` there.
- **Update Delay:** a release can take hours to arrive. Railway caches its detection results for up to a few hours, even with the window set to Anytime.
- **Update Downtime:** each update redeploys the service. With a volume attached, it can be down briefly, typically under 2 minutes. Pro plan users get an automatic volume backup first.
- **Redeploy CLI:** `railway redeploy [-s <service>] [-y]` redeploys the current deployment without new code. The CLI page does not cover image services, so whether it pulls the new digest is not documented. Prefer the built-in auto update.
- **Not Covered:** where Railway takes variables, how it mounts a file, how it sets a health check, its private address format, and its volume ownership rules. See Railway's own documentation. The volume must be writable by UID 1000.
