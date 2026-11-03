# Graph Report - bugs  (2026-11-03)

## Corpus Check
- 712 files · ~593,743 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 30 file(s) not represented in the graph (top: (none) 13, .jsonl 11, .rss 2)

## Summary
- 5748 nodes · 15914 edges · 246 communities (197 shown, 49 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 532 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f5d9328f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- profiles.ts
- jevReplay.ts
- qwenWatch.ts
- memoryEpisodeStore.ts
- Project Linting Config
- buddy.ts
- messageBuilder.ts
- getDb
- src/games/hangman.ts
- scheduler.ts
- app.ts
- queries.ts
- discordDoubles.ts
- messageCreate.ts
- linesGolden.test.ts
- tools/index.ts
- views.ts
- parsers.ts
- guildFactDates.ts
- episodeTracker.ts
- Dev Tooling Dependencies
- Media
- Sidebar.tsx
- gacha.ts
- config
- closeDb
- run.ts
- dependencies
- retriever.ts
- RateLimiter
- workspace.ts
- TypeScript Configuration
- turnMedia.ts
- YamlForm.tsx
- scripts
- recall-calibration.test.ts
- gameCommands.ts
- youtubeStreams.ts
- toolTriggerScoring.ts
- memoryEpisodeReplay.ts
- getAnimeSchedule.ts
- worst-case.ts
- anthropicLlm.ts
- pack.ts
- configShared.tsx
- media.ts
- turnContext.ts
- generateObject.ts
- discord/attachments.ts
- charts.ts
- parts.tsx
- Inline Data Contract
- TypeScript Build Config
- handler.ts
- extractionSchema.test.ts
- chatCompletionsLlm.ts
- obsidianExport.ts
- budget.ts
- schedule.test.ts
- Moods.tsx
- reportCommand.ts
- replay-memory-v2.ts
- digest.ts
- markdown.ts
- Speech-to-Text HTTP Server
- socialPosts/service.ts
- fixtures.ts
- socialPostParsers.test.ts
- Design System Documentation
- vitest
- Prefetch Measurement Tools
- package.json
- test
- File Upload Handling
- interactionCreate.metrics.test.ts
- anthropicMain.eval.test.ts
- roka Service
- Character Harness Research 2026
- getWeather.ts
- views.test.ts
- watch.ts
- nativeAnthropic.ts
- Search Prefetch Reporting
- models.ts
- messageContent.ts
- PackFileScreen.tsx
- metrics.eval.test.ts
- config.ts
- Social Post Viewing Research
- ToneKey
- DiscordPreview.tsx
- extractionSchema.ts
- test-chat.ts
- jev/client.ts
- memoryClaimSchema.ts
- static.ts
- WAV File Validation
- load.ts
- predicates.ts
- ASR Sidecar Service
- app.test.ts
- fallbackModel.ts
- timezone.ts
- attachmentLimits.ts
- duration.ts
- turnMedia.test.ts
- Commit Linting Rules
- Features
- Raspberry Pi Runbook
- Speech Budget Management
- Configuration Changes
- common.ts
- replyShape.ts
- Documentation Style Guide
- Git Commit Standards
- Coding Best Practices
- createTurnContext
- promptSafety.ts
- Audio Decoding Tests
- Memory
- metadata.ts
- Jev Judgments
- hiddenRetractions.test.ts
- cli.ts
- replies/types.ts
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
- statsCommand.ts
- deploy Job
- ref_node_fs
- resolveRole
- Text Cleaning Utilities
- roka.ts
- turnContext.test.ts
- Architecture (AGENTS.md)
- UI TypeScript Configuration
- searchWeb
- roka.test.ts
- agent/attachments.ts
- searchNativeAnthropic.test.ts
- yamlEdit.ts
- render.ts
- Configuration
- persona-replay.ts
- searchPrefetch.ts
- privacy
- secrets.ts
- collection.ts
- Product Requirements
- updateNotifier.ts
- promptGolden.test.ts
- session.ts
- README.md
- recall-calibration-thresholds.ts
- Characters
- judgments.ts
- Product
- API and Security Tests
- Models
- reminderStore.ts
- scheduler.test.ts
- Deployment and Setup Guide
- Auto-Deploy Platforms
- Roka Voice v3: Restoring Variety on Haiku
- judgments.test.ts
- persona-report.ts
- Embedding Project Config
- searchAnime.ts
- videoVariant.ts
- FakeInteraction
- toolTrigger.ts
- Features
- Embedding Service Docs
- config.test.ts
- HeaderUtilities.tsx
- toneStyles.ts
- FakeChannel
- extractionQueue.ts
- yamlText.ts
- Speech Pattern Documentation
- Persona Identity Definition
- FakeMessage
- fingerprint.ts
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
- Secrets.tsx
- models.spec.ts
- measure.ts
- replyBlocks.ts
- UI Styling Assets
- pull_request_template.md
- embeddings/client.ts
- discord.js
- reports.ts
- Decisions
- Template Speaking Prompts
- Template Calm Mood
- Cheerful Mood Prompt
- Persona Identity Prompts
- harness.eval.test.ts
- Media Watching
- Coding Guidelines (Andrej Karpathy)
- graphify.md
- issue-tracker.md
- rtk.md
- Deliberately Not Done
- Reference Docs (AGENTS.md)

## God Nodes (most connected - your core abstractions)
1. `vitest` - 243 edges
2. `getDb()` - 243 edges
3. `config` - 118 edges
4. `logger` - 79 edges
5. `createMessageHandler()` - 54 edges
6. `discord.js` - 50 edges
7. `generateResponse()` - 49 edges
8. `closeDb()` - 49 edges
9. `createInteractionHandler()` - 48 edges
10. `assertClaim()` - 46 edges

## Surprising Connections (you probably didn't know these)
- `Shipping` --references--> `test()`  [INFERRED]
  docs/CONVENTIONS.md → scripts/test-adk-smoke.ts
- `A Spent Day Is Not a Spent Minute` --references--> `computeBackoff()`  [INFERRED]
  docs/trd/reliability.md → src/agent/geminiReliability.ts
- `Client` --references--> `getJevClient()`  [INFERRED]
  docs/trd/jev.md → src/agent/jev/client.ts
- `At a Glance` --references--> `startCall()`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/budget.ts
- `ADK Error Delivery Constraint` --references--> `ProviderError`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/providerError.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Deploy-to-Pi CI/CD Pipeline** — _github_workflows_deploy_workflow, _github_workflows_deploy_test_job, _github_workflows_deploy_deploy_job, agents_working_conventions [EXTRACTED 0.90]
- **Multimodal Attachment Safety Pipeline** — docs_research_multimodal_global_byte_budget, docs_research_multimodal_streaming_size_guard, docs_research_multimodal_attachment_strip_history, docs_research_multimodal_tpm_ceiling_measurement, src_discord_bytebudget [INFERRED 0.95]

## Communities (246 total, 49 thin omitted)

### Community 0 - "profiles.ts"
Cohesion: 0.05
Nodes (48): Reply Model and Fallback, Failure Classification, Model Profiles, Tested-Profile Rule, FailureKind, BudgetDenial, ChatCompletionsLlm, ChatCompletionsProvider (+40 more)

### Community 1 - "jevReplay.ts"
Cohesion: 0.12
Nodes (26): parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, agreement(), buildConfusionMatrix(), buildProbabilityBins(), buildReplayTurn() (+18 more)

### Community 2 - "qwenWatch.ts"
Cohesion: 0.10
Nodes (24): BudgetReservation, binOf(), ChatCompletion, ContentPart, promptFor(), quoted(), QwenFrame, QwenWatchInput (+16 more)

### Community 3 - "memoryEpisodeStore.ts"
Cohesion: 0.04
Nodes (81): better-sqlite3, GEMINI_FINGERPRINT, geminiVector(), LOCAL_FINGERPRINT, localVector(), BackfillPace, delay(), EpisodeMaintenanceReport (+73 more)

### Community 4 - "Project Linting Config"
Cohesion: 0.05
Nodes (39): useLiteralKeys, css, formatter, files, ignore, formatter, enabled, indentStyle (+31 more)

### Community 5 - "buddy.ts"
Cohesion: 0.12
Nodes (31): games Config Section, BuddyRow, DailyBuddyHatch, DailyHatchRow, generateBuddy(), generateName(), generatePersonality(), getDailyHatchRow() (+23 more)

### Community 6 - "messageBuilder.ts"
Cohesion: 0.07
Nodes (42): discord Config Section, clampToBudget(), fitCitations(), sourceHost(), sourceLabel(), getExpressionUrl(), lastExpressionByTone, __resetExpressionState() (+34 more)

### Community 7 - "getDb"
Cohesion: 0.04
Nodes (114): attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow, legalScopes() (+106 more)

### Community 8 - "src/games/hangman.ts"
Cohesion: 0.19
Nodes (23): buildHangmanBody(), handleHangmanGuess(), handleHangmanStart(), HANGMAN_COLORS, saveHangmanScore(), src_games_data_hangmanwords, src_games_data_hangmanwords_hangman_words, activeGames (+15 more)

### Community 9 - "scheduler.ts"
Cohesion: 0.11
Nodes (30): ABORT_CODES, classifyExtractionError(), ExtractionErrorClassification, SHUTDOWN_SENSITIVE_NAMES, TRANSIENT_HTTP_STATUSES, TRANSIENT_NETWORK_CODES, finishRunTrace(), noteError() (+22 more)

### Community 10 - "app.ts"
Cohesion: 0.17
Nodes (32): createApp(), route(), Handler, PREVIEW_FIELDS, previewQuery(), CHECK_SCRIPT, checkConfig(), ConfigPaths (+24 more)

### Community 11 - "queries.ts"
Cohesion: 0.08
Nodes (38): activeClaimCount(), activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome (+30 more)

### Community 12 - "discordDoubles.ts"
Cohesion: 0.06
Nodes (45): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+37 more)

