# Graph Report - dead-code  (2026-11-03)

## Corpus Check
- 710 files · ~592,546 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 30 file(s) not represented in the graph (top: (none) 13, .jsonl 11, .rss 2)

## Summary
- 5743 nodes · 15885 edges · 250 communities (198 shown, 52 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 532 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a82fc9a4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- profiles.ts
- jevReplay.ts
- qwenWatch.ts
- database.ts
- Project Linting Config
- buddy.ts
- messageBuilder.ts
- getDb
- src/games/hangman.ts
- scheduler.ts
- searchNativeAnthropic.test.ts
- queries.ts
- discordDoubles.ts
- messageCreate.ts
- reminder.ts
- __tests__/tools.test.ts
- views.ts
- replies/service.ts
- guildFactDates.ts
- episodeTracker.ts
- Dev Tooling Dependencies
- WindowedSessionService
- Secrets.tsx
- closeDb
- metricsStore.ts
- turnContext.ts
- run.ts
- dependencies
- retriever.ts
- rateLimiter.ts
- workspace.ts
- TypeScript Configuration
- turnMedia.ts
- YamlForm.tsx
- scripts
- recall-calibration-sample.ts
- logger.ts
- youtubeStreams.ts
- toolTriggerScoring.ts
- memoryEpisodeReplay.ts
- getAnimeSchedule.ts
- worst-case.ts
- @google/adk
- pack.ts
- configShared.tsx
- Multimodal Intake Research
- recall.ts
- generateObject.ts
- discord.js
- charts.ts
- parts.tsx
- Inline Data Contract
- TypeScript Build Config
- handler.ts
- extractionSchema.test.ts
- anthropicLlm.ts
- config
- budget.ts
- schedule.test.ts
- Moods.tsx
- reportCommand.ts
- extractor.ts
- digest.ts
- markdown.ts
- Speech-to-Text HTTP Server
- socialPosts/service.ts
- fixtures.ts
- parsers.ts
- Design System Documentation
- vitest
- Prefetch Measurement Tools
- package.json
- test
- File Upload Handling
- messageCreate.test.ts
- anthropicMain.eval.test.ts
- roka Service
- quotaDiagnostic.ts
- getWeather.ts
- views.test.ts
- watch.ts
- nativeGemini.ts
- Search Prefetch Reporting
- models.ts
- messageContent.ts
- PackFileScreen.tsx
- src/index.ts
- config.ts
- Social Post Viewing Research
- harness/tokens.ts
- DiscordPreview.tsx
- extractionSchema.ts
- markdownGuard.ts
- attachmentCost.ts
- memoryClaimSchema.ts
- ref_node_crypto
- WAV File Validation
- load.ts
- predicates.ts
- ASR Sidecar Service
- app.test.ts
- fallbackModel.ts
- timezone.ts
- messageEdge
- duration.ts
- turnMedia.test.ts
- Commit Linting Rules
- Features
- Raspberry Pi Runbook
- Speech Budget Management
- Configuration Changes
- redditFeed.ts
- replyShape.ts
- Documentation Style Guide
- Git Commit Standards
- Coding Best Practices
- Prompt Engine
- promptSafety.ts
- Audio Decoding Tests
- Memory
- metadata.ts
- emojiReactor.ts
- hiddenRetractions.test.ts
- test-chat.ts
- replyReader
- transcribe.test.ts
- Speech Server Engines
- Linting Configuration
- HTTP Request Handler
- probe-llm-profile.ts
- test-adk-smoke.ts
- Speech Transcription Processing
- Speech Parsing Tests
- textEdit.ts
- Rules Across Modules
- linesGolden.test.ts
- deploy Job
- ref_node_fs
- channelVisibility.test.ts
- Text Cleaning Utilities
- reliability.ts
- verification.test.ts
- sessionStore.ts
- UI TypeScript Configuration
- System Architecture
- roka.test.ts
- agent/attachments.ts
- anthropicLlm.test.ts
- yamlEdit.ts
- render.ts
- Configuration
- persona-replay.ts
- searchPrefetch.ts
- privacy
- packs.ts
- ToneKey
- queries.test.ts
- updateNotifier.ts
- promptGolden.test.ts
- roka.ts
- README.md
- recall-calibration.test.ts
- Characters
- judgments.ts
- Product
- API and Security Tests
- Models
- tools/index.ts
- scheduler.test.ts
- Deployment and Setup Guide
- Auto-Deploy Platforms
- Roka Voice v3: Restoring Variety on Haiku
- guildFactDates.test.ts
- persona-report.ts
- Embedding Project Config
- searchAnime.ts
- config-pages.spec.ts
- FakeInteraction
- toolTrigger.ts
- Features
- Embedding Service Docs
- react
- voice.spec.ts
- identity.spec.ts
- extractionQueue.ts
- yamlText.ts
- Speech Pattern Documentation
- Persona Identity Definition
- ScriptedLlm
- embeddings/client.ts
- Changelog
- Character Packs
- Contributing
- Audio Video Documentation
- Release Configuration
- Question Answering Documentation
- Speaking Style Prompts
- Annoyed Mood Prompt
- Competitive Mood Prompt
- Confident Mood Prompt
- Curious Mood Prompt
- Domestic Mood Prompt
- Flustered Mood Prompt
- Mischievous Mood Prompt
- Nostalgic Mood Prompt
- Playful Mood Prompt
- Sincere Mood Prompt
- Sleepy Mood Prompt
- Tender Mood Prompt
- Hard Boundaries Documentation
- Image Handling Documentation
- Safety Steering Prompts
- Situation Context Documentation
- Tool Usage Documentation
- Image Pruning Script
- Calm Mood Prompt
- Prompts.tsx
- @playwright/test
- measure.ts
- getCurrentTime.ts
- replyBlocks.ts
- UI Styling Assets
- pull_request_template.md
- gemini.test.ts
- socialPosts/format.ts
- statusCycler.test.ts
- reports.ts
- Decisions
- smoke.ts
- Template Speaking Prompts
- Template Calm Mood
- Cheerful Mood Prompt
- Persona Identity Prompts
- harness.eval.test.ts
- Media Watching
- Coding Guidelines (Andrej Karpathy)
- embeddings/__tests__/client.test.ts
- graphify.md
- issue-tracker.md
- rtk.md
- Deliberately Not Done
- Reference Docs (AGENTS.md)

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 242 edges
2. `vitest` - 241 edges
3. `config` - 118 edges
4. `logger` - 79 edges
5. `createMessageHandler()` - 54 edges
6. `discord.js` - 50 edges
7. `generateResponse()` - 49 edges
8. `closeDb()` - 49 edges
9. `createInteractionHandler()` - 48 edges
10. `assertClaim()` - 46 edges

## Surprising Connections (you probably didn't know these)
- `A Spent Day Is Not a Spent Minute` --references--> `computeBackoff()`  [INFERRED]
  docs/trd/reliability.md → src/agent/geminiReliability.ts
- `Client` --references--> `getJevClient()`  [INFERRED]
  docs/trd/jev.md → src/agent/jev/client.ts
- `Reply Model and Fallback` --references--> `luna()`  [INFERRED]
  docs/RUNBOOK.md → src/agent/llm/__tests__/chatCompletionsLlm.test.ts
- `At a Glance` --references--> `startCall()`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/budget.ts
- `ADK Error Delivery Constraint` --references--> `ProviderError`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/providerError.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Deploy-to-Pi CI/CD Pipeline** — _github_workflows_deploy_workflow, _github_workflows_deploy_test_job, _github_workflows_deploy_deploy_job, agents_working_conventions [EXTRACTED 0.90]
- **Multimodal Attachment Safety Pipeline** — docs_research_multimodal_global_byte_budget, docs_research_multimodal_streaming_size_guard, docs_research_multimodal_attachment_strip_history, docs_research_multimodal_tpm_ceiling_measurement, src_discord_bytebudget [INFERRED 0.95]

## Communities (250 total, 52 thin omitted)

### Community 0 - "profiles.ts"
Cohesion: 0.06
Nodes (32): scripted(), BudgetDenial, ChatCompletionsLlm, COMPATIBLE_DEFAULTS, compatibleProfile(), MODEL_PROFILES, profileFor(), PROVIDER_KEY_ENV (+24 more)

### Community 1 - "jevReplay.ts"
Cohesion: 0.13
Nodes (23): parseReplayArgs(), runReplayCli(), agreement(), buildConfusionMatrix(), buildProbabilityBins(), buildReplayTurn(), formatAgreement(), formatRecentLine() (+15 more)

### Community 2 - "qwenWatch.ts"
Cohesion: 0.10
Nodes (24): Qwen Watcher, binOf(), ChatCompletion, ContentPart, promptFor(), quoted(), QwenFrame, QwenWatchInput (+16 more)

### Community 3 - "database.ts"
Cohesion: 0.04
Nodes (90): better-sqlite3, recordShare(), remember(), EmbeddingResult, GEMINI_FINGERPRINT, geminiVector(), LOCAL_FINGERPRINT, localVector() (+82 more)

### Community 4 - "Project Linting Config"
Cohesion: 0.05
Nodes (39): useLiteralKeys, css, formatter, files, ignore, formatter, enabled, indentStyle (+31 more)

### Community 5 - "buddy.ts"
Cohesion: 0.07
Nodes (67): games Config Section, ref_discordjs_builders, handleGachaMention(), statBar(), buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount() (+59 more)

### Community 6 - "messageBuilder.ts"
Cohesion: 0.06
Nodes (43): outcomeForTurn, ReplyOutcome, clampToBudget(), fitCitations(), sourceHost(), sourceLabel(), getExpressionUrl(), lastExpressionByTone (+35 more)

### Community 7 - "getDb"
Cohesion: 0.07
Nodes (78): attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow, legalScopes() (+70 more)

### Community 8 - "src/games/hangman.ts"
Cohesion: 0.19
Nodes (23): buildHangmanBody(), handleHangmanGuess(), handleHangmanStart(), HANGMAN_COLORS, saveHangmanScore(), src_games_data_hangmanwords, src_games_data_hangmanwords_hangman_words, activeGames (+15 more)

### Community 9 - "scheduler.ts"
Cohesion: 0.12
Nodes (30): ABORT_CODES, classifyExtractionError(), ExtractionErrorClassification, SHUTDOWN_SENSITIVE_NAMES, TRANSIENT_HTTP_STATUSES, TRANSIENT_NETWORK_CODES, finishRunTrace(), noteError() (+22 more)

### Community 10 - "searchNativeAnthropic.test.ts"
Cohesion: 0.11
Nodes (8): AnthropicMessagesClient, ContentBlock, Create, HAIKU, mocks, route(), SONNET, usageRecords

### Community 11 - "queries.ts"
Cohesion: 0.10
Nodes (28): activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome, CountByPredicate (+20 more)

### Community 12 - "discordDoubles.ts"
Cohesion: 0.05
Nodes (47): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+39 more)

