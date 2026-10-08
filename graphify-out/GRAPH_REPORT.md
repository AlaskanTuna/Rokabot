# Graph Report - graph  (2026-10-08)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2822 nodes · 8174 edges · 134 communities (126 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 262 edges (avg confidence: 0.88)
- Token cost: 13,731 input · 1,429 output

## Graph Freshness
- Built from commit: `f87347fe`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Daily Buddy System
- Jev Replay Analysis
- Memory Migration Utilities
- Discord Command Handling
- Biome Code Formatting
- Analytics View Rendering
- Message Builder Utilities
- Memory Claims Management
- Hangman Game Logic
- Episode Persistence Scheduler
- Episode Embedding Management
- Activity Query Analytics
- Discord Component Specifications
- Interaction Handling Logic
- Project Architecture Docs
- Reminder Tool Commands
- Metrics and Diagnostics
- Social Reply Fetching
- Guild Fact Calendar
- Episode Tracking Logic
- Development Tooling Configuration
- Session Management Service
- Trial Record Logging
- Memory Replay Evaluation
- Test Session Orchestration
- Memory Retrieval Logic
- Transcript Analysis Tools
- Project Dependencies
- Episode Maintenance Tasks
- Rate Limiting Logic
- Bug Report Storage
- TypeScript Compiler Configuration
- Media Token Planning
- Discord Bot Requirements
- Build and Lint Scripts
- Memory Recall Scoring
- Database Shutdown Reliability
- Memory Database Management
- Episode Extraction Operations
- Conversational Tone Detection
- Anime Schedule Lookup
- Attachment Token Measurement
- Model Fallback Configuration
- In-Flight Attachment Limits
- LLM Fallback Routing
- Attachment Intake Policies
- Gemini Reliability Handling
- Live Environment Testing
- Fact Embedding Processing
- Data Visualization Charts
- Session and Monitor Management
- Inline Data LLM Integration
- TypeScript Configuration
- Game Command Handlers
- Game Test Utilities
- Extraction Scheduler Logic
- Obsidian Vault Export
- Gacha Pet System
- Utility Tool Definitions
- Web Search Tooling
- Token Budget Management
- Jev Judgment Configuration
- Media Digest Generation
- Project Documentation
- Discord Client Lifecycle
- Bluesky Thread Reader
- Predicate Logic Definitions
- Bluesky Data Parsing
- Quota Diagnostic Tools
- Social URL Parsing
- Performance Measurement Tools
- Project Metadata Configuration
- Network Error Recovery
- File Upload Handling
- Reply Outcome Tracking
- Payload Rendering Utilities
- Docker Container Configuration
- Episode Retrieval System
- Token Limit Reporting
- Guild View Queries
- Audio Video Processing
- Threads API Integration
- Search Prefetch Reporting
- Episode Admission Logic
- Message Content Extraction
- Failure Handling Strategy
- Test Capture Sink
- Agent Configuration Settings
- Social Post Research
- System Prompt Assembly
- Discord Attachment Reporting
- Extraction Schema Definitions
- Jev Integration Client
- Content Key Management
- Memory Claim Database Schema
- Transcript Replay Metrics
- Claim Extraction Verification
- Expression and Tone Management
- Model Fallback Logic
- Search Prefetch Logic
- Turn Context Management
- Discord Interaction Mocks
- Channel Media Recall
- Memory Claim Architecture
- Media Duration Processing
- Media Upload Handling
- Commit Style Linting
- Buddy Collection Management
- Roka Bot Metadata
- Discord Stats Error Handling
- Model Reliability Fallbacks
- Reddit Feed Parsing
- Timezone Utility Functions
- Documentation Style Rules
- Git Commit Conventions
- Coding Style Guidelines
- Social Media Integration
- Social Post Formatting
- Message Attachment Handling
- Emoji Reaction Logic
- SQLite Database Management
- Discord Channel Visibility
- LLM Tool Execution
- Report Command Testing
- Social Reply Reader
- Sprite Optimization
- CLI Chat Interface
- Linting Configuration
- YAML Configuration Utilities
- Anime Search API
- Identity Name Resolution
- Deployment and Operations
- Report Generation CLI
- Prompt Safety Validation

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 203 edges
2. `vitest` - 159 edges
3. `config` - 90 edges
4. `logger` - 58 edges
5. `createMessageHandler()` - 50 edges
6. `createInteractionHandler()` - 46 edges
7. `generateResponse()` - 44 edges
8. `discord.js` - 43 edges
9. `createTurnContext()` - 35 edges
10. `closeDb()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Attachment Bytes Do Not Live in History` --conceptually_related_to--> `generateResponse()`  [INFERRED]
  docs/trd.md → src/agent/roka.ts
- `Attachment Types and Their Ceilings` --implements--> `GEMINI_SPELLINGS`  [INFERRED]
  docs/trd.md → src/agent/attachmentLimits.ts
- `WindowMessage` --implements--> `WindowMessage`  [INFERRED]
  docs/trd.md → src/session/types.ts
- `Jev Design (Per-Feature Modes)` --implements--> `JevMode`  [INFERRED]
  docs/research/jev-integration.md → src/config.ts
- `Jev Judgments` --implements--> `JevMode`  [INFERRED]
  docs/trd.md → src/config.ts

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

## Communities (134 total, 8 thin omitted)