### Community 13 - "messageCreate.ts"
Cohesion: 0.08
Nodes (49): Global In-Flight Byte Budget, Turn Admission, Turn Admission, isMonitored(), markActive(), asksAboutReplies(), withReplyOutcomes(), withSearchCitations() (+41 more)

### Community 14 - "linesGolden.test.ts"
Cohesion: 0.10
Nodes (51): Field Reference, lines.yml, Commands, Bug Reports, Persistence and Storage, Retention, Tables, ref_discordjs_builders (+43 more)

### Community 15 - "tools/index.ts"
Cohesion: 0.11
Nodes (25): flipCoin(), FlipCoinResult, cityToTimezone, getCurrentTime(), GetCurrentTimeFound, GetCurrentTimeParams, GetCurrentTimeResult, GetCurrentTimeUnknown (+17 more)

### Community 16 - "views.ts"
Cohesion: 0.13
Nodes (32): episodeCount(), memoryGrowthSeries(), newClaimsThisMonth(), retrySummary, tokenTotals, topChannels(), topPredicates(), topRememberedMembers() (+24 more)

### Community 17 - "parsers.ts"
Cohesion: 0.19
Nodes (41): array(), base(), BlueskyBlob, blueskyQuote(), capped(), compact(), date(), finiteNumber() (+33 more)

### Community 18 - "guildFactDates.ts"
Cohesion: 0.26
Nodes (16): addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth(), monthForMonth() (+8 more)

### Community 19 - "episodeTracker.ts"
Cohesion: 0.17
Nodes (21): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), scheduleLull(), timers (+13 more)

### Community 20 - "Dev Tooling Dependencies"
Cohesion: 0.07
Nodes (29): devDependencies, @axe-core/playwright, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, diff, @fontsource-variable/geist, @fontsource-variable/geist-mono (+21 more)

### Community 21 - "Media"
Cohesion: 0.09
Nodes (15): At a Glance, Data Models and Storage, Outbound Model Request, Source Files, At a Glance, Bytes Do Not Stay in History, Configuration, Media (+7 more)

### Community 22 - "Sidebar.tsx"
Cohesion: 0.10
Nodes (37): App(), Ambient(), BrandMark(), checkedLabel(), follow(), initialCollapsed(), LogoToggle(), MarkGlyph() (+29 more)

### Community 23 - "gacha.ts"
Cohesion: 0.17
Nodes (27): handleGachaMention(), statBar(), formatBuddySummary(), formatHatchTimeRemaining(), handleBuddyLeaderboard(), handleBuddyStats(), handleBuddyView(), handleHatch() (+19 more)

### Community 24 - "config"
Cohesion: 0.06
Nodes (52): emoji Config Section, logging Config Section, metrics Config Section, cleanupExpired(), monitoredChannels, restoreMonitoredChannels(), persistTurnEventWhenReady(), prefetchStatusOf() (+44 more)

### Community 25 - "closeDb"
Cohesion: 0.04
Nodes (59): Where Rokabot Decides Today, GPT-6-Astra, Jev Rollout Plan, Second Opinion, Who-Is-Who Resolver, Database File, Bounded Retrieval (Legacy), openFixture() (+51 more)

### Community 26 - "run.ts"
Cohesion: 0.17
Nodes (21): fixturePath(), loadTranscript(), main(), parseTranscriptLine(), renderTokenTable(), requestMessageContent(), runTranscript(), RunTranscriptOptions (+13 more)

### Community 27 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, @anthropic-ai/sdk, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml (+6 more)

### Community 28 - "retriever.ts"
Cohesion: 0.09
Nodes (35): ClaimSource, touchRecalled(), ClaimRow, compareRetrieved(), getActiveClaims(), mapClaim(), MONTH_NAMES, RetrievalResult (+27 more)

### Community 29 - "RateLimiter"
Cohesion: 0.21
Nodes (4): client, mocks, rateLimiter(), RateLimiter

### Community 30 - "workspace.ts"
Cohesion: 0.11
Nodes (47): CommandPalette(), Item, Page(), PageProps, SaveActions(), StatusBadges(), Validation, EntryNote() (+39 more)

### Community 31 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "turnMedia.ts"
Cohesion: 0.10
Nodes (44): Coverage Plan, geminiMimeType(), isStreamedUpload(), discordAttachmentContentKey(), MAX_TIMELINE, frameCount(), equalBins(), estimateMediaTokens() (+36 more)

