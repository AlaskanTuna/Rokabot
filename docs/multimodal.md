# Multimodal Intake Research

> Research and design for issue #100 — letting Roka see video, hear audio, and read documents. **No implementation.** This ends at a costed recommendation for Gate 1. Every number below is either measured here or cited to Google's own model documentation; the one figure I could not obtain is called out as such.

---

## Verdict First

| Modality                            | Recommendation  | Cap          | Blocked On                                    |
| ----------------------------------- | --------------- | ------------ | --------------------------------------------- |
| **PDF / Documents**                 | **Ship now**    | 10 MB        | Nothing — rides the existing path             |
| **Audio**                           | **Ship second** | 8 MB         | Global in-flight byte budget                  |
| **Video, low media resolution**     | **Ship last**   | 10 MB, ~60 s | Global budget **and** streaming size guard    |
| **Video, default media resolution** | **Decline**     | —            | 3× the token cost for no benefit at this size |

The caps are the feature, and two independent constraints — container memory and the per-attempt timeout — land on the same 10 MB number by different routes. That agreement is the main reason to trust it.

---

## Three Premise Corrections

**The container cap was 512 MB, not 8 GB.** The issue body says "Raspberry Pi 5 (8 GB) in Docker with a memory cap", which reads as though 8 GB were the budget. It was not: `mem_limit` read `512m`, one sixteenth of the host. Today's 4 MB image ceiling is 0.8% of that, which is why nothing had broken yet. **Acted on since this research: raised to `mem_limit: 1g` with `memswap_limit: 1g`.** Every measurement below was taken at 512 MB and remains valid as a measurement — the 4.7× multiplier and the kill behaviour are cap-independent — but the derived budgets have been recomputed against 1 GB and are marked where they changed.

**`ALLOWED_IMAGE_TYPES` is no longer duplicated.** The issue lists "keep the type sets in one place — they are currently duplicated across two files" as an open constraint. #101 already consolidated it into `src/discord/attachments.ts`, which is now the single declaration and the natural home for any new type set. That constraint is satisfied before this work starts.

**Flash-Lite is not modality-reduced.** The issue flags that "Lite variants have historically carried reduced modality support" and asks for verification against Google's model page. Verified: `gemini-3.5-flash-lite` accepts **text, image, video, audio, and PDF**, with a 1,048,576-token input window and 65,536-token output. What it does not support is audio _generation_, image _generation_, and the Live API — all output-side, none relevant here. **No model switch is needed and the feature is not blocked at the model level.**

---

## Research Questions

### 1. Does the Model Accept Video and Audio? — Yes

Per the `gemini-3.5-flash-lite` model page: input types are "Text, Image, Video, Audio, and PDF". This was the cheap-and-valuable finding the issue hoped for, and it came back positive, so the rest of the analysis is load-bearing.

### 2. Inline Data vs the Files API — Inline Only

The hard limit is **20 MB for the total request, including the prompt and all files**, above which the Files API is required. Every cap recommended here is 10 MB or below, so:

- **The Files API is out of scope entirely.** That removes an upload round trip, a storage lifetime to manage, and a second failure mode on the hot path — the exact concerns the issue raised.
- Note a documentation inconsistency: the video-understanding page describes inline as suiting "small files (<100MB)", which contradicts the 20 MB request ceiling stated on the audio page. **Design to 20 MB.** The larger figure appears to describe the Files API's remit rather than inline's.

### 3. Token Cost — Only Video Can Trip TPM

| Modality                  | Cited Cost                       | 60 s / 20 pages |
| ------------------------- | -------------------------------- | --------------- |
| Video, default resolution | ~300 tokens/second               | 18,000 tokens   |
| Video, low resolution     | 100 tokens/second                | 6,000 tokens    |
| Audio                     | 32 tokens/second (1 min = 1,920) | 1,920 tokens    |
| PDF                       | 258 tokens/page, text layer free | 5,160 tokens    |

Every figure below is the cost of the turn that carries the media, which holds only because attachment bytes
are stripped from session history once their turn is over. Before that fix they were re-sent as history on
every later turn, so a single upload could be charged up to twenty times — see `docs/trd.md`.

Against `rpm: 15` and `rpd: 500`, and the free-tier ceiling of **250,000 input tokens per minute** — measured, below:

- **Audio and PDF never reach TPM.** At 1,920 tokens a minute of audio, RPM 15 binds first by an order of magnitude.
- **Video can.** At default resolution, ten one-minute clips exhaust 250K TPM before RPM 15 does — counting the text baseline each turn also carries — so TPM becomes the binding limit, exactly as the issue predicted. Low media resolution cuts that 3× and moves the binding limit back to RPM.