### Community 0 - "Daily Buddy System"
Cohesion: 0.14
Nodes (28): SQLite Database Reference, BuddyRow, DailyBuddyHatch, DailyHatchRow, generateBuddy(), generateName(), generatePersonality(), getDailyHatchRow() (+20 more)

### Community 1 - "Jev Replay Analysis"
Cohesion: 0.12
Nodes (25): ref_node_url, parseReplayArgs(), runReplayCli(), TurnJudgmentInput, agreement(), buildConfusionMatrix(), buildProbabilityBins(), buildReplayTurn() (+17 more)

### Community 2 - "Memory Migration Utilities"
Cohesion: 0.26
Nodes (14): attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow, legalScopes() (+6 more)

### Community 3 - "Discord Command Handling"
Cohesion: 0.13
Nodes (19): FR-1: Slash Command Interaction, Features, discord.js, ALLOWED_MEDIA_TYPES, askCommand, command, gachaCommand, gameCommands (+11 more)

### Community 4 - "Biome Code Formatting"
Cohesion: 0.05
Nodes (37): useLiteralKeys, files, ignore, formatter, enabled, indentStyle, indentWidth, lineWidth (+29 more)

### Community 5 - "Analytics View Rendering"
Cohesion: 0.11
Nodes (37): hexColor(), renderMoodDonut(), titleCase(), busiestChannel, mostUsedTool(), retrySummary, tokenTotals, topChannels() (+29 more)

### Community 6 - "Message Builder Utilities"
Cohesion: 0.10
Nodes (23): ReplyOutcome, clampToBudget(), fitCitations(), sourceHost(), buildToolFooter(), footerLeads, MAX_TOOL_FOOTER_CHARS, REPLY_OUTCOME_LABELS (+15 more)

### Community 7 - "Memory Claims Management"
Cohesion: 0.11
Nodes (41): Claims Tenancy Model, evicted, activateClaim(), appendEvidenceInTransaction(), assertClaimInTransaction(), assertGuildClaim(), assertSafeValue(), assertWritableGuild() (+33 more)

### Community 8 - "Hangman Game Logic"
Cohesion: 0.18
Nodes (23): games Config Section, buildHangmanBody(), handleHangmanGuess(), handleHangmanStart(), HANGMAN_COLORS, saveHangmanScore(), src_games_data_hangmanwords, src_games_data_hangmanwords_hangman_words (+15 more)

### Community 9 - "Episode Persistence Scheduler"
Cohesion: 0.11
Nodes (26): persistEpisodeResult(), EpisodeRunResult, drainOnce(), finishJob(), inFlightGuilds, inFlightTasks, orderedGuilds(), runJob() (+18 more)

### Community 10 - "Episode Embedding Management"
Cohesion: 0.15
Nodes (14): response(), embedEpisodeText(), EpisodeEmbeddingRole, getEmbeddingClient(), resetEpisodeEmbeddingClientForTest(), mocks, embedQuery(), RecallUserResult (+6 more)

### Community 11 - "Activity Query Analytics"
Cohesion: 0.10
Nodes (24): activityByDay(), ChannelCount, CountByDay, CountByHour, CountByOutcome, CountByPredicate, CountByTone, CountByTrigger (+16 more)

### Community 12 - "Discord Component Specifications"
Cohesion: 0.05
Nodes (48): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+40 more)

### Community 13 - "Interaction Handling Logic"
Cohesion: 0.14
Nodes (35): isMonitored(), markActive(), text(), asksAboutReplies(), withReplyOutcomes(), withSearchCitations(), startTurnEntryWork(), isChannelBusy() (+27 more)

### Community 14 - "Project Architecture Docs"
Cohesion: 0.13
Nodes (22): Architecture (AGENTS.md), Critical Do-Nots, Project (Rokabot description), Reference Docs (AGENTS.md), discord Config Section, gemini Config Section, logging Config Section, memory Config Section (+14 more)

### Community 15 - "Reminder Tool Commands"
Cohesion: 0.13
Nodes (31): ref_discordjs_builders, listRemindersTool, cancelReminder(), listReminders(), setReminder(), SetReminderParams, mocks, createToolCommandHandler() (+23 more)

### Community 16 - "Metrics and Diagnostics"
Cohesion: 0.17
Nodes (16): Failure Diagnostics Table, countMemoryEvents(), ExtractionEventInput, FailureDiagnosticInput, getExtractionEventStatement(), getFailureDiagnosticStatement(), getMemoryEventStatement(), getResponseEventStatement() (+8 more)

### Community 17 - "Social Reply Fetching"
Cohesion: 0.25
Nodes (26): array(), nonNegativeInteger(), object(), bilibiliAid(), fetchBilibiliReplies(), fetchBlueskyReplies(), BROWSER_USER_AGENT, compactReplyText() (+18 more)

### Community 18 - "Guild Fact Calendar"
Cohesion: 0.17
Nodes (21): GuildFactDate, addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth() (+13 more)

### Community 19 - "Episode Tracking Logic"
Cohesion: 0.15
Nodes (21): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), resetEpisodeTrackerForTest(), scheduleLull() (+13 more)

### Community 20 - "Development Tooling Configuration"
Cohesion: 0.15
Nodes (13): devDependencies, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, husky, lint-staged, pino-pretty, prettier (+5 more)

### Community 21 - "Session Management Service"
Cohesion: 0.10
Nodes (14): @google/adk, attachmentMarker(), abortActiveTurns(), clearSessionErrorCount(), idleTimers, incrementSessionErrorCount(), isStrippable(), rehydrationSuppressed (+6 more)

