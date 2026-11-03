# Graph Report - agent-files  (2026-11-03)

## Corpus Check
- 702 files · ~590,716 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 30 file(s) not represented in the graph (top: (none) 13, .jsonl 11, .rss 2)

## Summary
- 5716 nodes · 16135 edges · 238 communities (191 shown, 47 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 612 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7412692d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- byteBudget.ts
- jevReplay.ts
- qwenWatch.ts
- database.ts
- Project Linting Config
- buddy.ts
- messageBuilder.ts
- getDb
- test-features.ts
- scheduler.ts
- searchNativeAnthropic.test.ts
- queries.ts
- discordDoubles.ts
- messageCreate.ts
- reminder.ts
- tools/index.ts
- views.ts
- replies/service.ts
- guildFactDates.ts
- episodeTracker.ts
- Dev Tooling Dependencies
- WindowedSessionService
- workspace.ts
- memoryShadow.ts
- verification.test.ts
- config
- run.ts
- Project Dependencies
- Secrets.tsx
- RateLimiter
- PackFileScreen.tsx
- TypeScript Configuration
- turnMedia.ts
- YamlForm.tsx
- Build Dev Scripts
- recall-calibration-sample.ts
- gameCommands.ts
- youtubeStreams.ts
- profiles.ts
- memoryEpisodeReplay.ts
- getAnimeSchedule.ts
- worst-case.ts
- usage.ts
- pack.ts
- configShared.tsx
- discord/attachments.ts
- reliability.ts
- generateObject.ts
- discord.js
- charts.ts
- parts.tsx
- Inline Data Contract
- TypeScript Build Config
- handler.ts
- extractionSchema.test.ts
- makeMessage
- obsidianExport.ts
- budget.ts
- schedule.test.ts
- Moods.tsx
- reportStore.ts
- extractor.ts
- digest.ts
- Multimodal Intake Research
- Speech-to-Text HTTP Server
- socialPosts/service.ts
- serve.ts
- parsers.ts
- Design System Documentation
- vitest
- Prefetch Measurement Tools
- package.json
- Deployment
- File Upload Handling
- interactionCreate.metrics.test.ts
- searchWeb.ts
- roka Service
- toolTrigger.ts
- getWeather.ts
- views.test.ts
- watch.ts
- nativeAnthropic.ts
- Search Prefetch Reporting
- models.ts
- messageContent.ts
- DiscordPreview.tsx
- logger.ts
- config.ts
- Social Viewing Research
- estimateTokens
- reportCommand.ts
- extractionSchema.ts
- test-chat.ts
- embeddings/client.ts
- memoryClaimSchema.ts
- anthropicLlm.ts
- WAV File Validation
- load.ts
- measure-native-search.ts
- ASR Sidecar Service
- app.test.ts
- modelHedge.test.ts
- timezone.ts
- Rokabot TRD
- duration.ts
- turnMedia.test.ts
- Commit Linting Rules
- media.ts
- Rokabot Character Data
- Speech Budget Management
- markdown.ts
- redditFeed.ts
- replyShape.ts
- Documentation Style Guide
- Git Commit Standards
- Coding Best Practices
- messageEdge
- promptSafety.ts
- Audio Decoding Tests
- Write Path
- getCurrentTime.ts
- emojiReactor.ts
- closeDb
- tokenBudget.handlers.test.ts
- replyReader
- transcribe.test.ts
- Speech Server Engines
- Linting Configuration
- HTTP Request Handler
- probe-llm-profile.ts
- test-gemini-ga-compare.ts
- Speech Transcription Processing
- Speech Parsing Tests
- textEdit.ts
- displayName
- linesGolden.test.ts
- CI/CD Deployment Pipeline
- ref_node_fs
- discord/channelVisibility.ts
- Text Cleaning Utilities
- roka.ts
- judgments.test.ts
- test-phase8.ts
- UI TypeScript Configuration
- System Architecture
- contentKey.ts
- agent/attachments.ts
- anthropicLlm.test.ts
- yamlEdit.ts
- render.ts
- Configuration
- persona-replay.ts
- turnContext.ts
- privacy
- app.ts
- buildNerd
- Memory
- updateNotifier.ts
- statsCommand.ts
- citations.ts
- Raspberry Pi Command Reference
- recall-calibration.test.ts
- Characters
- jev/client.ts
- Product
- API and Security Tests
- Models
- Claims Memory Architecture
- ref_node_crypto
- Deployment and Setup Guide
- Auto-Deploy Platforms
- Roka Voice v3: Restoring Variety on Haiku
- guildFactDates.test.ts
- persona-report.ts
- Embedding Project Config
- searchAnime.ts
- reportCommand.test.ts
- FakeInteraction
- searchNativeGemini.test.ts
- Features
- Embedding Service Docs
- Getting Started
- react
- models.spec.ts
- playwright.config.ts
- diagnoseKey.test.ts
- yamlText.ts
- Speech Pattern Documentation
- Persona Identity Definition
- Embedding Smoke Tests
- FakeChannel
- markdownGuard.ts
- FakeMessage
- Changelog
- Character Packs
- MarkdownContext
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
- fixtures.ts
- measure.ts
- replyBlocks.ts
- UI Styling Assets
- readReplies.ts
- Media Watching
- reports.ts
- Template Speaking Prompts
- Template Calm Mood
- Cheerful Mood Prompt
- Persona Identity Prompts

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 247 edges
2. `vitest` - 240 edges
3. `config` - 120 edges
4. `logger` - 79 edges
5. `createMessageHandler()` - 54 edges
6. `generateResponse()` - 53 edges
7. `closeDb()` - 53 edges
8. `discord.js` - 50 edges
9. `createInteractionHandler()` - 48 edges
10. `assertClaim()` - 46 edges

## Surprising Connections (you probably didn't know these)
- `Attachment Types and Their Ceilings` --implements--> `GEMINI_SPELLINGS`  [INFERRED]
  docs/trd.md → src/agent/attachmentLimits.ts
- `A Spent Day Is Not a Spent Minute` --references--> `computeBackoff()`  [INFERRED]
  docs/trd/reliability.md → src/agent/geminiReliability.ts
- `At a Glance` --references--> `startCall()`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/budget.ts
- `ADK Error Delivery Constraint` --references--> `ProviderError`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/providerError.ts
- `Digest and Turn Input` --references--> `renderCompactDigest()`  [INFERRED]
  docs/trd/media.md → src/agent/media/digest.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Jev Judgment Shadow-Mode System** — config_jev, docs_runbook_jev_shadow_mode, docs_readme_getting_started [EXTRACTED 0.85]
- **Deploy-to-Pi CI/CD Pipeline** — _github_workflows_deploy_workflow, _github_workflows_deploy_test_job, _github_workflows_deploy_deploy_job, agents_working_conventions [EXTRACTED 0.90]
- **ModelScope Qwen Fallback Feature** — config_fallback, docs_readme_modelscope_fallback, docs_runbook_fallback_model [EXTRACTED 0.90]
- **Gemini Reliability & Failure Handling** — docs_trd_failure_taxonomy, docs_trd_fallback_model, docs_trd_adk_error_delivery, docs_trd_rpm_budget_accounting, docs_trd_concurrency_lifecycle_retry [INFERRED 0.80]
- **Rate-Limit and Token-Budget Guard Mechanisms** — src_agent_tokenbudget, src_discord_bytebudget, docs_trd_rpm_budget_accounting, docs_trd_turn_reserves_calls, docs_trd_two_limiters_diff, docs_trd_per_minute_token_budget [INFERRED 0.80]
- **Conversational Turn Lifecycle** — docs_prd_user_workflow_overview, docs_prd_fr_3_per_channel_conversational_memory, docs_prd_fr_4_layered_personality_prompts, docs_prd_fr_5_tone_detection, src_agent_roka_rokaagent [INFERRED 0.85]
- **Jev Shadow-Mode Judgment Integration** — docs_trd_jev_judgments, docs_trd_jev_turn_judgment, docs_trd_jev_memory_admission, src_agent_jev_client, docs_research_jev_integration_jev, docs_research_jev_integration_design [INFERRED 0.85]
- **Multimodal Attachment Safety Pipeline** — docs_research_multimodal_global_byte_budget, docs_research_multimodal_streaming_size_guard, docs_research_multimodal_attachment_strip_history, docs_research_multimodal_tpm_ceiling_measurement, src_discord_bytebudget [INFERRED 0.95]
- **Rate and Token Budgeting Architecture** — docs_prd_fr_6_rate_limiting, docs_research_multimodal_tpm_ceiling_measurement, src_utils_ratelimiter_ratelimiter, src_agent_tokenbudget [INFERRED 0.95]

## Communities (238 total, 47 thin omitted)

### Community 0 - "byteBudget.ts"
Cohesion: 0.13
Nodes (21): RFC-3003, attachment_url, Handing Her a File, Multimodal Research Doc, Global In-Flight Byte Budget, Global In-Flight Attachment Budget, GEMINI_SPELLINGS, isStreamedUpload() (+13 more)

### Community 1 - "jevReplay.ts"
Cohesion: 0.12
Nodes (26): parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, agreement(), buildConfusionMatrix(), buildProbabilityBins(), buildReplayTurn() (+18 more)

### Community 2 - "qwenWatch.ts"
Cohesion: 0.10
Nodes (23): BudgetReservation, binOf(), ChatCompletion, ContentPart, promptFor(), quoted(), QwenFrame, QwenWatchInput (+15 more)

### Community 3 - "database.ts"
Cohesion: 0.04
Nodes (95): better-sqlite3, EmbeddingResult, GEMINI_FINGERPRINT, geminiVector(), LOCAL_FINGERPRINT, localVector(), BackfillPace, delay() (+87 more)

### Community 4 - "Project Linting Config"
Cohesion: 0.05
Nodes (39): useLiteralKeys, css, formatter, files, ignore, formatter, enabled, indentStyle (+31 more)

### Community 5 - "buddy.ts"
Cohesion: 0.07
Nodes (63): handleGachaMention(), statBar(), buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount(), handleBuddyCollection(), formatBuddySummary() (+55 more)

### Community 6 - "messageBuilder.ts"
Cohesion: 0.08
Nodes (36): getExpressionUrl(), lastExpressionByTone, __resetExpressionState(), TONE_EXPRESSIONS, buildRokaMessage(), buildToolFooter(), footerLeads, longestPostLabel (+28 more)

### Community 7 - "getDb"
Cohesion: 0.04
Nodes (107): Claims Tenancy Model, attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow (+99 more)

### Community 8 - "test-features.ts"
Cohesion: 0.15
Nodes (28): assert(), fail(), makeMessage(), pass(), results, TestResult, buildHangmanBody(), handleHangmanGuess() (+20 more)

### Community 9 - "scheduler.ts"
Cohesion: 0.05
Nodes (63): Memory, persistEpisodeResult(), ABORT_CODES, classifyExtractionError(), ExtractionErrorClassification, SHUTDOWN_SENSITIVE_NAMES, TRANSIENT_HTTP_STATUSES, TRANSIENT_NETWORK_CODES (+55 more)

### Community 10 - "searchNativeAnthropic.test.ts"
Cohesion: 0.06
Nodes (21): Entry Options, Profile Facts, Tested Providers, AnthropicMessagesClient, profileFor(), haiku, qwen, route() (+13 more)

### Community 11 - "queries.ts"
Cohesion: 0.09
Nodes (33): activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome, CountByPredicate (+25 more)

### Community 12 - "discordDoubles.ts"
Cohesion: 0.06
Nodes (28): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+20 more)

