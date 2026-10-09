# Graph Report - graph  (2026-10-09)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 3190 nodes · 9183 edges · 148 communities (134 shown, 14 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 273 edges (avg confidence: 0.88)
- Token cost: 7,410 input · 1,540 output

## Graph Freshness
- Built from commit: `a8c6e753`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Buddy Game Logic
- Jev Replay Analysis
- Qwen Transcript Analysis
- Discord Command Handling
- Code Formatting Config
- Memory Analytics
- Citation & Tone Builder
- Claim Tenancy Management
- Hangman Game Logic
- Extraction Job Scheduler
- Episode Embedding
- Claim Database Queries
- Discord Mocking
- Interaction Handling
- Reminder System
- Utility Tools
- Metrics & Diagnostics
- Social Reply Fetching
- Fact Date Resolution
- Episode Tracking
- Development Dependencies
- Session Attachment Management
- Claim Reclassification
- Memory Shadow Testing
- Turn Lifecycle Management
- Claim Retrieval
- Transcript Processing
- Production Dependencies
- Episode Persistence
- Rate Limiting & Persistence
- Bug Reporting
- TypeScript Configuration
- Media Token Estimation
- Game Command Handling
- Build & Dev Scripts
- Fact Recall Ranking
- Episode Replay Analysis
- YouTube Stream Processing
- Extraction Error Handling
- Project Requirements & Docs
- Anime Schedule Lookup
- Media Prefix Policy
- Configuration Management
- Fact Retraction Logic
- LLM Model Routing
- Attachment Intake Policy
- System Architecture & Fallback
- Tool Trigger Observations
- Identity Resolution
- Activity Visualization
- Memory Migration Privacy
- ADK Integration Testing
- TypeScript Configuration
- Reply Outcome Tracking
- Feature Testing & Cooldowns
- Extraction Job Queue
- Obsidian Memory Export
- Model Routing Hedge
- Weather Data Retrieval
- Privacy & Visibility
- Attachment Report Handling
- Jev Judgment Logic
- Media Digest Generation
- Deployment & Attachment Limits
- Speech-to-Text Server
- Bluesky Integration
- Shutdown Reliability Handling
- Bluesky Data Parsers
- Quota Diagnostics
- Social Post Parsing
- Prefetch Measurement
- Project Metadata
- Test Execution Framework
- File Upload Handling
- Search Citation Metrics
- Payload Rendering
- Docker Environment Configuration
- Tool Trigger Testing
- Resource Limit Management
- Stats Command Handling
- Audio/Video Planning
- Web Search Tool
- Search Prefetch Analysis
- Memory Admission Control
- Message Content Extraction
- Buddy Collection Management
- Transcript Capture Harness
- Attachment Token Management
- Social Post Research
- Prompt Assembly
- Video Selection Logic
- Extraction Schemas
- Chat Input Handling
- Content Key Generation
- Memory Schema Migration
- Channel Interaction Mocking
- WAV File Validation
- Message Attachment Handling
- Memory Migration Backfill
- API Documentation
- Conversation Recall Logic
- Interaction Mocking
- Episode Recall
- Memory Claim Lifecycle
- Media Duration Parsing
- Media Turn Testing
- Commit Style Rules
- Gacha Game Mechanics
- Project Branding
- Speech Segment Budgeting
- Channel Visibility Resolver
- Reddit Feed Parsing
- Episode Buffering
- Documentation Standards
- Git Commit Conventions
- Coding Best Practices
- Jev Event Storage
- Prompt Safety Constraints
- Audio Stream Decoding
- Attachment Size Limits
- Memory Replay Metrics
- Project Documentation
- LLM Tool Execution
- Trial Record Management
- Reply Reader Service
- Video Frame Extraction
- Speech Server Engines
- Linting Configuration
- HTTP Request Handling
- Jev Client Integration
- Model Evaluation Probes
- Speech Transcription Pipeline
- Speech Duration Parsing
- YAML Configuration Management
- Anime Search Integration
- Bot Command Features
- CI/CD & Operations
- Tone Detection Logic
- Fact Verification Report
- Text Cleaning Utilities
- Jev Configuration
- Report Generation CLI
- Judgment Criteria Logic
- Memory Tooling
- Report Command Testing
- Media Admission Policy
- Sprite Optimization
- Message Interaction Mocking

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 231 edges
2. `vitest` - 172 edges
3. `config` - 98 edges
4. `logger` - 66 edges
5. `createMessageHandler()` - 51 edges
6. `createInteractionHandler()` - 46 edges
7. `generateResponse()` - 44 edges
8. `discord.js` - 43 edges
9. `assertClaim()` - 42 edges
10. `closeDb()` - 40 edges

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

## Communities (148 total, 14 thin omitted)

### Community 0 - "Buddy Game Logic"
Cohesion: 0.12
Nodes (31): BuddyRow, DailyBuddyHatch, DailyHatchRow, generateBuddy(), generateName(), generatePersonality(), getDailyHatchRow(), getStreak() (+23 more)

### Community 1 - "Jev Replay Analysis"
Cohesion: 0.12
Nodes (28): ref_node_url, parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, detectToneWithSource(), agreement(), buildConfusionMatrix() (+20 more)

### Community 2 - "Qwen Transcript Analysis"
Cohesion: 0.11
Nodes (20): binOf(), ChatCompletion, ContentPart, promptFor(), quoted(), QwenFrame, QwenWatchInput, QwenWatchResult (+12 more)