### Community 22 - "Trial Record Logging"
Cohesion: 0.12
Nodes (21): APP_NAME, sessionService, emitTrialRecord(), formatTrialRecord(), TrialRecord, record, channels, header (+13 more)

### Community 23 - "Memory Replay Evaluation"
Cohesion: 0.17
Nodes (15): asClaim(), asScenario(), evaluateMemoryShadow(), FixtureClaim, loadReplaySet(), MemoryShadowReport, percentile95(), REPLAY_PATH (+7 more)

### Community 24 - "Test Session Orchestration"
Cohesion: 0.14
Nodes (18): generateResponse(), __setTestRunTurnFactory(), steeringForRequest, TestRunTurn, destroySession(), resetIdleTimer(), droppedFor(), inlineFor() (+10 more)

### Community 25 - "Memory Retrieval Logic"
Cohesion: 0.10
Nodes (32): Where Rokabot Decides Today, GPT-6-Astra, Jev Rollout Plan, Second Opinion, Who-Is-Who Resolver, Bounded Retrieval Contract, GuildMemoryClaim, touchRecalled() (+24 more)

### Community 26 - "Transcript Analysis Tools"
Cohesion: 0.17
Nodes (21): detectTone(), fixturePath(), loadTranscript(), main(), parseTranscriptLine(), renderTokenTable(), requestMessageContent(), runTranscript() (+13 more)

### Community 27 - "Project Dependencies"
Cohesion: 0.15
Nodes (13): dependencies, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml, @napi-rs/canvas (+5 more)

### Community 28 - "Episode Maintenance Tasks"
Cohesion: 0.13
Nodes (30): EpisodeMaintenanceReport, pruneEpisodesAndReembed(), searchClaims(), configMock, mocks, now, seedMedia(), seedMedia() (+22 more)

### Community 29 - "Rate Limiting Logic"
Cohesion: 0.10
Nodes (17): FR-6: Rate Limiting, Discord Gateway Layer, RateLimiterConfig, RPM-Budget Accounting, A Turn Reserves the Calls It May Make, The Two Limiters Bound Their Windows Differently, modelCallsForRequest, DECLINE_MESSAGES (+9 more)

### Community 30 - "Bug Report Storage"
Cohesion: 0.15
Nodes (14): BugReportContext, BugReportInput, BugReportType, captureSnapshot(), countReportsSince(), MAX_CONTEXT_JSON_BYTES, queryRecentRows(), ReportAttachmentMetadata (+6 more)

### Community 31 - "TypeScript Compiler Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "Media Token Planning"
Cohesion: 0.13
Nodes (30): durationFromTokens(), equalBins(), estimateMediaTokens(), FPS_LADDER, HalfWatch, HALVES_MAX_DURATION_SEC, HALVES_MIN_DURATION_SEC, HalvesPlan (+22 more)

### Community 33 - "Discord Bot Requirements"
Cohesion: 0.14
Nodes (21): Discord Install Requirements: bot Scope Is Load-Bearing, Guild Permissions Are Derived From the API Surface, There Is No Build-Time Pin, and That Is Deliberate, assert(), fail(), main(), pass(), results (+13 more)

### Community 34 - "Build and Lint Scripts"
Cohesion: 0.07
Nodes (28): scripts, build, dev, dev:quiet, export:vault, format, format:check, harness (+20 more)

### Community 35 - "Memory Recall Scoring"
Cohesion: 0.12
Nodes (32): cosineSimilarity(), byScore(), cooldownPenalty(), coreRank(), countKind(), Ctx, factBoost(), FactClaim (+24 more)

### Community 36 - "Database Shutdown Reliability"
Cohesion: 0.13
Nodes (19): ExtractionOutput, OperationApplicationReport, beginShutdown(), isShuttingDown(), resetForTest(), options(), closeDb(), EpisodeReplayContext (+11 more)

### Community 37 - "Memory Database Management"
Cohesion: 0.15
Nodes (21): claimCount(), seedLegacyRow(), tableExists(), corrupt(), activeClaimCount(), chatsSince(), distinctRememberedUsers(), episodeCount() (+13 more)

### Community 38 - "Episode Extraction Operations"
Cohesion: 0.13
Nodes (27): admitEpisode(), parseExtractionOutput(), episodePrompt(), EpisodeWriteOp, extractEpisode(), formatEpisodeLine(), getClient(), GuildWriteOperation (+19 more)

### Community 39 - "Conversational Tone Detection"
Cohesion: 0.26
Nodes (8): FR-3: Per-Channel Conversational Memory, FR-5: Tone Detection, ChannelSession, WindowMessage, detectToneWithSource(), TONE_PATTERNS, ChannelSession, WindowMessage

### Community 40 - "Anime Schedule Lookup"
Cohesion: 0.15
Nodes (24): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleParams, GetAnimeScheduleResult, getCurrentSeason() (+16 more)

### Community 41 - "Attachment Token Measurement"
Cohesion: 0.15
Nodes (19): PDF Token Cost Measurement, Attachment Token Admission, measureAttachmentTokens(), needsMeasuring(), GEMINI_IMAGE_TOKENS, geminiMimeType(), downloadAttachment(), prepareAttachments() (+11 more)

