# Graph Report - graph  (2026-10-09)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 3093 nodes · 8837 edges · 142 communities (131 shown, 11 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 268 edges (avg confidence: 0.88)
- Token cost: 7,098 input · 1,502 output

## Graph Freshness
- Built from commit: `00f06db0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Buddy Game Database
- Jev Replay Analysis
- Qwen Transcript Processing
- Discord Bot Client
- Biome Code Formatting
- Memory Analytics Dashboard
- Reply Expression Builder
- Database Migration Claims
- Test Feature Cooldowns
- Memory Extraction Scheduler
- Episode Embedding Service
- Channel Activity Analytics
- Discord Client Mocks
- Interaction and Citation Handling
- Reminder Tool Commands
- Tool Utility Functions
- Failure Diagnostics Store
- Social Reply Fetching
- Guild Fact Dates
- Episode Tracking System
- Development Dependencies
- Session Attachment Retention
- Trial Record Pacing
- Memory Shadow Claims
- Session Management
- Guild Predicate Logic
- Transcript Run Harness
- Project Dependencies
- Episode Maintenance and Embedding
- Discord Rate Limiting
- Fact Safety Validation
- TypeScript Configuration
- Media Watch Planning
- Reminder Scheduler Tests
- Project Build Scripts
- Memory Recall Ranking
- Transcript Replay Metrics
- YouTube Stream Metadata
- Episode Extraction Logic
- Functional Requirements Documentation
- Anime Schedule Lookup
- Attachment Token Measurement
- Model Fallback Logic
- Roka Tool Generation
- Model Routing Fallback
- Attachment Intake Policies
- Gemini Failure Classification
- Tool Trigger Tests
- Identity Name Resolution
- Activity Chart Rendering
- Channel Monitoring Scheduler
- LLM Inline Data Handling
- TypeScript Configuration
- Reply Outcome Recording
- Shiritori Game Logic
- Extraction Job Scheduler
- Obsidian Vault Export
- Model Hedge Logic
- Weather API Integration
- Web Search Integration
- Token Budget Management
- Jev System Configuration
- Media Digest Rendering
- Multimodal Deployment Constraints
- Speech-to-Text HTTP Sidecar
- Bluesky Social Integration
- Model Fallback Shutdown
- Bluesky Data Parsers
- Quota Failure Diagnostics
- Social Post URL Parsing
- Prefetch Measurement Tools
- Package Configuration
- ADK Error Recovery Tests
- File Upload Handler
- Interaction Registration Tests
- Payload Rendering
- Docker Compose Configuration
- Tool Trigger Scoring
- Token Limit Measurement
- View Query Tests
- Media Observation Planning
- Web Search Tooling
- Search Prefetch Reporting
- Episode Persistence Precheck
- Message Content Extraction
- Fallback Model Runbook
- Capture Sink Benchmarking
- Environment Configuration
- Social Viewing Research
- System Prompt Assembly
- Social Video Processing
- Guild Fact Extraction Schema
- Chat Test Harness
- Content Key Generation
- Memory Claim Schema
- Discord Message Mocking
- WAV File Validation
- Message Media Handling
- Timezone Utilities
- API Documentation
- Turn Context Tests
- Discord Interaction Mocking
- Channel Visibility Recall
- Claims Memory Architecture
- Media Duration Parsing
- Turn Media Tests
- Commit Linting Rules
- Game Collection Commands
- Maniwa Roka Bot
- Speech Segment Budgeting
- Discord Channel Visibility
- Reddit Feed Parsing
- Latency Metrics Reporting
- Documentation Style Guide
- Git Commit Conventions
- Coding Guidelines
- Extraction Sample Management
- Social Post Formatting
- Audio Stream Decoding
- Application Configuration Modules
- Extraction Error Handling
- Markdown Guard Utilities
- LLM Tool Execution
- Tool Trigger Retries
- Reply Reader Service
- Frame Extraction Processing
- Speech Server Engines
- Lint Staged Configuration
- HTTP Request Handling
- Episode Embedding Client
- Guild Date Resolution
- Speech Transcription Engine
- Speech Duration Parsing
- YAML Configuration Utilities
- Anime Search API
- Search Prefetch Logic
- Deployment and Operations
- Tone Style Definitions
- Extraction Schema Definitions
- Text Cleaning Utilities
- Live Test Configuration
- Report Generation Utilities

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 212 edges
2. `vitest` - 168 edges
3. `config` - 95 edges
4. `logger` - 62 edges
5. `createMessageHandler()` - 51 edges
6. `createInteractionHandler()` - 46 edges
7. `generateResponse()` - 44 edges
8. `discord.js` - 43 edges
9. `closeDb()` - 36 edges
10. `createTurnContext()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `Attachment Bytes Do Not Live in History` --conceptually_related_to--> `generateResponse()`  [INFERRED]
  docs/trd.md → src/agent/roka.ts
- `Attachment Types and Their Ceilings` --implements--> `GEMINI_SPELLINGS`  [INFERRED]
  docs/trd.md → src/agent/attachmentLimits.ts
- `Jev Turn Judgment` --implements--> `TurnJudgment`  [INFERRED]
  docs/trd.md → src/agent/jev/judgments.ts
- `WindowMessage` --implements--> `WindowMessage`  [INFERRED]
  docs/trd.md → src/session/types.ts