**This number is now confirmed — from the API, not the documentation.** Google moved per-tier rate limits off the public rate-limits page into AI Studio, behind an authenticated session, so it could not be read. It can be provoked instead: a single deliberately oversized `generateContent` request states the limit in its own rejection. One 407,640-token request on the dedicated development key returned `429 RESOURCE_EXHAUSTED` carrying:

```
quotaId     GenerateContentInputTokensPerModelPerMinute-FreeTier
quotaValue  250000
dimensions  { location: global, model: gemini-3.5-flash-lite }
metric      generativelanguage.googleapis.com/generate_content_free_tier_input_token_count
```

Three things it settles that the forum figure did not:

- **250,000 is correct**, and the quota is scoped **per model**, with `gemini-3.5-flash-lite` named in the dimensions — precisely the gap the forum thread left open.
- **It counts input tokens only.** Output is not charged against TPM.
- **Overshooting is free.** The request was refused before processing, so it consumed no tokens; the rejection carries a `RetryInfo` of 18 s. A 429 must be attributed by its `quotaId`, though — RPM, RPD and TPM all surface as the same status code, and the daily limit rejects with `GenerateRequestsPerDayPerProjectPerModel-FreeTier` instead.

**What that permits, worst case.** TPM counts _every_ input token, not only the media — system prompt and history land in the same bucket, and production averages 5,543 text-only tokens per turn (`response_events`, n=256). A minute saturated at RPM 15 therefore spends ~83,000 tokens on text before any media, leaving ~11,100 tokens of media per turn:

| Media Resolution | Tokens/Second | Longest Video in a Saturated Minute |
| ---------------- | ------------- | ----------------------------------- |
| Low              | 100           | ~110 s                              |
| Default          | 300           | ~37 s                               |

The 10 MB byte cap recommended below buys roughly 40–160 s of video across typical Discord bitrates, so **at low resolution the byte cap already holds video inside TPM** — no decode pass needed, which is the same argument the duration-cap note makes below. At default resolution it does not, and that is a second independent reason to decline it. This is also worst case by a wide margin: the observed peak is 38 requests in a _day_, so a fully saturated minute is a bound rather than a forecast.

One caveat on transfer: this was measured on the development project's key. The production key is a separate project, also free tier — consistent with the `limit: 500` seen in its own daily-quota rejection — so the same figures should apply, but they have not been provoked on that key and should not be.

### 4. Do Documents Need New Plumbing? — Almost None

PDFs are accepted natively: **258 tokens per page**, up to **1,000 pages** and **50 MB**, processed with native vision on page images up to 3072×3072, and text already embedded in the PDF is extracted and **not** charged as tokens. So a text-layer PDF is close to free.

The existing path in `src/agent/roka.ts` already does everything required — download, size-check, base64, attach as `inlineData`. Two changes only:

- Route by MIME type so a PDF **skips `processImageForGemini`**. `sharp` is an image pipeline; handing it a PDF is a guaranteed failure, and it is the only image-specific step.
- Add the document types to `src/discord/attachments.ts`.

One implementation check for whoever picks it up: confirm the ADK TypeScript wrapper passes an arbitrary `inlineData` mimeType through untouched rather than assuming an image. That is a five-minute unit test, not a research question, but it is the only thing standing between this analysis and "PDF works".

### 5. What Happens at the Cap? — A Silent SIGKILL

This was the peer's addition to the question list and it turned out to be the most important one. Measured, not reasoned, in `node:24-alpine` under a real cgroup:

```
docker run --memory=512m --memory-swap=512m  → exit 137, stdout and stderr EMPTY
docker run --memory=512m --memory-swap=1g    → exit 137, stdout and stderr EMPTY
```

**Exit 137 is SIGKILL.** There is no JavaScript exception, no `OutOfMemoryError` to catch, no final log line. The kernel removes the process. Under `restart: unless-stopped` Docker brings it back, so the operator's experience is the bot vanishing mid-conversation and silently returning. The only surviving evidence is `docker inspect`:

```
$ docker inspect rokabot-roka-1 --format 'OOMKilled={{.State.OOMKilled}} RestartCount={{.RestartCount}}'
OOMKilled=false RestartCount=0     # today: never happened
```

Two consequences:

