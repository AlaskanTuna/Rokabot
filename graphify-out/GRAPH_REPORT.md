# Graph Report - graph  (2026-10-08)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2906 nodes · 8425 edges · 122 communities (115 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 263 edges (avg confidence: 0.88)
- Token cost: 6,270 input · 1,325 output

## Graph Freshness
- Built from commit: `04e0ee9d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Gacha/Buddy Game Logic
- Jev Replay/Evaluation
- Qwen Model Watching
- Discord Command Handling
- Code Formatting Config
- Analytics/Metrics Dashboard
- Response Formatting/Budgeting
- Memory Claims Management
- Hangman Game Logic
- Memory Persistence/Scheduler
- Embedding/Fact Management
- Activity Querying/Stats
- Discord Test Mocks
- Interaction/Reply Handling
- Project Documentation
- Tool/Utility Registry
- Memory Migration/Diagnostics
- Social Reply Fetching
- Fact Date Verification
- Episode Tracking/Timers
- Development Dependencies
- Session/Attachment Management
- Session/Trial Recording
- Identity/Privacy Resolver
- Response Steering/Testing
- Memory Predicate Logic
- Transcript Processing/Reporting
- Production Dependencies
- Episode Maintenance/Vectoring
- Rate Limiting/Gateway
- Prompt Safety/Validation
- TypeScript Configuration
- Media Streaming/Planning
- Reminder/Test Scheduler
- Project Build Scripts
- Memory Recall/Ranking
- Memory Replay/Metrics
- YouTube Stream Parsing
- Fact Extraction Logic
- Project Requirements/Docs
- Anime Schedule Lookup
- Attachment Token Measurement
- Model Fallback Logic
- Byte/Attachment Budgeting
- Model Routing/Fallback
- Attachment Type Handling
- Gemini Reliability/Backoff
- Tool Trigger Testing
- Identity Resolution/Rollout
- Activity Chart Rendering
- Server Lifecycle/Shutdown
- LLM Content Generation
- TypeScript Test Config
- Reply Reading Tools
- Game Command Handlers
- Channel Extraction Monitoring
- Obsidian Memory Export
- Model Routing/Hedging
- Time/Weather Tools
- Web Search Integration
- Token Budget Management
- Jev System Configuration
- Media Digest/Formatting
- Docker/Deployment Optimization
- Attachment Limit Definitions
- Bluesky Thread Viewer
- Test Harness Components
- Bluesky Data Parsing
- Quota/Capacity Diagnostics
- Social Post Parsing
- Prefetch Measurement/Analysis
- Project Metadata/Config
- Gemini ADK Testing
- File Upload Handling
- Reply Outcome/Citations
- Payload/Embed Rendering
- Docker Compose Config
- ADK Interaction Testing
- Token Measurement/Limits
- View/Chart Testing
- GenAI Video/Audio Watch
- Search Citation Logic
- Search Prefetch Shadowing
- Episode Admission Logic
- Message Content Extraction
- Agent Error/Retry Logic
- Capture Sink/Benchmarking
- Environment Configuration
- Social Media Research
- System Prompt Architecture
- Video Selection Logic
- Fact Extraction Schema
- Media Validation Logic
- Content Key Generation
- Memory Claim Schema
- Channel Messaging Utilities
- Expression Tone Mapping
- Turn Context Testing
- Interaction Reply Handling
- Episode Recall/Visibility
- Claims Memory Architecture
- Media Duration Parsing
- Media Turn Testing
- Code Style Enforcement
- Buddy Collection Management
- Roka Character Data
- Error/Stats Handling
- Reddit Feed Parsing
- Documentation Standards
- Git Commit Standards
- Coding Best Practices
- Social Post Formatting
- Global Configuration Sections
- Tool Context Management
- Social Reply Reading
- Sprite/Image Optimization
- Linting Configuration
- Environment Configuration
- Anime Search Integration
- Turn Context/Prefetching
- Deployment/CI/CD Workflow
- Report Generation CLI

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 203 edges
2. `vitest` - 162 edges
3. `config` - 93 edges
4. `logger` - 60 edges
5. `createMessageHandler()` - 51 edges
6. `createInteractionHandler()` - 46 edges
7. `generateResponse()` - 44 edges
8. `discord.js` - 43 edges
9. `createTurnContext()` - 35 edges
10. `closeDb()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Attachment Bytes Do Not Live in History` --conceptually_related_to--> `generateResponse()`  [INFERRED]
  docs/trd.md → src/agent/roka.ts
- `Jev Turn Judgment` --implements--> `TurnJudgment`  [INFERRED]
  docs/trd.md → src/agent/jev/judgments.ts
- `WindowMessage` --implements--> `WindowMessage`  [INFERRED]
  docs/trd.md → src/session/types.ts
- `Data Volume Mount` --conceptually_related_to--> `resolveDbPath()`  [INFERRED]
  docker-compose.yml → src/storage/database.ts
- `Bounded Retrieval Contract` --implements--> `retrieveForTurn()`  [INFERRED]
  docs/trd.md → src/agent/memory/retriever.ts

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

## Communities (122 total, 7 thin omitted)

### Community 0 - "Gacha/Buddy Game Logic"
Cohesion: 0.09
Nodes (55): SQLite Database Reference, handleGachaMention(), statBar(), formatBuddySummary(), formatHatchTimeRemaining(), handleBuddyLeaderboard(), handleBuddyStats(), handleBuddyView() (+47 more)

### Community 1 - "Jev Replay/Evaluation"
Cohesion: 0.12
Nodes (26): ref_node_url, parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, agreement(), buildConfusionMatrix(), buildProbabilityBins() (+18 more)

### Community 2 - "Qwen Model Watching"
Cohesion: 0.12
Nodes (16): ChatCompletion, ContentPart, promptFor(), quoted(), QwenFrame, QwenWatchInput, QwenWatchResult, QwenWatchSettings (+8 more)

### Community 3 - "Discord Command Handling"
Cohesion: 0.06
Nodes (50): FR-1: Slash Command Interaction, Features, discord.js, ref_discordjs_builders, ChannelVisibilityResolver, createChannelVisibilityResolver(), askCommand, command (+42 more)

### Community 4 - "Code Formatting Config"
Cohesion: 0.05
Nodes (37): useLiteralKeys, files, ignore, formatter, enabled, indentStyle, indentWidth, lineWidth (+29 more)

### Community 5 - "Analytics/Metrics Dashboard"
Cohesion: 0.11
Nodes (37): activeClaimCount(), latencyE2e, memoryGrowthSeries(), newClaimsThisMonth(), p95ByDay, percentile(), retrySummary, tokenTotals (+29 more)

### Community 6 - "Response Formatting/Budgeting"
Cohesion: 0.09
Nodes (29): FR-8: Response Formatting, Streaming Size Guard, ReplyOutcome, clampToBudget(), fitCitations(), sourceHost(), buildRokaMessage(), buildToolFooter() (+21 more)

### Community 7 - "Memory Claims Management"
Cohesion: 0.07
Nodes (63): Claims Tenancy Model, evicted, episodePrompt(), formatEpisodeLine(), operationSafe(), recallableHere(), verifyAndApplyOperations(), activateClaim() (+55 more)

### Community 8 - "Hangman Game Logic"
Cohesion: 0.18
Nodes (23): buildHangmanBody(), handleHangmanGuess(), handleHangmanStart(), HANGMAN_COLORS, saveHangmanScore(), src_games_data_hangmanwords, src_games_data_hangmanwords_hangman_words, activeGames (+15 more)

### Community 9 - "Memory Persistence/Scheduler"
Cohesion: 0.12
Nodes (24): Memory, better-sqlite3, persistEpisodeResult(), EpisodeRunResult, drainOnce(), finishJob(), inFlightGuilds, inFlightTasks (+16 more)

### Community 10 - "Embedding/Fact Management"
Cohesion: 0.11
Nodes (20): response(), embedEpisodeText(), EpisodeEmbeddingRole, getEmbeddingClient(), resetEpisodeEmbeddingClientForTest(), delay(), embedPendingFacts(), sweep() (+12 more)

### Community 11 - "Activity Querying/Stats"
Cohesion: 0.08
Nodes (35): activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome, CountByPredicate (+27 more)

### Community 12 - "Discord Test Mocks"
Cohesion: 0.05
Nodes (38): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+30 more)

### Community 13 - "Interaction/Reply Handling"
Cohesion: 0.13
Nodes (37): Concurrency Binding Constraint, isMonitored(), markActive(), text(), asksAboutReplies(), withSearchCitations(), startTurnEntryWork(), activeRequests (+29 more)

### Community 14 - "Project Documentation"
Cohesion: 0.36
Nodes (8): Critical Do-Nots, Project (Rokabot description), Reference Docs (AGENTS.md), Rokabot PRD, Documentation (README index), Jev Integration (Research Doc), Multimodal Research Doc, Rokabot TRD

### Community 15 - "Tool/Utility Registry"
Cohesion: 0.13
Nodes (24): Tool Footer, flipCoin(), FlipCoinResult, cancelReminderTool, flipCoinTool, getAnimeScheduleTool, getCurrentTimeTool, listRemindersTool (+16 more)

### Community 16 - "Memory Migration/Diagnostics"
Cohesion: 0.08
Nodes (42): Failure Diagnostics Table, attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow (+34 more)

### Community 17 - "Social Reply Fetching"
Cohesion: 0.21
Nodes (28): resolveBlueskyDid(), array(), nonNegativeInteger(), bilibiliAid(), fetchBilibiliReplies(), fetchBlueskyReplies(), BROWSER_USER_AGENT, compactReplyText() (+20 more)

### Community 18 - "Fact Date Verification"
Cohesion: 0.15
Nodes (26): planVerification(), addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth() (+18 more)

### Community 19 - "Episode Tracking/Timers"
Cohesion: 0.15
Nodes (20): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), resetEpisodeTrackerForTest(), scheduleLull() (+12 more)

### Community 20 - "Development Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, husky, lint-staged, pino-pretty, prettier (+5 more)

### Community 21 - "Session/Attachment Management"
Cohesion: 0.10
Nodes (14): attachmentMarker(), abortActiveTurns(), clearSessionErrorCount(), ensureSession(), idleTimers, incrementSessionErrorCount(), isStrippable(), rehydrationSuppressed (+6 more)

### Community 22 - "Session/Trial Recording"
Cohesion: 0.10
Nodes (25): APP_NAME, sessionService, emitTrialRecord(), formatTrialRecord(), TrialRecord, record, cases, header (+17 more)

### Community 23 - "Identity/Privacy Resolver"
Cohesion: 0.08
Nodes (23): ref_node_perf_hooks, addNickname(), addUser(), here, other, upsertUserName(), asClaim(), asScenario() (+15 more)

### Community 24 - "Response Steering/Testing"
Cohesion: 0.15
Nodes (17): generateResponse(), __setTestRunTurnFactory(), steeringForRequest, TestRunTurn, destroySession(), resetIdleTimer(), droppedFor(), inlineFor() (+9 more)

### Community 25 - "Memory Predicate Logic"
Cohesion: 0.07
Nodes (42): ClaimSource, touchRecalled(), baseSalienceOf(), cardinalityOf(), GUILD_PREDICATES, GuildPredicateId, MemoryPredicateId, predicate() (+34 more)

### Community 26 - "Transcript Processing/Reporting"
Cohesion: 0.17
Nodes (21): fixturePath(), loadTranscript(), main(), parseTranscriptLine(), renderTokenTable(), requestMessageContent(), runTranscript(), RunTranscriptOptions (+13 more)

### Community 27 - "Production Dependencies"
Cohesion: 0.15
Nodes (13): dependencies, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml, @napi-rs/canvas (+5 more)

### Community 28 - "Episode Maintenance/Vectoring"
Cohesion: 0.09
Nodes (44): recordShare(), remember(), EpisodeMaintenanceReport, pruneEpisodesAndReembed(), configMock, mocks, now, seedEpisode() (+36 more)

### Community 29 - "Rate Limiting/Gateway"
Cohesion: 0.09
Nodes (18): FR-6: Rate Limiting, Discord Install Requirements: bot Scope Is Load-Bearing, Guild Permissions Are Derived From the API Surface, There Is No Build-Time Pin, and That Is Deliberate, Discord Gateway Layer, RateLimiterConfig, RPM-Budget Accounting, A Turn Reserves the Calls It May Make (+10 more)

### Community 30 - "Prompt Safety/Validation"
Cohesion: 0.06
Nodes (46): ref_node_readline, handleInput(), main(), username, buildFactsEnvelope(), buildOverheardBlock(), FACTS_UNTRUSTED_DATA_LABEL, isSafeFactScalar() (+38 more)

### Community 31 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "Media Streaming/Planning"
Cohesion: 0.12
Nodes (35): isStreamedUpload(), watchOutcomeFor(), equalBins(), estimateMediaTokens(), focusWindow(), FPS_LADDER, HalfWatch, HALVES_MAX_DURATION_SEC (+27 more)

### Community 33 - "Reminder/Test Scheduler"
Cohesion: 0.12
Nodes (34): reminders Config Section, assert(), fail(), main(), makeMessage(), pass(), results, TestResult (+26 more)

### Community 34 - "Project Build Scripts"
Cohesion: 0.07
Nodes (28): scripts, build, dev, dev:quiet, export:vault, format, format:check, harness (+20 more)

### Community 35 - "Memory Recall/Ranking"
Cohesion: 0.11
Nodes (36): cosineSimilarity(), byScore(), cooldownPenalty(), coreRank(), countKind(), Ctx, factBoost(), FactClaim (+28 more)

### Community 36 - "Memory Replay/Metrics"
Cohesion: 0.10
Nodes (28): argumentsFrom(), estimatedTokens(), inputText(), liveAdapters(), measure(), loadTranscriptLines(), main(), offlineAdapters() (+20 more)

### Community 37 - "YouTube Stream Parsing"
Cohesion: 0.19
Nodes (19): metadata, realisticFormats, AudioFormat, audioFormats(), directHttpsUrl(), finiteNumber(), hasCodec(), headersOf() (+11 more)

### Community 38 - "Fact Extraction Logic"
Cohesion: 0.13
Nodes (17): EXTRACTION_RESPONSE_SCHEMA, ExtractionOp, parseExtractionOutput(), episodeObservedAt(), EpisodeWriteOp, extractEpisode(), getClient(), GuildWriteOperation (+9 more)

### Community 39 - "Project Requirements/Docs"
Cohesion: 0.12
Nodes (22): FR-10: Graceful Shutdown, FR-2: Mention/Reply Interaction, FR-3: Per-Channel Conversational Memory, FR-5: Tone Detection, Functional Requirements, Problem Statement, Product Requirements Document, Project Objectives (+14 more)

### Community 40 - "Anime Schedule Lookup"
Cohesion: 0.20
Nodes (19): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleParams, GetAnimeScheduleResult, getCurrentSeason() (+11 more)

### Community 41 - "Attachment Token Measurement"
Cohesion: 0.15
Nodes (19): PDF Token Cost Measurement, Attachment Token Admission, measureAttachmentTokens(), needsMeasuring(), GEMINI_IMAGE_TOKENS, geminiMimeType(), downloadAttachment(), prepareAttachments() (+11 more)

### Community 42 - "Model Fallback Logic"
Cohesion: 0.11
Nodes (25): fallback Config Section, ModelScope Qwen Fallback, Tech Stack (README), ref_node_async_hooks, AnswerModel, attachmentKind(), attachmentMarker(), ChatMessage (+17 more)

### Community 43 - "Byte/Attachment Budgeting"
Cohesion: 0.19
Nodes (13): FR-7: Error Handling, Global In-Flight Byte Budget, Silent SIGKILL Risk, Global In-Flight Attachment Budget, MAX_ATTACHMENTS, inFlightBytes(), release(), reservationFor() (+5 more)

### Community 44 - "Model Routing/Fallback"
Cohesion: 0.12
Nodes (11): Deliberately Not Done, Gemini-Outage Fallback (Qwen3.5), The Fallback Model, createRokaModel(), ModelScopeLlm, RoutedLlm, adapter(), configState (+3 more)

### Community 45 - "Attachment Type Handling"
Cohesion: 0.16
Nodes (23): attachment_url, Handing Her a File, ALLOWED_IMAGE_TYPES Consolidation, Audio Intake Recommendation, PDF Intake Recommendation, Video Low Resolution Recommendation, Attachment Types and Their Ceilings, GEMINI_SPELLINGS (+15 more)

### Community 46 - "Gemini Reliability/Backoff"
Cohesion: 0.06
Nodes (47): @google/adk, modelRouteForRequest, BackoffOptions, classifyGeminiFailure(), classifyMarker(), computeBackoff(), DEFAULT_MAX_BACKOFF_MS, extractGeminiStatus() (+39 more)

### Community 47 - "Tool Trigger Testing"
Cohesion: 0.09
Nodes (31): isKnownPredicate(), CASE_SETS, fixturePath, header, rememberFixturePath, searchWebFixturePath, temporaryDirectories, testCase (+23 more)

### Community 48 - "Identity Resolution/Rollout"
Cohesion: 0.10
Nodes (26): GPT-6-Astra, Jev Rollout Plan, Second Opinion, Who-Is-Who Resolver, Bounded Retrieval Contract, buildNameIndex(), escapeRegex(), isAscii() (+18 more)

### Community 49 - "Activity Chart Rendering"
Cohesion: 0.26
Nodes (14): @napi-rs/canvas, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+6 more)

### Community 50 - "Server Lifecycle/Shutdown"
Cohesion: 0.20
Nodes (15): ref_node_http, waitForInFlightExtractions(), destroyAllSessions(), beginShutdown(), stopReminderScheduler(), stopStatusCycler(), destroyAllGames(), client (+7 more)

### Community 51 - "LLM Content Generation"
Cohesion: 0.29
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 52 - "TypeScript Test Config"
Cohesion: 0.22
Nodes (8): ./tsconfig.json, compilerOptions, noEmit, rootDir, types, exclude, extends, include

### Community 53 - "Reply Reading Tools"
Cohesion: 0.22
Nodes (10): SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL, readRepliesTool, rokaTools, readReplies(), ReadRepliesParams, FOUND, PLATFORM_NAMES, defang() (+2 more)

### Community 54 - "Game Command Handlers"
Cohesion: 0.12
Nodes (39): ref_node_module, createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleHangmanGuide(), handleLeaderboard(), buildGameContainer(), buildTimeoutContainer() (+31 more)

### Community 55 - "Channel Extraction Monitoring"
Cohesion: 0.12
Nodes (17): cleanupExpired(), monitoredChannels, resetMonitor(), restoreMonitoredChannels(), resetForTest(), stopExtractionScheduler(), configMock, enqueue() (+9 more)

### Community 56 - "Obsidian Memory Export"
Cohesion: 0.16
Nodes (17): Browsing Memory in Obsidian, GuildMemoryClaim, UserMemoryClaim, ActiveClaimSubject, ActiveGuildSubject, ExportedClaim, ExportedGuildClaim, exportVault() (+9 more)

### Community 57 - "Model Routing/Hedging"
Cohesion: 0.18
Nodes (5): ModelRoute, DeferredLlm, loggerMock, Outcome, responses()

### Community 58 - "Time/Weather Tools"
Cohesion: 0.15
Nodes (14): cityToTimezone, getCurrentTime(), GetCurrentTimeParams, GetCurrentTimeResult, resolveTimezone(), emptyResult(), GeocodingResult, getWeather() (+6 more)

### Community 59 - "Web Search Integration"
Cohesion: 0.24
Nodes (6): Where Rokabot Decides Today, recordSearchCitations(), searchWeb(), SearchWebParams, TavilyResponse, TavilyResult

### Community 60 - "Token Budget Management"
Cohesion: 0.19
Nodes (12): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, canAffordAttachments(), chargeTokens(), drain(), lastDrain, remainingTokensThisMinute(), __resetTokenBudgetForTest() (+4 more)

### Community 61 - "Jev System Configuration"
Cohesion: 0.10
Nodes (31): jev Config Section, Jev Design (Per-Feature Modes), Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk, Jev Shadow Mode, Jev Judgments, Jev Memory Admission (+23 more)

### Community 62 - "Media Digest/Formatting"
Cohesion: 0.15
Nodes (25): boundedString(), coverageLine(), cutAtWord(), formatClock(), frameInterval(), framesLine(), HEARD_LINES, isRecord() (+17 more)

### Community 63 - "Docker/Deployment Optimization"
Cohesion: 0.19
Nodes (12): FR-9: Docker Deployment, Byte Cap as Duration Proxy, Container Memory Cap Correction, Flash-Lite Modality Verification, Inline Data vs Files API Decision, Multimodal Intake Research, Recommended Attachment Caps, 4.7x RSS Attachment Multiplier (+4 more)

### Community 64 - "Attachment Limit Definitions"
Cohesion: 0.23
Nodes (6): RFC-3003, MAX_AUDIO_SIZE_BYTES, MAX_DOCUMENT_SIZE_BYTES, MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES, UploadLike

### Community 65 - "Bluesky Thread Viewer"
Cohesion: 0.08
Nodes (24): ref_node_fs, ref_node_os, ParsedBlueskyThread, createSocialPostViewer(), failure(), initializeSocialPosts(), isAbort(), isYtDlpPlatform() (+16 more)

### Community 66 - "Test Harness Components"
Cohesion: 0.24
Nodes (9): FakeComponent, HarnessCollection, has(), makeAttachments(), makeComponent(), makeMessage(), makePoll(), makeSnapshots() (+1 more)

### Community 67 - "Bluesky Data Parsing"
Cohesion: 0.15
Nodes (33): base(), BlueskyBlob, blueskyQuote(), capped(), compact(), date(), finiteNumber(), headers() (+25 more)

### Community 68 - "Quota/Capacity Diagnostics"
Cohesion: 0.20
Nodes (12): BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey(), DIAGNOSTIC_TIMEOUT_MS, errorText(), KEY_IS_LIVE, OUTPACING_THE_CAP, SPENT_FOR_THE_DAY (+4 more)

### Community 69 - "Social Post Parsing"
Cohesion: 0.12
Nodes (29): vitest, ReplyFetchContext, hostMatches(), HOSTS, parseSocialPostUrl(), platformForHost(), target(), youtubeStartSec() (+21 more)

### Community 70 - "Prefetch Measurement/Analysis"
Cohesion: 0.21
Nodes (9): main(), MeasurementAnomaly, Options, parseOptions(), percentile(), PrefetchMeasurementCase, PrefetchMeasurementSummary, PrefetchMeasurementTrial (+1 more)

### Community 71 - "Project Metadata/Config"
Cohesion: 0.09
Nodes (22): description, engines, node, main, name, type, version, @biomejs/biome (+14 more)

### Community 72 - "Gemini ADK Testing"
Cohesion: 0.13
Nodes (18): ref_node_dns, ref_node_net, ErrorRecoveryPlugin, main(), results, runQuery(), test(), TestResult (+10 more)

### Community 73 - "File Upload Handling"
Cohesion: 0.17
Nodes (9): countedBody(), deleteFile(), FileResource, getFile(), sleep(), streamToFiles(), UploadedFile, videoDurationSec() (+1 more)

### Community 74 - "Reply Outcome/Citations"
Cohesion: 0.07
Nodes (21): outcomeForTurn, recordReplyOutcome(), withReplyOutcomes(), citationsForTurn, SearchCitation, attachmentOptionName(), NAME_MENTION_REGEX, createInteraction() (+13 more)

### Community 75 - "Payload/Embed Rendering"
Cohesion: 0.36
Nodes (12): asObject(), asObjects(), chunkLabel(), componentDetails(), walk(), isComponentsV2Payload(), PayloadObject, renderEmbeds() (+4 more)

### Community 76 - "Docker Compose Config"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 77 - "ADK Interaction Testing"
Cohesion: 0.29
Nodes (5): MEMORY_TOOL_NAMES, CapturingRunner, makeInteraction(), mocks, turn()

### Community 78 - "Token Measurement/Limits"
Cohesion: 0.21
Nodes (13): Getting Started, npm run test:live Gate, sizeLimitFor(), Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION (+5 more)

### Community 79 - "View/Chart Testing"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "GenAI Video/Audio Watch"
Cohesion: 0.10
Nodes (20): @google/genai, mocks, countUriTokens(), elapsedSince(), getClient(), instructions(), mediaPart(), messageOf() (+12 more)

### Community 81 - "Search Citation Logic"
Cohesion: 0.29
Nodes (4): runSearchTurn(), ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS

### Community 82 - "Search Prefetch Shadowing"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "Episode Admission Logic"
Cohesion: 0.18
Nodes (11): AdmissionResult, admitEpisode(), isTrivial(), normalize(), precheckEpisode(), SENSITIVE_PATTERNS, mocks, getJevEventStatement() (+3 more)

### Community 84 - "Message Content Extraction"
Cohesion: 0.10
Nodes (32): ImageAttachment, isSupportedMedia(), describeEmbed(), describeForwardedSnapshots(), describePoll(), embedMatchesSocialPost(), extractComponentMedia(), walk() (+24 more)

### Community 85 - "Agent Error/Retry Logic"
Cohesion: 0.17
Nodes (13): Fallback Model (runbook), ADK Error Delivery Constraint, Attachment Bytes Do Not Live in History, Concurrency & Lifecycle Under Retry, Gemini Failure Taxonomy, Gemini API, Roka Agent (ADK), Session Manager (+5 more)

### Community 86 - "Capture Sink/Benchmarking"
Cohesion: 0.11
Nodes (13): CaptureInput, CaptureKind, CaptureRecord, CaptureSink, createCaptureSink(), benchmarkTranscript, CapturingRunner, mocks (+5 more)

### Community 87 - "Environment Configuration"
Cohesion: 0.13
Nodes (14): Configuration (AGENTS.md), Tech Stack (AGENTS.md), envString(), episodeMaxMessages, maxJitterAchievableRetries, MediaWatcher, memoryEnum(), MemoryPrivacy (+6 more)

### Community 88 - "Social Media Research"
Cohesion: 0.29
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "System Prompt Architecture"
Cohesion: 0.14
Nodes (27): Architecture (AGENTS.md), FR-4: Layered Personality Prompts, Prompt System, AssemblerInput, AssemblerInput, assembleSystemPrompt(), buildContextPrompt(), getTimeOfDay() (+19 more)

### Community 90 - "Video Selection Logic"
Cohesion: 0.48
Nodes (4): audioRank(), qualifies(), selectPlayableVideo(), VideoCandidate

### Community 91 - "Fact Extraction Schema"
Cohesion: 0.06
Nodes (33): AddOperationSchema, calendarDateProperties, datedGuildPredicates, ExtractionOutputSchema, ExtractionSubject, GuildAddOperationSchema, GuildExtractionOp, GuildFactDate (+25 more)

### Community 92 - "Media Validation Logic"
Cohesion: 0.33
Nodes (5): ALLOWED_MEDIA_TYPES, admitted, LABELS, linkOption, slots

### Community 93 - "Content Key Generation"
Cohesion: 0.32
Nodes (9): ref_node_crypto, bytesContentKey(), DISCORD_CDN_HOSTS, discordAttachmentContentKey(), postContentKey(), requireId(), youtubeContentKey(), playableVideo() (+1 more)

### Community 94 - "Memory Claim Schema"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 97 - "Expression Tone Mapping"
Cohesion: 0.38
Nodes (5): EXPRESSION_URLS, getExpressionUrl(), lastExpressionByTone, __resetExpressionState(), TONE_EXPRESSIONS

### Community 100 - "Turn Context Testing"
Cohesion: 0.22
Nodes (5): entryWork(), jevConfig, mocks, turnOptions(), turnWith()

### Community 102 - "Episode Recall/Visibility"
Cohesion: 0.10
Nodes (28): channelVisibility, registerChannelVisibility(), resetChannelVisibilityForTest(), UNKNOWN, buildEpisodeRecallBlock(), formatEpisodeRecallBlock(), RecalledEpisode, recallEpisodes() (+20 more)

### Community 103 - "Claims Memory Architecture"
Cohesion: 0.36
Nodes (8): Claim Lifecycle, Claims Memory Architecture, extraction_queue Table, memory_claim_fts Table, memory_claim Table, memory_events Table, memory_evidence Table, Vault Export

### Community 104 - "Media Duration Parsing"
Cohesion: 0.26
Nodes (11): Box, durationFromTokens(), movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0() (+3 more)

### Community 105 - "Media Turn Testing"
Cohesion: 0.13
Nodes (10): digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf(), PreparedTurnMedia, WatchContext, MediaDigest (+2 more)

### Community 107 - "Buddy Collection Management"
Cohesion: 0.40
Nodes (8): buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount(), handleBuddyCollection(), { getBuddyCollection }, BuddyData, getBuddyCollection()

### Community 108 - "Roka Character Data"
Cohesion: 0.67
Nodes (3): Maniwa Roka, Rokabot, Senren*Banka

### Community 109 - "Error/Stats Handling"
Cohesion: 0.31
Nodes (9): IGNORABLE_CODES, isIgnorableDiscordError(), handleStatsCommand(), isStatsView(), logStatsError(), selectionFor(), sendStatsError(), STATS_VIEWS (+1 more)

### Community 111 - "Reddit Feed Parsing"
Cohesion: 0.56
Nodes (9): decodeEntities(), entryAuthor(), entryContent(), feedEntries(), feedField(), htmlToText(), NAMED_ENTITIES, parseRedditFeedPost() (+1 more)

### Community 117 - "Social Post Formatting"
Cohesion: 0.48
Nodes (6): SOCIAL_POST_UNTRUSTED_DATA_LABEL, author(), formatSocialPostLine(), quoted(), replies(), SOCIAL_POST_FAILURE_MARKER

### Community 119 - "Global Configuration Sections"
Cohesion: 0.12
Nodes (18): discord Config Section, emoji Config Section, games Config Section, gemini Config Section, logging Config Section, memory Config Section, metrics Config Section, rateLimit Config Section (+10 more)

### Community 122 - "Tool Context Management"
Cohesion: 0.29
Nodes (3): REMEMBER_TURN, runTurn(), ScriptedLlm

### Community 124 - "Social Reply Reading"
Cohesion: 0.20
Nodes (9): createReplyReader(), isAbort(), replyReader, ReplyLookup, SocialPostViewerDependencies, SocialPlatform, FOUND, readerWith() (+1 more)

### Community 125 - "Sprite/Image Optimization"
Cohesion: 0.10
Nodes (20): ref_node_child_process, ref_node_path, sharp, spriteFiles, EMPTY, extractFrame(), extractFrames(), frameBins() (+12 more)

### Community 127 - "Linting Configuration"
Cohesion: 0.67
Nodes (3): lint-staged, *.{json,md,yml,yaml}, *.{ts,js}

### Community 134 - "Anime Search Integration"
Cohesion: 0.28
Nodes (7): jikanThrottle(), AnimeResult, JikanAnimeEntry, JikanResponse, searchAnime(), SearchAnimeParams, SearchAnimeResult

### Community 135 - "Turn Context/Prefetching"
Cohesion: 0.08
Nodes (38): formatGuildFactDate(), retrieveGuildFacts(), serializeGuildFact(), GenerateOptions, buildLookedUpBlock(), clip(), decidePrefetch(), JevPrefetchMode (+30 more)

### Community 136 - "Deployment/CI/CD Workflow"
Cohesion: 0.26
Nodes (12): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping), Deployment & Operations (+4 more)

### Community 141 - "Report Generation CLI"
Cohesion: 0.43
Nodes (6): main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne()

## Ambiguous Edges - Review These
- `Rokabot TRD` → `Second Opinion`  [AMBIGUOUS]
  docs/research/jev-integration.md · relation: conceptually_related_to

## Knowledge Gaps
- **696 isolated node(s):** `GameContainerOptions`, `BuddyRow`, `DailyBuddyHatch`, `DailyHatchRow`, `JevReplayCutoffRow` (+691 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 945 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Rokabot TRD` and `Second Opinion`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `vitest` connect `Social Post Parsing` to `Gacha/Buddy Game Logic`, `Jev Replay/Evaluation`, `Qwen Model Watching`, `Discord Command Handling`, `Response Formatting/Budgeting`, `Memory Claims Management`, `Hangman Game Logic`, `Memory Persistence/Scheduler`, `Embedding/Fact Management`, `Activity Querying/Stats`, `Interaction/Reply Handling`, `Memory Migration/Diagnostics`, `Social Reply Fetching`, `Fact Date Verification`, `Episode Tracking/Timers`, `Session/Attachment Management`, `Session/Trial Recording`, `Identity/Privacy Resolver`, `Response Steering/Testing`, `Memory Predicate Logic`, `Episode Maintenance/Vectoring`, `Rate Limiting/Gateway`, `Prompt Safety/Validation`, `Media Streaming/Planning`, `Reminder/Test Scheduler`, `Memory Recall/Ranking`, `Memory Replay/Metrics`, `YouTube Stream Parsing`, `Fact Extraction Logic`, `Project Requirements/Docs`, `Attachment Token Measurement`, `Byte/Attachment Budgeting`, `Model Routing/Fallback`, `Attachment Type Handling`, `Gemini Reliability/Backoff`, `Tool Trigger Testing`, `Identity Resolution/Rollout`, `Activity Chart Rendering`, `Server Lifecycle/Shutdown`, `LLM Content Generation`, `Reply Reading Tools`, `Game Command Handlers`, `Channel Extraction Monitoring`, `Model Routing/Hedging`, `Web Search Integration`, `Token Budget Management`, `Jev System Configuration`, `Media Digest/Formatting`, `Attachment Limit Definitions`, `Bluesky Thread Viewer`, `Bluesky Data Parsing`, `Quota/Capacity Diagnostics`, `Prefetch Measurement/Analysis`, `Project Metadata/Config`, `File Upload Handling`, `Reply Outcome/Citations`, `ADK Interaction Testing`, `Token Measurement/Limits`, `View/Chart Testing`, `GenAI Video/Audio Watch`, `Search Citation Logic`, `Search Prefetch Shadowing`, `Episode Admission Logic`, `Message Content Extraction`, `Capture Sink/Benchmarking`, `System Prompt Architecture`, `Video Selection Logic`, `Fact Extraction Schema`, `Media Validation Logic`, `Content Key Generation`, `Expression Tone Mapping`, `Turn Context Testing`, `Episode Recall/Visibility`, `Media Duration Parsing`, `Media Turn Testing`, `Buddy Collection Management`, `Global Configuration Sections`, `Tool Context Management`, `Social Reply Reading`, `Sprite/Image Optimization`, `Environment Configuration`, `Turn Context/Prefetching`?**
  _High betweenness centrality (0.259) - this node is a cross-community bridge._