- `Data Volume Mount` --conceptually_related_to--> `resolveDbPath()`  [INFERRED]
  docker-compose.yml → src/storage/database.ts

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

## Communities (142 total, 11 thin omitted)

### Community 0 - "Buddy Game Database"
Cohesion: 0.12
Nodes (33): SQLite Database Reference, BuddyRow, DailyBuddyHatch, DailyHatchRow, generateBuddy(), generateName(), generatePersonality(), getBuddyCount() (+25 more)

### Community 1 - "Jev Replay Analysis"
Cohesion: 0.12
Nodes (26): ref_node_url, parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, agreement(), buildConfusionMatrix(), buildProbabilityBins() (+18 more)

### Community 2 - "Qwen Transcript Processing"
Cohesion: 0.11
Nodes (20): binOf(), ChatCompletion, ContentPart, promptFor(), quoted(), QwenFrame, QwenWatchInput, QwenWatchResult (+12 more)

### Community 3 - "Discord Bot Client"
Cohesion: 0.08
Nodes (31): Tech Stack (AGENTS.md), FR-1: Slash Command Interaction, Features, discord.js, ALLOWED_MEDIA_TYPES, createClient(), askCommand, command (+23 more)

### Community 4 - "Biome Code Formatting"
Cohesion: 0.05
Nodes (37): useLiteralKeys, files, ignore, formatter, enabled, indentStyle, indentWidth, lineWidth (+29 more)

### Community 5 - "Memory Analytics Dashboard"
Cohesion: 0.12
Nodes (30): activeClaimCount(), memoryGrowthSeries(), newClaimsThisMonth(), topChannels(), topPredicates(), topRememberedMembers(), topTones(), addChart() (+22 more)

### Community 6 - "Reply Expression Builder"
Cohesion: 0.06
Nodes (43): ReplyOutcome, clampToBudget(), fitCitations(), sourceHost(), EXPRESSION_URLS, getExpressionUrl(), lastExpressionByTone, __resetExpressionState() (+35 more)

### Community 7 - "Database Migration Claims"
Cohesion: 0.08
Nodes (65): Claims Tenancy Model, attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow (+57 more)

### Community 8 - "Test Feature Cooldowns"
Cohesion: 0.11
Nodes (37): assert(), fail(), main(), makeMessage(), pass(), results, TestResult, cleanupExpiredCooldowns() (+29 more)

### Community 9 - "Memory Extraction Scheduler"
Cohesion: 0.10
Nodes (34): Memory, finishRunTrace(), noteError(), noteSummary(), RunOutcome, RunStage, RunTrace, startRunTrace() (+26 more)

### Community 10 - "Episode Embedding Service"
Cohesion: 0.15
Nodes (17): embedEpisodeText(), EpisodeEmbeddingRole, getEmbeddingClient(), delay(), embedPendingFacts(), sweep(), renderFactSentence(), normalizeKey() (+9 more)

### Community 11 - "Channel Activity Analytics"
Cohesion: 0.08
Nodes (35): activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome, CountByPredicate (+27 more)

### Community 12 - "Discord Client Mocks"
Cohesion: 0.06
Nodes (44): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+36 more)

### Community 13 - "Interaction and Citation Handling"
Cohesion: 0.09
Nodes (46): isMonitored(), markActive(), text(), asksAboutReplies(), withReplyOutcomes(), citationsForTurn, SearchCitation, withSearchCitations() (+38 more)

### Community 14 - "Reminder Tool Commands"
Cohesion: 0.16
Nodes (29): ref_discordjs_builders, cancelReminder(), listReminders(), setReminder(), createToolCommandHandler(), TOOL_COMMAND_NAMES, handleAnime(), handleRemind() (+21 more)

### Community 15 - "Tool Utility Functions"
Cohesion: 0.13
Nodes (25): Tool Footer, flipCoin(), FlipCoinResult, ForgetUserParams, cityToTimezone, getCurrentTime(), GetCurrentTimeParams, GetCurrentTimeResult (+17 more)

### Community 16 - "Failure Diagnostics Store"
Cohesion: 0.17
Nodes (17): Failure Diagnostics Table, countMemoryEvents(), ExtractionEventInput, FailureDiagnosticInput, getExtractionEventStatement(), getFailureDiagnosticStatement(), getMemoryEventStatement(), getResponseEventStatement() (+9 more)

### Community 17 - "Social Reply Fetching"
Cohesion: 0.23
Nodes (27): array(), nonNegativeInteger(), bilibiliAid(), fetchBilibiliReplies(), fetchBlueskyReplies(), BROWSER_USER_AGENT, compactReplyText(), failed() (+19 more)

### Community 18 - "Guild Fact Dates"
Cohesion: 0.26
Nodes (16): addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth(), monthForMonth() (+8 more)

### Community 19 - "Episode Tracking System"
Cohesion: 0.11
Nodes (28): better-sqlite3, asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), resetEpisodeTrackerForTest() (+20 more)

### Community 20 - "Development Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, husky, lint-staged, pino-pretty, prettier (+5 more)

### Community 21 - "Session Attachment Retention"
Cohesion: 0.13
Nodes (7): @google/adk, attachmentMarker(), isStrippable(), WindowedSessionService, CapturingLlm, newConversation(), PNG_BASE64