- **A cap you cannot observe approaching is a cap you must design a margin against**, because there is no runtime signal to react to. Everything below is sized accordingly.
- **The swap allowance makes this worse, not better.** `docker inspect` reports `MemSwap=1073741824` — Docker defaulted the swap allowance to 2× `mem_limit` because `memswap_limit` was never set. So the container gets 512 MB of RAM plus 512 MB of swap **on the SD card**. It does not fail fast at 512 MB; it degrades into SD-card paging first, which blows `turnDeadlineMs` and wears the card, and _then_ dies at 1 GiB. The observed behaviour confirms it: RSS pinned at ~547 MB while total allocation climbed past 990 MB. **Resolved:** `memswap_limit` is now set equal to `mem_limit`, which disables swap entirely — `memswap_limit` is the memory-plus-swap total, so equal values leave no swap runway. Verified at the new ceiling: `--memory=1g --memory-swap=1g` dies at 1 GB with exit 137 rather than paging first.

---

## The Measured Memory Model

### An Attachment Costs ~4.7× Its Own Size in RSS

Measured in `node:24-alpine` under `--memory=512m`, each in a fresh process, replaying the exact pipeline in `downloadImage` (`arrayBuffer` → `Buffer.from` → `toString('base64')` → JSON body):

| Payload  | RSS    | Marginal Cost |
| -------- | ------ | ------------- |
| baseline | 47 MB  | —             |
| 4 MB     | 65 MB  | 4.5×          |
| 10 MB    | 94 MB  | 4.7×          |
| 20 MB    | 140 MB | 4.6×          |
| 40 MB    | 234 MB | 4.7×          |
| 60 MB    | 327 MB | 4.7×          |

The 4.7× is not mysterious and that is why it can be trusted: the payload exists **four times over** — the downloaded `arrayBuffer` (1×), the `Buffer.from` copy (1×), the base64 string (1.33×), and the JSON request body containing that string (1.33×) — summing to 4.66×. Measurement and arithmetic agree, so the model extrapolates safely.

### V8's Heap Limit Does Not Protect You

Node 24 **is** cgroup-aware, and the ceiling tracks the cgroup rather than the host: `v8.getHeapStatistics().heap_size_limit` reports **259 MB** inside a 512 MB container and **560 MB** inside a 1 GB one, while `os.totalmem()` reports the host's full memory in both. Measured at both sizes rather than scaled, because the heuristic is not a clean half. That was worth verifying rather than assuming, because the protection it offers is narrower than it looks:

**Buffers are external to the V8 heap.** The two `Buffer` copies — 2 of the 4.7 multiples — never count against the 259 MB heap limit and never trigger a `JavaScript heap out of memory` error. They consume container RSS directly, and the first thing that notices is the kernel's OOM killer. So the mechanism that would ordinarily throw a catchable error is bypassed by precisely the allocations this feature adds.

### The Binding Constraint Is Concurrency, and There Is No Global Cap

`src/discord/concurrency.ts` is a `Set<string>` of channel IDs. It guarantees **one active request per channel** and imposes **no global limit whatsoever**. K busy channels means K simultaneous downloads, each holding its own 4.7× footprint.

With the Pi's measured idle RSS of **55.59 MiB**, headroom is ~968 MB against the raised 1 GB cap, so the _total_ in-flight payload the container can hold before the kill threshold is:

```
968 MB / 4.7 ≈ 206 MB of concurrent attachment bytes  (was ~97 MB at 512 MB)
```

At a 10 MB per-turn cap that is about twenty concurrent attachment turns rather than nine or ten. **Raising the cap widened the margin; it did not remove the need for the guard.** Twenty is still reachable, the failure mode is still the whole bot dying rather than one turn failing, and there is still no warning at nineteen — so a global in-flight byte budget remains the change that has to precede audio and video. What the raise buys is that the guard is no longer the only thing standing between a busy evening and a SIGKILL.

**The 32 MB budget stays at 32 MB.** It is sized by what a small server plausibly needs concurrently — three simultaneous 10 MB turns — not by what the cap permits, so a larger cap is not a reason to raise it. At 1 GB it holds worst-case residency to ~206 MB including baseline, about 20% of the cap rather than 40%. Turns arriving over budget take the existing busy/decline path rather than a new one.

### The Size Guard Cannot Protect Against a Missing Content-Length

`downloadImage` checks the `content-length` header, then calls `await response.arrayBuffer()`, then checks the real size. The middle step buffers the **entire body** into memory before the second check can run. Discord's CDN always sends `Content-Length`, so this is safe today and harmless at 4 MB regardless. At video sizes it is not: a response without that header would be buffered in full before anything measured it. Video support needs a streaming read with a running byte counter that aborts mid-transfer — not `buffer-then-check`.