### Community 42 - "Model Fallback Configuration"
Cohesion: 0.11
Nodes (25): fallback Config Section, ModelScope Qwen Fallback, Tech Stack (README), ref_node_async_hooks, AnswerModel, attachmentKind(), attachmentMarker(), ChatMessage (+17 more)

### Community 43 - "In-Flight Attachment Limits"
Cohesion: 0.13
Nodes (18): RFC-3003, Global In-Flight Byte Budget, Global In-Flight Attachment Budget, GEMINI_SPELLINGS, isStreamedUpload(), MAX_AUDIO_SIZE_BYTES, MAX_DOCUMENT_SIZE_BYTES, MAX_IMAGE_SIZE_BYTES (+10 more)

### Community 44 - "LLM Fallback Routing"
Cohesion: 0.08
Nodes (15): The Fallback Model, createRokaModel(), ModelRoute, modelRouteForRequest, ModelScopeLlm, RoutedLlm, adapter(), configState (+7 more)

### Community 45 - "Attachment Intake Policies"
Cohesion: 0.19
Nodes (20): attachment_url, Audio Intake Recommendation, PDF Intake Recommendation, Video Low Resolution Recommendation, Attachment Types and Their Ceilings, requestCarriesVideo(), ALLOWED_AUDIO_TYPES, ALLOWED_DOCUMENT_TYPES (+12 more)

### Community 46 - "Gemini Reliability Handling"
Cohesion: 0.09
Nodes (33): BackoffOptions, classifyGeminiFailure(), classifyMarker(), computeBackoff(), DEFAULT_MAX_BACKOFF_MS, extractGeminiStatus(), FailureKind, GeminiFailureResult (+25 more)

### Community 47 - "Live Environment Testing"
Cohesion: 0.09
Nodes (28): CASE_SETS, fixturePath, header, rememberFixturePath, searchWebFixturePath, temporaryDirectories, testCase, asCase() (+20 more)

### Community 48 - "Fact Embedding Processing"
Cohesion: 0.10
Nodes (25): delay(), embedPendingFacts(), sweep(), renderFactSentence(), normalizeKey(), sensitiveFactReason, configMock, mocks (+17 more)

### Community 49 - "Data Visualization Charts"
Cohesion: 0.33
Nodes (10): @napi-rs/canvas, degreeColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), ROKA_CHART_PALETTE, TONE_EMOJI (+2 more)

### Community 50 - "Session and Monitor Management"
Cohesion: 0.16
Nodes (14): ref_node_http, cleanupExpired(), monitoredChannels, resetMonitor(), restoreMonitoredChannels(), waitForInFlightExtractions(), destroyAllSessions(), stopReminderScheduler() (+6 more)

### Community 51 - "Inline Data LLM Integration"
Cohesion: 0.29
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 52 - "TypeScript Configuration"
Cohesion: 0.22
Nodes (8): ./tsconfig.json, compilerOptions, noEmit, rootDir, types, exclude, extends, include

### Community 53 - "Game Command Handlers"
Cohesion: 0.25
Nodes (16): createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleBuddyLeaderboard(), handleHangmanGuide(), handleLeaderboard(), buildGameContainer(), buildTimeoutContainer() (+8 more)

### Community 54 - "Game Test Utilities"
Cohesion: 0.12
Nodes (33): ref_node_module, assert(), fail(), main(), makeMessage(), pass(), results, TestResult (+25 more)

### Community 55 - "Extraction Scheduler Logic"
Cohesion: 0.24
Nodes (8): resetForTest(), stopExtractionScheduler(), configMock, enqueue(), episode(), mocks, responseEventCount(), transcript

### Community 56 - "Obsidian Vault Export"
Cohesion: 0.13
Nodes (19): Browsing Memory in Obsidian, Getting Started, npm run test:live Gate, js-yaml, ActiveClaimSubject, ActiveGuildSubject, ExportedClaim, ExportedGuildClaim (+11 more)

### Community 57 - "Gacha Pet System"
Cohesion: 0.19
Nodes (24): handleGachaMention(), statBar(), formatBuddySummary(), formatHatchTimeRemaining(), handleBuddyStats(), handleBuddyView(), handleHatch(), handlePet() (+16 more)

### Community 58 - "Utility Tool Definitions"
Cohesion: 0.08
Nodes (40): Tool Footer, SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL, flipCoin(), FlipCoinResult, ForgetUserParams, cityToTimezone, getCurrentTime(), GetCurrentTimeParams (+32 more)

### Community 59 - "Web Search Tooling"
Cohesion: 0.13
Nodes (9): runSearchTurn(), ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS, searchWebTool, searchWeb(), SearchWebParams, TavilyResponse (+1 more)

### Community 60 - "Token Budget Management"
Cohesion: 0.19
Nodes (12): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, canAffordAttachments(), chargeTokens(), drain(), lastDrain, remainingTokensThisMinute(), __resetTokenBudgetForTest() (+4 more)

### Community 61 - "Jev Judgment Configuration"
Cohesion: 0.13
Nodes (17): jev Config Section, Jev Shadow Mode, BoundedAlias, boundedAliases(), judgeEpisodeAdmission(), judgeEpisodeOperations(), judgeTurn(), LOOKUP_QUESTION (+9 more)

### Community 62 - "Media Digest Generation"
Cohesion: 0.13
Nodes (28): boundedString(), coverageLine(), cutAtWord(), formatClock(), frameInterval(), isRecord(), MEDIA_DIGEST_HEADING, MEDIA_OBSERVATIONS_SCHEMA (+20 more)

