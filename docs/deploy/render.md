# Render

Run Rokabot on Render from the published image. Render never redeploys an image service by itself, so a release reaches your bot only when you trigger a deploy.

## At a Glance

| Item               | Value                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| Image              | `ghcr.io/alaskantuna/rokabot:stable` (public, no credentials)                       |
| Memory             | About 1 GB (the compose file caps the bot at `mem_limit: 1g`)                       |
| Storage            | Persistent, at `/app/data`, writable by UID 1000                                    |
| Health             | Port 3000, any path: 200 with `"status":"ok"` once Discord is connected, 503 before |
| Speech Recognition | Optional second service from `ghcr.io/alaskantuna/rokabot-asr:stable`               |
| Updates            | Manual deploy, or a deploy hook on a schedule you own                               |

## Steps

1. In the Render Dashboard, click New and select a service type. Private services are among the types Render lists for prebuilt images.
2. Under Source Code, click Existing Image.
3. Enter `ghcr.io/alaskantuna/rokabot:stable` as the image URL and click Connect.
4. Set the name, region and compute plan, then click Deploy.
5. Add persistent storage and mount it at `/app/data`.
6. Set the variables `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`, plus the model keys the built-in `config.yml` needs. [`.env.example`](../../.env.example) explains every key.
7. Point a health check at port 3000.

If the first deploy fails, add the storage and deploy again.

Source: [Deploy an Image](https://render.com/docs/deploy-an-image).

## Configuration

The image carries a built-in `config.yml`, so the bot starts with its defaults. An environment variable overrides a single value where `src/config.ts` wires one, for example `LLM_MAIN`, `LLM_FALLBACK` and `MEDIA_WATCHER`. To use your own file, mount it and set `ROKABOT_CONFIG_PATH` to its path.

### Speech Recognition

Speech recognition is off until you set `MEDIA_TRANSCRIBER_URL`; the built-in `config.yml` leaves it empty. It serves only the qwen media watcher, which needs `MODELSCOPE_API_KEY`. That watcher is the main one when `media.watcher` is `qwen`, and the backup when it is `gemini`. Without that key, skip this.

1. Create a second service from `ghcr.io/alaskantuna/rokabot-asr:stable`. Give it about 2 GB of memory and keep it private. It listens on port 8000 and answers `GET /health`.
2. On the bot service, set `MEDIA_TRANSCRIBER_URL` to the private address of that service, with port 8000.

To keep speech recognition off, leave `MEDIA_TRANSCRIBER_URL` unset or empty.

### Automatic Updates

Render says: "Image-backed services do not automatically redeploy whenever a new image is associated with their assigned tag." It has no auto-deploy setting for images.

By hand: open the service, choose Manual Deploy, then Deploy latest reference. It pulls the image the service's tag points to now.

From a schedule, through the deploy hook:

1. Open the service's Settings tab and copy its deploy hook URL. The URL is a secret. Regenerate Hook replaces it, and callers of the old URL then get 401.
2. Store the URL as a secret in a repository you own, for example `RENDER_DEPLOY_HOOK`.
3. Call the hook on a schedule. It accepts `GET` or `POST`; the `key` query parameter in the URL authenticates it.
4. Repeat with the speech recognition service's hook, if you run one.

Example workflow for your own repository. It is untested. It reads the digest behind `stable` and deploys exactly that image with the optional `imgURL` parameter:

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

| Hook Response | Meaning                              |
| ------------- | ------------------------------------ |
| 200           | Deploy started                       |
| 202           | Queued behind a running deploy       |
| 400, 401, 404 | Bad input                            |
| 405           | Wrong method                         |
| 409           | Service suspended or deploys blocked |

Source: [Deploy Hooks](https://render.com/docs/deploy-hooks).

## Caveats

- **Data Storage:** without storage at `/app/data`, startup fails with `EACCES: permission denied, mkdir '/app/data'`, because `/app` belongs to root. With storage that UID 1000 cannot write, it fails with `SqliteError: unable to open database file`. The bot keeps `rokabot.db` there.
- **Pulls:** Render keeps no previously pulled images and pulls on every deploy.
- **`imgURL` Match:** every part of `imgURL` except the tag or digest must match the service's default image URL, or Render rejects the request. Without `imgURL`, Render uses the tag or digest saved in the service settings.
- **Moved Tag:** whether a hook call without `imgURL` pulls a `stable` that has moved is not documented. The digest in `imgURL` avoids the question.
- **Restarts:** each call starts a deploy, which restarts the bot. Whether Render skips an unchanged digest is not documented, so keep the schedule slow.
- **Speech Service:** the workflow redeploys only the bot. For the speech recognition service, add a second step with its own hook secret (for example `RENDER_ASR_DEPLOY_HOOK`) and `ghcr.io/alaskantuna/rokabot-asr@<digest>`.
- **Quiet Forks:** GitHub turns off scheduled workflows in a public repository after 60 days without activity. To turn one back on, open the Actions tab, select the workflow and choose Enable workflow, or run `gh workflow enable`. Source: [Disabling and enabling a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).
- **Not Covered:** where Render takes variables, how it mounts a file, how it sets a health check, its private address format, and its storage steps and ownership rules. See Render's own documentation. The storage must be writable by UID 1000.