- **Why does `config` connect `Embedding/Fact Management` to `Gacha/Buddy Game Logic`, `Discord Command Handling`, `Response Formatting/Budgeting`, `Memory Claims Management`, `Turn Context/Prefetching`, `Memory Persistence/Scheduler`, `Hangman Game Logic`, `Interaction/Reply Handling`, `Tool/Utility Registry`, `Social Reply Fetching`, `Fact Date Verification`, `Episode Tracking/Timers`, `Session/Attachment Management`, `Session/Trial Recording`, `Identity/Privacy Resolver`, `Response Steering/Testing`, `Memory Predicate Logic`, `Episode Maintenance/Vectoring`, `Rate Limiting/Gateway`, `Prompt Safety/Validation`, `Media Streaming/Planning`, `Reminder/Test Scheduler`, `Memory Recall/Ranking`, `YouTube Stream Parsing`, `Fact Extraction Logic`, `Anime Schedule Lookup`, `Attachment Token Measurement`, `Model Fallback Logic`, `Byte/Attachment Budgeting`, `Gemini Reliability/Backoff`, `Identity Resolution/Rollout`, `Server Lifecycle/Shutdown`, `Game Command Handlers`, `Channel Extraction Monitoring`, `Obsidian Memory Export`, `Time/Weather Tools`, `Token Budget Management`, `Jev System Configuration`, `Attachment Limit Definitions`, `Bluesky Thread Viewer`, `Quota/Capacity Diagnostics`, `Gemini ADK Testing`, `File Upload Handling`, `Reply Outcome/Citations`, `GenAI Video/Audio Watch`, `Episode Admission Logic`, `Capture Sink/Benchmarking`, `Environment Configuration`, `Content Key Generation`, `Turn Context Testing`, `Episode Recall/Visibility`, `Global Configuration Sections`, `Sprite/Image Optimization`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `getDb()` connect `Memory Migration/Diagnostics` to `Gacha/Buddy Game Logic`, `Discord Command Handling`, `Analytics/Metrics Dashboard`, `Memory Claims Management`, `Hangman Game Logic`, `Memory Persistence/Scheduler`, `Embedding/Fact Management`, `Activity Querying/Stats`, `Turn Context/Prefetching`, `Interaction/Reply Handling`, `Episode Tracking/Timers`, `Identity/Privacy Resolver`, `Memory Predicate Logic`, `Episode Maintenance/Vectoring`, `Prompt Safety/Validation`, `Reminder/Test Scheduler`, `Memory Recall/Ranking`, `Memory Replay/Metrics`, `Fact Extraction Logic`, `Tool Trigger Testing`, `Identity Resolution/Rollout`, `Server Lifecycle/Shutdown`, `Game Command Handlers`, `Channel Extraction Monitoring`, `Obsidian Memory Export`, `ADK Interaction Testing`, `Episode Admission Logic`, `Capture Sink/Benchmarking`, `Episode Recall/Visibility`, `Buddy Collection Management`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `createMessageHandler()` (e.g. with `.canAdmitCalls()` and `.reserveCalls()`) actually correct?**
  _`createMessageHandler()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `GameContainerOptions`, `BuddyRow`, `DailyBuddyHatch` to the rest of the system?**
  _696 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Gacha/Buddy Game Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.08778424114225278 - nodes in this community are weakly interconnected._