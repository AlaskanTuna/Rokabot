# Graph Report - graph  (2026-10-08)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2585 nodes · 7149 edges · 138 communities (131 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 238 edges (avg confidence: 0.88)
- Token cost: 6,990 input · 1,457 output

## Graph Freshness
- Built from commit: `4e7ad251`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Buddy System Logic
- Jev Replay Analysis
- Database Migration & Legacy
- Game & Stats Commands
- Code Formatting Config
- Memory Analytics Views
- Citation & Tone Builder
- Memory Claims Management
- Hangman Game Logic
- Episode Extraction Scheduler
- Episode Embedding Persistence
- Activity Analytics Queries
- Discord Attachment Specs
- Interaction Concurrency Control
- Application Configuration
- Reminder Tooling
- Event & Failure Metrics
- Model Fallback Testing
- Date Parsing Utilities
- Episode Tracking Logic
- Development Dependencies
- Session Management
- Session State Testing
- Memory Shadow Replay
- Test Run Execution
- Claim Retrieval Logic
- Transcript Processing Tools
- Project Dependencies
- Episode Maintenance & Media
- Rate Limiting Logic
- File & Report Handling
- TypeScript Configuration
- Media Memory Rendering
- Feature Testing Utilities
- Build & Maintenance Scripts
- Discord Tool Commands
- Shutdown & Reliability Reporting
- Interaction Metrics Testing
- Memory Extraction Operations
- Conversational Memory Handling
- Anime Schedule Lookup
- Attachment Token Costing
- Model Fallback Logic
- Attachment Budget Limits
- Model Routing & Hedging
- Attachment Intake Policies
- Model Reliability & Recovery
- Tool Trigger Scoring
- Privacy & User Forgetting
- Activity Chart Rendering
- Channel Monitoring & Emojis
- LLM Integration Testing
- TypeScript Configuration
- Identity Resolution
- Game Command Handlers
- Metrics & Monitor Reset
- Obsidian Memory Export
- Gacha Game Mechanics
- Utility Tools
- Search Citation Logic
- Token Budget Management
- Memory Verification Judgments
- Media Digest Processing
- System Requirements & Constraints
- Core Client Configuration
- Social Post Integration
- Project Documentation
- Bluesky Data Parsers
- Quota Diagnostic Tools
- Social Post URL Parsing
- Prefetch Measurement Tools
- Project Configuration
- Network & Smoke Tests
- File Upload Handling
- Message Event Handling
- Payload Rendering
- Docker Infrastructure Setup
- Episode Retrieval Logic
- Token Limit Measurement
- Stats Command Handling
- Watch & Request Formatting
- Tool Trigger Testing
- Search Prefetch Shadowing
- Episode Admission Logic
- Message Content Extraction
- Fallback Error Handling
- Capture Sink Harness
- Environment Configuration
- Social Post Research
- System Prompt Architecture
- Media Token Planning
- Extraction Schemas
- Jev System Design
- Media Content Keys
- Memory Schema Migrations
- Memory Replay Metrics
- Gemini Reliability Analysis
- Tone Detection Pipeline
- Watch Planning Logic
- Search Prefetch Logic
- LLM Generation Logic
- Discord Interaction Mocks
- Media Recall Logic
- Memory Claims Architecture
- Media Duration Utilities
- Turn Media Testing
- Commit Linting Rules
- Collection Management
- Roka Bot Identity
- Discord Channel Mocks
- LLM Fallback Logic
- Slash Command Interaction
- Trial Record Management
- Documentation Style Guide
- Git Commit Conventions
- Coding Guidelines
- YouTube Downloader Integration
- Social Post Formatting
- Message Attachment Processing
- Social Video Selection
- Episode Memory Storage
- Episode Maintenance Testing
- LLM Tool Execution
- Social Post Parsing
- Tool Trigger Testing
- Analytics View Controls
- CLI Chat Interface
- Task Scheduler Testing
- Memory Replay Testing
- Tone Analysis Utilities
- YAML Configuration Utilities
- Anime Search Integration
- Turn Context Management
- Deployment Operations
- Functional Requirements Docs
- Database Reporting Tools
- Prompt Safety & Normalization
- Memory Interaction Testing

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 195 edges
2. `vitest` - 136 edges
3. `config` - 77 edges
4. `logger` - 56 edges
5. `createMessageHandler()` - 48 edges
6. `createInteractionHandler()` - 44 edges
7. `generateResponse()` - 44 edges
8. `discord.js` - 41 edges
9. `createTurnContext()` - 31 edges
10. `closeDb()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Attachment Bytes Do Not Live in History` --conceptually_related_to--> `generateResponse()`  [INFERRED]
  docs/trd.md → src/agent/roka.ts
- `Attachment Types and Their Ceilings` --implements--> `GEMINI_SPELLINGS`  [INFERRED]
  docs/trd.md → src/agent/attachmentLimits.ts
- `Jev Turn Judgment` --implements--> `TurnJudgment`  [INFERRED]
  docs/trd.md → src/agent/jev/judgments.ts
- `WindowMessage` --implements--> `WindowMessage`  [INFERRED]
  docs/trd.md → src/session/types.ts
- `AssemblerInput` --implements--> `AssemblerInput`  [INFERRED]
  docs/trd.md → src/agent/promptAssembler.ts

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

## Communities (138 total, 7 thin omitted)