### Community 33 - "YamlForm.tsx"
Cohesion: 0.13
Nodes (37): cleanComment(), Context, FOCUS_ORDER, Group(), helpFor(), isRecord(), MapBody(), MapFields() (+29 more)

### Community 34 - "scripts"
Cohesion: 0.06
Nodes (34): scripts, build, character, dev, dev:quiet, export:vault, format, format:check (+26 more)

### Community 35 - "recall-calibration.test.ts"
Cohesion: 0.09
Nodes (33): CandidateRow, chunk(), configuredEmbed(), Embed, loadShadowRows(), main(), MATCH_WINDOW_MS, matchTurnMessage() (+25 more)

### Community 36 - "gameCommands.ts"
Cohesion: 0.11
Nodes (42): ref_node_module, createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleHangmanGuide(), handleLeaderboard(), buildGameContainer(), buildTimeoutContainer() (+34 more)

### Community 37 - "youtubeStreams.ts"
Cohesion: 0.19
Nodes (19): metadata, realisticFormats, AudioFormat, audioFormats(), directHttpsUrl(), finiteNumber(), hasCodec(), headersOf() (+11 more)

### Community 38 - "toolTriggerScoring.ts"
Cohesion: 0.08
Nodes (32): Situation Block, getLocalHour(), CASE_SETS, fixturePath, header, rememberFixturePath, searchWebFixturePath, temporaryDirectories (+24 more)

### Community 39 - "memoryEpisodeReplay.ts"
Cohesion: 0.16
Nodes (15): argumentsFrom(), main(), offlineAdapters(), resetEpisodeTrackerForTest(), EpisodeReplayContext, GapDistribution, loadSessionHistorySnapshot(), measureEpisodeGaps() (+7 more)

### Community 40 - "getAnimeSchedule.ts"
Cohesion: 0.18
Nodes (18): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleParams, getCurrentSeason(), getTodayName() (+10 more)

### Community 41 - "worst-case.ts"
Cohesion: 0.12
Nodes (30): sandboxPaths(), appendToBlock(), applyEmpty(), applyWorst(), base64url(), blockRange(), celebratingFaces(), CompatibleModel (+22 more)

### Community 42 - "anthropicLlm.ts"
Cohesion: 0.08
Nodes (44): Budgets, Usage and Cost, @google/adk, Block, callUsage(), classifyAnthropicError(), create(), Effort, ImageMediaType (+36 more)

### Community 43 - "pack.ts"
Cohesion: 0.16
Nodes (24): StudioError, assemble(), FileEdit, invalid(), loadScratch(), markdownUnder(), MEMORY_MODES, PACK_YAML (+16 more)

### Community 44 - "configShared.tsx"
Cohesion: 0.11
Nodes (40): humanize(), Route, DiscordScreen(), ELSEWHERE, OWN, LimitsScreen(), BLOCKS, MemoryScreen() (+32 more)

### Community 45 - "media.ts"
Cohesion: 0.13
Nodes (21): Attachment Intake, Link Priority, Linked Files (`attachment_url`), Lookup Limits, Model Input, Post Media, Replies, Social Post Viewing (+13 more)

### Community 46 - "turnContext.ts"
Cohesion: 0.05
Nodes (78): Turn Entry Work, Embeddings and Episodic Recall, channelVisibility, ChannelVisibilityResolver, registerChannelVisibility(), resetChannelVisibilityForTest(), UNKNOWN, buildEpisodeRecallBlock() (+70 more)

### Community 47 - "generateObject.ts"
Cohesion: 0.05
Nodes (49): Extraction Run Trace, Background Jobs, @google/genai, zod, adapterFor(), adapters, attempt(), BackgroundWorkload (+41 more)

### Community 48 - "discord/attachments.ts"
Cohesion: 0.05
Nodes (52): ALLOWED_IMAGE_TYPES Consolidation, Attachment History Stripping, Audio Intake Recommendation, Byte Cap as Duration Proxy, Concurrency Binding Constraint, Container Memory Cap Correction, Flash-Lite Modality Verification, Global In-Flight Byte Budget (+44 more)

### Community 49 - "charts.ts"
Cohesion: 0.28
Nodes (13): @napi-rs/canvas, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+5 more)

### Community 50 - "parts.tsx"
Cohesion: 0.08
Nodes (53): lucide-react, Badge(), BadgeTone, TONES, Field(), fieldClass(), FieldProps, Option (+45 more)

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

### Community 55 - "chatCompletionsLlm.ts"
Cohesion: 0.07
Nodes (42): markBillingExhausted(), arrayOf(), callUsage(), CHAT_COMPLETIONS_BASE_URLS, ChatCompletionsOptions, ChatCompletionsResponse, ChatMessage, constsMatch() (+34 more)

### Community 56 - "obsidianExport.ts"
Cohesion: 0.16
Nodes (17): memory Config Section, GuildMemoryClaim, ActiveClaimSubject, ActiveGuildSubject, ExportedClaim, ExportedGuildClaim, exportVault(), formatClaimGroups() (+9 more)

### Community 57 - "budget.ts"
Cohesion: 0.06
Nodes (52): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, acquireSlot(), backgroundShareSpent(), billingExhaustedIn, CallInput, CallReservation, CONCURRENCY (+44 more)

### Community 58 - "schedule.test.ts"
Cohesion: 0.14
Nodes (12): GetAnimeScheduleResult, ScheduleEntry, containerOf(), { getAnimeSchedule }, Handler, JsonNode, makeCollector(), makeEntries() (+4 more)

### Community 59 - "Moods.tsx"
Cohesion: 0.11
Nodes (37): estimateTokens(), TextEditor, TextEditorHandle, TextEditorProps, readYaml(), inMood(), addMoodText(), dependents() (+29 more)

### Community 60 - "reportCommand.ts"
Cohesion: 0.07
Nodes (37): AssemblerInput, Data Models, RateLimiterConfig, ToneKey, WindowMessage, Technology Stack, isAllowedDiscordCdnUrl(), AttachmentCopyError (+29 more)

### Community 61 - "replay-memory-v2.ts"
Cohesion: 0.13
Nodes (18): ref_node_perf_hooks, estimatedTokens(), inputText(), liveAdapters(), measure(), loadTranscriptLines(), ReplayArgs, ReplayMetrics (+10 more)

### Community 62 - "digest.ts"
Cohesion: 0.12
Nodes (31): Gemini Watcher, boundedString(), coverageLine(), cutAtWord(), formatClock(), frameInterval(), framesLine(), HEARD_LINES (+23 more)

### Community 63 - "markdown.ts"
Cohesion: 0.09
Nodes (26): blockQuote(), buildList(), codeBlock, EMOJI, emojiImage(), emphasis(), EMPHASIS_RULES, formatTimestamp() (+18 more)

### Community 64 - "Speech-to-Text HTTP Server"
Cohesion: 0.13
Nodes (17): Speech-to-text HTTP sidecar: Silero VAD -> SenseVoice language ID -> Moonshine…, collections, http_server, io, json, math, numpy, os (+9 more)

