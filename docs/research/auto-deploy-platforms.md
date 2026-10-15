# Auto-Deploy Platforms

> Research for the `stable` release tag. Written 2026-10-15. Every claim below comes from the platform's own docs, the Watchtower project's own repository and registries, or GitHub's and Docker's own docs. Each source was read on 2026-10-15. Where the docs are silent, this note says so instead of guessing.

## Answer

- **Railway:** Yes, natively. A service deployed from a GHCR image can enable Image Auto Updates in its Source settings. For a non-semver tag such as `stable`, Railway redeploys when the digest behind the tag changes. Detection is cached for up to a few hours and applies inside a maintenance window you pick (UTC). `railway redeploy` also exists, but the docs do not say it re-pulls the digest.
- **Render:** No. Image-backed services do not redeploy when a new image is associated with their tag. Trigger it with the service's deploy hook URL (`GET` or `POST`, optional `imgURL` tag or digest override) or the dashboard action Manual Deploy > Deploy latest reference. There is no auto-deploy setting for images.
- **Fly.io:** No native watcher. `fly deploy --image ghcr.io/alaskantuna/rokabot:stable` deploys a named image, and a scheduled GitHub Action in the user's fork can run it with a `FLY_API_TOKEN` deploy token. The docs do not say whether a re-run with an unchanged digest is a no-op.
- **Coolify:** No documented auto-update for Docker Image applications. Redeploy pulls the saved image reference again, and an authenticated deploy webhook (`POST /api/v1/deploy?uuid=...` with a bearer token) can start it from CI or a scheduler. The docs do not say whether the webhook alone forces a pull of a moved mutable tag; the Redeploy action does.
- **Watchtower:** `containrrr/watchtower` is archived (2025-12-17). The maintained project is `nicholas-fedor/watchtower`, image `nickfedor/watchtower` (Docker Hub) or `ghcr.io/nicholas-fedor/watchtower`. Latest stable tag is `1.23.1` (2026-10-13). Pin `nickfedor/watchtower:1.23.1`. The label `com.centurylinklabs.watchtower.enable`, `WATCHTOWER_LABEL_ENABLE`, `WATCHTOWER_CLEANUP` and `WATCHTOWER_SCHEDULE` (6-field cron) all still work.
- **GHCR Limits:** GitHub documents no pull rate limit for public packages and says storage and bandwidth are currently free. Watchtower's docs observe an undocumented per-organization bucket of about 44,000 requests per minute that runs dry near the top of each hour. No anonymous-pull quota like Docker Hub's 100 pulls per 6 hours is documented.

## Railway

Checked: 2026-10-15.

- **Native Auto Update:** Railway "periodically checks the Docker registry for new versions of your configured image". For non-semver tags it watches only the configured tag: "When a new image is pushed (same tag, different SHA), Railway redeploys your service." The configured tag is preserved.
- **Registries:** Docker Hub and GitHub Container Registry (`ghcr.io`). Images from other registries "do not support auto updates".
- **Setup:** Service Settings, Source section, Configure Auto Updates. Pick an update type, then a maintenance window: Weekends, Night (02:00 to 06:00 UTC), Anytime, or Custom. All schedules are UTC.
- **Delay:** "Detection results are cached for up to a few hours", so a release can take hours to arrive even with the window set to Anytime.
- **Downtime:** Each automatic update triggers a redeploy. A service with an attached volume may be down briefly (typically under 2 minutes). Pro plan users get an automatic volume backup before the update.
- **Public GHCR Image:** Create a service, enter `ghcr.io/alaskantuna/rokabot:stable` when prompted for an image, then review and deploy the staged change. A public image needs no credentials. Private GHCR images need a classic personal access token and the Pro plan.
- **CLI Trigger:** `railway redeploy [-s <service>] [-y]` redeploys "the current deployment without uploading new code". A project token in `RAILWAY_TOKEN` can run it in CI.
- **Unclear in the Docs:** The Image Auto Updates page does not name `stable`; it describes any non-semver tag (it lists `latest`, `canary`, `staging`). The CLI page does not cover image-based services, so it is not confirmed that `railway redeploy` pulls the new digest. Prefer the built-in auto update. I found no documented API or webhook for this in the pages above.

