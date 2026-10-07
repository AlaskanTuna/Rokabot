# Social Post Viewing Research

Inspected on 2026-10-07 for Rokabot's Raspberry Pi 5 arm64, Alpine Docker image, memory limit, short reply budget, and no-login deployment.

## Decision

Use yt-dlp directly for metadata-only extraction from YouTube, TikTok, Reddit, Instagram, and Bilibili. Use FxTwitter's public status API for X/Twitter and Bluesky's public AppView APIs for Bluesky. Do not use Agent-Reach as Rokabot's runtime reader.

Agent-Reach is an installer, status checker, configuration layer, and router for other tools. Its optional MCP interface reports status but does not read posts. Its platform routes add Python and external CLIs, and several depend on logged-in browser sessions or cookies. Rokabot only needs bounded metadata lookup for one post in a turn, so the direct extractors and two small public API flows match the runtime and credential constraints.

yt-dlp's musl builds run on the Alpine image without Python; the onedir zip is used because the single-file build unpacks itself on every run (Pi 5, YouTube metadata: 3.5 s single-file vs 2.1 s onedir; Reddit 3.4 s and TikTok 2.0 s onedir). `--dump-json --skip-download` retrieves metadata without downloading video. It can return titles, authors, descriptions, dates, durations, counts, and thumbnails; platform availability still changes as sites change their endpoints. The selected version is pinned in `Dockerfile` and checked against the release's `SHA2-256SUMS` for amd64 and arm64.

## Platform Findings

| Platform       | Backend                                                | Public Sample                         | Result                                                                         |
| -------------- | ------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------ |
| X/Twitter      | FxTwitter status API                                   | Star Wars status `665052190608723968` | Returned public post text, author, and timestamp.                              |
| Bluesky        | Public AppView resolve-handle and get-post-thread APIs | Public `atproto.com` post             | Returned post text, author, timestamp, and external card.                      |
| YouTube Shorts | yt-dlp metadata                                        | `18NGQq7p3LY`                         | Returned title, uploader, duration, and thumbnail; no captions were available. |
| Reddit         | yt-dlp metadata                                        | `r/videos/comments/6rrwyj`            | Returned title, author, duration, and thumbnail; no captions were available.   |
| TikTok         | yt-dlp metadata                                        | `7059698374567611694`                 | Returned uploader, duration, and thumbnail; description was empty.             |
| Instagram Reel | yt-dlp metadata                                        | `Chunk8-jurw`                         | Returned partial metadata and a thumbnail without login.                       |
| Bilibili       | yt-dlp metadata                                        | `BV13x41117TL`                        | Returned title, uploader, duration, description, and thumbnail.                |

## Live Experiments

Direct yt-dlp runs below used version `2026.08.19`, no cookies, no user config, no retries, an isolated cache, and a 10-second socket timeout. Wall times are one measurement per URL on the research host, not Raspberry Pi estimates or latency percentiles.

| Tool        | Target             | Wall Time | Result                                                                  |
| ----------- | ------------------ | --------: | ----------------------------------------------------------------------- |
| yt-dlp      | YouTube Short      |   4.174 s | Exit 0; title, uploader, 3-second duration, and thumbnail; no captions. |
| yt-dlp      | X/Twitter status   |   3.404 s | Exit 1; the extractor's unauthenticated request failed.                 |
| yt-dlp      | Reddit video post  |   5.953 s | Exit 0; title, author, 12-second duration, and thumbnail; no captions.  |
| yt-dlp      | TikTok video       |   3.412 s | Exit 0; generic title, uploader, 6-second duration, and thumbnail.      |
| yt-dlp      | Instagram Reel     |   4.098 s | Exit 0; partial metadata and thumbnail.                                 |
| yt-dlp      | Bluesky video post |   2.326 s | Exit 1; the extractor's AppView request returned HTTP 400.              |
| yt-dlp      | Bilibili video     |   3.530 s | Exit 0; title, uploader, duration, description, and thumbnail.          |
| Agent-Reach | Doctor/status      |   2.249 s | Exit 0; health report only, not a post-reading operation.               |

The research host also opened a public YouTube Short through Agent-Reach's bundled yt-dlp in 1.912 seconds. That exercised the dependency, not an Agent-Reach post reader. Metadata successes in this sample took 3.4–6.0 seconds; access and timing vary by network and platform.

## X/Twitter Finding

yt-dlp failed for the tested X status without authentication. Additional real server links confirmed that it also reports “No video could be found in this tweet” for image and text posts. X is therefore read through `GET https://api.fxtwitter.com/status/<id>`, which returned public `tweet.text`, author, timestamp, photos, video thumbnails, quote details, and counts without authentication. FxTwitter media URLs are passed through Rokabot's existing guarded attachment path before any image is sent to Gemini.

## Limits

The integration opens at most one post per turn, caps the wait and text, keeps one image slot shared with user uploads, and does not download video or captions. Public posts may still be unavailable because of deletion, age gates, site blocks, or changing endpoints. Failures keep the original message and mark the linked post as unopened. The in-memory cache stores normalized metadata only.
