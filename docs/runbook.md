# Raspberry Pi Command Reference

Quick reference for managing Rokabot on the Raspberry Pi 5.

---

## SSH Access

```bash
# Via Ethernet (static IP, always works)
ssh <pi-user>@<pi-ethernet-ip>

# Via WiFi (if both devices on same network — may not work on phone hotspots due to AP isolation)
ssh <pi-user>@<pi-wifi-ip>
```

> Substitute your own login and addresses. The Ethernet static IP and WiFi are set in
> `/etc/netplan/50-cloud-init.yaml` (see [Network Config Files](#network-config-files)).

---

## Bot Management

```bash
# View live logs
sudo docker compose -f ~/rokabot/docker-compose.yml logs -f

# View last N lines of logs
sudo docker compose -f ~/rokabot/docker-compose.yml logs --tail 50

# Restart the bot
sudo docker compose -f ~/rokabot/docker-compose.yml restart

# Stop the bot
sudo docker compose -f ~/rokabot/docker-compose.yml down

# Start the bot (if stopped)
sudo docker compose -f ~/rokabot/docker-compose.yml up -d

# Deploy latest changes from GitHub
cd ~/rokabot && git pull && sudo docker compose up -d --build

# Check container status
sudo docker compose -f ~/rokabot/docker-compose.yml ps

# Check memory/CPU usage
sudo docker stats --no-stream
```

---

## Network

```bash
# Check all network interfaces
ip addr

# Check WiFi connection status
sudo wpa_cli -i wlan0 status

# Check DHCP leases (devices connected via Ethernet)
cat /var/lib/misc/dnsmasq.leases

# Restart networking (will drop SSH — reconnect after)
sudo netplan apply

# Scan for WiFi networks
sudo wpa_cli -i wlan0 scan && sleep 3 && sudo wpa_cli -i wlan0 scan_results

# Edit WiFi config (netplan)
sudo nano /etc/netplan/50-cloud-init.yaml
# After editing: sudo netplan apply
```

---

## System

```bash
# System info
uname -a
cat /etc/os-release

# Disk usage
df -h

# Memory usage
free -h

# CPU temperature
cat /sys/class/thermal/thermal_zone0/temp
# Divide by 1000 for Celsius (e.g., 45000 = 45.0C)

# Running processes (sorted by memory)
ps aux --sort=-%mem | head -15

# Reboot
sudo reboot

# Shutdown
sudo shutdown now

# Check uptime
uptime
```

---

## Docker

```bash
# List all containers (including stopped)
sudo docker ps -a

# List images
sudo docker images

# Remove unused images (free disk space)
sudo docker image prune -f

# Full cleanup (containers, images, networks, cache)
sudo docker system prune -af

# Rebuild from scratch (no cache)
cd ~/rokabot && sudo docker compose build --no-cache && sudo docker compose up -d
```

---

## Services

```bash
# Check Docker service
sudo systemctl status docker --no-pager

# Check DHCP server (dnsmasq)
sudo systemctl status dnsmasq --no-pager

# Restart DHCP server
sudo systemctl restart dnsmasq

# Check all enabled services
systemctl list-unit-files --state=enabled
```

---

## Logs & Troubleshooting

```bash
# System logs (last 50 lines)
sudo journalctl -n 50 --no-pager

# Docker daemon logs
sudo journalctl -u docker -n 30 --no-pager

# Kernel messages (hardware/driver issues)
sudo dmesg | tail -30

# Check if bot container is restarting
sudo docker compose -f ~/rokabot/docker-compose.yml ps
# STATUS should be "Up", not "Restarting"

# Enter the running container for debugging
sudo docker exec -it rokabot-roka-1 sh
```

---

## Hosted Images

The 33 expression thumbnails in `src/discord/expressions.ts` and the 18 buddy sprites in
`src/games/data/buddySpecies.ts` are served from the Cloudflare R2 bucket `rokabot-assets` through its public
`r2.dev` URL:

| Asset                 | Key                          | Format                              | Local Source                       |
| --------------------- | ---------------------------- | ----------------------------------- | ---------------------------------- |
| Expression Thumbnails | `expressions/v1/<name>.webp` | 512px WebP, about 38 KB each        | `assets/roka-expressions-curated/` |
| Buddy Sprites         | `buddies/v1/<species>.png`   | 512px pixel-art PNG, uploaded as is | `assets/sprites/buddies/`          |

Neither source folder is committed.

Objects are uploaded with `Cache-Control: public, max-age=31536000, immutable`, so never overwrite one in place:
upload a changed set under a new prefix (`expressions/v2/`) and swap the URLs in a PR. Wrangler needs IPv4 on this
WSL machine, which has no IPv6 route:

```bash
export NODE_OPTIONS=--dns-result-order=ipv4first
bunx wrangler r2 bulk put rokabot-assets --remote --filename bulk.json \
  --content-type image/webp --cache-control "public, max-age=31536000, immutable"
# bulk.json: [{"key": "expressions/v2/base.webp", "file": "/path/to/base.webp"}, ...]
```

Check every URL for a `200` and a non-empty body after uploading; the 2026-07-22 catbox outage served `200` with
0 bytes.

---

## Fallback Model

When Gemini is overloaded, timing out or out of daily quota, Roka answers with the ModelScope fallback
(`fallback.model` in `config.yml`, key `MODELSCOPE_API_KEY` in `.env`; an empty key disables it).

```bash
# Turns Gemini could not serve, and the fallback answers that followed
sudo docker logs rokabot-roka-1 2>&1 | grep -E '"msg":"(Gemini unavailable, answering this turn with the fallback model|Fallback model answered)"'

# Fallback failures show up as ordinary failed attempts naming the fallback model
sudo docker logs rokabot-roka-1 2>&1 | grep '"msg":"Live turn attempt failed"' | grep Qwen
```

After a fallback answer, turns go straight to the fallback for `fallback.stickyMs` (5 minutes) before Gemini is
tried again. ModelScope's daily Magicube allowance is spent per call (1 Magicube each for this model); usage is at
modelscope.ai/magicube/usage.

## Hedging Slow Gemini Calls

When a fallback is configured, a Gemini call that has not answered within `gemini.hedgeAfterMs` (5 s, `0` disables)
is started on the fallback as well, and whichever answers first is what the user sees — a call that fails is out of
the race, not the winner, so a fast-failing ModelScope call never costs the turn its still-running Gemini call. If
both sides fail, the turn fails with Gemini's own error, as it would without hedging. A hedge win does **not** arm
the sticky window, so the next turn still tries Gemini. Each hedged call costs one extra ModelScope call.

```bash
# Hedged calls, and which model won each one
sudo docker logs rokabot-roka-1 2>&1 | grep '"msg":"Hedged slow Gemini call; kept the faster answer"'

# How often the hedge is winning, against how many turns it fired on
sqlite3 data/rokabot.db "SELECT model, COUNT(*) FROM response_events WHERE hedged = 1 GROUP BY model"
```

Tuning: raise `hedgeAfterMs` to hedge fewer calls (cheaper, but a longer tail), lower it to hedge more (a shorter
tail, more ModelScope spend). If a turn carried an audio clip, a video or a PDF, no hedge is possible — the fallback
cannot read those — so those turns only ever wait out `gemini.timeout`.

---

## Jev Judgments and Passive Memory

Jev tone and referent judgments can run in `off`, `shadow` or `on` mode. Passive memory uses Jev admission and
verification as hard gates: an unavailable client, timeout, or low admission score drops the episode before Gemini
extraction. Without `TYPESAFE_API_KEY`, startup logs `Passive memory extraction is disabled: no TypeSafe API key`
once, and passive episodes are dropped. Set `jev.memoryTimeoutMs`, `memory.admitThreshold` and
`memory.verifyThreshold` in `config.yml` through a PR.

Guild facts are scoped to their Discord server. `upcoming_event` and `plan` claims store `expires_at` as epoch
milliseconds for the first instant of the next local day, using `config.timezone` (or the `TZ` override). A daily prune
changes expired active guild claims to `rejected`. Startup and daily prunes hard-delete rejected and superseded claims,
plus their evidence, after `memory.deadClaimRetentionDays` (30 days from `ended_at`). `/stats` includes active,
unexpired guild facts in memory totals and growth, while its remembered-member list remains user-only. The read-only
vault export writes each guild's active, unexpired facts to `<vault>/<guildId>/guild.md` and includes `expires_at` on
dated facts.

The replay at hour 14:00 covered 77 turns (51 production-history and 26 transcript turns); Jev chose `playful` on
52/77. Regex-fired turn agreement was 14% at cutoff 0. At cutoff 0.85, 19/77 turns met the probability threshold
(25% coverage); 10 had a regex rule and Jev agreed on 60%. This does not meet the replay support rule, so
`jev.toneMinProbability` is `0.85` and `jev.tone` remains `shadow`. Regex agreement is a comparator, not ground-truth
accuracy. Shadow judgments are persisted with `applied = 0` for later review. The replay command requires
`TYPESAFE_API_KEY`.

```bash
npm run replay:jev -- data/rokabot.db --max-turns 100
```

Review recent persisted tone judgments without message text or member IDs:

```sql
SELECT created_at,
       baseline,
       json_extract(answer, '$.tone') AS jev_tone,
       probability,
       confidence,
       applied,
       latency_ms,
       input_tokens
FROM jev_events
WHERE kind = 'turn'
ORDER BY created_at DESC
LIMIT 20;
```

`jev.prefetch` ships as `shadow`. Jev asks whether a turn needs lookup, but Tavily is not called. Review the persisted
score and outcome without storing or displaying the message text:

```sql
SELECT created_at,
       json_extract(question, '$.prefetch') AS prefetch_mode,
       json_extract(answer, '$.needsLookup') AS needs_lookup,
       json_extract(answer, '$.prefetchStatus') AS prefetch_status,
       json_extract(answer, '$.tone') AS jev_tone,
       probability,
       applied,
       latency_ms
FROM jev_events
WHERE kind = 'turn'
ORDER BY created_at DESC
LIMIT 20;
```

`shadow_would_fire` means the score met `jev.prefetchMinNoul`, but no search ran. `ready` means a search result was
obtained for the first prompt (the safety ladder may later drop it). `off`, `below_threshold`, `no_noul` and
`no_judgment` explain why no prefetch was started; `failed`, `empty`, `aborted`, `canceled` and `gave_up` describe a
prefetch that supplied no result. At most one automatic Tavily search starts per turn; Gemini can still call the
existing `search_web` tool if the prefetched results are thin or off-topic. The automatic prefetch uses no Gemini RPM
slot.

Keep `jev.prefetch` in `shadow` while reviewing these rows. Switching it to `on` should be a reviewed `config.yml`
change through a PR.

To switch an in-reply feature, set `JEV_TONE` or `JEV_REFERENTS` to `off`, `shadow` or `on` in `~/rokabot/.env` and
recreate the container (`sudo docker compose -f ~/rokabot/docker-compose.yml up -d`). The memory judgments are not
shadow modes and cannot be disabled independently of passive extraction. Prefetch can be switched with `JEV_PREFETCH`.

After an authorized deployment of the unawaited typing change, compare `Response completed`'s `e2e_ms - generate_ms`
before and after. The supplied baseline is p50 1.06 s and p95 2.2 s; removing the initial typing wait should lower
the difference by about one Discord REST round trip. Record the sample count and time window; unit tests do not
measure this production effect.

Memory admission and verification totals are retained in `jev_events`; the table stores judgment metadata, not source
message text:

```bash
sqlite3 ~/rokabot/data/rokabot.db "SELECT kind, question, applied, COUNT(*) AS events,
  ROUND(AVG(probability), 3) AS avg_probability,
  ROUND(AVG(latency_ms), 1) AS avg_latency_ms,
  SUM(input_tokens) AS input_tokens
  FROM jev_events
  WHERE kind IN ('admission', 'verification')
  GROUP BY kind, question, applied
  ORDER BY kind, question, applied;"
```

Admission uses the `lasting_fact` question. Verification questions are `durable_N`, `attributed_N` and `same_as_N_M`.
`applied = 0` means no corresponding operation or duplicate-evidence update was applied; an operation can be blocked
by its threshold or by operation rules. An exact re-sighting of an active value appends evidence after durability and
attribution pass even when its `same_as_N_M` score is below threshold.

## GitHub Actions Self-Hosted Runner

The Pi runs a self-hosted GitHub Actions runner that auto-deploys on push to `main`. The workflow (`.github/workflows/deploy.yml`) pulls latest code, rebuilds Docker, and runs a health check.

### Setting Up the Runner on a New Device

1. Go to https://github.com/AlaskanTuna/rokabot/settings/actions/runners/new
2. Copy the registration **token** (expires in 1 hour)
3. On the Pi:

```bash
# Download runner (ARM64)
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -sL https://github.com/actions/runner/releases/latest/download/actions-runner-linux-arm64-2.333.0.tar.gz | tar xz

# Register (paste your token)
./config.sh --url https://github.com/AlaskanTuna/rokabot --token <YOUR_TOKEN> --name rokabot-pi --labels self-hosted,linux,arm64 --unattended

# Install and start as systemd service
sudo ./svc.sh install $USER
sudo ./svc.sh start
```

4. Verify: push to `main` and check https://github.com/AlaskanTuna/rokabot/actions

### Managing the Runner

```bash
# Check status
sudo systemctl status actions.runner.AlaskanTuna-rokabot.rokabot-pi --no-pager

# View logs
sudo journalctl -u actions.runner.AlaskanTuna-rokabot.rokabot-pi -n 30 --no-pager

# Restart
sudo systemctl restart actions.runner.AlaskanTuna-rokabot.rokabot-pi

# Uninstall (if moving to a different device)
cd ~/actions-runner && sudo ./svc.sh stop && sudo ./svc.sh uninstall
./config.sh remove --token <NEW_TOKEN>
```

### How It Works

- The runner polls GitHub outbound (works through any NAT/WiFi)
- On push to `main`, GitHub assigns the deploy job to the runner
- Runner executes: `git pull` → `docker compose up -d --build` → health check
- Results visible at https://github.com/AlaskanTuna/rokabot/actions
- If the build fails, the old container keeps running (no automatic rollback)

---

## SQLite Database

DB location: `~/rokabot/data/rokabot.db`

### Memory Claims and Extraction Queue

```bash
# Recent active claims; expires_at is Unix epoch milliseconds when set
sqlite3 ~/rokabot/data/rokabot.db "SELECT id, guild_id, subject_kind, subject_user_id, predicate, value,
  expires_at, needs_review, first_seen_at, last_seen_at
  FROM memory_claim WHERE status='active' ORDER BY last_seen_at DESC LIMIT 100;"

# Claims for a user in one guild
sqlite3 ~/rokabot/data/rokabot.db "SELECT id, predicate, value, status, needs_review, last_seen_at, ended_at, end_reason
  FROM memory_claim WHERE guild_id='GUILD_ID' AND subject_kind='user' AND subject_user_id='USER_ID'
  ORDER BY last_seen_at DESC;"

# Active claims by guild and subject
sqlite3 ~/rokabot/data/rokabot.db "SELECT guild_id, subject_kind, subject_user_id, COUNT(*) AS active_claims
  FROM memory_claim WHERE status='active' GROUP BY guild_id, subject_kind, subject_user_id
  ORDER BY active_claims DESC;"

# Queue backlog by status; failed rows are retained for inspection
sqlite3 ~/rokabot/data/rokabot.db 'SELECT status, COUNT(*) AS jobs FROM extraction_queue GROUP BY status;'
```

Use the bot's `forget_user` tool to retract a claim. It sets `status='rejected'`, `ended_at`, and
`end_reason='forgotten'`; the claim and evidence remain for `memory.deadClaimRetentionDays` (30 days) before the next
prune deletes them. A passive sighting cannot restore a forgotten value; `remember_user` can explicitly restore and pin it.

### Episodic Memory

Episode summaries and 768-dimensional embeddings are stored by guild in `memory_episode`. Embedding requests use
`GEMINI_API_KEY` and `memory.embeddingModel` (`gemini-embedding-2`); they consume a separate project quota from text
generation. For planning only, the spec's free-tier estimate is 100 RPM, 30 K TPM, and 1 K RPD; check AI Studio for
your project's current limits. Embedding requests do not debit the bot's generation rate limiter. The daily
maintenance pass deletes episodes past `memory.episodeRetentionDays` and retries rows with missing or unreadable
embeddings.

```bash
# Episode counts by guild
sqlite3 ~/rokabot/data/rokabot.db 'SELECT guild_id, COUNT(*) AS episodes FROM memory_episode GROUP BY guild_id ORDER BY guild_id;'
```

### Memory V2 Migration

Run this explicit migration only with the bot stopped, from a repository checkout with Node.js 24 and dependencies
installed. The commands below first back up the whole SQLite database. The migration checks that every legacy row has
a matching claim in a legal scope, reports the top active claims before and after capacity eviction, and drops the
legacy table only if the check succeeds. An incomplete backfill exits with an error and leaves `user_memory` intact.
Startup never invokes this migration.

```bash
cd ~/rokabot
sudo docker compose stop roka
sqlite3 data/rokabot.db '.backup data/rokabot.db.pre-memory-v2'
ROKABOT_DB_PATH="$PWD/data/rokabot.db" npm run migrate:memory-v2
```

Review the migration report and the backup before restarting the bot. If the backfill check passed, restart it with
`sudo docker compose up -d roka`. Do not delete `user_memory` manually.

### Reminders

```bash
# Pending reminders (with local time)
sqlite3 ~/rokabot/data/rokabot.db "SELECT id, user_id, reminder, datetime(due_at/1000, 'unixepoch', '+8 hours') as due_local FROM reminders WHERE delivered=0;"

# All reminders (last 20)
sqlite3 ~/rokabot/data/rokabot.db 'SELECT * FROM reminders ORDER BY created_at DESC LIMIT 20;'

# Delete a reminder
sqlite3 ~/rokabot/data/rokabot.db 'DELETE FROM reminders WHERE id=ID;'
```

### Session History

```bash
# Recent messages (last 20)
sqlite3 ~/rokabot/data/rokabot.db "SELECT channel_id, display_name, role, substr(content, 1, 80) as preview FROM session_history ORDER BY timestamp DESC LIMIT 20;"

# Messages from a specific channel
sqlite3 ~/rokabot/data/rokabot.db "SELECT display_name, role, content FROM session_history WHERE channel_id='CHANNEL_ID' ORDER BY timestamp DESC LIMIT 10;"

# Message count per channel
sqlite3 ~/rokabot/data/rokabot.db 'SELECT channel_id, COUNT(*) as msgs FROM session_history GROUP BY channel_id ORDER BY msgs DESC;'

# Clear history for a channel
sqlite3 ~/rokabot/data/rokabot.db "DELETE FROM session_history WHERE channel_id='CHANNEL_ID';"
```

### Buddy Pets

```bash
# All buddies
sqlite3 ~/rokabot/data/rokabot.db 'SELECT id, user_id, species, rarity, name, shiny FROM buddy ORDER BY hatched_at DESC;'

# Buddies for a specific user
sqlite3 ~/rokabot/data/rokabot.db "SELECT id, species, rarity, name, shiny, stats_json FROM buddy WHERE user_id='USER_ID';"

# Collection count per user
sqlite3 ~/rokabot/data/rokabot.db 'SELECT user_id, COUNT(*) as pets FROM buddy GROUP BY user_id ORDER BY pets DESC;'

# Daily hatch status and streaks
sqlite3 ~/rokabot/data/rokabot.db 'SELECT * FROM gacha_daily;'
```

### Game Scores

```bash
# Recent scores (with local time)
sqlite3 ~/rokabot/data/rokabot.db "SELECT user_id, game, score, datetime(played_at/1000, 'unixepoch', '+8 hours') as played FROM game_scores ORDER BY played_at DESC LIMIT 20;"

# Leaderboard by game
sqlite3 ~/rokabot/data/rokabot.db "SELECT user_id, SUM(score) as total, COUNT(*) as games FROM game_scores WHERE game='hangman' GROUP BY user_id ORDER BY total DESC;"
```

### Failure Diagnostics

Forensic detail for turns that fell back or deflected. Holds the triggering message verbatim, so it is
pruned on a shorter window than the other metrics tables (`metrics.diagnosticsRetentionHours`, default 72h).

```bash
# Recent failures, newest first
sqlite3 ~/rokabot/data/rokabot.db "SELECT datetime(created_at/1000,'unixepoch','+8 hours') t, outcome, kind, failure_marker, block_side, safety_rungs_used FROM failure_diagnostics ORDER BY created_at DESC LIMIT 20;"

# Did Gemini reject the input or Roka's own output?
sqlite3 ~/rokabot/data/rokabot.db "SELECT block_side, COUNT(*) FROM failure_diagnostics WHERE kind='safety' GROUP BY block_side;"

# What was actually sent when a turn was blocked
sqlite3 ~/rokabot/data/rokabot.db "SELECT datetime(created_at/1000,'unixepoch','+8 hours') t, tone, image_count, overheard_chars, history_depth, fact_entries, user_message FROM failure_diagnostics WHERE kind='safety' ORDER BY created_at DESC LIMIT 5;"

# How far the ladder got on turns it could NOT rescue.
# This table only records failures, so every row here is a ladder that ran out of rungs.
sqlite3 ~/rokabot/data/rokabot.db "SELECT safety_rungs_used, COUNT(*) FROM failure_diagnostics WHERE kind='safety' GROUP BY safety_rungs_used;"
```

Rescues are the turns that never reach this table. To count them, compare the deflection rate in
`response_events` before and after, or read the per-rung log line from the container:

```bash
# Each rung the ladder took; a turn logging these with no matching deflection was rescued
sudo docker logs rokabot-roka-1 2>&1 | grep 'de-escalating carried context'
```

### Database Overview

```bash
# List all tables
sqlite3 ~/rokabot/data/rokabot.db '.tables'

# DB file size
ls -lh ~/rokabot/data/rokabot.db

# Schemas for memory tables
sqlite3 ~/rokabot/data/rokabot.db '.schema memory_claim'
sqlite3 ~/rokabot/data/rokabot.db '.schema extraction_queue'
sqlite3 ~/rokabot/data/rokabot.db '.schema jev_events'
```

### Dangerous Operations

```bash
# Full DB wipe (stop bot first, it recreates on restart)
cd ~/rokabot && docker compose stop
rm -f data/rokabot.db data/rokabot.db-wal data/rokabot.db-shm
docker compose up -d
```

> **Note:** `+8 hours` in datetime queries is for Asia/Singapore (UTC+8). Adjust for your timezone.

---

## Network Config Files

| File                              | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `/etc/netplan/50-cloud-init.yaml` | Network config (eth0 static IP, WiFi)      |
| `/etc/dnsmasq.d/rokabot.conf`     | DHCP server config for Ethernet + AP       |
| `~/rokabot/.env`                  | Bot secrets (Discord token, API keys)      |
| `~/rokabot/config.yml`            | Bot tunables (model, timeout, rate limits) |
| `~/rokabot/data/rokabot.db`       | SQLite database (sessions, memory, games)  |

---

## Discord Install Requirements

### The `bot` Scope Is Load-Bearing

A guild install must request **both** `bot` and `applications.commands`.

Requesting only `applications.commands` produces an install with **no bot member**: the app registers its slash commands and nothing else. There are no gateway events, so mention, reply and name-keyword triggers never fire and reactions never appear. `/ask` still works, which is what makes this failure so quiet — the bot looks half-alive rather than broken.

This was the Portal's actual state until 2026-08-01. Nothing was ever observed to be wrong because the existing server install predates the Discord-provided link and was made with a hand-built OAuth URL.

### Guild Permissions Are Derived From the API Surface

The permission set is not a preference. Every bit traces to a Discord API call this bot actually makes, so the current set can always be re-derived by grepping for the operations below. Files are named; **line numbers deliberately are not** — they rot, and the citation list this section replaces had already drifted before it was written down.

| Discord Operation                          | Where                                                                                                           | Permission Implied               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| receiving `messageCreate` at all           | gateway intents in `src/discord/client.ts`                                                                      | View Channels                    |
| `message.reply(...)` / `channel.send(...)` | `src/discord/events/messageCreate.ts`, `src/discord/events/gameCommands.ts`, `src/discord/reminderScheduler.ts` | Send Messages                    |
| `channel.messages.fetch(...)`              | `src/discord/events/messageCreate.ts` — resolving the referenced message on a reply trigger                     | Read Message History             |
| `message.react(...)`                       | `src/discord/events/messageCreate.ts`                                                                           | Add Reactions                    |
| `AttachmentBuilder` on the reply           | `src/discord/events/stats/views.ts` — the `/stats` chart PNGs                                                   | Attach Files                     |
| _none today_                               | no `EmbedBuilder` and no `embeds:` anywhere in `src/`                                                           | Embed Links — see the note below |

**Embed Links is granted but unused.** Components V2 messages carry no embeds and bare URLs stay clickable without it. It is pre-granted for the hyperlink-footnote work in issue #19, which would introduce masked links.

**Reminders need guild Send Messages.** `src/discord/reminderScheduler.ts` delivers to the originating **channel** first and only falls back to a user DM when that channel is unreachable — the module docstring says "delivers due reminders to Discord channels". A reading of this file that sees only the DM path will under-derive the permission set.

### There Is No Build-Time Pin, and That Is Deliberate

The permission set lives in the Discord Developer Portal, outside this tree, where no test can reach it. So unlike every other constraint in this repo, this one is stated rather than enforced, and it can drift silently.

A test that walks `src/` for Discord operations and asserts they match a declared list was considered and **rejected**: it would pin our list against our own grep, not against the Portal — which is where the value actually lives and where the drift actually happens. That is the "passes for the wrong reason" failure mode, and buying a green check for it would be worse than the honest gap.

The mitigation is the derivation above, not a pin. If you change what Discord APIs this bot calls, re-derive the set and update the Portal.