### Community 13 - "messageCreate.ts"
Cohesion: 0.06
Nodes (66): discord Config Section, Concurrency Binding Constraint, Global In-Flight Byte Budget, Link Priority, Lookup Limits, Model Input, Post Media, Replies (+58 more)

### Community 14 - "reminder.ts"
Cohesion: 0.10
Nodes (35): reminders Config Section, fillLine(), createToolCommandHandler(), TOOL_COMMAND_NAMES, handleAnime(), dueSlots(), handleRemind(), handleRemindAt() (+27 more)

### Community 15 - "__tests__/tools.test.ts"
Cohesion: 0.25
Nodes (7): flipCoin(), FlipCoinResult, flipCoinTool, rollDiceTool, rollDice(), RollDiceParams, RollDiceResult

### Community 16 - "views.ts"
Cohesion: 0.14
Nodes (30): distinctRememberedUsers(), memoryGrowthSeries(), newClaimsThisMonth(), retrySummary, tokenTotals, topChannels(), topPredicates(), topRememberedMembers() (+22 more)

### Community 17 - "replies/service.ts"
Cohesion: 0.23
Nodes (27): array(), nonNegativeInteger(), bilibiliAid(), fetchBilibiliReplies(), fetchBlueskyReplies(), BROWSER_USER_AGENT, compactReplyText(), failed() (+19 more)

### Community 18 - "guildFactDates.ts"
Cohesion: 0.26
Nodes (16): addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth(), monthForMonth() (+8 more)

### Community 19 - "episodeTracker.ts"
Cohesion: 0.18
Nodes (20): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), resetEpisodeTrackerForTest(), scheduleLull() (+12 more)

### Community 20 - "Dev Tooling Dependencies"
Cohesion: 0.07
Nodes (29): devDependencies, @axe-core/playwright, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, diff, @fontsource-variable/geist, @fontsource-variable/geist-mono (+21 more)

### Community 21 - "WindowedSessionService"
Cohesion: 0.16
Nodes (5): isStrippable(), WindowedSessionService, CapturingLlm, newConversation(), PNG_BASE64

### Community 22 - "Secrets.tsx"
Cohesion: 0.08
Nodes (62): App(), Ambient(), Page(), PageProps, SaveActions(), StatusBadges(), BrandMark(), checkedLabel() (+54 more)

### Community 23 - "closeDb"
Cohesion: 0.07
Nodes (27): Database File, openFixture(), REMEMBER_TURN, runTurn(), ScriptedLlm, CapturingRunner, makeInteraction(), mocks (+19 more)

### Community 24 - "metricsStore.ts"
Cohesion: 0.16
Nodes (17): metrics Config Section, countMemoryEvents(), ExtractionEventInput, FailureDiagnosticInput, getExtractionEventStatement(), getFailureDiagnosticStatement(), getMemoryEventStatement(), getResponseEventStatement() (+9 more)

### Community 25 - "turnContext.ts"
Cohesion: 0.04
Nodes (76): Where Rokabot Decides Today, GPT-6-Astra, Jev Rollout Plan, Second Opinion, Who-Is-Who Resolver, At a Glance, Client, Configuration (+68 more)

### Community 26 - "run.ts"
Cohesion: 0.13
Nodes (26): createCaptureSink(), makeGuild(), fixturePath(), loadTranscript(), main(), parseTranscriptLine(), renderTokenTable(), requestMessageContent() (+18 more)

### Community 27 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, @anthropic-ai/sdk, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml (+6 more)

