# Media

How Roka takes in files, watches audio and video, and opens linked social posts.

## At a Glance

| Topic          | Contract                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------- |
| File Types     | Image, PDF, audio and video, on `/ask` and the mention path.                                    |
| Per-Turn Limit | Up to 10 files, at most one audio or video item, and `discord.maxAttachmentBytesPerTurn` bytes. |
| Memory Guard   | A global in-flight byte budget is reserved before any download starts.                          |
| Cost Guard     | Parts are priced before sending and refused above `gemini.maxAttachmentTokens`.                 |
| Watching       | Audio and video become a text digest from a separate watcher call (`media.watcher`).            |
| Social Posts   | One supported post link per turn is opened and passed to the model as untrusted quoted data.    |
| History        | File bytes leave session history after the turn. Only markers and compact digests stay.         |

## Attachment Intake

### Types and Ceilings

`src/discord/attachments.ts` declares every admitted type. `src/agent/attachmentLimits.ts` holds the ceilings and `sizeLimitFor`, so the download and the byte budget use the same number.

| Kind     | Types                                                                                 | Ceiling | Path                                                 |
| -------- | ------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------- |
| Image    | `image/png`, `image/jpeg`, `image/gif`, `image/webp`                                  | 4 MiB   | Re-encoded by `sharp`: JPEG, longest side ≤ 1,024 px |
| Document | `application/pdf`                                                                     | 10 MiB  | Byte-identical                                       |
| Audio    | `audio/wav`, `mp3`, `mpeg`, `aiff`, `aac`, `ogg`, `flac`                              | 8 MiB   | Watched, or byte-identical in `direct` mode          |
| Video    | `video/mp4`, `mpeg`, `mov`, `quicktime`, `avi`, `x-flv`, `mpg`, `webm`, `wmv`, `3gpp` | 10 MiB  | Watched, or byte-identical in `direct` mode          |

