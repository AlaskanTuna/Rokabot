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

**The container cap is 512 MB, not 8 GB.** `docker-compose.yml:13` reads `mem_limit: 512m`. The issue body says "Raspberry Pi 5 (8 GB) in Docker with a memory cap", which reads as though 8 GB were the budget. It is not; the host has 8 GB and the bot may use one sixteenth of it. Today's 4 MB image ceiling is 0.8% of the container, which is why nothing has broken yet.

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

Against `rpm: 15` and `rpd: 500`, and taking the widely-reported free-tier ceiling of **250,000 TPM** as indicative:

- **Audio and PDF never reach TPM.** At 1,920 tokens a minute of audio, RPM 15 binds first by an order of magnitude.
- **Video can.** At default resolution, roughly 13 one-minute clips per minute exhausts 250K TPM before RPM 15 does — so TPM becomes the binding limit, exactly as the issue predicted. Low media resolution cuts that 3× and moves the binding limit back to RPM.

**This is the one number I could not verify.** Google moved per-tier rate limits off the public rate-limits page and into AI Studio, which needs an authenticated session. The 250,000 figure comes from a developer-forum thread, not Google's own documentation, and it does not name Flash-Lite specifically. **Gate 1 action: read the TPM figure from [AI Studio's rate-limit page](https://aistudio.google.com/rate-limit) — ten seconds of operator time settles it.** If TPM is materially below 250K, video's cap tightens further; if it is at or above, low-resolution video is comfortable. Nothing else in this document depends on it.

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
- **The swap allowance makes this worse, not better.** `docker inspect` reports `MemSwap=1073741824` — Docker defaulted the swap allowance to 2× `mem_limit` because `memswap_limit` was never set. So the container gets 512 MB of RAM plus 512 MB of swap **on the SD card**. It does not fail fast at 512 MB; it degrades into SD-card paging first, which blows `turnDeadlineMs` and wears the card, and _then_ dies at 1 GiB. The observed behaviour confirms it: RSS pinned at ~547 MB while total allocation climbed past 990 MB. **Recommend setting `memswap_limit: 512m` so the container fails fast instead of thrashing** — a one-line change, and the only config edit this research recommends.

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

Node 24 **is** cgroup-aware: inside a 512 MB container, `v8.getHeapStatistics().heap_size_limit` reports **259 MB** even though `os.totalmem()` still reports the host's full memory. That was worth verifying rather than assuming, because the protection it offers is narrower than it looks:

**Buffers are external to the V8 heap.** The two `Buffer` copies — 2 of the 4.7 multiples — never count against the 259 MB heap limit and never trigger a `JavaScript heap out of memory` error. They consume container RSS directly, and the first thing that notices is the kernel's OOM killer. So the mechanism that would ordinarily throw a catchable error is bypassed by precisely the allocations this feature adds.

### The Binding Constraint Is Concurrency, and There Is No Global Cap

`src/discord/concurrency.ts` is a `Set<string>` of channel IDs. It guarantees **one active request per channel** and imposes **no global limit whatsoever**. K busy channels means K simultaneous downloads, each holding its own 4.7× footprint.

With the Pi's measured idle RSS of **55.59 MiB** against a 512 MB cap, headroom is ~456 MB, so the _total_ in-flight payload budget across all channels is:

```
456 MB / 4.7 ≈ 97 MB of concurrent attachment bytes — at zero safety margin
```

At a 10 MB per-turn cap that is nine or ten concurrent attachment turns to reach the kill threshold, with no warning at eight. On a small server that is unlikely; it is not impossible, and the failure mode is the whole bot dying rather than one turn failing. **This is the single change that has to precede audio and video: a global in-flight byte budget, not just a per-turn size cap.** A budget of 32 MB holds worst-case RSS to ~150 MB + baseline ≈ 40% of the cap, and turns arriving over budget take the existing busy/decline path rather than a new one.

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
| **Total in flight, all channels** | **32 MB** | ~40% of the container cap at worst case    | —                         |

**On duration caps specifically:** the issue asks for explicit duration limits, and this is where I would push back on the framing. Duration is not knowable without decoding the file, and decoding to measure it costs the same memory the cap exists to protect. **The byte cap is the enforceable proxy** and the duration column above is what a byte cap implies at typical bitrates, not an independently enforced limit. A user posting a 60 s video at an unusually low bitrate gets it accepted; that is correct, because bytes are what threaten the host. Enforcing true duration limits would require `ffprobe` in the image and a decode pass, and I do not recommend paying that for a bound the byte cap already achieves.

---

## Suggested Sequencing

1. **`memswap_limit: 512m`** — one line, independent of everything else, converts a slow SD-thrashing death into a fast honest one.
2. **PDF support** — no new infrastructure; MIME routing plus skipping `sharp`. Ships alone and is the highest value per unit of work, with an obvious use in a server that discusses visual novels.
3. **Global in-flight byte budget** — the prerequisite for anything larger. Worth landing on its own with its own tests, because it is the piece that prevents the OOM.
4. **Audio** — smallest payloads, cheapest tokens, no new failure modes once (3) exists.
5. **Streaming size guard** — replaces `buffer-then-check`; only video needs it.
6. **Video, low media resolution only** — last, largest, and the only modality whose token cost can bind before RPM.

Steps 1 and 2 are shippable now. Steps 3–6 are a second Gate 1 conversation, and video should not start before the TPM figure is confirmed.

## What This Does Not Cover

Intake only. If Roka needs telling _how_ to talk about a video she has watched, that is a prompt-layer change and inherits the two-green-live-run cost that #94 and #105 paid — it should not be bundled here.