### Community 3 - "Discord Command Handling"
Cohesion: 0.11
Nodes (21): Tech Stack (AGENTS.md), FR-1: Slash Command Interaction, Guild Permissions Are Derived From the API Surface, There Is No Build-Time Pin, and That Is Deliberate, discord.js, MAX_ATTACHMENTS, createClient(), askCommand (+13 more)

### Community 4 - "Code Formatting Config"
Cohesion: 0.05
Nodes (37): useLiteralKeys, files, ignore, formatter, enabled, indentStyle, indentWidth, lineWidth (+29 more)

### Community 5 - "Memory Analytics"
Cohesion: 0.12
Nodes (35): distinctRememberedUsers(), episodeCount(), memoryGrowthSeries(), newClaimsThisMonth(), retrySummary, tokenTotals, topChannels(), topPredicates() (+27 more)

### Community 6 - "Citation & Tone Builder"
Cohesion: 0.07
Nodes (42): clampToBudget(), fitCitations(), sourceHost(), EXPRESSION_URLS, getExpressionUrl(), lastExpressionByTone, __resetExpressionState(), TONE_EXPRESSIONS (+34 more)

### Community 7 - "Claim Tenancy Management"
Cohesion: 0.11
Nodes (44): Claims Tenancy Model, activateClaim(), appendEvidence(), appendEvidenceInTransaction(), assertClaimInTransaction(), assertGuildClaim(), assertSafeValue(), assertWritableGuild() (+36 more)

### Community 8 - "Hangman Game Logic"
Cohesion: 0.17
Nodes (24): SQLite Database Reference, buildHangmanBody(), handleHangmanGuess(), handleHangmanStart(), HANGMAN_COLORS, saveHangmanScore(), src_games_data_hangmanwords, src_games_data_hangmanwords_hangman_words (+16 more)

### Community 9 - "Extraction Job Scheduler"
Cohesion: 0.15
Nodes (24): finishRunTrace(), noteError(), noteSummary(), RunOutcome, RunStage, RunTrace, startRunTrace(), timeStage() (+16 more)

### Community 10 - "Episode Embedding"
Cohesion: 0.12
Nodes (18): response(), embedEpisodeText(), EpisodeEmbeddingRole, getEmbeddingClient(), resetEpisodeEmbeddingClientForTest(), delay(), embedPendingFacts(), sweep() (+10 more)

### Community 11 - "Claim Database Queries"
Cohesion: 0.08
Nodes (46): unpinClaim(), statusOf(), corrupt(), evidenceCount(), jevApplied(), statusOf(), activeClaimCount(), activityByDay() (+38 more)

### Community 12 - "Discord Mocking"
Cohesion: 0.06
Nodes (46): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+38 more)

### Community 13 - "Interaction Handling"
Cohesion: 0.07
Nodes (58): FR-7: Error Handling, Concurrency Binding Constraint, Multimodal Research Doc, Global In-Flight Attachment Budget, isMonitored(), markActive(), text(), asksAboutReplies() (+50 more)

### Community 14 - "Reminder System"
Cohesion: 0.10
Nodes (43): ref_discordjs_builders, assert(), fail(), main(), pass(), results, TestResult, listReminders() (+35 more)

### Community 15 - "Utility Tools"
Cohesion: 0.12
Nodes (27): Tool Footer, flipCoin(), FlipCoinResult, ForgetUserParams, GetAnimeScheduleParams, cityToTimezone, getCurrentTime(), GetCurrentTimeParams (+19 more)

### Community 16 - "Metrics & Diagnostics"
Cohesion: 0.15
Nodes (19): metrics Config Section, Privacy, Failure Diagnostics Table, countMemoryEvents(), ExtractionEventInput, FailureDiagnosticInput, getExtractionEventStatement(), getFailureDiagnosticStatement() (+11 more)

### Community 17 - "Social Reply Fetching"
Cohesion: 0.25
Nodes (26): array(), nonNegativeInteger(), object(), bilibiliAid(), fetchBilibiliReplies(), fetchBlueskyReplies(), BROWSER_USER_AGENT, compactReplyText() (+18 more)

### Community 18 - "Fact Date Resolution"
Cohesion: 0.12
Nodes (30): GuildFactDate, addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth() (+22 more)

### Community 19 - "Episode Tracking"
Cohesion: 0.29
Nodes (13): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), recordEpisodeMessage(), scheduleLull(), timers, addMessage() (+5 more)

### Community 20 - "Development Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, husky, lint-staged, pino-pretty, prettier (+5 more)

### Community 21 - "Session Attachment Management"
Cohesion: 0.15
Nodes (5): isStrippable(), WindowedSessionService, CapturingLlm, newConversation(), PNG_BASE64

### Community 22 - "Claim Reclassification"
Cohesion: 0.09
Nodes (31): zod, oldClaimId, undone, confidenceForEvidence(), isMoveTarget(), PredicateId, activeCount(), CandidateRow (+23 more)

### Community 23 - "Memory Shadow Testing"
Cohesion: 0.18
Nodes (15): asClaim(), asScenario(), evaluateMemoryShadow(), FixtureClaim, loadReplaySet(), MemoryShadowReport, percentile95(), REPLAY_PATH (+7 more)

