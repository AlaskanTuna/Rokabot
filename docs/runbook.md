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

# Which model watches videos: gemini (default) or qwen (ModelScope frames); the other is the backup.
# Set MEDIA_WATCHER=qwen in ~/rokabot/.env and recreate the container to switch (direct and off: see Kill Switch).
docker logs rokabot-roka-1 2>&1 | grep '"msg":"Watched media"' | grep -o '"watcher":"[a-z]*"' | sort | uniq -c

# Logs from before the last deploy (each deploy archives the outgoing container's logs; kept 30 days)
ls ~/rokabot/logs/
zcat ~/rokabot/logs/roka-<timestamp>.log.gz | grep '"msg":"Watched media"'

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

## Social Post Viewing

The runtime image includes the official yt-dlp musl onedir build (`yt-dlp_musllinux_aarch64.zip` on the Pi, `yt-dlp_musllinux.zip` on amd64), unpacked to `/opt/yt-dlp` and linked as `/usr/local/bin/yt-dlp`. The single-file build is avoided because it unpacks itself on every run, which cost the Pi 0.6-1.4 s per lookup (YouTube metadata: 3.5 s single-file, 2.1 s onedir). To update it, check the latest stable release at the [yt-dlp releases page](https://github.com/yt-dlp/yt-dlp/releases), then update `YTDLP_VERSION`, `YTDLP_AMD64_SHA256`, and `YTDLP_ARM64_SHA256` in `Dockerfile` with the `.zip` entries from that release's `SHA2-256SUMS`; the image build verifies both the checksum-file entry and the downloaded zip. Rebuild and deploy the image through the normal release process.

To disable social post viewing, set `SOCIAL_POSTS_ENABLED=false` in the bot container environment. The bot keeps its existing embed and attachment behavior. X and Bluesky use public APIs and Threads reads its public post page; disabling yt-dlp at startup leaves those three platforms available.

Lookup failures are logged as `Social post lookup failed` with only `platform` and `reason`. YouTube can refuse yt-dlp from the Pi's home IP (`exit_1`; run yt-dlp by hand in the container to see `HTTP Error 429` / `Sign in to confirm you're not a bot`); those links fall back to YouTube oEmbed (title, channel, thumbnail) and only log a failure when oEmbed fails too. If yt-dlp is absent during startup, the log says `Social video extractors disabled` with reason `binary_missing`; YouTube, TikTok, Reddit, Instagram, and Bilibili lookups then receive the normal “could not be opened” marker. A Threads `no_post_data` means the post page came back without its rendered post: the post is private or deleted, or Threads changed what it renders for a logged-out browser request (check the headers in `src/discord/socialPosts/threads.ts`).

## Media Watching

Audio, video and YouTube links are watched by one separate Gemini call before Roka replies (contract in `docs/trd.md`, Media Watching). Each watch logs one `Watched media` line:

```bash
docker logs rokabot-roka-1 2>&1 | grep '"msg":"Watched media"' | tail -20
```

- **Fields:** `kind` (audio/video), `transport` (`inline` upload, `files` streamed upload or `uri` YouTube), `mode` (`whole`, `halves`, `skim`, `focus`, `opening`, `decline`), `durationSec`, `fps`, `estimate` (admission tokens), `promptTokens` (billed), `watchMs`, `calls`, `outcome` (`ok`, `overloaded`, `timeout`, `unavailable`, `invalid`, `error`).
- **Expected Latency:** about 2.5-3.5 s for short clips and 8-9 s for a 12-minute YouTube video (measured from a workstation, 2026-10-08), on top of the normal reply.
- **Large Uploads:** audio and video over their inline cap (8 MiB audio, 10 MiB video) and up to 50 MiB are streamed into the Gemini Files API, watched whole, then deleted. A 21.6 MB MP4 took 12-13 s to stream and become ready plus 9-13 s to watch (workstation, 2026-10-08); on the Pi's 2.5 MB/s uplink, budget about 20 s of upload for 50 MB. `media.uploadTimeoutMs` (45 s) bounds the upload. To confirm nothing is left behind: `curl -s "https://generativelanguage.googleapis.com/v1beta/files" -H "x-goog-api-key: $GEMINI_API_KEY"` should list no files between turns.
- **Long Videos:** 20-40 minute videos are watched in two parallel halves (`mode: halves`, `calls: 2`) when the token bucket has room; otherwise they are skimmed. A 39:49 talk took 6-11 s and about 68,000 tokens (workstation, 2026-10-08). `outcome: partial` means one half failed and only the other half's notes were kept.
- **`invalid` Outcomes:** the watcher's JSON did not parse or validate. A run of them on long, dense videos means the answer is hitting `media.digestMaxOutputTokens`; raise it within its bounds (400-4,000).
- **Linked Videos:** X, Bluesky, Threads, TikTok, Reddit, Instagram and Bilibili posts are watched from their smallest playable MP4 when it passes the HEAD check and fits 50 MiB (above 10 MiB it is streamed like a large upload). Otherwise the post's thumbnail is used. Reddit videos have no muxed sound, so they are watched silent and say so. Bluesky needs one extra `plc.directory` lookup per author, cached.
- **YouTube Limits:** Gemini fetches YouTube links itself, so the Pi's IP block on yt-dlp does not apply. The free tier allows 8 hours of YouTube video per day; past that, watches fail and Roka says she couldn't watch it.
- **Qwen Watcher:** with `MEDIA_WATCHER=qwen`, or as the backup when Gemini fails, lines carry `watcher: qwen`, `frames` and `transcript` (the sidecar's `engine` and `speechSec`, or why there was none: `disabled`, `no_audio`, `timeout`, `unreachable`, `http_<status>`), plus `framesMs` and `transcribeMs` (when each finished, from the start of the watch), `watchMs` (the Qwen call alone) and `totalMs` (the whole watch). A 76 s Instagram reel measured 4.4 s of frames, 31.6 s of transcription (Moonshine on the Pi, the bottleneck) and 15.5 s of Qwen (2026-10-09). It costs one ModelScope call per watch. Videos up to 64 s get 16 frames and longer ones up to 32 (`media.qwen.*Frames`). The Pi takes 4 frames at a time: 32 frames took about 5 s from X's CDN and 42–50 s from a slow host like archive.org (2026-10-09), where the four transcription windows of a 10-minute video took 35–37 s alongside.
- **Speech Sidecar:** the `asr` container transcribes audio for the Qwen watcher (Silero VAD, then Moonshine for English and SenseVoice for zh/ja/ko/yue). It has no published port; the bot reaches it at `http://asr:8000`. The first build downloads about 500 MB of models. It holds about 1.2 GB of RAM and is capped at 2 GB and 3 CPUs, and an out-of-memory restart takes down only it: the bot then watches from frames alone (`transcript: unreachable`).

```bash
docker compose -f ~/rokabot/docker-compose.yml logs --tail 20 asr   # one line per transcription: duration, speechSec, language, engine, elapsed
docker inspect --format '{{.State.Health.Status}}' rokabot-asr-1    # healthy once the models have loaded (up to 2 minutes)
```

- **Kill Switch:** set `MEDIA_WATCHER=direct` in `~/rokabot/.env` and recreate the bot container to send audio and video to the reply model directly, with no watcher and no backup, or `MEDIA_WATCHER=off` to neither watch nor send them (Roka says she can't watch it right now). To stop only the transcription, set `MEDIA_TRANSCRIBER_URL=` in `~/rokabot/.env` and recreate the bot container; the Qwen watcher then sees frames only.

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
changes expired active guild claims to `rejected`. Relative dates use the local date of the latest episode message;
passive claim and evidence timestamps use that message time, falling back to the current time only when no message
timestamp is available. Startup and daily prunes hard-delete rejected and superseded claims,
plus their evidence, after `memory.deadClaimRetentionDays` (30 days from `ended_at`). `/stats` includes active,
unexpired guild facts in memory totals and growth, while its remembered-member list remains user-only. The read-only
vault export writes each guild's active, unexpired facts to `<vault>/<guildId>/guild.md` and includes `expires_at` on
dated facts.

`jev.tone` is `on` with `jev.toneMinProbability: 0.3`. The threshold comes from 163 production turns judged in shadow
between 2026-09-25 and 2026-10-07, each labeled blind by two independent model labelers with the moods that would make
a fitting reply. Agreement with the regex detector was the earlier support rule, but the regex is what tone replaces
(it fired `playful` on 67% of turns), so it was dropped as a target. Results:

| Labels                 | Regex Tone Fits | Jev Tone Fits | CJK Turns (n=24): Regex / Jev |
| ---------------------- | --------------- | ------------- | ----------------------------- |
| Labeler A              | 48%             | 75%           | 46% / 67%                     |
| Labeler B              | 36%             | 46%           | 33% / 54%                     |
| Either labeler accepts | 56%             | 80%           | 54% / 75%                     |
| Both labelers accept   | 28%             | 41%           | 25% / 46%                     |

Jev matched or beat the regex in every probability band from 0.3 up for both labelers. A higher cutoff only handed
turns back to the worse detector: at the old 0.85, the overall fit fell from 80% to 60% (either-labeler). Below 0.3
there was a single turn, so 0.3 is the floor. A judgment with no probability, a timeout or an error keeps the regex tone.
Known weakness: Jev picks `sleepy` for late-night turns more readily than the labelers did (they accepted 10–15 of its
32 `sleepy` picks), so watch `sleepy` in the query below. The labeled data stays local because it carries message text.
Re-run the regex comparator with `TYPESAFE_API_KEY`:

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

`jev.prefetch` stays `shadow`. Jev asks whether a turn needs lookup, but Tavily is not called. Review the persisted
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

Production shadow rows (2026-09-25 to 2026-10-07) show the judgment itself is sound: at `jev.prefetchMinNoul` 0.7 it
fired on 10 of 242 turns, and Gemini searched on 8 of those. Turning prefetch `on` still lost a live A/B on the
`search-web` tool-trigger cases (3 trials each, harness Gemini key, real Tavily and Jev):

| Metric                              | `shadow`       | `on`            |
| ----------------------------------- | -------------- | --------------- |
| Search recall on should-search      | 17/18          | 14/18           |
| False searches on should-not-search | 0/18           | 0/18            |
| Should-search `generateMs` p50/p95  | 9.3 s / 20.2 s | 13.5 s / 28.5 s |
| Mean model calls on should-search   | 2.17           | 1.89            |
| Prefetches fired / injected         | 0 / 0          | 20 / 0          |

Every prefetch was aborted at `jev.prefetchWaitMs` (4 s) before injection. The Jev judgment plus a Tavily search at
`search_depth: advanced` (3.4–4.1 s, and basic depth is a measured quality regression, #19) does not fit in front of
the first Gemini call, so `on` adds the wait and then searches again. Re-run the A/B before switching:

```bash
npm run measure:prefetch -- --live --prefetch off --out /tmp/prefetch-off.json
npm run measure:prefetch -- --live --prefetch on --out /tmp/prefetch-on.json
```

To switch an in-reply feature, set `JEV_TONE` or `JEV_REFERENTS` to `off`, `shadow` or `on` in `~/rokabot/.env` and
recreate the container (`sudo docker compose -f ~/rokabot/docker-compose.yml up -d`). The memory judgments are not
shadow modes and cannot be disabled independently of passive extraction. Prefetch can be switched with `JEV_PREFETCH`.

Starting the Jev judgment at handler entry and no longer awaiting typing (#220) cut the Discord-side overhead,
`e2e_ms - generate_ms` on `ok` turns in `response_events`, from p50 1,084 ms / p95 2,344 ms (429 turns, 2026-07-22 to
2026-09-24) to p50 576 ms / p95 1,500 ms (242 turns, 2026-09-25 to 2026-10-07).

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

Admission uses the `lasting_fact` question. Verification questions are `durable_N`, `attributed_N` (`guild_scoped_N` for
server facts), `current_N`, `past_N`, `changes_N`, `same_as_N_M` and `retracts_N_M`.
`applied = 0` means no corresponding operation or duplicate-evidence update was applied; an operation can be blocked
by its threshold or by operation rules. An exact re-sighting of an active value appends evidence after durability and
attribution pass even when its `same_as_N_M` score is below threshold.

## Memory Extraction Funnel

Every extraction attempt writes one `memory_events` row with `kind = 'extraction_run'`. Its `detail` column is JSON
holding the stage reached, the outcome, Jev's admission probability, operation counts and per-stage timings, never
message text (field list: `docs/trd.md`, Extraction Run Trace). A job that fails and is retried leaves one row per attempt. Rows are
pruned with the other metrics after `metrics.retentionDays`. Run the queries below with
`sqlite3 ~/rokabot/data/rokabot.db`; `created_at` is epoch milliseconds.

`stage` is the furthest stage reached (`precheck`, `admission`, `extraction`, `verification` or `applied`). `outcome`
is how the attempt ended: `trivial` and `sensitive` are local precheck drops, `below_threshold` is a Jev admission
rejection, `jev_unavailable` is an admission Jev couldn't judge (it is retried once), `noop` and `written` are
completed extractions, and `error` is a failure (`errorClass` is `transient` or `permanent`). `errorClass: unjudged`
appears only with `outcome: 'jev_unavailable'`, never with `error`.

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
```

The first query shows where conversations stop. The second shows how close rejected conversations sat to
`memory.admitThreshold`: a pile-up just under the threshold suggests it is too strict. A job in the fourth query
ending in `> written` or `> noop` was recovered by a retry; one ending in `> error` was not. `ops.applied` (and
`n_selected`) includes staged candidates, so `ops.staged` is a subset of it and active writes are `applied - staged`;
`ops.dropped` counts operations that were neither applied nor duplicates, so it excludes staged ones.
`ops.past` counts verified operations written as past facts ("used to be a nurse"), `ops.reword` updates that only
restated a fact and became evidence on the existing claim, and `ops.retracted` the claims a retraction retired. It
counts claims, not operations, and includes facts the extractor could not see (hidden-fact reconciliation, under
`balanced` and `strict` only), so a run that only retired hidden facts has `ops.applied` of 0 and is still `written`.
`summary.boilerplate` marks summaries that only say no new durable fact came up.

Admission and verification judgments carry the job ID in `jev_events.job_id` (turn judgments leave it null), so one
run's judgments are `SELECT kind, question, probability, applied FROM jev_events WHERE job_id = <jobId>;`.

### Rejected-Conversation Sample

To measure Jev's false negatives, about 1 in 10 `trivial` or `below_threshold` conversations is kept as text in
`extraction_samples` (`memory.extractionSampleRate: 0.1`). Each row has the job ID, guild, channel, outcome, admission
probability and the episode's lines as a JSON array of `[displayName]: content` strings, with no user IDs. Nothing is
stored for `sensitive` conversations or `jev_unavailable` runs, or when `memory.privacy` is `off`. Rows expire after
`memory.extractionSampleDays` (14 days) and are deleted at startup and daily (lowering the setting also removes stored
rows older than the new value), and the table holds at most 200 rows (the oldest is replaced). Nothing reads it back:
not Roka, recall, Jev or any prompt. To stop sampling, set `memory.extractionSampleRate` to 0 through a PR, or
`MEMORY_EXTRACTION_SAMPLE_RATE=0` in `~/rokabot/.env` and recreate the container.

For blind labelling, export once to the session scratchpad, never into the repo, then split the export: the judges get
only the ID and the lines, and the key file with `outcome` and `admission_probability` stays away from them. Splitting
one export keeps both files from the same snapshot, so the labels still join back by `id` if rows expire or are replaced
before labelling ends:

```bash
ssh <pi-user>@<pi-ethernet-ip> 'sqlite3 -json ~/rokabot/data/rokabot.db "SELECT id, outcome, admission_probability, lines FROM extraction_samples ORDER BY id;"' \
  > <session-scratchpad>/extraction-samples-full.json
jq 'map({id, lines})' <session-scratchpad>/extraction-samples-full.json > <session-scratchpad>/extraction-samples.json
jq 'map({id, outcome, admission_probability})' <session-scratchpad>/extraction-samples-full.json > <session-scratchpad>/extraction-sample-keys.json
rm <session-scratchpad>/extraction-samples-full.json
```

Give the judges only `extraction-samples.json`, and join their labels to `extraction-sample-keys.json` by `id`
afterwards. Have two independent judges label each sample for whether it holds a lasting personal or server fact, the
same method as the Jev tone calibration above. The labels carry message text, so they stay local and are never
committed. The share both judges accept is a conservative estimate of the rejected conversations that did hold a
lasting fact.

## Memory Reclassification

A background step moves facts filed under the wrong predicate, mostly `misc`, to the right one. It runs at startup and
then daily, right after the claim prune, in the background. Gemini (`gemini.extractionModel`) proposes a predicate for
each candidate and Jev confirms it; a move needs a probability of at least `memory.verifyThreshold`. Candidates are
active current `misc` facts and the weaker side of any pair of facts one member filed twice, with equal values, under
different predicates. Past facts are never touched. Each run makes at most one Gemini call and one Jev call, and none
when nothing is a candidate. A moved fact keeps its pin, evidence and first-seen time, and the old row stays as a
`reclassified` record.

- **Cap:** `memory.reclassifyMaxPerRun` (20) is the most moves per run, bounded 0–100. Set it to 0 to turn the step off:
  `MEMORY_RECLASSIFY_MAX_PER_RUN=0` in `~/rokabot/.env`, then recreate the container
  (`sudo docker compose -f ~/rokabot/docker-compose.yml up -d`). It never runs under `memory.privacy: off`.
- **Logs:** each run logs `Reclassified misfiled memory facts` with the counts `candidates`, `proposed`, `confirmed`
  and `moved`. Problems log `Reclassification proposal failed`, `Reclassification confirmation failed`,
  `Memory reclassification failed` or `Skipped a reclassification`. The last is a single move that failed and was
  rolled back. It carries the claim ID, both predicates and the reason, never the fact's value. The reason is one of
  `Claim is not active`, `Claim is already filed there`, `Target fact is not active` (the value under the new predicate
  could not be made active), `Claim value is unsafe` (the value failed the safety check) or `Move would retire another
fact` (the member would have lost a different active fact).
- **Audit:** every move writes a `claim_reclassified` event. It holds claim IDs, both predicates and the Jev
  probability, never values. `created_at` is epoch milliseconds, and `old_id` is the ID the undo command takes.

```sql
SELECT created_at, json_extract(detail, '$.oldId') AS old_id, json_extract(detail, '$.newId') AS new_id,
       json_extract(detail, '$.from') AS from_predicate, json_extract(detail, '$.to') AS to_predicate,
       json_extract(detail, '$.probability') AS probability
FROM memory_events WHERE kind = 'claim_reclassified' ORDER BY created_at DESC LIMIT 20;
```

Run it with `sqlite3 ~/rokabot/data/rokabot.db`. After the first deploy, expect a handful of moves, not dozens. To read
a move, look at both rows (this shows values, so it stays on the Pi):

```sql
SELECT id, predicate, value, status, end_reason, superseded_by, pinned
FROM memory_claim WHERE id IN (<old_id>, <new_id>);
```

### Undoing a Move

Undo reactivates the old row, and ends the replacement when the move created or revived it. The fact is then never
offered for reclassification again. It takes the old claim ID and prints `undone`, or `nothing to undo` when that row
was not reclassified or is already restored. It is one transaction, so the bot keeps running.

In production, run the compiled module inside the container. `scripts/` is not in the image and the image has no `tsx`,
so `npm run` is not available there. Replace `OLD_ID` with the `old_id` from the query above:

```bash
sudo docker compose -f ~/rokabot/docker-compose.yml exec roka node --input-type=module -e "
const { undoReclassify } = await import('./dist/agent/memory/reclassify.js')
const { closeDb } = await import('./dist/storage/database.js')
console.log(undoReclassify(OLD_ID) ? 'undone' : 'nothing to undo')
closeDb()
"
```

In a dev checkout, with `ROKABOT_DB_PATH` pointing at the database if it is not `data/rokabot.db`:

```bash
npm run memory:undo-reclassify -- OLD_ID
```

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

## Bug Reports

Users file reports with `/report` (servers, group DMs and DMs). List recent open reports on the Pi, where only
`sqlite3` is installed on the host:

```bash
sqlite3 -header -column ~/rokabot/data/rokabot.db "SELECT id, datetime(created_at / 1000, 'unixepoch') AS filed,
  type, context, user_id, substr(message, 1, 80) AS message, attachment_path IS NOT NULL AS saved
  FROM bug_reports WHERE status = 'open' ORDER BY id DESC LIMIT 20;"
```

For a full report with its parsed context snapshot, back up the database and read it from a development checkout:

```bash
ssh <pi-user>@<pi-ethernet-ip> "sqlite3 ~/rokabot/data/rokabot.db '.backup /tmp/rokabot-reports.db'"
scp <pi-user>@<pi-ethernet-ip>:/tmp/rokabot-reports.db ./data/rokabot-reports.db
npm run reports -- data/rokabot-reports.db --id 42
```

The command is read-only. Its syntax is `npm run reports -- [db] [--id N] [--status open] [--limit 20]`. Saved
attachment copies live in `~/rokabot/data/reports/`; unsaved attachments still have their metadata and failure reason
in `bug_reports`.

Mark a report resolved by replacing `42` with its report ID:

```bash
sqlite3 ~/rokabot/data/rokabot.db "UPDATE bug_reports SET status='resolved' WHERE id=42;"
```

Copy saved attachments from the Pi to the current directory:

```bash
scp -r <pi-user>@<pi-ethernet-ip>:~/rokabot/data/reports ./data/reports
```

## SQLite Database

DB location: `~/rokabot/data/rokabot.db`

### Memory Claims and Extraction Queue

```bash
# Recent active claims; expires_at is Unix epoch milliseconds when set
sqlite3 ~/rokabot/data/rokabot.db "SELECT id, guild_id, subject_kind, subject_user_id, predicate, value,
  expires_at, needs_review, first_seen_at, last_seen_at
  FROM memory_claim WHERE status='active' ORDER BY last_seen_at DESC LIMIT 100;"

# Claims for a user in one guild
sqlite3 ~/rokabot/data/rokabot.db "SELECT id, predicate, value, period, status, needs_review, last_seen_at, ended_at, end_reason
  FROM memory_claim WHERE guild_id='GUILD_ID' AND subject_kind='user' AND subject_user_id='USER_ID'
  ORDER BY last_seen_at DESC;"

# Active claims by guild and subject
sqlite3 ~/rokabot/data/rokabot.db "SELECT guild_id, subject_kind, subject_user_id, COUNT(*) AS active_claims
  FROM memory_claim WHERE status='active' GROUP BY guild_id, subject_kind, subject_user_id
  ORDER BY active_claims DESC;"

# Queue backlog by status; failed rows are retained until the expiry window
sqlite3 ~/rokabot/data/rokabot.db 'SELECT status, COUNT(*) AS jobs FROM extraction_queue GROUP BY status;'
```

Failed extraction payloads are deleted at startup and during daily maintenance after they are older than
`memory.failedExtractionRetentionDays` (7 days by default, measured from `enqueued_at`). An episode Jev couldn't judge at
admission is retried once after 5 minutes, then dropped; the `Memory episode pipeline failed` warning shows
`classification: "unjudged"` and `queueStatus: "dropped"` when that happens.

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

### Media Memory

Digests of media Roka watched in servers live in `media_digest`, one row per guild and content key, with an
embedding. Each share is a `media_occurrence` row. No media files are stored.

```bash
# Remembered media by guild, with how often each was shared
sqlite3 ~/rokabot/data/rokabot.db "SELECT d.guild_id, d.label, substr(d.summary, 1, 60), COUNT(o.id) AS shares, d.embedding IS NOT NULL AS embedded FROM media_digest d LEFT JOIN media_occurrence o ON o.digest_id = d.id GROUP BY d.id ORDER BY d.created_at DESC LIMIT 20;"
```

### Memory Privacy and Recall

`MEMORY_PRIVACY` (`relaxed`, `balanced`, `strict`, `off`) and `MEMORY_RECALL` (`legacy`, `shadow`, `unified`) override
`memory.privacy` and `memory.recall` in `config.yml`; set them in `~/rokabot/.env` and restart the container. A server
that shows no channel to `@everyone` and grants access through a member role has no public channels, so `balanced`
behaves like `strict` there.

- **Forget User:** the speaker can delete their own matching notes at every privacy level. At `relaxed`, replies still
  quote matching values; at `balanced` and `strict`, they quote only claims and media labels or summaries recallable in
  the current channel and count the rest generically. At `off`, replies report counts only.
- **Cached Media Reuse:** a repost of the same content reuses its stored digest at every privacy level and records the
  new share; it is never re-watched because the earlier share was in another channel. Recalling media summaries
  unprompted is still gated by the privacy level.

```bash
# Facts with embeddings (unified recall needs them; the daily maintenance pass fills the gaps)
sqlite3 ~/rokabot/data/rokabot.db "SELECT COUNT(*) AS active, SUM(embedding IS NOT NULL) AS embedded FROM memory_claim WHERE status = 'active';"

# Shadow comparison over the last 7 days: legacy fact retrieval vs the unified recall
sqlite3 ~/rokabot/data/rokabot.db "SELECT kind, COUNT(*) AS turns, ROUND(AVG(n_selected), 2) AS avg_selected, ROUND(AVG(tokens_est)) AS avg_tokens FROM memory_events WHERE kind IN ('retrieval', 'recall_shadow', 'recall') AND created_at > (strftime('%s', 'now') - 7 * 86400) * 1000 GROUP BY kind;"
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