## Render

Checked: 2026-10-15.

- **No Auto Redeploy:** "Image-backed services do not automatically redeploy whenever a new image is associated with their assigned tag." The pages show no polling and no auto-deploy toggle for images.
- **Dashboard:** Manual Deploy > Deploy latest reference "kicks off a deploy that pulls the image that's currently associated with the service's assigned tag".
- **Deploy Hook:** Each service has a secret deploy hook URL (Settings tab) that accepts `GET` or `POST`. The `key` query parameter authenticates. For image-backed services the optional `imgURL` parameter deploys a specific tag or digest. Every part of `imgURL` except the tag or digest must match the service's image URL, or Render answers 400. A hook call with `imgURL` does not change the service's saved tag or digest.
- **Hook Responses:** 200 deploy started, 202 queued behind a running deploy (workspaces set to Wait), 400, 401 or 404 for bad input, 405 for another method, 409 when the service is suspended or deploys are blocked.
- **Secret Handling:** The hook URL "is a secret". Regenerate Hook in the dashboard replaces it, and old callers then get 401.
- **Public GHCR Image:** No credential is needed. Render does not keep previously pulled images and pulls on every deploy.
- **Recommended Pattern:** After a release moves `stable`, call the hook with `imgURL=ghcr.io/alaskantuna/rokabot@sha256:<digest>` or with the `stable` tag from a scheduled GitHub Action in the user's fork.
- **Unclear in the Docs:** The deploy hook page does not say whether a call without `imgURL` re-resolves a moved mutable tag. The dashboard action does, per the quote above. Using a digest in `imgURL` avoids the question. No API endpoint for triggering image deploys appears on these pages.

## Fly.io

Checked: 2026-10-15.

- **No Native Watcher:** The pages read do not describe Fly polling a registry for a new digest.
- **Deploy a Named Image:** `fly deploy --image <ref>` ("The Docker image to deploy"). An image set with `--image` or in `[build]` of `fly.toml` takes priority over any Dockerfile. `--image-label` sets the tag used when Fly pushes the image to its own registry (default `deployment-{timestamp}`). The default strategy is `rolling`.
- **Existing Public Image in fly.toml:** `[build]` with `image = "..."`. Fly describes this as for when you want to "immediately deploy an existing public image", with "no build process". The example is `flyio/hellofly:latest`; the page does not name `ghcr.io`.
- **Token:** `fly tokens create deploy -x 999999h` from the project directory. Copy the whole output including the `FlyV1` prefix and the space after it. Store it as the repository secret `FLY_API_TOKEN`.
- **Action in the User's Fork:** Fly's CI page uses `superfly/flyctl-actions/setup-flyctl@master` and `flyctl deploy --remote-only` with `FLY_API_TOKEN` in `env`. Adapted for a prebuilt image, untested:

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

- **Unclear in the Docs:** The `fly deploy` reference does not say where `--image` pulls from, so the `ghcr.io` case rests on the `[build]` page ("existing public image") and not on an explicit GHCR statement. It does not say what happens when the digest is unchanged since the last release. The checkout step is there only so `fly.toml` is present.

## Coolify

Checked: 2026-10-15.