### Community 22 - "Trial Record Pacing"
Cohesion: 0.19
Nodes (12): emitTrialRecord(), formatTrialRecord(), TrialRecord, record, pacingWith(), CaseSetRun, runCaseSet(), RunCaseSetOptions (+4 more)

### Community 23 - "Memory Shadow Claims"
Cohesion: 0.12
Nodes (21): assertClaim(), addNickname(), addUser(), here, other, claim(), upsertUserName(), asClaim() (+13 more)

### Community 24 - "Session Management"
Cohesion: 0.09
Nodes (33): abortActiveTurns(), generateResponse(), __setTestRunTurnFactory(), APP_NAME, clearSessionErrorCount(), destroyAllSessions(), destroySession(), idleTimers (+25 more)

### Community 25 - "Guild Predicate Logic"
Cohesion: 0.08
Nodes (45): Bounded Retrieval Contract, ClaimSource, touchRecalled(), GUILD_PREDICATES, GuildPredicateId, MemoryPredicateId, predicate(), PredicateCardinality (+37 more)

### Community 26 - "Transcript Run Harness"
Cohesion: 0.17
Nodes (21): fixturePath(), loadTranscript(), main(), parseTranscriptLine(), renderTokenTable(), requestMessageContent(), runTranscript(), RunTranscriptOptions (+13 more)

### Community 27 - "Project Dependencies"
Cohesion: 0.15
Nodes (13): dependencies, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml, @napi-rs/canvas (+5 more)

### Community 28 - "Episode Maintenance and Embedding"
Cohesion: 0.08
Nodes (42): recordShare(), remember(), EpisodeMaintenanceReport, pruneEpisodesAndReembed(), configMock, mocks, now, seedEpisode() (+34 more)

### Community 29 - "Discord Rate Limiting"
Cohesion: 0.09
Nodes (17): FR-6: Rate Limiting, Message Pipeline, Discord Gateway Layer, RateLimiterConfig, RPM-Budget Accounting, A Turn Reserves the Calls It May Make, modelCallsForRequest, mocks (+9 more)

### Community 30 - "Fact Safety Validation"
Cohesion: 0.06
Nodes (43): buildFactsEnvelope(), buildOverheardBlock(), FACTS_UNTRUSTED_DATA_LABEL, isSafeFactScalar(), MAX_FACT_KEY_LEN, MAX_FACT_VALUE_LEN, MAX_OVERHEARD_BLOCK_LEN, MAX_OVERHEARD_MSG_LEN (+35 more)

### Community 31 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "Media Watch Planning"
Cohesion: 0.11
Nodes (36): watchOutcomeFor(), durationFromTokens(), equalBins(), estimateMediaTokens(), focusWindow(), FPS_LADDER, HalfWatch, HALVES_MAX_DURATION_SEC (+28 more)

### Community 33 - "Reminder Scheduler Tests"
Cohesion: 0.11
Nodes (25): reminders Config Section, Discord Install Requirements: bot Scope Is Load-Bearing, Guild Permissions Are Derived From the API Surface, There Is No Build-Time Pin, and That Is Deliberate, assert(), fail(), main(), pass() (+17 more)

### Community 34 - "Project Build Scripts"
Cohesion: 0.07
Nodes (28): scripts, build, dev, dev:quiet, export:vault, format, format:check, harness (+20 more)

### Community 35 - "Memory Recall Ranking"
Cohesion: 0.09
Nodes (43): cosineSimilarity(), GuildMemoryClaim, UserMemoryClaim, byScore(), cooldownPenalty(), coreRank(), countKind(), Ctx (+35 more)

### Community 36 - "Transcript Replay Metrics"
Cohesion: 0.11
Nodes (22): ref_node_perf_hooks, argumentsFrom(), estimatedTokens(), inputText(), measure(), loadTranscriptLines(), main(), offlineAdapters() (+14 more)

### Community 37 - "YouTube Stream Metadata"
Cohesion: 0.19
Nodes (19): metadata, realisticFormats, AudioFormat, audioFormats(), directHttpsUrl(), finiteNumber(), hasCodec(), headersOf() (+11 more)

### Community 38 - "Episode Extraction Logic"
Cohesion: 0.06
Nodes (45): liveAdapters(), AdmissionResult, admitEpisode(), JevUnavailableError, ExtractionOp, ExtractionOutput, parseExtractionOutput(), episodeObservedAt() (+37 more)

### Community 39 - "Functional Requirements Documentation"
Cohesion: 0.14
Nodes (18): FR-10: Graceful Shutdown, FR-2: Mention/Reply Interaction, FR-3: Per-Channel Conversational Memory, FR-5: Tone Detection, Functional Requirements, Problem Statement, Product Requirements Document, Project Objectives (+10 more)

### Community 40 - "Anime Schedule Lookup"
Cohesion: 0.20
Nodes (19): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleParams, GetAnimeScheduleResult, getCurrentSeason() (+11 more)

### Community 41 - "Attachment Token Measurement"
Cohesion: 0.12
Nodes (21): PDF Token Cost Measurement, Attachment Token Admission, sharp, spriteFiles, measureAttachmentTokens(), needsMeasuring(), GEMINI_IMAGE_TOKENS, geminiMimeType() (+13 more)