### Community 0 - "Buddy System Logic"
Cohesion: 0.10
Nodes (32): SQLite Database Reference, BuddyRow, DailyBuddyHatch, DailyHatchRow, generateBuddy(), generateName(), generatePersonality(), getDailyHatchRow() (+24 more)

### Community 1 - "Jev Replay Analysis"
Cohesion: 0.12
Nodes (26): parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, detectToneWithSource(), agreement(), buildConfusionMatrix(), buildProbabilityBins() (+18 more)

### Community 2 - "Database Migration & Legacy"
Cohesion: 0.09
Nodes (33): attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow, legalScopes() (+25 more)

### Community 3 - "Game & Stats Commands"
Cohesion: 0.21
Nodes (10): Features, gachaCommand, gameCommands, hangmanCommand, shiritoriCommand, reportCommand, statsCommand, animeCommand (+2 more)

### Community 4 - "Code Formatting Config"
Cohesion: 0.05
Nodes (37): useLiteralKeys, files, ignore, formatter, enabled, indentStyle, indentWidth, lineWidth (+29 more)

### Community 5 - "Memory Analytics Views"
Cohesion: 0.13
Nodes (28): distinctRememberedUsers(), latencyE2e, memoryGrowthSeries(), newClaimsThisMonth(), p95ByDay, percentile(), retrySummary, successRate (+20 more)

### Community 6 - "Citation & Tone Builder"
Cohesion: 0.10
Nodes (26): clampToBudget(), fitCitations(), sourceHost(), EXPRESSION_URLS, getExpressionUrl(), lastExpressionByTone, __resetExpressionState(), TONE_EXPRESSIONS (+18 more)

### Community 7 - "Memory Claims Management"
Cohesion: 0.10
Nodes (42): Claims Tenancy Model, evicted, activateClaim(), appendEvidenceInTransaction(), assertClaimInTransaction(), assertGuildClaim(), assertSafeValue(), assertWritableGuild() (+34 more)

### Community 8 - "Hangman Game Logic"
Cohesion: 0.20
Nodes (21): buildHangmanBody(), handleHangmanGuess(), handleHangmanStart(), HANGMAN_COLORS, saveHangmanScore(), src_games_data_hangmanwords, activeGames, getDisplayWord() (+13 more)

### Community 9 - "Episode Extraction Scheduler"
Cohesion: 0.12
Nodes (23): persistEpisodeResult(), drainOnce(), finishJob(), inFlightGuilds, inFlightTasks, orderedGuilds(), runJob(), scheduleDrain() (+15 more)

### Community 10 - "Episode Embedding Persistence"
Cohesion: 0.14
Nodes (13): @google/genai, response(), embedEpisodeText(), EpisodeEmbeddingRole, getEmbeddingClient(), resetEpisodeEmbeddingClientForTest(), EpisodeRunResult, mocks (+5 more)

### Community 11 - "Activity Analytics Queries"
Cohesion: 0.09
Nodes (34): activeClaimCount(), activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome (+26 more)

### Community 12 - "Discord Attachment Specs"
Cohesion: 0.06
Nodes (44): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+36 more)

### Community 13 - "Interaction Concurrency Control"
Cohesion: 0.12
Nodes (35): isMonitored(), markActive(), withSearchCitations(), startTurnEntryWork(), isChannelBusy(), markBusy(), markFree(), findMatchingRule() (+27 more)

### Community 14 - "Application Configuration"
Cohesion: 0.22
Nodes (10): discord Config Section, games Config Section, gemini Config Section, logging Config Section, memory Config Section, metrics Config Section, rateLimit Config Section, session Config Section (+2 more)

### Community 15 - "Reminder Tooling"
Cohesion: 0.16
Nodes (25): reminders Config Section, cancelReminderTool, cancelReminder(), listReminders(), setReminder(), SetReminderParams, handleRemind(), handleRemindAt() (+17 more)

### Community 16 - "Event & Failure Metrics"
Cohesion: 0.13
Nodes (20): Failure Diagnostics Table, getJevEventStatement(), JevEventInput, JevEventKind, countMemoryEvents(), ExtractionEventInput, FailureDiagnosticInput, getExtractionEventStatement() (+12 more)

### Community 17 - "Model Fallback Testing"
Cohesion: 0.20
Nodes (5): adapter(), configState, RequestCall, responses(), TextLlm

### Community 18 - "Date Parsing Utilities"
Cohesion: 0.12
Nodes (30): GuildFactDate, addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth() (+22 more)

### Community 19 - "Episode Tracking Logic"
Cohesion: 0.14
Nodes (22): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), resetEpisodeTrackerForTest(), scheduleLull() (+14 more)

### Community 20 - "Development Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, husky, lint-staged, pino-pretty, prettier (+5 more)

### Community 21 - "Session Management"
Cohesion: 0.12
Nodes (9): attachmentMarker(), idleTimers, isStrippable(), rehydrationSuppressed, sessionErrorCounts, WindowedSessionService, CapturingLlm, newConversation() (+1 more)

### Community 22 - "Session State Testing"
Cohesion: 0.13
Nodes (18): APP_NAME, sessionService, CASE_SETS, channels, header, probeCase, stateAfterCase(), temporaryDirectories (+10 more)