### Community 13 - "messageCreate.ts"
Cohesion: 0.09
Nodes (44): Discord Install Requirements: bot Scope Is Load-Bearing, Guild Permissions Are Derived From the API Surface, There Is No Build-Time Pin, and That Is Deliberate, Global In-Flight Byte Budget, Replies, Turn Admission, isMonitored(), markActive() (+36 more)

### Community 14 - "reminder.ts"
Cohesion: 0.18
Nodes (24): ref_discordjs_builders, searchAnime(), fillLine(), mocks, createToolCommandHandler(), TOOL_COMMAND_NAMES, handleAnime(), dueSlots() (+16 more)

### Community 15 - "tools/index.ts"
Cohesion: 0.15
Nodes (19): Tool Footer, flipCoin(), FlipCoinResult, ForgetUserParams, GetAnimeScheduleParams, cancelReminderTool, flipCoinTool, getAnimeScheduleTool (+11 more)

### Community 16 - "views.ts"
Cohesion: 0.13
Nodes (30): activeClaimCount(), distinctRememberedUsers(), episodeCount(), memoryGrowthSeries(), newClaimsThisMonth(), topChannels(), topPredicates(), topRememberedMembers() (+22 more)

### Community 17 - "replies/service.ts"
Cohesion: 0.25
Nodes (26): array(), nonNegativeInteger(), object(), bilibiliAid(), fetchBilibiliReplies(), fetchBlueskyReplies(), BROWSER_USER_AGENT, compactReplyText() (+18 more)

### Community 18 - "guildFactDates.ts"
Cohesion: 0.26
Nodes (16): addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth(), monthForMonth() (+8 more)

### Community 19 - "episodeTracker.ts"
Cohesion: 0.15
Nodes (20): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), resetEpisodeTrackerForTest(), scheduleLull() (+12 more)

### Community 20 - "Dev Tooling Dependencies"
Cohesion: 0.07
Nodes (29): devDependencies, @axe-core/playwright, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, diff, @fontsource-variable/geist, @fontsource-variable/geist-mono (+21 more)

