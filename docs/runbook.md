# Raspberry Pi Runbook

Commands and facts for running Rokabot on the Raspberry Pi 5.

## At a Glance

| Item           | Value                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------ |
| Host           | Raspberry Pi 5 (8 GB), Docker Compose                                                      |
| Checkout       | `~/rokabot`, reset to the deployed commit on every deploy                                  |
| Compose File   | `~/rokabot/docker-compose.yml`                                                             |
| Containers     | `rokabot-roka-1` (bot), `rokabot-asr-1` (speech), `embeddings` (opt-in profile)            |
| Secrets        | `~/rokabot/.env`, which also records `ROKA_TAG`                                            |
| Tunables       | `~/rokabot/config.yml`, mounted read-only at `/app/config.yml`                             |
| Database       | `~/rokabot/data/rokabot.db`, mounted at `/app/data`                                        |
| Archived Logs  | `~/rokabot/logs/roka-<timestamp>.log.gz`, kept 30 days                                     |
| Health         | `curl http://localhost:3000/` returns `"status":"ok"` once Discord is connected (else 503) |
| Images         | `ghcr.io/alaskantuna/rokabot`, `ghcr.io/alaskantuna/rokabot-asr`                           |
| Runner Service | `actions.runner.AlaskanTuna-rokabot.rokabot-pi`                                            |

- **Approval:** a restart, a redeploy and a merge to `main` each need the owner's explicit approval.
- **Env Changes:** edit `~/rokabot/.env`, then recreate the container with `up -d`. A plain `restart` does not reread `.env`.
- **Config Changes:** change `config.yml` through a PR and a deploy. The deploy runs `git reset --hard`, so a local edit is lost.
- **Timezone:** the SQL examples add `+8 hours` for Asia/Singapore (UTC+8). Adjust them for your zone.

![Pi Deployment Topology](diagrams/runbook-pi-topology.svg)

CI publishes images to GHCR, the runner on the Pi pulls them and restarts the containers, and operators reach the host over SSH.

## Access

```bash
# SSH over Ethernet (static IP, always works)
ssh <pi-user>@<pi-ethernet-ip>
# SSH over WiFi (same network only; phone hotspots can block it with AP isolation)
ssh <pi-user>@<pi-wifi-ip>
```

- Use your own login and addresses. `/etc/netplan/50-cloud-init.yaml` sets the Ethernet static IP and WiFi.
- The Pi is also reachable over Tailscale.

## Bot Lifecycle

```bash
# Follow live logs
sudo docker compose -f ~/rokabot/docker-compose.yml logs -f
# Show the last 50 log lines
sudo docker compose -f ~/rokabot/docker-compose.yml logs --tail 50
# Show container status; STATUS must be "Up", not "Restarting"
sudo docker compose -f ~/rokabot/docker-compose.yml ps
# Restart the bot
sudo docker compose -f ~/rokabot/docker-compose.yml restart
# Stop the bot
sudo docker compose -f ~/rokabot/docker-compose.yml down
# Start the bot, or recreate it after a .env change
sudo docker compose -f ~/rokabot/docker-compose.yml up -d
# Show memory and CPU use
sudo docker stats --no-stream
# Open a shell in the bot container
sudo docker exec -it rokabot-roka-1 sh
# List the logs each deploy archived from the outgoing container
ls ~/rokabot/logs/
# Search one archive
zcat ~/rokabot/logs/roka-<timestamp>.log.gz | grep '"msg":"Watched media"'
```

- `up -d` and `restart` keep the image that `ROKA_TAG=sha-<commit>` in `.env` names.
- A local build (`up -d --build` or `build --no-cache`) replaces the published image under the recorded tag. Use it only in an emergency.
- `roka` has `mem_limit: 1g` and no swap, publishes port 3000 and uses `restart: unless-stopped`. Docker keeps 3 log files of 10 MB per container.

## Deploy and Roll Back

### How a Deploy Runs

A push to `main` runs `.github/workflows/deploy.yml`. A push that changes only `*.md`, `docs/**`, `.claude/**` or `graphify-out/**` does not deploy. Every pull request runs the `test` job.

1. `test` type-checks, lints, and runs `npm test` and `npm run test:perf`. `compose` checks the compose file.
2. `images` builds `rokabot` and `rokabot-asr` for amd64 and arm64. `manifest` tags them `sha-<first 7 of the commit>` and `edge` on GHCR, then checks that anonymous pulls work.
3. The self-hosted runner on the Pi takes the `deploy` job. It polls GitHub outbound, so it works through any NAT or WiFi. Deploys run one at a time (`pi-deploy` concurrency group).
4. The runner resets `~/rokabot` to the commit, archives the outgoing `roka` logs, runs `docker compose pull roka asr`, records `ROKA_TAG=sha-<7>` in `.env` and runs `docker compose up -d --no-build`.
5. It polls `http://localhost:3000/` 10 times, 5 s apart, for `"status":"ok"`. On failure it prints the last 20 log lines.
6. It prunes old `sha-*` images. It keeps the current tag and the newest other one for rollback.
7. With the `DISCORD_WEBHOOK_URL` secret set, it posts the result to Discord.

- If the pull fails, the old container keeps running. Nothing rolls back by itself.
- The deploy job times out after 25 minutes. The first pull after a speech-model change downloads about 1 GB of layers.
- Make `images-ok` a required check in the `main-pr-ci-gate` ruleset, beside `test`, so a failed image build or compose check blocks the merge.
- Results: https://github.com/AlaskanTuna/rokabot/actions

### Redeploy

```bash
# Re-run the failed jobs of a "Deploy to Pi" run (from a dev machine)
gh run rerun <run-id> --failed
# List the job IDs of a run
gh run view <run-id> --json jobs
# Re-run only the deploy job of a run that already succeeded
gh run rerun <run-id> --job <job-id>
```

- Re-running an older run deploys that older commit and resets the Pi checkout to it.
- Re-running the whole older run, not only `--failed` or the deploy job, also moves the `edge` tag back to it.

### Roll Back

1. Find the previous tag with `docker image ls ghcr.io/alaskantuna/rokabot`, or pick any published `sha-<7>` tag on GHCR.
2. Restore that commit's `config.yml`. The container mounts it from the host, so a tag change alone keeps the newer config.
3. Write the old tag to `.env` and start it. `up -d --no-build` pulls a tag that is not on the Pi.
4. The next merge to `main` deploys forward again.

```bash
# Step 2: restore the previous commit's config.yml
git -C ~/rokabot checkout <previous sha> -- config.yml
# Step 3: run the previous image
cd ~/rokabot && sed -i 's/^ROKA_TAG=.*/ROKA_TAG=sha-<previous>/' .env && docker compose up -d --no-build
```

`sudo` drops a `ROKA_TAG=...` prefix in front of `sudo docker compose`, so always set the tag in `.env`.

### Release to Stable

Users run `:stable`. It moves only when a release PR merges.

1. **One-Time Setup:** store a fine-grained personal access token for this repository only, with Contents and Pull requests set to read and write, as the repository secret `RELEASE_PLEASE_TOKEN`. Without it, CI never runs on the release PR, so `test` never passes.
2. **Release:** after the Pi has run the merged changes well, merge the open "chore(main): release X.Y.Z" PR. The push deploys the Pi, creates the tag and GitHub Release, and `promote` points `vX.Y.Z`, `vX.Y` and `stable` at the image the Pi now runs.
3. **Check:** `:stable` must show the same digest as `:sha-<first 7 of the release commit>`.

```bash
# Step 3: show the stable digest
docker buildx imagetools inspect ghcr.io/alaskantuna/rokabot:stable
# Re-tag by hand when promote skipped; run it for rokabot and rokabot-asr
docker buildx imagetools create -t ghcr.io/alaskantuna/<name>:stable -t ghcr.io/alaskantuna/<name>:vX.Y.Z -t ghcr.io/alaskantuna/<name>:vX.Y ghcr.io/alaskantuna/<name>:sha-<first 7 of the release commit>
```

