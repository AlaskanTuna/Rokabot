# Coolify

Run Rokabot on Coolify from the published image. Coolify documents no automatic update for Docker Image applications, so updates come from a redeploy that you trigger.

## Deploy

1. Open a project and an environment, select New, then select Docker Image.
2. Under Image Name, enter `ghcr.io/alaskantuna/rokabot:stable`. Coolify splits the tag into the Tag field. The image is public, so it needs no registry credentials.
3. Select Save to create the application.
4. Under General, set Ports Exposes to `3000`. The page says Docker Image applications start with port 80.
5. Add the runtime environment variables `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`, plus the model keys the built-in `config.yml` needs. [`.env.example`](../../.env.example) explains every key.
6. Select Deploy and open Deployment Logs to check the result.

The bot answers every path on port 3000. `/` returns 200 with `"status":"ok"` once Discord is connected, and 503 before that. The Coolify page lists a health check among the settings but gives no details, so how to set one is not covered here.

The image carries a built-in `config.yml`, so the bot starts with its defaults. An environment variable overrides a single value where `src/config.ts` wires one (for example `LLM_MAIN`, `LLM_FALLBACK` and `MEDIA_WATCHER`). To use your own file instead, mount it and set `ROKABOT_CONFIG_PATH` to its path. How Coolify mounts a file is not covered here.

Source: [Docker Image](https://coolify.io/docs/applications/deployments/docker-image).

## Speech Recognition

Speech recognition is off until you set `MEDIA_TRANSCRIBER_URL`, because the built-in `config.yml` leaves the address empty. It serves the qwen media watcher.

To turn it on:

1. Create a second Docker Image application from `ghcr.io/alaskantuna/rokabot-asr:stable`. It needs about 2 GB of memory. Keep it private. It listens on port 8000 and answers `GET /health`.
2. On the bot application, set `MEDIA_TRANSCRIBER_URL` to the private address of that application, with port 8000.

Coolify's private address format is not covered here. To keep speech recognition off, leave `MEDIA_TRANSCRIBER_URL` unset or set it to empty.

## Automatic Updates

Coolify does not document an automatic update for Docker Image applications. Its Docker Image page says these applications skip automatic Git deployments. Its Automatic Deployments page lists two triggers only: a Git provider event and an authenticated deploy webhook from external CI.

A redeploy does pull again. After you save the image, Redeploy "pulls the selected image before applying the replacement", and Restart pulls the saved reference again too. A mutable tag such as `stable` can resolve to different content on a later deployment.

By hand: select Redeploy on the application after each release.

From a schedule, through the deploy API:

1. Create an API token under Keys & Tokens, then API tokens.
2. Find the application's UUID.
3. Send the request below from a scheduler. Use `POST`.

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "https://<your-coolify-host>/api/v1/deploy?uuid=<application-uuid>"
```

`uuid` accepts a comma-separated list, so one call can deploy the bot and the speech recognition application. Pass `uuid` or `tag`, never both.

Example scheduled workflow for your own repository. It is untested. A cron job on the Coolify host can send the same request if the host is not reachable from GitHub:

```yaml
name: Redeploy On Coolify
on:
  schedule:
    - cron: '23 4 * * *'
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Call the deploy API
        env:
          COOLIFY_URL: ${{ secrets.COOLIFY_URL }}
          COOLIFY_TOKEN: ${{ secrets.COOLIFY_TOKEN }}
          COOLIFY_UUID: ${{ secrets.COOLIFY_UUID }}
        run: |
          curl -fsS -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" "$COOLIFY_URL/api/v1/deploy?uuid=$COOLIFY_UUID"
```

Notes:

- Whether the deploy API pulls a `stable` that has moved is not documented. The `force` option is documented as rebuilding an application without its build cache, which concerns builds, not pulls. Coolify's tracker has an open report, [coollabsio/coolify#5318](https://github.com/coollabsio/coolify/issues/5318), that `force=true` did not pull the latest image on one older version. Current behavior is not verified. After the first release, test it once by hand before you rely on it.
- A digest saved in the tag field, as `sha256-<64-character-digest>`, always points to the same content.
- Each deploy restarts the bot, so keep the schedule slow.

Sources: [Automatic Deployments](https://coolify.io/docs/applications/deployments/automatic-deployments), [Deployments Overview](https://coolify.io/docs/applications/deployments/overview), [Deploy API](https://coolify.io/docs/api-reference/api/operations/deploy-by-tag-or-uuid).

## Data

The bot keeps its SQLite database in `/app/data`. Add persistent storage to the application and mount it at `/app/data`, or the data lives only in the container and is lost on redeploy. The bot runs as user `node` (UID 1000), so the storage must be writable by that user.

The Coolify Docker Image page lists persistent storage among the settings but gives no mount steps, so they are not covered here.
