# Graph Report - graph-pack  (2026-10-17)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 4658 nodes · 12762 edges · 223 communities (190 shown, 33 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 565 edges (avg confidence: 0.91)
- Token cost: 10,464 input · 2,375 output

## Graph Freshness
- Built from commit: `c53cfea4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Buddy Game Logic
- Jev Replay Analysis
- Qwen Model Monitoring
- Discord Command Handling
- Code Formatting Config
- Memory Analytics Dashboard
- Message Citation Formatting
- Claim Extraction Logic
- Feature Testing Suite
- Extraction Error Handling
- Episode Embedding Persistence
- Activity Query Metrics
- Discord Data Schemas
- Turn Admission Reliability
- Tool Command Handlers
- Tool Execution Handlers
- Discord Configuration
- Social Platform Fetchers
- Calendar Date Utilities
- Episode Tracking Logic
- Development Tooling
- Session Media Handling
- Memory Database Maintenance
- Channel Visibility Storage
- Session Management
- Memory Retrieval System
- Transcript Processing
- Project Dependencies
- Media Digest Storage
- Discord Rate Limiting
- Bug Report Storage
- TypeScript Configuration
- Media Token Estimation
- LLM Provider Configuration
- Build Scripts
- Recall Calibration Logic
- Memory Replay Metrics
- YouTube Stream Processing
- Failure Classification
- Conversational Memory
- Anime Schedule Fetcher
- Attachment Download Logic
- Model Fallback Strategy
- Fact Reconciliation Logic
- Fallback Model Logic
- Attachment Intake Limits
- Gemini Reliability Logic
- Background Generation Jobs
- Turn Context Documentation
- Chart Rendering Utilities
- Privacy Guard Logic
- Google ADK Integration
- TypeScript Test Config
- Project Dependencies
- Discord Game Commands
- Extraction Scheduler
- Obsidian Memory Export
- Usage Budgeting
- Weather API Integration
- Identity Resolution Logic
- Attachment Reporting Logic
- Jev System Integration
- Media Digest Formatting
- Multimodal Research Docs
- Speech-to-Text Sidecar
- Social Post Processing
- Shutdown Lifecycle Management
- Bluesky Data Parsers
- Quota Diagnostic Tools
- Social Post Testing
- Prefetch Measurement Tools
- Project Configuration
- Deployment Documentation
- File Upload Handling
- Reply Outcome Metrics
- Payload Rendering
- Docker Configuration
- Tool Trigger Testing
- Token Limit Measurement
- View Rendering Logic
- Media Observation Planning
- Voice Research Documentation
- Search Prefetch Reporting
- Extraction Queue Management
- Attachment Processing Logic
- Collection Management
- Test Environment Mocks
- Capability Configuration
- Social Post Research
- System Prompt Architecture
- Video Variant Selection
- Guild Extraction Schemas
- Chat Testing Utilities
- Recall Calibration
- Memory Claim Schema
- Anthropic LLM Client
- WAV File Processing
- Character Loading Logic
- Memory Migration Utilities
- ASR Sidecar Documentation
- Turn Context Management
- Reliability Strategy
- Media Recall Logic
- Memory Claim Architecture
- Media Duration Utilities
- Turn Media Testing
- Code Style Config
- Buddy Game Testing
- Project References
- Speech Budgeting Logic
- Markdown Rendering Utilities
- Reddit Feed Parsing
- Voice Response Analysis
- Documentation Standards
- Git Commit Conventions
- Coding Guidelines
- Fact Correction Tests
- Fact Retrieval Safety
- Audio Decoding Tests
- Token Usage Tracking
- Reply Diagnostic Tools
- Project Documentation
- ADK Tool Context
- Status Cycle Management
- Social Reply Processing
- Frame Extraction Logic
- Speech Server Engine
- Linting Configuration
- HTTP Request Handler
- LLM Profile Probing
- Gemini Model Comparison
- Speech Transcription
- Speech Parsing Tests
- Configuration Loading
- Anime Search Integration
- Stats Command Handling
- Deployment Workflow
- Character Context Management
- Fact Verification Logic
- Text Cleaning Utilities
- Roka Agent Core
- Report CLI Tools
- Reminder Scheduling System
- Episode Vector Storage
- Discord Architecture Docs
- Prompt Engine Design
- Attachment Token Costing
- Anthropic SDK Integration
- Markdown Formatting Rules
- Model Profile Documentation
- Project Documentation Index
- Persona Replay Logic
- Embedding Client Service
- Memory System Overview
- Token Budgeting System
- Episode Maintenance Logic
- System Architecture Overview
- Update Notification Service
- Character Harness Research
- Vector Persistence Testing
- Bot Documentation
- Label Calibration Logic
- Character Pack Configuration
- Turn Judgment Logic
- Search Prefetch Logic
- Episode Recall Logic
- Model Budgeting Configuration
- Media Watching Logic
- Chat Completion Provider
- Deployment Guide
- Auto-Deploy Platforms
- Memory Statistics
- Persona Reporting
- Persona Turn Logic
- Embeddings TypeScript Config
- Mock Fetch Utilities
- Guild Fact Schemas
- Embedding Fingerprinting
- Timezone Utilities
- Bot Feature Overview
- Embeddings API Documentation
- Episode Precheck Logic
- Time Resolution Utilities
- Functional Requirements
- Data Model Assembler
- Claude/Gemini Runner
- Extraction Schema Testing
- Dialogue Style Guide
- Persona Identity Docs
- Embedding Smoke Tests
- Search Citation Logic
- Markdown Guard Utilities
- Database Migration Logic
- Project Changelog
- Character Pack Docs
- Link Priority Logic
- Guild Date Resolver
- Audio-Video Documentation
- Release Configuration
- Answering Documentation
- Speech Documentation
- Annoyed Persona Mood
- Competitive Persona Mood
- Confident Mood
- Curious Mood
- Domestic Life
- Flustered Mood
- Mischievous Mood
- Nostalgic Mood
- Playful Mood
- Sincere Mood
- Sleepy Mood
- Tender Mood
- Hard Boundaries
- Image Handling
- Safety Redirection
- Situational Context
- Tool Usage
- Image Pruning Script
- Calm Mood

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 247 edges
2. `vitest` - 225 edges
3. `config` - 111 edges
4. `logger` - 73 edges
5. `createMessageHandler()` - 54 edges
6. `discord.js` - 50 edges
7. `generateResponse()` - 49 edges
8. `closeDb()` - 49 edges
9. `createInteractionHandler()` - 48 edges
10. `assertClaim()` - 46 edges

## Surprising Connections (you probably didn't know these)
- `At a Glance` --references--> `ResolvedModel`  [INFERRED]
  docs/trd/models.md → src/config.ts
- `At a Glance` --references--> `WindowedSessionService`  [INFERRED]
  docs/trd/data.md → src/agent/session.ts
- `ADK Error Delivery Constraint` --references--> `ProviderError`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/providerError.ts
- `Render` --references--> `key()`  [INFERRED]
  docs/research/auto-deploy-platforms.md → src/agent/replyShape.ts
- `Situation Block` --references--> `getLocalHour()`  [INFERRED]
  docs/trd/prompt-engine.md → src/utils/timezone.ts

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

## Communities (223 total, 33 thin omitted)

### Community 0 - "Buddy Game Logic"
Cohesion: 0.12
Nodes (31): SQLite Database Reference, BuddyRow, DailyBuddyHatch, DailyHatchRow, generateBuddy(), generateName(), generatePersonality(), getDailyHatchRow() (+23 more)

### Community 1 - "Jev Replay Analysis"
Cohesion: 0.11
Nodes (28): ref_node_url, parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, agreement(), buildConfusionMatrix(), buildProbabilityBins() (+20 more)

### Community 2 - "Qwen Model Monitoring"
Cohesion: 0.09
Nodes (27): Qwen Watcher, binOf(), ChatCompletion, ContentPart, promptFor(), quoted(), QwenFrame, QwenWatchInput (+19 more)

### Community 3 - "Discord Command Handling"
Cohesion: 0.11
Nodes (22): Tech Stack (AGENTS.md), FR-1: Slash Command Interaction, Features, discord.js, createClient(), askCommand, command, gachaCommand (+14 more)

### Community 4 - "Code Formatting Config"
Cohesion: 0.05
Nodes (37): useLiteralKeys, files, ignore, formatter, enabled, indentStyle, indentWidth, lineWidth (+29 more)

### Community 5 - "Memory Analytics Dashboard"
Cohesion: 0.14
Nodes (30): episodeCount(), memoryGrowthSeries(), newClaimsThisMonth(), retrySummary, tokenTotals, topChannels(), topPredicates(), topRememberedMembers() (+22 more)

### Community 6 - "Message Citation Formatting"
Cohesion: 0.08
Nodes (36): clampToBudget(), fitCitations(), sourceHost(), buildRokaMessage(), buildToolFooter(), footerLeads, longestPostLabel, longestPostMediaLabel (+28 more)

### Community 7 - "Claim Extraction Logic"
Cohesion: 0.05
Nodes (85): Extraction, Main-Model Judge, Memory Judge, Memory Judgments, Claims Tenancy Model, evicted, liveAdapters(), promptTokenTotal() (+77 more)

### Community 8 - "Feature Testing Suite"
Cohesion: 0.15
Nodes (28): assert(), fail(), pass(), results, TestResult, buildHangmanBody(), handleHangmanGuess(), handleHangmanStart() (+20 more)

### Community 9 - "Extraction Error Handling"
Cohesion: 0.12
Nodes (30): ABORT_CODES, classifyExtractionError(), ExtractionErrorClassification, SHUTDOWN_SENSITIVE_NAMES, TRANSIENT_HTTP_STATUSES, TRANSIENT_NETWORK_CODES, finishRunTrace(), noteError() (+22 more)

### Community 10 - "Episode Embedding Persistence"
Cohesion: 0.13
Nodes (18): EmbeddingResult, embedEpisodeText(), EpisodeEmbeddingRole, persistEpisodeResult(), EpisodeRunResult, delay(), embedPendingFacts(), sweep() (+10 more)

### Community 11 - "Activity Query Metrics"
Cohesion: 0.10
Nodes (28): activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome, CountByPredicate (+20 more)

### Community 12 - "Discord Data Schemas"
Cohesion: 0.05
Nodes (46): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+38 more)

### Community 13 - "Turn Admission Reliability"
Cohesion: 0.09
Nodes (44): Global In-Flight Byte Budget, Turn Admission, isMonitored(), markActive(), SOCIAL_POST_UNTRUSTED_DATA_LABEL, asksAboutReplies(), withReplyOutcomes(), withSearchCitations() (+36 more)

### Community 14 - "Tool Command Handlers"
Cohesion: 0.18
Nodes (23): ref_discordjs_builders, fillLine(), mocks, createToolCommandHandler(), TOOL_COMMAND_NAMES, handleAnime(), dueSlots(), handleRemind() (+15 more)

### Community 15 - "Tool Execution Handlers"
Cohesion: 0.12
Nodes (26): Tool Footer, flipCoin(), FlipCoinResult, ForgetUserParams, cancelReminderTool, flipCoinTool, forgetUserTool, getAnimeScheduleTool (+18 more)

### Community 16 - "Discord Configuration"
Cohesion: 0.14
Nodes (15): discord Config Section, emoji Config Section, games Config Section, logging Config Section, metrics Config Section, session Config Section, Configuration (README), Privacy (+7 more)

### Community 17 - "Social Platform Fetchers"
Cohesion: 0.21
Nodes (28): resolveBlueskyDid(), array(), nonNegativeInteger(), bilibiliAid(), fetchBilibiliReplies(), fetchBlueskyReplies(), BROWSER_USER_AGENT, compactReplyText() (+20 more)

### Community 18 - "Calendar Date Utilities"
Cohesion: 0.26
Nodes (16): addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth(), monthForMonth() (+8 more)

### Community 19 - "Episode Tracking Logic"
Cohesion: 0.14
Nodes (22): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), resetEpisodeTrackerForTest(), scheduleLull() (+14 more)

### Community 20 - "Development Tooling"
Cohesion: 0.14
Nodes (14): devDependencies, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, husky, lint-staged, pino-pretty, prettier (+6 more)

### Community 21 - "Session Media Handling"
Cohesion: 0.11
Nodes (12): At a Glance, Bytes Do Not Stay in History, Configuration, Media, Source Files, Token Admission, attachmentMarker(), isStrippable() (+4 more)

### Community 22 - "Memory Database Maintenance"
Cohesion: 0.05
Nodes (63): Failure Diagnostics Table, claimCount(), seedLegacyRow(), tableExists(), oldClaimId, undone, cleanupExpired(), monitoredChannels (+55 more)

### Community 23 - "Channel Visibility Storage"
Cohesion: 0.06
Nodes (45): Database File, Storage Schema, Unified Recall, openFixture(), channelVisibility, ChannelVisibilityResolver, registerChannelVisibility(), resetChannelVisibilityForTest() (+37 more)

### Community 24 - "Session Management"
Cohesion: 0.07
Nodes (34): abortActiveTurns(), APP_NAME, clearSessionErrorCount(), idleTimers, incrementSessionErrorCount(), rehydrationSuppressed, sessionErrorCounts, sessionService (+26 more)

### Community 25 - "Memory Retrieval System"
Cohesion: 0.06
Nodes (67): memory Config Section, Memory, Bounded Retrieval Contract, cosineSimilarity(), ClaimSource, GuildMemoryClaim, touchRecalled(), routeTopics() (+59 more)

### Community 26 - "Transcript Processing"
Cohesion: 0.17
Nodes (21): fixturePath(), loadTranscript(), main(), parseTranscriptLine(), renderTokenTable(), requestMessageContent(), runTranscript(), RunTranscriptOptions (+13 more)

### Community 27 - "Project Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @anthropic-ai/sdk, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml (+7 more)

### Community 28 - "Media Digest Storage"
Cohesion: 0.23
Nodes (15): findMediaDigest(), findMediaSharedBy(), forgetMediaForUser(), isDirectMessageGuild(), listMediaDigestsForGuild(), listMediaGuildIds(), listMediaRecallCandidates(), mapMediaDigest() (+7 more)

### Community 29 - "Discord Rate Limiting"
Cohesion: 0.09
Nodes (19): FR-6: Rate Limiting, Discord Gateway Layer, RateLimiterConfig, RPM-Budget Accounting, A Turn Reserves the Calls It May Make, The Two Limiters Bound Their Windows Differently, modelCallsForRequest, attachmentOptionName() (+11 more)

### Community 30 - "Bug Report Storage"
Cohesion: 0.15
Nodes (14): BugReportContext, BugReportInput, BugReportType, captureSnapshot(), countReportsSince(), MAX_CONTEXT_JSON_BYTES, queryRecentRows(), ReportAttachmentMetadata (+6 more)

### Community 31 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "Media Token Estimation"
Cohesion: 0.12
Nodes (32): Coverage Plan, geminiMimeType(), durationFromTokens(), equalBins(), estimateMediaTokens(), focusWindow(), FPS_LADDER, HalfWatch (+24 more)

### Community 33 - "LLM Provider Configuration"
Cohesion: 0.06
Nodes (37): Provider IDs, ChatCompletionsLlm, ModelScopeLlm, createLlm(), GeminiLlm, COMPATIBLE_DEFAULTS, compatibleProfile(), MODEL_PROFILES (+29 more)

### Community 34 - "Build Scripts"
Cohesion: 0.06
Nodes (32): scripts, build, character, dev, dev:quiet, export:vault, format, format:check (+24 more)

### Community 35 - "Recall Calibration Logic"
Cohesion: 0.13
Nodes (25): chunk(), configuredEmbed(), loadShadowRows(), main(), MATCH_WINDOW_MS, matchTurnMessage(), mean(), median() (+17 more)

### Community 36 - "Memory Replay Metrics"
Cohesion: 0.11
Nodes (24): ref_node_perf_hooks, argumentsFrom(), estimatedTokens(), inputText(), measure(), loadTranscriptLines(), main(), offlineAdapters() (+16 more)

### Community 37 - "YouTube Stream Processing"
Cohesion: 0.19
Nodes (19): metadata, realisticFormats, AudioFormat, audioFormats(), directHttpsUrl(), finiteNumber(), hasCodec(), headersOf() (+11 more)

### Community 38 - "Failure Classification"
Cohesion: 0.21
Nodes (8): Failure Classification, FailureKind, ProviderId, ProviderError, budget, route(), ROUTES, LlmConfig

### Community 39 - "Conversational Memory"
Cohesion: 0.25
Nodes (8): FR-3: Per-Channel Conversational Memory, Attachment History Stripping, ChannelSession, ToneKey, WindowMessage, detectTone(), ChannelSession, WindowMessage

### Community 40 - "Anime Schedule Fetcher"
Cohesion: 0.09
Nodes (29): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleParams, GetAnimeScheduleResult, getCurrentSeason() (+21 more)

### Community 41 - "Attachment Download Logic"
Cohesion: 0.19
Nodes (14): Download, GEMINI_IMAGE_TOKENS, downloadAttachment(), PreparedAttachments, readWithinLimit(), isobmffAllowsPrefix(), PrefixPolicy, prefixPolicyFor() (+6 more)

### Community 42 - "Model Fallback Strategy"
Cohesion: 0.05
Nodes (35): fallback Config Section, gemini Config Section, rateLimit Config Section, ModelScope Qwen Fallback, Tech Stack (README), Gemini-Outage Fallback (Qwen3.5), Fallback Model (runbook), ADK Error Delivery Constraint (+27 more)

### Community 43 - "Fact Reconciliation Logic"
Cohesion: 0.16
Nodes (17): PAST_FACT_MARKER, renderFactSentence(), HiddenRetract, reconcileHiddenRetractions(), reconcileOne(), userFactSentence(), ClaimPeriod, ACTIVE (+9 more)

### Community 44 - "Fallback Model Logic"
Cohesion: 0.20
Nodes (5): budgetState, configState, RequestCall, responses(), TextLlm

### Community 45 - "Attachment Intake Limits"
Cohesion: 0.07
Nodes (52): RFC-3003, attachment_url, Audio Intake Recommendation, PDF Intake Recommendation, Video Low Resolution Recommendation, Attachment Types and Their Ceilings, Global In-Flight Attachment Budget, Footer (+44 more)

### Community 46 - "Gemini Reliability Logic"
Cohesion: 0.08
Nodes (31): BackoffOptions, classifyGeminiFailure(), classifyMarker(), DEFAULT_MAX_BACKOFF_MS, extractGeminiStatus(), GeminiFailureResult, isRecord(), stringValue() (+23 more)

### Community 47 - "Background Generation Jobs"
Cohesion: 0.06
Nodes (42): Background Jobs, @google/genai, adapterFor(), adapters, attempt(), BackgroundWorkload, callUsage(), failureFields() (+34 more)

### Community 48 - "Turn Context Documentation"
Cohesion: 0.14
Nodes (23): Source Files, Models Summary, Prompt Engine Summary, Turn Walkthrough, RecallResult, ensureSession(), applyJevTone(), awaitQueryEmbedding() (+15 more)

### Community 49 - "Chart Rendering Utilities"
Cohesion: 0.26
Nodes (14): @napi-rs/canvas, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+6 more)

### Community 50 - "Privacy Guard Logic"
Cohesion: 0.15
Nodes (18): fact(), seedGuild(), assertClaim(), getActiveClaims(), normalizeKey(), sensitiveFactReason, activeValues(), write() (+10 more)

### Community 51 - "Google ADK Integration"
Cohesion: 0.13
Nodes (9): @google/adk, CapturingLlm, PDF_BASE64, sendPart(), MEMORY_TOOL_NAMES, CapturingRunner, makeInteraction(), mocks (+1 more)

### Community 52 - "TypeScript Test Config"
Cohesion: 0.22
Nodes (8): ./tsconfig.json, compilerOptions, noEmit, rootDir, types, exclude, extends, include

### Community 53 - "Project Dependencies"
Cohesion: 0.05
Nodes (41): @huggingface/transformers, ref_node_http, ref_node_net, @types/node, dependencies, @huggingface/transformers, devDependencies, @types/node (+33 more)

### Community 54 - "Discord Game Commands"
Cohesion: 0.07
Nodes (64): Discord Install Requirements: bot Scope Is Load-Bearing, Guild Permissions Are Derived From the API Surface, There Is No Build-Time Pin, and That Is Deliberate, ref_node_module, handleGachaMention(), statBar(), createGameCommandHandler(), GAME_COMMAND_NAMES (+56 more)

### Community 55 - "Extraction Scheduler"
Cohesion: 0.19
Nodes (14): maybeSample(), shouldSample(), startExtractionScheduler(), advancePastRetryDelay(), configMock, drain(), enqueue(), enqueueDelayed() (+6 more)

### Community 56 - "Obsidian Memory Export"
Cohesion: 0.13
Nodes (19): Browsing Memory in Obsidian, Getting Started, npm run test:live Gate, factKey(), ActiveClaimSubject, ActiveGuildSubject, ExportedClaim, ExportedGuildClaim (+11 more)

### Community 57 - "Usage Budgeting"
Cohesion: 0.08
Nodes (42): RateLimiterConfig, Budgets, Usage and Cost, acquireSlot(), backgroundShareSpent(), billingExhaustedIn, BudgetDenial, BudgetReservation, CallInput (+34 more)

### Community 58 - "Weather API Integration"
Cohesion: 0.16
Nodes (11): GeocodingResult, getWeather(), GetWeatherParams, GetWeatherResult, OpenMeteoWeather, weatherCodeToCondition(), WeatherFailure, WeatherReading (+3 more)

### Community 59 - "Identity Resolution Logic"
Cohesion: 0.10
Nodes (26): GPT-6-Astra, Jev Rollout Plan, Second Opinion, Who-Is-Who Resolver, buildNameIndex(), escapeRegex(), isAscii(), MATCH_PRIORITY (+18 more)

### Community 60 - "Attachment Reporting Logic"
Cohesion: 0.18
Nodes (14): isAllowedDiscordCdnUrl(), AttachmentCopyError, copyAttachment(), handleReportCommand(), moduleDirectory, packageMetadata, projectDirectory, readLimitedBody() (+6 more)

### Community 61 - "Jev System Integration"
Cohesion: 0.07
Nodes (43): jev Config Section, Deliberately Not Done, Jev Design (Per-Feature Modes), Jev Integration (Research Doc), Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk, Jev Shadow Mode (+35 more)

### Community 62 - "Media Digest Formatting"
Cohesion: 0.12
Nodes (29): boundedString(), coverageLine(), cutAtWord(), formatClock(), frameInterval(), framesLine(), HEARD_LINES, isRecord() (+21 more)

### Community 63 - "Multimodal Research Docs"
Cohesion: 0.11
Nodes (22): FR-7: Error Handling, FR-8: Response Formatting, FR-9: Docker Deployment, ALLOWED_IMAGE_TYPES Consolidation, Byte Cap as Duration Proxy, Concurrency Binding Constraint, Container Memory Cap Correction, Flash-Lite Modality Verification (+14 more)

### Community 64 - "Speech-to-Text Sidecar"
Cohesion: 0.13
Nodes (17): Speech-to-text HTTP sidecar: Silero VAD -> SenseVoice language ID -> Moonshine…, collections, http_server, io, json, math, numpy, os (+9 more)

### Community 65 - "Social Post Processing"
Cohesion: 0.06
Nodes (36): Process Lifecycle, ref_node_fs, SocialPostPresentation, ParsedBlueskyThread, createSocialPostViewer(), failure(), initializeSocialPosts(), isAbort() (+28 more)

### Community 66 - "Shutdown Lifecycle Management"
Cohesion: 0.16
Nodes (18): waitForInFlightExtractions(), destroyAllSessions(), beginShutdown(), resetForTest(), stopReminderScheduler(), stopStatusCycler(), stopUpdateNotifier(), client (+10 more)

### Community 67 - "Bluesky Data Parsers"
Cohesion: 0.15
Nodes (34): base(), BlueskyBlob, blueskyQuote(), capped(), compact(), date(), finiteNumber(), headers() (+26 more)

### Community 68 - "Quota Diagnostic Tools"
Cohesion: 0.20
Nodes (12): BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey(), DIAGNOSTIC_TIMEOUT_MS, errorText(), KEY_IS_LIVE, OUTPACING_THE_CAP, SPENT_FOR_THE_DAY (+4 more)

### Community 69 - "Social Post Testing"
Cohesion: 0.19
Nodes (19): vitest, ReplyFetchContext, target(), call(), jsonResponse(), replyContext(), replyFixture(), requestedHeaders() (+11 more)

### Community 70 - "Prefetch Measurement Tools"
Cohesion: 0.21
Nodes (9): main(), MeasurementAnomaly, Options, parseOptions(), percentile(), PrefetchMeasurementCase, PrefetchMeasurementSummary, PrefetchMeasurementTrial (+1 more)

### Community 71 - "Project Configuration"
Cohesion: 0.09
Nodes (21): description, engines, node, typescript, main, name, type, version (+13 more)

### Community 72 - "Deployment Documentation"
Cohesion: 0.10
Nodes (24): At a Glance, Bot Image (`Dockerfile`), Deploy on the Pi, Deployment, Docker Build, Docker Compose, Image Tags, Jobs (+16 more)

### Community 73 - "File Upload Handling"
Cohesion: 0.17
Nodes (9): countedBody(), deleteFile(), FileResource, getFile(), sleep(), streamToFiles(), UploadedFile, videoDurationSec() (+1 more)

### Community 74 - "Reply Outcome Metrics"
Cohesion: 0.08
Nodes (18): ref_node_async_hooks, outcomeForTurn, recordReplyOutcome(), ReplyOutcome, citationsForTurn, SearchCitation, NAME_MENTION_REGEX, metrics (+10 more)

### Community 75 - "Payload Rendering"
Cohesion: 0.32
Nodes (13): asObject(), asObjects(), chunkLabel(), componentDetails(), walk(), isComponentsV2Payload(), PayloadObject, renderEmbeds() (+5 more)

### Community 76 - "Docker Configuration"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 77 - "Tool Trigger Testing"
Cohesion: 0.09
Nodes (27): CASE_SETS, fixturePath, header, rememberFixturePath, searchWebFixturePath, temporaryDirectories, testCase, asCase() (+19 more)

### Community 78 - "Token Limit Measurement"
Cohesion: 0.35
Nodes (9): Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION, mimeForPath(), resolveKey(), TokenLimits (+1 more)

### Community 79 - "View Rendering Logic"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "Media Observation Planning"
Cohesion: 0.12
Nodes (15): MEDIA_OBSERVATIONS_SCHEMA, mocks, elapsedSince(), getClient(), mediaPart(), messageOf(), reasonFor(), requestFor() (+7 more)

### Community 81 - "Voice Research Documentation"
Cohesion: 0.11
Nodes (15): Where Rokabot Decides Today, Canon Research, Complaints After the Haiku Switch, Known Weak Spots, Replay and Blind-Judge Method, Rerunning the Check, Results, Roka Voice v3: Restoring Variety on Haiku (+7 more)

### Community 82 - "Search Prefetch Reporting"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "Extraction Queue Management"
Cohesion: 0.18
Nodes (11): claimNextForGuild(), enqueueEpisode(), EpisodeCursor, ExtractionFailureClassification, ExtractionFailureResult, ExtractionQueueRow, mapJob(), MAX_EXTRACTION_QUEUE_ATTEMPTS (+3 more)

### Community 84 - "Attachment Processing Logic"
Cohesion: 0.09
Nodes (35): Attachment Intake, Linked Files (`attachment_url`), Types and Ceilings, Where Files Come From, ImageAttachment, isSupportedMedia(), MAX_ATTACHMENTS, describeEmbed() (+27 more)

### Community 85 - "Collection Management"
Cohesion: 0.36
Nodes (9): buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount(), handleBuddyCollection(), { getBuddyCollection }, BuddyData, getBuddyCollection() (+1 more)

### Community 86 - "Test Environment Mocks"
Cohesion: 0.09
Nodes (22): resetMonitor(), resetForTest(), stopExtractionScheduler(), __resetTestRunTurnFactory(), createCaptureSink(), makeClient(), makeGuild(), FakeAnthropic (+14 more)

### Community 87 - "Capability Configuration"
Cohesion: 0.07
Nodes (32): Configuration (AGENTS.md), CompatibleCapabilities, baseConfig, CAPABILITY_CHOICES, capabilityProblem(), compatibleCapabilities(), CompatibleEntry, compatiblePrice() (+24 more)

### Community 88 - "Social Post Research"
Cohesion: 0.29
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "System Prompt Architecture"
Cohesion: 0.10
Nodes (35): Architecture (AGENTS.md), FR-4: Layered Personality Prompts, Expressions & Tones, Message Pipeline, Prompt System, System Architecture, AssemblerInput, AssemblerInput (+27 more)

### Community 90 - "Video Variant Selection"
Cohesion: 0.48
Nodes (5): PlayableVideo, audioRank(), qualifies(), selectPlayableVideo(), VideoCandidate

### Community 91 - "Guild Extraction Schemas"
Cohesion: 0.05
Nodes (40): AddOperationSchema, calendarDateProperties, DATED_GUILD_PREDICATES, DatedGuildAddOperationSchema, DatedGuildPredicateId, datedGuildPredicates, DatedGuildPredicateSchema, DatedGuildUpdateOperationSchema (+32 more)

### Community 92 - "Chat Testing Utilities"
Cohesion: 0.10
Nodes (23): ref_node_readline, ref_node_util, args, handleInput(), htmlIndex, main(), previewMessages, username (+15 more)

### Community 93 - "Recall Calibration"
Cohesion: 0.22
Nodes (8): ref_node_crypto, CandidateRow, Embed, axis(), detailOf(), history(), mix(), shadowRow()

### Community 94 - "Memory Claim Schema"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 95 - "Anthropic LLM Client"
Cohesion: 0.07
Nodes (45): AnthropicMessagesClient, Block, callUsage(), classifyAnthropicError(), create(), Effort, ImageMediaType, markerBlock() (+37 more)

### Community 96 - "WAV File Processing"
Cohesion: 0.38
Nodes (5): read_wav(), WavError, make_wav(), ReadWavTest, ValueError

### Community 97 - "Character Loading Logic"
Cohesion: 0.06
Nodes (42): Character, deepFreeze(), escapeRegExp(), loadCharacter(), expand(), prompt(), readYaml(), LOCKED_PROMPTS (+34 more)

### Community 98 - "Memory Migration Utilities"
Cohesion: 0.07
Nodes (41): zod, attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow (+33 more)

### Community 99 - "ASR Sidecar Documentation"
Cohesion: 0.22
Nodes (8): API, ASR Sidecar, Build and Run, Configuration, `GET /health`, Models and Licences, `POST /transcribe?maxSpeechSec=120`, Tests

### Community 100 - "Turn Context Management"
Cohesion: 0.22
Nodes (5): entryWork(), jevConfig, mocks, turnOptions(), turnWith()

### Community 101 - "Reliability Strategy"
Cohesion: 0.10
Nodes (15): Hedge, A Spent Day Is Not a Spent Minute, ADK Error Delivery Constraint, At a Glance, Configuration, Failure Kinds, Model Switch, Per-Call Budgets (+7 more)

### Community 102 - "Media Recall Logic"
Cohesion: 0.27
Nodes (9): buildMediaRecallBlock(), formatMediaRecallBlock(), RecalledMedia, recallMedia(), selectMediaWithinBudget(), toRecalledMedia(), configMock, MediaRecallCandidate (+1 more)

### Community 103 - "Memory Claim Architecture"
Cohesion: 0.36
Nodes (8): Claim Lifecycle, Claims Memory Architecture, extraction_queue Table, memory_claim_fts Table, memory_claim Table, memory_events Table, memory_evidence Table, Vault Export

### Community 104 - "Media Duration Utilities"
Cohesion: 0.33
Nodes (8): Box, movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0(), mvhdV1()

### Community 105 - "Turn Media Testing"
Cohesion: 0.20
Nodes (5): digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf()

### Community 107 - "Buddy Game Testing"
Cohesion: 0.17
Nodes (19): main(), makeMessage(), assert(), fail(), main(), pass(), results, TestResult (+11 more)

### Community 108 - "Project References"
Cohesion: 0.67
Nodes (3): Maniwa Roka, Rokabot, Senren*Banka

### Community 109 - "Speech Budgeting Logic"
Cohesion: 0.42
Nodes (4): Keep time-ordered segments within the speech budget, spread across the clip.…, Segment, select_segments(), SelectSegmentsTest

### Community 110 - "Markdown Rendering Utilities"
Cohesion: 0.11
Nodes (41): escapeHtml(), MarkdownContext, renderMarkdown(), renderPlainText(), asObject(), asObjects(), authorKey(), avatarUrl() (+33 more)

### Community 111 - "Reddit Feed Parsing"
Cohesion: 0.56
Nodes (9): decodeEntities(), entryAuthor(), entryContent(), feedEntries(), feedField(), htmlToText(), NAMED_ENTITIES, parseRedditFeedPost() (+1 more)

### Community 112 - "Voice Response Analysis"
Cohesion: 0.08
Nodes (38): Tunables, Evidence, Known Limits, Rerunning the Check, Results, Roka Voice v4: Looked-Up Turns and Saying No, Root Causes, Tunables (+30 more)

### Community 116 - "Fact Correction Tests"
Cohesion: 0.25
Nodes (4): Case, CASES, Usage, Want

### Community 117 - "Fact Retrieval Safety"
Cohesion: 0.21
Nodes (16): Bounded Retrieval (Legacy), buildFactsEnvelope(), buildOverheardBlock(), FACTS_UNTRUSTED_DATA_LABEL, isSafeFactKey(), isSafeFactScalar(), MAX_FACT_KEY_LEN, MAX_FACT_VALUE_LEN (+8 more)

### Community 119 - "Token Usage Tracking"
Cohesion: 0.10
Nodes (33): markBillingExhausted(), requestTokenEstimate(), arrayOf(), callUsage(), CHAT_COMPLETIONS_BASE_URLS, ChatCompletionsResponse, ChatMessage, constsMatch() (+25 more)

### Community 120 - "Reply Diagnostic Tools"
Cohesion: 0.09
Nodes (30): historyEndedOnToolResult(), escapeRegExp(), stripNarratedToolCalls(), blockCount(), BlockKind, capReplyBlocks(), countReplyBlocks(), MAX_REPLY_BLOCKS (+22 more)

### Community 121 - "Project Documentation"
Cohesion: 0.39
Nodes (8): Critical Do-Nots, Project (Rokabot description), Reference Docs (AGENTS.md), Rokabot PRD, Documentation (README index), Handing Her a File, Multimodal Research Doc, Rokabot TRD

### Community 122 - "ADK Tool Context"
Cohesion: 0.29
Nodes (3): REMEMBER_TURN, runTurn(), ScriptedLlm

### Community 123 - "Status Cycle Management"
Cohesion: 0.15
Nodes (13): inHours(), uncoveredHours(), getStatusForHour(), startStatusCycler(), updateStatus(), Bucket, BUCKETS, cfg (+5 more)

### Community 124 - "Social Reply Processing"
Cohesion: 0.12
Nodes (16): SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL, readRepliesTool, readReplies(), FOUND, PLATFORM_NAMES, count(), defang(), formatRepliesForModel() (+8 more)

### Community 125 - "Frame Extraction Logic"
Cohesion: 0.07
Nodes (36): ref_node_child_process, EMPTY, extractFrame(), extractFrames(), frameBins(), frameCount(), FrameRunner, FrameSource (+28 more)

### Community 126 - "Speech Server Engine"
Cohesion: 0.33
Nodes (6): Engines, load_engines(), main(), SpeechServer, NamedTuple, ThreadingHTTPServer

### Community 127 - "Linting Configuration"
Cohesion: 0.67
Nodes (3): lint-staged, *.{json,md,yml,yaml}, *.{ts,js}

### Community 129 - "LLM Profile Probing"
Cohesion: 0.10
Nodes (31): dotenv, CITY_SCHEMA, hasThinkingTag(), isFilled(), isSupportedProfile(), isTimeZone(), judgeJson(), judgeText() (+23 more)

### Community 130 - "Gemini Model Comparison"
Cohesion: 0.24
Nodes (9): CapturingErrorPlugin, classify(), ITERATIONS, main(), MODELS, PROBES, runOne(), RunOutcome (+1 more)

### Community 131 - "Speech Transcription"
Cohesion: 0.60
Nodes (5): decode(), detect_speech(), language_code(), transcribe(), ndarray

### Community 133 - "Configuration Loading"
Cohesion: 0.43
Nodes (6): clearTunableEnvVars(), loadFloors(), merge(), setAnthropicOnlyEnv(), setRequiredEnvVars(), withYamlOverride()

### Community 134 - "Anime Search Integration"
Cohesion: 0.25
Nodes (7): Request Slots and Daily Units, jikanThrottle(), AnimeResult, JikanAnimeEntry, JikanResponse, SearchAnimeParams, SearchAnimeResult

### Community 135 - "Stats Command Handling"
Cohesion: 0.15
Nodes (31): Field Reference, lines.yml, Commands, Bug Reports, Persistence and Storage, Retention, Tables, handleStatsCommand() (+23 more)

### Community 136 - "Deployment Workflow"
Cohesion: 0.36
Nodes (9): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping), Deployment & Operations (+1 more)

### Community 137 - "Character Context Management"
Cohesion: 0.11
Nodes (21): js-yaml, ref_node_os, ref_node_path, ref_node_worker_threads, main(), MEMORY_MODES, summary(), copies (+13 more)

### Community 138 - "Fact Verification Logic"
Cohesion: 0.14
Nodes (14): OperationApplicationReport, activeFacts(), apply(), candidateFacts(), episode(), evidenceCount(), factsWithStatus(), jevApplied() (+6 more)

### Community 140 - "Roka Agent Core"
Cohesion: 0.12
Nodes (23): Attachment Bytes Do Not Live in History, Gemini API, Roka Agent (ADK), Session Manager, SQLite Persistence Store, computeBackoff(), modelNameForCurrentRequest(), runTurnWithReliability() (+15 more)

### Community 141 - "Report CLI Tools"
Cohesion: 0.43
Nodes (6): main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne()

### Community 142 - "Reminder Scheduling System"
Cohesion: 0.13
Nodes (19): reminders Config Section, cancelReminder(), listReminders(), setReminder(), startReminderScheduler(), FakeSender, NOW, ActiveReminder (+11 more)

### Community 143 - "Episode Vector Storage"
Cohesion: 0.16
Nodes (18): geminiVector(), configMock, mocks, now, seedEpisode(), seedMedia(), storeLegacyVector(), vector768() (+10 more)

### Community 144 - "Discord Architecture Docs"
Cohesion: 0.12
Nodes (16): Architecture, At a Glance, Core Code Modules, Discord Events (Inbound), Durable State, Gateway Setup, Installation and Context Policy, InteractionCreate (`/ask`) (+8 more)

### Community 145 - "Prompt Engine Design"
Cohesion: 0.08
Nodes (29): At a Glance, Beats, Ending, Message Weight, Mood Detection, Opener, Paragraphs, Prompt Engine (+21 more)

### Community 146 - "Attachment Token Costing"
Cohesion: 0.12
Nodes (21): PDF Token Cost Measurement, Attachment Token Admission, sharp, spriteFiles, anthropicBlock(), countWithAnthropic(), estimateTokens(), imageTokens() (+13 more)

### Community 147 - "Anthropic SDK Integration"
Cohesion: 0.10
Nodes (21): @anthropic-ai/sdk, AnthropicLlm, STRUCTURED_OUTPUT_TOOL, ContentBlock, fixtures, message(), usage(), answer() (+13 more)

### Community 148 - "Markdown Formatting Rules"
Cohesion: 0.09
Nodes (26): blockQuote(), buildList(), codeBlock, EMOJI, emojiImage(), emphasis(), EMPHASIS_RULES, formatTimestamp() (+18 more)

### Community 149 - "Model Profile Documentation"
Cohesion: 0.10
Nodes (24): Source Files, At a Glance, Legacy Config, Model Profiles, Models, Request Shaping, Resolution, `ResolvedModel` Defaults (+16 more)

### Community 150 - "Project Documentation Index"
Cohesion: 0.08
Nodes (27): At a Glance, Character, Configuration, `discord`, `embeddings`, `emoji`, `fallback`, `games` (+19 more)

### Community 151 - "Persona Replay Logic"
Cohesion: 0.12
Nodes (24): ANTHROPIC_SEARCH, appendReplyShape(), Arm, GEMINI_CONFIG, GEMINI_SEARCH, loadArm(), LoadedArm, Message (+16 more)

### Community 152 - "Embedding Client Service"
Cohesion: 0.13
Nodes (16): Embeddings and Episodic Recall, response(), EmbeddingClient, EmbeddingRole, EmbeddingSettings, FACTORIES, getEmbeddingClient(), resetEmbeddingClientForTest() (+8 more)

### Community 153 - "Memory System Overview"
Cohesion: 0.10
Nodes (22): Capture and Prompt, `memory`, Recall, Retention, Memory, At a Glance, Browse Memory in Obsidian, Forgetting and Opting Out (+14 more)

### Community 154 - "Token Budgeting System"
Cohesion: 0.20
Nodes (11): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, The Per-Minute Token Budget, buckets, canAffordAttachments(), chargeTokens(), remainingTokensThisMinute(), __resetTokenBudgetForTest() (+3 more)

### Community 155 - "Episode Maintenance Logic"
Cohesion: 0.18
Nodes (15): BackfillPace, delay(), EpisodeMaintenanceReport, pruneEpisodesAndReembed(), runPass(), encodeFloat32Embedding(), EpisodeCursorRow, LEGACY_GEMINI_FINGERPRINT (+7 more)

### Community 156 - "System Architecture Overview"
Cohesion: 0.10
Nodes (21): Admission, Capture, Claim Lifecycle and Retention, Deferred Items, Extraction, Extraction Run Trace, Fact Reclassification, Guild Facts and Dates (+13 more)

### Community 157 - "Update Notification Service"
Cohesion: 0.16
Nodes (15): cfg, LATEST, store, checkForUpdate(), fetchLatestRelease(), isNewerVersion(), LatestRelease, moduleDirectory (+7 more)

### Community 158 - "Character Harness Research"
Cohesion: 0.11
Nodes (18): 1. Character as a Folder Pack, 2. Static First, Dynamic After, Reply Shape Last, 3. Any OpenAI-Compatible Endpoint, 4. Files First, Dashboard Later, Character Formats, Character Harness Research 2026, Decisions for Rokabot, Evidence-Backed (+10 more)

### Community 159 - "Vector Persistence Testing"
Cohesion: 0.16
Nodes (11): better-sqlite3, mocks, configMock, gemini001Vector(), readable(), seed(), seedUnknown(), ensureVectorProvenanceColumns() (+3 more)

### Community 160 - "Bot Documentation"
Cohesion: 0.30
Nodes (3): Bot Management, Network Config Files, Raspberry Pi Command Reference

### Community 161 - "Label Calibration Logic"
Cohesion: 0.19
Nodes (17): chooseFloor(), cli(), cohensKappa(), currentFloorOf(), KindReport, Label, main(), MIN_AGREED_PAIRS (+9 more)

### Community 162 - "Character Pack Configuration"
Cohesion: 0.13
Nodes (17): A Pack Outside the Image, At a Glance, character.yml, Characters, Harness Prompts and Overrides, How the Bot Picks a Pack, Make a New Character, moods.yml (+9 more)

### Community 163 - "Turn Judgment Logic"
Cohesion: 0.12
Nodes (16): At a Glance, Client, Configuration, Jev Judgments, Modes, Questions, Search Prefetch, Tools (+8 more)

### Community 164 - "Search Prefetch Logic"
Cohesion: 0.18
Nodes (14): result(), buildLookedUpBlock(), clip(), decidePrefetch(), JevPrefetchMode, PREFETCH_TOOL_NAME, PrefetchContext, PrefetchDecision (+6 more)

### Community 165 - "Episode Recall Logic"
Cohesion: 0.21
Nodes (13): GEMINI_FINGERPRINT, LOCAL_FINGERPRINT, localVector(), buildEpisodeRecallBlock(), formatEpisodeRecallBlock(), RecalledEpisode, recallEpisodes(), selectEpisodesWithinBudget() (+5 more)

### Community 166 - "Model Budgeting Configuration"
Cohesion: 0.12
Nodes (16): Any OpenAI-Compatible Model, At a Glance, Budgets and Limits, Capabilities Reference, Choose the Main and Fallback, Copy-Paste Entries, Entry Options, Fields for OpenAI-Compatible Entries (+8 more)

### Community 167 - "Media Watching Logic"
Cohesion: 0.17
Nodes (15): Accounting, Digest and Turn Input, Gemini Watcher, Media Watching, Remembered Media, Speech Sidecar, Transport, Watcher Modes (+7 more)

### Community 168 - "Chat Completion Provider"
Cohesion: 0.17
Nodes (10): ChatCompletionsProvider, Brain, BRAINS, CHAT_COMPLETIONS, hello(), PAIRS, runTurn(), ScriptedLlm (+2 more)

### Community 169 - "Deployment Guide"
Cohesion: 0.14
Nodes (14): At a Glance, First-Run Checks, Getting Started, Install and Configure, Model Keys for the Shipped Config, Next Steps, Prerequisites, Register Slash Commands (+6 more)

### Community 170 - "Auto-Deploy Platforms"
Cohesion: 0.14
Nodes (13): Answer, Auto-Deploy Platforms, Coolify, Docker API Version, Fly.io, GHCR Limits, Maintained Fork, Original Project (+5 more)

### Community 171 - "Memory Statistics"
Cohesion: 0.14
Nodes (13): activeClaimCount(), distinctRememberedUsers(), MEMORY_STATS_SQL, outcomeBreakdown(), successRate, topTones(), insertClaim(), insertGuildClaim() (+5 more)

### Community 172 - "Persona Reporting"
Cohesion: 0.29
Nodes (11): countSlurRepetitions(), firstWord(), formatTable(), innerThoughts(), main(), MARKERS, paragraphs(), pct() (+3 more)

### Community 173 - "Persona Turn Logic"
Cohesion: 0.26
Nodes (10): chatTurns(), localHour(), mergeRoles(), Message, mulberry32(), parseWindow(), sample(), TurnKind (+2 more)

### Community 174 - "Embeddings TypeScript Config"
Cohesion: 0.15
Nodes (12): compilerOptions, lib, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+4 more)

### Community 175 - "Mock Fetch Utilities"
Cohesion: 0.26
Nodes (10): fakeFetch(), FetchCall, hangingFetch(), json(), logger, reply(), settings, vector384 (+2 more)

### Community 176 - "Guild Fact Schemas"
Cohesion: 0.15
Nodes (11): GUILD_PREDICATES, calendarDateProperties, datedGuildPredicates, guildFactDateResponseSchema, guildPredicates, guildSubjectResponseSchema, monthDateProperties, relativeDateProperties (+3 more)

### Community 177 - "Embedding Fingerprinting"
Cohesion: 0.29
Nodes (9): DEFAULT_EMBEDDING_MODELS, defaultEmbeddingProvider(), embeddingDimensions(), embeddingFingerprint(), EmbeddingProvider, LOCAL_EMBEDDING_MODEL, RECIPES, embeddingProvider() (+1 more)

### Community 178 - "Timezone Utilities"
Cohesion: 0.35
Nodes (9): loadGetLocalHour(), loadTimezoneModule(), unpinnedHour(), dateString(), dateTimeParts(), getLocalDate(), localDateStartEpoch(), localDateTimeFormatter() (+1 more)

### Community 179 - "Bot Feature Overview"
Cohesion: 0.20
Nodes (10): At a Glance, Features, Games and Gacha, Reactions, Status Rotation and Update Notices, Reminders, Seeing and Watching, Source Files, Stats (+2 more)

### Community 180 - "Embeddings API Documentation"
Cohesion: 0.20
Nodes (9): API, Build and Run, Configuration, Embedding Sidecar, `GET /health`, Model and Licences, `POST /embed`, Smoke Test (+1 more)

### Community 181 - "Episode Precheck Logic"
Cohesion: 0.27
Nodes (5): isTrivial(), normalize(), precheckEpisode(), SENSITIVE_PATTERNS, mocks

### Community 182 - "Time Resolution Utilities"
Cohesion: 0.24
Nodes (8): cityToTimezone, getCurrentTime(), GetCurrentTimeFound, GetCurrentTimeParams, GetCurrentTimeResult, GetCurrentTimeUnknown, resolveTimezone(), NOW

### Community 183 - "Functional Requirements"
Cohesion: 0.22
Nodes (9): FR-10: Graceful Shutdown, FR-2: Mention/Reply Interaction, FR-5: Tone Detection, Functional Requirements, Problem Statement, Product Requirements Document, Project Objectives, Target Users (+1 more)

### Community 184 - "Data Model Assembler"
Cohesion: 0.25
Nodes (9): AssemblerInput, At a Glance, Data Models, Data Models and Storage, Outbound Model Request, Source Files, ToneKey, WindowMessage (+1 more)

### Community 185 - "Claude/Gemini Runner"
Cohesion: 0.33
Nodes (6): claudeSettings(), main(), parseArgs(), runClaude(), runGemini(), SearchCache

### Community 186 - "Extraction Schema Testing"
Cohesion: 0.22
Nodes (7): comparable(), DateVariant, GEMINI_SCHEMA, keysIn(), subject, Variant, LEGACY_GEMINI_EXTRACTION_SCHEMA

### Community 187 - "Dialogue Style Guide"
Cohesion: 0.25
Nodes (7): Dialogue Style, Example Lines, Example Replies With Structure, Expressions, Formatting Your Reply, Speech Patterns, Verbal Style

### Community 188 - "Persona Identity Docs"
Cohesion: 0.25
Nodes (7): Identity & Appearance, Insecurities, People You Know, Personality, Romantic Side, Who You Are, Your World

### Community 189 - "Embedding Smoke Tests"
Cohesion: 0.25
Nodes (5): ref_node_assert, EmbedReply, golden, goldenPath, record

### Community 190 - "Search Citation Logic"
Cohesion: 0.29
Nodes (4): runSearchTurn(), ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS

### Community 191 - "Markdown Guard Utilities"
Cohesion: 0.50
Nodes (6): eachOutside(), guardMarkdown(), guardProse(), guardText(), isFace(), KAOMOJI

### Community 193 - "Project Changelog"
Cohesion: 0.29
Nodes (6): [0.2.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.1.0...v0.2.0) (2026-10-16), [0.3.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.2.0...v0.3.0) (2026-10-16), Bug Fixes, Changelog, Features, Features

### Community 194 - "Character Pack Docs"
Cohesion: 0.29
Nodes (6): Character Packs, Layout, Locked Prompts, Macros, Making a New Character, Prompt Files

### Community 195 - "Link Priority Logic"
Cohesion: 0.29
Nodes (7): Link Priority, Lookup Limits, Model Input, Replies, Social Post Viewing, Supported Platforms, URL and Extractor Safety

### Community 196 - "Guild Date Resolver"
Cohesion: 0.40
Nodes (5): GuildFactDate, DateResolver, expectResolved(), loadResolver(), ResolvedDate

### Community 197 - "Audio-Video Documentation"
Cohesion: 0.50
Nodes (3): Audio and Video, When You Couldn't Watch It, When You've Watched Something

### Community 198 - "Release Configuration"
Cohesion: 0.50
Nodes (3): bootstrap-sha, packages, $schema

## Ambiguous Edges - Review These
- `Rokabot TRD` → `Second Opinion`  [AMBIGUOUS]
  docs/research/jev-integration.md · relation: conceptually_related_to

## Knowledge Gaps
- **1288 isolated node(s):** `BuddyRow`, `DailyBuddyHatch`, `DailyHatchRow`, `JevReplayCutoffRow`, `SessionHistoryReplayRow` (+1283 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1671 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Rokabot TRD` and `Second Opinion`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `vitest` connect `Social Post Testing` to `Buddy Game Logic`, `Jev Replay Analysis`, `Qwen Model Monitoring`, `Discord Command Handling`, `Message Citation Formatting`, `Claim Extraction Logic`, `Feature Testing Suite`, `Extraction Error Handling`, `Episode Embedding Persistence`, `Turn Admission Reliability`, `Tool Command Handlers`, `Discord Configuration`, `Social Platform Fetchers`, `Episode Tracking Logic`, `Session Media Handling`, `Memory Database Maintenance`, `Channel Visibility Storage`, `Session Management`, `Memory Retrieval System`, `Media Digest Storage`, `Discord Rate Limiting`, `Bug Report Storage`, `Media Token Estimation`, `LLM Provider Configuration`, `Memory Replay Metrics`, `YouTube Stream Processing`, `Failure Classification`, `Conversational Memory`, `Anime Schedule Fetcher`, `Attachment Download Logic`, `Model Fallback Strategy`, `Fact Reconciliation Logic`, `Fallback Model Logic`, `Attachment Intake Limits`, `Gemini Reliability Logic`, `Background Generation Jobs`, `Chart Rendering Utilities`, `Privacy Guard Logic`, `Google ADK Integration`, `Project Dependencies`, `Discord Game Commands`, `Extraction Scheduler`, `Obsidian Memory Export`, `Usage Budgeting`, `Weather API Integration`, `Identity Resolution Logic`, `Attachment Reporting Logic`, `Jev System Integration`, `Media Digest Formatting`, `Social Post Processing`, `Shutdown Lifecycle Management`, `Bluesky Data Parsers`, `Quota Diagnostic Tools`, `Prefetch Measurement Tools`, `Project Configuration`, `File Upload Handling`, `Reply Outcome Metrics`, `Tool Trigger Testing`, `Token Limit Measurement`, `View Rendering Logic`, `Media Observation Planning`, `Voice Research Documentation`, `Search Prefetch Reporting`, `Extraction Queue Management`, `Attachment Processing Logic`, `Collection Management`, `Test Environment Mocks`, `System Prompt Architecture`, `Video Variant Selection`, `Recall Calibration`, `Anthropic LLM Client`, `Character Loading Logic`, `Memory Migration Utilities`, `Turn Context Management`, `Media Recall Logic`, `Media Duration Utilities`, `Turn Media Testing`, `Buddy Game Testing`, `Voice Response Analysis`, `Fact Correction Tests`, `Fact Retrieval Safety`, `Reply Diagnostic Tools`, `ADK Tool Context`, `Status Cycle Management`, `Social Reply Processing`, `Frame Extraction Logic`, `LLM Profile Probing`, `Configuration Loading`, `Stats Command Handling`, `Character Context Management`, `Fact Verification Logic`, `Roka Agent Core`, `Reminder Scheduling System`, `Episode Vector Storage`, `Prompt Engine Design`, `Attachment Token Costing`, `Anthropic SDK Integration`, `Model Profile Documentation`, `Persona Replay Logic`, `Embedding Client Service`, `Token Budgeting System`, `Episode Maintenance Logic`, `Update Notification Service`, `Vector Persistence Testing`, `Search Prefetch Logic`, `Episode Recall Logic`, `Chat Completion Provider`, `Memory Statistics`, `Persona Reporting`, `Persona Turn Logic`, `Mock Fetch Utilities`, `Embedding Fingerprinting`, `Timezone Utilities`, `Episode Precheck Logic`, `Time Resolution Utilities`, `Extraction Schema Testing`, `Search Citation Logic`, `Markdown Guard Utilities`, `Database Migration Logic`, `Guild Date Resolver`?**
  _High betweenness centrality (0.206) - this node is a cross-community bridge._