### Community 42 - "Model Fallback Logic"
Cohesion: 0.11
Nodes (25): fallback Config Section, ModelScope Qwen Fallback, Tech Stack (README), ref_node_async_hooks, AnswerModel, attachmentKind(), attachmentMarker(), ChatMessage (+17 more)

### Community 43 - "Roka Tool Generation"
Cohesion: 0.11
Nodes (20): gemini Config Section, rateLimit Config Section, escapeRegExp(), stripNarratedToolCalls(), GenerateOptions, GenerateResult, ROKA_TOOL_NAMES, rokaAgent (+12 more)

### Community 44 - "Model Routing Fallback"
Cohesion: 0.12
Nodes (12): Deliberately Not Done, Gemini-Outage Fallback (Qwen3.5), The Fallback Model, createRokaModel(), modelRouteForRequest, ModelScopeLlm, RoutedLlm, adapter() (+4 more)

### Community 45 - "Attachment Intake Policies"
Cohesion: 0.18
Nodes (21): attachment_url, Handing Her a File, Audio Intake Recommendation, PDF Intake Recommendation, Video Low Resolution Recommendation, Attachment Types and Their Ceilings, requestCarriesVideo(), ALLOWED_AUDIO_TYPES (+13 more)

### Community 46 - "Gemini Failure Classification"
Cohesion: 0.11
Nodes (25): BackoffOptions, classifyGeminiFailure(), classifyMarker(), computeBackoff(), DEFAULT_MAX_BACKOFF_MS, extractGeminiStatus(), FailureKind, GeminiFailureResult (+17 more)

### Community 47 - "Tool Trigger Tests"
Cohesion: 0.12
Nodes (13): CASE_SETS, fixturePath, header, rememberFixturePath, searchWebFixturePath, temporaryDirectories, testCase, meetsLiveVerdict() (+5 more)

### Community 48 - "Identity Name Resolution"
Cohesion: 0.10
Nodes (33): buildNameIndex(), escapeRegex(), isAscii(), MATCH_PRIORITY, MatchKind, NameCandidate, NameIndex, nicknameRows() (+25 more)

### Community 49 - "Activity Chart Rendering"
Cohesion: 0.26
Nodes (14): @napi-rs/canvas, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+6 more)

### Community 50 - "Channel Monitoring Scheduler"
Cohesion: 0.11
Nodes (23): ref_node_http, cleanupExpired(), monitoredChannels, resetMonitor(), restoreMonitoredChannels(), resetForTest(), stopExtractionScheduler(), waitForInFlightExtractions() (+15 more)

### Community 51 - "LLM Inline Data Handling"
Cohesion: 0.29
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 52 - "TypeScript Configuration"
Cohesion: 0.22
Nodes (8): ./tsconfig.json, compilerOptions, noEmit, rootDir, types, exclude, extends, include

### Community 53 - "Reply Outcome Recording"
Cohesion: 0.18
Nodes (12): SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL, outcomeForTurn, recordReplyOutcome(), MEMORY_TOOL_NAMES, readRepliesTool, readReplies(), ReadRepliesParams, FOUND (+4 more)

### Community 54 - "Shiritori Game Logic"
Cohesion: 0.14
Nodes (26): ref_node_module, handleShiritoriEnd(), handleShiritoriJoin(), saveShiritoriScore(), SHIRITORI_COLORS, src_games_data_wordlist, activeGames, endGame() (+18 more)

### Community 55 - "Extraction Job Scheduler"
Cohesion: 0.19
Nodes (14): maybeSample(), shouldSample(), startExtractionScheduler(), advancePastRetryDelay(), configMock, drain(), enqueue(), enqueueDelayed() (+6 more)

### Community 56 - "Obsidian Vault Export"
Cohesion: 0.18
Nodes (16): Browsing Memory in Obsidian, js-yaml, ActiveClaimSubject, ActiveGuildSubject, ExportedClaim, ExportedGuildClaim, exportVault(), formatClaimGroups() (+8 more)

### Community 57 - "Model Hedge Logic"
Cohesion: 0.18
Nodes (5): ModelRoute, DeferredLlm, loggerMock, Outcome, responses()

### Community 58 - "Weather API Integration"
Cohesion: 0.28
Nodes (8): emptyResult(), GeocodingResult, getWeather(), GetWeatherParams, GetWeatherResult, OpenMeteoWeather, weatherCodeToCondition(), wmoWeatherCodes

### Community 59 - "Web Search Integration"
Cohesion: 0.24
Nodes (6): Where Rokabot Decides Today, recordSearchCitations(), searchWeb(), SearchWebParams, TavilyResponse, TavilyResult

### Community 60 - "Token Budget Management"
Cohesion: 0.19
Nodes (13): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, The Two Limiters Bound Their Windows Differently, canAffordAttachments(), chargeTokens(), drain(), lastDrain, remainingTokensThisMinute() (+5 more)

### Community 61 - "Jev System Configuration"
Cohesion: 0.10
Nodes (30): jev Config Section, Jev Design (Per-Feature Modes), Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk, Jev Shadow Mode, Jev Judgments, Jev Memory Admission (+22 more)

### Community 62 - "Media Digest Rendering"
Cohesion: 0.15
Nodes (25): boundedString(), coverageLine(), cutAtWord(), formatClock(), frameInterval(), framesLine(), HEARD_LINES, isRecord() (+17 more)