- **No Documented Auto Update:** The Docker Image page does not describe Coolify checking for new digests. It says Docker Image applications skip automatic Git deployments. The Automatic Deployments page lists two triggers, a Git provider repository event and an authenticated Deploy Webhook from external CI, and says nothing about registry webhooks or scheduled image updates.
- **Redeploy Pulls:** After you save the image under General > Docker Registry, Redeploy: "Coolify pulls the selected image before applying the replacement." "A mutable tag can resolve to different image content during a later deployment." Restart also pulls the saved reference again. A digest, stored as `sha256-<64-character-digest>` in the tag field, always points to the same content.
- **Deploy API:** `POST /api/v1/deploy` with `uuid` (comma-separated list allowed) or `tag`, never both. Authenticate with `Authorization: Bearer <token>`, created under Keys & Tokens > API tokens. The Deploy Webhooks page shows a `GET` form and says Coolify also accepts `POST`; the API reference lists `POST`. Use `POST`.
- **Public Image:** The Docker Image page lists deploying a public Docker Hub image as a use case and asks for registry credentials only before deploying a private image. It does not state GHCR explicitly.
- **Recommended Pattern:** A scheduled GitHub Action in the user's fork, or a cron on the Coolify host, sends the authenticated `POST` to the deploy endpoint for the Rokabot application's UUID.
- **Unclear in the Docs:** Neither deploy page says whether the webhook pulls a moved mutable tag. `force` is documented as "Rebuild an application without using its build cache", which concerns builds, not pulls. Coolify's own tracker has an open report, [coollabsio/coolify#5318](https://github.com/coollabsio/coolify/issues/5318) (opened 2025-03-11), that `force=true` did not pull the latest image on one older version; I did not verify the current behavior. Test with `stable` once before telling users it works.

## Watchtower

Checked: 2026-10-15.

### Original Project

- **Archived:** `containrrr/watchtower` was archived by its owner on 2025-12-17 (GitHub API: `archived: true`, last push 2025-12-17T14:44:11Z). Its README opens with "This project is no longer maintained" and links to discussion #2135, "Goodbye containrrr/watchtower!".
- **Last Release:** v1.7.1, 2023-11-11.
- **No Endorsed Successor:** The discussion says the maintainers know nothing about the forks and cannot vouch for them. It adds that "a few of the active forks I've looked at are full of AI slop and while they might work, I wouldn't advice using any of them". Treat the fork below as a community project, not an upstream successor.

### Maintained Fork