### Community 28 - "retriever.ts"
Cohesion: 0.12
Nodes (29): memory Config Section, ClaimSource, touchRecalled(), ClaimRow, compareRetrieved(), getActiveClaims(), mapClaim(), MONTH_NAMES (+21 more)

### Community 29 - "rateLimiter.ts"
Cohesion: 0.11
Nodes (13): Tech Stack (AGENTS.md), RateLimiterConfig, Turn Admission, createClient(), mocks, client, mocks, rateLimiter() (+5 more)

### Community 30 - "workspace.ts"
Cohesion: 0.07
Nodes (42): Band, bandFor(), MEMORY, PanelTab, PreviewPanel(), PreviewPanelProps, DialogProps, Skeleton() (+34 more)

### Community 31 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "turnMedia.ts"
Cohesion: 0.09
Nodes (43): Coverage Plan, bytesContentKey(), DISCORD_CDN_HOSTS, discordAttachmentContentKey(), postContentKey(), requireId(), youtubeContentKey(), watchOutcomeFor() (+35 more)

### Community 33 - "YamlForm.tsx"
Cohesion: 0.15
Nodes (35): cleanComment(), Context, Group(), helpFor(), humanize(), isRecord(), MapBody(), MapFields() (+27 more)

### Community 34 - "scripts"
Cohesion: 0.06
Nodes (34): scripts, build, character, dev, dev:quiet, export:vault, format, format:check (+26 more)

### Community 35 - "recall-calibration-sample.ts"
Cohesion: 0.14
Nodes (24): chunk(), configuredEmbed(), loadShadowRows(), main(), MATCH_WINDOW_MS, matchTurnMessage(), mean(), median() (+16 more)

### Community 36 - "logger.ts"
Cohesion: 0.10
Nodes (43): logging Config Section, ref_node_module, createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleHangmanGuide(), handleLeaderboard(), buildGameContainer() (+35 more)

### Community 37 - "youtubeStreams.ts"
Cohesion: 0.12
Nodes (26): metadata, realisticFormats, AudioFormat, audioFormats(), directHttpsUrl(), finiteNumber(), hasCodec(), headersOf() (+18 more)

### Community 38 - "toolTriggerScoring.ts"
Cohesion: 0.10
Nodes (27): fixturePath, header, rememberFixturePath, searchWebFixturePath, temporaryDirectories, testCase, asCase(), asClaim() (+19 more)

### Community 39 - "memoryEpisodeReplay.ts"
Cohesion: 0.10
Nodes (27): ref_node_perf_hooks, argumentsFrom(), estimatedTokens(), inputText(), measure(), loadTranscriptLines(), main(), offlineAdapters() (+19 more)

### Community 40 - "getAnimeSchedule.ts"
Cohesion: 0.19
Nodes (17): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleParams, getCurrentSeason(), getTodayName() (+9 more)

### Community 41 - "worst-case.ts"
Cohesion: 0.13
Nodes (26): appendToBlock(), applyWorst(), base64url(), blockRange(), celebratingFaces(), CompatibleModel, Dataset, DATASETS (+18 more)

### Community 42 - "@google/adk"
Cohesion: 0.06
Nodes (40): Budgets, Usage and Cost, @google/adk, describeUsage(), KEY_ENV, main(), MODEL, nativeRoute(), Options (+32 more)

### Community 43 - "pack.ts"
Cohesion: 0.10
Nodes (48): ref_node_http, createApp(), route(), Handler, PREVIEW_FIELDS, previewQuery(), ErrorBody, fail() (+40 more)

### Community 44 - "configShared.tsx"
Cohesion: 0.07
Nodes (64): diff, DiffView(), FOCUS_ORDER, CommandPalette(), Item, DEFAULT_ROUTE, href(), listeners (+56 more)

### Community 45 - "Multimodal Intake Research"
Cohesion: 0.16
Nodes (17): ALLOWED_IMAGE_TYPES Consolidation, Attachment History Stripping, Byte Cap as Duration Proxy, Container Memory Cap Correction, Flash-Lite Modality Verification, Global In-Flight Byte Budget, Inline Data vs Files API Decision, Multimodal Intake Research (+9 more)

### Community 46 - "recall.ts"
Cohesion: 0.06
Nodes (60): channelVisibility, ChannelVisibilityResolver, registerChannelVisibility(), resetChannelVisibilityForTest(), UNKNOWN, buildEpisodeRecallBlock(), cosineSimilarity(), formatEpisodeRecallBlock() (+52 more)

### Community 47 - "generateObject.ts"
Cohesion: 0.04
Nodes (47): Background Jobs, @google/genai, adapterFor(), adapters, attempt(), BackgroundWorkload, callUsage(), failureFields() (+39 more)

### Community 48 - "discord.js"
Cohesion: 0.05
Nodes (52): Audio Intake Recommendation, PDF Intake Recommendation, discord.js, STABLE_PREFIXES, FaceGroup, FACES, TONE_FACES, allFaces (+44 more)

### Community 49 - "charts.ts"
Cohesion: 0.26
Nodes (14): @napi-rs/canvas, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+6 more)

### Community 50 - "parts.tsx"
Cohesion: 0.11
Nodes (42): lucide-react, Badge(), BadgeTone, TONES, Field(), fieldClass(), FieldProps, Option (+34 more)

### Community 51 - "Inline Data Contract"
Cohesion: 0.29
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 52 - "TypeScript Build Config"
Cohesion: 0.22
Nodes (8): ./tsconfig.json, compilerOptions, noEmit, rootDir, types, exclude, extends, include

### Community 53 - "handler.ts"
Cohesion: 0.06
Nodes (39): @huggingface/transformers, @types/node, dependencies, @huggingface/transformers, devDependencies, @types/node, typescript, engines (+31 more)

### Community 54 - "extractionSchema.test.ts"
Cohesion: 0.10
Nodes (18): GUILD_PREDICATES, comparable(), DateVariant, GEMINI_SCHEMA, keysIn(), subject, Variant, calendarDateProperties (+10 more)

### Community 55 - "anthropicLlm.ts"
Cohesion: 0.04
Nodes (89): Block, callUsage(), classifyAnthropicError(), create(), Effort, ImageMediaType, markerBlock(), mediaBlock() (+81 more)

### Community 56 - "config"
Cohesion: 0.19
Nodes (15): ActiveClaimSubject, ActiveGuildSubject, ExportedClaim, ExportedGuildClaim, exportVault(), formatClaimGroups(), formatEpisodeNote(), formatGuildNote() (+7 more)

### Community 57 - "budget.ts"
Cohesion: 0.07
Nodes (48): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, acquireSlot(), backgroundShareSpent(), billingExhaustedIn, BudgetReservation, CallInput, CONCURRENCY (+40 more)

### Community 58 - "schedule.test.ts"
Cohesion: 0.14
Nodes (12): GetAnimeScheduleResult, ScheduleEntry, containerOf(), { getAnimeSchedule }, Handler, JsonNode, makeCollector(), makeEntries() (+4 more)

### Community 59 - "Moods.tsx"
Cohesion: 0.15
Nodes (30): inMood(), addMoodText(), dependents(), MOOD_NAME, moodKeys(), moodPrompt(), moodsPath(), MoodsYaml (+22 more)