### Community 21 - "WindowedSessionService"
Cohesion: 0.15
Nodes (7): Bytes Do Not Stay in History, Source Files, attachmentMarker(), WindowedSessionService, CapturingLlm, newConversation(), PNG_BASE64

### Community 22 - "workspace.ts"
Cohesion: 0.07
Nodes (65): lucide-react, App(), CommandPalette(), Item, Ambient(), Page(), PageProps, SaveActions() (+57 more)

### Community 23 - "memoryShadow.ts"
Cohesion: 0.18
Nodes (16): addUser(), upsertUserName(), asClaim(), asScenario(), evaluateMemoryShadow(), FixtureClaim, loadReplaySet(), MemoryShadowReport (+8 more)

### Community 24 - "verification.test.ts"
Cohesion: 0.14
Nodes (14): OperationApplicationReport, activeFacts(), apply(), candidateFacts(), episode(), evidenceCount(), factsWithStatus(), jevApplied() (+6 more)

### Community 25 - "config"
Cohesion: 0.04
Nodes (103): Where Rokabot Decides Today, Who-Is-Who Resolver, Bounded Retrieval Contract, Unified Recall, channelVisibility, registerChannelVisibility(), resetChannelVisibilityForTest(), UNKNOWN (+95 more)

### Community 26 - "run.ts"
Cohesion: 0.06
Nodes (59): resetMonitor(), resetForTest(), stopExtractionScheduler(), __resetTestRunTurnFactory(), limiters, CaptureInput, CaptureKind, CaptureRecord (+51 more)

### Community 27 - "Project Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @anthropic-ai/sdk, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml (+7 more)

### Community 28 - "Secrets.tsx"
Cohesion: 0.13
Nodes (31): PackSwitcher(), Button(), IconButton(), Dialog(), Secret, scrollWithin(), ModelList(), middleEllipsis() (+23 more)

### Community 29 - "RateLimiter"
Cohesion: 0.12
Nodes (12): FR-6: Rate Limiting, Concurrency & Lifecycle Under Retry, Discord Gateway Layer, RateLimiterConfig, Concurrency and Lifecycle Under Retry, RPM-Budget Accounting, A Turn Reserves the Calls It May Make, The Two Limiters Bound Their Windows Differently (+4 more)

### Community 30 - "PackFileScreen.tsx"
Cohesion: 0.08
Nodes (48): DiffView(), Band, bandFor(), MEMORY, PanelTab, PreviewPanel(), PreviewPanelProps, Tabs() (+40 more)

### Community 31 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "turnMedia.ts"
Cohesion: 0.11
Nodes (40): geminiMimeType(), durationFromTokens(), equalBins(), estimateMediaTokens(), focusWindow(), FPS_LADDER, HALVES_MAX_DURATION_SEC, HALVES_MIN_DURATION_SEC (+32 more)

### Community 33 - "YamlForm.tsx"
Cohesion: 0.13
Nodes (39): cleanComment(), Context, FOCUS_ORDER, Group(), helpFor(), humanize(), isRecord(), MapBody() (+31 more)

### Community 34 - "Build Dev Scripts"
Cohesion: 0.06
Nodes (35): scripts, build, character, dev, dev:quiet, export:vault, format, format:check (+27 more)

### Community 35 - "recall-calibration-sample.ts"
Cohesion: 0.10
Nodes (27): chunk(), configuredEmbed(), loadShadowRows(), main(), MATCH_WINDOW_MS, matchTurnMessage(), mean(), median() (+19 more)

### Community 36 - "gameCommands.ts"
Cohesion: 0.10
Nodes (43): SQLite Database Reference, ref_node_module, createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleBuddyLeaderboard(), handleHangmanGuide(), HANGMAN_COLORS (+35 more)

### Community 37 - "youtubeStreams.ts"
Cohesion: 0.12
Nodes (26): metadata, realisticFormats, AudioFormat, audioFormats(), directHttpsUrl(), finiteNumber(), hasCodec(), headersOf() (+18 more)

### Community 38 - "profiles.ts"
Cohesion: 0.06
Nodes (30): Failure Classification, FailureKind, BudgetDenial, StructuredOutputError, COMPATIBLE_DEFAULTS, compatibleProfile(), MODEL_PROFILES, ProviderId (+22 more)

### Community 39 - "memoryEpisodeReplay.ts"
Cohesion: 0.11
Nodes (22): ref_node_perf_hooks, argumentsFrom(), estimatedTokens(), inputText(), measure(), loadTranscriptLines(), main(), offlineAdapters() (+14 more)

### Community 40 - "getAnimeSchedule.ts"
Cohesion: 0.19
Nodes (17): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), getCurrentSeason(), getTodayName(), handleAnimeLookup() (+9 more)

### Community 41 - "worst-case.ts"
Cohesion: 0.12
Nodes (32): sandboxPaths(), appendToBlock(), applyDataset(), applyEmpty(), applyOne(), applyWorst(), base64url(), blockRange() (+24 more)

### Community 42 - "usage.ts"
Cohesion: 0.05
Nodes (44): Budgets, Usage and Cost, Logs, Pinning, Provider IDs, Routing, Sticky Window, Switch, RoutedLlm (+36 more)

### Community 43 - "pack.ts"
Cohesion: 0.12
Nodes (42): CHECK_SCRIPT, checkConfig(), ConfigPaths, configProblem(), readConfig(), setTopLevelValue(), validateConfig(), writeConfig() (+34 more)

### Community 44 - "configShared.tsx"
Cohesion: 0.10
Nodes (48): Route, DiscordScreen(), ELSEWHERE, OWN, LimitsScreen(), BLOCKS, MemoryScreen(), ADVANCED (+40 more)

### Community 45 - "discord/attachments.ts"
Cohesion: 0.13
Nodes (25): Audio Intake Recommendation, PDF Intake Recommendation, Video Low Resolution Recommendation, Attachment Types and Their Ceilings, requestCarriesVideo(), ALLOWED_AUDIO_TYPES, ALLOWED_DOCUMENT_TYPES, ALLOWED_IMAGE_TYPES (+17 more)

### Community 46 - "reliability.ts"
Cohesion: 0.04
Nodes (70): fallback Config Section, ModelScope Qwen Fallback, Tech Stack (README), Fallback Model (runbook), ADK Error Delivery Constraint, Gemini Failure Taxonomy, The Fallback Model, A Spent Day Is Not a Spent Minute (+62 more)

### Community 47 - "generateObject.ts"
Cohesion: 0.10
Nodes (28): Background Jobs, adapterFor(), adapters, attempt(), BackgroundWorkload, callUsage(), failureFields(), GenerateObjectInput (+20 more)

### Community 48 - "discord.js"
Cohesion: 0.17
Nodes (16): FR-1: Slash Command Interaction, Features, discord.js, character, askCommand, command, gachaCommand, gameCommands (+8 more)