### Community 65 - "socialPosts/service.ts"
Cohesion: 0.10
Nodes (19): Process Lifecycle, resolveBlueskyDid(), ParsedBlueskyThread, createSocialPostViewer(), failure(), initializeSocialPosts(), isAbort(), isYtDlpPlatform() (+11 more)

### Community 66 - "fixtures.ts"
Cohesion: 0.05
Nodes (33): @playwright/test, PAGES, at(), field(), studio_ui_e2e_fixtures_expect, Studio, test, index() (+25 more)

### Community 67 - "socialPostParsers.test.ts"
Cohesion: 0.25
Nodes (7): blueskyFixture, blueskyTarget, blueskyVideoFixture, fxTwitterFixture, fxTwitterVideoFixture, redditVideoFixture, xTarget

### Community 68 - "Design System Documentation"
Cohesion: 0.07
Nodes (27): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Action Chips, Badges (+19 more)

### Community 69 - "vitest"
Cohesion: 0.12
Nodes (28): vitest, hostMatches(), HOSTS, parseSocialPostUrl(), platformForHost(), target(), youtubeStartSec(), IMAGE_POST (+20 more)

### Community 70 - "Prefetch Measurement Tools"
Cohesion: 0.21
Nodes (9): main(), MeasurementAnomaly, Options, parseOptions(), percentile(), PrefetchMeasurementCase, PrefetchMeasurementSummary, PrefetchMeasurementTrial (+1 more)

### Community 71 - "package.json"
Cohesion: 0.07
Nodes (27): description, engines, node, typescript, main, name, type, version (+19 more)

### Community 72 - "test"
Cohesion: 0.10
Nodes (24): Deploy and Roll Back, GHCR Visibility, How a Deploy Runs, Redeploy, Release to Stable, Roll Back, Self-Hosted Runner, At a Glance (+16 more)

### Community 73 - "File Upload Handling"
Cohesion: 0.17
Nodes (9): countedBody(), deleteFile(), FileResource, getFile(), sleep(), streamToFiles(), UploadedFile, videoDurationSec() (+1 more)

### Community 74 - "interactionCreate.metrics.test.ts"
Cohesion: 0.08
Nodes (18): ref_node_async_hooks, outcomeForTurn, recordReplyOutcome(), ReplyOutcome, citationsForTurn, SearchCitation, NAME_MENTION_REGEX, metrics (+10 more)

### Community 75 - "anthropicMain.eval.test.ts"
Cohesion: 0.19
Nodes (15): makeGuild(), asObject(), asObjects(), chunkLabel(), componentDetails(), walk(), isComponentsV2Payload(), PayloadObject (+7 more)

### Community 76 - "roka Service"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 77 - "Character Harness Research 2026"
Cohesion: 0.12
Nodes (18): 1. Character as a Folder Pack, 2. Static First, Dynamic After, Reply Shape Last, 3. Any OpenAI-Compatible Endpoint, 4. Files First, Dashboard Later, Character Formats, Character Harness Research 2026, Decisions for Rokabot, Evidence-Backed (+10 more)

### Community 78 - "getWeather.ts"
Cohesion: 0.15
Nodes (12): GeocodingResult, getWeather(), GetWeatherParams, GetWeatherResult, OpenMeteoWeather, weatherCodeToCondition(), WeatherFailure, WeatherReading (+4 more)

### Community 79 - "views.test.ts"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "watch.ts"
Cohesion: 0.12
Nodes (15): mocks, countUriTokens(), elapsedSince(), getClient(), mediaPart(), messageOf(), reasonFor(), requestFor() (+7 more)

### Community 81 - "nativeAnthropic.ts"
Cohesion: 0.04
Nodes (72): describeUsage(), KEY_ENV, main(), MODEL, nativeRoute(), Options, parseOptions(), percentile() (+64 more)

### Community 82 - "Search Prefetch Reporting"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "models.ts"
Cohesion: 0.21
Nodes (14): BuiltIn, detail(), errorText(), failure(), listed(), listRequest(), ModelPaths, ModelTest (+6 more)

### Community 84 - "messageContent.ts"
Cohesion: 0.10
Nodes (32): ImageAttachment, isSupportedMedia(), describeEmbed(), describeForwardedSnapshots(), describePoll(), embedMatchesSocialPost(), extractComponentMedia(), walk() (+24 more)

### Community 85 - "PackFileScreen.tsx"
Cohesion: 0.07
Nodes (61): react, DiffView(), Band, bandFor(), MEMORY, PanelTab, PreviewPanel(), PreviewPanelProps (+53 more)

### Community 86 - "metrics.eval.test.ts"
Cohesion: 0.16
Nodes (14): resetMonitor(), resetForTest(), stopExtractionScheduler(), waitForInFlightExtractions(), __resetTestRunTurnFactory(), stopUpdateNotifier(), shutdown(), stopMemoryTasks() (+6 more)

### Community 87 - "config.ts"
Cohesion: 0.05
Nodes (41): Configuration (AGENTS.md), Tech Stack (AGENTS.md), Secrets, Source Files, CompatibleCapabilities, defaultEmbeddingProvider(), baseConfig, CAPABILITY_CHOICES (+33 more)

### Community 88 - "Social Post Viewing Research"
Cohesion: 0.33
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "ToneKey"
Cohesion: 0.11
Nodes (28): AssemblerInput, assembleSystemPrompt(), STABLE_PREFIXES, buildContextPrompt(), CORE_PROMPT, CORE_PROMPT_FORGET_ONLY, CORE_PROMPT_MEMORY_FREE, FaceGroup (+20 more)

### Community 90 - "DiscordPreview.tsx"
Cohesion: 0.20
Nodes (19): splitPath(), Avatar(), CAPTIONS, Chip(), describe(), DiscordPreview(), filled(), firstLine() (+11 more)

### Community 91 - "extractionSchema.ts"
Cohesion: 0.04
Nodes (45): AddOperationSchema, calendarDateProperties, DATED_GUILD_PREDICATES, DatedGuildAddOperationSchema, DatedGuildPredicateId, datedGuildPredicates, DatedGuildPredicateSchema, DatedGuildUpdateOperationSchema (+37 more)

### Community 92 - "test-chat.ts"
Cohesion: 0.19
Nodes (13): ref_node_readline, args, handleInput(), htmlIndex, main(), previewMessages, username, eachOutside() (+5 more)

### Community 93 - "jev/client.ts"
Cohesion: 0.20
Nodes (13): jev Config Section, Jev Design (Per-Feature Modes), Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk, @typesafe-ai/sdk, undici, fetchWithKeepAlive() (+5 more)

### Community 94 - "memoryClaimSchema.ts"
Cohesion: 0.17
Nodes (11): runMigrations(), columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable() (+3 more)

### Community 95 - "static.ts"
Cohesion: 0.18
Nodes (10): ref_node_crypto, ref_node_http, SECURITY_HEADERS, app, port, shellEnv, APP_ROUTES, CONTENT_TYPES (+2 more)

### Community 96 - "WAV File Validation"
Cohesion: 0.38
Nodes (5): read_wav(), WavError, make_wav(), ReadWavTest, ValueError

### Community 97 - "load.ts"
Cohesion: 0.05
Nodes (47): moods.yml, Character, deepFreeze(), escapeRegExp(), loadCharacter(), expand(), prompt(), readYaml() (+39 more)