### Community 23 - "Memory Shadow Replay"
Cohesion: 0.17
Nodes (15): asClaim(), asScenario(), evaluateMemoryShadow(), FixtureClaim, loadReplaySet(), MemoryShadowReport, percentile95(), REPLAY_PATH (+7 more)

### Community 24 - "Test Run Execution"
Cohesion: 0.15
Nodes (17): generateResponse(), __setTestRunTurnFactory(), TestRunTurn, destroySession(), resetIdleTimer(), droppedFor(), inlineFor(), mocks (+9 more)

### Community 25 - "Claim Retrieval Logic"
Cohesion: 0.15
Nodes (25): ClaimSource, predicateCategory, routeTopics(), ClaimRow, compareRetrieved(), formatGuildFactDate(), getActiveClaims(), mapClaim() (+17 more)

### Community 26 - "Transcript Processing Tools"
Cohesion: 0.18
Nodes (20): fixturePath(), loadTranscript(), main(), parseTranscriptLine(), renderTokenTable(), requestMessageContent(), runTranscript(), RunTranscriptOptions (+12 more)

### Community 27 - "Project Dependencies"
Cohesion: 0.15
Nodes (13): dependencies, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml, @napi-rs/canvas (+5 more)

### Community 28 - "Episode Maintenance & Media"
Cohesion: 0.16
Nodes (25): EpisodeMaintenanceReport, pruneEpisodesAndReembed(), seedMedia(), seedMedia(), seedMedia(), findMediaDigest(), findMediaSharedBy(), forgetMediaForUser() (+17 more)

### Community 29 - "Rate Limiting Logic"
Cohesion: 0.17
Nodes (10): FR-6: Rate Limiting, Discord Gateway Layer, RateLimiterConfig, RPM-Budget Accounting, A Turn Reserves the Calls It May Make, modelCallsForRequest, DECLINE_MESSAGES, CallReservation (+2 more)

### Community 30 - "File & Report Handling"
Cohesion: 0.08
Nodes (32): ref_node_url, composePrompt(), isAllowedDiscordCdnUrl(), AttachmentCopyError, copyAttachment(), displayName(), handleReportCommand(), moduleDirectory (+24 more)

### Community 31 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "Media Memory Rendering"
Cohesion: 0.17
Nodes (24): geminiMimeType(), renderCompactDigest(), renderDigestBlock(), renderSingleLine(), durationFromTokens(), planHalves(), halvesCouldCover(), halvesFor() (+16 more)

### Community 33 - "Feature Testing Utilities"
Cohesion: 0.14
Nodes (25): assert(), fail(), main(), makeMessage(), pass(), results, TestResult, assert() (+17 more)

### Community 34 - "Build & Maintenance Scripts"
Cohesion: 0.07
Nodes (28): scripts, build, dev, dev:quiet, export:vault, format, format:check, harness (+20 more)

### Community 35 - "Discord Tool Commands"
Cohesion: 0.24
Nodes (15): discord.js, ref_discordjs_builders, createToolCommandHandler(), TOOL_COMMAND_NAMES, handleAnime(), capitalize(), formatTimezoneList(), formatTimezoneShort() (+7 more)

### Community 36 - "Shutdown & Reliability Reporting"
Cohesion: 0.15
Nodes (17): OperationApplicationReport, beginShutdown(), isShuttingDown(), resetForTest(), options(), EpisodeReplayContext, GapDistribution, loadSessionHistorySnapshot() (+9 more)

### Community 37 - "Interaction Metrics Testing"
Cohesion: 0.12
Nodes (11): attachmentOptionName(), MAX_ATTACHMENTS, expectedPolicy, askWith(), metrics, mocks, turnEntryWork, client (+3 more)

### Community 38 - "Memory Extraction Operations"
Cohesion: 0.11
Nodes (28): Memory, ExtractionOp, parseExtractionOutput(), episodePrompt(), EpisodeWriteOp, extractEpisode(), formatEpisodeLine(), getClient() (+20 more)

### Community 39 - "Conversational Memory Handling"
Cohesion: 0.27
Nodes (7): FR-3: Per-Channel Conversational Memory, Attachment History Stripping, ChannelSession, WindowMessage, input(), ChannelSession, WindowMessage

### Community 40 - "Anime Schedule Lookup"
Cohesion: 0.19
Nodes (20): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleParams, GetAnimeScheduleResult, getCurrentSeason() (+12 more)

### Community 41 - "Attachment Token Costing"
Cohesion: 0.16
Nodes (18): PDF Token Cost Measurement, Attachment Token Admission, measureAttachmentTokens(), needsMeasuring(), GEMINI_IMAGE_TOKENS, downloadAttachment(), prepareAttachments(), PreparedAttachments (+10 more)

### Community 42 - "Model Fallback Logic"
Cohesion: 0.16
Nodes (17): AnswerModel, attachmentKind(), attachmentMarker(), ChatMessage, GeneratedCall, isRecord(), JsonObject, MessageEntry (+9 more)

### Community 43 - "Attachment Budget Limits"
Cohesion: 0.13
Nodes (18): RFC-3003, Global In-Flight Attachment Budget, GEMINI_SPELLINGS, isStreamedUpload(), MAX_AUDIO_SIZE_BYTES, MAX_DOCUMENT_SIZE_BYTES, MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES (+10 more)

### Community 44 - "Model Routing & Hedging"
Cohesion: 0.18
Nodes (5): ModelRoute, DeferredLlm, loggerMock, Outcome, responses()