### Community 24 - "Turn Lifecycle Management"
Cohesion: 0.06
Nodes (52): attachmentMarker(), resetForTest(), stopExtractionScheduler(), abortActiveTurns(), generateResponse(), __resetTestRunTurnFactory(), __setTestRunTurnFactory(), steeringForRequest (+44 more)

### Community 25 - "Claim Retrieval"
Cohesion: 0.11
Nodes (32): Bounded Retrieval Contract, ClaimSource, touchRecalled(), routeTopics(), ClaimRow, compareRetrieved(), getActiveClaims(), mapClaim() (+24 more)

### Community 26 - "Transcript Processing"
Cohesion: 0.16
Nodes (22): clearHistory(), fixturePath(), loadTranscript(), main(), parseTranscriptLine(), renderTokenTable(), requestMessageContent(), runTranscript() (+14 more)

### Community 27 - "Production Dependencies"
Cohesion: 0.15
Nodes (13): dependencies, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml, @napi-rs/canvas (+5 more)

### Community 28 - "Episode Persistence"
Cohesion: 0.08
Nodes (44): better-sqlite3, EpisodeMaintenanceReport, pruneEpisodesAndReembed(), persistEpisodeResult(), configMock, mocks, now, seedEpisode() (+36 more)

### Community 29 - "Rate Limiting & Persistence"
Cohesion: 0.07
Nodes (29): FR-6: Rate Limiting, Free-Tier TPM Ceiling Measurement, Attachment Bytes Do Not Live in History, Discord Gateway Layer, The Per-Minute Token Budget, RateLimiterConfig, RPM-Budget Accounting, Session Manager (+21 more)

### Community 30 - "Bug Reporting"
Cohesion: 0.15
Nodes (14): BugReportContext, BugReportInput, BugReportType, captureSnapshot(), countReportsSince(), MAX_CONTEXT_JSON_BYTES, queryRecentRows(), ReportAttachmentMetadata (+6 more)

### Community 31 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "Media Token Estimation"
Cohesion: 0.10
Nodes (43): geminiMimeType(), isStreamedUpload(), downloadAttachment(), prepareAttachments(), readWithinLimit(), durationFromTokens(), equalBins(), estimateMediaTokens() (+35 more)

### Community 33 - "Game Command Handling"
Cohesion: 0.24
Nodes (19): createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleHangmanGuide(), handleLeaderboard(), buildGameContainer(), buildTimeoutContainer(), GameContainerOptions (+11 more)

### Community 34 - "Build & Dev Scripts"
Cohesion: 0.07
Nodes (29): scripts, build, dev, dev:quiet, export:vault, format, format:check, harness (+21 more)

### Community 35 - "Fact Recall Ranking"
Cohesion: 0.13
Nodes (32): cosineSimilarity(), byScore(), cooldownPenalty(), coreRank(), countKind(), Ctx, factBoost(), FactClaim (+24 more)

### Community 36 - "Episode Replay Analysis"
Cohesion: 0.16
Nodes (15): flushOpenEpisodes(), resetEpisodeTrackerForTest(), ExtractionOutput, resetAllBuffers(), EpisodeReplayContext, GapDistribution, loadSessionHistorySnapshot(), measureEpisodeGaps() (+7 more)

### Community 37 - "YouTube Stream Processing"
Cohesion: 0.19
Nodes (19): metadata, realisticFormats, AudioFormat, audioFormats(), directHttpsUrl(), finiteNumber(), hasCodec(), headersOf() (+11 more)

### Community 38 - "Extraction Error Handling"
Cohesion: 0.08
Nodes (40): judgeEpisodeOperations(), ABORT_CODES, classifyExtractionError(), ExtractionErrorClassification, JevUnavailableError, SHUTDOWN_SENSITIVE_NAMES, TRANSIENT_HTTP_STATUSES, TRANSIENT_NETWORK_CODES (+32 more)

### Community 39 - "Project Requirements & Docs"
Cohesion: 0.12
Nodes (19): FR-10: Graceful Shutdown, FR-2: Mention/Reply Interaction, FR-3: Per-Channel Conversational Memory, FR-5: Tone Detection, Functional Requirements, Problem Statement, Product Requirements Document, Project Objectives (+11 more)

### Community 40 - "Anime Schedule Lookup"
Cohesion: 0.20
Nodes (19): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleResult, getCurrentSeason(), getTodayName() (+11 more)

### Community 41 - "Media Prefix Policy"
Cohesion: 0.36
Nodes (6): isobmffAllowsPrefix(), PrefixPolicy, prefixPolicyFor(), STREAMABLE_TYPES, box(), moovDeclaring()

### Community 42 - "Configuration Management"
Cohesion: 0.07
Nodes (36): Architecture (AGENTS.md), discord Config Section, emoji Config Section, fallback Config Section, games Config Section, gemini Config Section, logging Config Section, memory Config Section (+28 more)

### Community 43 - "Fact Retraction Logic"
Cohesion: 0.17
Nodes (16): renderFactSentence(), HiddenRetract, reconcileHiddenRetractions(), reconcileOne(), userFactSentence(), ClaimPeriod, retireClaim(), ACTIVE (+8 more)

### Community 44 - "LLM Model Routing"
Cohesion: 0.16
Nodes (6): ModelScopeLlm, adapter(), configState, RequestCall, responses(), TextLlm