### Community 98 - "predicates.ts"
Cohesion: 0.06
Nodes (44): oldClaimId, undone, confidenceForEvidence(), getActiveClaimById(), UserMemoryClaim, baseSalienceOf(), GuildPredicateId, isKnownPredicate() (+36 more)

### Community 99 - "ASR Sidecar Service"
Cohesion: 0.22
Nodes (8): API, ASR Sidecar, Build and Run, Configuration, `GET /health`, Models and Licences, `POST /transcribe?maxSpeechSec=120`, Tests

### Community 100 - "app.test.ts"
Cohesion: 0.12
Nodes (18): StudioOptions, DEFAULT_BASE_URLS, ApiError, commentedConfig(), ENV_TEXT, FilesBody, json(), MODEL_ENV (+10 more)

### Community 101 - "fallbackModel.ts"
Cohesion: 0.04
Nodes (50): `search`, At a Glance, Hedge, Logs, Models, Pinning, Provider IDs, Request Shaping (+42 more)

### Community 102 - "timezone.ts"
Cohesion: 0.35
Nodes (9): loadGetLocalHour(), loadTimezoneModule(), unpinnedHour(), dateString(), dateTimeParts(), getLocalDate(), localDateStartEpoch(), localDateTimeFormatter() (+1 more)

### Community 103 - "attachmentLimits.ts"
Cohesion: 0.19
Nodes (11): RFC-3003, Media Watching, The `openai-compatible` Exception, GEMINI_SPELLINGS, MAX_AUDIO_SIZE_BYTES, MAX_DOCUMENT_SIZE_BYTES, MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES (+3 more)

### Community 104 - "duration.ts"
Cohesion: 0.23
Nodes (12): Box, durationFromTokens(), movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0() (+4 more)

### Community 105 - "turnMedia.test.ts"
Cohesion: 0.20
Nodes (5): digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf()

### Community 107 - "Features"
Cohesion: 0.18
Nodes (11): Any Model, Bring Your Own Character, Built to Stay Up, Conversation First, Eyes and Ears, Features, Games and Stats, Memory (+3 more)

### Community 108 - "Raspberry Pi Runbook"
Cohesion: 0.08
Nodes (26): Access, At a Glance, Bot Lifecycle, Bug Reports, Data and Backups, Docker, Extraction Funnel, Failure Diagnostics (+18 more)

### Community 109 - "Speech Budget Management"
Cohesion: 0.42
Nodes (4): Keep time-ordered segments within the speech budget, spread across the clip.…, Segment, select_segments(), SelectSegmentsTest

### Community 110 - "Configuration Changes"
Cohesion: 0.22
Nodes (9): Any OpenAI-Compatible Model, Budgets and Monthly Spend, Configuration Changes, Discord App Install and Permissions, Environment Switches, Gemini Terms, Hedging Slow Calls, Verify a Model Profile (+1 more)

### Community 111 - "common.ts"
Cohesion: 0.24
Nodes (17): decodeEntities(), entryAuthor(), entryContent(), feedEntries(), feedField(), htmlToText(), NAMED_ENTITIES, parseRedditFeedPost() (+9 more)

### Community 112 - "replyShape.ts"
Cohesion: 0.08
Nodes (39): Tunables, Evidence, Known Limits, Rerunning the Check, Results, Roka Voice v4: Looked-Up Turns and Saying No, Root Causes, Tunables (+31 more)

### Community 116 - "createTurnContext"
Cohesion: 0.07
Nodes (34): At a Glance, Memory Modes, Mood Detection, Prompt Engine, Safety Ladder, Search State, Source Files, System Prompt Blocks (+26 more)

### Community 117 - "promptSafety.ts"
Cohesion: 0.15
Nodes (19): escapeRegExp(), stripNarratedToolCalls(), buildFactsEnvelope(), buildOverheardBlock(), FACTS_UNTRUSTED_DATA_LABEL, isSafeFactKey(), isSafeFactScalar(), MAX_FACT_KEY_LEN (+11 more)

### Community 119 - "Memory"
Cohesion: 0.08
Nodes (30): Extraction, Jev Judgments, Admission, Capture, Claim Lifecycle and Retention, Deferred Items, Extraction, Fact Reclassification (+22 more)

### Community 120 - "metadata.ts"
Cohesion: 0.11
Nodes (24): ref_node_child_process, ref_node_net, ref_node_url, api(), assignable(), CommitlintConfig, GitHubActor, GitHubIssue (+16 more)

### Community 121 - "Jev Judgments"
Cohesion: 0.13
Nodes (15): At a Glance, Client, Configuration, Jev Judgments, Main-Model Judge, Memory Judge, Memory Judgments, Modes (+7 more)

### Community 122 - "hiddenRetractions.test.ts"
Cohesion: 0.09
Nodes (33): Hidden-Fact Reconciliation, fact(), seedGuild(), embedEpisodeText(), delay(), embedPendingFacts(), sweep(), PAST_FACT_MARKER (+25 more)

### Community 123 - "cli.ts"
Cohesion: 0.13
Nodes (15): ref_node_util, CaptureInput, CaptureKind, CaptureRecord, CaptureSink, createCaptureSink(), main(), rokaAuthor() (+7 more)

### Community 124 - "replies/types.ts"
Cohesion: 0.09
Nodes (26): ref_node_os, SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL, MAX_REQUESTED_REPLIES, ReadRepliesParams, PLATFORM_NAMES, defang(), formatRepliesForModel(), line() (+18 more)

### Community 125 - "transcribe.test.ts"
Cohesion: 0.09
Nodes (29): EMPTY, extractFrame(), extractFrames(), frameBins(), FrameRunner, FrameSource, frameTimestamps(), headerArgs() (+21 more)

### Community 126 - "Speech Server Engines"
Cohesion: 0.33
Nodes (6): Engines, load_engines(), main(), SpeechServer, NamedTuple, ThreadingHTTPServer

### Community 127 - "Linting Configuration"
Cohesion: 0.67
Nodes (3): lint-staged, *.{json,md,yml,yaml}, *.{ts,js}

### Community 129 - "probe-llm-profile.ts"
Cohesion: 0.10
Nodes (31): dotenv, CITY_SCHEMA, hasThinkingTag(), isFilled(), isSupportedProfile(), isTimeZone(), judgeJson(), judgeText() (+23 more)

### Community 130 - "test-adk-smoke.ts"
Cohesion: 0.31
Nodes (7): ref_node_dns, ErrorRecoveryPlugin, main(), results, runQuery(), TestResult, wordCount()

### Community 131 - "Speech Transcription Processing"
Cohesion: 0.60
Nodes (5): decode(), detect_speech(), language_code(), transcribe(), ndarray

### Community 133 - "textEdit.ts"
Cohesion: 0.35
Nodes (16): Primitive, flowMap(), insertLine(), insertPair(), lineEnd(), lineStart(), pairOf(), putScalar() (+8 more)

### Community 134 - "Rules Across Modules"
Cohesion: 0.22
Nodes (9): At a Glance, Changing a Contract, Modules, Rules Across Modules, SQLite Is Canonical, Technical Requirements, The Character Pack Is the Persona Source, The System Prompt Has a Size Cap (+1 more)