### Community 63 - "Multimodal Deployment Constraints"
Cohesion: 0.08
Nodes (36): RFC-3003, FR-7: Error Handling, FR-8: Response Formatting, FR-9: Docker Deployment, ALLOWED_IMAGE_TYPES Consolidation, Attachment History Stripping, Byte Cap as Duration Proxy, Concurrency Binding Constraint (+28 more)

### Community 64 - "Speech-to-Text HTTP Sidecar"
Cohesion: 0.13
Nodes (17): Speech-to-text HTTP sidecar: Silero VAD -> SenseVoice language ID -> Moonshine…, collections, http_server, io, json, math, numpy, os (+9 more)

### Community 65 - "Bluesky Social Integration"
Cohesion: 0.10
Nodes (23): ref_node_os, resolveBlueskyDid(), ParsedBlueskyThread, createSocialPostViewer(), failure(), initializeSocialPosts(), isAbort(), isYtDlpPlatform() (+15 more)

### Community 66 - "Model Fallback Shutdown"
Cohesion: 0.16
Nodes (12): __resetModelFallbackForTest(), TurnOutcome, beginShutdown(), isShuttingDown(), resetForTest(), existingFallbackReplies, mocks, mutableFallbackConfig (+4 more)

### Community 67 - "Bluesky Data Parsers"
Cohesion: 0.15
Nodes (33): base(), BlueskyBlob, blueskyQuote(), capped(), compact(), date(), finiteNumber(), headers() (+25 more)

### Community 68 - "Quota Failure Diagnostics"
Cohesion: 0.20
Nodes (12): BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey(), DIAGNOSTIC_TIMEOUT_MS, errorText(), KEY_IS_LIVE, OUTPACING_THE_CAP, SPENT_FOR_THE_DAY (+4 more)

### Community 69 - "Social Post URL Parsing"
Cohesion: 0.10
Nodes (31): vitest, configMock, mocks, ReplyFetchContext, hostMatches(), HOSTS, parseSocialPostUrl(), platformForHost() (+23 more)

### Community 70 - "Prefetch Measurement Tools"
Cohesion: 0.21
Nodes (9): main(), MeasurementAnomaly, Options, parseOptions(), percentile(), PrefetchMeasurementCase, PrefetchMeasurementSummary, PrefetchMeasurementTrial (+1 more)

### Community 71 - "Package Configuration"
Cohesion: 0.10
Nodes (20): description, engines, node, main, name, type, version, @biomejs/biome (+12 more)

### Community 72 - "ADK Error Recovery Tests"
Cohesion: 0.12
Nodes (19): ref_node_dns, ref_node_net, ErrorRecoveryPlugin, main(), results, runQuery(), test(), TestResult (+11 more)

### Community 73 - "File Upload Handler"
Cohesion: 0.17
Nodes (9): countedBody(), deleteFile(), FileResource, getFile(), sleep(), streamToFiles(), UploadedFile, videoDurationSec() (+1 more)

### Community 74 - "Interaction Registration Tests"
Cohesion: 0.07
Nodes (21): attachmentOptionName(), MAX_ATTACHMENTS, expectedPolicy, NAME_MENTION_REGEX, client, createInteraction(), mocks, rateLimiter() (+13 more)

### Community 75 - "Payload Rendering"
Cohesion: 0.36
Nodes (12): asObject(), asObjects(), chunkLabel(), componentDetails(), walk(), isComponentsV2Payload(), PayloadObject, renderEmbeds() (+4 more)

### Community 76 - "Docker Compose Configuration"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 77 - "Tool Trigger Scoring"
Cohesion: 0.21
Nodes (16): isKnownPredicate(), asCase(), asClaim(), asHeader(), asHistoryLine(), asMember(), asSessionState(), DEFAULT_CASE_SET_PATH (+8 more)

### Community 78 - "Token Limit Measurement"
Cohesion: 0.35
Nodes (9): Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION, mimeForPath(), resolveKey(), TokenLimits (+1 more)

### Community 79 - "View Query Tests"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "Media Observation Planning"
Cohesion: 0.10
Nodes (21): @google/genai, MEDIA_OBSERVATIONS_SCHEMA, mocks, countUriTokens(), elapsedSince(), getClient(), instructions(), mediaPart() (+13 more)

### Community 81 - "Web Search Tooling"
Cohesion: 0.25
Nodes (5): runSearchTurn(), ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS, searchWebTool

### Community 82 - "Search Prefetch Reporting"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "Episode Persistence Precheck"
Cohesion: 0.15
Nodes (9): persistEpisodeResult(), isTrivial(), normalize(), precheckEpisode(), SENSITIVE_PATTERNS, EpisodeRunResult, mocks, mocks (+1 more)

### Community 84 - "Message Content Extraction"
Cohesion: 0.14
Nodes (24): ImageAttachment, isSupportedMedia(), describeEmbed(), describeForwardedSnapshots(), describePoll(), embedMatchesSocialPost(), extractComponentMedia(), walk() (+16 more)

### Community 85 - "Fallback Model Runbook"
Cohesion: 0.17
Nodes (13): Fallback Model (runbook), ADK Error Delivery Constraint, Attachment Bytes Do Not Live in History, Concurrency & Lifecycle Under Retry, Gemini Failure Taxonomy, Gemini API, Roka Agent (ADK), Session Manager (+5 more)