### Community 45 - "Attachment Intake Policy"
Cohesion: 0.18
Nodes (21): attachment_url, Handing Her a File, Audio Intake Recommendation, PDF Intake Recommendation, Video Low Resolution Recommendation, Attachment Types and Their Ceilings, requestCarriesVideo(), ALLOWED_AUDIO_TYPES (+13 more)

### Community 46 - "System Architecture & Fallback"
Cohesion: 0.05
Nodes (62): Message Pipeline, System Architecture, Fallback Model (runbook), ADK Error Delivery Constraint, Concurrency & Lifecycle Under Retry, Gemini Failure Taxonomy, The Fallback Model, Gemini API (+54 more)

### Community 47 - "Tool Trigger Observations"
Cohesion: 0.13
Nodes (11): fixturePath, header, rememberFixturePath, searchWebFixturePath, temporaryDirectories, testCase, CaseSetRun, CaseObservations (+3 more)

### Community 48 - "Identity Resolution"
Cohesion: 0.06
Nodes (56): buildNameIndex(), escapeRegex(), isAscii(), MATCH_PRIORITY, MatchKind, NameCandidate, NameIndex, nicknameRows() (+48 more)

### Community 49 - "Activity Visualization"
Cohesion: 0.26
Nodes (14): @napi-rs/canvas, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+6 more)

### Community 50 - "Memory Migration Privacy"
Cohesion: 0.18
Nodes (14): claimCount(), seedLegacyRow(), tableExists(), assertClaim(), getActiveClaims(), normalizeKey(), sensitiveFactReason, activeValues() (+6 more)

### Community 51 - "ADK Integration Testing"
Cohesion: 0.14
Nodes (8): @google/adk, CapturingLlm, PDF_BASE64, sendPart(), CapturingRunner, makeInteraction(), mocks, turn()

### Community 52 - "TypeScript Configuration"
Cohesion: 0.22
Nodes (8): ./tsconfig.json, compilerOptions, noEmit, rootDir, types, exclude, extends, include

### Community 53 - "Reply Outcome Tracking"
Cohesion: 0.26
Nodes (8): outcomeForTurn, recordReplyOutcome(), ReplyOutcome, MEMORY_TOOL_NAMES, readRepliesTool, readReplies(), ReadRepliesParams, FOUND

### Community 54 - "Feature Testing & Cooldowns"
Cohesion: 0.10
Nodes (36): ref_node_module, assert(), fail(), main(), makeMessage(), pass(), results, TestResult (+28 more)

### Community 55 - "Extraction Job Queue"
Cohesion: 0.20
Nodes (13): shouldSample(), startExtractionScheduler(), advancePastRetryDelay(), configMock, drain(), enqueue(), enqueueDelayed(), enqueueJob() (+5 more)

### Community 56 - "Obsidian Memory Export"
Cohesion: 0.16
Nodes (18): Browsing Memory in Obsidian, js-yaml, factKey(), GuildMemoryClaim, ActiveClaimSubject, ActiveGuildSubject, ExportedClaim, ExportedGuildClaim (+10 more)

### Community 57 - "Model Routing Hedge"
Cohesion: 0.18
Nodes (5): ModelRoute, DeferredLlm, loggerMock, Outcome, responses()

### Community 58 - "Weather Data Retrieval"
Cohesion: 0.28
Nodes (8): emptyResult(), GeocodingResult, getWeather(), GetWeatherParams, GetWeatherResult, OpenMeteoWeather, weatherCodeToCondition(), wmoWeatherCodes

### Community 59 - "Privacy & Visibility"
Cohesion: 0.17
Nodes (12): channelVisibility, canRecall(), RecallScope, addNickname(), addUser(), here, other, forgetUser() (+4 more)

### Community 60 - "Attachment Report Handling"
Cohesion: 0.25
Nodes (14): isAllowedDiscordCdnUrl(), AttachmentCopyError, copyAttachment(), displayName(), handleReportCommand(), moduleDirectory, packageMetadata, projectDirectory (+6 more)

### Community 61 - "Jev Judgment Logic"
Cohesion: 0.23
Nodes (13): getJevClient(), BoundedAlias, boundedAliases(), judgeEpisodeAdmission(), judgeHiddenRetractions(), judgeTurn(), MemoryVerification, timeOfDay() (+5 more)

### Community 62 - "Media Digest Generation"
Cohesion: 0.12
Nodes (31): boundedString(), coverageLine(), cutAtWord(), formatClock(), frameInterval(), framesLine(), HEARD_LINES, isRecord() (+23 more)

### Community 63 - "Deployment & Attachment Limits"
Cohesion: 0.15
Nodes (17): FR-9: Docker Deployment, ALLOWED_IMAGE_TYPES Consolidation, Attachment History Stripping, Byte Cap as Duration Proxy, Container Memory Cap Correction, Flash-Lite Modality Verification, Global In-Flight Byte Budget, Inline Data vs Files API Decision (+9 more)

### Community 64 - "Speech-to-Text Server"
Cohesion: 0.13
Nodes (17): Speech-to-text HTTP sidecar: Silero VAD -> SenseVoice language ID -> Moonshine…, collections, http_server, io, json, math, numpy, os (+9 more)

### Community 65 - "Bluesky Integration"
Cohesion: 0.09
Nodes (24): ref_node_os, resolveBlueskyDid(), createSocialPostViewer(), failure(), initializeSocialPosts(), isAbort(), isYtDlpPlatform(), SocialPostSettings (+16 more)