### Community 60 - "reportCommand.ts"
Cohesion: 0.06
Nodes (42): AssemblerInput, At a Glance, Bug Reports, Data Models, Data Models and Storage, Outbound Model Request, Persistence and Storage, Retention (+34 more)

### Community 61 - "extractor.ts"
Cohesion: 0.05
Nodes (57): Extraction, Jev Judgments, Memory Judge, Memory Judgments, liveAdapters(), AdmissionResult, admitEpisode(), JevUnavailableError (+49 more)

### Community 62 - "digest.ts"
Cohesion: 0.12
Nodes (31): Gemini Watcher, boundedString(), coverageLine(), cutAtWord(), formatClock(), frameInterval(), framesLine(), HEARD_LINES (+23 more)

### Community 63 - "markdown.ts"
Cohesion: 0.11
Nodes (23): blockQuote(), buildList(), codeBlock, EMOJI, emphasis(), EMPHASIS_RULES, formatTimestamp(), heading (+15 more)

### Community 64 - "Speech-to-Text HTTP Server"
Cohesion: 0.13
Nodes (17): Speech-to-text HTTP sidecar: Silero VAD -> SenseVoice language ID -> Moonshine…, collections, http_server, io, json, math, numpy, os (+9 more)

### Community 65 - "socialPosts/service.ts"
Cohesion: 0.11
Nodes (17): Process Lifecycle, resolveBlueskyDid(), ParsedBlueskyThread, createSocialPostViewer(), failure(), initializeSocialPosts(), isAbort(), isYtDlpPlatform() (+9 more)

### Community 66 - "fixtures.ts"
Cohesion: 0.08
Nodes (27): PAGES, studio_ui_e2e_fixtures_expect, Studio, test, item(), lists(), ORDER, row() (+19 more)

### Community 67 - "parsers.ts"
Cohesion: 0.12
Nodes (39): base(), BlueskyBlob, blueskyQuote(), capped(), compact(), date(), finiteNumber(), headers() (+31 more)

### Community 68 - "Design System Documentation"
Cohesion: 0.07
Nodes (27): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Action Chips, Badges (+19 more)

### Community 69 - "vitest"
Cohesion: 0.12
Nodes (29): vitest, ReplyFetchContext, hostMatches(), HOSTS, parseSocialPostUrl(), platformForHost(), target(), youtubeStartSec() (+21 more)

### Community 70 - "Prefetch Measurement Tools"
Cohesion: 0.21
Nodes (9): main(), MeasurementAnomaly, Options, parseOptions(), percentile(), PrefetchMeasurementCase, PrefetchMeasurementSummary, PrefetchMeasurementTrial (+1 more)

### Community 71 - "package.json"
Cohesion: 0.07
Nodes (27): description, engines, node, typescript, main, name, type, version (+19 more)

### Community 72 - "test"
Cohesion: 0.07
Nodes (31): Code Style, Commands, Commits, Configuration, Conventions, Documentation, Shipping, Deploy and Roll Back (+23 more)

### Community 73 - "File Upload Handling"
Cohesion: 0.17
Nodes (9): countedBody(), deleteFile(), FileResource, getFile(), sleep(), streamToFiles(), UploadedFile, videoDurationSec() (+1 more)

### Community 74 - "messageCreate.test.ts"
Cohesion: 0.14
Nodes (9): NAME_MENTION_REGEX, createRateLimiter(), handle(), metrics, mocks, turnEntryWork, assertTurnEntryRejections(), TurnEntryRejection (+1 more)

### Community 75 - "anthropicMain.eval.test.ts"
Cohesion: 0.19
Nodes (15): asObject(), asObjects(), chunkLabel(), componentDetails(), walk(), isComponentsV2Payload(), PayloadObject, renderEmbeds() (+7 more)

### Community 76 - "roka Service"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 77 - "quotaDiagnostic.ts"
Cohesion: 0.20
Nodes (12): BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey(), DIAGNOSTIC_TIMEOUT_MS, errorText(), KEY_IS_LIVE, OUTPACING_THE_CAP, SPENT_FOR_THE_DAY (+4 more)

### Community 78 - "getWeather.ts"
Cohesion: 0.15
Nodes (12): GeocodingResult, getWeather(), GetWeatherParams, GetWeatherResult, OpenMeteoWeather, weatherCodeToCondition(), WeatherFailure, WeatherReading (+4 more)

### Community 79 - "views.test.ts"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "watch.ts"
Cohesion: 0.10
Nodes (18): MEDIA_OBSERVATIONS_SCHEMA, HalfWatch, WatchWindow, mocks, CoveragePlan, elapsedSince(), getClient(), mediaPart() (+10 more)

### Community 81 - "nativeGemini.ts"
Cohesion: 0.05
Nodes (57): SEARCH_EXCERPTS_UNTRUSTED_DATA_LABEL, recordSearchCitations(), runSearchTurn(), ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS, searchWebTool, attemptForRequest (+49 more)

### Community 82 - "Search Prefetch Reporting"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "models.ts"
Cohesion: 0.22
Nodes (12): BuiltIn, DEFAULT_BASE_URLS, failure(), listed(), listRequest(), ModelPaths, ModelTest, optionalString() (+4 more)

### Community 84 - "messageContent.ts"
Cohesion: 0.09
Nodes (33): Commands, ImageAttachment, isSupportedMedia(), describeEmbed(), describeForwardedSnapshots(), describePoll(), embedMatchesSocialPost(), extractComponentMedia() (+25 more)

### Community 85 - "PackFileScreen.tsx"
Cohesion: 0.11
Nodes (37): Problem, lineForPath(), clean(), commentsAlong(), covers(), fileHeader(), isLeaf(), keyLines() (+29 more)

### Community 86 - "src/index.ts"
Cohesion: 0.11
Nodes (23): cleanupExpired(), restoreMonitoredChannels(), resetForTest(), stopExtractionScheduler(), waitForInFlightExtractions(), destroyAllSessions(), stopUpdateNotifier(), client (+15 more)

### Community 87 - "config.ts"
Cohesion: 0.05
Nodes (53): Configuration (AGENTS.md), Source Files, Legacy Config, Source Files, CompatibleCapabilities, defaultEmbeddingProvider(), baseConfig, CAPABILITY_CHOICES (+45 more)

### Community 88 - "Social Post Viewing Research"
Cohesion: 0.33
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "harness/tokens.ts"
Cohesion: 0.20
Nodes (13): CORE_PROMPT, CORE_PROMPT_FORGET_ONLY, CORE_PROMPT_MEMORY_FREE, SPEECH_PROMPT, TONE_PROMPTS, rokaTools, fixture, MAX_SYSTEM_PROMPT_TOKENS (+5 more)

### Community 90 - "DiscordPreview.tsx"
Cohesion: 0.15
Nodes (23): readYaml(), splitPath(), Avatar(), CAPTIONS, Chip(), describe(), DiscordPreview(), filled() (+15 more)

### Community 91 - "extractionSchema.ts"
Cohesion: 0.04
Nodes (43): AddOperationSchema, calendarDateProperties, DATED_GUILD_PREDICATES, DatedGuildAddOperationSchema, DatedGuildPredicateId, datedGuildPredicates, DatedGuildPredicateSchema, DatedGuildUpdateOperationSchema (+35 more)

### Community 92 - "markdownGuard.ts"
Cohesion: 0.50
Nodes (6): eachOutside(), guardMarkdown(), guardProse(), guardText(), isFace(), KAOMOJI