- **Repository:** [nicholas-fedor/watchtower](https://github.com/nicholas-fedor/watchtower). Apache-2.0, not archived, last push 2026-10-15, 4,608 stars. GitHub does not flag it as a fork, its own docs never mention containrrr, and its changelog carries the older project's history.
- **Images:** `nickfedor/watchtower` on Docker Hub and `ghcr.io/nicholas-fedor/watchtower`. Both are documented on its Installation page.
- **Latest Stable:** Release `v1.23.1`, 2026-10-13. Earlier releases: v1.23.0 (10-06), v1.22.3 (09-22), v1.22.2 (09-15), v1.22.1 (09-09), v1.22.0 (09-02).
- **Tag Format:** Image tags have no `v` prefix: `1.23.1`, `1.23`, `latest` and `nightly`. `1.23.1` exists on both registries with the same index digest, `sha256:3175c006eb20112f3a70f7002f82dbf4a4078c97e7033735a4d153668fc3dfb1`.
- **Architectures:** amd64, arm64, 386, arm/v6 and riscv64 on Docker Hub. The Pi 5 uses arm64.
- **Recommendation:** Pin `nickfedor/watchtower:1.23.1`. Pinning the full version keeps Watchtower on a known release; bump it on purpose. `ghcr.io/nicholas-fedor/watchtower:1.23.1` is the same image and avoids Docker Hub's anonymous limit of 100 pulls per 6 hours per IPv4 address or IPv6 /64.
- **Scope Warning:** The README says: "We do **not** recommend using Watchtower in a commercial or production environment." The compose service should stay opt-in and documented as such.

### Settings Confirmed on v1.23.1

| Setting                                       | Env Var                    | Default | Behavior                                                                                                                                                     |
| --------------------------------------------- | -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Label `com.centurylinklabs.watchtower.enable` | n/a                        | n/a     | With `WATCHTOWER_LABEL_ENABLE` set, only containers labeled `true` are monitored. Without it, `false` excludes a container and everything else is monitored. |
| `--label-enable`                              | `WATCHTOWER_LABEL_ENABLE`  | `false` | Restricts monitoring to containers with the label set to `true`.                                                                                             |
| `--cleanup`                                   | `WATCHTOWER_CLEANUP`       | `false` | Removes old images after an update.                                                                                                                          |
| `--schedule`, `-s`                            | `WATCHTOWER_SCHEDULE`      | none    | 6-field cron expression (seconds first). Example `0 0 4 * * *` runs daily at 4 AM.                                                                           |
| `--interval`, `-i`                            | `WATCHTOWER_POLL_INTERVAL` | `86400` | Seconds between polls. Cannot be combined with `--schedule`.                                                                                                 |
| Time zone                                     | `TZ`                       | `UTC`   | `--schedule` needs `TZ` or a mounted `/etc/localtime`.                                                                                                       |

- **Exact Reference Match:** Watchtower monitors the exact image reference, tag included. A container on `ghcr.io/alaskantuna/rokabot:stable` updates only when `:stable` changes, not when `:latest` or a `sha-` tag moves.
- **Schedule Minute:** The schedule page says to avoid `:00` for GHCR images because shared buckets run dry at the top of the hour. Use a minute such as `0 17 3 * * *`.

### Docker API Version

- **Fork Support:** The README says it is "tested to support v1.43 and higher" and "autonegotiates the API version by default". `DOCKER_API_VERSION` (`--api-version`, `-a`) is optional; a bad value falls back to autonegotiation. Leave it unset.
- **Engine 29.0 to 29.2:** Docker's API matrix shows a minimum API version of 1.44 for Engine 29.0, 29.1 and 29.2. The 29.0.0 release notes (2025-11-10) say the daemon "now requires API version `v1.44` or later".
- **Engine 29.3 and Later:** The 29.3.0 notes (2026-03-05) lowered the minimum to v1.40. The matrix lists 29.3 through 29.8 at 1.40 minimum, with 1.55 maximum for 29.6 to 29.8.
- **Original Project Breaks:** containrrr's own tracker shows the failure on Engine 29: issue #2124, "Error response from daemon: client version 1.25 is too old. Minimum supported API version is 1.44". This is the practical reason not to use `containrrr/watchtower:1.7.1` on a current host.
- **Not Stated:** The fork's docs do not name Docker Engine 29 compatibility. The evidence is indirect: negotiation by default and a `docker/cli` v29.9.0 dependency in the v1.23.1 changelog. Test once on the Pi's Engine version before shipping.

## GHCR Limits

Checked: 2026-10-15.

- **Anonymous Access:** GitHub's Container registry page says: "You can also access public container images anonymously." It lists only a 10 GB layer size limit and a 10-minute upload timeout.
- **Cost:** The GitHub Packages billing page says "GitHub Packages usage is free for public packages" and "Container image storage and bandwidth for the Container registry is currently free", with at least one month of notice before any change.
- **Rate Limit:** I found no pull rate limit for public packages in GitHub's docs. The silence is the finding: there is no documented anonymous quota to quote to users.
- **Observed Behavior:** Watchtower's docs, a secondary source, report that GHCR throttles per organization with an undocumented token bucket, seen as `allowed: 44000/minute`, answers with HTTP 429 and a `retry-after` header, and runs empty for the first minute or two of each hour for popular organizations. Authenticating to `ghcr.io` reduces but does not remove this.
- **Implication for Users:** One Watchtower check per day or per few hours is far below any observed limit. Schedule it away from `:00`.
- **Docker Hub for Comparison:** Docker's docs set 100 pulls per 6 hours for unauthenticated users and 200 for authenticated personal accounts.

## Sources

All read on 2026-10-15. Registry and API queries were run the same day.

| Topic                                 | Source                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Railway Image Auto Updates            | <https://docs.railway.com/deployments/image-auto-updates>                                                         |
| Railway Deploy From An Image          | <https://docs.railway.com/services>                                                                               |
| Railway Redeploy CLI                  | <https://docs.railway.com/cli/redeploy>                                                                           |
| Railway CLI In CI                     | <https://docs.railway.com/cli/deploying>                                                                          |
| Render Deploy An Image                | <https://render.com/docs/deploy-an-image>                                                                         |
| Render Deploy Hooks                   | <https://render.com/docs/deploy-hooks>                                                                            |
| Fly.io `fly deploy` Reference         | <https://docs.fly.io/flyctl/deploy>                                                                               |
| Fly.io Deploy An App                  | <https://docs.fly.io/launch/deploy>                                                                               |
| Fly.io Prebuilt Images                | <https://docs.fly.io/blueprints/working-with-docker>                                                              |
| Fly.io `fly.toml` Reference           | <https://docs.fly.io/reference/configuration>                                                                     |
| Fly.io GitHub Actions                 | <https://docs.fly.io/launch/continuous-deployment-with-github-actions>                                            |
| Coolify Docker Image                  | <https://coolify.io/docs/applications/deployments/docker-image>                                                   |
| Coolify Automatic Deployments         | <https://coolify.io/docs/applications/deployments/automatic-deployments>                                          |
| Coolify Deployments Overview          | <https://coolify.io/docs/applications/deployments/overview>                                                       |
| Coolify Deploy API                    | <https://coolify.io/docs/api-reference/api/operations/deploy-by-tag-or-uuid>                                      |
| Coolify Deploy Webhooks               | <https://next.coolify.io/docs/core/automation/deploy-webhooks>                                                    |
| Coolify Issue 5318                    | <https://github.com/coollabsio/coolify/issues/5318>                                                               |
| containrrr Repository                 | <https://github.com/containrrr/watchtower>                                                                        |
| containrrr Archive Notice             | <https://github.com/containrrr/watchtower/discussions/2135>                                                       |
| containrrr Engine 29 Failure          | <https://github.com/containrrr/watchtower/issues/2124>                                                            |
| Watchtower Fork Repository            | <https://github.com/nicholas-fedor/watchtower>                                                                    |
| Watchtower Fork Releases              | <https://github.com/nicholas-fedor/watchtower/releases>                                                           |
| Watchtower Fork Installation          | <https://watchtower.nickfedor.com/v1.23.1/getting-started/installation/>                                          |
| Watchtower Fork Container Selection   | <https://watchtower.nickfedor.com/v1.23.1/configuration/container-selection/>                                     |
| Watchtower Fork Scheduling            | <https://watchtower.nickfedor.com/v1.23.1/configuration/scheduling/>                                              |
| Watchtower Fork Update Behavior       | <https://watchtower.nickfedor.com/v1.23.1/configuration/update-behavior/>                                         |
| Watchtower Fork Docker Connection     | <https://watchtower.nickfedor.com/v1.23.1/configuration/docker-connection/>                                       |
| Watchtower Fork Image Cooldown (GHCR) | <https://watchtower.nickfedor.com/v1.23.1/advanced-features/image-cooldown/>                                      |
| Watchtower Fork Docker Hub Tags       | <https://hub.docker.com/r/nickfedor/watchtower>                                                                   |
| Watchtower Fork GHCR Package          | <https://github.com/nicholas-fedor/watchtower/pkgs/container/watchtower>                                          |
| Docker Engine 29 Release Notes        | <https://docs.docker.com/engine/release-notes/29/>                                                                |
| Docker Engine API Version Matrix      | <https://docs.docker.com/reference/api/engine/>                                                                   |
| Docker Hub Pull Limits                | <https://docs.docker.com/docker-hub/usage/pulls/>                                                                 |
| GitHub Container Registry             | <https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry> |
| GitHub Packages Billing               | <https://docs.github.com/en/billing/concepts/product-billing/github-packages>                                     |

Watchtower fork docs pages were read from the project's `docs/` source at tag `v1.23.1` on GitHub, which the site above renders.