### Community 66 - "Shutdown Reliability Handling"
Cohesion: 0.62
Nodes (4): beginShutdown(), isShuttingDown(), resetForTest(), options()

### Community 67 - "Bluesky Data Parsers"
Cohesion: 0.12
Nodes (35): base(), BlueskyBlob, blueskyQuote(), capped(), compact(), date(), finiteNumber(), headers() (+27 more)

### Community 68 - "Quota Diagnostics"
Cohesion: 0.20
Nodes (12): BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey(), DIAGNOSTIC_TIMEOUT_MS, errorText(), KEY_IS_LIVE, OUTPACING_THE_CAP, SPENT_FOR_THE_DAY (+4 more)

### Community 69 - "Social Post Parsing"
Cohesion: 0.11
Nodes (29): ref_node_fs, vitest, ReplyFetchContext, hostMatches(), HOSTS, parseSocialPostUrl(), platformForHost(), target() (+21 more)

### Community 70 - "Prefetch Measurement"
Cohesion: 0.21
Nodes (9): main(), MeasurementAnomaly, Options, parseOptions(), percentile(), PrefetchMeasurementCase, PrefetchMeasurementSummary, PrefetchMeasurementTrial (+1 more)

### Community 71 - "Project Metadata"
Cohesion: 0.10
Nodes (19): description, engines, node, main, name, type, version, @biomejs/biome (+11 more)

### Community 72 - "Test Execution Framework"
Cohesion: 0.25
Nodes (9): ref_node_dns, ref_node_net, ErrorRecoveryPlugin, main(), results, runQuery(), test(), TestResult (+1 more)

### Community 73 - "File Upload Handling"
Cohesion: 0.17
Nodes (9): countedBody(), deleteFile(), FileResource, getFile(), sleep(), streamToFiles(), UploadedFile, videoDurationSec() (+1 more)

### Community 74 - "Search Citation Metrics"
Cohesion: 0.07
Nodes (19): ref_node_async_hooks, citationsForTurn, SearchCitation, attachmentOptionName(), NAME_MENTION_REGEX, createInteraction(), askWith(), metrics (+11 more)

### Community 75 - "Payload Rendering"
Cohesion: 0.36
Nodes (12): asObject(), asObjects(), chunkLabel(), componentDetails(), walk(), isComponentsV2Payload(), PayloadObject, renderEmbeds() (+4 more)

### Community 76 - "Docker Environment Configuration"
Cohesion: 0.20
Nodes (10): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+2 more)

### Community 77 - "Tool Trigger Testing"
Cohesion: 0.16
Nodes (19): CASE_SETS, asCase(), asClaim(), asHeader(), asHistoryLine(), asMember(), asSessionState(), DEFAULT_CASE_SET_PATH (+11 more)

### Community 78 - "Resource Limit Management"
Cohesion: 0.32
Nodes (10): sizeLimitFor(), Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION, mimeForPath(), resolveKey() (+2 more)

### Community 79 - "Stats Command Handling"
Cohesion: 0.16
Nodes (16): handleStatsCommand(), isStatsView(), logStatsError(), selectionFor(), sendStatsError(), charts, contentFor(), errors (+8 more)

### Community 80 - "Audio/Video Planning"
Cohesion: 0.10
Nodes (21): @google/genai, HalfWatch, mocks, CoveragePlan, elapsedSince(), getClient(), instructions(), mediaPart() (+13 more)

### Community 81 - "Web Search Tool"
Cohesion: 0.13
Nodes (9): runSearchTurn(), ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS, searchWebTool, searchWeb(), SearchWebParams, TavilyResponse (+1 more)

### Community 82 - "Search Prefetch Analysis"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "Memory Admission Control"
Cohesion: 0.09
Nodes (26): Memory, liveAdapters(), AdmissionResult, admitEpisode(), isTrivial(), normalize(), precheckEpisode(), SENSITIVE_PATTERNS (+18 more)

### Community 84 - "Message Content Extraction"
Cohesion: 0.14
Nodes (24): ImageAttachment, isSupportedMedia(), describeEmbed(), describeForwardedSnapshots(), describePoll(), embedMatchesSocialPost(), extractComponentMedia(), walk() (+16 more)

### Community 85 - "Buddy Collection Management"
Cohesion: 0.27
Nodes (11): buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount(), handleBuddyCollection(), { getBuddyCollection }, BuddyData, getBuddyCollection() (+3 more)

### Community 86 - "Transcript Capture Harness"
Cohesion: 0.11
Nodes (13): CaptureInput, CaptureKind, CaptureRecord, CaptureSink, createCaptureSink(), benchmarkTranscript, CapturingRunner, mocks (+5 more)

### Community 87 - "Attachment Token Management"
Cohesion: 0.07
Nodes (39): Configuration (AGENTS.md), FR-8: Response Formatting, PDF Token Cost Measurement, Attachment Token Admission, ref_node_http, measureAttachmentTokens(), needsMeasuring(), GEMINI_IMAGE_TOKENS (+31 more)

### Community 88 - "Social Post Research"
Cohesion: 0.29
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "Prompt Assembly"
Cohesion: 0.19
Nodes (20): FR-4: Layered Personality Prompts, Prompt System, AssemblerInput, assembleSystemPrompt(), buildContextPrompt(), getTimeOfDay(), CORE_PROMPT, CORE_PROMPT_FORGET_ONLY (+12 more)