### Community 93 - "attachmentCost.ts"
Cohesion: 0.16
Nodes (16): PDF Token Cost Measurement, anthropicBlock(), countWithAnthropic(), estimateTokens(), imageTokens(), measureAttachmentTokens(), pdfPages(), UNREADABLE_IMAGE_TOKENS (+8 more)

### Community 94 - "memoryClaimSchema.ts"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 95 - "ref_node_crypto"
Cohesion: 0.15
Nodes (9): ref_node_crypto, ref_node_net, browserCommands(), Command, openBrowser(), app, port, shellEnv (+1 more)

### Community 96 - "WAV File Validation"
Cohesion: 0.38
Nodes (5): read_wav(), WavError, make_wav(), ReadWavTest, ValueError

### Community 97 - "load.ts"
Cohesion: 0.05
Nodes (54): buildContextPrompt(), Character, deepFreeze(), escapeRegExp(), inHours(), loadCharacter(), expand(), prompt() (+46 more)

### Community 98 - "predicates.ts"
Cohesion: 0.07
Nodes (43): Main-Model Judge, Storage Schema, zod, oldClaimId, undone, judgeWithModel(), ModelJudgment, SYSTEM (+35 more)

### Community 99 - "ASR Sidecar Service"
Cohesion: 0.22
Nodes (8): API, ASR Sidecar, Build and Run, Configuration, `GET /health`, Models and Licences, `POST /transcribe?maxSpeechSec=120`, Tests

### Community 100 - "app.test.ts"
Cohesion: 0.12
Nodes (18): dotenv, StudioOptions, ApiError, commentedConfig(), ENV_TEXT, FilesBody, json(), MODEL_ENV (+10 more)

### Community 101 - "fallbackModel.ts"
Cohesion: 0.05
Nodes (38): `search`, Hedge, Logs, Pinning, Routing, Sticky Window, Switch, A Spent Day Is Not a Spent Minute (+30 more)

### Community 102 - "timezone.ts"
Cohesion: 0.35
Nodes (9): loadGetLocalHour(), loadTimezoneModule(), unpinnedHour(), dateString(), dateTimeParts(), getLocalDate(), localDateStartEpoch(), localDateTimeFormatter() (+1 more)

### Community 103 - "messageEdge"
Cohesion: 0.20
Nodes (10): Evidence, Known Limits, Rerunning the Check, Results, Roka Voice v4: Looked-Up Turns and Saying No, Root Causes, Tunables, What Changed (+2 more)

### Community 104 - "duration.ts"
Cohesion: 0.33
Nodes (8): Box, movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0(), mvhdV1()

### Community 105 - "turnMedia.test.ts"
Cohesion: 0.18
Nodes (6): apiKey(), digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf()

### Community 107 - "Features"
Cohesion: 0.18
Nodes (11): Any Model, Bring Your Own Character, Built to Stay Up, Conversation First, Eyes and Ears, Features, Games and Stats, Memory (+3 more)

### Community 108 - "Raspberry Pi Runbook"
Cohesion: 0.08
Nodes (26): Access, At a Glance, Bot Lifecycle, Bug Reports, Data and Backups, Docker, Episodes, Media Memory and Recall, Failure Diagnostics (+18 more)

### Community 109 - "Speech Budget Management"
Cohesion: 0.42
Nodes (4): Keep time-ordered segments within the speech budget, spread across the clip.…, Segment, select_segments(), SelectSegmentsTest

### Community 110 - "Configuration Changes"
Cohesion: 0.20
Nodes (10): Any OpenAI-Compatible Model, Budgets and Monthly Spend, Configuration Changes, Discord App Install and Permissions, Environment Switches, Gemini Terms, Hedging Slow Calls, Reply Model and Fallback (+2 more)

### Community 111 - "redditFeed.ts"
Cohesion: 0.56
Nodes (9): decodeEntities(), entryAuthor(), entryContent(), feedEntries(), feedField(), htmlToText(), NAMED_ENTITIES, parseRedditFeedPost() (+1 more)

### Community 112 - "replyShape.ts"
Cohesion: 0.13
Nodes (26): Tunables, buildReplyShapePrompt(), chooseFaces(), chooseOpener(), chooseReplyShape(), chooseThreat(), Edge, Ending (+18 more)

### Community 116 - "Prompt Engine"
Cohesion: 0.15
Nodes (14): At a Glance, Memory Modes, Mood Detection, Prompt Engine, Safety Ladder, Search State, Situation Block, Source Files (+6 more)

### Community 117 - "promptSafety.ts"
Cohesion: 0.16
Nodes (18): escapeRegExp(), stripNarratedToolCalls(), buildFactsEnvelope(), buildOverheardBlock(), FACTS_UNTRUSTED_DATA_LABEL, isSafeFactKey(), isSafeFactScalar(), MAX_FACT_KEY_LEN (+10 more)

### Community 119 - "Memory"
Cohesion: 0.09
Nodes (25): Extraction Funnel, Admission, Bounded Retrieval (Legacy), Capture, Claim Lifecycle and Retention, Deferred Items, Extraction, Extraction Run Trace (+17 more)

### Community 120 - "metadata.ts"
Cohesion: 0.18
Nodes (18): ref_node_url, api(), assignable(), CommitlintConfig, GitHubActor, GitHubIssue, GitHubLabel, GitHubPullRequest (+10 more)

### Community 121 - "emojiReactor.ts"
Cohesion: 0.27
Nodes (8): emoji Config Section, cleanupExpiredCooldowns(), cooldowns, findMatchingRule(), REACTION_RULES, ReactionRule, resetCooldowns(), shouldReact()

### Community 122 - "hiddenRetractions.test.ts"
Cohesion: 0.08
Nodes (37): Unified Recall, fact(), seedGuild(), getEmbeddingClient(), embedEpisodeText(), EpisodeEmbeddingRole, persistEpisodeResult(), EpisodeRunResult (+29 more)

### Community 123 - "test-chat.ts"
Cohesion: 0.10
Nodes (21): ref_node_readline, args, handleInput(), htmlIndex, main(), previewMessages, username, CaptureInput (+13 more)

### Community 124 - "replyReader"
Cohesion: 0.23
Nodes (7): createReplyReader(), isAbort(), replyReader, ReplyLookup, FOUND, readerWith(), SETTINGS

### Community 125 - "transcribe.test.ts"
Cohesion: 0.08
Nodes (32): EMPTY, extractFrame(), extractFrames(), frameBins(), frameCount(), FrameRunner, FrameSource, frameTimestamps() (+24 more)

### Community 126 - "Speech Server Engines"
Cohesion: 0.33
Nodes (6): Engines, load_engines(), main(), SpeechServer, NamedTuple, ThreadingHTTPServer

### Community 127 - "Linting Configuration"
Cohesion: 0.67
Nodes (3): lint-staged, *.{json,md,yml,yaml}, *.{ts,js}

### Community 129 - "probe-llm-profile.ts"
Cohesion: 0.06
Nodes (47): 1. Character as a Folder Pack, 2. Static First, Dynamic After, Reply Shape Last, 3. Any OpenAI-Compatible Endpoint, 4. Files First, Dashboard Later, Character Formats, Character Harness Research 2026, Decisions for Rokabot, Evidence-Backed (+39 more)