### Community 86 - "Capture Sink Benchmarking"
Cohesion: 0.11
Nodes (12): CaptureInput, CaptureKind, CaptureRecord, CaptureSink, createCaptureSink(), benchmarkTranscript, CapturingRunner, mocks (+4 more)

### Community 87 - "Environment Configuration"
Cohesion: 0.12
Nodes (14): Configuration (AGENTS.md), dotenv, envString(), episodeMaxMessages, maxJitterAchievableRetries, MediaWatcher, memoryEnum(), MemoryPrivacy (+6 more)

### Community 88 - "Social Viewing Research"
Cohesion: 0.29
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "System Prompt Assembly"
Cohesion: 0.15
Nodes (27): Architecture (AGENTS.md), FR-4: Layered Personality Prompts, Prompt System, AssemblerInput, ref_node_fs, AssemblerInput, assembleSystemPrompt(), buildContextPrompt() (+19 more)

### Community 90 - "Social Video Processing"
Cohesion: 0.36
Nodes (5): PlayableVideo, audioRank(), qualifies(), selectPlayableVideo(), VideoCandidate

### Community 91 - "Guild Fact Extraction Schema"
Cohesion: 0.06
Nodes (28): AddOperationSchema, calendarDateProperties, datedGuildPredicates, ExtractionOutputSchema, ExtractionSubject, GuildAddOperationSchema, GuildExtractionOp, guildFactDateResponseSchema (+20 more)

### Community 92 - "Chat Test Harness"
Cohesion: 0.15
Nodes (11): ref_node_readline, handleInput(), main(), username, __resetTestRunTurnFactory(), makeClient(), toChannelMap(), mocks (+3 more)

### Community 93 - "Content Key Generation"
Cohesion: 0.31
Nodes (10): ref_node_crypto, bytesContentKey(), DISCORD_CDN_HOSTS, discordAttachmentContentKey(), postContentKey(), requireId(), youtubeContentKey(), playableVideo() (+2 more)

### Community 94 - "Memory Claim Schema"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 96 - "WAV File Validation"
Cohesion: 0.38
Nodes (5): read_wav(), WavError, make_wav(), ReadWavTest, ValueError

### Community 97 - "Message Media Handling"
Cohesion: 0.27
Nodes (8): Attachment, collection(), extract(), forwardedIn, message(), referenceMessage(), repliedTo, snapshot()

### Community 98 - "Timezone Utilities"
Cohesion: 0.33
Nodes (8): loadGetLocalHour(), loadTimezoneModule(), unpinnedHour(), dateString(), dateTimeParts(), localDateStartEpoch(), localDateTimeFormatter(), LocalDateTimeParts

### Community 99 - "API Documentation"
Cohesion: 0.22
Nodes (8): API, ASR Sidecar, Build and Run, Configuration, `GET /health`, Models and Licences, `POST /transcribe?maxSpeechSec=120`, Tests

### Community 100 - "Turn Context Tests"
Cohesion: 0.22
Nodes (5): entryWork(), jevConfig, mocks, turnOptions(), turnWith()

### Community 102 - "Channel Visibility Recall"
Cohesion: 0.10
Nodes (29): channelVisibility, registerChannelVisibility(), resetChannelVisibilityForTest(), UNKNOWN, buildEpisodeRecallBlock(), formatEpisodeRecallBlock(), RecalledEpisode, recallEpisodes() (+21 more)

### Community 103 - "Claims Memory Architecture"
Cohesion: 0.36
Nodes (8): Claim Lifecycle, Claims Memory Architecture, extraction_queue Table, memory_claim_fts Table, memory_claim Table, memory_events Table, memory_evidence Table, Vault Export

### Community 104 - "Media Duration Parsing"
Cohesion: 0.20
Nodes (13): Box, movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0(), mvhdV1() (+5 more)

### Community 105 - "Turn Media Tests"
Cohesion: 0.16
Nodes (5): digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf()

### Community 107 - "Game Collection Commands"
Cohesion: 0.11
Nodes (44): handleGachaMention(), statBar(), createGameCommandHandler(), GAME_COMMAND_NAMES, buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount() (+36 more)

### Community 108 - "Maniwa Roka Bot"
Cohesion: 0.67
Nodes (3): Maniwa Roka, Rokabot, Senren*Banka

### Community 109 - "Speech Segment Budgeting"
Cohesion: 0.42
Nodes (4): Keep time-ordered segments within the speech budget, spread across the clip.…, Segment, select_segments(), SelectSegmentsTest

### Community 110 - "Discord Channel Visibility"
Cohesion: 0.31
Nodes (4): ChannelVisibilityResolver, createChannelVisibilityResolver(), everyoneRole, resolverFor()

### Community 111 - "Reddit Feed Parsing"
Cohesion: 0.56
Nodes (9): decodeEntities(), entryAuthor(), entryContent(), feedEntries(), feedField(), htmlToText(), NAMED_ENTITIES, parseRedditFeedPost() (+1 more)

### Community 112 - "Latency Metrics Reporting"
Cohesion: 0.25
Nodes (9): latencyE2e, p95ByDay, percentile(), retrySummary, tokenTotals, buildNerd(), formatDuration(), formatLatency() (+1 more)

### Community 116 - "Extraction Sample Management"
Cohesion: 0.31
Nodes (6): pruneExpiredExtractionSamples(), countExtractionSamples(), ExtractionSampleInput, pruneExtractionSamples(), recordExtractionSample(), configMock