### Community 90 - "Video Selection Logic"
Cohesion: 0.39
Nodes (5): PlayableVideo, audioRank(), qualifies(), selectPlayableVideo(), VideoCandidate

### Community 91 - "Extraction Schemas"
Cohesion: 0.05
Nodes (45): AddOperationSchema, calendarDateProperties, datedGuildPredicates, EXTRACTION_RESPONSE_SCHEMA, ExtractionOutputSchema, ExtractionSubject, GuildAddOperationSchema, GuildExtractionOp (+37 more)

### Community 92 - "Chat Input Handling"
Cohesion: 0.33
Nodes (5): dotenv, ref_node_readline, handleInput(), main(), username

### Community 93 - "Content Key Generation"
Cohesion: 0.32
Nodes (9): ref_node_crypto, bytesContentKey(), DISCORD_CDN_HOSTS, discordAttachmentContentKey(), postContentKey(), requireId(), youtubeContentKey(), playableVideo() (+1 more)

### Community 94 - "Memory Schema Migration"
Cohesion: 0.17
Nodes (11): runMigrations(), columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable() (+3 more)

### Community 96 - "WAV File Validation"
Cohesion: 0.38
Nodes (5): read_wav(), WavError, make_wav(), ReadWavTest, ValueError

### Community 97 - "Message Attachment Handling"
Cohesion: 0.27
Nodes (8): Attachment, collection(), extract(), forwardedIn, message(), referenceMessage(), repliedTo, snapshot()

### Community 98 - "Memory Migration Backfill"
Cohesion: 0.27
Nodes (13): attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow, legalScopes() (+5 more)

### Community 99 - "API Documentation"
Cohesion: 0.22
Nodes (8): API, ASR Sidecar, Build and Run, Configuration, `GET /health`, Models and Licences, `POST /transcribe?maxSpeechSec=120`, Tests

### Community 100 - "Conversation Recall Logic"
Cohesion: 0.22
Nodes (5): entryWork(), jevConfig, mocks, turnOptions(), turnWith()

### Community 102 - "Episode Recall"
Cohesion: 0.11
Nodes (25): registerChannelVisibility(), resetChannelVisibilityForTest(), UNKNOWN, buildEpisodeRecallBlock(), formatEpisodeRecallBlock(), RecalledEpisode, recallEpisodes(), selectEpisodesWithinBudget() (+17 more)

### Community 103 - "Memory Claim Lifecycle"
Cohesion: 0.36
Nodes (8): Claim Lifecycle, Claims Memory Architecture, extraction_queue Table, memory_claim_fts Table, memory_claim Table, memory_events Table, memory_evidence Table, Vault Export

### Community 104 - "Media Duration Parsing"
Cohesion: 0.33
Nodes (8): Box, movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0(), mvhdV1()

### Community 105 - "Media Turn Testing"
Cohesion: 0.16
Nodes (5): digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf()

### Community 107 - "Gacha Game Mechanics"
Cohesion: 0.20
Nodes (23): handleGachaMention(), statBar(), formatBuddySummary(), formatHatchTimeRemaining(), handleBuddyLeaderboard(), handleBuddyStats(), handleBuddyView(), handleHatch() (+15 more)

### Community 108 - "Project Branding"
Cohesion: 0.67
Nodes (3): Maniwa Roka, Rokabot, Senren*Banka

### Community 109 - "Speech Segment Budgeting"
Cohesion: 0.42
Nodes (4): Keep time-ordered segments within the speech budget, spread across the clip.…, Segment, select_segments(), SelectSegmentsTest

### Community 110 - "Channel Visibility Resolver"
Cohesion: 0.31
Nodes (4): ChannelVisibilityResolver, createChannelVisibilityResolver(), everyoneRole, resolverFor()

### Community 111 - "Reddit Feed Parsing"
Cohesion: 0.45
Nodes (11): decodeEntities(), entryAuthor(), entryContent(), feedEntries(), feedField(), htmlToText(), NAMED_ENTITIES, parseRedditFeedPost() (+3 more)

### Community 112 - "Episode Buffering"
Cohesion: 0.18
Nodes (7): mocks, BufferedMessage, BufferedMessageOptions, buffers, ChannelBuffer, getUserMap(), EpisodeLine

### Community 116 - "Jev Event Storage"
Cohesion: 0.08
Nodes (18): ref_node_path, evicted, closeDb(), createTables(), countExtractionSamples(), getJevEventStatement(), JevEventInput, JevEventKind (+10 more)

### Community 117 - "Prompt Safety Constraints"
Cohesion: 0.14
Nodes (24): PAST_FACT_MARKER, buildFactsEnvelope(), buildOverheardBlock(), FACTS_UNTRUSTED_DATA_LABEL, isSafeFactKey(), isSafeFactScalar(), MAX_FACT_KEY_LEN, MAX_FACT_VALUE_LEN (+16 more)

### Community 119 - "Attachment Size Limits"
Cohesion: 0.21
Nodes (7): RFC-3003, GEMINI_SPELLINGS, MAX_AUDIO_SIZE_BYTES, MAX_DOCUMENT_SIZE_BYTES, MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES, UploadLike