`promote` runs only after the Pi deploy of the release commit succeeds. Re-running `deploy` for an older run resets the Pi to that older commit.

- **Release Deploy Failed or Never Ran** (for example, the runner was offline): `stable` stays on the old release. When the Pi is healthy, run `gh run rerun <run-id> --failed`.
- **Newer Push Superseded the Deploy**, or raced it so `promote` skipped: re-tag both images by hand with the release commit (command above).

### GHCR Visibility

The Pi and users pull without logging in, so both packages must be public. If `manifest` fails at "Check anonymous pulls work", open GitHub > Packages > Package settings > Change visibility and set the package to Public.

After the first switch to pulled images (one time):

1. New packages start private, so the first `manifest` fails. Set `rokabot` and `rokabot-asr` to Public.
2. Run `gh run rerun <run-id> --failed` within a day. Digest artifacts expire after one day. After that, re-run the whole run.
3. After the first good pull deploy, remove the old local images and build cache once: `docker image rm rokabot-roka rokabot-asr && docker builder prune -af`.

### Self-Hosted Runner

To set up the runner on a new device:

1. Open https://github.com/AlaskanTuna/rokabot/settings/actions/runners/new.
2. Copy the registration token. It expires in 1 hour.
3. Run the commands below on the Pi.
4. Push to `main` and check https://github.com/AlaskanTuna/rokabot/actions.

```bash
# Download the ARM64 runner
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -sL https://github.com/actions/runner/releases/latest/download/actions-runner-linux-arm64-2.333.0.tar.gz | tar xz
# Register it with your token
./config.sh --url https://github.com/AlaskanTuna/rokabot --token <YOUR_TOKEN> --name rokabot-pi --labels self-hosted,linux,arm64 --unattended
# Install and start it as a systemd service
sudo ./svc.sh install $USER
sudo ./svc.sh start
```

```bash
# Show runner status
sudo systemctl status actions.runner.AlaskanTuna-rokabot.rokabot-pi --no-pager
# Show runner logs
sudo journalctl -u actions.runner.AlaskanTuna-rokabot.rokabot-pi -n 30 --no-pager
# Restart the runner
sudo systemctl restart actions.runner.AlaskanTuna-rokabot.rokabot-pi
# Uninstall it before you move to another device
cd ~/actions-runner && sudo ./svc.sh stop && sudo ./svc.sh uninstall
./config.sh remove --token <NEW_TOKEN>
```

## Configuration Changes

### Environment Switches

Set these in `~/rokabot/.env`, then run `sudo docker compose -f ~/rokabot/docker-compose.yml up -d`. Each one overrides its `config.yml` key.