### Community 135 - "statsCommand.ts"
Cohesion: 0.31
Nodes (9): IGNORABLE_CODES, isIgnorableDiscordError(), handleStatsCommand(), isStatsView(), logStatsError(), selectionFor(), sendStatsError(), STATS_VIEWS (+1 more)

### Community 136 - "deploy Job"
Cohesion: 0.48
Nodes (7): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping)

### Community 137 - "ref_node_fs"
Cohesion: 0.06
Nodes (28): js-yaml, ref_node_assert, ref_node_fs, ref_node_path, ref_node_worker_threads, main(), MEMORY_MODES, summary() (+20 more)

### Community 138 - "resolveRole"
Cohesion: 0.24
Nodes (12): Source Files, Legacy Config, Resolution, Source Files, Validation Errors, geminiKeyRequired(), isProviderId(), legacyLlm() (+4 more)

### Community 140 - "roka.ts"
Cohesion: 0.05
Nodes (56): The Retry Loop, BackoffOptions, classifyGeminiFailure(), classifyMarker(), computeBackoff(), DEFAULT_MAX_BACKOFF_MS, extractGeminiStatus(), GeminiFailureResult (+48 more)

### Community 141 - "turnContext.test.ts"
Cohesion: 0.22
Nodes (5): entryWork(), jevConfig, mocks, turnOptions(), turnWith()

### Community 142 - "Architecture (AGENTS.md)"
Cohesion: 0.33
Nodes (7): Architecture (AGENTS.md), Critical Do-Nots, Project (Rokabot description), fallback Config Section, gemini Config Section, rateLimit Config Section, session Config Section

### Community 143 - "UI TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals (+6 more)

### Community 144 - "searchWeb"
Cohesion: 0.20
Nodes (6): searchWebTool, searchWeb(), mocks, OUTCOME, searchIsAvailable(), searchProviderSetting()

### Community 145 - "roka.test.ts"
Cohesion: 0.09
Nodes (30): generateResponse(), __setTestRunTurnFactory(), steeringForRequest, TestRunTurn, destroySession(), resetIdleTimer(), droppedFor(), inlineFor() (+22 more)

### Community 146 - "agent/attachments.ts"
Cohesion: 0.09
Nodes (34): PDF Token Cost Measurement, Download, Token Admission, sharp, anthropicBlock(), countWithAnthropic(), estimateTokens(), imageTokens() (+26 more)

### Community 147 - "searchNativeAnthropic.test.ts"
Cohesion: 0.06
Nodes (25): @anthropic-ai/sdk, AnthropicMessagesClient, STRUCTURED_OUTPUT_TOOL, ContentBlock, fixtures, usage(), answer(), budget (+17 more)

### Community 148 - "yamlEdit.ts"
Cohesion: 0.21
Nodes (23): diff, yaml, applyOne(), character, config, repo, voice, stringifyDoc() (+15 more)

### Community 149 - "render.ts"
Cohesion: 0.11
Nodes (42): escapeHtml(), MarkdownContext, renderMarkdown(), renderPlainText(), asObject(), asObjects(), authorKey(), avatarUrl() (+34 more)

### Community 150 - "Configuration"
Cohesion: 0.07
Nodes (28): At a Glance, Capture and Prompt, Character, Configuration, `discord`, `embeddings`, `emoji`, `fallback` (+20 more)

### Community 151 - "persona-replay.ts"
Cohesion: 0.11
Nodes (28): ANTHROPIC_SEARCH, appendReplyShape(), Arm, claudeSettings(), GEMINI_CONFIG, GEMINI_SEARCH, loadArm(), LoadedArm (+20 more)

### Community 152 - "searchPrefetch.ts"
Cohesion: 0.17
Nodes (15): Footer, recordSearchCitations(), buildLookedUpBlock(), clip(), decidePrefetch(), JevPrefetchMode, PREFETCH_TOOL_NAME, PrefetchContext (+7 more)

### Community 153 - "privacy"
Cohesion: 0.09
Nodes (24): Memory, At a Glance, Browse Memory in Obsidian, Forgetting and Opting Out, How She Learns, Key Settings, Maintenance Scripts, Memory (+16 more)

### Community 154 - "secrets.ts"
Cohesion: 0.26
Nodes (15): readText(), writeAtomic(), ALWAYS_REQUIRED, checkKey(), deleteSecret(), entry(), envLine(), ExampleKey (+7 more)

### Community 155 - "collection.ts"
Cohesion: 0.40
Nodes (8): buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount(), handleBuddyCollection(), { getBuddyCollection }, BuddyData, getBuddyCollection()

### Community 156 - "Product Requirements"
Cohesion: 0.25
Nodes (8): At a Glance, Functional Requirements, Objectives, Problem, Product Requirements, Source Files, Target Users, User Workflow

### Community 157 - "updateNotifier.ts"
Cohesion: 0.15
Nodes (16): cfg, LATEST, store, checkForUpdate(), fetchLatestRelease(), isNewerVersion(), LatestRelease, moduleDirectory (+8 more)

### Community 158 - "promptGolden.test.ts"
Cohesion: 0.17
Nodes (15): Stable Prefix and Caching, systemBlocks(), splitStablePrefix(), computeGolden(), digest(), FIXTURE, MESSAGES, MODES (+7 more)

### Community 159 - "session.ts"
Cohesion: 0.07
Nodes (27): Concurrency and Lifecycle Under Retry, abortActiveTurns(), __resetModelFallbackForTest(), APP_NAME, clearSessionErrorCount(), destroyAllSessions(), idleTimers, incrementSessionErrorCount() (+19 more)

### Community 160 - "README.md"
Cohesion: 0.20
Nodes (8): Jev Integration (Research Doc), Contributing, Documentation, How It Works, License, Quick Start, Tech Stack, Who Is Maniwa Roka and Rokabot?

### Community 161 - "recall-calibration-thresholds.ts"
Cohesion: 0.19
Nodes (17): chooseFloor(), cli(), cohensKappa(), currentFloorOf(), KindReport, Label, main(), MIN_AGREED_PAIRS (+9 more)

### Community 162 - "Characters"
Cohesion: 0.18
Nodes (11): A Pack Outside the Image, At a Glance, character.yml, Characters, Harness Prompts and Overrides, How the Bot Picks a Pack, Make a New Character, Pack Layout (+3 more)

### Community 163 - "judgments.ts"
Cohesion: 0.12
Nodes (26): BoundedAlias, boundedAliases(), judgeEpisodeAdmission(), judgeEpisodeOperations(), judgeHiddenRetractions(), judgeTurn(), MemoryVerification, timeOfDay() (+18 more)

### Community 164 - "Product"
Cohesion: 0.18
Nodes (10): Accessibility & Inclusion, Anti-references, Brand Personality, Design Principles, Platform, Positioning, Product, Product Purpose (+2 more)

### Community 165 - "API and Security Tests"
Cohesion: 0.20
Nodes (10): API, Errors, Model Connection Test, Pack File Rules, Persona Studio, Security Model, Source Files, Start It (+2 more)