### Community 120 - "Memory Replay Metrics"
Cohesion: 0.22
Nodes (12): ref_node_perf_hooks, argumentsFrom(), estimatedTokens(), inputText(), measure(), loadTranscriptLines(), main(), offlineAdapters() (+4 more)

### Community 121 - "Project Documentation"
Cohesion: 0.24
Nodes (11): Critical Do-Nots, Project (Rokabot description), Reference Docs (AGENTS.md), Rokabot PRD, Documentation (README index), Jev Integration (Research Doc), GPT-6-Astra, Jev Rollout Plan (+3 more)

### Community 122 - "LLM Tool Execution"
Cohesion: 0.25
Nodes (4): REMEMBER_TURN, runTurn(), ScriptedLlm, rememberUserTool

### Community 123 - "Trial Record Management"
Cohesion: 0.19
Nodes (11): getLocalHour(), emitTrialRecord(), formatTrialRecord(), TrialRecord, record, cases, header, ok() (+3 more)

### Community 124 - "Reply Reader Service"
Cohesion: 0.23
Nodes (7): createReplyReader(), isAbort(), replyReader, ReplyLookup, FOUND, readerWith(), SETTINGS

### Community 125 - "Video Frame Extraction"
Cohesion: 0.08
Nodes (35): ref_node_child_process, EMPTY, extractFrame(), extractFrames(), frameBins(), frameCount(), FrameRunner, FrameSource (+27 more)

### Community 126 - "Speech Server Engines"
Cohesion: 0.33
Nodes (6): Engines, load_engines(), main(), SpeechServer, NamedTuple, ThreadingHTTPServer

### Community 127 - "Linting Configuration"
Cohesion: 0.67
Nodes (3): lint-staged, *.{json,md,yml,yaml}, *.{ts,js}

### Community 129 - "Jev Client Integration"
Cohesion: 0.24
Nodes (9): Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk, @typesafe-ai/sdk, undici, fetchWithKeepAlive(), resetJevClientForTest(), { jevConfig } (+1 more)

### Community 130 - "Model Evaluation Probes"
Cohesion: 0.24
Nodes (9): CapturingErrorPlugin, classify(), ITERATIONS, main(), MODELS, PROBES, runOne(), RunOutcome (+1 more)

### Community 131 - "Speech Transcription Pipeline"
Cohesion: 0.60
Nodes (5): decode(), detect_speech(), language_code(), transcribe(), ndarray

### Community 134 - "Anime Search Integration"
Cohesion: 0.33
Nodes (5): AnimeResult, JikanAnimeEntry, JikanResponse, SearchAnimeParams, SearchAnimeResult

### Community 135 - "Bot Command Features"
Cohesion: 0.31
Nodes (7): Features, gachaCommand, hangmanCommand, shiritoriCommand, animeCommand, remindCommand, toolCommands

### Community 136 - "CI/CD & Operations"
Cohesion: 0.23
Nodes (13): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping), Deployment & Operations (+5 more)

### Community 137 - "Tone Detection Logic"
Cohesion: 0.28
Nodes (7): Expressions & Tones, ToneKey, ToneRule, TONE_STYLES, ToneStyle, JevReplayReport, MeasureRequestInput

### Community 138 - "Fact Verification Report"
Cohesion: 0.15
Nodes (11): OperationApplicationReport, activeFacts(), apply(), candidateFacts(), episode(), factsWithStatus(), mocks, output() (+3 more)

### Community 140 - "Jev Configuration"
Cohesion: 0.19
Nodes (12): jev Config Section, Getting Started, npm run test:live Gate, Deliberately Not Done, Jev Design (Per-Feature Modes), Gemini-Outage Fallback (Qwen3.5), Jev Shadow Mode, Jev Judgments (+4 more)

### Community 141 - "Report Generation CLI"
Cohesion: 0.43
Nodes (6): main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne()

### Community 142 - "Judgment Criteria Logic"
Cohesion: 0.25
Nodes (3): LOOKUP_QUESTION, TONE_CRITERIA, mocks

### Community 143 - "Memory Tooling"
Cohesion: 0.33
Nodes (4): embeddings, originalMemory, runForget(), toolContextWith()

### Community 145 - "Media Admission Policy"
Cohesion: 0.33
Nodes (5): ALLOWED_MEDIA_TYPES, admitted, LABELS, linkOption, slots

## Ambiguous Edges - Review These
- `Second Opinion` → `Rokabot TRD`  [AMBIGUOUS]
  docs/research/jev-integration.md · relation: conceptually_related_to