### Community 49 - "charts.ts"
Cohesion: 0.19
Nodes (17): Expressions & Tones, @napi-rs/canvas, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth() (+9 more)

### Community 50 - "parts.tsx"
Cohesion: 0.11
Nodes (40): Badge(), BadgeTone, TONES, Field(), FieldProps, Option, Select(), SelectProps (+32 more)

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

### Community 55 - "makeMessage"
Cohesion: 0.17
Nodes (16): FakeComponent, HarnessCollection, has(), makeAttachments(), makeChannel(), makeComponent(), makeInteraction(), makeMember() (+8 more)

### Community 56 - "obsidianExport.ts"
Cohesion: 0.18
Nodes (17): Browsing Memory in Obsidian, factKey(), ActiveClaimSubject, ActiveGuildSubject, ExportedClaim, ExportedGuildClaim, exportVault(), formatClaimGroups() (+9 more)

### Community 57 - "budget.ts"
Cohesion: 0.06
Nodes (54): Free-Tier TPM Ceiling Measurement, RateLimiterConfig, The Per-Minute Token Budget, The Per-Minute Token Budget, Turn Admission, acquireSlot(), backgroundShareSpent(), billingExhaustedIn (+46 more)

### Community 58 - "schedule.test.ts"
Cohesion: 0.14
Nodes (12): GetAnimeScheduleResult, ScheduleEntry, containerOf(), { getAnimeSchedule }, Handler, JsonNode, makeCollector(), makeEntries() (+4 more)

### Community 59 - "Moods.tsx"
Cohesion: 0.13
Nodes (35): readYaml(), inMood(), addMoodText(), dependents(), MOOD_NAME, moodKeys(), moodPrompt(), moodsPath() (+27 more)

### Community 60 - "reportStore.ts"
Cohesion: 0.16
Nodes (14): BugReportInput, BugReportType, captureSnapshot(), countReportsSince(), createReportIfAllowed(), MAX_CONTEXT_JSON_BYTES, queryRecentRows(), ReportAttachmentMetadata (+6 more)

### Community 61 - "extractor.ts"
Cohesion: 0.04
Nodes (75): Extraction, Main-Model Judge, Memory Judge, Memory Judgments, @typesafe-ai/sdk, zod, liveAdapters(), BoundedAlias (+67 more)

### Community 62 - "digest.ts"
Cohesion: 0.12
Nodes (31): Coverage Plan, Gemini Watcher, boundedString(), coverageLine(), cutAtWord(), formatClock(), frameInterval(), framesLine() (+23 more)

### Community 63 - "Multimodal Intake Research"
Cohesion: 0.08
Nodes (29): FR-10: Graceful Shutdown, FR-2: Mention/Reply Interaction, FR-5: Tone Detection, FR-7: Error Handling, FR-8: Response Formatting, FR-9: Docker Deployment, Functional Requirements, Problem Statement (+21 more)

### Community 64 - "Speech-to-Text HTTP Server"
Cohesion: 0.13
Nodes (17): Speech-to-text HTTP sidecar: Silero VAD -> SenseVoice language ID -> Moonshine…, collections, http_server, io, json, math, numpy, os (+9 more)

### Community 65 - "socialPosts/service.ts"
Cohesion: 0.12
Nodes (17): Process Lifecycle, endpoint(), resolveBlueskyDid(), ParsedBlueskyThread, createSocialPostViewer(), failure(), initializeSocialPosts(), isAbort() (+9 more)

### Community 66 - "serve.ts"
Cohesion: 0.11
Nodes (13): item(), lists(), ORDER, row(), ENV_TEXT, REPO, SANDBOX, app (+5 more)

### Community 67 - "parsers.ts"
Cohesion: 0.11
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
Nodes (28): description, engines, node, typescript, main, name, type, version (+20 more)

### Community 72 - "Deployment"
Cohesion: 0.14
Nodes (17): At a Glance, Bot Image (`Dockerfile`), Deploy on the Pi, Deployment, Docker Build, Docker Compose, Image Tags, Jobs (+9 more)

### Community 73 - "File Upload Handling"
Cohesion: 0.17
Nodes (9): countedBody(), deleteFile(), FileResource, getFile(), sleep(), streamToFiles(), UploadedFile, videoDurationSec() (+1 more)

### Community 74 - "interactionCreate.metrics.test.ts"
Cohesion: 0.08
Nodes (17): outcomeForTurn, recordReplyOutcome(), ReplyOutcome, citationsForTurn, SearchCitation, NAME_MENTION_REGEX, metrics, mocks (+9 more)

### Community 75 - "searchWeb.ts"
Cohesion: 0.19
Nodes (10): recordSearchCitations(), SearchWebParams, BACKENDS, noBackend(), searchWeb(), mocks, OUTCOME, SearchProvider (+2 more)

### Community 76 - "roka Service"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 77 - "toolTrigger.ts"
Cohesion: 0.05
Nodes (58): Situation Block, getLocalHour(), emitTrialRecord(), formatTrialRecord(), TrialRecord, BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey() (+50 more)

### Community 78 - "getWeather.ts"
Cohesion: 0.15
Nodes (12): GeocodingResult, getWeather(), GetWeatherParams, GetWeatherResult, OpenMeteoWeather, weatherCodeToCondition(), WeatherFailure, WeatherReading (+4 more)

### Community 79 - "views.test.ts"
Cohesion: 0.28
Nodes (8): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), PREDICATE_PHRASES

### Community 80 - "watch.ts"
Cohesion: 0.11
Nodes (17): HalfWatch, mocks, CoveragePlan, elapsedSince(), getClient(), instructions(), mediaPart(), messageOf() (+9 more)

### Community 81 - "nativeAnthropic.ts"
Cohesion: 0.05
Nodes (57): callUsage(), SEARCH_EXCERPTS_UNTRUSTED_DATA_LABEL, runSearchTurn(), ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS, attemptForRequest, currentSearchAttempt() (+49 more)

### Community 82 - "Search Prefetch Reporting"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "models.ts"
Cohesion: 0.20
Nodes (13): PROVIDER_KEY_ENV, BuiltIn, DEFAULT_BASE_URLS, failure(), listed(), listRequest(), ModelPaths, ModelTest (+5 more)

### Community 84 - "messageContent.ts"
Cohesion: 0.10
Nodes (31): ImageAttachment, isSupportedMedia(), describeEmbed(), describeForwardedSnapshots(), describePoll(), embedMatchesSocialPost(), extractComponentMedia(), walk() (+23 more)

### Community 85 - "DiscordPreview.tsx"
Cohesion: 0.11
Nodes (31): Problem, lineForPath(), splitPath(), firstLine(), lineFor(), ProblemBanner(), ProblemBannerProps, screenName() (+23 more)