### Community 45 - "Attachment Intake Policies"
Cohesion: 0.18
Nodes (21): attachment_url, Handing Her a File, Audio Intake Recommendation, PDF Intake Recommendation, Video Low Resolution Recommendation, Attachment Types and Their Ceilings, requestCarriesVideo(), ALLOWED_AUDIO_TYPES (+13 more)

### Community 46 - "Model Reliability & Recovery"
Cohesion: 0.06
Nodes (43): @google/adk, ref_node_async_hooks, modelRouteForRequest, FailureKind, escapeRegExp(), stripNarratedToolCalls(), abortActiveTurns(), activeAbortControllers (+35 more)

### Community 47 - "Tool Trigger Scoring"
Cohesion: 0.21
Nodes (16): isKnownPredicate(), asCase(), asClaim(), asHeader(), asHistoryLine(), asMember(), asSessionState(), DEFAULT_CASE_SET_PATH (+8 more)

### Community 48 - "Privacy & User Forgetting"
Cohesion: 0.22
Nodes (10): searchClaims(), normalizeKey(), sensitiveFactReason, LEGITIMATE, SENSITIVE, forgetUser(), ForgetUserParams, ForgetUserResult (+2 more)

### Community 49 - "Activity Chart Rendering"
Cohesion: 0.25
Nodes (15): @napi-rs/canvas, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+7 more)

### Community 50 - "Channel Monitoring & Emojis"
Cohesion: 0.12
Nodes (18): emoji Config Section, ref_node_http, cleanupExpired(), monitoredChannels, restoreMonitoredChannels(), waitForInFlightExtractions(), destroyAllSessions(), cleanupExpiredCooldowns() (+10 more)

### Community 51 - "LLM Integration Testing"
Cohesion: 0.12
Nodes (6): vitest, CapturingLlm, PDF_BASE64, sendPart(), generateContent, GoogleGenAI

### Community 52 - "TypeScript Configuration"
Cohesion: 0.22
Nodes (8): ./tsconfig.json, compilerOptions, noEmit, rootDir, types, exclude, extends, include

### Community 53 - "Identity Resolution"
Cohesion: 0.23
Nodes (11): Who-Is-Who Resolver, Bounded Retrieval Contract, escapeRegex(), isAscii(), MATCH_PRIORITY, MatchKind, NameCandidate, NameIndex (+3 more)

### Community 54 - "Game Command Handlers"
Cohesion: 0.12
Nodes (39): ref_node_module, createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleBuddyLeaderboard(), handleHangmanGuide(), handleLeaderboard(), buildGameContainer() (+31 more)

### Community 55 - "Metrics & Monitor Reset"
Cohesion: 0.17
Nodes (13): ref_node_path, resetMonitor(), resetForTest(), stopExtractionScheduler(), __resetTestRunTurnFactory(), makeClient(), toChannelMap(), responseEventCount() (+5 more)

### Community 56 - "Obsidian Memory Export"
Cohesion: 0.16
Nodes (18): Browsing Memory in Obsidian, GuildMemoryClaim, UserMemoryClaim, ActiveClaimSubject, ActiveGuildSubject, ExportedClaim, ExportedGuildClaim, exportVault() (+10 more)

### Community 57 - "Gacha Game Mechanics"
Cohesion: 0.18
Nodes (25): handleGachaMention(), statBar(), formatBuddySummary(), formatHatchTimeRemaining(), handleBuddyStats(), handleBuddyView(), handleHatch(), handlePet() (+17 more)

### Community 58 - "Utility Tools"
Cohesion: 0.09
Nodes (40): Tool Footer, Where Rokabot Decides Today, resolveName(), touchRecalled(), flipCoin(), FlipCoinResult, cityToTimezone, getCurrentTime() (+32 more)

### Community 59 - "Search Citation Logic"
Cohesion: 0.20
Nodes (6): citationsForTurn, SearchCitation, runSearchTurn(), ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS

### Community 60 - "Token Budget Management"
Cohesion: 0.30
Nodes (10): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, The Two Limiters Bound Their Windows Differently, canAffordAttachments(), chargeTokens(), drain(), lastDrain, remainingTokensThisMinute() (+2 more)

### Community 61 - "Memory Verification Judgments"
Cohesion: 0.16
Nodes (14): @typesafe-ai/sdk, BoundedAlias, boundedAliases(), judgeEpisodeAdmission(), judgeEpisodeOperations(), judgeTurn(), LOOKUP_QUESTION, MemoryVerification (+6 more)

### Community 62 - "Media Digest Processing"
Cohesion: 0.16
Nodes (21): boundedString(), coverageLine(), cutAtWord(), frameInterval(), isRecord(), MEDIA_DIGEST_HEADING, MEDIA_OBSERVATIONS_SCHEMA, mergeHalves() (+13 more)

### Community 63 - "System Requirements & Constraints"
Cohesion: 0.11
Nodes (22): FR-7: Error Handling, FR-8: Response Formatting, FR-9: Docker Deployment, ALLOWED_IMAGE_TYPES Consolidation, Byte Cap as Duration Proxy, Concurrency Binding Constraint, Container Memory Cap Correction, Flash-Lite Modality Verification (+14 more)

### Community 64 - "Core Client Configuration"
Cohesion: 0.15
Nodes (17): Tech Stack (AGENTS.md), SearchWebParams, TavilyResponse, TavilyResult, config, createClient(), buildCommandBody(), handleReady() (+9 more)