## Knowledge Gaps
- **755 isolated node(s):** `BuddyRow`, `DailyBuddyHatch`, `DailyHatchRow`, `JevReplayCutoffRow`, `SessionHistoryReplayRow` (+750 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1043 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Second Opinion` and `Rokabot TRD`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `vitest` connect `Social Post Parsing` to `Buddy Game Logic`, `Jev Replay Analysis`, `Qwen Transcript Analysis`, `Discord Command Handling`, `Citation & Tone Builder`, `Claim Tenancy Management`, `Hangman Game Logic`, `Extraction Job Scheduler`, `Episode Embedding`, `Claim Database Queries`, `Interaction Handling`, `Reminder System`, `Metrics & Diagnostics`, `Fact Date Resolution`, `Episode Tracking`, `Session Attachment Management`, `Claim Reclassification`, `Memory Shadow Testing`, `Turn Lifecycle Management`, `Claim Retrieval`, `Episode Persistence`, `Rate Limiting & Persistence`, `Bug Reporting`, `Media Token Estimation`, `Fact Recall Ranking`, `Episode Replay Analysis`, `YouTube Stream Processing`, `Extraction Error Handling`, `Project Requirements & Docs`, `Media Prefix Policy`, `Fact Retraction Logic`, `LLM Model Routing`, `Attachment Intake Policy`, `System Architecture & Fallback`, `Tool Trigger Observations`, `Identity Resolution`, `Activity Visualization`, `Memory Migration Privacy`, `ADK Integration Testing`, `Reply Outcome Tracking`, `Feature Testing & Cooldowns`, `Extraction Job Queue`, `Model Routing Hedge`, `Privacy & Visibility`, `Jev Judgment Logic`, `Media Digest Generation`, `Bluesky Integration`, `Shutdown Reliability Handling`, `Bluesky Data Parsers`, `Quota Diagnostics`, `Prefetch Measurement`, `Project Metadata`, `File Upload Handling`, `Search Citation Metrics`, `Tool Trigger Testing`, `Resource Limit Management`, `Stats Command Handling`, `Audio/Video Planning`, `Web Search Tool`, `Search Prefetch Analysis`, `Memory Admission Control`, `Message Content Extraction`, `Buddy Collection Management`, `Transcript Capture Harness`, `Attachment Token Management`, `Prompt Assembly`, `Video Selection Logic`, `Extraction Schemas`, `Content Key Generation`, `Memory Schema Migration`, `Message Attachment Handling`, `Conversation Recall Logic`, `Episode Recall`, `Media Duration Parsing`, `Media Turn Testing`, `Channel Visibility Resolver`, `Episode Buffering`, `Jev Event Storage`, `Prompt Safety Constraints`, `Attachment Size Limits`, `LLM Tool Execution`, `Trial Record Management`, `Reply Reader Service`, `Video Frame Extraction`, `Jev Client Integration`, `YAML Configuration Management`, `Bot Command Features`, `Fact Verification Report`, `Jev Configuration`, `Judgment Criteria Logic`, `Memory Tooling`, `Report Command Testing`, `Media Admission Policy`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Why does `getDb()` connect `Claim Database Queries` to `Buddy Game Logic`, `Memory Analytics`, `Claim Tenancy Management`, `Hangman Game Logic`, `Extraction Job Scheduler`, `Fact Verification Report`, `Episode Embedding`, `Interaction Handling`, `Reminder System`, `Memory Tooling`, `Report Command Testing`, `Metrics & Diagnostics`, `Episode Tracking`, `Claim Reclassification`, `Memory Shadow Testing`, `Turn Lifecycle Management`, `Claim Retrieval`, `Transcript Processing`, `Episode Persistence`, `Bug Reporting`, `Game Command Handling`, `Fact Recall Ranking`, `Episode Replay Analysis`, `Extraction Error Handling`, `Fact Retraction Logic`, `Identity Resolution`, `Memory Migration Privacy`, `ADK Integration Testing`, `Feature Testing & Cooldowns`, `Obsidian Memory Export`, `Privacy & Visibility`, `Attachment Report Handling`, `Docker Environment Configuration`, `Tool Trigger Testing`, `Memory Admission Control`, `Buddy Collection Management`, `Transcript Capture Harness`, `Attachment Token Management`, `Extraction Schemas`, `Memory Schema Migration`, `Memory Migration Backfill`, `Episode Recall`, `Gacha Game Mechanics`, `Jev Event Storage`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `config` connect `Attachment Token Management` to `Buddy Game Logic`, `Jev Client Integration`, `Model Evaluation Probes`, `Discord Command Handling`, `Claim Tenancy Management`, `Hangman Game Logic`, `Extraction Job Scheduler`, `Episode Embedding`, `Interaction Handling`, `Reminder System`, `Utility Tools`, `Memory Tooling`, `Social Reply Fetching`, `Fact Date Resolution`, `Episode Tracking`, `Claim Reclassification`, `Memory Shadow Testing`, `Turn Lifecycle Management`, `Claim Retrieval`, `Episode Persistence`, `Rate Limiting & Persistence`, `Media Token Estimation`, `Fact Recall Ranking`, `YouTube Stream Processing`, `Extraction Error Handling`, `Anime Schedule Lookup`, `Configuration Management`, `Fact Retraction Logic`, `System Architecture & Fallback`, `Identity Resolution`, `Memory Migration Privacy`, `Feature Testing & Cooldowns`, `Obsidian Memory Export`, `Weather Data Retrieval`, `Privacy & Visibility`, `Attachment Report Handling`, `Jev Judgment Logic`, `Bluesky Integration`, `Quota Diagnostics`, `Test Execution Framework`, `File Upload Handling`, `Search Citation Metrics`, `Audio/Video Planning`, `Memory Admission Control`, `Transcript Capture Harness`, `Content Key Generation`, `Conversation Recall Logic`, `Episode Recall`, `Episode Buffering`, `Jev Event Storage`, `Attachment Size Limits`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `createMessageHandler()` (e.g. with `.canAdmitCalls()` and `.reserveCalls()`) actually correct?**
  _`createMessageHandler()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BuddyRow`, `DailyBuddyHatch`, `DailyHatchRow` to the rest of the system?**
  _755 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Buddy Game Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._