### Community 86 - "logger.ts"
Cohesion: 0.07
Nodes (38): Bot Management, Failure Diagnostics Table, cleanupExpired(), monitoredChannels, restoreMonitoredChannels(), waitForInFlightExtractions(), stopUpdateNotifier(), client (+30 more)

### Community 87 - "config.ts"
Cohesion: 0.04
Nodes (74): Configuration (AGENTS.md), Tech Stack (AGENTS.md), Secrets, Source Files, Source Files, At a Glance, Legacy Config, Model Profiles (+66 more)

### Community 88 - "Social Viewing Research"
Cohesion: 0.29
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "estimateTokens"
Cohesion: 0.07
Nodes (53): Architecture (AGENTS.md), gemini Config Section, rateLimit Config Section, session Config Section, FR-3: Per-Channel Conversational Memory, FR-4: Layered Personality Prompts, Message Pipeline, Prompt System (+45 more)

### Community 90 - "reportCommand.ts"
Cohesion: 0.25
Nodes (13): isAllowedDiscordCdnUrl(), AttachmentCopyError, copyAttachment(), handleReportCommand(), moduleDirectory, packageMetadata, projectDirectory, readLimitedBody() (+5 more)

### Community 91 - "extractionSchema.ts"
Cohesion: 0.05
Nodes (40): AddOperationSchema, calendarDateProperties, DATED_GUILD_PREDICATES, DatedGuildAddOperationSchema, DatedGuildPredicateId, datedGuildPredicates, DatedGuildPredicateSchema, DatedGuildUpdateOperationSchema (+32 more)

### Community 92 - "test-chat.ts"
Cohesion: 0.13
Nodes (19): ref_node_readline, args, handleInput(), htmlIndex, main(), previewMessages, username, main() (+11 more)

### Community 93 - "embeddings/client.ts"
Cohesion: 0.13
Nodes (22): EmbeddingClient, EmbeddingRole, EmbeddingSettings, FACTORIES, getEmbeddingClient(), resetEmbeddingClientForTest(), isEmbeddingVector(), createLocalEmbeddingClient() (+14 more)

### Community 94 - "memoryClaimSchema.ts"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 95 - "anthropicLlm.ts"
Cohesion: 0.05
Nodes (72): Block, classifyAnthropicError(), create(), Effort, ImageMediaType, markerBlock(), mediaBlock(), mergeTurns() (+64 more)

### Community 96 - "WAV File Validation"
Cohesion: 0.38
Nodes (5): read_wav(), WavError, make_wav(), ReadWavTest, ValueError

### Community 97 - "load.ts"
Cohesion: 0.05
Nodes (52): Character, deepFreeze(), escapeRegExp(), inHours(), loadCharacter(), expand(), prompt(), readYaml() (+44 more)

### Community 98 - "measure-native-search.ts"
Cohesion: 0.22
Nodes (12): describeUsage(), KEY_ENV, main(), MODEL, nativeRoute(), Options, parseOptions(), percentile() (+4 more)

### Community 99 - "ASR Sidecar Service"
Cohesion: 0.22
Nodes (8): API, ASR Sidecar, Build and Run, Configuration, `GET /health`, Models and Licences, `POST /transcribe?maxSpeechSec=120`, Tests

### Community 100 - "app.test.ts"
Cohesion: 0.13
Nodes (17): StudioOptions, ApiError, commentedConfig(), ENV_TEXT, FilesBody, json(), MODEL_ENV, modelStudio() (+9 more)

### Community 101 - "modelHedge.test.ts"
Cohesion: 0.20
Nodes (4): DeferredLlm, loggerMock, Outcome, responses()

### Community 102 - "timezone.ts"
Cohesion: 0.35
Nodes (9): loadGetLocalHour(), loadTimezoneModule(), unpinnedHour(), dateString(), dateTimeParts(), getLocalDate(), localDateStartEpoch(), localDateTimeFormatter() (+1 more)

### Community 103 - "Rokabot TRD"
Cohesion: 0.31
Nodes (9): Critical Do-Nots, Project (Rokabot description), Reference Docs (AGENTS.md), Rokabot PRD, Documentation (README index), GPT-6-Astra, Jev Rollout Plan, Second Opinion (+1 more)

### Community 104 - "duration.ts"
Cohesion: 0.33
Nodes (8): Box, movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0(), mvhdV1()

### Community 105 - "turnMedia.test.ts"
Cohesion: 0.20
Nodes (5): digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf()

### Community 107 - "media.ts"
Cohesion: 0.17
Nodes (15): Attachment Intake, Link Priority, Linked Files (`attachment_url`), Lookup Limits, Model Input, Post Media, Social Post Viewing, Supported Platforms (+7 more)

### Community 108 - "Rokabot Character Data"
Cohesion: 0.67
Nodes (3): Maniwa Roka, Rokabot, Senren*Banka

### Community 109 - "Speech Budget Management"
Cohesion: 0.42
Nodes (4): Keep time-ordered segments within the speech budget, spread across the clip.…, Segment, select_segments(), SelectSegmentsTest

### Community 110 - "markdown.ts"
Cohesion: 0.10
Nodes (27): blockQuote(), buildList(), codeBlock, EMOJI, emojiImage(), emphasis(), EMPHASIS_RULES, formatTimestamp() (+19 more)

### Community 111 - "redditFeed.ts"
Cohesion: 0.45
Nodes (11): decodeEntities(), entryAuthor(), entryContent(), feedEntries(), feedField(), htmlToText(), NAMED_ENTITIES, parseRedditFeedPost() (+3 more)

### Community 112 - "replyShape.ts"
Cohesion: 0.13
Nodes (26): Tunables, buildReplyShapePrompt(), chooseFaces(), chooseOpener(), chooseReplyShape(), chooseThreat(), Edge, Ending (+18 more)

### Community 116 - "messageEdge"
Cohesion: 0.20
Nodes (10): Evidence, Known Limits, Rerunning the Check, Results, Roka Voice v4: Looked-Up Turns and Saying No, Root Causes, Tunables, What Changed (+2 more)

### Community 117 - "promptSafety.ts"
Cohesion: 0.19
Nodes (17): Bounded Retrieval (Legacy), PAST_FACT_MARKER, buildFactsEnvelope(), buildOverheardBlock(), FACTS_UNTRUSTED_DATA_LABEL, isSafeFactKey(), isSafeFactScalar(), MAX_FACT_KEY_LEN (+9 more)

### Community 119 - "Write Path"
Cohesion: 0.20
Nodes (11): Admission, Capture, Claim Lifecycle and Retention, Extraction, Guild Facts and Dates, Retention Tiers, Scheduling and Retries, Verification (+3 more)

### Community 120 - "getCurrentTime.ts"
Cohesion: 0.22
Nodes (9): cityToTimezone, getCurrentTime(), GetCurrentTimeFound, GetCurrentTimeParams, GetCurrentTimeResult, GetCurrentTimeUnknown, resolveTimezone(), getCurrentTimeTool (+1 more)

