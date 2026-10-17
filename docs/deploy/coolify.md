# Coolify

Run Rokabot on Coolify from the published image. Coolify documents no automatic update for Docker Image applications, so updates come from a redeploy that you trigger.

## At a Glance

| Item               | Value                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| Image              | `ghcr.io/alaskantuna/rokabot:stable` (public, no registry credentials)              |
| Port               | Ports Exposes `3000` (Docker Image applications start with 80)                      |
| Memory             | About 1 GB (the compose file caps the bot at `mem_limit: 1g`)                       |
| Storage            | Persistent, at `/app/data`, writable by UID 1000                                    |
| Health             | Port 3000, any path: 200 with `"status":"ok"` once Discord is connected, 503 before |
| Speech Recognition | Optional second application from `ghcr.io/alaskantuna/rokabot-asr:stable`           |
| Updates            | Redeploy by hand, or call the deploy API on a schedule                              |

## Steps

1. Open a project and an environment, select New, then select Docker Image.
2. Under Image Name, enter `ghcr.io/alaskantuna/rokabot:stable`. Coolify moves a pasted tag or digest into the matching field.
3. Select Save to create the application.
4. Under General, set Ports Exposes to `3000`.
5. Add persistent storage and mount it at `/app/data`.
6. Add the runtime variables `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`, plus the model keys the built-in `config.yml` needs. [`.env.example`](../../.env.example) explains every key.
7. Select Deploy and open Deployment Logs to check the result.

If the first deploy fails, add the storage and deploy again.

Source: [Docker Image](https://coolify.io/docs/applications/deployments/docker-image).

## Configuration

The image carries a built-in `config.yml`, so the bot starts with its defaults. An environment variable overrides a single value where `src/config.ts` wires one, for example `LLM_MAIN`, `LLM_FALLBACK` and `MEDIA_WATCHER`. To use your own file, mount it and set `ROKABOT_CONFIG_PATH` to its path.

### Speech Recognition

Speech recognition is off until you set `MEDIA_TRANSCRIBER_URL`; the built-in `config.yml` leaves it empty. It serves only the qwen media watcher, which needs `MODELSCOPE_API_KEY`. That watcher is the main one when `media.watcher` is `qwen`, and the backup when it is `gemini`. Without that key, skip this.

1. Create a second Docker Image application from `ghcr.io/alaskantuna/rokabot-asr:stable`. Give it about 2 GB of memory and keep it private. It listens on port 8000 and answers `GET /health`.
2. On the bot application, set `MEDIA_TRANSCRIBER_URL` to the private address of that application, with port 8000.

To keep speech recognition off, leave `MEDIA_TRANSCRIBER_URL` unset or empty.

### Automatic Updates

Coolify's Docker Image page says these applications skip automatic Git deployments. Its Automatic Deployments page lists two triggers only: a Git provider event and an authenticated deploy webhook from external CI.

A redeploy does pull again. After you save the image, Redeploy "pulls the selected image before applying the replacement", and Restart pulls the saved reference again too. A mutable tag such as `stable` can resolve to different content on a later deployment.

By hand: select Redeploy on the application after each release.

From a schedule, through the deploy API:

1. Create an API token under Keys & Tokens, then API tokens.
2. Find the application's UUID.
3. Send this `POST` request from a scheduler:

```bash
# Redeploy one or more applications through the Coolify API
curl -fsS -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "https://<your-coolify-host>/api/v1/deploy?uuid=<application-uuid>"
```

`uuid` accepts a comma-separated list, so one call can deploy the bot and the speech recognition application. Pass `uuid` or `tag`, never both.

Example workflow for your own repository. It is untested. If GitHub cannot reach the Coolify host, a cron job on the host can send the same request:

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

Sources: [Automatic Deployments](https://coolify.io/docs/applications/deployments/automatic-deployments), [Deployments Overview](https://coolify.io/docs/applications/deployments/overview), [Deploy API](https://coolify.io/docs/api-reference/api/operations/deploy-by-tag-or-uuid).

## Caveats

- **Data Storage:** without storage at `/app/data`, startup fails with `EACCES: permission denied, mkdir '/app/data'`, because `/app` belongs to root. With storage that UID 1000 cannot write, it fails with `SqliteError: unable to open database file`. The bot keeps `rokabot.db` there.
- **Moved Tag:** whether the deploy API pulls a `stable` that has moved is not documented. The `force` option rebuilds an application without its build cache, which concerns builds, not pulls. An open report, [coollabsio/coolify#5318](https://github.com/coollabsio/coolify/issues/5318), says `force=true` did not pull the latest image on one older version. Test it once by hand after the first release before you rely on it.
- **Fixed Digest:** a digest saved in the tag field, as `sha256-<64-character-digest>`, always points to the same content.
- **Restarts:** each deploy restarts the bot, so keep the schedule slow.
- **Quiet Forks:** GitHub turns off scheduled workflows in a public repository after 60 days without activity. To turn one back on, open the Actions tab, select the workflow and choose Enable workflow, or run `gh workflow enable`. Source: [Disabling and enabling a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).
- **Not Covered:** how to set a health check (the page lists one without details), how Coolify mounts a file, its private address format, and its storage mount steps and ownership rules. The storage must be writable by UID 1000.