### Community 63 - "Project Documentation"
Cohesion: 0.08
Nodes (29): FR-10: Graceful Shutdown, FR-2: Mention/Reply Interaction, FR-7: Error Handling, FR-8: Response Formatting, FR-9: Docker Deployment, Functional Requirements, Problem Statement, Product Requirements Document (+21 more)

### Community 64 - "Discord Client Lifecycle"
Cohesion: 0.22
Nodes (11): Tech Stack (AGENTS.md), createClient(), buildCommandBody(), handleReady(), mocks, setToken(), getStatusForHour(), startStatusCycler() (+3 more)

### Community 65 - "Bluesky Thread Reader"
Cohesion: 0.10
Nodes (22): resolveBlueskyDid(), ParsedBlueskyThread, isAbort(), replyReader, ReplyReaderDependencies, ReplyLookup, failure(), initializeSocialPosts() (+14 more)

### Community 66 - "Predicate Logic Definitions"
Cohesion: 0.16
Nodes (14): baseSalienceOf(), cardinalityOf(), GUILD_PREDICATES, GuildPredicateId, isKnownPredicate(), MemoryPredicateId, normalizePredicate(), predicate() (+6 more)

### Community 67 - "Bluesky Data Parsing"
Cohesion: 0.13
Nodes (29): base(), BlueskyBlob, blueskyQuote(), capped(), compact(), date(), finiteNumber(), headers() (+21 more)

### Community 68 - "Quota Diagnostic Tools"
Cohesion: 0.12
Nodes (18): BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey(), DIAGNOSTIC_TIMEOUT_MS, errorText(), KEY_IS_LIVE, OUTPACING_THE_CAP, SPENT_FOR_THE_DAY (+10 more)

### Community 69 - "Social URL Parsing"
Cohesion: 0.14
Nodes (26): vitest, ReplyFetchContext, hostMatches(), HOSTS, parseSocialPostUrl(), platformForHost(), target(), youtubeStartSec() (+18 more)

### Community 70 - "Performance Measurement Tools"
Cohesion: 0.21
Nodes (9): main(), MeasurementAnomaly, Options, parseOptions(), percentile(), PrefetchMeasurementCase, PrefetchMeasurementSummary, PrefetchMeasurementTrial (+1 more)

### Community 71 - "Project Metadata Configuration"
Cohesion: 0.10
Nodes (20): description, engines, node, main, name, type, version, @biomejs/biome (+12 more)

### Community 72 - "Network Error Recovery"
Cohesion: 0.13
Nodes (18): ref_node_dns, ref_node_net, ErrorRecoveryPlugin, main(), results, runQuery(), test(), TestResult (+10 more)

### Community 73 - "File Upload Handling"
Cohesion: 0.17
Nodes (9): countedBody(), deleteFile(), FileResource, getFile(), sleep(), streamToFiles(), UploadedFile, videoDurationSec() (+1 more)

### Community 74 - "Reply Outcome Tracking"
Cohesion: 0.07
Nodes (23): outcomeForTurn, recordReplyOutcome(), citationsForTurn, recordSearchCitations(), SearchCitation, attachmentOptionName(), MAX_ATTACHMENTS, expectedPolicy (+15 more)

### Community 75 - "Payload Rendering Utilities"
Cohesion: 0.36
Nodes (12): asObject(), asObjects(), chunkLabel(), componentDetails(), walk(), isComponentsV2Payload(), PayloadObject, renderEmbeds() (+4 more)

### Community 76 - "Docker Container Configuration"
Cohesion: 0.20
Nodes (10): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+2 more)

### Community 77 - "Episode Retrieval System"
Cohesion: 0.13
Nodes (23): buildEpisodeRecallBlock(), formatEpisodeRecallBlock(), RecalledEpisode, recallEpisodes(), selectEpisodesWithinBudget(), toRecalledEpisode(), seedEpisode(), configMock (+15 more)

### Community 78 - "Token Limit Reporting"
Cohesion: 0.30
Nodes (10): dotenv, Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION, mimeForPath(), resolveKey() (+2 more)

### Community 79 - "Guild View Queries"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "Audio Video Processing"
Cohesion: 0.11
Nodes (19): @google/genai, mocks, countUriTokens(), elapsedSince(), getClient(), instructions(), mediaPart(), messageOf() (+11 more)

### Community 81 - "Threads API Integration"
Cohesion: 0.20
Nodes (12): fetchThreadsReplies(), firstCandidate(), firstVideoUrl(), hasAudio(), JsonObject, mediaResults(), parseThreadsPage(), replyNodes() (+4 more)

### Community 82 - "Search Prefetch Reporting"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "Episode Admission Logic"
Cohesion: 0.22
Nodes (8): liveAdapters(), AdmissionResult, isTrivial(), normalize(), precheckEpisode(), SENSITIVE_PATTERNS, mocks, ExtractionEpisode

### Community 84 - "Message Content Extraction"
Cohesion: 0.14
Nodes (25): ImageAttachment, isSupportedMedia(), describeEmbed(), describeForwardedSnapshots(), describePoll(), embedMatchesSocialPost(), extractComponentMedia(), walk() (+17 more)

### Community 85 - "Failure Handling Strategy"
Cohesion: 0.12
Nodes (18): Fallback Model (runbook), ADK Error Delivery Constraint, Attachment Bytes Do Not Live in History, Concurrency & Lifecycle Under Retry, Gemini Failure Taxonomy, Gemini API, Roka Agent (ADK), Session Manager (+10 more)

