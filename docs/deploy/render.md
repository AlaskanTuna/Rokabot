# Render

Run Rokabot on Render from the published image. Render never redeploys an image service by itself, so a release reaches your bot only when you trigger a deploy.

## Deploy

1. In the Render Dashboard, click New and select a service type. Private services are among the types Render lists for prebuilt images.
2. Under Source Code, click Existing Image.
3. Enter `ghcr.io/alaskantuna/rokabot:stable` as the image URL. The image is public, so it needs no credentials. Click Connect.
4. Set the name, region and compute plan, then click Deploy.
5. Set the variables `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`, plus the model keys the built-in `config.yml` needs. [`.env.example`](../../.env.example) explains every key.
6. Point a health check at port 3000. The bot answers every path there: `/` returns 200 with `"status":"ok"` once Discord is connected, and 503 before that.

The image carries a built-in `config.yml`, so the bot starts with its defaults. An environment variable overrides a single value where `src/config.ts` wires one (for example `LLM_MAIN`, `LLM_FALLBACK` and `MEDIA_WATCHER`). To use your own file instead, mount it and set `ROKABOT_CONFIG_PATH` to its path.

Give the service about 1 GB of memory. The compose file caps the bot at `mem_limit: 1g`.

The bot does not start without the volume described under [Data](#data). If the first deploy fails, add the volume and deploy again.

Not covered here: where Render takes variables, how it mounts a file and how it sets a health check. See Render's own documentation. Render does not keep previously pulled images and pulls on every deploy.

Source: [Deploy an Image](https://render.com/docs/deploy-an-image).

## Speech Recognition

Speech recognition is off until you set `MEDIA_TRANSCRIBER_URL`, because the built-in `config.yml` leaves the address empty. It serves the qwen media watcher.

Speech recognition runs only on the qwen watcher path, which needs `MODELSCOPE_API_KEY`. That path is the main watcher when `media.watcher` is `qwen`, and the backup when it is `gemini`. Without that key, the second service is never used, so you can skip it.

To turn it on:

1. Create a second service from `ghcr.io/alaskantuna/rokabot-asr:stable`. It needs about 2 GB of memory. Keep it private. It listens on port 8000 and answers `GET /health`.
2. On the bot service, set `MEDIA_TRANSCRIBER_URL` to the private address of that service, with port 8000.

Render's private address format is not covered here. To keep speech recognition off, leave `MEDIA_TRANSCRIBER_URL` unset or set it to empty.

## Automatic Updates

Render says: "Image-backed services do not automatically redeploy whenever a new image is associated with their assigned tag." There is no auto-deploy setting for images. You have two ways to deploy a new `stable`.

By hand:

1. Open the service in the dashboard.
2. Choose Manual Deploy, then Deploy latest reference. It pulls the image that the service's tag points to now.

From a schedule, through the deploy hook:

1. Open the Settings tab of the service and copy its deploy hook URL. The URL is a secret. Regenerate Hook replaces it, and callers of the old URL then get 401.
2. Store the URL as a secret in a repository you own, for example `RENDER_DEPLOY_HOOK`.
3. Call the hook on a schedule. It accepts `GET` or `POST`, and the `key` query parameter in the URL authenticates it.
4. Repeat with the hook of the speech recognition service, if you run one.

Example scheduled workflow for your own repository. It is untested. It reads the digest that `stable` points to and deploys exactly that image with the optional `imgURL` parameter:

```yaml
name: Redeploy On Render
on:
  schedule:
    - cron: '23 4 * * *'
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Call the deploy hook
        env:
          RENDER_DEPLOY_HOOK: ${{ secrets.RENDER_DEPLOY_HOOK }}
        run: |
          DIGEST=$(docker buildx imagetools inspect ghcr.io/alaskantuna/rokabot:stable --format '{{json .Manifest.Digest}}' | tr -d '"')
          curl -fsS -X POST "$RENDER_DEPLOY_HOOK&imgURL=ghcr.io/alaskantuna/rokabot@$DIGEST"
```

Notes:

- Every part of `imgURL` except the tag or digest must match the service's default image URL, or Render rejects the request. Without `imgURL`, Render uses the tag or digest saved in the service's settings.
- Responses: 200 deploy started, 202 queued behind a running deploy, 400, 401 or 404 for bad input, 405 for another method, 409 when the service is suspended or deploys are blocked.
- Each call starts a deploy, which restarts the bot. Whether Render skips a deploy when the digest is unchanged is not documented, so keep the schedule slow.
- Whether a hook call without `imgURL` pulls a `stable` that has moved is not documented. The digest in `imgURL` avoids the question.
- The workflow redeploys only the bot. If you run the speech recognition service, add a second step that calls its own hook, stored as a second secret (for example `RENDER_ASR_DEPLOY_HOOK`), with `ghcr.io/alaskantuna/rokabot-asr@<digest>`.
- GitHub turns off scheduled workflows in a public repository after 60 days without repository activity, so a quiet fork stops redeploying. To turn one back on, open the Actions tab, select the workflow and choose Enable workflow, or run `gh workflow enable`. Source: [Disabling and enabling a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).

Source: [Deploy Hooks](https://render.com/docs/deploy-hooks).

## Data

The bot needs a persistent volume mounted at `/app/data` that user `node` (UID 1000) can write to. Without one, it does not start. `/app` belongs to root, so with no volume at that path startup fails with `EACCES: permission denied, mkdir '/app/data'`. With a volume that UID 1000 cannot write to, it fails with `SqliteError: unable to open database file`. The bot keeps its SQLite database, `rokabot.db`, in that folder.

Add persistent storage to the service and mount it at `/app/data`.

Render's steps for persistent storage and its ownership rules are not covered here. Whatever you use, the storage must be writable by UID 1000.