### Community 166 - "Models"
Cohesion: 0.13
Nodes (15): Any OpenAI-Compatible Model, At a Glance, Budgets and Limits, Capabilities Reference, Choose the Main and Fallback, Copy-Paste Entries, Entry Options, Fields for OpenAI-Compatible Entries (+7 more)

### Community 167 - "reminderStore.ts"
Cohesion: 0.17
Nodes (19): reminders Config Section, listRemindersTool, setReminderTool, cancelReminder(), listReminders(), setReminder(), SetReminderParams, ActiveReminder (+11 more)

### Community 168 - "scheduler.test.ts"
Cohesion: 0.19
Nodes (14): maybeSample(), shouldSample(), startExtractionScheduler(), advancePastRetryDelay(), configMock, drain(), enqueue(), enqueueDelayed() (+6 more)

### Community 169 - "Deployment and Setup Guide"
Cohesion: 0.14
Nodes (14): At a Glance, First-Run Checks, Getting Started, Install and Configure, Model Keys for the Shipped Config, Next Steps, Prerequisites, Register Slash Commands (+6 more)

### Community 170 - "Auto-Deploy Platforms"
Cohesion: 0.14
Nodes (13): Answer, Auto-Deploy Platforms, Coolify, Docker API Version, Fly.io, GHCR Limits, Maintained Fork, Original Project (+5 more)

### Community 171 - "Roka Voice v3: Restoring Variety on Haiku"
Cohesion: 0.20
Nodes (9): Canon Research, Complaints After the Haiku Switch, Known Weak Spots, Replay and Blind-Judge Method, Rerunning the Check, Results, Roka Voice v3: Restoring Variety on Haiku, Root Causes (+1 more)

### Community 172 - "judgments.test.ts"
Cohesion: 0.25
Nodes (3): LOOKUP_QUESTION, TONE_CRITERIA, mocks

### Community 173 - "persona-report.ts"
Cohesion: 0.08
Nodes (38): Reading Validation Errors, voice.yml, Beats, Ending, Faces, Golden Test, Message Weight, Opener (+30 more)

### Community 174 - "Embedding Project Config"
Cohesion: 0.15
Nodes (12): compilerOptions, lib, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+4 more)

### Community 175 - "searchAnime.ts"
Cohesion: 0.24
Nodes (8): searchAnimeTool, jikanThrottle(), AnimeResult, JikanAnimeEntry, JikanResponse, searchAnime(), SearchAnimeParams, SearchAnimeResult

### Community 176 - "videoVariant.ts"
Cohesion: 0.48
Nodes (5): PlayableVideo, audioRank(), qualifies(), selectPlayableVideo(), VideoCandidate

### Community 178 - "toolTrigger.ts"
Cohesion: 0.09
Nodes (28): emitTrialRecord(), formatTrialRecord(), TrialRecord, BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey(), DIAGNOSTIC_TIMEOUT_MS, errorText() (+20 more)

### Community 179 - "Features"
Cohesion: 0.20
Nodes (10): At a Glance, Features, Games and Gacha, Reactions, Status Rotation and Update Notices, Reminders, Seeing and Watching, Source Files, Stats (+2 more)

### Community 180 - "Embedding Service Docs"
Cohesion: 0.20
Nodes (9): API, Build and Run, Configuration, Embedding Sidecar, `GET /health`, Model and Licences, `POST /embed`, Smoke Test (+1 more)

### Community 181 - "config.test.ts"
Cohesion: 0.43
Nodes (6): clearTunableEnvVars(), loadFloors(), merge(), setAnthropicOnlyEnv(), setRequiredEnvVars(), withYamlOverride()

### Community 182 - "HeaderUtilities.tsx"
Cohesion: 0.11
Nodes (26): NoticeRow(), NotificationCenter(), THEMES, ThemeSwitch(), ToastCard(), Toaster(), TONE_ICON, ActionChip() (+18 more)

### Community 183 - "toneStyles.ts"
Cohesion: 0.50
Nodes (3): getToneStyle(), TONE_STYLES, ToneStyle

### Community 185 - "extractionQueue.ts"
Cohesion: 0.18
Nodes (12): claimNextForGuild(), enqueueEpisode(), ExtractionFailureClassification, ExtractionFailureResult, ExtractionQueueRow, mapJob(), MAX_EXTRACTION_QUEUE_ATTEMPTS, pruneFailedExtractionJobs() (+4 more)

### Community 186 - "yamlText.ts"
Cohesion: 0.50
Nodes (12): appendEntry(), expectAfter(), lineEnd(), lineStart(), readIn(), removeKey(), removeListItem(), same() (+4 more)

### Community 187 - "Speech Pattern Documentation"
Cohesion: 0.25
Nodes (7): Dialogue Style, Example Lines, Example Replies With Structure, Expressions, Formatting Your Reply, Speech Patterns, Verbal Style

### Community 188 - "Persona Identity Definition"
Cohesion: 0.25
Nodes (7): Identity & Appearance, Insecurities, People You Know, Personality, Romantic Side, Who You Are, Your World

### Community 191 - "fingerprint.ts"
Cohesion: 0.16
Nodes (17): DEFAULT_EMBEDDING_MODELS, embeddingDimensions(), embeddingFingerprint(), EmbeddingProvider, LOCAL_EMBEDDING_MODEL, RECIPES, fakeFetch(), FetchCall (+9 more)

### Community 193 - "Changelog"
Cohesion: 0.20
Nodes (9): [0.2.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.1.0...v0.2.0) (2026-10-16), [0.3.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.2.0...v0.3.0) (2026-10-16), [0.4.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.3.0...v0.4.0) (2026-10-17), Bug Fixes, Bug Fixes, Changelog, Features, Features (+1 more)

### Community 194 - "Character Packs"
Cohesion: 0.25
Nodes (7): Character Packs, Layout, Locked Prompts, Macros, Making a New Character, Prompt Files, Search Prompts

### Community 196 - "Contributing"
Cohesion: 0.12
Nodes (14): Branches, Contributing, Gates, Labels and Assignees, Merging, Pull Requests, Titles, Code Style (+6 more)

### Community 197 - "Audio Video Documentation"
Cohesion: 0.50
Nodes (3): Audio and Video, When You Couldn't Watch It, When You've Watched Something

### Community 198 - "Release Configuration"
Cohesion: 0.50
Nodes (3): bootstrap-sha, packages, $schema

### Community 221 - "Secrets.tsx"
Cohesion: 0.08
Nodes (43): ActionChipProps, Button(), ButtonProps, ButtonStyle, IconButton(), IconButtonProps, STYLES, Dialog() (+35 more)

### Community 225 - "measure.ts"
Cohesion: 0.32
Nodes (10): sizeLimitFor(), Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION, mimeForPath(), resolveKey() (+2 more)

### Community 228 - "replyBlocks.ts"
Cohesion: 0.38
Nodes (8): blockCount(), BlockKind, capReplyBlocks(), countReplyBlocks(), MAX_REPLY_BLOCKS, parse(), Piece, splitAtDividers()

### Community 229 - "UI Styling Assets"
Cohesion: 0.33
Nodes (5): @fontsource-variable/geist, @fontsource-variable/geist-mono, react-dom, root, studio_ui_src_styles