### Community 65 - "Social Post Integration"
Cohesion: 0.15
Nodes (15): ParsedBlueskyThread, beginSocialPostLookup(), createSocialPostViewer(), failure(), initializeSocialPosts(), isAbort(), isYtDlpPlatform(), SocialPostSettings (+7 more)

### Community 66 - "Project Documentation"
Cohesion: 0.14
Nodes (18): Critical Do-Nots, Project (Rokabot description), Reference Docs (AGENTS.md), Rokabot PRD, Documentation (README index), Jev Integration (Research Doc), GPT-6-Astra, Jev Rollout Plan (+10 more)

### Community 67 - "Bluesky Data Parsers"
Cohesion: 0.30
Nodes (20): array(), base(), BlueskyBlob, blueskyQuote(), capped(), compact(), date(), finiteNumber() (+12 more)

### Community 68 - "Quota Diagnostic Tools"
Cohesion: 0.27
Nodes (10): BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey(), DIAGNOSTIC_TIMEOUT_MS, errorText(), KEY_IS_LIVE, OUTPACING_THE_CAP, SPENT_FOR_THE_DAY (+2 more)

### Community 69 - "Social Post URL Parsing"
Cohesion: 0.16
Nodes (11): findSocialPostTarget(), hostMatches(), HOSTS, parseSocialPostUrl(), platformForHost(), target(), youtubeStartSec(), mocks (+3 more)

### Community 70 - "Prefetch Measurement Tools"
Cohesion: 0.21
Nodes (9): main(), MeasurementAnomaly, Options, parseOptions(), percentile(), PrefetchMeasurementCase, PrefetchMeasurementSummary, PrefetchMeasurementTrial (+1 more)

### Community 71 - "Project Configuration"
Cohesion: 0.07
Nodes (26): description, engines, node, lint-staged, *.{json,md,yml,yaml}, *.{ts,js}, main, name (+18 more)

### Community 72 - "Network & Smoke Tests"
Cohesion: 0.12
Nodes (19): ref_node_dns, ref_node_net, ErrorRecoveryPlugin, main(), results, runQuery(), test(), TestResult (+11 more)

### Community 73 - "File Upload Handling"
Cohesion: 0.17
Nodes (9): countedBody(), deleteFile(), FileResource, getFile(), sleep(), streamToFiles(), UploadedFile, videoDurationSec() (+1 more)

### Community 74 - "Message Event Handling"
Cohesion: 0.14
Nodes (9): NAME_MENTION_REGEX, createRateLimiter(), handle(), metrics, mocks, turnEntryWork, assertTurnEntryRejections(), TurnEntryRejection (+1 more)

### Community 75 - "Payload Rendering"
Cohesion: 0.36
Nodes (12): asObject(), asObjects(), chunkLabel(), componentDetails(), walk(), isComponentsV2Payload(), PayloadObject, renderEmbeds() (+4 more)

### Community 76 - "Docker Infrastructure Setup"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 77 - "Episode Retrieval Logic"
Cohesion: 0.25
Nodes (11): buildEpisodeRecallBlock(), cosineSimilarity(), formatEpisodeRecallBlock(), RecalledEpisode, recallEpisodes(), selectEpisodesWithinBudget(), toRecalledEpisode(), configMock (+3 more)

### Community 78 - "Token Limit Measurement"
Cohesion: 0.20
Nodes (13): Getting Started, npm run test:live Gate, dotenv, Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION (+5 more)

### Community 79 - "Stats Command Handling"
Cohesion: 0.16
Nodes (16): handleStatsCommand(), isStatsView(), logStatsError(), selectionFor(), sendStatsError(), charts, contentFor(), errors (+8 more)

### Community 80 - "Watch & Request Formatting"
Cohesion: 0.27
Nodes (14): formatClock(), countUriTokens(), elapsedSince(), getClient(), instructions(), mediaPart(), messageOf(), reasonFor() (+6 more)

### Community 81 - "Tool Trigger Testing"
Cohesion: 0.14
Nodes (11): fixturePath, header, rememberFixturePath, searchWebFixturePath, temporaryDirectories, testCase, meetsLiveVerdict(), MIN_PRECISION (+3 more)

### Community 82 - "Search Prefetch Shadowing"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "Episode Admission Logic"
Cohesion: 0.24
Nodes (8): AdmissionResult, admitEpisode(), isTrivial(), normalize(), precheckEpisode(), SENSITIVE_PATTERNS, mocks, ExtractionEpisode

### Community 84 - "Message Content Extraction"
Cohesion: 0.15
Nodes (23): ImageAttachment, isSupportedMedia(), describeEmbed(), describeForwardedSnapshots(), describePoll(), embedMatchesSocialPost(), extractComponentMedia(), walk() (+15 more)

### Community 85 - "Fallback Error Handling"
Cohesion: 0.20
Nodes (10): fallback Config Section, ModelScope Qwen Fallback, Tech Stack (README), Fallback Model (runbook), ADK Error Delivery Constraint, Concurrency & Lifecycle Under Retry, Gemini Failure Taxonomy, A Spent Day Is Not a Spent Minute (+2 more)

### Community 86 - "Capture Sink Harness"
Cohesion: 0.11
Nodes (12): CaptureInput, CaptureKind, CaptureRecord, CaptureSink, createCaptureSink(), benchmarkTranscript, CapturingRunner, mocks (+4 more)