### Community 121 - "emojiReactor.ts"
Cohesion: 0.14
Nodes (15): discord Config Section, emoji Config Section, games Config Section, logging Config Section, memory Config Section, metrics Config Section, Configuration (README), Privacy (+7 more)

### Community 122 - "closeDb"
Cohesion: 0.04
Nodes (57): Database File, fact(), openFixture(), seedGuild(), delay(), embedPendingFacts(), sweep(), renderFactSentence() (+49 more)

### Community 123 - "tokenBudget.handlers.test.ts"
Cohesion: 0.22
Nodes (7): attachmentOptionName(), createInteraction(), askWith(), client, createInteraction(), mocks, rateLimiter()

### Community 124 - "replyReader"
Cohesion: 0.23
Nodes (7): createReplyReader(), isAbort(), replyReader, ReplyLookup, FOUND, readerWith(), SETTINGS

### Community 125 - "transcribe.test.ts"
Cohesion: 0.08
Nodes (35): ref_node_child_process, EMPTY, extractFrame(), extractFrames(), frameBins(), frameCount(), FrameRunner, FrameSource (+27 more)

### Community 126 - "Speech Server Engines"
Cohesion: 0.33
Nodes (6): Engines, load_engines(), main(), SpeechServer, NamedTuple, ThreadingHTTPServer

### Community 127 - "Linting Configuration"
Cohesion: 0.67
Nodes (3): lint-staged, *.{json,md,yml,yaml}, *.{ts,js}

### Community 129 - "probe-llm-profile.ts"
Cohesion: 0.06
Nodes (49): 1. Character as a Folder Pack, 2. Static First, Dynamic After, Reply Shape Last, 3. Any OpenAI-Compatible Endpoint, 4. Files First, Dashboard Later, Character Formats, Character Harness Research 2026, Decisions for Rokabot, Evidence-Backed (+41 more)

### Community 130 - "test-gemini-ga-compare.ts"
Cohesion: 0.13
Nodes (16): ref_node_dns, ErrorRecoveryPlugin, main(), results, runQuery(), TestResult, wordCount(), CapturingErrorPlugin (+8 more)

### Community 131 - "Speech Transcription Processing"
Cohesion: 0.60
Nodes (5): decode(), detect_speech(), language_code(), transcribe(), ndarray

### Community 133 - "textEdit.ts"
Cohesion: 0.31
Nodes (17): Primitive, Flow, flowMap(), insertLine(), insertPair(), lineEnd(), lineStart(), pairOf() (+9 more)

### Community 134 - "displayName"
Cohesion: 0.25
Nodes (8): AssemblerInput, At a Glance, Data Models, Data Models and Storage, Outbound Model Request, Source Files, ToneKey, displayName()

### Community 135 - "linesGolden.test.ts"
Cohesion: 0.08
Nodes (44): Field Reference, lines.yml, Commands, Bug Reports, Persistence and Storage, Retention, Tables, RECITATION_DEFLECTION (+36 more)

### Community 136 - "CI/CD Deployment Pipeline"
Cohesion: 0.36
Nodes (9): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping), Deployment & Operations (+1 more)

### Community 137 - "ref_node_fs"
Cohesion: 0.12
Nodes (19): js-yaml, ref_node_fs, ref_node_os, ref_node_path, ref_node_util, ref_node_worker_threads, main(), MEMORY_MODES (+11 more)

### Community 138 - "discord/channelVisibility.ts"
Cohesion: 0.31
Nodes (4): ChannelVisibilityResolver, createChannelVisibilityResolver(), everyoneRole, resolverFor()

### Community 140 - "roka.ts"
Cohesion: 0.04
Nodes (73): Attachment Bytes Do Not Live in History, Gemini API, Roka Agent (ADK), Session Manager, SQLite Persistence Store, @google/adk, historyEndedOnToolResult(), escapeRegExp() (+65 more)

### Community 141 - "judgments.test.ts"
Cohesion: 0.25
Nodes (3): LOOKUP_QUESTION, TONE_CRITERIA, mocks

### Community 142 - "test-phase8.ts"
Cohesion: 0.11
Nodes (29): reminders Config Section, main(), assert(), fail(), main(), pass(), results, TestResult (+21 more)

### Community 143 - "UI TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals (+6 more)

### Community 144 - "System Architecture"
Cohesion: 0.12
Nodes (16): Architecture, At a Glance, Core Code Modules, Discord Events (Inbound), Durable State, Gateway Setup, Installation and Context Policy, InteractionCreate (`/ask`) (+8 more)

### Community 145 - "contentKey.ts"
Cohesion: 0.46
Nodes (6): bytesContentKey(), DISCORD_CDN_HOSTS, discordAttachmentContentKey(), postContentKey(), requireId(), youtubeContentKey()

### Community 146 - "agent/attachments.ts"
Cohesion: 0.07
Nodes (39): PDF Token Cost Measurement, Attachment Token Admission, At a Glance, Configuration, Download, Media, Token Admission, sharp (+31 more)

### Community 147 - "anthropicLlm.test.ts"
Cohesion: 0.11
Nodes (18): @anthropic-ai/sdk, STRUCTURED_OUTPUT_TOOL, ContentBlock, fixtures, usage(), answer(), budget, CreateOptions (+10 more)

### Community 148 - "yamlEdit.ts"
Cohesion: 0.23
Nodes (21): yaml, character, config, repo, voice, stringifyDoc(), addItem(), deleteNode() (+13 more)

### Community 149 - "render.ts"
Cohesion: 0.13
Nodes (35): escapeHtml(), renderPlainText(), asObject(), asObjects(), avatarUrl(), BUTTON_STYLES, emojiHtml(), fileDataUri() (+27 more)

### Community 150 - "Configuration"
Cohesion: 0.05
Nodes (41): At a Glance, Character, Configuration, `discord`, `embeddings`, `emoji`, `fallback`, `games` (+33 more)

### Community 151 - "persona-replay.ts"
Cohesion: 0.11
Nodes (28): ANTHROPIC_SEARCH, appendReplyShape(), Arm, claudeSettings(), GEMINI_CONFIG, GEMINI_SEARCH, loadArm(), LoadedArm (+20 more)

### Community 152 - "turnContext.ts"
Cohesion: 0.04
Nodes (69): Modes, Questions, Source Files, Turn Entry Work, Turn Events, Turn Judgments, Embeddings and Episodic Recall, At a Glance (+61 more)

### Community 153 - "privacy"
Cohesion: 0.11
Nodes (20): Capture and Prompt, `memory`, Recall, Retention, Memory, At a Glance, Browse Memory in Obsidian, Forgetting and Opting Out (+12 more)

### Community 154 - "app.ts"
Cohesion: 0.12
Nodes (36): ref_node_http, createApp(), route(), Handler, PREVIEW_FIELDS, previewQuery(), fail(), readJson() (+28 more)