- **Why does `config` connect `Identity Resolution Logic` to `Buddy Game Logic`, `Gemini Model Comparison`, `Discord Command Handling`, `Claim Extraction Logic`, `Stats Command Handling`, `Extraction Error Handling`, `Episode Embedding Persistence`, `Feature Testing Suite`, `Roka Agent Core`, `Turn Admission Reliability`, `Tool Command Handlers`, `Tool Execution Handlers`, `Discord Configuration`, `Reminder Scheduling System`, `Attachment Token Costing`, `Episode Tracking Logic`, `Calendar Date Utilities`, `Social Platform Fetchers`, `Memory Database Maintenance`, `Channel Visibility Storage`, `Embedding Client Service`, `Memory Retrieval System`, `Session Management`, `Episode Maintenance Logic`, `Token Budgeting System`, `Discord Rate Limiting`, `Update Notification Service`, `Media Token Estimation`, `Label Calibration Logic`, `Recall Calibration Logic`, `YouTube Stream Processing`, `Episode Recall Logic`, `Anime Schedule Fetcher`, `Attachment Download Logic`, `Model Fallback Strategy`, `Fact Reconciliation Logic`, `Attachment Intake Limits`, `Gemini Reliability Logic`, `Background Generation Jobs`, `Turn Context Documentation`, `Privacy Guard Logic`, `Character Context Management`, `Timezone Utilities`, `Time Resolution Utilities`, `Discord Game Commands`, `Obsidian Memory Export`, `Usage Budgeting`, `Weather API Integration`, `Attachment Reporting Logic`, `Jev System Integration`, `Multimodal Research Docs`, `Social Post Processing`, `Shutdown Lifecycle Management`, `Quota Diagnostic Tools`, `Deployment Documentation`, `File Upload Handling`, `Reply Outcome Metrics`, `Media Observation Planning`, `Collection Management`, `Test Environment Mocks`, `Capability Configuration`, `Recall Calibration`, `Memory Migration Utilities`, `Turn Context Management`, `Media Recall Logic`, `Token Usage Tracking`, `Reply Diagnostic Tools`, `Status Cycle Management`, `Social Reply Processing`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `getDb()` connect `Memory Database Maintenance` to `Buddy Game Logic`, `Memory Analytics Dashboard`, `Claim Extraction Logic`, `Feature Testing Suite`, `Extraction Error Handling`, `Fact Verification Logic`, `Activity Query Metrics`, `Episode Embedding Persistence`, `Turn Admission Reliability`, `Reminder Scheduling System`, `Episode Vector Storage`, `Episode Tracking Logic`, `Channel Visibility Storage`, `Memory Retrieval System`, `Episode Maintenance Logic`, `Media Digest Storage`, `Update Notification Service`, `Bug Report Storage`, `Memory Replay Metrics`, `Fact Reconciliation Logic`, `Memory Statistics`, `Turn Context Documentation`, `Privacy Guard Logic`, `Google ADK Integration`, `Discord Game Commands`, `Obsidian Memory Export`, `Usage Budgeting`, `Identity Resolution Logic`, `Attachment Reporting Logic`, `Database Migration Logic`, `Shutdown Lifecycle Management`, `Tool Trigger Testing`, `Extraction Queue Management`, `Collection Management`, `Test Environment Mocks`, `Recall Calibration`, `Memory Migration Utilities`, `Buddy Game Testing`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **What connects `BuddyRow`, `DailyBuddyHatch`, `DailyHatchRow` to the rest of the system?**
  _1288 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Buddy Game Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.12299465240641712 - nodes in this community are weakly interconnected._
- **Should `Jev Replay Analysis` be split into smaller, more focused modules?**
  _Cohesion score 0.11428571428571428 - nodes in this community are weakly interconnected._