### Community 87 - "Environment Configuration"
Cohesion: 0.16
Nodes (8): Configuration (AGENTS.md), episodeMaxMessages, maxJitterAchievableRetries, minJitterAchievableRetries, NUMERIC_BOUNDS, requiredEnv(), yaml, YamlConfig

### Community 88 - "Social Post Research"
Cohesion: 0.29
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "System Prompt Architecture"
Cohesion: 0.20
Nodes (19): Architecture (AGENTS.md), FR-4: Layered Personality Prompts, Prompt System, AssemblerInput, assembleSystemPrompt(), buildContextPrompt(), getTimeOfDay(), CORE_PROMPT (+11 more)

### Community 90 - "Media Token Planning"
Cohesion: 0.23
Nodes (12): equalBins(), estimateMediaTokens(), FPS_LADDER, HalfWatch, HALVES_MAX_DURATION_SEC, HALVES_MIN_DURATION_SEC, HalvesPlan, planCoverage() (+4 more)

### Community 91 - "Extraction Schemas"
Cohesion: 0.05
Nodes (41): AddOperationSchema, calendarDateProperties, datedGuildPredicates, EXTRACTION_RESPONSE_SCHEMA, ExtractionOutputSchema, ExtractionSubject, GuildAddOperationSchema, GuildExtractionOp (+33 more)

### Community 92 - "Jev System Design"
Cohesion: 0.18
Nodes (17): jev Config Section, Jev Design (Per-Feature Modes), Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk, Jev Shadow Mode, Jev Judgments, Jev Memory Admission (+9 more)

### Community 93 - "Media Content Keys"
Cohesion: 0.31
Nodes (10): ref_node_crypto, bytesContentKey(), DISCORD_CDN_HOSTS, discordAttachmentContentKey(), postContentKey(), requireId(), youtubeContentKey(), playableVideo() (+2 more)

### Community 94 - "Memory Schema Migrations"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 95 - "Memory Replay Metrics"
Cohesion: 0.24
Nodes (12): ref_node_perf_hooks, argumentsFrom(), estimatedTokens(), inputText(), liveAdapters(), measure(), loadTranscriptLines(), main() (+4 more)

### Community 96 - "Gemini Reliability Analysis"
Cohesion: 0.26
Nodes (10): BackoffOptions, classifyGeminiFailure(), classifyMarker(), computeBackoff(), DEFAULT_MAX_BACKOFF_MS, extractGeminiStatus(), GeminiFailureResult, isRecord() (+2 more)

### Community 97 - "Tone Detection Pipeline"
Cohesion: 0.21
Nodes (10): Expressions & Tones, Message Pipeline, System Architecture, ToneKey, ToneRule, TONE_STYLES, ToneStyle, JevReplayReport (+2 more)

### Community 98 - "Watch Planning Logic"
Cohesion: 0.17
Nodes (3): mocks, text(), WatchSource

### Community 99 - "Search Prefetch Logic"
Cohesion: 0.22
Nodes (11): buildLookedUpBlock(), clip(), decidePrefetch(), JevPrefetchMode, PREFETCH_TOOL_NAME, PrefetchContext, PrefetchDecision, PrefetchOutcome (+3 more)

### Community 100 - "LLM Generation Logic"
Cohesion: 0.40
Nodes (4): errorText(), isHedgeEligible(), raceForWinner(), withAbort()

### Community 102 - "Media Recall Logic"
Cohesion: 0.30
Nodes (8): buildMediaRecallBlock(), formatMediaRecallBlock(), RecalledMedia, recallMedia(), selectMediaWithinBudget(), toRecalledMedia(), configMock, listMediaRecallCandidates()

### Community 103 - "Memory Claims Architecture"
Cohesion: 0.36
Nodes (8): Claim Lifecycle, Claims Memory Architecture, extraction_queue Table, memory_claim_fts Table, memory_claim Table, memory_events Table, memory_evidence Table, Vault Export

### Community 104 - "Media Duration Utilities"
Cohesion: 0.29
Nodes (9): Box, movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0(), mvhdV1() (+1 more)

### Community 105 - "Turn Media Testing"
Cohesion: 0.22
Nodes (5): digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf()

### Community 107 - "Collection Management"
Cohesion: 0.40
Nodes (8): buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount(), handleBuddyCollection(), { getBuddyCollection }, BuddyData, getBuddyCollection()

### Community 108 - "Roka Bot Identity"
Cohesion: 0.67
Nodes (3): Maniwa Roka, Rokabot, Senren*Banka

### Community 110 - "LLM Fallback Logic"
Cohesion: 0.24
Nodes (6): Deliberately Not Done, Gemini-Outage Fallback (Qwen3.5), The Fallback Model, createRokaModel(), ModelScopeLlm, RoutedLlm

### Community 111 - "Slash Command Interaction"
Cohesion: 0.24
Nodes (8): FR-1: Slash Command Interaction, ALLOWED_MEDIA_TYPES, askCommand, command, admitted, LABELS, linkOption, slots

### Community 112 - "Trial Record Management"
Cohesion: 0.39
Nodes (6): getLocalHour(), emitTrialRecord(), formatTrialRecord(), TrialRecord, record, scoreCaseSet()