### Community 86 - "Test Capture Sink"
Cohesion: 0.08
Nodes (18): ref_node_path, __resetTestRunTurnFactory(), CaptureInput, CaptureKind, CaptureRecord, CaptureSink, createCaptureSink(), benchmarkTranscript (+10 more)

### Community 87 - "Agent Configuration Settings"
Cohesion: 0.13
Nodes (12): Configuration (AGENTS.md), envString(), episodeMaxMessages, maxJitterAchievableRetries, memoryEnum(), MemoryPrivacy, MemoryRecallMode, minJitterAchievableRetries (+4 more)

### Community 88 - "Social Post Research"
Cohesion: 0.29
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "System Prompt Assembly"
Cohesion: 0.19
Nodes (20): FR-4: Layered Personality Prompts, Prompt System, AssemblerInput, AssemblerInput, assembleSystemPrompt(), buildContextPrompt(), getTimeOfDay(), CORE_PROMPT (+12 more)

### Community 90 - "Discord Attachment Reporting"
Cohesion: 0.23
Nodes (15): composePrompt(), isAllowedDiscordCdnUrl(), AttachmentCopyError, copyAttachment(), displayName(), handleReportCommand(), moduleDirectory, packageMetadata (+7 more)

### Community 91 - "Extraction Schema Definitions"
Cohesion: 0.06
Nodes (32): AddOperationSchema, calendarDateProperties, datedGuildPredicates, EXTRACTION_RESPONSE_SCHEMA, ExtractionOutputSchema, ExtractionSubject, GuildAddOperationSchema, GuildExtractionOp (+24 more)

### Community 92 - "Jev Integration Client"
Cohesion: 0.26
Nodes (11): Jev Design (Per-Feature Modes), Jev Integration (Research Doc), Jev Judgments, Jev Memory Admission, @typesafe-ai/sdk, undici, fetchWithKeepAlive(), getJevClient() (+3 more)

### Community 93 - "Content Key Management"
Cohesion: 0.31
Nodes (10): ref_node_crypto, bytesContentKey(), DISCORD_CDN_HOSTS, discordAttachmentContentKey(), postContentKey(), requireId(), youtubeContentKey(), playableVideo() (+2 more)

### Community 94 - "Memory Claim Database Schema"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 95 - "Transcript Replay Metrics"
Cohesion: 0.20
Nodes (13): ref_node_perf_hooks, argumentsFrom(), estimatedTokens(), inputText(), measure(), loadTranscriptLines(), main(), offlineAdapters() (+5 more)

### Community 96 - "Claim Extraction Verification"
Cohesion: 0.15
Nodes (7): ExtractionOp, assertClaim(), pinClaim(), fact(), claim(), mocks, seedSubject()

### Community 97 - "Expression and Tone Management"
Cohesion: 0.16
Nodes (12): Expressions & Tones, ToneKey, ToneRule, EXPRESSION_URLS, getExpressionUrl(), lastExpressionByTone, __resetExpressionState(), TONE_EXPRESSIONS (+4 more)

### Community 98 - "Model Fallback Logic"
Cohesion: 0.18
Nodes (8): __resetModelFallbackForTest(), TurnOutcome, existingFallbackReplies, mocks, mutableFallbackConfig, mutableGeminiConfig, mutableJevConfig, originalConfig

### Community 99 - "Search Prefetch Logic"
Cohesion: 0.17
Nodes (13): TurnJudgment, decidePrefetch(), JevPrefetchMode, PREFETCH_TOOL_NAME, PrefetchContext, PrefetchDecision, PrefetchOutcome, runPrefetchForJudgment() (+5 more)

### Community 100 - "Turn Context Management"
Cohesion: 0.22
Nodes (5): entryWork(), jevConfig, mocks, turnOptions(), turnWith()

### Community 102 - "Channel Media Recall"
Cohesion: 0.16
Nodes (16): channelVisibility, registerChannelVisibility(), resetChannelVisibilityForTest(), UNKNOWN, buildMediaRecallBlock(), formatMediaRecallBlock(), RecalledMedia, recallMedia() (+8 more)

### Community 103 - "Memory Claim Architecture"
Cohesion: 0.36
Nodes (8): Claim Lifecycle, Claims Memory Architecture, extraction_queue Table, memory_claim_fts Table, memory_claim Table, memory_events Table, memory_evidence Table, Vault Export

### Community 104 - "Media Duration Processing"
Cohesion: 0.29
Nodes (9): Box, movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0(), mvhdV1() (+1 more)

### Community 105 - "Media Upload Handling"
Cohesion: 0.20
Nodes (5): digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf()

### Community 107 - "Buddy Collection Management"
Cohesion: 0.35
Nodes (9): buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount(), handleBuddyCollection(), { getBuddyCollection }, BuddyData, getBuddyCollection() (+1 more)

### Community 108 - "Roka Bot Metadata"
Cohesion: 0.67
Nodes (3): Maniwa Roka, Rokabot, Senren*Banka

### Community 109 - "Discord Stats Error Handling"
Cohesion: 0.31
Nodes (9): IGNORABLE_CODES, isIgnorableDiscordError(), handleStatsCommand(), isStatsView(), logStatsError(), selectionFor(), sendStatsError(), STATS_VIEWS (+1 more)