### Community 155 - "buildNerd"
Cohesion: 0.29
Nodes (8): latencyE2e, p95ByDay, percentile(), retrySummary, tokenTotals, buildNerd(), formatDuration(), formatLatency()

### Community 156 - "Memory"
Cohesion: 0.18
Nodes (13): Deferred Items, Extraction Run Trace, Fact Reclassification, Hidden-Fact Reconciliation, Maintenance Commands, Media Memory, Memory, Memory Tools (+5 more)

### Community 157 - "updateNotifier.ts"
Cohesion: 0.15
Nodes (16): ref_node_url, cfg, LATEST, store, checkForUpdate(), fetchLatestRelease(), isNewerVersion(), LatestRelease (+8 more)

### Community 158 - "statsCommand.ts"
Cohesion: 0.43
Nodes (7): handleStatsCommand(), isStatsView(), logStatsError(), selectionFor(), sendStatsError(), STATS_VIEWS, StatsView

### Community 159 - "citations.ts"
Cohesion: 0.48
Nodes (5): clampToBudget(), fitCitations(), sourceHost(), sourceLabel(), THREE

### Community 161 - "recall-calibration.test.ts"
Cohesion: 0.12
Nodes (24): CandidateRow, Embed, chooseFloor(), cli(), cohensKappa(), currentFloorOf(), KindReport, Label (+16 more)

### Community 162 - "Characters"
Cohesion: 0.08
Nodes (28): A Pack Outside the Image, At a Glance, character.yml, Characters, Harness Prompts and Overrides, How the Bot Picks a Pack, Make a New Character, moods.yml (+20 more)

### Community 163 - "jev/client.ts"
Cohesion: 0.11
Nodes (25): jev Config Section, Deliberately Not Done, Jev Design (Per-Feature Modes), Jev Integration (Research Doc), Gemini-Outage Fallback (Qwen3.5), Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk (+17 more)

### Community 164 - "Product"
Cohesion: 0.17
Nodes (10): Accessibility & Inclusion, Anti-references, Brand Personality, Design Principles, Platform, Positioning, Product, Product Purpose (+2 more)

### Community 165 - "API and Security Tests"
Cohesion: 0.20
Nodes (10): API, Errors, Model Connection Test, Pack File Rules, Persona Studio, Security Model, Source Files, Start It (+2 more)

### Community 166 - "Models"
Cohesion: 0.17
Nodes (12): Any OpenAI-Compatible Model, At a Glance, Budgets and Limits, Capabilities Reference, Choose the Main and Fallback, Copy-Paste Entries, Fields for OpenAI-Compatible Entries, How the Fallback Behaves (+4 more)

### Community 167 - "Claims Memory Architecture"
Cohesion: 0.36
Nodes (8): Claim Lifecycle, Claims Memory Architecture, extraction_queue Table, memory_claim_fts Table, memory_claim Table, memory_events Table, memory_evidence Table, Vault Export

### Community 168 - "ref_node_crypto"
Cohesion: 0.15
Nodes (9): ref_node_crypto, ref_node_net, browserCommands(), Command, openBrowser(), app, port, shellEnv (+1 more)

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
Cohesion: 0.33
Nodes (5): AnimeResult, JikanAnimeEntry, JikanResponse, SearchAnimeParams, SearchAnimeResult

### Community 178 - "searchNativeGemini.test.ts"
Cohesion: 0.11
Nodes (11): @google/genai, ALLOWED_HARM_BLOCK_THRESHOLDS, buildSafetySettings(), SAFETY_SETTINGS, SUPPORTED_HARM_CATEGORIES, FLASH_LITE, GeminiClient, GenerateContent (+3 more)

### Community 179 - "Features"
Cohesion: 0.20
Nodes (10): At a Glance, Features, Games and Gacha, Reactions, Status Rotation and Update Notices, Reminders, Seeing and Watching, Source Files, Stats (+2 more)

### Community 180 - "Embedding Service Docs"
Cohesion: 0.20
Nodes (9): API, Build and Run, Configuration, Embedding Sidecar, `GET /health`, Model and Licences, `POST /embed`, Smoke Test (+1 more)

### Community 181 - "Getting Started"
Cohesion: 0.50
Nodes (3): Getting Started, npm run test:live Gate, TRIAL_PACING_MS

### Community 182 - "react"
Cohesion: 0.09
Nodes (32): react, NoticeRow(), NotificationCenter(), THEMES, ThemeSwitch(), ToastCard(), Toaster(), TONE_ICON (+24 more)

### Community 183 - "models.spec.ts"
Cohesion: 0.29
Nodes (3): WindowMessage, role(), roleSelect()

### Community 186 - "yamlText.ts"
Cohesion: 0.50
Nodes (12): appendEntry(), expectAfter(), lineEnd(), lineStart(), readIn(), removeKey(), removeListItem(), same() (+4 more)

### Community 187 - "Speech Pattern Documentation"
Cohesion: 0.25
Nodes (7): Dialogue Style, Example Lines, Example Replies With Structure, Expressions, Formatting Your Reply, Speech Patterns, Verbal Style

### Community 188 - "Persona Identity Definition"
Cohesion: 0.25
Nodes (7): Identity & Appearance, Insecurities, People You Know, Personality, Romantic Side, Who You Are, Your World

### Community 189 - "Embedding Smoke Tests"
Cohesion: 0.25
Nodes (5): ref_node_assert, EmbedReply, golden, goldenPath, record

### Community 191 - "markdownGuard.ts"
Cohesion: 0.50
Nodes (6): eachOutside(), guardMarkdown(), guardProse(), guardText(), isFace(), KAOMOJI

### Community 193 - "Changelog"
Cohesion: 0.20
Nodes (9): [0.2.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.1.0...v0.2.0) (2026-10-16), [0.3.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.2.0...v0.3.0) (2026-10-16), [0.4.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.3.0...v0.4.0) (2026-10-17), Bug Fixes, Bug Fixes, Changelog, Features, Features (+1 more)

### Community 194 - "Character Packs"
Cohesion: 0.25
Nodes (7): Character Packs, Layout, Locked Prompts, Macros, Making a New Character, Prompt Files, Search Prompts

### Community 195 - "MarkdownContext"
Cohesion: 0.67
Nodes (3): MarkdownContext, PreviewPageOptions, RenderContext

### Community 197 - "Audio Video Documentation"
Cohesion: 0.50
Nodes (3): Audio and Video, When You Couldn't Watch It, When You've Watched Something

### Community 198 - "Release Configuration"
Cohesion: 0.50
Nodes (3): bootstrap-sha, packages, $schema

### Community 221 - "Prompts.tsx"
Cohesion: 0.13
Nodes (31): estimateTokens(), TextEditor, TextEditorHandle, TextEditorProps, Columns(), EntryNote(), EntryNoteProps, characterPath() (+23 more)