---

## Latency

Measured from the Pi, and this one nearly went badly wrong. A first measurement against `httpbin.org` reported **85 KB/s**, which would have made a 5 MB upload take 60 seconds and forced me to recommend declining both audio and video outright. That number was httpbin's own throttling, not the Pi's uplink. Re-measured against Cloudflare's upload endpoint:

```
5,242,880 bytes in 2.089 s = 2.5 MB/s  (~20 Mbps upstream)
```

A cross-check against `google.com/generate_204` was correctly discarded: it answered after only 64 KB, so it never sampled throughput at all. **Lesson recorded rather than buried: a throughput figure from a free public echo service measures the echo service.**

Against `gemini.timeout: 20000` (per attempt) and the recorded p95 text turn of 9,801 ms:

| Payload | Upload | + p95 Model | Fits 20 s Attempt?             |
| ------- | ------ | ----------- | ------------------------------ |
| 10 MB   | 4.0 s  | 13.8 s      | Yes, ~6 s spare                |
| 20 MB   | 8.0 s  | 17.8 s      | Technically, no retry headroom |

`turnDeadlineMs: 63000` permits three 20 s attempts; at 20 MB the re-upload alone consumes 24 s of that across retries. **10 MB is the latency-safe cap, arrived at independently of the memory analysis, which produced the same number.** Two unrelated constraints agreeing is the strongest evidence in this document.

---

## Recommended Caps

Enforced in `src/discord/attachments.ts` alongside the existing image policy, and per this repo's standing rule **each cap gets a test, not a comment**.

| Modality                          | Byte Cap  | Rationale                                  | Duration Implied          |
| --------------------------------- | --------- | ------------------------------------------ | ------------------------- |
| PDF / documents                   | 10 MB     | Latency; 258 tok/page is never binding     | ~1,000 pages by API limit |
| Audio                             | 8 MB      | ~5 min at 128 kbps; 32 tok/s is negligible | ~5 min typical            |
| Video (low res)                   | 10 MB     | Latency and memory agree                   | ~60 s typical             |
| **Total in flight, all channels** | **32 MB** | ~20% of the 1 GB cap at worst case         | —                         |

**The per-turn caps did not move.** 10 MB and 8 MB are set by upload latency against `gemini.timeout`, not by container memory, so doubling the cap leaves them exactly where they were. Recorded explicitly rather than left ambiguous.

**On duration caps specifically:** the issue asks for explicit duration limits, and this is where I would push back on the framing. Duration is not knowable without decoding the file, and decoding to measure it costs the same memory the cap exists to protect. **The byte cap is the enforceable proxy** and the duration column above is what a byte cap implies at typical bitrates, not an independently enforced limit. A user posting a 60 s video at an unusually low bitrate gets it accepted; that is correct, because bytes are what threaten the host. Enforcing true duration limits would require `ffprobe` in the image and a decode pass, and I do not recommend paying that for a bound the byte cap already achieves.

---

## Suggested Sequencing

1. ~~**Set `memswap_limit`**~~ — **done**, alongside raising `mem_limit` to `1g`. Converts a slow SD-thrashing death into a fast honest one. Deploy-affecting: takes effect only on the next container recreate, which needs explicit authorization.
2. **PDF support** — no new infrastructure; MIME routing plus skipping `sharp`. Ships alone and is the highest value per unit of work, with an obvious use in a server that discusses visual novels.
3. ~~**Global in-flight byte budget**~~ — **done**, 32 MB across all channels, reserved before download and released on every exit path. `discord.maxInFlightAttachmentBytes` in `config.yml`; contract in `docs/trd.md`.
4. **Audio** — smallest payloads, cheapest tokens, no new failure modes once (3) exists.
5. **Streaming size guard** — replaces `buffer-then-check`; only video needs it.
6. **Video, low media resolution only** — last, largest, and the only modality whose token cost can bind before RPM.

Steps 1 and 2 are shippable now. Steps 3–6 are a second Gate 1 conversation. The TPM figure that previously gated video is confirmed above, so what now stands between here and video is the global byte budget and the streaming guard — engineering, not research.

## What This Does Not Cover

Intake only. If Roka needs telling _how_ to talk about a video she has watched, that is a prompt-layer change and inherits the two-green-live-run cost that #94 and #105 paid — it should not be bundled here.