### Community 110 - "Model Reliability Fallbacks"
Cohesion: 0.33
Nodes (6): Deliberately Not Done, Gemini-Outage Fallback (Qwen3.5), Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk, Jev Turn Judgment

### Community 111 - "Reddit Feed Parsing"
Cohesion: 0.56
Nodes (9): decodeEntities(), entryAuthor(), entryContent(), feedEntries(), feedField(), htmlToText(), NAMED_ENTITIES, parseRedditFeedPost() (+1 more)

### Community 112 - "Timezone Utility Functions"
Cohesion: 0.35
Nodes (9): loadGetLocalHour(), loadTimezoneModule(), unpinnedHour(), dateString(), dateTimeParts(), getLocalDate(), localDateStartEpoch(), localDateTimeFormatter() (+1 more)

### Community 116 - "Social Media Integration"
Cohesion: 0.14
Nodes (10): ref_node_child_process, ref_node_fs, ref_node_os, createSocialPostViewer(), buildYtDlpArgs(), MAX_YTDLP_STDOUT_BYTES, settings, target (+2 more)

### Community 117 - "Social Post Formatting"
Cohesion: 0.48
Nodes (6): SOCIAL_POST_UNTRUSTED_DATA_LABEL, author(), formatSocialPostLine(), PLATFORM_NAMES, quoted(), replies()

### Community 118 - "Message Attachment Handling"
Cohesion: 0.24
Nodes (9): clip(), Attachment, collection(), extract(), forwardedIn, message(), referenceMessage(), repliedTo (+1 more)

### Community 119 - "Emoji Reaction Logic"
Cohesion: 0.27
Nodes (8): emoji Config Section, cleanupExpiredCooldowns(), cooldowns, findMatchingRule(), REACTION_RULES, ReactionRule, resetCooldowns(), shouldReact()

### Community 120 - "SQLite Database Management"
Cohesion: 0.29
Nodes (5): better-sqlite3, createTables(), runMigrations(), DatabaseModule, { info }

### Community 121 - "Discord Channel Visibility"
Cohesion: 0.31
Nodes (4): ChannelVisibilityResolver, createChannelVisibilityResolver(), everyoneRole, resolverFor()

### Community 122 - "LLM Tool Execution"
Cohesion: 0.25
Nodes (4): REMEMBER_TURN, runTurn(), ScriptedLlm, rememberUserTool

### Community 124 - "Social Reply Reader"
Cohesion: 0.50
Nodes (4): createReplyReader(), FOUND, readerWith(), SETTINGS

### Community 126 - "CLI Chat Interface"
Cohesion: 0.50
Nodes (4): ref_node_readline, handleInput(), main(), username

### Community 127 - "Linting Configuration"
Cohesion: 0.67
Nodes (3): lint-staged, *.{json,md,yml,yaml}, *.{ts,js}

### Community 134 - "Anime Search API"
Cohesion: 0.28
Nodes (7): jikanThrottle(), AnimeResult, JikanAnimeEntry, JikanResponse, searchAnime(), SearchAnimeParams, SearchAnimeResult

### Community 135 - "Identity Name Resolution"
Cohesion: 0.07
Nodes (48): buildNameIndex(), escapeRegex(), isAscii(), MATCH_PRIORITY, MatchKind, NameCandidate, NameIndex, nicknameRows() (+40 more)

### Community 136 - "Deployment and Operations"
Cohesion: 0.26
Nodes (12): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping), Deployment & Operations (+4 more)

### Community 141 - "Report Generation CLI"
Cohesion: 0.43
Nodes (6): main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne()

### Community 143 - "Prompt Safety Validation"
Cohesion: 0.29
Nodes (12): buildFactsEnvelope(), buildOverheardBlock(), FACTS_UNTRUSTED_DATA_LABEL, isSafeFactScalar(), MAX_FACT_KEY_LEN, MAX_FACT_VALUE_LEN, MAX_OVERHEARD_BLOCK_LEN, MAX_OVERHEARD_MSG_LEN (+4 more)

## Ambiguous Edges - Review These
- `Rokabot TRD` → `Second Opinion`  [AMBIGUOUS]
  docs/research/jev-integration.md · relation: conceptually_related_to