- **Renamed Types:** `geminiMimeType` sends `audio/mpeg` as `audio/mp3` and `video/quicktime` as `video/mov`. Gemini accepts both spellings.
- **Large Audio and Video:** a file above its ceiling and within `media.maxStreamedUploadBytes` (50 MiB) is streamed to the Gemini Files API (see [Transport](#transport)).

### Where Files Come From

The mention path collects candidates in this order, up to `MAX_ATTACHMENTS` (10):

1. Uploads on the triggering message.
2. Components V2 media (`Thumbnail`, `MediaGallery`, `File`) on the triggering message.
3. Uploads in forwarded snapshots.
4. Uploads on the replied-to message. A reply to one of Roka's own messages never takes its files or embed images.
5. Embed images on the triggering message.
6. Embed images on the replied-to message.
7. A linked post's video or picture (see [Post Media](#post-media)).

- **Unreadable Components:** a component whose `content_type` is unsupported or missing adds to `unsupportedCount`. The type is never guessed from the URL.
- **Markers:** forwarded and replied-to media add a marker per kind (image, video, audio clip, document), with `, N not shown` when some did not fit. Unsupported replied-to files add `(attached file(s) of a type that can't be opened)`.
- **`/ask`:** has three upload slots (`attachment_1` to `attachment_3`, `ASK_ATTACHMENT_SLOTS`) and an `attachment_url` option. Both surfaces filter with `isSupportedMedia`.

### Linked Files (`attachment_url`)

`resolveMediaUrl` turns a user URL into an attachment or refuses it.

- **Host Check:** `http` or `https` only. The host is refused when any resolved address is private, loopback, link-local or CGNAT (Tailscale), when it is `localhost`, or when the lookup fails.
- **HEAD:** 2 s timeout, redirects followed, and a changed final host is checked again. The type comes from `Content-Type`, never the path.
- **Size:** a declared `Content-Length` becomes the size, so a link gets the same prefix-or-refuse decision as an upload.

A link to a supported social post goes to [Social Post Viewing](#social-post-viewing) instead.

## Turn Admission

A turn with files passes these checks in order. Each refusal takes the in-character busy or decline reply. [Reliability](./reliability.md) covers the rate limiter and token bucket.

1. **Fit:** `fitAttachmentsToTurn` keeps candidates in intake order while the count stays ≤ 10, there is at most one audio or video item, and the reservation stays ≤ `discord.maxAttachmentBytesPerTurn`. It continues past a candidate that does not fit. Skipped files add a "left out" notice for the model.
2. **Rate Limit:** an advisory `canAdmitCalls(gemini.maxLlmCalls)` check.
3. **Token Minute:** `canAffordAttachments` needs one whole `gemini.maxAttachmentTokens` left in this minute's token bucket.
4. **Call Reservation:** the turn reserves `gemini.maxLlmCalls` calls.
5. **Byte Budget:** `tryReserve` takes the turn's reservation from the global in-flight budget.

### Global In-Flight Byte Budget

An attachment holds about 4.7× its size in memory. Part of that is outside the V8 heap, so an overrun kills the container. `src/discord/byteBudget.ts` bounds the total across channels.

- **Reserve First:** the reservation happens before the download starts.
- **Ceiling:** `discord.maxInFlightAttachmentBytes` (32 MiB) covers all channels at once. Its floor is 30 MiB, the maximum of `discord.maxAttachmentBytesPerTurn`, so an idle bot always admits one maximal turn.
- **Reservation Size:** the stated size, clamped to the type's ceiling. A file with no stated size (embed image, resolved link) reserves its full ceiling. A YouTube URI reserves nothing. A streamed upload reserves 4 MiB, its in-flight chunk, while a watcher is on.
- **Release:** the same `finally` that frees the channel guard releases the bytes on every exit path. The counter never drops below zero.

## Download

`downloadAttachment` in `src/agent/attachments.ts` fetches one file with a 15 s timeout.

- **Streaming Cap:** `readWithinLimit` counts bytes as they arrive and cancels the reader at the ceiling. There is no `arrayBuffer()` fallback. A `Content-Length` above the ceiling refuses before any byte is read.
- **Oversized Media:** a file whose stated size is above its ceiling is cut to a prefix when its container survives the cut, and refused otherwise. A refused file is never requested.

| Prefix Policy | Types                                                                                        | Rule                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `streamable`  | `audio/mpeg`, `audio/mp3`, `audio/ogg`, `audio/flac`, `audio/aac`, `audio/wav`, `video/webm` | Any prefix is valid.                                                                                     |
| `isobmff`     | `video/mp4`, `video/mov`, `video/quicktime`, `video/3gpp`                                    | Valid only when `moov` sits wholly before `mdat` or `moof` in the fetched bytes (`isobmffAllowsPrefix`). |
| `none`        | Every other type                                                                             | Refused.                                                                                                 |

- **`Range`:** the request sends `Range: bytes=0-<ceiling-1>`, but Discord's CDN answers 200 with the whole body. The cancel at the ceiling bounds the transfer.
- **No Size Stated:** such a file is never prefix-cut. It is refused if it passes the ceiling.
- **Truncation Notice:** `truncatedAttachments` makes the Discord layer add a line that the file was cut.

## Token Admission

Byte size does not bound token cost. A small PDF can cost tens of thousands of tokens. `prepareAttachments` prices the direct parts (images, PDFs, and audio or video in `direct` mode) before the reply call.

1. A set of images only is not measured. Each image is charged a flat 1,089 tokens (`GEMINI_IMAGE_TOKENS`).
2. Otherwise each part is measured alone. A part is kept while the running total stays ≤ `gemini.maxAttachmentTokens`. A later part can still fit after an earlier one is refused.
3. If any single measurement fails, the whole set is measured once and refused or kept as a unit.
4. A measurement that throws or times out admits the turn unmeasured (fail open). An unmeasured audio or video part adds 0 to the turn's token charge.

The counter follows the main model's profile (`tokenCounter` in `src/agent/llm/profiles.ts`):

| Counter     | Method                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `gemini`    | Gemini `countTokens`. Free in generate quota, but it sends the bytes a second time.                 |
| `anthropic` | Anthropic `countTokens`. Audio and video count as a short text marker.                              |
| `estimate`  | Images at width × height / 750, PDFs at 1,500 per page. Audio or video the model takes: unmeasured. |

- **Notices:** the model gets a line for files not retrieved, left out by the per-turn limit, or refused as too long, so it does not search for content it never saw.
- **Low Media Resolution:** `beforeModelCallback` in `src/agent/roka.ts` sets `MEDIA_RESOLUTION_LOW` on any reply request that carries a video part. The Gemini estimate stays above the bill only while this holds.
- **Models That Cannot Take a Part:** a reply model whose profile lacks a part type gets `(a <kind> attachment that can't be opened right now)` in its place. See [Models](./models.md).

## Bytes Do Not Stay in History

ADK appends the incoming message to the session as it arrived. `WindowedSessionService.stripAttachmentBytes` (`src/agent/session.ts`) cleans it after the turn.

- Each `inlineData` or `fileData` part becomes `(an image)`, `(an audio clip)`, `(a video)` or `(a document)`. Each full digest becomes its compact form.
- It runs once after all retries, so each retry resends the real bytes. It also runs on failed turns.
- It edits the stored event objects. `getSession` returns deep clones, so editing those would change nothing.
- The saved SQLite user message gets the compact digests appended, so rehydration keeps them.

Roka later knows that a file was there, but not what it showed, before and after a restart. Files are never written to disk or SQLite.

## Media Watching

Audio and video are watched before Roka replies. `prepareTurnMedia` (`src/agent/media/turnMedia.ts`) runs alongside `createTurnContext`. Images and PDFs skip it and keep the direct path.

![Media Watching Flow](../diagrams/media-watch.svg)

_A file or post link passes admission, a watcher turns audio or video into notes, and the notes or a failure notice reach the reply turn._

### Watcher Modes

`media.watcher` (env `MEDIA_WATCHER`) picks the mode. Images and PDFs are the same in every mode.

| Mode     | Behavior                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gemini` | Default. Gemini watches first and Qwen is the backup.                                                                                                      |
| `qwen`   | Qwen watches first and Gemini is the backup.                                                                                                               |
| `direct` | No watcher. Audio and video go to the reply model as they arrived. Linked posts give their picture, not their video.                                       |
| `off`    | No watcher and no file. Each item becomes `[A video was shared, but watching and listening are switched off right now.]`. Linked posts give their picture. |

- **Backup Order:** `watchOne` tries the watchers in order and adds a failure notice only when both fail.
- **Skip Rules:** a watcher without its key is skipped (`GEMINI_API_KEY`, `MODELSCOPE_API_KEY`). Gemini is skipped while turns are pinned to the fallback model. Qwen takes audio only when `media.transcriber.url` is set.

### Transport

| Source                                     | Transport | Behavior                                                                                                                                                                                                  |
| ------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload within its ceiling                  | `inline`  | Downloaded under the byte budget and sent once as `inlineData`.                                                                                                                                           |
| Audio or video above its ceiling, ≤ 50 MiB | `files`   | Streamed from Discord into the Files API (`src/agent/media/filesUpload.ts`): resumable upload, aborts past the stated size, polled until `ACTIVE` within `media.uploadTimeoutMs`, deleted in a `finally`. |
| YouTube link                               | `uri`     | Sent as `fileData.fileUri`. Google fetches it, so the Pi downloads nothing.                                                                                                                               |

### Coverage Plan

Code owns duration, mode, frame rate and timeline bins. `planCoverage` (`src/agent/media/plan.ts`) admits a plan when its estimate fits the budget:

```text
estimate = ceil(1.10 × (70 × frames + 32 × audio seconds)) + 64 × parts
budget   = gemini.maxAttachmentTokens   (÷ 1.15 when the duration is estimated)
```

| Duration    | First Frame Rate   | Steps Down To      |
| ----------- | ------------------ | ------------------ |
| ≤ 2 min     | 1 fps              | No step-down       |
| ≤ 10 min    | 1 frame every 4 s  | 1 frame every 20 s |
| Over 10 min | 1 frame every 10 s | 1 frame every 20 s |

Audio is planned whole or declined. The timeline has `min(8, max(3, ceil(D / 120)))` equal bins.

| Mode      | When                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `whole`   | The whole file fits at some frame rate.                                                                                         |
| `halves`  | A `uri` or `files` video of 20 to 40 min that does not fit whole (see below).                                                   |
| `skim`    | A longer `uri` or `files` video: `min(media.skimClips, max(3, ceil(D / 120)))` clips of `media.skimClipSeconds`, evenly spaced. |
| `focus`   | A YouTube link with a timestamp, on a video over 2 min: 30 s before to 90 s after the moment, at 1 fps (`planFocus`).           |
| `opening` | An inline file that arrived as a prefix.                                                                                        |
| `decline` | An inline file too long to watch whole (inline media never skims, since each clip resends the bytes), or no known duration.     |

The digest header states the coverage, for example `whole video in two halves, 35:00, a frame every 20 s, full sound` or `around 12:34: watched 12:04–14:04`. A declined item gets a notice such as `at about 25:00 it is too long to watch in one go`.

- **Two Halves:** needs twice a half's estimate left in the token bucket and `gemini.maxLlmCalls − 2 ≥ 2`, else the video is skimmed. The halves run in parallel with `videoMetadata` offsets and no retry. `mergeHalves` joins them and renumbers the second half's bins. If one half fails, the other stays as an incomplete digest (`only 0:00–17:30 of 35:00 was watched`).
- **Duration Sources:** a voice message states it. MP4, MOV and 3GPP uploads use their `moov/mvhd` box. A streamed file uses Files API `videoMetadata`. Anything else is priced with `countTokens` (about 103 tokens/s for video, 32 for audio). A YouTube link with no known duration is counted at 0.05 fps (`D ≈ tokens / 35.3`); a count under 200 tokens means unknown.

### Gemini Watcher

`watchMedia` (`src/agent/media/watch.ts`) makes one `generateContent` call on `gemini.model`.

- **Request:** no tools, no persona, `temperature` 0, a JSON response schema, `media.digestMaxOutputTokens` and `media.watchTimeoutMs`. Video uses `MEDIA_RESOLUTION_LOW`. The user's message is untrusted focus only (500 characters).
- **Notes:** `summary`, `timeline` (one entry per bin), `speech`, `onScreenText`, `moments`, `claims`, `style` and `uncertainties`. The schema caps lists at 8 timeline entries, 12 quotes, 8 on-screen texts and 5 each of the rest.
- **Validation:** `validateObservations` drops invalid entries and marks the digest incomplete, with no repair call. Unparseable JSON fails as `invalid`.
- **Retry:** only a 503 is retried, once, and only when the first try failed within half of `media.watchTimeoutMs` and the shared limiter's `tryConsumeAboveFloor(gemini.retryRpmFloor)` allows it. A 429 is a quota answer and is not retried.
- **Failure Reasons:** `overloaded`, `timeout`, `unavailable` (fails with `it couldn't be opened`), `invalid`, `error`.

### Qwen Watcher

`watchWithQwen` and `watchFramesWithQwen` (`src/agent/media/qwenWatch.ts`) watch from still frames and a speech transcript.

1. **Source:** uploads and post videos are read from their URL. A YouTube link goes through yt-dlp: its lowest stream of at least 240p, its lowest audio-only stream of at least 32 kbps, and its title and description as untrusted context.
2. **Frames:** one per `media.qwen.secondsPerFrame` of the watched span, between `media.qwen.minFrames` and `media.qwen.maxFrames`. ffmpeg takes a JPEG at each bin's midpoint at `media.qwen.frameHeight`, 4 at a time, 8 s each, with `-protocol_whitelist file,https,tls,tcp,crypto`. The watch fails with fewer than half the frames (or fewer than 2).
3. **Focus:** a timestamp on a video over 2 min uses the same window as Gemini.
4. **Speech:** transcribed in parallel (see [Speech Sidecar](#speech-sidecar)). An audio item is heard from its transcript alone and fails with no speech.
5. **Call:** labelled frames go to `media.qwen.model` on the ModelScope endpoint in `fallback.baseUrl`, with thinking off, `response_format: json_object`, `media.qwen.timeoutMs` and `media.digestMaxOutputTokens`. The timeline has at most 8 equal spans.
6. **Result:** a `MediaDigest` with `fps: null`, `frames` and `heard: 'speech'` or `'none'`, for example `whole video, 3:06, 32 frames, no sound heard`.

ModelScope bills per call, whatever the frame count. Music, sound effects and tone are never heard.

### Speech Sidecar

The `asr` container (`asr/server.py`, sherpa-onnx) transcribes audio for the Qwen watcher. `docker-compose.yml` points the bot at `http://asr:8000` through `MEDIA_TRANSCRIBER_URL`. An empty value turns transcription off.

1. ffmpeg cuts 16 kHz mono WAV: the whole clip up to `media.transcriber.maxAudioSec`, else four windows centred in the quarters, or the focus window.
2. The bot posts each window in turn to `POST /transcribe?maxSpeechSec=<n>` (`audio/wav` body). Each window gets `max(10, floor(maxSpeechSec / windows))` s of speech.
3. The sidecar runs Silero VAD, identifies the language with SenseVoice-Small, and transcribes English with Moonshine-base and zh, ja, ko and yue with SenseVoice. It returns `{ language, engine, speechSec, segments: [{ start, end, text }] }`.
4. `media.transcriber.timeoutMs` bounds the whole video. Windows not reached are skipped.
5. Segments go to Qwen as a separate untrusted text part (6,000 characters at most). The coverage line reads `16 frames, speech heard from a transcript but not music or other sound`.

A failed or empty transcript leaves a frames-only watch (`heard: 'none'`), with reason `disabled`, `no_audio`, `timeout`, `unreachable`, `http_<status>` or `invalid`. The sidecar has no published port, runs one request at a time, and is capped at 2 GiB and 3 CPUs. See the [Runbook](../runbook.md).

### Digest and Turn Input

- **Digest Block:** each watched item reaches the reply model as a text part. It starts with `MEDIA_DIGEST_UNTRUSTED_DATA_LABEL`, then `[Watched media — <label>, <coverage>]`, then summary, timeline, standout moments, claims, quotes, on-screen text, style and uncertainties.
- **Compact Form:** `renderCompactDigest` gives the header plus the summary, capped at 700 characters. History keeps only this form.
- **Failure Notice:** a failed or declined watch becomes one line, for example `[A YouTube video was shared, but it couldn't be watched right now.]`. Roka never claims to have seen it.
- **Fallback Model:** with no raw audio or video in the request, the fallback hedge can answer from the digest.
- **Reply Rules:** how Roka answers from notes (length, verdict-first, no guessing from the title) lives in the core prompt. See [Prompt Engine](./prompt-engine.md).

### Remembered Media

In a server turn with memory on, each digest is saved per guild in `media_digest`, and each share in `media_occurrence`. A later share of the same item reuses the digest, and the footer says `remembered the video`. DMs, `/ask` and `memory.privacy: off` keep the digest in the transcript only.

- **Content Keys:** `youtube:<id>` (plus `@<startSec>` with a timestamp), `<platform>:<post id>:0` for a post video, `discord:<attachment path>` for a streamed upload, and `sha256:<hex>` of the bytes for an inline upload.
- `opening` and incomplete digests are not reused. A `skim` that two halves could now cover is redone.
- A Qwen watch is saved when it heard speech or the silence is definite. A failed transcription is retried on a later share.
- The summary is embedded off the reply path for recall. See [Memory](./memory.md) and [Data](./data.md).

### Accounting

- Watcher calls come out of the turn's reserved `gemini.maxLlmCalls`. ADK gets `max(1, maxLlmCalls − watcherCalls)`.
- The watcher's billed prompt tokens are charged to the token bucket. A timed-out call is charged its estimate.
- Each watch logs one `Watched media` line. The [Runbook](../runbook.md) lists its fields.

### Footer

The first audio or video item adds one label (`PreparedTurnMedia.watchOutcome`): `watched the video`, `watched most of the video` (at least half), `watched part of the video`, `skimmed the video`, `remembered the video` or `couldn't watch the video`. Audio says `clip` for `video` and `heard` for `watched`, as in `heard most of the clip` and `couldn't hear the clip`. When the item is a linked post's own media (`WatchOutcome.fromLink`), one label replaces the post label and names the platform: `watched the X video`, `couldn't watch the YouTube video`. The footer shows two labels, then `+N`.

## Social Post Viewing

Mention, reply and name-keyword turns open at most one supported post link (`socialPosts.maxLookupsPerTurn`, bounded to 1). `/ask` checks its question and `attachment_url`. `SOCIAL_POSTS_ENABLED=false` turns the feature off.

### Link Priority

1. The triggering message and its embeds.
2. The replied-to message and its embeds.
3. When replying to Roka, the post she opened: `openedPostCitation` reads the first citation of her Components V2 reply when its footer says she opened a post.
4. Forwarded snapshots on the triggering message, then on the replied-to message.

### Supported Platforms

| Platform  | Hosts                                                                               | Post Source                                                              | Video Watched From                                         | Replies Source                                   |
| --------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------ |
| X         | `x.com`, `twitter.com`, `fxtwitter.com`, `fixupx.com`, `vxtwitter.com`, `fixvx.com` | FxTwitter status API                                                     | FxTwitter MP4 variants                                     | FxTwitter `/2/conversation`                      |
| Bluesky   | `bsky.app`                                                                          | Public AppView `getPostThread`, depth 0; handle resolved to a DID        | MP4 blob from the author's PDS via `plc.directory` (1.5 s) | `getPostThread`, depth 1                         |
| Threads   | `threads.com`, `threads.net`                                                        | The post page's `data-sjs` JSON, fetched with browser headers            | First `video_versions` URL                                 | Replies rendered in the post page                |
| YouTube   | `youtube.com` (`/watch`, `/shorts/`), `youtu.be`                                    | yt-dlp metadata; oEmbed (title, channel, thumbnail) when yt-dlp fails    | Canonical URL (Gemini) or yt-dlp streams (Qwen)            | Data API v3 `commentThreads` (`YOUTUBE_API_KEY`) |
| TikTok    | `tiktok.com`                                                                        | yt-dlp metadata                                                          | yt-dlp formats                                             | `api/comment/list`                               |
| Reddit    | `reddit.com`, `redd.it`                                                             | First entry of the comment RSS feed; yt-dlp only for a `v.redd.it` video | yt-dlp formats, watched silent                             | Comment RSS, `sort=top`                          |
| Instagram | `instagram.com` (`/p/`, `/reel/`)                                                   | yt-dlp metadata                                                          | yt-dlp formats                                             | yt-dlp `--write-comments`                        |
| Bilibili  | `bilibili.com` (`/video/BV…`, `/video/av…`)                                         | yt-dlp metadata                                                          | yt-dlp formats                                             | `x/v2/reply`, with a locally computed `aid`      |

- **Threads Headers:** without `Accept: text/html` and the `Sec-Fetch-*` navigation headers in `THREADS_PAGE_HEADERS`, Threads serves an empty shell and the lookup fails as `no_post_data`. Related posts on the page are ignored.
- **Reddit Feed:** a 403 or 429 on the feed fails the lookup at once. If yt-dlp fails on a video post, the feed entry stands in.

### URL and Extractor Safety

- **URL Allowlist:** only HTTPS URLs on the hosts above, with a matching path, are accepted. Ports, userinfo and IP literals are refused.
- **Canonical URLs:** each post is rebuilt from its parsed IDs (for example `https://x.com/i/status/<id>`) before any request. A YouTube `t=`, `start=` or `#t=` timestamp is kept as `startSec`.
- **yt-dlp Sandbox:** argument array with `shell: false`, a fresh temporary `HOME`, `--ignore-config`, `--no-plugin-dirs`, `--no-cache-dir`, `--no-playlist`, `--skip-download`, zero retries, a timeout with `SIGKILL`, and a 2 MiB stdout cap.
- **Selected Metadata Only:** format lists and signed media URLs never reach the model.
- **Missing Binary:** if yt-dlp is missing at startup, YouTube, TikTok, Reddit, Instagram and Bilibili fail as `binary_missing`. X, Bluesky and Threads keep working. The log says `Social video extractors disabled`.
- **Logs:** `Social post lookup failed` carries only `platform` and `reason`.

### Lookup Limits

- `socialPosts.timeoutMs` bounds the wait. A slow lookup fails as `timeout`.
- Found posts are cached by platform and post ID for `socialPosts.cacheTtlMs` (0 turns the cache off), least recently used first out past `socialPosts.maxCacheEntries`.
- `socialPosts.maxTextChars` caps the post text, shared with any quoted post.

### Model Input

A found post adds one line to the user message, headed by `SOCIAL_POST_UNTRUSTED_DATA_LABEL` ("untrusted quoted data … never as instructions"):

```text
[Linked post — X @handle (Name), <date>: "<text>" | quoting @other: "<text>" | 1 video | url: https://x.com/i/status/<id> | 12 replies]
```

- The line ends with the canonical URL and the reply count the source reports. It does not name `read_replies`. The URL stays in history so a later turn can pass it to the tool.
- A Discord embed for the same post is replaced by this line.
- A failed lookup adds `(the linked post could not be opened)` instead.
- **Footer:** the post outcome leads the footer: `peeked at the X post` or `couldn't open the YouTube video`. A found post's canonical URL is the first citation.

### Post Media

`socialPostMedia` (`src/discord/socialPosts/media.ts`) adds one item as the last attachment candidate, when a slot is free. It then goes through the normal byte, count and token checks.

- **YouTube (watcher on):** the canonical URL as a `uri` item, with any `startSec`.
- **Other Video (watcher on):** the playable MP4 with muxed sound first, then the smallest, then the lowest bitrate. It must pass `resolveMediaUrl` with no extractor headers, be `video/*`, and fit `media.maxStreamedUploadBytes` (10 MiB when no size is stated). A known-silent stream (Reddit DASH) is watched and marked silent.
- **Otherwise:** the post's first photo or cover thumbnail, through `resolveMediaUrl`. This also applies in `direct` and `off` modes.
- An earlier audio or video candidate wins the one timed-media slot.

### Replies

The `read_replies` tool (`src/agent/tools/readReplies.ts`) fetches a post's replies on request.

- **Offered Only When Asked:** `asksAboutReplies` (`src/agent/replyIntent.ts`) checks the speaker's words, with links removed, for reply, comment, reaction, thread or "what are people saying" wording. Otherwise `beforeModelCallback` withholds the tool.
- **Count:** `socialPosts.maxReplies` (5) by default, up to `socialPosts.maxRepliesOnRequest` (50) when the user asks for more. Each reply is cut to `socialPosts.maxReplyChars` (280).
- **Ranking:** most-liked first where the source allows. X breaks ties by views. Reddit keeps its `top` order. Threads gives only the first batch the logged-out page renders.
- **Cache:** shares `socialPosts.timeoutMs` and `socialPosts.cacheTtlMs`. Failures return a short marker and are not cached.
- **Safety:** the result is headed by `SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL`. Mass mentions are defanged.
- **Footer:** `read the replies` or `couldn't read the replies`.

## Configuration

| Key                                  | Default                | Bounds                            |
| ------------------------------------ | ---------------------- | --------------------------------- |
| `discord.maxAttachmentBytesPerTurn`  | 10 MiB                 | 10 MiB to 30 MiB                  |
| `discord.maxInFlightAttachmentBytes` | 32 MiB                 | ≥ 30 MiB                          |
| `gemini.maxAttachmentTokens`         | 125,000                | 10,890 to 125,000                 |
| `gemini.maxTokensPerMinute`          | 125,000                | `maxAttachmentTokens` to 125,000  |
| `media.watcher`                      | `gemini`               | `gemini`, `qwen`, `direct`, `off` |
| `media.watchTimeoutMs`               | 20,000                 | 5,000 to 60,000                   |
| `media.digestMaxOutputTokens`        | 3,200                  | 400 to 4,000                      |
| `media.skimClips`                    | 8                      | 3 to 9                            |
| `media.skimClipSeconds`              | 10                     | 2 to 30                           |
| `media.maxStreamedUploadBytes`       | 50 MiB                 | 10 MiB to 100 MiB                 |
| `media.uploadTimeoutMs`              | 45,000                 | 10,000 to 120,000                 |
| `media.qwen.model`                   | `Qwen/Qwen3.5-35B-A3B` | —                                 |
| `media.qwen.secondsPerFrame`         | 4                      | 0.5 to 30                         |
| `media.qwen.minFrames` / `maxFrames` | 16 / 32                | 4 to 32                           |
| `media.qwen.frameHeight`             | 360                    | 144 to 720                        |
| `media.qwen.timeoutMs`               | 30,000                 | 5,000 to 90,000                   |
| `media.transcriber.url`              | empty (off)            | —                                 |
| `media.transcriber.timeoutMs`        | 45,000                 | 5,000 to 120,000                  |
| `media.transcriber.maxSpeechSec`     | 120                    | 10 to 600                         |
| `media.transcriber.maxAudioSec`      | 180                    | 30 to 900                         |
| `socialPosts.enabled`                | `true`                 | —                                 |
| `socialPosts.timeoutMs`              | 6,000                  | 1 to 30,000                       |
| `socialPosts.cacheTtlMs`             | 900,000                | ≥ 0                               |
| `socialPosts.maxCacheEntries`        | 256                    | 1 to 10,000                       |
| `socialPosts.maxTextChars`           | 1,500                  | 1 to 10,000                       |
| `socialPosts.maxReplies`             | 5                      | 1 to 10                           |
| `socialPosts.maxRepliesOnRequest`    | 50                     | 1 to 50                           |
| `socialPosts.maxReplyChars`          | 280                    | 40 to 1,000                       |
| `socialPosts.ytDlpPath`              | `yt-dlp`               | —                                 |

Defaults are the shipped `config.yml` values. Bounds come from `NUMERIC_BOUNDS` in `src/config.ts`. Env overrides: `DISCORD_MAX_ATTACHMENT_BYTES_PER_TURN`, `DISCORD_MAX_INFLIGHT_ATTACHMENT_BYTES`, `GEMINI_MAX_ATTACHMENT_TOKENS`, `GEMINI_MAX_TOKENS_PER_MINUTE`, `MEDIA_WATCHER`, `MEDIA_QWEN_MODEL`, `MEDIA_TRANSCRIBER_URL` and `SOCIAL_POSTS_ENABLED`. The Qwen watcher reads `MODELSCOPE_API_KEY`; reply fetching on YouTube reads `YOUTUBE_API_KEY`.

Derivations: [Multimodal Intake Research](../research/multimodal.md) and [Social Post Viewing Research](../research/social-post-viewing.md).

## Source Files

- `src/discord/attachments.ts`, `src/discord/byteBudget.ts`, `src/discord/messageContent.ts`
- `src/agent/attachments.ts`, `src/agent/attachmentCost.ts`, `src/agent/attachmentLimits.ts`, `src/agent/mediaPrefix.ts`
- `src/agent/media/` (`turnMedia.ts`, `plan.ts`, `watch.ts`, `qwenWatch.ts`, `frames.ts`, `transcribe.ts`, `filesUpload.ts`, `digest.ts`, `contentKey.ts`, `youtubeStreams.ts`)
- `src/agent/session.ts` (`stripAttachmentBytes`), `src/agent/roka.ts` (turn wiring)
- `src/discord/socialPosts/` (`service.ts`, `urls.ts`, `ytDlp.ts`, `media.ts`, `format.ts`, `threads.ts`, `replies/`)
- `src/agent/tools/readReplies.ts`, `src/agent/replyIntent.ts`, `src/agent/promptSafety.ts`
- `asr/server.py`, `docker-compose.yml` (`asr` service)