### Community 130 - "test-adk-smoke.ts"
Cohesion: 0.29
Nodes (8): ref_node_dns, ErrorRecoveryPlugin, main(), results, runQuery(), TestResult, wordCount(), assembleSystemPrompt()

### Community 131 - "Speech Transcription Processing"
Cohesion: 0.60
Nodes (5): decode(), detect_speech(), language_code(), transcribe(), ndarray

### Community 133 - "textEdit.ts"
Cohesion: 0.31
Nodes (17): Primitive, Flow, flowMap(), insertLine(), insertPair(), lineEnd(), lineStart(), pairOf() (+9 more)

### Community 134 - "Rules Across Modules"
Cohesion: 0.22
Nodes (9): At a Glance, Changing a Contract, Modules, Rules Across Modules, SQLite Is Canonical, Technical Requirements, The Character Pack Is the Persona Source, The System Prompt Has a Size Cap (+1 more)

### Community 135 - "linesGolden.test.ts"
Cohesion: 0.13
Nodes (30): Field Reference, lines.yml, Media Watching, The `openai-compatible` Exception, handleStatsCommand(), isStatsView(), logStatsError(), selectionFor() (+22 more)

### Community 136 - "deploy Job"
Cohesion: 0.48
Nodes (7): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping)

### Community 137 - "ref_node_fs"
Cohesion: 0.09
Nodes (24): js-yaml, ref_node_child_process, ref_node_fs, ref_node_os, ref_node_path, ref_node_util, ref_node_worker_threads, main() (+16 more)

### Community 138 - "channelVisibility.test.ts"
Cohesion: 0.50
Nodes (3): createChannelVisibilityResolver(), everyoneRole, resolverFor()

### Community 140 - "reliability.ts"
Cohesion: 0.06
Nodes (45): Failure Classification, Failure Kinds, BackoffOptions, classifyGeminiFailure(), classifyMarker(), computeBackoff(), DEFAULT_MAX_BACKOFF_MS, extractGeminiStatus() (+37 more)

### Community 141 - "verification.test.ts"
Cohesion: 0.14
Nodes (14): OperationApplicationReport, activeFacts(), apply(), candidateFacts(), episode(), evidenceCount(), factsWithStatus(), jevApplied() (+6 more)

### Community 142 - "sessionStore.ts"
Cohesion: 0.19
Nodes (11): Architecture (AGENTS.md), Critical Do-Nots, Project (Rokabot description), fallback Config Section, gemini Config Section, rateLimit Config Section, session Config Section, ChannelUser (+3 more)

### Community 143 - "UI TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals (+6 more)

### Community 144 - "System Architecture"
Cohesion: 0.12
Nodes (16): Architecture, At a Glance, Core Code Modules, Discord Events (Inbound), Durable State, Gateway Setup, Installation and Context Policy, InteractionCreate (`/ask`) (+8 more)

### Community 145 - "roka.test.ts"
Cohesion: 0.10
Nodes (28): resetMonitor(), generateResponse(), __resetTestRunTurnFactory(), __setTestRunTurnFactory(), steeringForRequest, TestRunTurn, destroySession(), resetIdleTimer() (+20 more)

### Community 146 - "agent/attachments.ts"
Cohesion: 0.07
Nodes (38): RFC-3003, At a Glance, Attachment Intake, Bytes Do Not Stay in History, Configuration, Download, Linked Files (`attachment_url`), Media (+30 more)

### Community 147 - "anthropicLlm.test.ts"
Cohesion: 0.06
Nodes (35): At a Glance, Model Profiles, Models, Provider IDs, Request Shaping, Resolution, `ResolvedModel` Defaults, Tested-Profile Rule (+27 more)

### Community 148 - "yamlEdit.ts"
Cohesion: 0.23
Nodes (21): yaml, character, config, repo, voice, stringifyDoc(), addItem(), deleteNode() (+13 more)

### Community 149 - "render.ts"
Cohesion: 0.10
Nodes (44): emojiImage(), escapeHtml(), linkHtml(), MarkdownContext, renderPlainText(), textHtml(), twemojiCode(), asObject() (+36 more)

### Community 150 - "Configuration"
Cohesion: 0.07
Nodes (31): At a Glance, Capture and Prompt, Character, Configuration, `discord`, `embeddings`, `emoji`, `fallback` (+23 more)

### Community 151 - "persona-replay.ts"
Cohesion: 0.11
Nodes (28): ANTHROPIC_SEARCH, appendReplyShape(), Arm, claudeSettings(), GEMINI_CONFIG, GEMINI_SEARCH, loadArm(), LoadedArm (+20 more)

### Community 152 - "searchPrefetch.ts"
Cohesion: 0.23
Nodes (10): TurnJudgment, decidePrefetch(), JevPrefetchMode, PREFETCH_TOOL_NAME, PrefetchContext, PrefetchDecision, PrefetchOutcome, runPrefetchForJudgment() (+2 more)

### Community 153 - "privacy"
Cohesion: 0.09
Nodes (23): At a Glance, Browse Memory in Obsidian, Forgetting and Opting Out, How She Learns, Key Settings, Maintenance Scripts, Memory, Privacy Settings (+15 more)

### Community 154 - "packs.ts"
Cohesion: 0.15
Nodes (30): CHECK_SCRIPT, checkConfig(), ConfigPaths, configProblem(), readConfig(), setTopLevelValue(), validateConfig(), writeConfig() (+22 more)

### Community 155 - "ToneKey"
Cohesion: 0.33
Nodes (6): AssemblerInput, ToneKey, ReplyShapeInput, JevReplayReport, JevReplayTurn, MeasureRequestInput

### Community 156 - "queries.test.ts"
Cohesion: 0.13
Nodes (14): activeClaimCount(), episodeCount(), MEMORY_STATS_SQL, outcomeBreakdown(), successRate, topTones(), insertClaim(), insertGuildClaim() (+6 more)

### Community 157 - "updateNotifier.ts"
Cohesion: 0.15
Nodes (16): cfg, LATEST, store, checkForUpdate(), fetchLatestRelease(), isNewerVersion(), LatestRelease, moduleDirectory (+8 more)

### Community 158 - "promptGolden.test.ts"
Cohesion: 0.23
Nodes (11): computeGolden(), digest(), FIXTURE, MESSAGES, MODES, RECENT, seeded(), TONES (+3 more)

### Community 159 - "roka.ts"
Cohesion: 0.06
Nodes (37): abortActiveTurns(), ModelVerdict, modelVerdictForRequest, rokaModel, GenerateOptions, GenerateResult, getRandomFallback(), KNOWN_FALLBACKS (+29 more)

### Community 160 - "README.md"
Cohesion: 0.19
Nodes (8): Jev Integration (Research Doc), Contributing, Documentation, How It Works, License, Quick Start, Tech Stack, Who Is Maniwa Roka and Rokabot?

### Community 161 - "recall-calibration.test.ts"
Cohesion: 0.12
Nodes (24): CandidateRow, Embed, chooseFloor(), cli(), cohensKappa(), currentFloorOf(), KindReport, Label (+16 more)