### Community 116 - "YouTube Downloader Integration"
Cohesion: 0.31
Nodes (7): ref_node_os, buildYtDlpArgs(), isolatedEnvironment(), MAX_YTDLP_STDOUT_BYTES, runYtDlp(), target, tempDirs

### Community 117 - "Social Post Formatting"
Cohesion: 0.33
Nodes (8): SOCIAL_POST_UNTRUSTED_DATA_LABEL, author(), formatSocialPostLine(), PLATFORM_NAMES, quoted(), replies(), SOCIAL_POST_FAILURE_MARKER, post

### Community 118 - "Message Attachment Processing"
Cohesion: 0.27
Nodes (8): Attachment, collection(), extract(), forwardedIn, message(), referenceMessage(), repliedTo, snapshot()

### Community 119 - "Social Video Selection"
Cohesion: 0.36
Nodes (5): PlayableVideo, audioRank(), qualifies(), selectPlayableVideo(), VideoCandidate

### Community 120 - "Episode Memory Storage"
Cohesion: 0.25
Nodes (6): EpisodeCursor, ExtractionQueueJob, EpisodeCursorRow, mapCursor(), MemoryEpisodeRow, pruneExpiredEpisodes()

### Community 121 - "Episode Maintenance Testing"
Cohesion: 0.29
Nodes (6): configMock, mocks, now, seedEpisode(), seedEpisode(), saveMemoryEpisode()

### Community 122 - "LLM Tool Execution"
Cohesion: 0.29
Nodes (3): REMEMBER_TURN, runTurn(), ScriptedLlm

### Community 123 - "Social Post Parsing"
Cohesion: 0.25
Nodes (7): blueskyFixture, blueskyTarget, blueskyVideoFixture, fxTwitterFixture, fxTwitterVideoFixture, redditVideoFixture, xTarget

### Community 124 - "Tool Trigger Testing"
Cohesion: 0.29
Nodes (6): cases, header, ok(), turn(), CaseSetHeader, ToolTriggerCase

### Community 125 - "Analytics View Controls"
Cohesion: 0.33
Nodes (6): topChannels(), addChart(), buildControls(), buildStatsView(), separator(), sinceFor()

### Community 126 - "CLI Chat Interface"
Cohesion: 0.50
Nodes (4): ref_node_readline, handleInput(), main(), username

### Community 127 - "Task Scheduler Testing"
Cohesion: 0.50
Nodes (3): enqueue(), episode(), mocks

### Community 128 - "Memory Replay Testing"
Cohesion: 0.50
Nodes (3): ref_node_child_process, ref_node_fs, snapshotPath

### Community 129 - "Tone Analysis Utilities"
Cohesion: 0.67
Nodes (3): topTones(), isToneKey(), toneCounts()

### Community 134 - "Anime Search Integration"
Cohesion: 0.28
Nodes (7): jikanThrottle(), AnimeResult, JikanAnimeEntry, JikanResponse, searchAnime(), SearchAnimeParams, SearchAnimeResult

### Community 135 - "Turn Context Management"
Cohesion: 0.10
Nodes (27): GenerateOptions, recordSearchCitations(), PrefetchResult, settlePrefetch(), ensureSession(), jevConfig, mocks, applyJevTone() (+19 more)

### Community 136 - "Deployment Operations"
Cohesion: 0.43
Nodes (8): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping), Deployment & Operations

### Community 137 - "Functional Requirements Docs"
Cohesion: 0.12
Nodes (17): FR-10: Graceful Shutdown, FR-2: Mention/Reply Interaction, FR-5: Tone Detection, Functional Requirements, Problem Statement, Product Requirements Document, Project Objectives, Target Users (+9 more)

### Community 141 - "Database Reporting Tools"
Cohesion: 0.21
Nodes (9): better-sqlite3, main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne(), runMigrations() (+1 more)

### Community 143 - "Prompt Safety & Normalization"
Cohesion: 0.29
Nodes (12): buildFactsEnvelope(), buildOverheardBlock(), FACTS_UNTRUSTED_DATA_LABEL, isSafeFactScalar(), MAX_FACT_KEY_LEN, MAX_FACT_VALUE_LEN, MAX_OVERHEARD_BLOCK_LEN, MAX_OVERHEARD_MSG_LEN (+4 more)

### Community 145 - "Memory Interaction Testing"
Cohesion: 0.29
Nodes (5): MEMORY_TOOL_NAMES, CapturingRunner, makeInteraction(), mocks, turn()

## Ambiguous Edges - Review These
- `Second Opinion` → `Rokabot TRD`  [AMBIGUOUS]
  docs/research/jev-integration.md · relation: conceptually_related_to