### Community 117 - "Social Post Formatting"
Cohesion: 0.39
Nodes (7): SOCIAL_POST_UNTRUSTED_DATA_LABEL, author(), formatSocialPostLine(), quoted(), replies(), SOCIAL_POST_FAILURE_MARKER, post

### Community 119 - "Application Configuration Modules"
Cohesion: 0.22
Nodes (9): discord Config Section, emoji Config Section, games Config Section, logging Config Section, memory Config Section, metrics Config Section, session Config Section, Configuration (README) (+1 more)

### Community 120 - "Extraction Error Handling"
Cohesion: 0.29
Nodes (6): ABORT_CODES, classifyExtractionError(), ExtractionErrorClassification, SHUTDOWN_SENSITIVE_NAMES, TRANSIENT_HTTP_STATUSES, TRANSIENT_NETWORK_CODES

### Community 121 - "Markdown Guard Utilities"
Cohesion: 0.50
Nodes (6): eachOutside(), guardMarkdown(), guardProse(), guardText(), isFace(), KAOMOJI

### Community 122 - "LLM Tool Execution"
Cohesion: 0.25
Nodes (4): REMEMBER_TURN, runTurn(), ScriptedLlm, rememberUserTool

### Community 123 - "Tool Trigger Retries"
Cohesion: 0.29
Nodes (6): cases, header, ok(), turn(), CaseSetHeader, ToolTriggerCase

### Community 124 - "Reply Reader Service"
Cohesion: 0.22
Nodes (8): createReplyReader(), isAbort(), replyReader, ReplyLookup, SocialPlatform, FOUND, readerWith(), SETTINGS

### Community 125 - "Frame Extraction Processing"
Cohesion: 0.08
Nodes (35): ref_node_child_process, EMPTY, extractFrame(), extractFrames(), frameBins(), frameCount(), FrameRunner, FrameSource (+27 more)

### Community 126 - "Speech Server Engines"
Cohesion: 0.33
Nodes (6): Engines, load_engines(), main(), SpeechServer, NamedTuple, ThreadingHTTPServer

### Community 127 - "Lint Staged Configuration"
Cohesion: 0.67
Nodes (3): lint-staged, *.{json,md,yml,yaml}, *.{ts,js}

### Community 129 - "Episode Embedding Client"
Cohesion: 0.33
Nodes (3): response(), resetEpisodeEmbeddingClientForTest(), mocks

### Community 130 - "Guild Date Resolution"
Cohesion: 0.40
Nodes (5): GuildFactDate, DateResolver, expectResolved(), loadResolver(), ResolvedDate

### Community 131 - "Speech Transcription Engine"
Cohesion: 0.60
Nodes (5): decode(), detect_speech(), language_code(), transcribe(), ndarray

### Community 134 - "Anime Search API"
Cohesion: 0.29
Nodes (6): jikanThrottle(), AnimeResult, JikanAnimeEntry, JikanResponse, SearchAnimeParams, SearchAnimeResult

### Community 135 - "Search Prefetch Logic"
Cohesion: 0.16
Nodes (15): buildLookedUpBlock(), clip(), decidePrefetch(), JevPrefetchMode, PREFETCH_TOOL_NAME, PrefetchContext, PrefetchDecision, PrefetchOutcome (+7 more)

### Community 136 - "Deployment and Operations"
Cohesion: 0.12
Nodes (24): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Critical Do-Nots, Project (Rokabot description) (+16 more)

### Community 137 - "Tone Style Definitions"
Cohesion: 0.40
Nodes (4): Expressions & Tones, System Architecture, TONE_STYLES, ToneStyle

### Community 138 - "Extraction Schema Definitions"
Cohesion: 0.40
Nodes (4): EXTRACTION_RESPONSE_SCHEMA, DateVariant, subject, output()

### Community 140 - "Live Test Configuration"
Cohesion: 0.50
Nodes (3): Getting Started, npm run test:live Gate, TRIAL_PACING_MS

### Community 141 - "Report Generation Utilities"
Cohesion: 0.31
Nodes (7): ref_node_path, main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne()

## Ambiguous Edges - Review These
- `Second Opinion` → `Rokabot TRD`  [AMBIGUOUS]
  docs/research/jev-integration.md · relation: conceptually_related_to