### Community 162 - "Characters"
Cohesion: 0.08
Nodes (28): A Pack Outside the Image, At a Glance, character.yml, Characters, Harness Prompts and Overrides, How the Bot Picks a Pack, Make a New Character, moods.yml (+20 more)

### Community 163 - "judgments.ts"
Cohesion: 0.08
Nodes (38): jev Config Section, Jev Design (Per-Feature Modes), Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk, @typesafe-ai/sdk, undici, fetchWithKeepAlive() (+30 more)

### Community 164 - "Product"
Cohesion: 0.18
Nodes (10): Accessibility & Inclusion, Anti-references, Brand Personality, Design Principles, Platform, Positioning, Product, Product Purpose (+2 more)

### Community 165 - "API and Security Tests"
Cohesion: 0.20
Nodes (10): API, Errors, Model Connection Test, Pack File Rules, Persona Studio, Security Model, Source Files, Start It (+2 more)

### Community 166 - "Models"
Cohesion: 0.13
Nodes (15): Any OpenAI-Compatible Model, At a Glance, Budgets and Limits, Capabilities Reference, Choose the Main and Fallback, Copy-Paste Entries, Entry Options, Fields for OpenAI-Compatible Entries (+7 more)

### Community 167 - "tools/index.ts"
Cohesion: 0.16
Nodes (19): recordReplyOutcome(), cancelReminderTool, getAnimeScheduleTool, listRemindersTool, MEMORY_TOOL_NAMES, readRepliesTool, searchAvailable, setReminderTool (+11 more)

### Community 168 - "scheduler.test.ts"
Cohesion: 0.20
Nodes (13): shouldSample(), startExtractionScheduler(), advancePastRetryDelay(), configMock, drain(), enqueue(), enqueueDelayed(), enqueueJob() (+5 more)

### Community 169 - "Deployment and Setup Guide"
Cohesion: 0.14
Nodes (14): At a Glance, First-Run Checks, Getting Started, Install and Configure, Model Keys for the Shipped Config, Next Steps, Prerequisites, Register Slash Commands (+6 more)

### Community 170 - "Auto-Deploy Platforms"
Cohesion: 0.14
Nodes (13): Answer, Auto-Deploy Platforms, Coolify, Docker API Version, Fly.io, GHCR Limits, Maintained Fork, Original Project (+5 more)

### Community 171 - "Roka Voice v3: Restoring Variety on Haiku"
Cohesion: 0.20
Nodes (9): Canon Research, Complaints After the Haiku Switch, Known Weak Spots, Replay and Blind-Judge Method, Rerunning the Check, Results, Roka Voice v3: Restoring Variety on Haiku, Root Causes (+1 more)

### Community 172 - "guildFactDates.test.ts"
Cohesion: 0.40
Nodes (5): GuildFactDate, DateResolver, expectResolved(), loadResolver(), ResolvedDate

### Community 173 - "persona-report.ts"
Cohesion: 0.14
Nodes (23): countSlurRepetitions(), firstWord(), formatTable(), innerThoughts(), main(), MARKERS, paragraphs(), pct() (+15 more)

### Community 174 - "Embedding Project Config"
Cohesion: 0.15
Nodes (12): compilerOptions, lib, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+4 more)

### Community 175 - "searchAnime.ts"
Cohesion: 0.24
Nodes (8): searchAnimeTool, jikanThrottle(), AnimeResult, JikanAnimeEntry, JikanResponse, searchAnime(), SearchAnimeParams, SearchAnimeResult

### Community 178 - "toolTrigger.ts"
Cohesion: 0.13
Nodes (17): emitTrialRecord(), formatTrialRecord(), TrialRecord, record, cases, header, ok(), turn() (+9 more)

### Community 179 - "Features"
Cohesion: 0.18
Nodes (11): At a Glance, Features, Games and Gacha, Memory, Reactions, Status Rotation and Update Notices, Reminders, Seeing and Watching, Source Files (+3 more)

### Community 180 - "Embedding Service Docs"
Cohesion: 0.20
Nodes (9): API, Build and Run, Configuration, Embedding Sidecar, `GET /health`, Model and Licences, `POST /embed`, Smoke Test (+1 more)

### Community 182 - "react"
Cohesion: 0.09
Nodes (33): react, NoticeRow(), NotificationCenter(), THEMES, ThemeSwitch(), ToastCard(), Toaster(), TONE_ICON (+25 more)

### Community 185 - "extractionQueue.ts"
Cohesion: 0.10
Nodes (17): isTrivial(), normalize(), precheckEpisode(), SENSITIVE_PATTERNS, mocks, BufferedMessage, claimNextForGuild(), EpisodeCursor (+9 more)

### Community 186 - "yamlText.ts"
Cohesion: 0.39
Nodes (14): Path, ConfigFormProps, appendEntry(), expectAfter(), lineEnd(), lineStart(), readIn(), removeKey() (+6 more)

### Community 187 - "Speech Pattern Documentation"
Cohesion: 0.25
Nodes (7): Dialogue Style, Example Lines, Example Replies With Structure, Expressions, Formatting Your Reply, Speech Patterns, Verbal Style

### Community 188 - "Persona Identity Definition"
Cohesion: 0.25
Nodes (7): Identity & Appearance, Insecurities, People You Know, Personality, Romantic Side, Who You Are, Your World

### Community 191 - "embeddings/client.ts"
Cohesion: 0.12
Nodes (25): EmbeddingClient, EmbeddingRole, EmbeddingSettings, FACTORIES, DEFAULT_EMBEDDING_MODELS, embeddingDimensions(), embeddingFingerprint(), EmbeddingProvider (+17 more)

### Community 193 - "Changelog"
Cohesion: 0.20
Nodes (9): [0.2.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.1.0...v0.2.0) (2026-10-16), [0.3.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.2.0...v0.3.0) (2026-10-16), [0.4.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.3.0...v0.4.0) (2026-10-17), Bug Fixes, Bug Fixes, Changelog, Features, Features (+1 more)

### Community 194 - "Character Packs"
Cohesion: 0.25
Nodes (7): Character Packs, Layout, Locked Prompts, Macros, Making a New Character, Prompt Files, Search Prompts

### Community 196 - "Contributing"
Cohesion: 0.29
Nodes (7): Branches, Contributing, Gates, Labels and Assignees, Merging, Pull Requests, Titles

### Community 197 - "Audio Video Documentation"
Cohesion: 0.50
Nodes (3): Audio and Video, When You Couldn't Watch It, When You've Watched Something

### Community 198 - "Release Configuration"
Cohesion: 0.50
Nodes (3): bootstrap-sha, packages, $schema

### Community 221 - "Prompts.tsx"
Cohesion: 0.13
Nodes (30): estimateTokens(), TextEditor, TextEditorHandle, TextEditorProps, Columns(), EntryNote(), EntryNoteProps, characterPath() (+22 more)

### Community 223 - "@playwright/test"
Cohesion: 0.10
Nodes (9): @playwright/test, role(), roleSelect(), KEYS, moodList(), moodRow(), ENV, E2E_PORT (+1 more)

### Community 225 - "measure.ts"
Cohesion: 0.35
Nodes (9): Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION, mimeForPath(), resolveKey(), TokenLimits (+1 more)