### Community 230 - "pull_request_template.md"
Cohesion: 0.50
Nodes (3): Evidence, Merge Danger, Summary

### Community 231 - "embeddings/client.ts"
Cohesion: 0.13
Nodes (16): EmbeddingClient, EmbeddingResult, EmbeddingRole, EmbeddingSettings, FACTORIES, getEmbeddingClient(), resetEmbeddingClientForTest(), isEmbeddingVector() (+8 more)

### Community 234 - "discord.js"
Cohesion: 0.07
Nodes (25): discord.js, gachaCommand, gameCommands, hangmanCommand, shiritoriCommand, buildCommandBody(), reportCommand, statsCommand (+17 more)

### Community 235 - "reports.ts"
Cohesion: 0.43
Nodes (6): main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne()

### Community 236 - "Decisions"
Cohesion: 0.22
Nodes (8): Agent and Prompts, Decisions, Deployment, Discord, Media, Memory, Models and Search, Repository

### Community 247 - "harness.eval.test.ts"
Cohesion: 0.15
Nodes (8): benchmarkTranscript, CapturingRunner, mocks, payloadText(), collect(), responseText(), scriptedResponse(), transcript

### Community 248 - "Media Watching"
Cohesion: 0.25
Nodes (8): Accounting, Digest and Turn Input, Media Watching, Qwen Watcher, Remembered Media, Speech Sidecar, Transport, Watcher Modes

### Community 250 - "Coding Guidelines (Andrej Karpathy)"
Cohesion: 0.33
Nodes (5): 1. Think Before Coding, 2. Simplicity First, 3. Surgical Changes, 4. Goal-Driven Execution, Coding Guidelines (Andrej Karpathy)

## Knowledge Gaps
- **1642 isolated node(s):** `$schema`, `indentStyle`, `indentWidth`, `lineWidth`, `enabled` (+1637 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2119 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `profiles.ts`, `jevReplay.ts`, `qwenWatch.ts`, `memoryEpisodeStore.ts`, `buddy.ts`, `messageBuilder.ts`, `getDb`, `src/games/hangman.ts`, `scheduler.ts`, `queries.ts`, `messageCreate.ts`, `linesGolden.test.ts`, `tools/index.ts`, `episodeTracker.ts`, `Media`, `gacha.ts`, `config`, `closeDb`, `retriever.ts`, `RateLimiter`, `turnMedia.ts`, `recall-calibration.test.ts`, `gameCommands.ts`, `youtubeStreams.ts`, `toolTriggerScoring.ts`, `memoryEpisodeReplay.ts`, `getAnimeSchedule.ts`, `anthropicLlm.ts`, `media.ts`, `turnContext.ts`, `generateObject.ts`, `discord/attachments.ts`, `charts.ts`, `Inline Data Contract`, `handler.ts`, `extractionSchema.test.ts`, `chatCompletionsLlm.ts`, `budget.ts`, `schedule.test.ts`, `reportCommand.ts`, `replay-memory-v2.ts`, `digest.ts`, `socialPosts/service.ts`, `socialPostParsers.test.ts`, `Prefetch Measurement Tools`, `package.json`, `File Upload Handling`, `interactionCreate.metrics.test.ts`, `anthropicMain.eval.test.ts`, `getWeather.ts`, `views.test.ts`, `watch.ts`, `nativeAnthropic.ts`, `Search Prefetch Reporting`, `messageContent.ts`, `metrics.eval.test.ts`, `config.ts`, `ToneKey`, `extractionSchema.ts`, `test-chat.ts`, `jev/client.ts`, `memoryClaimSchema.ts`, `load.ts`, `predicates.ts`, `app.test.ts`, `fallbackModel.ts`, `timezone.ts`, `attachmentLimits.ts`, `duration.ts`, `turnMedia.test.ts`, `common.ts`, `replyShape.ts`, `promptSafety.ts`, `Memory`, `metadata.ts`, `hiddenRetractions.test.ts`, `replies/types.ts`, `transcribe.test.ts`, `probe-llm-profile.ts`, `ref_node_fs`, `roka.ts`, `turnContext.test.ts`, `searchWeb`, `roka.test.ts`, `agent/attachments.ts`, `searchNativeAnthropic.test.ts`, `yamlEdit.ts`, `persona-replay.ts`, `searchPrefetch.ts`, `collection.ts`, `updateNotifier.ts`, `promptGolden.test.ts`, `session.ts`, `judgments.ts`, `reminderStore.ts`, `scheduler.test.ts`, `judgments.test.ts`, `persona-report.ts`, `videoVariant.ts`, `toolTrigger.ts`, `config.test.ts`, `toneStyles.ts`, `extractionQueue.ts`, `fingerprint.ts`, `measure.ts`, `replyBlocks.ts`, `embeddings/client.ts`, `discord.js`, `harness.eval.test.ts`?**
  _High betweenness centrality (0.223) - this node is a cross-community bridge._
- **Why does `config` connect `config` to `test-adk-smoke.ts`, `memoryEpisodeStore.ts`, `buddy.ts`, `getDb`, `src/games/hangman.ts`, `scheduler.ts`, `roka.ts`, `turnContext.test.ts`, `messageCreate.ts`, `tools/index.ts`, `linesGolden.test.ts`, `roka.test.ts`, `agent/attachments.ts`, `episodeTracker.ts`, `guildFactDates.ts`, `parsers.ts`, `searchWeb`, `gacha.ts`, `closeDb`, `collection.ts`, `retriever.ts`, `RateLimiter`, `updateNotifier.ts`, `session.ts`, `turnMedia.ts`, `recall-calibration-thresholds.ts`, `recall-calibration.test.ts`, `judgments.ts`, `youtubeStreams.ts`, `gameCommands.ts`, `reminderStore.ts`, `getAnimeSchedule.ts`, `anthropicLlm.ts`, `media.ts`, `turnContext.ts`, `generateObject.ts`, `discord/attachments.ts`, `toolTrigger.ts`, `obsidianExport.ts`, `budget.ts`, `reportCommand.ts`, `socialPosts/service.ts`, `vitest`, `File Upload Handling`, `interactionCreate.metrics.test.ts`, `getWeather.ts`, `watch.ts`, `nativeAnthropic.ts`, `config.ts`, `harness.eval.test.ts`, `jev/client.ts`, `predicates.ts`, `fallbackModel.ts`, `timezone.ts`, `embeddings/client.ts`, `attachmentLimits.ts`, `discord.js`, `Memory`, `hiddenRetractions.test.ts`, `replies/types.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `react` connect `PackFileScreen.tsx` to `YamlForm.tsx`, `UI Styling Assets`, `package.json`, `configShared.tsx`, `parts.tsx`, `Sidebar.tsx`, `HeaderUtilities.tsx`, `DiscordPreview.tsx`, `Moods.tsx`, `Secrets.tsx`, `workspace.ts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `$schema`, `indentStyle`, `indentWidth` to the rest of the system?**
  _1642 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `profiles.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.04773082942097027 - nodes in this community are weakly interconnected._
- **Should `jevReplay.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `qwenWatch.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0967741935483871 - nodes in this community are weakly interconnected._