## Knowledge Gaps
- **730 isolated node(s):** `BuddyRow`, `DailyBuddyHatch`, `DailyHatchRow`, `JevReplayCutoffRow`, `SessionHistoryReplayRow` (+725 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1012 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Second Opinion` and `Rokabot TRD`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `vitest` connect `Social Post URL Parsing` to `Buddy Game Database`, `Jev Replay Analysis`, `Qwen Transcript Processing`, `Discord Bot Client`, `Reply Expression Builder`, `Database Migration Claims`, `Test Feature Cooldowns`, `Memory Extraction Scheduler`, `Episode Embedding Service`, `Channel Activity Analytics`, `Interaction and Citation Handling`, `Failure Diagnostics Store`, `Social Reply Fetching`, `Episode Tracking System`, `Session Attachment Retention`, `Trial Record Pacing`, `Memory Shadow Claims`, `Session Management`, `Guild Predicate Logic`, `Episode Maintenance and Embedding`, `Discord Rate Limiting`, `Fact Safety Validation`, `Media Watch Planning`, `Reminder Scheduler Tests`, `Memory Recall Ranking`, `Transcript Replay Metrics`, `YouTube Stream Metadata`, `Episode Extraction Logic`, `Functional Requirements Documentation`, `Attachment Token Measurement`, `Roka Tool Generation`, `Model Routing Fallback`, `Attachment Intake Policies`, `Gemini Failure Classification`, `Tool Trigger Tests`, `Activity Chart Rendering`, `Channel Monitoring Scheduler`, `LLM Inline Data Handling`, `Reply Outcome Recording`, `Shiritori Game Logic`, `Extraction Job Scheduler`, `Model Hedge Logic`, `Web Search Integration`, `Token Budget Management`, `Jev System Configuration`, `Media Digest Rendering`, `Multimodal Deployment Constraints`, `Bluesky Social Integration`, `Model Fallback Shutdown`, `Bluesky Data Parsers`, `Quota Failure Diagnostics`, `Prefetch Measurement Tools`, `Package Configuration`, `File Upload Handler`, `Interaction Registration Tests`, `Token Limit Measurement`, `View Query Tests`, `Media Observation Planning`, `Web Search Tooling`, `Search Prefetch Reporting`, `Episode Persistence Precheck`, `Message Content Extraction`, `Capture Sink Benchmarking`, `System Prompt Assembly`, `Social Video Processing`, `Chat Test Harness`, `Content Key Generation`, `Message Media Handling`, `Timezone Utilities`, `Turn Context Tests`, `Channel Visibility Recall`, `Media Duration Parsing`, `Turn Media Tests`, `Game Collection Commands`, `Discord Channel Visibility`, `Extraction Sample Management`, `Social Post Formatting`, `Extraction Error Handling`, `Markdown Guard Utilities`, `LLM Tool Execution`, `Tool Trigger Retries`, `Reply Reader Service`, `Frame Extraction Processing`, `Episode Embedding Client`, `Guild Date Resolution`, `YAML Configuration Utilities`, `Search Prefetch Logic`, `Extraction Schema Definitions`, `Live Test Configuration`?**
  _High betweenness centrality (0.233) - this node is a cross-community bridge._
- **Why does `config` connect `Episode Embedding Service` to `Buddy Game Database`, `Episode Embedding Client`, `Discord Bot Client`, `Database Migration Claims`, `Test Feature Cooldowns`, `Memory Extraction Scheduler`, `Interaction and Citation Handling`, `Reminder Tool Commands`, `Tool Utility Functions`, `Social Reply Fetching`, `Guild Fact Dates`, `Episode Tracking System`, `Trial Record Pacing`, `Memory Shadow Claims`, `Session Management`, `Guild Predicate Logic`, `Episode Maintenance and Embedding`, `Discord Rate Limiting`, `Fact Safety Validation`, `Media Watch Planning`, `Reminder Scheduler Tests`, `Memory Recall Ranking`, `YouTube Stream Metadata`, `Episode Extraction Logic`, `Anime Schedule Lookup`, `Attachment Token Measurement`, `Model Fallback Logic`, `Roka Tool Generation`, `Gemini Failure Classification`, `Identity Name Resolution`, `Channel Monitoring Scheduler`, `Shiritori Game Logic`, `Obsidian Vault Export`, `Weather API Integration`, `Token Budget Management`, `Jev System Configuration`, `Multimodal Deployment Constraints`, `Bluesky Social Integration`, `Model Fallback Shutdown`, `Quota Failure Diagnostics`, `ADK Error Recovery Tests`, `File Upload Handler`, `Interaction Registration Tests`, `Media Observation Planning`, `Capture Sink Benchmarking`, `Environment Configuration`, `Content Key Generation`, `Timezone Utilities`, `Turn Context Tests`, `Channel Visibility Recall`, `Extraction Sample Management`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `getDb()` connect `Database Migration Claims` to `Buddy Game Database`, `Memory Analytics Dashboard`, `Test Feature Cooldowns`, `Memory Extraction Scheduler`, `Channel Activity Analytics`, `Interaction and Citation Handling`, `Reminder Tool Commands`, `Failure Diagnostics Store`, `Episode Tracking System`, `Memory Shadow Claims`, `Guild Predicate Logic`, `Episode Maintenance and Embedding`, `Discord Rate Limiting`, `Fact Safety Validation`, `Reminder Scheduler Tests`, `Memory Recall Ranking`, `Transcript Replay Metrics`, `Episode Extraction Logic`, `Tool Trigger Tests`, `Identity Name Resolution`, `Channel Monitoring Scheduler`, `Shiritori Game Logic`, `Obsidian Vault Export`, `Capture Sink Benchmarking`, `Chat Test Harness`, `Channel Visibility Recall`, `Game Collection Commands`, `Latency Metrics Reporting`, `Extraction Sample Management`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `createMessageHandler()` (e.g. with `.canAdmitCalls()` and `.reserveCalls()`) actually correct?**
  _`createMessageHandler()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BuddyRow`, `DailyBuddyHatch`, `DailyHatchRow` to the rest of the system?**
  _730 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Buddy Game Database` be split into smaller, more focused modules?**
  _Cohesion score 0.11746031746031746 - nodes in this community are weakly interconnected._