### Community 227 - "getCurrentTime.ts"
Cohesion: 0.22
Nodes (9): cityToTimezone, getCurrentTime(), GetCurrentTimeFound, GetCurrentTimeParams, GetCurrentTimeResult, GetCurrentTimeUnknown, resolveTimezone(), getCurrentTimeTool (+1 more)

### Community 228 - "replyBlocks.ts"
Cohesion: 0.21
Nodes (13): Video Low Resolution Recommendation, blockCount(), BlockKind, capReplyBlocks(), countReplyBlocks(), MAX_REPLY_BLOCKS, parse(), Piece (+5 more)

### Community 229 - "UI Styling Assets"
Cohesion: 0.33
Nodes (5): @fontsource-variable/geist, @fontsource-variable/geist-mono, react-dom, root, studio_ui_src_styles

### Community 230 - "pull_request_template.md"
Cohesion: 0.50
Nodes (3): Evidence, Merge Danger, Summary

### Community 232 - "socialPosts/format.ts"
Cohesion: 0.23
Nodes (12): SOCIAL_POST_UNTRUSTED_DATA_LABEL, SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL, author(), formatSocialPostLine(), PLATFORM_NAMES, quoted(), replies(), SOCIAL_POST_FAILURE_MARKER (+4 more)

### Community 234 - "statusCycler.test.ts"
Cohesion: 0.22
Nodes (6): Bucket, BUCKETS, cfg, lastPayload(), lastState(), PresenceMock

### Community 235 - "reports.ts"
Cohesion: 0.43
Nodes (6): main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne()

### Community 236 - "Decisions"
Cohesion: 0.22
Nodes (8): Agent and Prompts, Decisions, Deployment, Discord, Media, Memory, Models and Search, Repository

### Community 238 - "smoke.ts"
Cohesion: 0.25
Nodes (5): ref_node_assert, EmbedReply, golden, goldenPath, record

### Community 247 - "harness.eval.test.ts"
Cohesion: 0.17
Nodes (7): benchmarkTranscript, CapturingRunner, mocks, payloadText(), collect(), scriptedResponse(), transcript

### Community 248 - "Media Watching"
Cohesion: 0.22
Nodes (9): Accounting, Digest and Turn Input, Footer, Media Watching, Remembered Media, Speech Sidecar, Transport, Watcher Modes (+1 more)

### Community 250 - "Coding Guidelines (Andrej Karpathy)"
Cohesion: 0.33
Nodes (5): 1. Think Before Coding, 2. Simplicity First, 3. Surgical Changes, 4. Goal-Driven Execution, Coding Guidelines (Andrej Karpathy)

### Community 251 - "embeddings/__tests__/client.test.ts"
Cohesion: 0.50
Nodes (3): resetEmbeddingClientForTest(), factories, state

## Knowledge Gaps
- **1642 isolated node(s):** `$schema`, `indentStyle`, `indentWidth`, `lineWidth`, `enabled` (+1637 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2118 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **52 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `profiles.ts`, `jevReplay.ts`, `qwenWatch.ts`, `database.ts`, `buddy.ts`, `messageBuilder.ts`, `getDb`, `src/games/hangman.ts`, `scheduler.ts`, `searchNativeAnthropic.test.ts`, `messageCreate.ts`, `reminder.ts`, `replies/service.ts`, `episodeTracker.ts`, `WindowedSessionService`, `closeDb`, `metricsStore.ts`, `turnContext.ts`, `run.ts`, `rateLimiter.ts`, `turnMedia.ts`, `logger.ts`, `youtubeStreams.ts`, `toolTriggerScoring.ts`, `memoryEpisodeReplay.ts`, `getAnimeSchedule.ts`, `@google/adk`, `recall.ts`, `generateObject.ts`, `discord.js`, `charts.ts`, `Inline Data Contract`, `handler.ts`, `extractionSchema.test.ts`, `anthropicLlm.ts`, `budget.ts`, `schedule.test.ts`, `reportCommand.ts`, `extractor.ts`, `digest.ts`, `socialPosts/service.ts`, `parsers.ts`, `Prefetch Measurement Tools`, `package.json`, `File Upload Handling`, `messageCreate.test.ts`, `anthropicMain.eval.test.ts`, `quotaDiagnostic.ts`, `getWeather.ts`, `views.test.ts`, `watch.ts`, `nativeGemini.ts`, `Search Prefetch Reporting`, `messageContent.ts`, `src/index.ts`, `config.ts`, `harness/tokens.ts`, `extractionSchema.ts`, `markdownGuard.ts`, `attachmentCost.ts`, `ref_node_crypto`, `load.ts`, `predicates.ts`, `app.test.ts`, `fallbackModel.ts`, `timezone.ts`, `duration.ts`, `turnMedia.test.ts`, `replyShape.ts`, `promptSafety.ts`, `metadata.ts`, `emojiReactor.ts`, `hiddenRetractions.test.ts`, `replyReader`, `transcribe.test.ts`, `probe-llm-profile.ts`, `linesGolden.test.ts`, `ref_node_fs`, `channelVisibility.test.ts`, `reliability.ts`, `verification.test.ts`, `sessionStore.ts`, `roka.test.ts`, `agent/attachments.ts`, `anthropicLlm.test.ts`, `yamlEdit.ts`, `persona-replay.ts`, `searchPrefetch.ts`, `queries.test.ts`, `updateNotifier.ts`, `promptGolden.test.ts`, `roka.ts`, `recall-calibration.test.ts`, `judgments.ts`, `tools/index.ts`, `scheduler.test.ts`, `guildFactDates.test.ts`, `persona-report.ts`, `toolTrigger.ts`, `extractionQueue.ts`, `embeddings/client.ts`, `measure.ts`, `getCurrentTime.ts`, `replyBlocks.ts`, `gemini.test.ts`, `socialPosts/format.ts`, `statusCycler.test.ts`, `harness.eval.test.ts`, `embeddings/__tests__/client.test.ts`?**
  _High betweenness centrality (0.238) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `YamlForm.tsx`, `UI Styling Assets`, `package.json`, `configShared.tsx`, `parts.tsx`, `PackFileScreen.tsx`, `Secrets.tsx`, `DiscordPreview.tsx`, `Moods.tsx`, `Prompts.tsx`, `workspace.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `getDb()` connect `getDb` to `database.ts`, `buddy.ts`, `src/games/hangman.ts`, `scheduler.ts`, `queries.ts`, `messageCreate.ts`, `verification.test.ts`, `reminder.ts`, `views.ts`, `sessionStore.ts`, `roka.test.ts`, `episodeTracker.ts`, `closeDb`, `metricsStore.ts`, `turnContext.ts`, `run.ts`, `queries.test.ts`, `retriever.ts`, `updateNotifier.ts`, `recall-calibration.test.ts`, `logger.ts`, `memoryEpisodeReplay.ts`, `recall.ts`, `config`, `budget.ts`, `extractionQueue.ts`, `reportCommand.ts`, `extractor.ts`, `anthropicMain.eval.test.ts`, `src/index.ts`, `extractionSchema.ts`, `predicates.ts`, `harness.eval.test.ts`, `hiddenRetractions.test.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `$schema`, `indentStyle`, `indentWidth` to the rest of the system?**
  _1642 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `profiles.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05952380952380952 - nodes in this community are weakly interconnected._
- **Should `jevReplay.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `qwenWatch.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0967741935483871 - nodes in this community are weakly interconnected._