### Community 223 - "fixtures.ts"
Cohesion: 0.07
Nodes (20): @axe-core/playwright, @playwright/test, PAGES, at(), field(), studio_ui_e2e_fixtures_expect, Studio, test (+12 more)

### Community 225 - "measure.ts"
Cohesion: 0.35
Nodes (9): Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION, mimeForPath(), resolveKey(), TokenLimits (+1 more)

### Community 228 - "replyBlocks.ts"
Cohesion: 0.38
Nodes (8): blockCount(), BlockKind, capReplyBlocks(), countReplyBlocks(), MAX_REPLY_BLOCKS, parse(), Piece, splitAtDividers()

### Community 229 - "UI Styling Assets"
Cohesion: 0.33
Nodes (5): @fontsource-variable/geist, @fontsource-variable/geist-mono, react-dom, root, studio_ui_src_styles

### Community 232 - "readReplies.ts"
Cohesion: 0.16
Nodes (16): SOCIAL_POST_UNTRUSTED_DATA_LABEL, SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL, readRepliesTool, MAX_REQUESTED_REPLIES, readReplies(), ReadRepliesParams, FOUND, author() (+8 more)

### Community 233 - "Media Watching"
Cohesion: 0.20
Nodes (10): Accounting, Digest and Turn Input, Footer, Media Watching, Qwen Watcher, Remembered Media, Speech Sidecar, Transport (+2 more)

### Community 235 - "reports.ts"
Cohesion: 0.43
Nodes (6): main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne()

## Ambiguous Edges - Review These
- `Second Opinion` → `Rokabot TRD`  [AMBIGUOUS]
  docs/research/jev-integration.md · relation: conceptually_related_to

## Knowledge Gaps
- **1549 isolated node(s):** `$schema`, `indentStyle`, `indentWidth`, `lineWidth`, `enabled` (+1544 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2026 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **47 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Second Opinion` and `Rokabot TRD`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `vitest` connect `vitest` to `byteBudget.ts`, `jevReplay.ts`, `qwenWatch.ts`, `database.ts`, `buddy.ts`, `messageBuilder.ts`, `getDb`, `test-features.ts`, `scheduler.ts`, `searchNativeAnthropic.test.ts`, `queries.ts`, `messageCreate.ts`, `reminder.ts`, `episodeTracker.ts`, `WindowedSessionService`, `memoryShadow.ts`, `verification.test.ts`, `config`, `run.ts`, `RateLimiter`, `turnMedia.ts`, `recall-calibration-sample.ts`, `gameCommands.ts`, `youtubeStreams.ts`, `profiles.ts`, `memoryEpisodeReplay.ts`, `getAnimeSchedule.ts`, `usage.ts`, `discord/attachments.ts`, `reliability.ts`, `generateObject.ts`, `discord.js`, `charts.ts`, `Inline Data Contract`, `handler.ts`, `extractionSchema.test.ts`, `budget.ts`, `schedule.test.ts`, `reportStore.ts`, `extractor.ts`, `digest.ts`, `socialPosts/service.ts`, `parsers.ts`, `Prefetch Measurement Tools`, `package.json`, `File Upload Handling`, `interactionCreate.metrics.test.ts`, `searchWeb.ts`, `toolTrigger.ts`, `getWeather.ts`, `views.test.ts`, `watch.ts`, `nativeAnthropic.ts`, `Search Prefetch Reporting`, `messageContent.ts`, `logger.ts`, `config.ts`, `estimateTokens`, `embeddings/client.ts`, `anthropicLlm.ts`, `load.ts`, `app.test.ts`, `modelHedge.test.ts`, `timezone.ts`, `duration.ts`, `turnMedia.test.ts`, `replyShape.ts`, `promptSafety.ts`, `getCurrentTime.ts`, `emojiReactor.ts`, `closeDb`, `tokenBudget.handlers.test.ts`, `replyReader`, `transcribe.test.ts`, `probe-llm-profile.ts`, `linesGolden.test.ts`, `ref_node_fs`, `discord/channelVisibility.ts`, `roka.ts`, `judgments.test.ts`, `test-phase8.ts`, `contentKey.ts`, `agent/attachments.ts`, `anthropicLlm.test.ts`, `yamlEdit.ts`, `persona-replay.ts`, `turnContext.ts`, `updateNotifier.ts`, `citations.ts`, `recall-calibration.test.ts`, `jev/client.ts`, `ref_node_crypto`, `guildFactDates.test.ts`, `persona-report.ts`, `reportCommand.test.ts`, `searchNativeGemini.test.ts`, `Getting Started`, `diagnoseKey.test.ts`, `markdownGuard.ts`, `measure.ts`, `replyBlocks.ts`, `readReplies.ts`?**
  _High betweenness centrality (0.228) - this node is a cross-community bridge._
- **Why does `config` connect `config` to `byteBudget.ts`, `test-gemini-ga-compare.ts`, `database.ts`, `buddy.ts`, `getDb`, `linesGolden.test.ts`, `scheduler.ts`, `searchNativeAnthropic.test.ts`, `test-features.ts`, `roka.ts`, `messageCreate.ts`, `reminder.ts`, `tools/index.ts`, `test-phase8.ts`, `replies/service.ts`, `agent/attachments.ts`, `episodeTracker.ts`, `guildFactDates.ts`, `memoryShadow.ts`, `turnContext.ts`, `run.ts`, `updateNotifier.ts`, `turnMedia.ts`, `recall-calibration.test.ts`, `recall-calibration-sample.ts`, `jev/client.ts`, `youtubeStreams.ts`, `gameCommands.ts`, `getAnimeSchedule.ts`, `usage.ts`, `reliability.ts`, `generateObject.ts`, `searchNativeGemini.test.ts`, `obsidianExport.ts`, `budget.ts`, `extractor.ts`, `Multimodal Intake Research`, `socialPosts/service.ts`, `File Upload Handling`, `interactionCreate.metrics.test.ts`, `searchWeb.ts`, `toolTrigger.ts`, `getWeather.ts`, `watch.ts`, `nativeAnthropic.ts`, `logger.ts`, `config.ts`, `reportCommand.ts`, `embeddings/client.ts`, `timezone.ts`, `readReplies.ts`, `media.ts`, `getCurrentTime.ts`, `emojiReactor.ts`, `closeDb`, `tokenBudget.handlers.test.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `YamlForm.tsx`, `UI Styling Assets`, `package.json`, `configShared.tsx`, `parts.tsx`, `DiscordPreview.tsx`, `workspace.ts`, `Moods.tsx`, `Secrets.tsx`, `Prompts.tsx`, `PackFileScreen.tsx`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **What connects `$schema`, `indentStyle`, `indentWidth` to the rest of the system?**
  _1549 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `byteBudget.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13054187192118227 - nodes in this community are weakly interconnected._
- **Should `jevReplay.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._