## Knowledge Gaps
- **672 isolated node(s):** `BuddyRow`, `DailyBuddyHatch`, `DailyHatchRow`, `JevReplayCutoffRow`, `SessionHistoryReplayRow` (+667 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 910 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Rokabot TRD` and `Second Opinion`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `vitest` connect `Social URL Parsing` to `Daily Buddy System`, `Jev Replay Analysis`, `Discord Command Handling`, `Message Builder Utilities`, `Memory Claims Management`, `Hangman Game Logic`, `Episode Persistence Scheduler`, `Episode Embedding Management`, `Interaction Handling Logic`, `Reminder Tool Commands`, `Metrics and Diagnostics`, `Social Reply Fetching`, `Guild Fact Calendar`, `Episode Tracking Logic`, `Session Management Service`, `Trial Record Logging`, `Memory Replay Evaluation`, `Test Session Orchestration`, `Memory Retrieval Logic`, `Episode Maintenance Tasks`, `Rate Limiting Logic`, `Bug Report Storage`, `Media Token Planning`, `Discord Bot Requirements`, `Memory Recall Scoring`, `Database Shutdown Reliability`, `Memory Database Management`, `Episode Extraction Operations`, `Conversational Tone Detection`, `Attachment Token Measurement`, `In-Flight Attachment Limits`, `LLM Fallback Routing`, `Attachment Intake Policies`, `Gemini Reliability Handling`, `Live Environment Testing`, `Fact Embedding Processing`, `Data Visualization Charts`, `Session and Monitor Management`, `Inline Data LLM Integration`, `Game Test Utilities`, `Extraction Scheduler Logic`, `Obsidian Vault Export`, `Gacha Pet System`, `Utility Tool Definitions`, `Web Search Tooling`, `Token Budget Management`, `Jev Judgment Configuration`, `Media Digest Generation`, `Discord Client Lifecycle`, `Bluesky Thread Reader`, `Predicate Logic Definitions`, `Bluesky Data Parsing`, `Quota Diagnostic Tools`, `Performance Measurement Tools`, `Project Metadata Configuration`, `File Upload Handling`, `Reply Outcome Tracking`, `Episode Retrieval System`, `Token Limit Reporting`, `Guild View Queries`, `Audio Video Processing`, `Threads API Integration`, `Search Prefetch Reporting`, `Episode Admission Logic`, `Message Content Extraction`, `Failure Handling Strategy`, `Test Capture Sink`, `System Prompt Assembly`, `Extraction Schema Definitions`, `Jev Integration Client`, `Content Key Management`, `Claim Extraction Verification`, `Expression and Tone Management`, `Model Fallback Logic`, `Search Prefetch Logic`, `Turn Context Management`, `Channel Media Recall`, `Media Duration Processing`, `Media Upload Handling`, `Buddy Collection Management`, `Timezone Utility Functions`, `Social Media Integration`, `Message Attachment Handling`, `Emoji Reaction Logic`, `SQLite Database Management`, `Discord Channel Visibility`, `LLM Tool Execution`, `Report Command Testing`, `Social Reply Reader`, `YAML Configuration Utilities`, `Identity Name Resolution`, `Prompt Safety Validation`?**
  _High betweenness centrality (0.246) - this node is a cross-community bridge._
- **Why does `getDb()` connect `Memory Database Management` to `Daily Buddy System`, `Memory Migration Utilities`, `Analytics View Rendering`, `Identity Name Resolution`, `Memory Claims Management`, `Hangman Game Logic`, `Episode Persistence Scheduler`, `Activity Query Analytics`, `Interaction Handling Logic`, `Reminder Tool Commands`, `Metrics and Diagnostics`, `Episode Tracking Logic`, `Memory Replay Evaluation`, `Memory Retrieval Logic`, `Episode Maintenance Tasks`, `Rate Limiting Logic`, `Bug Report Storage`, `Discord Bot Requirements`, `Memory Recall Scoring`, `Database Shutdown Reliability`, `Episode Extraction Operations`, `Live Environment Testing`, `Fact Embedding Processing`, `Session and Monitor Management`, `Game Command Handlers`, `Game Test Utilities`, `Extraction Scheduler Logic`, `Obsidian Vault Export`, `Gacha Pet System`, `Docker Container Configuration`, `Episode Retrieval System`, `Test Capture Sink`, `Discord Attachment Reporting`, `Claim Extraction Verification`, `Channel Media Recall`, `Buddy Collection Management`, `SQLite Database Management`, `Report Command Testing`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `config` connect `Episode Embedding Management` to `Daily Buddy System`, `Identity Name Resolution`, `Memory Claims Management`, `Episode Persistence Scheduler`, `Hangman Game Logic`, `Interaction Handling Logic`, `Reminder Tool Commands`, `Social Reply Fetching`, `Guild Fact Calendar`, `Episode Tracking Logic`, `Session Management Service`, `Trial Record Logging`, `Memory Replay Evaluation`, `Test Session Orchestration`, `Memory Retrieval Logic`, `Episode Maintenance Tasks`, `Rate Limiting Logic`, `Media Token Planning`, `Discord Bot Requirements`, `Memory Recall Scoring`, `Database Shutdown Reliability`, `Episode Extraction Operations`, `Anime Schedule Lookup`, `Attachment Token Measurement`, `Model Fallback Configuration`, `In-Flight Attachment Limits`, `Gemini Reliability Handling`, `Fact Embedding Processing`, `Session and Monitor Management`, `Game Test Utilities`, `Obsidian Vault Export`, `Utility Tool Definitions`, `Token Budget Management`, `Jev Judgment Configuration`, `Project Documentation`, `Discord Client Lifecycle`, `Bluesky Thread Reader`, `Quota Diagnostic Tools`, `Social URL Parsing`, `Network Error Recovery`, `File Upload Handling`, `Reply Outcome Tracking`, `Episode Retrieval System`, `Audio Video Processing`, `Episode Admission Logic`, `Test Capture Sink`, `Agent Configuration Settings`, `Discord Attachment Reporting`, `Jev Integration Client`, `Content Key Management`, `Model Fallback Logic`, `Turn Context Management`, `Channel Media Recall`, `Timezone Utility Functions`, `Emoji Reaction Logic`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `createMessageHandler()` (e.g. with `.canAdmitCalls()` and `.reserveCalls()`) actually correct?**
  _`createMessageHandler()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BuddyRow`, `DailyBuddyHatch`, `DailyHatchRow` to the rest of the system?**
  _672 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Daily Buddy System` be split into smaller, more focused modules?**
  _Cohesion score 0.13763440860215054 - nodes in this community are weakly interconnected._