| Variable                                    | Values                                 | Effect                                                  |
| ------------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| `LLM_MAIN`                                  | a key under `llm.models`               | Reply model (`llm.main`)                                |
| `LLM_FALLBACK`                              | a key, or `none`                       | Fallback model; `none` turns it off                     |
| `MEDIA_WATCHER`                             | `gemini`, `qwen`, `direct`, `off`      | Who takes in audio and video ([Media](#media-watching)) |
| `MEDIA_TRANSCRIBER_URL`                     | URL, or empty                          | Empty turns speech transcription off                    |
| `SOCIAL_POSTS_ENABLED`                      | `false`                                | Turns social post viewing off                           |
| `EMBEDDINGS_PROVIDER`                       | `gemini`, `local`, `openai`            | Who makes memory vectors                                |
| `COMPOSE_PROFILES`                          | `local-embeddings`                     | Starts the embeddings sidecar                           |
| `JEV_TONE`, `JEV_REFERENTS`, `JEV_PREFETCH` | `off`, `shadow`, `on`                  | Jev in-reply judgments                                  |
| `MEMORY_PRIVACY`                            | `relaxed`, `balanced`, `strict`, `off` | `memory.privacy`                                        |
| `MEMORY_RECALL`                             | `legacy`, `shadow`, `unified`          | `memory.recall`                                         |
| `MEMORY_EXTRACTION_SAMPLE_RATE`             | `0` to `1`                             | `0` stops rejected-conversation samples                 |
| `MEMORY_RECLASSIFY_MAX_PER_RUN`             | `0` to `100`                           | `0` turns reclassification off                          |
| `TYPESAFE_API_KEY`                          | key                                    | Jev judges when it is set                               |

### Reply Model and Fallback

- `llm.main` picks the reply model (shipped: `haiku`). `llm.fallback` picks the fallback (shipped: `qwen122`, `Qwen/Qwen3.5-122B-A10B`).
- Without an `llm:` block, the bot runs `gemini.model` with the ModelScope `fallback.model`. Its key is `MODELSCOPE_API_KEY`; an empty key disables the fallback.
- The fallback answers when the main model is overloaded, timing out or out of daily quota. After a fallback answer, turns go straight to the fallback for `llm.stickyMs` (`fallback.stickyMs` without the block), 5 minutes.
- Each ModelScope call spends one Magicube from the daily allowance. Usage: modelscope.ai/magicube/usage.

To switch the reply model:

1. Set `llm.main` to a key under `llm.models` through a PR, or set `LLM_MAIN` in `.env`.
2. Put the provider's key in `.env`: `ANTHROPIC_API_KEY` for `haiku` and `sonnet`, `OPENAI_API_KEY` for `luna` and `sol`, `MODELSCOPE_API_KEY` for ModelScope models. A missing key stops startup and names the key.
3. Deploy, or recreate the container, with the owner's approval.
4. Check which provider answered.

```bash
# Step 4: count answers per provider
sudo docker logs rokabot-roka-1 2>&1 | grep '"msg":"Response completed"' | grep -o '"provider":"[a-z]*"' | sort | uniq -c
# Turns the main model could not serve, and the fallback answers that followed
sudo docker logs rokabot-roka-1 2>&1 | grep -E '"msg":"(Gemini unavailable, answering this turn with the fallback model|Fallback model answered)"'
# Fallback failures: ordinary failed attempts that name the fallback model
sudo docker logs rokabot-roka-1 2>&1 | grep '"msg":"Live turn attempt failed"' | grep Qwen
```

### Verify a Model Profile

Startup refuses a candidate profile (`verified: false`) as `llm.main` or `llm.fallback`. Today the candidates in `src/agent/llm/profiles.ts` are `gemini-3.8-flash`, `gemini-3.1-flash-lite` and `Qwen/Qwen3.5-27B`. A new profile ships as a candidate until a live probe passes.

```bash
# Probe models live (spends real quota)
npx tsx scripts/probe-llm-profile.ts --live --model Qwen/Qwen3.5-35B-A3B --model deepseek-ai/DeepSeek-V4.1-Flash
```

- **Calls:** four per model: a text reply, one tool call, a reply to that tool's result, one JSON object. ModelScope spends Magicubes, OpenAI and Anthropic bill the account, Gemini spends API quota.
- **Guards:** it needs `--live` and refuses to run when `CI` is set.
- **Keys:** from `.env`: `MODELSCOPE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GRAPHIFY_GEMINI_API_KEY` (else `DEV_GEMINI_API_KEY`) for a `gemini` model. Never `GEMINI_API_KEY`. A model with no supported profile or an unset key fails the run.
- **Thinking Rule:** for `openai` and `modelscope`, no reply may show thinking: a non-empty `reasoning_content` or `reasoning`, a `<think>` tag, or `reasoning_tokens` above zero. For `anthropic` and `gemini`, only a `<think` or `<thinking` tag in visible text fails.
- **Tool Checks:** the tool call needs a real IANA timezone. The tool-result check sends a `get_current_time` call and its result back as a `tool` message and needs a non-empty text reply with no second tool call. A `gemini` model replays its own call, because Gemini 3 rejects a function call without its thought signature.
- **Result:** `ready` or `not ready` per model; exit 0 only when every model is ready. The probe never edits the profile. Set `verified: true` yourself and open a PR with the probe output. The merge restarts the bot, so it needs the owner's approval.

### Hedging Slow Calls

- With a fallback set, a main call that has not answered within the hedge delay also starts on the fallback. The first answer wins. A failed call drops out of the race.
- If both sides fail, the turn fails with the main model's error. A hedge win does not arm the sticky window. Each hedge costs one extra fallback call.
- Turns with audio, video or a PDF never hedge, because the fallback cannot read them. They wait out `gemini.timeout`.
- **Delay:** `llm.hedgeAfterMs` with an `llm:` block (shipped `0`, off). Without the block, `gemini.hedgeAfterMs` (5 s). `0` disables. A longer delay hedges fewer calls (cheaper, longer tail); a shorter one hedges more.

```bash
# Hedged calls and the side that won each one
sudo docker logs rokabot-roka-1 2>&1 | grep '"msg":"Hedged slow Gemini call; kept the faster answer"'
# Hedge wins by side
sqlite3 ~/rokabot/data/rokabot.db "SELECT COALESCE(route_role, model) AS side, COUNT(*) FROM response_events WHERE hedged = 1 GROUP BY side"
```

### Budgets and Monthly Spend

- Per-call budgets apply only with an `llm:` block. They cover every model call except embeddings. A refused call logs `Budget declined a model call` with the budget that refused it: `rpm`, `rpd`, `tpm` or `monthly`.
- A provider that reaches `llm.monthlyBudgetUsd` (shipped: `anthropic: 5`, `openai: 5`) stays disabled until the UTC month turns, also across restarts. Background jobs stop at 80% of the cap. Replies run on to 100%.
- To re-enable a provider early, raise its cap in `config.yml` and restart.
- A provider that reports its own credit spent is disabled in memory only. Top up the account, then restart.
- `llm.modelscopeDailyMagicubes` (250) resets at UTC midnight and on restart.

```bash
# Refused calls and the budget that refused each one
sudo docker logs rokabot-roka-1 2>&1 | grep '"msg":"Budget declined a model call"'
# Estimated spend this month per provider in USD (also shows legacy Gemini estimates)
sqlite3 ~/rokabot/data/rokabot.db "SELECT provider, ROUND(usd, 4) FROM llm_spend WHERE month = strftime('%Y-%m', 'now')"
```

### Jev Judgments

- **Judge:** Jev judges when `TYPESAFE_API_KEY` is set. Without it, the main model judges when `config.yml` has an `llm:` block. With neither, the derived `memory.judge` is `none`. Startup then logs `Passive memory extraction is disabled: no TypeSafe API key` once and drops passive episodes.
- **Memory Gates:** admission and verification are hard gates. An unavailable judge, a timeout or a low admission score drops the episode. They have no shadow mode and stop only with passive extraction.
- **Thresholds:** `jev.memoryTimeoutMs`, `memory.admitThreshold` and `memory.verifyThreshold` (Jev), or `memory.modelAdmitThreshold` and `memory.modelVerifyThreshold` (main model). Change them through a PR.
- **Tone:** `jev.tone` is `on` with `jev.toneMinProbability: 0.3`. No probability, a timeout or an error keeps the regex tone. Watch `sleepy`: Jev picks it for late-night turns more often than human labelers accept.
- **Prefetch:** `jev.prefetch` stays `shadow`. Jev asks whether a turn needs lookup; Tavily is not called. `on` lost a live A/B on search recall and latency, so re-run the A/B before you switch.

```bash
# Compare Jev tone with the regex tone on stored turns (needs TYPESAFE_API_KEY)
npm run replay:jev -- data/rokabot.db --max-turns 100
# Re-run the prefetch A/B before switching jev.prefetch to on
npm run measure:prefetch -- --live --prefetch off --out /tmp/prefetch-off.json
npm run measure:prefetch -- --live --prefetch on --out /tmp/prefetch-on.json
```

Labeled tone data stays local, because it carries message text. The queries below store and show no message text or member IDs.

```sql
-- Recent tone judgments
SELECT created_at, baseline, json_extract(answer, '$.tone') AS jev_tone, probability, confidence, applied,
       latency_ms, input_tokens
FROM jev_events WHERE kind = 'turn' ORDER BY created_at DESC LIMIT 20;

-- Recent prefetch judgments
SELECT created_at, json_extract(question, '$.prefetch') AS prefetch_mode,
       json_extract(answer, '$.needsLookup') AS needs_lookup,
       json_extract(answer, '$.prefetchStatus') AS prefetch_status,
       json_extract(answer, '$.tone') AS jev_tone, probability, applied, latency_ms
FROM jev_events WHERE kind = 'turn' ORDER BY created_at DESC LIMIT 20;
```

| `prefetchStatus`                                    | Meaning                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `shadow_would_fire`                                 | The score met `jev.prefetchMinNoul` (0.7); no search ran                          |
| `ready`                                             | A search result arrived for the first prompt; the safety ladder can still drop it |
| `off`, `below_threshold`, `no_noul`, `no_judgment`  | Why no prefetch started                                                           |
| `failed`, `empty`, `aborted`, `canceled`, `gave_up` | A prefetch started but supplied no result                                         |

At most one automatic Tavily search starts per turn. It uses no Gemini RPM slot. The first Gemini call waits `jev.prefetchWaitMs` (4 s) for it, and the model can still call `search_web`.

```bash
# Memory admission and verification totals
sqlite3 ~/rokabot/data/rokabot.db "SELECT kind, question, applied, COUNT(*) AS events,
  ROUND(AVG(probability), 3) AS avg_probability, ROUND(AVG(latency_ms), 1) AS avg_latency_ms,
  SUM(input_tokens) AS input_tokens FROM jev_events WHERE kind IN ('admission', 'verification')
  GROUP BY kind, question, applied ORDER BY kind, question, applied;"
```

- Admission asks `lasting_fact`. Verification asks `durable_N`, `attributed_N` (`guild_scoped_N` for server facts), `current_N`, `past_N`, `changes_N`, `same_as_N_M` and `retracts_N_M`.
- `applied = 0` means no operation or duplicate-evidence update was applied. A threshold or an operation rule can block it.
- An exact re-sighting of an active value adds evidence once durability and attribution pass, even when `same_as_N_M` is below threshold.

### Discord App Install and Permissions

A guild install must request both `bot` and `applications.commands`. With only `applications.commands`, the app has no bot member: no gateway events, no mention, reply or name-keyword triggers, and no reactions. `/ask` still works, so the bot looks half-alive.

The guild permissions follow from the Discord API calls the bot makes:

| Discord Operation                          | Where (Under `src/discord/`)                                                | Permission           |
| ------------------------------------------ | --------------------------------------------------------------------------- | -------------------- |
| Receiving `messageCreate`                  | gateway intents in `client.ts`                                              | View Channels        |
| `message.reply(...)` / `channel.send(...)` | `events/messageCreate.ts`, `events/gameCommands.ts`, `reminderScheduler.ts` | Send Messages        |
| `channel.messages.fetch(...)`              | `events/messageCreate.ts`, to resolve the message a reply points to         | Read Message History |
| `message.react(...)`                       | `events/messageCreate.ts`                                                   | Add Reactions        |
| `AttachmentBuilder` on the reply           | `events/stats/views.ts`, the `/stats` chart PNGs                            | Attach Files         |
| None today                                 | no `EmbedBuilder` and no `embeds:` anywhere in `src/`                       | Embed Links          |

- **Embed Links:** granted but unused. It is kept for masked hyperlink footnotes (issue #19).
- **Reminders:** `src/discord/reminderScheduler.ts` posts to the original channel first and falls back to a DM only when that channel is unreachable, so it needs guild Send Messages.
- **No Pin:** the permission set lives in the Discord Developer Portal, where no test can check it. If you change which Discord APIs the bot calls, re-derive the set and update the Portal.

## Data and Backups

All queries run with `sqlite3 ~/rokabot/data/rokabot.db` on the Pi. `created_at`, `expires_at` and `due_at` are epoch milliseconds.

### Overview and Backups

```bash
# List all tables
sqlite3 ~/rokabot/data/rokabot.db '.tables'
# Show the database file size
ls -lh ~/rokabot/data/rokabot.db
# Show the memory table schemas
sqlite3 ~/rokabot/data/rokabot.db '.schema memory_claim'
sqlite3 ~/rokabot/data/rokabot.db '.schema extraction_queue'
sqlite3 ~/rokabot/data/rokabot.db '.schema jev_events'
# Back up the live database on the Pi (from a dev machine)
ssh <pi-user>@<pi-ethernet-ip> "sqlite3 ~/rokabot/data/rokabot.db '.backup /tmp/rokabot-reports.db'"
# Copy the backup into a dev checkout
scp <pi-user>@<pi-ethernet-ip>:/tmp/rokabot-reports.db ./data/rokabot-reports.db
```

```bash
# Wipe the whole database (stop the bot first; it creates a new one on start)
cd ~/rokabot && docker compose stop
rm -f data/rokabot.db data/rokabot.db-wal data/rokabot.db-shm
docker compose up -d
```

### Memory Claims and Extraction Queue

```bash
# Recent active claims
sqlite3 ~/rokabot/data/rokabot.db "SELECT id, guild_id, subject_kind, subject_user_id, predicate, value,
  expires_at, needs_review, first_seen_at, last_seen_at
  FROM memory_claim WHERE status='active' ORDER BY last_seen_at DESC LIMIT 100;"
# Claims for one user in one guild
sqlite3 ~/rokabot/data/rokabot.db "SELECT id, predicate, value, period, status, needs_review, last_seen_at, ended_at, end_reason
  FROM memory_claim WHERE guild_id='GUILD_ID' AND subject_kind='user' AND subject_user_id='USER_ID'
  ORDER BY last_seen_at DESC;"
# Active claims per guild and subject
sqlite3 ~/rokabot/data/rokabot.db "SELECT guild_id, subject_kind, subject_user_id, COUNT(*) AS active_claims
  FROM memory_claim WHERE status='active' GROUP BY guild_id, subject_kind, subject_user_id
  ORDER BY active_claims DESC;"
# Queue backlog by status
sqlite3 ~/rokabot/data/rokabot.db 'SELECT status, COUNT(*) AS jobs FROM extraction_queue GROUP BY status;'
```

- **Failed Jobs:** startup and daily maintenance delete failed extraction payloads older than `memory.failedExtractionRetentionDays` (7 days, from `enqueued_at`).
- **Unjudged Episodes:** an episode Jev could not judge at admission is retried once after 5 minutes, then dropped. The `Memory episode pipeline failed` warning then shows `classification: "unjudged"` and `queueStatus: "dropped"`.
- **Forgetting:** the `forget_user` tool sets `status='rejected'`, `ended_at` and `end_reason='forgotten'`. A passive sighting cannot restore that value; `remember_user` can restore and pin it.
- **Dead Claims:** startup and daily prunes hard-delete rejected and superseded claims, with their evidence, `memory.deadClaimRetentionDays` (30 days) after `ended_at`.
- **Guild Facts:** scoped to their server. `upcoming_event` and `plan` claims expire at the first instant of the next local day (`timezone`, or `TZ`). A daily prune marks expired active guild claims `rejected`. Relative dates use the local date of the latest episode message.
- **Timestamps:** passive claim and evidence times use the message time, or the current time when none exists.
- **Stats and Export:** `/stats` counts active, unexpired guild facts in memory totals and growth. Its remembered-member list stays user-only. The vault export writes each guild's active facts to `<vault>/<guildId>/guild.md` with `expires_at` on dated facts.

### Extraction Funnel

Every extraction attempt writes one `memory_events` row with `kind = 'extraction_run'`. Its `detail` JSON holds the stage, outcome, admission probability, operation counts and stage timings, never message text (fields: [Memory](trd/memory.md)). A retried job leaves one row per attempt. Rows are pruned after `metrics.retentionDays`.

- **`stage`:** the furthest stage reached: `precheck`, `admission`, `extraction`, `verification` or `applied`.
- **`outcome`:** `trivial` and `sensitive` are precheck drops. `below_threshold` is a Jev admission rejection. `jev_unavailable` is an admission Jev could not judge (retried once). `noop` and `written` are completed runs. `error` is a failure.
- **`errorClass`:** `transient` or `permanent` with `error`. `unjudged` appears only with `jev_unavailable`.

```sql
-- Funnel by stage and outcome, last 7 days
SELECT json_extract(detail, '$.stage') AS stage, json_extract(detail, '$.outcome') AS outcome, count(*)
FROM memory_events WHERE kind = 'extraction_run' AND created_at > (strftime('%s','now') - 7*86400) * 1000
GROUP BY stage, outcome ORDER BY count(*) DESC;

-- Admission probability distribution (0.1 buckets)
SELECT round(json_extract(detail, '$.admission.probability'), 1) AS bucket, count(*)
FROM memory_events WHERE kind = 'extraction_run' AND json_extract(detail, '$.admission') IS NOT NULL
GROUP BY bucket ORDER BY bucket;

-- Operation outcomes
SELECT sum(json_extract(detail, '$.ops.proposed')), sum(json_extract(detail, '$.ops.applied')),
       sum(json_extract(detail, '$.ops.duplicate')), sum(json_extract(detail, '$.ops.staged')),
       sum(json_extract(detail, '$.ops.dropped')), sum(json_extract(detail, '$.ops.past')),
       sum(json_extract(detail, '$.ops.reword')), sum(json_extract(detail, '$.ops.retracted'))
FROM memory_events WHERE kind = 'extraction_run';

-- Errors and whether retries recovered them
SELECT job, group_concat(outcome, ' > ') AS attempts
FROM (SELECT json_extract(detail, '$.jobId') AS job, json_extract(detail, '$.outcome') AS outcome
      FROM memory_events WHERE kind = 'extraction_run' ORDER BY id)
GROUP BY job HAVING sum(outcome = 'error') > 0;

-- Summary quality
SELECT avg(json_extract(detail, '$.summary.kept')), avg(json_extract(detail, '$.summary.boilerplate'))
FROM memory_events WHERE kind = 'extraction_run' AND json_extract(detail, '$.outcome') IN ('noop', 'written');

-- Jev judgments of one run
SELECT kind, question, probability, applied FROM jev_events WHERE job_id = <jobId>;
```

- **Admission Buckets:** a pile-up just under `memory.admitThreshold` suggests the threshold is too strict.
- **Retries:** a job ending in `> written` or `> noop` recovered; one ending in `> error` did not.
- **Ops:** `ops.applied` (and `n_selected`) includes staged candidates, so active writes are `applied - staged`. `ops.dropped` counts operations neither applied nor duplicate, staged ones excluded. `ops.past` counts facts written as past ("used to be a nurse"). `ops.reword` counts updates that only restated a fact and became evidence.
- **Retractions:** `ops.retracted` counts retired claims, including hidden facts under `balanced` and `strict`. A run that only retired hidden facts has `ops.applied` 0 and is still `written`.
- **Boilerplate:** `summary.boilerplate` marks summaries that only say no new durable fact came up.
- **Job IDs:** turn judgments leave `jev_events.job_id` null.

### Rejected-Conversation Sample

About 1 in 10 `trivial` or `below_threshold` conversations is kept as text in `extraction_samples` (`memory.extractionSampleRate: 0.1`) to measure Jev's false negatives.

- **Row:** job ID, guild, channel, outcome, admission probability, and the lines as a JSON array of `[displayName]: content` strings. No user IDs.
- **Never Stored:** `sensitive` conversations, `jev_unavailable` runs, or anything under `memory.privacy: off`.
- **Retention:** `memory.extractionSampleDays` (14 days), deleted at startup and daily. Lowering it also removes older rows. At most 200 rows; the oldest is replaced.
- **Readers:** none. Roka, recall, Jev and prompts never read it.
- **Stop:** set `memory.extractionSampleRate` to 0 through a PR, or `MEMORY_EXTRACTION_SAMPLE_RATE=0` in `.env` and recreate the container.

For blind labelling, export once to the session scratchpad, never into the repo. Split one export so both files share a snapshot and join by `id`:

```bash
# Export all samples from the Pi
ssh <pi-user>@<pi-ethernet-ip> 'sqlite3 -json ~/rokabot/data/rokabot.db "SELECT id, outcome, admission_probability, lines FROM extraction_samples ORDER BY id;"' \
  > <session-scratchpad>/extraction-samples-full.json
# Judges' file: ID and lines only
jq 'map({id, lines})' <session-scratchpad>/extraction-samples-full.json > <session-scratchpad>/extraction-samples.json
# Key file: kept away from the judges
jq 'map({id, outcome, admission_probability})' <session-scratchpad>/extraction-samples-full.json > <session-scratchpad>/extraction-sample-keys.json
# Remove the combined export
rm <session-scratchpad>/extraction-samples-full.json
```

Have two independent judges label each sample: does it hold a lasting personal or server fact? Join their labels to `extraction-sample-keys.json` by `id`. The share both accept is a conservative estimate of missed facts. Labels carry message text, so they stay local.

### Reclassification

A background step moves facts filed under the wrong predicate, mostly `misc`, to the right one. It runs at startup and daily, right after the claim prune.

- **Models:** `gemini.extractionModel` (the main model with an `llm:` block) proposes a predicate. Jev, or the main model under `memory.judge: model`, confirms it. A move needs `memory.verifyThreshold` (`memory.modelVerifyThreshold` for the main model).
- **Candidates:** active current `misc` facts, and the weaker of two equal facts one member filed under different predicates. Past facts are never touched.
- **Calls:** at most one proposal and one confirmation request per run, none without candidates. With an `llm:` block, a failed request is tried once on the fallback.
- **Result:** the moved fact keeps its pin, evidence and first-seen time. The old row stays as a `reclassified` record.
- **Cap:** `memory.reclassifyMaxPerRun` (20, bounded 0-100). `MEMORY_RECLASSIFY_MAX_PER_RUN=0` in `.env` plus a recreate turns it off. It never runs under `memory.privacy: off`.
- **Logs:** `Reclassified misfiled memory facts` with `candidates`, `proposed`, `confirmed` and `moved`. Problems log `Reclassification proposal failed`, `Reclassification confirmation failed`, `Memory reclassification failed` or `Skipped a reclassification`.
- **Skip Reasons:** a skipped move rolled back. It logs the claim ID, both predicates and one reason, never the value: `Claim is not active`, `Claim is already filed there`, `Target fact was retracted or forgotten`, `Target fact is not active`, `Claim value is unsafe`, `Move would retire another fact`.
- **Audit:** each move writes a `claim_reclassified` event with claim IDs, both predicates and the probability. `metrics.retentionDays` never prunes these, because undo reads them.

```sql
-- Recent moves; old_id is what undo takes
SELECT created_at, json_extract(detail, '$.oldId') AS old_id, json_extract(detail, '$.newId') AS new_id,
       json_extract(detail, '$.from') AS from_predicate, json_extract(detail, '$.to') AS to_predicate,
       json_extract(detail, '$.probability') AS probability
FROM memory_events WHERE kind = 'claim_reclassified' ORDER BY created_at DESC LIMIT 20;

-- Both rows of one move (shows values, so run it on the Pi only)
SELECT id, predicate, value, status, end_reason, superseded_by, pinned
FROM memory_claim WHERE id IN (<old_id>, <new_id>);
```

Expect a handful of moves after the first deploy, not dozens.

**Undo a Move.** Undo reactivates the old row and ends the replacement when the move created or revived it. That fact is never offered again. It prints `undone`, or `nothing to undo` when the row was not reclassified or is already restored. It runs in one transaction while the bot keeps running. Opening the second connection runs the startup migrations, which recreate the `memory_claim` full-text triggers, so run it while the bot is idle.

```bash
# Production: run the compiled module in the container (the image has no scripts/ and no tsx); replace OLD_ID
sudo docker compose -f ~/rokabot/docker-compose.yml exec roka node --input-type=module -e "
const { undoReclassify } = await import('./dist/agent/memory/reclassify.js')
const { closeDb } = await import('./dist/storage/database.js')
console.log(undoReclassify(OLD_ID) ? 'undone' : 'nothing to undo')
closeDb()
"
# Dev checkout (set ROKABOT_DB_PATH if the database is not data/rokabot.db)
npm run memory:undo-reclassify -- OLD_ID
```

### Episodes, Media Memory and Recall

- **Episodes:** summaries and embeddings live per guild in `memory_episode`. The maintenance pass (startup, then every 24 hours) deletes episodes past `memory.episodeRetentionDays` and retries missing or unreadable embeddings.
- **Embedding Quota:** with `embeddings.provider: gemini` (the Pi), embeddings use `GEMINI_API_KEY` and `gemini-embedding-2` on a separate project quota. They do not debit the bot's generation rate limiter. The planning estimate is 100 RPM, 30 K TPM and 1 K RPD; check AI Studio for your limits.
- **Media:** digests of watched media live in `media_digest`, one row per guild and content key, with an embedding. Each share is a `media_occurrence` row. No media files are stored.
- **Privacy:** `memory.privacy` (`MEMORY_PRIVACY`) and `memory.recall` (`MEMORY_RECALL`). A server that hides every channel from `@everyone` and grants access by role has no public channels, so `balanced` acts like `strict` there.
- **Forget User:** the speaker can delete their own notes at every level. At `relaxed`, replies quote matching values. At `balanced` and `strict`, they quote only claims and media recallable in the current channel and count the rest. At `off`, replies give counts only.
- **Cached Media:** a repost of the same content reuses its digest at every level and records the new share. Unprompted recall of media summaries still follows the privacy level.

```bash
# Episodes per guild
sqlite3 ~/rokabot/data/rokabot.db 'SELECT guild_id, COUNT(*) AS episodes FROM memory_episode GROUP BY guild_id ORDER BY guild_id;'
# Remembered media per guild, with share counts
sqlite3 ~/rokabot/data/rokabot.db "SELECT d.guild_id, d.label, substr(d.summary, 1, 60), COUNT(o.id) AS shares, d.embedding IS NOT NULL AS embedded FROM media_digest d LEFT JOIN media_occurrence o ON o.digest_id = d.id GROUP BY d.id ORDER BY d.created_at DESC LIMIT 20;"
# Active facts and how many hold a vector in any space (after a provider switch, use the per-fingerprint query)
sqlite3 ~/rokabot/data/rokabot.db "SELECT COUNT(*) AS active, SUM(embedding IS NOT NULL) AS embedded FROM memory_claim WHERE status = 'active';"
# Recall shadow comparison, last 7 days: legacy fact retrieval vs unified recall
sqlite3 ~/rokabot/data/rokabot.db "SELECT kind, COUNT(*) AS turns, ROUND(AVG(n_selected), 2) AS avg_selected, ROUND(AVG(tokens_est)) AS avg_tokens FROM memory_events WHERE kind IN ('retrieval', 'recall_shadow', 'recall') AND created_at > (strftime('%s', 'now') - 7 * 86400) * 1000 GROUP BY kind;"
```

### Memory V2 Migration

Run it only with the bot stopped, from a checkout with Node.js 24 and dependencies installed. It checks that every legacy row has a matching claim in a legal scope, reports the top active claims before and after capacity eviction, and drops `user_memory` only if the check passes. An incomplete backfill exits with an error and keeps `user_memory`. Startup never runs it.

```bash
# Stop the bot, back up the database, run the migration
cd ~/rokabot
sudo docker compose stop roka
sqlite3 data/rokabot.db '.backup data/rokabot.db.pre-memory-v2'
ROKABOT_DB_PATH="$PWD/data/rokabot.db" npm run migrate:memory-v2
```

Review the report and the backup. If the check passed, restart with `sudo docker compose up -d roka`. Never delete `user_memory` by hand.

### Vault Export

The export writes a read-only snapshot of member notes and each guild's `guild.md` to `data/vault/` (`MEMORY_VAULT_EXPORT_DIR` changes it). Open the copy in Obsidian on a desktop, not on the Pi. Re-run it to refresh.

```bash
# Export the vault, then copy it to a desktop
cd /path/to/rokabot
npm run export:vault
rsync -av data/vault/ desktop-user@desktop-host:~/Rokabot-vault/
```

### Bug Reports

Users file reports with `/report` in servers, group DMs and DMs. Saved attachment copies live in `~/rokabot/data/reports/`. Unsaved attachments keep their metadata and failure reason in `bug_reports`.

```bash
# Recent open reports (on the Pi, where only sqlite3 is installed on the host)
sqlite3 -header -column ~/rokabot/data/rokabot.db "SELECT id, datetime(created_at / 1000, 'unixepoch') AS filed,
  type, context, user_id, substr(message, 1, 80) AS message, attachment_path IS NOT NULL AS saved
  FROM bug_reports WHERE status = 'open' ORDER BY id DESC LIMIT 20;"
# Full report with its parsed context, read-only, from a dev checkout with a backup copy
npm run reports -- data/rokabot-reports.db --id 42
# Mark report 42 resolved
sqlite3 ~/rokabot/data/rokabot.db "UPDATE bug_reports SET status='resolved' WHERE id=42;"
# Copy saved attachments from the Pi
scp -r <pi-user>@<pi-ethernet-ip>:~/rokabot/data/reports ./data/reports
```

Syntax: `npm run reports -- [db] [--id N] [--status open] [--limit 20]`. Make the backup copy with the commands in [Overview and Backups](#overview-and-backups).

### Reminders, Sessions, Buddies and Games

```bash
# Pending reminders, local time
sqlite3 ~/rokabot/data/rokabot.db "SELECT id, user_id, reminder, datetime(due_at/1000, 'unixepoch', '+8 hours') as due_local FROM reminders WHERE delivered=0;"
# Last 20 reminders
sqlite3 ~/rokabot/data/rokabot.db 'SELECT * FROM reminders ORDER BY created_at DESC LIMIT 20;'
# Delete a reminder
sqlite3 ~/rokabot/data/rokabot.db 'DELETE FROM reminders WHERE id=ID;'
# Last 20 messages
sqlite3 ~/rokabot/data/rokabot.db "SELECT channel_id, display_name, role, substr(content, 1, 80) as preview FROM session_history ORDER BY timestamp DESC LIMIT 20;"
# Messages from one channel
sqlite3 ~/rokabot/data/rokabot.db "SELECT display_name, role, content FROM session_history WHERE channel_id='CHANNEL_ID' ORDER BY timestamp DESC LIMIT 10;"
# Message count per channel
sqlite3 ~/rokabot/data/rokabot.db 'SELECT channel_id, COUNT(*) as msgs FROM session_history GROUP BY channel_id ORDER BY msgs DESC;'
# Clear one channel's history
sqlite3 ~/rokabot/data/rokabot.db "DELETE FROM session_history WHERE channel_id='CHANNEL_ID';"
# All buddies
sqlite3 ~/rokabot/data/rokabot.db 'SELECT id, user_id, species, rarity, name, shiny FROM buddy ORDER BY hatched_at DESC;'
# Buddies of one user
sqlite3 ~/rokabot/data/rokabot.db "SELECT id, species, rarity, name, shiny, stats_json FROM buddy WHERE user_id='USER_ID';"
# Collection size per user
sqlite3 ~/rokabot/data/rokabot.db 'SELECT user_id, COUNT(*) as pets FROM buddy GROUP BY user_id ORDER BY pets DESC;'
# Daily hatch status and streaks
sqlite3 ~/rokabot/data/rokabot.db 'SELECT * FROM gacha_daily;'
# Recent game scores, local time
sqlite3 ~/rokabot/data/rokabot.db "SELECT user_id, game, score, datetime(played_at/1000, 'unixepoch', '+8 hours') as played FROM game_scores ORDER BY played_at DESC LIMIT 20;"
# Hangman leaderboard
sqlite3 ~/rokabot/data/rokabot.db "SELECT user_id, SUM(score) as total, COUNT(*) as games FROM game_scores WHERE game='hangman' GROUP BY user_id ORDER BY total DESC;"
```

### Failure Diagnostics

`failure_diagnostics` holds turns that fell back or deflected, with the triggering message verbatim. It is pruned after `metrics.diagnosticsRetentionHours` (72 hours), sooner than other metrics. It records only failures, so every safety row is a ladder that ran out of rungs.

```bash
# Recent failures
sqlite3 ~/rokabot/data/rokabot.db "SELECT datetime(created_at/1000,'unixepoch','+8 hours') t, outcome, kind, failure_marker, block_side, safety_rungs_used FROM failure_diagnostics ORDER BY created_at DESC LIMIT 20;"
# Did the provider block the input or Roka's output?
sqlite3 ~/rokabot/data/rokabot.db "SELECT block_side, COUNT(*) FROM failure_diagnostics WHERE kind='safety' GROUP BY block_side;"
# What was sent when a turn was blocked
sqlite3 ~/rokabot/data/rokabot.db "SELECT datetime(created_at/1000,'unixepoch','+8 hours') t, tone, image_count, overheard_chars, history_depth, fact_entries, user_message FROM failure_diagnostics WHERE kind='safety' ORDER BY created_at DESC LIMIT 5;"
# How far the ladder got on turns it could not rescue
sqlite3 ~/rokabot/data/rokabot.db "SELECT safety_rungs_used, COUNT(*) FROM failure_diagnostics WHERE kind='safety' GROUP BY safety_rungs_used;"
# Each rung the ladder took; a turn with these lines and no deflection was rescued
sudo docker logs rokabot-roka-1 2>&1 | grep 'de-escalating carried context'
```

To count rescues, compare the deflection rate in `response_events` before and after, or read the rung log above.

## Media and Sidecars

### Media Watching

Audio, video and YouTube links are watched by one separate model call before Roka replies (contract: [Media](trd/media.md)). Each watch logs one `Watched media` line.

```bash
# Last 20 watches
docker logs rokabot-roka-1 2>&1 | grep '"msg":"Watched media"' | tail -20
# Count watches per watcher
docker logs rokabot-roka-1 2>&1 | grep '"msg":"Watched media"' | grep -o '"watcher":"[a-z]*"' | sort | uniq -c
```

| Field       | Values                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `kind`      | `audio`, `video`                                                                                   |
| `transport` | `inline` upload, `files` streamed upload, `uri` (YouTube)                                          |
| `mode`      | `whole`, `halves`, `skim`, `focus`, `opening`, `decline`                                           |
| `outcome`   | `ok`, `partial`, `overloaded`, `timeout`, `unavailable`, `invalid`, `error`                        |
| Other       | `durationSec`, `fps`, `estimate` (admission tokens), `promptTokens` (billed), `watchMs`, `calls`   |
| Qwen Only   | `frames`, `transcript`, `framesMs`, `transcribeMs`, `watchMs` (Qwen call), `totalMs` (whole watch) |

- **Watcher:** `media.watcher` (`MEDIA_WATCHER`) is `gemini` (default) or `qwen` (ModelScope frames plus transcript). The other one is the backup when the first fails. Qwen lines carry `watcher: qwen`; each Qwen watch is one ModelScope call.
- **Latency:** about 2.5-3.5 s for short clips and 8-9 s for a 12-minute YouTube video, on top of the reply.
- **Large Uploads:** audio over 8 MiB and video over 10 MiB, up to 50 MiB, stream into the Gemini Files API, are watched whole, then deleted. `media.uploadTimeoutMs` (45 s) bounds the upload. On the Pi's 2.5 MB/s uplink, budget about 20 s for 50 MB.
- **Long Videos:** 20-40 minute videos are watched in two parallel halves (`mode: halves`, `calls: 2`) when the token bucket has room, else skimmed. `outcome: partial` means one half failed.
- **Linked Videos:** posts on X, Bluesky, Threads, TikTok, Reddit, Instagram and Bilibili are watched from their smallest playable MP4 if it passes the HEAD check and fits 50 MiB (above 10 MiB it streams). Else the thumbnail is used. Reddit videos have no muxed sound and are watched silent. Bluesky needs one cached `plc.directory` lookup per author.
- **YouTube:** Gemini fetches YouTube itself, so the Pi's yt-dlp block does not apply. The free tier allows 8 hours of YouTube video per day; past that, Roka says she couldn't watch it.
- **Qwen Frames:** videos up to 64 s get 16 frames; longer ones get one per 4 s, up to 32 (`media.qwen.*Frames`). The Pi extracts 4 frames at a time. A slow host such as archive.org can take 40-50 s for 32 frames.
- **Transcript Field:** the sidecar's `engine` and `speechSec`, or why there was none: `disabled`, `no_audio`, `timeout`, `unreachable`, `http_<status>`. Transcription was the slowest step in Pi measurements.

### Speech Sidecar

The `asr` container transcribes audio for the Qwen watcher: Silero VAD, then Moonshine for English and SenseVoice for zh, ja, ko and yue.

- It has no published port. The bot reaches it at `http://asr:8000`.
- It holds about 1.2 GB of RAM and is capped at 2 GB and 3 CPUs. An out-of-memory restart takes down only `asr`; the bot then watches from frames alone (`transcript: unreachable`).
- `asr/Dockerfile` pins `python:3.12-slim` by digest, so an upstream base update cannot force the model download (about 500 MB) on an unrelated build.
- To update the base, run `docker buildx imagetools inspect python:3.12-slim` and put the index `Digest` in both `FROM` lines. CI then rebuilds the image, and the next Pi pull downloads about 1 GB of layers.

```bash
# One line per transcription: duration, speechSec, language, engine, elapsed
docker compose -f ~/rokabot/docker-compose.yml logs --tail 20 asr
# Health; "healthy" once the models load (up to 2 minutes)
docker inspect --format '{{.State.Health.Status}}' rokabot-asr-1
```

### Media Kill Switches

Set one in `~/rokabot/.env`, then recreate the bot container.

| Setting                      | Effect                                                                    |
| ---------------------------- | ------------------------------------------------------------------------- |
| `MEDIA_WATCHER=qwen`         | Qwen watches first; Gemini is the backup                                  |
| `MEDIA_WATCHER=direct`       | Audio and video go straight to the reply model, with no watcher or backup |
| `MEDIA_WATCHER=off`          | Nothing is watched or sent; Roka says she can't watch it right now        |
| `MEDIA_TRANSCRIBER_URL=`     | Stops transcription only; the Qwen watcher sees frames                    |
| `SOCIAL_POSTS_ENABLED=false` | Stops social post lookups; embeds and attachments work as before          |

### Social Post Viewing

X and Bluesky use public APIs and Threads reads its public post page. YouTube, TikTok, Reddit, Instagram and Bilibili need yt-dlp.

- **Binary:** the image carries the official yt-dlp musl onedir build (`yt-dlp_musllinux_aarch64.zip` on the Pi, `yt-dlp_musllinux.zip` on amd64) in `/opt/yt-dlp`, linked as `/usr/local/bin/yt-dlp`. The single-file build unpacks itself on every run and cost the Pi 0.6-1.4 s per lookup.
- **Update:** take the latest stable release from the [yt-dlp releases page](https://github.com/yt-dlp/yt-dlp/releases). Set `YTDLP_VERSION`, `YTDLP_AMD64_SHA256` and `YTDLP_ARM64_SHA256` in `Dockerfile` from the `.zip` entries of its `SHA2-256SUMS`. The build checks both the checksum-file entry and the zip. Ship it through the normal release process.
- **Failures:** logged as `Social post lookup failed` with only `platform` and `reason`.
- **YouTube Refusals:** YouTube can refuse yt-dlp from the Pi's home IP (`exit_1`). Run yt-dlp by hand in the container to see `HTTP Error 429` or `Sign in to confirm you're not a bot`. Those links fall back to YouTube oEmbed (title, channel, thumbnail) and log a failure only when oEmbed fails too.
- **Missing Binary:** startup logs `Social video extractors disabled` with reason `binary_missing`. Lookups on the yt-dlp platforms then get the normal "could not be opened" marker.
- **Threads `no_post_data`:** the page came back without its post. The post is private or deleted, or Threads changed what it renders for a logged-out request (check the headers in `src/discord/socialPosts/threads.ts`).

### Local Embeddings Sidecar

`embeddings.provider` (`EMBEDDINGS_PROVIDER`) picks who makes memory vectors:

| Provider | Model                                                  | Dimensions | Needs                               |
| -------- | ------------------------------------------------------ | ---------- | ----------------------------------- |
| `gemini` | `gemini-embedding-2`                                   | 768        | `GEMINI_API_KEY`; the Pi's setting  |
| `local`  | `Xenova/multilingual-e5-small` (`sidecar/embeddings/`) | 384        | `COMPOSE_PROFILES=local-embeddings` |
| `openai` | `text-embedding-3-small`                               | 1536       | `OPENAI_API_KEY`                    |

- **Defaults:** with no `embeddings:` block, `gemini` while `GEMINI_API_KEY` is set, else `local`. A block without `provider` uses `local`.
- **Spaces:** every vector records `embedding_model_id`, `embedding_dim` and `embedding_fingerprint`. Recall reads only the configured space. Legacy vectors marked `unknown` are read only by the `gemini-embedding-2` space.
- **Backfill:** after a switch, the maintenance pass (startup, then every 24 hours) re-embeds other vectors at about one a second, up to `embeddings.backfillBatchSize` per pass. Keyword recall works meanwhile. The pass stops after five connection failures in a row and resumes at the next pass.
- **Sidecar:** no published image; it builds on the Pi (about 5.5 minutes, 1.22 GB). It is healthy in about 10 s, idles near 464 MiB and peaks near 714 MiB under one-text traffic, inside its 1 GiB cap (release gate 800 MiB). It takes at most 4 texts per request; 16 × 512 tokens was OOM-killed. It shares the Pi's four cores with `asr`, so a heavy backfill can push a transcription past `media.transcriber.timeoutMs` (45 s).

```bash
# Vectors per embedding space; NULL means no vector yet
sqlite3 ~/rokabot/data/rokabot.db "SELECT 'episode', embedding_fingerprint, COUNT(*) FROM memory_episode GROUP BY 2 UNION ALL SELECT 'media', embedding_fingerprint, COUNT(*) FROM media_digest GROUP BY 2 UNION ALL SELECT 'fact', embedding_fingerprint, COUNT(*) FROM memory_claim WHERE status = 'active' GROUP BY 2;"
# Build and start the sidecar alone
docker compose --profile local-embeddings up -d --build embeddings
# Check sidecar health
docker compose exec embeddings node -e "fetch('http://127.0.0.1:8080/health').then((r) => r.text()).then(console.log)"
```

To switch the Pi to `local`:

1. Calibrate `embeddings.minSimilarity` for the local fingerprint on a labelled recall set. The shipped values are placeholders.
2. Add `COMPOSE_PROFILES=local-embeddings` and `EMBEDDINGS_PROVIDER=local` to `~/rokabot/.env`.
3. Confirm the sidecar is healthy. If it is not running, start it alone first.
4. Run `cd ~/rokabot && docker compose up -d`. This restarts the bot, so it needs the owner's approval.
5. Watch the backfill with the per-space query. When the counts settle, the local fingerprint holds every row.
6. If the counts stop for more than a few minutes while other fingerprints still hold rows, the pass hit five connection failures (the bot started before the sidecar listened, or the sidecar restarted). Confirm the sidecar is healthy, then run `cd ~/rokabot && docker compose restart roka`, with the owner's approval.

To roll back to `gemini`:

1. Set `embeddings.backfillBatchSize: 900` through a PR and a deploy. Gemini's free tier allows about 1,000 embedding requests a day, so the re-embed spreads over several days.
2. Remove `EMBEDDINGS_PROVIDER` and the profile from `.env`.
3. Stop the sidecar with `docker compose --profile local-embeddings stop embeddings`, then restart the bot.
4. Avoid restarts until the re-embed finishes. Every restart starts another pass, which can exceed the daily limit.

### Hosted Images

The 33 expression thumbnails (`src/discord/expressions.ts`) and 18 buddy sprites (`src/games/data/buddySpecies.ts`) are served from the Cloudflare R2 bucket `rokabot-assets` through its public `r2.dev` URL.

| Asset                 | Key                          | Format                              | Local Source                       |
| --------------------- | ---------------------------- | ----------------------------------- | ---------------------------------- |
| Expression Thumbnails | `expressions/v1/<name>.webp` | 512px WebP, about 38 KB each        | `assets/roka-expressions-curated/` |
| Buddy Sprites         | `buddies/v1/<species>.png`   | 512px pixel-art PNG, uploaded as is | `assets/sprites/buddies/`          |

- Neither source folder is committed.
- Objects carry `Cache-Control: public, max-age=31536000, immutable`. Never overwrite one: upload a changed set under a new prefix (`expressions/v2/`) and swap the URLs in a PR.
- After an upload, check every URL for a `200` and a non-empty body. A host can serve `200` with 0 bytes.
- Wrangler needs IPv4 on the WSL dev machine, which has no IPv6 route.

```bash
# Upload a set to R2 over IPv4
export NODE_OPTIONS=--dns-result-order=ipv4first
bunx wrangler r2 bulk put rokabot-assets --remote --filename bulk.json \
  --content-type image/webp --cache-control "public, max-age=31536000, immutable"
# bulk.json: [{"key": "expressions/v2/base.webp", "file": "/path/to/base.webp"}, ...]
```

## Network

```bash
# Show all network interfaces
ip addr
# Show WiFi connection status
sudo wpa_cli -i wlan0 status
# Show DHCP leases (devices on Ethernet)
cat /var/lib/misc/dnsmasq.leases
# Scan for WiFi networks
sudo wpa_cli -i wlan0 scan && sleep 3 && sudo wpa_cli -i wlan0 scan_results
# Edit the netplan config (Ethernet static IP, WiFi)
sudo nano /etc/netplan/50-cloud-init.yaml
# Apply netplan changes (drops SSH; reconnect after)
sudo netplan apply
# Show the DHCP server status
sudo systemctl status dnsmasq --no-pager
# Restart the DHCP server
sudo systemctl restart dnsmasq
```

| File                              | Purpose                                     |
| --------------------------------- | ------------------------------------------- |
| `/etc/netplan/50-cloud-init.yaml` | Network config (eth0 static IP, WiFi)       |
| `/etc/dnsmasq.d/rokabot.conf`     | DHCP server config for Ethernet and the AP  |
| `~/rokabot/.env`                  | Bot secrets (Discord token, API keys)       |
| `~/rokabot/config.yml`            | Bot tunables (model, timeouts, rate limits) |
| `~/rokabot/data/rokabot.db`       | SQLite database (sessions, memory, games)   |

## System

```bash
# System info
uname -a
cat /etc/os-release
# Disk use
df -h
# Memory use
free -h
# CPU temperature in millidegrees (45000 = 45.0 C)
cat /sys/class/thermal/thermal_zone0/temp
# Top processes by memory
ps aux --sort=-%mem | head -15
# Uptime
uptime
# Reboot
sudo reboot
# Shut down
sudo shutdown now
# Docker service status
sudo systemctl status docker --no-pager
# All enabled services
systemctl list-unit-files --state=enabled
# Last 50 system log lines
sudo journalctl -n 50 --no-pager
# Docker daemon logs
sudo journalctl -u docker -n 30 --no-pager
# Kernel messages (hardware and driver issues)
sudo dmesg | tail -30
```

## Docker

```bash
# List all containers, stopped ones included
sudo docker ps -a
# List images
sudo docker images
# Remove unused images
sudo docker image prune -f
# Remove all unused containers, images, networks and cache
sudo docker system prune -af
# Rebuild from scratch with no cache (emergency only; replaces the image under ROKA_TAG)
cd ~/rokabot && sudo docker compose build --no-cache && sudo docker compose up -d
```

## Troubleshooting

| Symptom                                               | Check                                            | Fix                                                                                |
| ----------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Container shows `Restarting`                          | `docker compose ps`, then `logs --tail 50`       | Fix the error in the logs, then `up -d`                                            |
| Startup stops and names a key                         | Logs                                             | Add that provider key to `.env`, then recreate                                     |
| Startup refuses the model                             | `verified` in `src/agent/llm/profiles.ts`        | Pick a verified profile, or probe the candidate                                    |
| `roka` fails with `bind source path does not exist`   | `ls ~/rokabot/config.yml`                        | Restore `config.yml`; Compose never creates it                                     |
| Deploy failed at the pull                             | Actions run log                                  | The old container still runs; `gh run rerun <run-id> --failed`                     |
| `manifest` failed at "Check anonymous pulls work"     | Package visibility on GitHub                     | Set the package to Public, then re-run failed jobs                                 |
| `stable` did not move after a release                 | `docker buildx imagetools inspect ...:stable`    | Re-run failed jobs, or re-tag by hand ([Release to Stable](#release-to-stable))    |
| Bot answers `/ask` but ignores mentions and replies   | The install's OAuth scopes                       | Reinstall with both `bot` and `applications.commands`                              |
| Passive memory writes nothing                         | Logs for `Passive memory extraction is disabled` | Set `TYPESAFE_API_KEY`, or use a config with an `llm:` block                       |
| Calls refused by `monthly` budget                     | `llm_spend` query                                | Wait for the UTC month, or raise `llm.monthlyBudgetUsd` and restart                |
| Watches end `invalid` on long, dense videos           | `Watched media` lines                            | Raise `media.digestMaxOutputTokens` within 400-4,000                               |
| Qwen watches show `transcript: unreachable`           | `asr` health and logs                            | Wait for `asr` to restart (OOM) or start it; frames-only works meanwhile           |
| Files left in the Gemini Files API                    | Files API list (command below)                   | The list must be empty between turns                                               |
| YouTube lookups fail with `exit_1`                    | yt-dlp by hand in the container                  | Expected (429 or bot check); oEmbed covers it                                      |
| `Social video extractors disabled` (`binary_missing`) | `which yt-dlp` in the container                  | Fix the yt-dlp step in `Dockerfile` and ship a new image                           |
| Threads `no_post_data`                                | The post in a logged-out browser                 | Private or deleted post, or update headers in `src/discord/socialPosts/threads.ts` |
| Embedding backfill counts stop moving                 | Per-space query and sidecar health               | Make the sidecar healthy, then `docker compose restart roka`                       |
| Hosted image shows blank                              | `curl` the URL for `200` and body size           | Re-upload under a new prefix and swap the URLs                                     |

```bash
# List files in the Gemini Files API; expect none between turns
curl -s "https://generativelanguage.googleapis.com/v1beta/files" -H "x-goog-api-key: $GEMINI_API_KEY"
```

## Source Files

- `docker-compose.yml`, `Dockerfile`, `asr/Dockerfile`, `sidecar/embeddings/`
- `.github/workflows/deploy.yml`, `scripts/prune-images.sh`
- `config.yml`, `src/config.ts`, `src/agent/llm/profiles.ts`, `src/agent/llm/budget.ts`, `src/agent/fallbackModel.ts`
- `src/agent/media/`, `src/discord/socialPosts/`, `src/agent/memory/reclassify.ts`, `src/storage/database.ts`
- `scripts/probe-llm-profile.ts`, `scripts/undo-reclassify.ts`, `scripts/reports.ts`, `scripts/migrate-memory-v2.ts`, `scripts/export-vault.ts`
