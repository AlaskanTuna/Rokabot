# Configuration

Reference for every `config.yml` key, its default, its environment override and its bounds, plus the secrets in `.env`.

## At a Glance

- **Secrets:** live in `.env`. See [Secrets](#secrets).
- **Tunables:** live in `config.yml` at the project root. `ROKABOT_CONFIG_PATH` points the bot at another file.
- **Precedence:** environment override, then `config.yml`, then the code default in `src/config.ts`.
- **Validation:** runs once at startup. A bad value stops the bot with an error that names the key.
- **Apply a Change:** restart the bot. With Docker, run `docker compose restart roka` after a `config.yml` edit, and `docker compose up -d` after a `.env` edit.
- **Persona Studio:** `npm run studio` edits `config.yml` and `.env` through a local API that runs this validation before it saves. See [Persona Studio](../../studio/README.md).

![Config Layers](../diagrams/config-layers.svg)

Secrets, `config.yml` and environment overrides merge in `src/config.ts`, which validates them before the bot starts.

## How to Read the Tables

- **Default:** the value the code uses when the key is missing. When the shipped `config.yml` sets another value, the cell adds "shipped" and that value.
- **Env Override:** the variable `src/config.ts` reads before `config.yml`. A dash means none. Integer variables reject decimals.
- **Bounds:** the range from `NUMERIC_BOUNDS`, written as `min..max` or `>= min`. A value outside it stops the bot.

## Secrets

`.env.example` lists every secret. `requiredEnv` in `src/config.ts` stops the bot when a required one is empty.

| Variable             | Required                                                                                                             | What It Does                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`      | Always                                                                                                               | Bot token.                                                                                                                                            |
| `DISCORD_CLIENT_ID`  | Always                                                                                                               | Application ID. Slash commands register under it.                                                                                                     |
| `GEMINI_API_KEY`     | When the main or fallback model, `embeddings.provider` or `media.watcher` is Gemini. Always without an `llm:` block. | Gemini API key.                                                                                                                                       |
| `ANTHROPIC_API_KEY`  | When `llm.main` or `llm.fallback` uses `provider: anthropic`                                                         | Anthropic API key.                                                                                                                                    |
| `OPENAI_API_KEY`     | When `llm.main` or `llm.fallback` uses `provider: openai`, or `embeddings.provider` is `openai`                      | OpenAI API key.                                                                                                                                       |
| `MODELSCOPE_API_KEY` | When `llm.main` or `llm.fallback` uses `provider: modelscope`                                                        | ModelScope token. Without an `llm:` block it turns on the Qwen fallback. It also funds the qwen media watcher.                                        |
| `TYPESAFE_API_KEY`   | No                                                                                                                   | Jev judgments. Without it, the main model judges passive memory when an `llm:` block exists, and passive memory drops every episode when it does not. |
| `TAVILY_API_KEY`     | No                                                                                                                   | Web search. Without it, the search tool answers that web search is not configured.                                                                    |
| `YOUTUBE_API_KEY`    | No                                                                                                                   | Top comments on linked YouTube videos. Without it, YouTube replies report as unavailable.                                                             |

Other environment variables:

| Variable                  | What It Does                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `ROKABOT_DB_PATH`         | SQLite file path. The default is `data/rokabot.db`. `:memory:` gives an isolated database. |
| `ROKABOT_CONFIG_PATH`     | Path to `config.yml`.                                                                      |
| `GRAPHIFY_GEMINI_API_KEY` | Default key for `npm run test:live`. Keep it separate from `GEMINI_API_KEY`.               |
| `DEV_GEMINI_API_KEY`      | Second dev key. Select it with `ROKABOT_HARNESS_KEY=DEV_GEMINI_API_KEY`.                   |
| `ROKABOT_HARNESS_KEY`     | Names the key that funds a `npm run test:live` run.                                        |
| `ROKA_TAG`                | Compose image tag. The default is `stable`. Pin with `vX.Y.Z` or follow `vX.Y`.            |
| `ROKA_REGISTRY`           | Compose image registry. The default is `ghcr.io/alaskantuna`.                              |
| `COMPOSE_PROFILES`        | `autoupdate` starts Watchtower. `local-embeddings` starts the embeddings sidecar.          |

## `jev`

Jev runs only when `TYPESAFE_API_KEY` is set.

| Key                         | Default                | Env Override    | What It Does                                                                               |
| --------------------------- | ---------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `jev.model`                 | `jev-1.13.0`           | `JEV_MODEL`     | Pinned Jev version. Thresholds are tuned against one version.                              |
| `jev.timeoutMs`             | `1200`                 | —               | Deadline for the in-reply judgment. One attempt, no retry. Bounds `>= 1`.                  |
| `jev.memoryTimeoutMs`       | `5000`                 | —               | Deadline for memory admission and verification judgments. Bounds `>= 1`.                   |
| `jev.tone`                  | `shadow`; shipped `on` | `JEV_TONE`      | `off`, `shadow` (ask Jev and log only) or `on` (Jev picks the tone).                       |
| `jev.referents`             | `shadow`               | `JEV_REFERENTS` | `off`, `shadow` or `on`. In `on`, Jev settles member names the resolver found ambiguous.   |
| `jev.prefetch`              | `shadow`               | `JEV_PREFETCH`  | `off`, `shadow` (log what it would prefetch) or `on` (search before the first model call). |
| `jev.toneMinProbability`    | `0.3`                  | —               | Below this probability, the regex tone stays. Bounds `0..1`.                               |
| `jev.prefetchMinNoul`       | `0.7`                  | —               | In `on` mode, the `needs_lookup` probability that starts a Tavily search. Bounds `0..1`.   |
| `jev.prefetchWaitMs`        | `4000`                 | —               | How long the first model call waits for a started prefetch. Bounds `>= 0`.                 |
| `jev.referentMinConfidence` | `0.8`                  | —               | In `on` mode, below this confidence an ambiguous name stays unresolved. Bounds `0..1`.     |

## `gemini`

These keys drive the legacy route (no `llm:` block). Some apply to every route, as noted.

| Key                          | Default                                                  | Env Override                   | What It Does                                                                                                                                    |
| ---------------------------- | -------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `gemini.model`               | `gemini-2.0-flash-lite`; shipped `gemini-3.5-flash-lite` | `GEMINI_MODEL`                 | Legacy main model. Also the model of the Gemini media watcher.                                                                                  |
| `gemini.extractionModel`     | Value of `gemini.model`                                  | `GEMINI_EXTRACTION_MODEL`      | Legacy background extraction model.                                                                                                             |
| `gemini.timeout`             | `15000`; shipped `20000`                                 | `GEMINI_TIMEOUT`               | Request timeout in ms. Also the default `timeoutMs` of every `llm.models` entry. Bounds `>= 1`.                                                 |
| `gemini.maxRetries`          | `1`; shipped `3`                                         | `GEMINI_MAX_RETRIES`           | Validated (`>= 0`), but no runtime code reads it. Live retries use `gemini.liveMaxRetries`.                                                     |
| `gemini.maxOutputTokens`     | `300`; shipped `500`                                     | `GEMINI_MAX_OUTPUT_TOKENS`     | Reply token cap. Also the default `maxOutputTokens` of every `llm.models` entry. Bounds `>= 1`.                                                 |
| `gemini.maxAttachmentTokens` | `125000`                                                 | `GEMINI_MAX_ATTACHMENT_TOKENS` | Largest measured attachment token cost in one turn, on every route. Bounds `10890..125000`.                                                     |
| `gemini.maxTokensPerMinute`  | `125000`                                                 | `GEMINI_MAX_TOKENS_PER_MINUTE` | Tokens per rolling minute before new attachment turns are declined. Bounds `gemini.maxAttachmentTokens..125000`.                                |
| `gemini.safetyThreshold`     | `OFF`                                                    | `GEMINI_SAFETY_THRESHOLD`      | Harm block threshold for all four Gemini categories: `OFF`, `BLOCK_NONE`, `BLOCK_ONLY_HIGH`, `BLOCK_MEDIUM_AND_ABOVE` or `BLOCK_LOW_AND_ABOVE`. |
| `gemini.maxLlmCalls`         | `4`                                                      | —                              | Most chained model calls in one turn, on every route. Each turn reserves this many rate-limit slots. Bounds `>= 1`.                             |
| `gemini.hedgeAfterMs`        | `5000`                                                   | `GEMINI_HEDGE_AFTER_MS`        | Legacy route: start the same call on the fallback after this many ms, and keep the first answer. `0` turns it off. Bounds `>= 0`.               |
| `gemini.liveMaxRetries`      | `2`                                                      | `GEMINI_LIVE_MAX_RETRIES`      | Retries after a failed live reply, on every route. Bounds `>= 0`.                                                                               |
| `gemini.retryRpmFloor`       | `2`                                                      | `GEMINI_RETRY_RPM_FLOOR`       | Remaining requests per minute a live retry needs. Bounds `>= 0`.                                                                                |
| `gemini.retryBackoffBaseMs`  | `1000`                                                   | `GEMINI_RETRY_BACKOFF_BASE_MS` | First full-jitter retry backoff in ms. It doubles each retry. Bounds `>= 0`.                                                                    |
| `gemini.retryBackoffCapMs`   | `12000`                                                  | `GEMINI_RETRY_BACKOFF_CAP_MS`  | Largest retry backoff in ms. Bounds `>= 1`.                                                                                                     |
| `gemini.turnDeadlineMs`      | `60000`; shipped `63000`                                 | `GEMINI_TURN_DEADLINE_MS`      | Time budget for the live retry loop. A retry starts only if a full request timeout still fits. Bounds `>= 1`.                                   |

## `fallback`

The legacy fallback, used when `config.yml` has no `llm:` block and `MODELSCOPE_API_KEY` is set.

| Key                  | Default                                  | Env Override     | What It Does                                                                                                            |
| -------------------- | ---------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `fallback.model`     | `Qwen/Qwen3.5-122B-A10B`                 | `FALLBACK_MODEL` | ModelScope model that answers when the main model fails.                                                                |
| `fallback.baseUrl`   | `https://api-inference.modelscope.ai/v1` | —                | OpenAI-compatible ModelScope endpoint. `provider: modelscope` entries in `llm.models` and the qwen watcher also use it. |
| `fallback.timeoutMs` | `15000`                                  | —                | Request deadline for the fallback. Bounds `>= 1`.                                                                       |
| `fallback.stickyMs`  | `300000`                                 | —                | After the fallback answers, later turns start on it for this long. `0` turns it off. Bounds `>= 0`.                     |

## `llm`

The `llm:` block picks the main and fallback models. Without it, the bot runs `gemini.model` with the legacy fallback. [Models](models.md) covers each profile, effort and limit.

| Key                            | Default                       | Env Override                         | What It Does                                                                                                                                  |
| ------------------------------ | ----------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `llm.main`                     | None; required in the block   | `LLM_MAIN`                           | Key under `llm.models` for the main model.                                                                                                    |
| `llm.fallback`                 | None                          | `LLM_FALLBACK` (`none` turns it off) | Key under `llm.models` for the fallback model.                                                                                                |
| `llm.hedgeAfterMs`             | `0`                           | —                                    | Start the same call on the fallback after this many ms. `0` turns it off. Bounds `>= 0`.                                                      |
| `llm.stickyMs`                 | `300000`                      | —                                    | After the fallback answers, later turns start on it for this long. Bounds `>= 0`.                                                             |
| `llm.monthlyBudgetUsd`         | `{ anthropic: 5, openai: 5 }` | —                                    | Local monthly spend cap per paid provider. Background jobs stop at 80%, replies at 100%. Bounds `>= 0`.                                       |
| `llm.modelscopeDailyMagicubes` | `250`                         | —                                    | Magicubes one ModelScope key is expected to get a day. Bounds `>= 1`.                                                                         |
| `llm.models.<key>`             | —                             | —                                    | One model entry: `provider`, `model`, and optional `effort`, `timeoutMs`, `maxOutputTokens`, `baseUrl`, `limits`. Only tested profiles start. |

`LLM_MAIN` or `LLM_FALLBACK` without an `llm:` block stops the bot. `LLM_FALLBACK=none` is the one exception.

## `rateLimit`

These limits apply to Gemini routes. A Gemini entry in `llm.models` inherits them unless its own `limits` override them.

| Key             | Default | Env Override     | What It Does                                                                                                                    |
| --------------- | ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `rateLimit.rpm` | `15`    | `RATE_LIMIT_RPM` | Sliding-window cap on model requests per minute. Each turn reserves `gemini.maxLlmCalls` slots. Bounds `>= gemini.maxLlmCalls`. |
| `rateLimit.rpd` | `500`   | `RATE_LIMIT_RPD` | Cap on model requests per day. Bounds `>= 1`.                                                                                   |

## `session`

| Key                            | Default                    | Env Override          | What It Does                                                                 |
| ------------------------------ | -------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `session.ttl`                  | `300000`; shipped `500000` | `SESSION_TTL_MS`      | Idle time in ms before a channel's session is dropped. Bounds `>= 1`.        |
| `session.windowSize`           | `20`                       | `SESSION_WINDOW_SIZE` | Most messages kept in a session and rehydrated from SQLite. Bounds `>= 1`.   |
| `session.maxRehydrationAge`    | `7200000`                  | —                     | Oldest message, in ms, that rehydration loads. Bounds `>= 0`.                |
| `session.historyRetentionDays` | `7`                        | —                     | Days before session history is pruned. The prune runs hourly. Bounds `>= 1`. |

## `discord`

| Key                                  | Default                | Env Override                            | What It Does                                                                    |
| ------------------------------------ | ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| `discord.maxMessageLength`           | `2000`; shipped `1500` | `DISCORD_MAX_MESSAGE_LENGTH`            | Character cap for one reply. Bounds `1..3927`.                                  |
| `discord.maxAttachmentBytesPerTurn`  | `10485760`             | `DISCORD_MAX_ATTACHMENT_BYTES_PER_TURN` | Attachment bytes one turn may reserve. Bounds `10485760..31457280`.             |
| `discord.maxInFlightAttachmentBytes` | `33554432`             | `DISCORD_MAX_INFLIGHT_ATTACHMENT_BYTES` | Attachment bytes downloading across all channels at once. Bounds `>= 31457280`. |

## `socialPosts`

| Key                               | Default  | Env Override           | What It Does                                                                                           |
| --------------------------------- | -------- | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `socialPosts.enabled`             | `true`   | `SOCIAL_POSTS_ENABLED` | Read X, Bluesky, YouTube, TikTok, Reddit, Instagram, Bilibili and Threads links in triggered messages. |
| `socialPosts.maxLookupsPerTurn`   | `1`      | —                      | Linked posts opened per turn. Bounds `1..1`.                                                           |
| `socialPosts.timeoutMs`           | `6000`   | —                      | Longest wait for one linked post. A slower lookup is skipped. Bounds `1..30000`.                       |
| `socialPosts.maxTextChars`        | `1500`   | —                      | Post text kept per post. Bounds `1..10000`.                                                            |
| `socialPosts.cacheTtlMs`          | `900000` | —                      | How long an opened post is reused. Bounds `>= 0`.                                                      |
| `socialPosts.maxCacheEntries`     | `256`    | —                      | Posts kept in the reuse cache. Bounds `1..10000`.                                                      |
| `socialPosts.maxReplies`          | `5`      | —                      | Replies read per `read_replies` call, most-liked first. Bounds `1..10`.                                |
| `socialPosts.maxRepliesOnRequest` | `50`     | —                      | Most replies read when the user asks for more. Bounds `1..50`.                                         |
| `socialPosts.maxReplyChars`       | `280`    | —                      | Text kept per reply. Bounds `40..1000`.                                                                |
| `socialPosts.ytDlpPath`           | `yt-dlp` | —                      | `yt-dlp` binary for YouTube, TikTok, Reddit, Instagram and Bilibili.                                   |

## `media`

| Key                              | Default                | Env Override            | What It Does                                                                                                                                                                |
| -------------------------------- | ---------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media.watcher`                  | `gemini`               | `MEDIA_WATCHER`         | How audio and video reach the model. `gemini` or `qwen` watches first, and the other takes over on failure. `direct` sends the file to the reply model. `off` does neither. |
| `media.watchTimeoutMs`           | `20000`                | —                       | Deadline for one watch call. Bounds `5000..60000`.                                                                                                                          |
| `media.digestMaxOutputTokens`    | `2400`; shipped `3200` | —                       | Output cap for the digest JSON. Bounds `400..4000`.                                                                                                                         |
| `media.skimClips`                | `8`                    | —                       | Most evenly spaced clips taken from a video too long to watch whole. Bounds `3..9`.                                                                                         |
| `media.skimClipSeconds`          | `10`                   | —                       | Length of each skim clip. Bounds `2..30`.                                                                                                                                   |
| `media.maxStreamedUploadBytes`   | `52428800`             | —                       | Largest file streamed to the Gemini Files API to watch whole. Bounds `10485760..104857600`.                                                                                 |
| `media.uploadTimeoutMs`          | `45000`                | —                       | Deadline to stream one file and wait until it is ready. Bounds `10000..120000`.                                                                                             |
| `media.qwen.model`               | `Qwen/Qwen3.5-35B-A3B` | `MEDIA_QWEN_MODEL`      | ModelScope vision model for the qwen watcher. Needs `MODELSCOPE_API_KEY`.                                                                                                   |
| `media.qwen.secondsPerFrame`     | `4`                    | —                       | One frame per this many seconds of the watched span. Bounds `0.5..30`.                                                                                                      |
| `media.qwen.minFrames`           | `16`                   | —                       | Fewest frames for any video. Bounds `4..32`.                                                                                                                                |
| `media.qwen.maxFrames`           | `32`                   | —                       | Most frames for any video. Bounds `4..32`.                                                                                                                                  |
| `media.qwen.frameHeight`         | `360`                  | —                       | Frame height in pixels. Bounds `144..720`.                                                                                                                                  |
| `media.qwen.timeoutMs`           | `30000`                | —                       | Deadline for one qwen watch call. Bounds `5000..90000`.                                                                                                                     |
| `media.transcriber.url`          | Empty                  | `MEDIA_TRANSCRIBER_URL` | Speech-to-text sidecar for the qwen watcher. Empty turns it off. Compose sets `http://asr:8000` unless `.env` sets the variable.                                            |
| `media.transcriber.timeoutMs`    | `45000`                | —                       | Deadline to transcribe one video's audio. Bounds `5000..120000`.                                                                                                            |
| `media.transcriber.maxSpeechSec` | `120`                  | —                       | Speech transcribed per video after silence and music are skipped. Bounds `10..600`.                                                                                         |
| `media.transcriber.maxAudioSec`  | `180`                  | —                       | Audio sent per video. Bounds `30..900`.                                                                                                                                     |

## `memory`

Passive memory needs a judge. With `TYPESAFE_API_KEY`, Jev judges. Without it, the main model judges when an `llm:` block exists. Otherwise passive memory drops every episode.

### Capture and Prompt

| Key                             | Default    | Env Override                      | What It Does                                                                                                                                             |
| ------------------------------- | ---------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory.bufferSize`             | `30`       | `MEMORY_BUFFER_SIZE`              | Messages in the in-memory passive buffer per channel. Bounds `>= 1`.                                                                                     |
| `memory.contextSize`            | `10`       | —                                 | Overheard messages added to one prompt. A value above `bufferSize` has no effect. Bounds `>= 1`.                                                         |
| `memory.channelMonitorTtlMs`    | `86400000` | —                                 | How long a channel stays monitored after the last mention. Bounds `>= 1`.                                                                                |
| `memory.maxClaimsPerTurn`       | `10`       | `MEMORY_MAX_CLAIMS_PER_TURN`      | Most claims in one reply. Bounds `>= 1`.                                                                                                                 |
| `memory.retrievalTokenBudget`   | `350`      | `MEMORY_RETRIEVAL_TOKEN_BUDGET`   | Approximate token budget for the claims block. Bounds `>= 1`.                                                                                            |
| `memory.guildFactsTokenBudget`  | `150`      | `MEMORY_GUILD_FACTS_TOKEN_BUDGET` | Approximate token budget for unexpired facts about this server. Bounds `>= 0`.                                                                           |
| `memory.recentParticipantLimit` | `3`        | `MEMORY_RECENT_PARTICIPANT_LIMIT` | Recent non-speakers considered for retrieval. Bounds `>= 1`.                                                                                             |
| `memory.speakerMinShare`        | `0.5`      | `MEMORY_SPEAKER_MIN_SHARE`        | Smallest share of selected claims kept for the speaker. Bounds `0..1`.                                                                                   |
| `memory.privacy`                | `relaxed`  | `MEMORY_PRIVACY`                  | `relaxed` shares memory across the server. `balanced` keeps private channels apart. `strict` keeps every channel apart. `off` keeps no long-term memory. |

### Retention

| Key                                    | Default      | Env Override                              | What It Does                                                                              |
| -------------------------------------- | ------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| `memory.maxActiveClaimsPerUser`        | `20`         | `MEMORY_MAX_ACTIVE_CLAIMS_PER_USER`       | Active claim cap per user. Pinned claims are exempt. Bounds `>= 1`.                       |
| `memory.stableClaimRetentionDays`      | `180`        | —                                         | Days before identity and social claims expire. Bounds `>= 1`.                             |
| `memory.claimRetentionDays`            | `30`         | `MEMORY_CLAIM_RETENTION_DAYS`             | Days before lifestyle, interest and personality claims expire. Bounds `>= 1`.             |
| `memory.transientClaimRetentionDays`   | `14`         | —                                         | Days before opinion, misc and currently-watching claims expire. Bounds `>= 1`.            |
| `memory.deadClaimRetentionDays`        | `30`         | —                                         | Days to keep rejected and superseded claims after they end. Bounds `>= 1`.                |
| `memory.failedExtractionRetentionDays` | `7`          | `MEMORY_FAILED_EXTRACTION_RETENTION_DAYS` | Days to keep failed extraction jobs and their payloads. Bounds `>= 1`.                    |
| `memory.salienceHalfLifeDays`          | `30`         | —                                         | Days for claim salience to halve after its last observation. Bounds `>= 1`.               |
| `memory.recallCooldownMs`              | `21600000`   | —                                         | A recalled claim scores lower for this long unless the message matches it. Bounds `>= 0`. |
| `memory.episodeRetentionDays`          | `90`         | —                                         | Days to keep episode summaries and embeddings. Bounds `>= 1`.                             |
| `memory.mediaRetentionDays`            | `90`         | —                                         | Days after the last share before a watched-media digest is deleted. Bounds `1..365`.      |
| `memory.vaultExportDir`                | `data/vault` | `MEMORY_VAULT_EXPORT_DIR`                 | Output folder for read-only Obsidian vault exports.                                       |

### Extraction

| Key                           | Default  | Env Override                    | What It Does                                                                                                                             |
| ----------------------------- | -------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `memory.episodeLullMs`        | `180000` | —                               | Channel silence that closes an open episode. Bounds `>= 1`.                                                                              |
| `memory.episodeMaxMessages`   | `25`     | —                               | Delta messages that close an episode. The bot uses at most `bufferSize - 3`. Bounds `1..bufferSize - 3`.                                 |
| `memory.admitThreshold`       | `0.5`    | —                               | Smallest Jev `lasting_fact` probability. A lower or missing judgment drops the episode. Bounds `0..1`.                                   |
| `memory.verifyThreshold`      | `0.5`    | —                               | Smallest Jev probability for durable and attributed operations. Bounds `0..1`.                                                           |
| `memory.modelAdmitThreshold`  | `0.7`    | —                               | Same as `admitThreshold` when the main model judges. Uncalibrated. Bounds `0..1`.                                                        |
| `memory.modelVerifyThreshold` | `0.7`    | —                               | Same as `verifyThreshold` when the main model judges. Uncalibrated. Bounds `0..1`.                                                       |
| `memory.extractionSampleRate` | `0.1`    | `MEMORY_EXTRACTION_SAMPLE_RATE` | Share of rejected conversations kept as text for offline labels. `0` turns it off. Never sampled when `privacy` is `off`. Bounds `0..1`. |
| `memory.extractionSampleDays` | `14`     | `MEMORY_EXTRACTION_SAMPLE_DAYS` | Days a rejected-conversation sample is kept. Bounds `1..90`.                                                                             |
| `memory.reclassifyMaxPerRun`  | `20`     | `MEMORY_RECLASSIFY_MAX_PER_RUN` | Most misfiled facts moved to a better category per daily run. `0` turns it off. Bounds `0..100`.                                         |

### Recall

| Key                              | Default  | Env Override    | What It Does                                                                                                       |
| -------------------------------- | -------- | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `memory.recall`                  | `shadow` | `MEMORY_RECALL` | `legacy` uses the four memory blocks. `shadow` uses them and logs unified recall. `unified` uses one ranked block. |
| `memory.recallTokenBudget`       | `600`    | —               | Approximate token budget for the unified block. Bounds `200..2000`.                                                |
| `memory.recallCoreFacts`         | `3`      | —               | Speaker facts always recalled: pinned, then nickname, then pronouns. Bounds `0..5`.                                |
| `memory.factMinSimilarity`       | `0.65`   | —               | Smallest cosine similarity for a member fact in unified recall. Bounds `0..1`.                                     |
| `memory.serverFactMinSimilarity` | `0.65`   | —               | Smallest cosine similarity for a server fact in unified recall. Bounds `0..1`.                                     |
| `memory.episodeRecallK`          | `3`      | —               | Most episode summaries recalled in one guild turn. Bounds `1..10`.                                                 |
| `memory.episodeTokenBudget`      | `200`    | —               | Approximate token budget for the episode block. Bounds `>= 1`.                                                     |
| `memory.episodeMinSimilarity`    | `0.7`    | —               | Smallest cosine similarity for episode recall. Bounds `0..1`.                                                      |
| `memory.mediaRecallK`            | `2`      | —               | Most watched-media digests recalled in one guild turn. Bounds `0..5`.                                              |
| `memory.mediaTokenBudget`        | `400`    | —               | Approximate token budget for the watched-media block. Bounds `100..1500`.                                          |
| `memory.mediaMinSimilarity`      | `0.7`    | —               | Smallest cosine similarity for watched-media recall. Bounds `0..1`.                                                |

The four `*MinSimilarity` floors are the `gemini-embedding-2` calibration. `embeddings.minSimilarity` replaces them for another embedding fingerprint.

Two keys are deprecated. `memory.embeddingModel` is read only for the Gemini provider when `embeddings.model` is missing. `memory.embeddingTimeoutMs` is read only when `embeddings.timeoutMs` is missing.

## `embeddings`

| Key                            | Default                                                                                                                     | Env Override          | What It Does                                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `embeddings.provider`          | `gemini` with no `embeddings:` block and a `GEMINI_API_KEY`, else `local`; shipped `gemini`                                 | `EMBEDDINGS_PROVIDER` | Who turns memory text into vectors: `local` (the sidecar), `gemini` or `openai`.                                                                                                                                         |
| `embeddings.model`             | Per provider: `gemini-embedding-2` (768), `Xenova/multilingual-e5-small@761b726d-q8` (384), `text-embedding-3-small` (1536) | —                     | Embedding model. An untested model stops the bot.                                                                                                                                                                        |
| `embeddings.timeoutMs`         | `1500`                                                                                                                      | —                     | Longest wait for one embedding before recall falls back to keywords. Bounds `>= 1`.                                                                                                                                      |
| `embeddings.sidecarUrl`        | `http://embeddings:8080`                                                                                                    | —                     | Where the bot reaches the local sidecar (compose profile `local-embeddings`).                                                                                                                                            |
| `embeddings.backfillBatchSize` | `3600`                                                                                                                      | —                     | Most documents one maintenance pass embeds after a provider switch. Bounds `1..100000`.                                                                                                                                  |
| `embeddings.backfillGapMs`     | `1000`                                                                                                                      | —                     | Pause between backfill documents. Bounds `0..60000`.                                                                                                                                                                     |
| `embeddings.minSimilarity`     | None                                                                                                                        | —                     | Recall floors (`episode`, `media`, `fact`, `serverFact`) per fingerprint `provider:model:dimensions:recipe`. A provider other than `gemini` without an entry logs a warning and uses the `memory.*MinSimilarity` floors. |

## `metrics`

| Key                                 | Default | Env Override                          | What It Does                                                                                           |
| ----------------------------------- | ------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `metrics.retentionDays`             | `90`    | `METRICS_RETENTION_DAYS`              | Days before response and extraction events are pruned. The prune runs daily. Bounds `>= 1`.            |
| `metrics.diagnosticsRetentionHours` | `72`    | `METRICS_DIAGNOSTICS_RETENTION_HOURS` | Hours before failure diagnostics are pruned. They hold the triggering message verbatim. Bounds `>= 1`. |

## `report`

| Key                         | Default   | Env Override | What It Does                                                                                |
| --------------------------- | --------- | ------------ | ------------------------------------------------------------------------------------------- |
| `report.maxPerUserPerHour`  | `5`       | —            | Reports one user may file in a rolling hour. Bounds `>= 1`.                                 |
| `report.maxAttachmentBytes` | `8388608` | —            | Largest attachment copy kept with a report. Bigger files keep metadata only. Bounds `>= 1`. |
| `report.historyMessages`    | `20`      | —            | Channel history rows captured into a report. Bounds `>= 1`.                                 |
| `report.historyMaxAgeMs`    | `7200000` | —            | Only history and events this recent are captured. Bounds `>= 0`.                            |

## `emoji`

| Key                 | Default  | Env Override | What It Does                                                     |
| ------------------- | -------- | ------------ | ---------------------------------------------------------------- |
| `emoji.probability` | `0.33`   | —            | Chance of a reaction when a keyword rule matches. Bounds `0..1`. |
| `emoji.cooldownMs`  | `180000` | —            | Per-channel cooldown between reactions. Bounds `>= 0`.           |

## `reminders`

| Key                          | Default  | Env Override | What It Does                                                                                          |
| ---------------------------- | -------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `reminders.checkIntervalMs`  | `5000`   | —            | How often the scheduler checks for due reminders. Bounds `>= 1`.                                      |
| `reminders.maxPerUser`       | `5`      | —            | Most active reminders per user. Bounds `>= 1`.                                                        |
| `reminders.staleThresholdMs` | `300000` | —            | A reminder this late is dropped. A value at or below `checkIntervalMs` logs a warning. Bounds `>= 1`. |

## `games`

| Key                        | Default                   | Env Override | What It Does                                          |
| -------------------------- | ------------------------- | ------------ | ----------------------------------------------------- |
| `games.hangmanLives`       | `6`                       | —            | Wrong guesses before Hangman ends. Bounds `>= 1`.     |
| `games.hangmanTimeoutMs`   | `60000`; shipped `120000` | —            | Inactivity timeout per Hangman game. Bounds `>= 1`.   |
| `games.shiritoriTimeoutMs` | `60000`; shipped `120000` | —            | Inactivity timeout per Shiritori turn. Bounds `>= 1`. |
| `games.shinyChance`        | `0.01`                    | —            | Chance of hatching a shiny buddy pet. Bounds `0..1`.  |

## `statusCycleMs`

| Key             | Default  | Env Override | What It Does                                     |
| --------------- | -------- | ------------ | ------------------------------------------------ |
| `statusCycleMs` | `900000` | —            | Discord status rotation interval. Bounds `>= 1`. |

## `updates`

| Key                          | Default               | Env Override     | What It Does                                                                                |
| ---------------------------- | --------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `updates.notify`             | `true`                | `UPDATES_NOTIFY` | DM the application owner once per new GitHub release. The variable takes `true` or `false`. |
| `updates.repo`               | `AlaskanTuna/Rokabot` | —                | Repository whose releases are checked. Must be `owner/name`. A fork can name itself.        |
| `updates.checkIntervalHours` | `24`                  | —                | Hours between release checks. Bounds `1..168`.                                              |

## `timezone`

| Key        | Default                         | Env Override | What It Does                                                                                          |
| ---------- | ------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `timezone` | Unset; shipped `Asia/Singapore` | `TZ`         | IANA time zone for time-of-day features. When unset, each feature falls back to UTC or the host zone. |

## `logging`

| Key             | Default | Env Override | What It Does                                                                    |
| --------------- | ------- | ------------ | ------------------------------------------------------------------------------- |
| `logging.level` | `info`  | `LOG_LEVEL`  | Pino log level: `debug`, `info`, `warn` or `error`. `npm run dev` sets `debug`. |

## Character

For persona and character settings, see [Characters](characters.md).

## Startup Checks

The bot stops on these errors:

| Error                                                                  | Cause                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `Missing required environment variable: <KEY>`                         | A required secret is empty.                                            |
| `Cannot read config.yml at <path>`                                     | The file is missing.                                                   |
| `config.yml is empty or malformed`                                     | The file is not a YAML mapping.                                        |
| `Environment variable <KEY> must be a number, got: <value>`            | A numeric override is not a number. Integer overrides reject decimals. |
| `Config value <path> must be >= <min>` or `<= <max>`                   | A value is outside its bounds.                                         |
| `Config value <path> must be a finite number`                          | A numeric key holds text, `.nan` or `.inf`.                            |
| `... must be off, shadow or on` (and similar)                          | A mode key has an unknown value.                                       |
| `Config value llm.models.<key>.model has no tested <provider> profile` | The model is not in `src/agent/llm/profiles.ts`.                       |

The bot starts but logs a warning when:

- `session.ttl` is not longer than the worst live retry window.
- `gemini.turnDeadlineMs` is too short for every live retry.
- `gemini.liveMaxRetries` can never be reached because the backoff cap fires first.
- `reminders.staleThresholdMs` is at or below `reminders.checkIntervalMs`.
- `memory.contextSize` is above `memory.bufferSize`.
- A non-Gemini embedding provider has no `embeddings.minSimilarity` entry.

## Source Files

- `config.yml`
- `.env.example`
- `src/config.ts` (loader, `requiredEnv`, `NUMERIC_BOUNDS`)
- `src/agent/llm/profiles.ts` (tested model profiles)
- `src/agent/memory/embeddings/fingerprint.ts` (embedding defaults)
- `docker-compose.yml` (compose variables)