## Knowledge Gaps
- **632 isolated node(s):** `BuddyRow`, `DailyBuddyHatch`, `DailyHatchRow`, `JevReplayCutoffRow`, `SessionHistoryReplayRow` (+627 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 855 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Second Opinion` and `Rokabot TRD`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `vitest` connect `LLM Integration Testing` to `Buddy System Logic`, `Jev Replay Analysis`, `Database Migration & Legacy`, `Game & Stats Commands`, `Citation & Tone Builder`, `Memory Claims Management`, `Hangman Game Logic`, `Episode Extraction Scheduler`, `Episode Embedding Persistence`, `Activity Analytics Queries`, `Interaction Concurrency Control`, `Reminder Tooling`, `Event & Failure Metrics`, `Model Fallback Testing`, `Date Parsing Utilities`, `Episode Tracking Logic`, `Session Management`, `Session State Testing`, `Memory Shadow Replay`, `Test Run Execution`, `Claim Retrieval Logic`, `Episode Maintenance & Media`, `File & Report Handling`, `Feature Testing Utilities`, `Shutdown & Reliability Reporting`, `Interaction Metrics Testing`, `Memory Extraction Operations`, `Conversational Memory Handling`, `Attachment Token Costing`, `Attachment Budget Limits`, `Model Routing & Hedging`, `Attachment Intake Policies`, `Model Reliability & Recovery`, `Privacy & User Forgetting`, `Activity Chart Rendering`, `Channel Monitoring & Emojis`, `Game Command Handlers`, `Metrics & Monitor Reset`, `Gacha Game Mechanics`, `Utility Tools`, `Search Citation Logic`, `Token Budget Management`, `Memory Verification Judgments`, `Media Digest Processing`, `Core Client Configuration`, `Social Post Integration`, `Quota Diagnostic Tools`, `Social Post URL Parsing`, `Prefetch Measurement Tools`, `Project Configuration`, `File Upload Handling`, `Message Event Handling`, `Episode Retrieval Logic`, `Token Limit Measurement`, `Stats Command Handling`, `Tool Trigger Testing`, `Search Prefetch Shadowing`, `Episode Admission Logic`, `Message Content Extraction`, `Capture Sink Harness`, `System Prompt Architecture`, `Media Token Planning`, `Extraction Schemas`, `Jev System Design`, `Media Content Keys`, `Gemini Reliability Analysis`, `Watch Planning Logic`, `Search Prefetch Logic`, `Media Recall Logic`, `Media Duration Utilities`, `Turn Media Testing`, `Collection Management`, `Slash Command Interaction`, `Trial Record Management`, `YouTube Downloader Integration`, `Social Post Formatting`, `Message Attachment Processing`, `Social Video Selection`, `Episode Memory Storage`, `Episode Maintenance Testing`, `LLM Tool Execution`, `Social Post Parsing`, `Tool Trigger Testing`, `Task Scheduler Testing`, `Memory Replay Testing`, `YAML Configuration Utilities`, `Turn Context Management`, `Database Reporting Tools`, `Prompt Safety & Normalization`, `Memory Interaction Testing`?**
  _High betweenness centrality (0.201) - this node is a cross-community bridge._
- **Why does `getDb()` connect `Database Migration & Legacy` to `Buddy System Logic`, `Tone Analysis Utilities`, `Memory Analytics Views`, `Memory Claims Management`, `Hangman Game Logic`, `Episode Extraction Scheduler`, `Turn Context Management`, `Activity Analytics Queries`, `Interaction Concurrency Control`, `Database Reporting Tools`, `Reminder Tooling`, `Event & Failure Metrics`, `Memory Interaction Testing`, `Episode Tracking Logic`, `Session State Testing`, `Memory Shadow Replay`, `Claim Retrieval Logic`, `Episode Maintenance & Media`, `File & Report Handling`, `Feature Testing Utilities`, `Shutdown & Reliability Reporting`, `Memory Extraction Operations`, `Privacy & User Forgetting`, `Channel Monitoring & Emojis`, `Identity Resolution`, `Game Command Handlers`, `Metrics & Monitor Reset`, `Obsidian Memory Export`, `Gacha Game Mechanics`, `Utility Tools`, `Episode Retrieval Logic`, `Capture Sink Harness`, `Media Recall Logic`, `Collection Management`, `Episode Memory Storage`, `Episode Maintenance Testing`, `Analytics View Controls`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `config` connect `Core Client Configuration` to `Buddy System Logic`, `Database Migration & Legacy`, `Memory Claims Management`, `Turn Context Management`, `Hangman Game Logic`, `Episode Embedding Persistence`, `Interaction Concurrency Control`, `Reminder Tooling`, `Date Parsing Utilities`, `Episode Tracking Logic`, `Session Management`, `Session State Testing`, `Memory Shadow Replay`, `Test Run Execution`, `Claim Retrieval Logic`, `Episode Maintenance & Media`, `File & Report Handling`, `Media Memory Rendering`, `Interaction Metrics Testing`, `Memory Extraction Operations`, `Anime Schedule Lookup`, `Attachment Token Costing`, `Model Fallback Logic`, `Attachment Budget Limits`, `Model Reliability & Recovery`, `Channel Monitoring & Emojis`, `Game Command Handlers`, `Obsidian Memory Export`, `Utility Tools`, `Token Budget Management`, `Memory Verification Judgments`, `System Requirements & Constraints`, `Social Post Integration`, `Quota Diagnostic Tools`, `Network & Smoke Tests`, `File Upload Handling`, `Episode Retrieval Logic`, `Watch & Request Formatting`, `Episode Admission Logic`, `Capture Sink Harness`, `Environment Configuration`, `Jev System Design`, `Media Content Keys`, `Media Recall Logic`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `createMessageHandler()` (e.g. with `.canAdmitCalls()` and `.reserveCalls()`) actually correct?**
  _`createMessageHandler()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BuddyRow`, `DailyBuddyHatch`, `DailyHatchRow` to the rest of the system?**
  _632 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Buddy System Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.10420168067226891 - nodes in this community are weakly interconnected._