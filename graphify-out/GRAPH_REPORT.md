# Graph Report - wt-208  (2026-09-25)

## Corpus Check
- 257 files · ~216,818 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1969 nodes · 5090 edges · 112 communities (96 shown, 16 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 224 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `86032d75`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Gacha Buddy System
- Jev and Live Benchmark Setup
- Retry Loop Design History
- Slash Command UI
- Code Formatting Configuration
- Memory Statistics Visualization
- Discord Output and Sprite Decisions
- Memory Claim Management
- Game Configuration
- Memory Extraction Configuration
- Bot Startup and Shutdown
- Statistics Query Logic
- Discord Test Doubles
- Reply Splitting and Concurrency
- Memory Privacy and Tenancy
- Web Search Decisions
- Metrics and Diagnostics
- Gemini Fallback Routing
- Hangman Game Logic
- Memory Extraction Test Script
- Development Tooling
- Session Attachment Management
- Live Gate and Quota Diagnostics
- SQLite Data Access
- Response Generation Testing
- Claim Retrieval Ranking
- Transcript Processing
- Bot Technology Stack
- CodeRabbit Gate History
- Rate Limiting Logic
- Token Usage Estimation
- TypeScript Build Config
- Game Command Handling
- Channel Session Window
- CI/CD Pipeline Gates
- Mock Object Factories
- Legacy Fact Extractor
- Config Loading and Claims Rollout
- Claim Extraction Pipeline
- Phase 8 Test Script
- Anime Lookup Tools
- Discord Fake Builders
- ModelScope Fallback Adapter
- In-Flight Attachment Byte Budget
- Guild Permissions and Message Intake
- Media Validation Policies
- Gemini Error Handling
- Tool Trigger Fixtures
- Memory Predicates and Privacy
- Chart Rendering Logic
- Core Architecture and Fallback Tests
- Extraction Scheduler Tests
- Test TypeScript Config
- Benchmark Pacing Logic
- Timezone Testing
- Harness Capture Sink
- Obsidian Export Logic
- Reminders
- LLM Tool Registry
- Multimodal Intake Research
- Token Budget Management
- Attachment Type Limits
- Attachment Token Cost Findings
- Tone Detection
- Product Requirements
- Interaction Metrics Testing
- CI Deploy Pipeline
- Discord Command Registration
- Test Trial Recording
- Stats Command and Error Handling
- Buddy Collection UI
- Project Metadata
- Model Comparison Testing
- Memory Candidate Gate
- Attachment Measurement Script
- Payload Rendering Logic
- Deployment and Infrastructure
- Utility Tools
- Stats Views Tests
- Message Handling Tests
- Database Management and Migration
- Product Requirements Document
- CapturingLlm
- Gemini Failure Handling
- ADK Smoke Testing
- Weather Tool
- Anime Search Logic
- Who-Is-Who and Recall Trigger
- Prompt Length and Voice
- Streaming Media Prefix Policy
- ADK Inline Data Testing
- Scripted LLM Interface
- Gemini Safety Settings
- README Architecture and Tones
- Claims Memory Tables
- Memory Safety Logic
- Interaction Mocking
- Rate Limiting Tests
- Capture Sink Utilities
- Chat Input Testing
- Commit Conventions
- Character and Source Work
- Fake Channel
- Harness Collection
- Unit Testing Mocks
- Project Guidelines and Constraints
- Git Commit Convention
- Karpathy Coding Guidelines

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 161 edges
2. `config` - 62 edges
3. `logger` - 49 edges
4. `generateResponse()` - 43 edges
5. `createMessageHandler()` - 42 edges
6. `createInteractionHandler()` - 39 edges
7. `runTranscript()` - 31 edges
8. `assertClaim()` - 29 edges
9. `main()` - 28 edges
10. `closeDb()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Attachment Types and Their Ceilings` --implements--> `GEMINI_SPELLINGS`  [INFERRED]
  docs/trd.md → src/agent/attachmentLimits.ts
- `Attachment Bytes Do Not Live in History` --conceptually_related_to--> `generateResponse()`  [INFERRED]
  docs/trd.md → src/agent/roka.ts
- `gemini Config Section` --shares_data_with--> `measureAttachmentTokens()`  [INFERRED]
  config.yml → src/agent/attachmentCost.ts
- `Attachment Types and Their Ceilings` --implements--> `sizeLimitFor()`  [INFERRED]
  docs/trd.md → src/agent/attachmentLimits.ts
- `A Spent Day Is Not a Spent Minute` --references--> `computeBackoff()`  [EXTRACTED]
  docs/trd.md → src/agent/geminiReliability.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Gemini Reliability & Failure Handling** — docs_trd_failure_taxonomy, docs_trd_fallback_model, docs_trd_adk_error_delivery, docs_trd_rpm_budget_accounting, docs_trd_concurrency_lifecycle_retry [INFERRED 0.80]
- **Jev Shadow-Mode Judgment Integration** — docs_trd_jev_judgments, docs_trd_jev_turn_judgment, docs_trd_jev_memory_admission, src_agent_jev_client, docs_research_jev_integration_jev, docs_research_jev_integration_design [INFERRED 0.85]
- **Rate-Limit and Token-Budget Guard Mechanisms** — src_agent_tokenbudget, src_discord_bytebudget, docs_trd_rpm_budget_accounting, docs_trd_turn_reserves_calls, docs_trd_two_limiters_diff, docs_trd_per_minute_token_budget [INFERRED 0.80]
- **Jev Judgment Shadow-Mode System** — config_jev, docs_runbook_jev_shadow_mode, docs_readme_getting_started [EXTRACTED 0.85]
- **Deploy-to-Pi CI/CD Pipeline** — _github_workflows_deploy_workflow, _github_workflows_deploy_test_job, _github_workflows_deploy_deploy_job, agents_working_conventions [EXTRACTED 0.90]
- **ModelScope Qwen Fallback Feature** — config_fallback, docs_readme_modelscope_fallback, docs_runbook_fallback_model [EXTRACTED 0.90]
- **Multimodal Attachment Safety Pipeline** — docs_research_multimodal_global_byte_budget, docs_research_multimodal_streaming_size_guard, docs_research_multimodal_attachment_strip_history, docs_research_multimodal_tpm_ceiling_measurement, src_discord_bytebudget [INFERRED 0.95]
- **Rate and Token Budgeting Architecture** — docs_prd_fr_6_rate_limiting, docs_research_multimodal_tpm_ceiling_measurement, src_utils_ratelimiter_ratelimiter, src_agent_tokenbudget [INFERRED 0.95]
- **Conversational Turn Lifecycle** — docs_prd_user_workflow_overview, docs_prd_fr_3_per_channel_conversational_memory, docs_prd_fr_4_layered_personality_prompts, docs_prd_fr_5_tone_detection, src_agent_roka_rokaagent [INFERRED 0.85]

## Communities (112 total, 16 thin omitted)

### Community 0 - "Gacha Buddy System"
Cohesion: 0.05
Nodes (93): SQLite Database Reference, handleGachaMention(), statBar(), createGameCommandHandler(), GAME_COMMAND_NAMES, buildCollectionPage(), buildPaginatedCollectionPage(), getCollectionPageCount() (+85 more)

### Community 1 - "Jev and Live Benchmark Setup"
Cohesion: 0.13
Nodes (28): parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, agreement(), buildConfusionMatrix(), buildProbabilityBins(), buildReplayTurn() (+20 more)

### Community 2 - "Retry Loop Design History"
Cohesion: 0.08
Nodes (30): AddOperationSchema, EXTRACTION_RESPONSE_SCHEMA, ExtractionOp, ExtractionOutputSchema, NoopOperationSchema, parseExtractionOutput(), PredicateSchema, RemoveOperationSchema (+22 more)

### Community 3 - "Slash Command UI"
Cohesion: 0.19
Nodes (12): FR-1: Slash Command Interaction, Features, askCommand, command, gachaCommand, gameCommands, hangmanCommand, shiritoriCommand (+4 more)

### Community 4 - "Code Formatting Configuration"
Cohesion: 0.05
Nodes (40): useLiteralKeys, files, ignore, formatter, enabled, indentStyle, indentWidth, lineWidth (+32 more)

### Community 5 - "Memory Statistics Visualization"
Cohesion: 0.12
Nodes (29): latencyE2e, p95ByDay, percentile(), retrySummary, tokenTotals, topChannels(), topTones(), addChart() (+21 more)

### Community 6 - "Discord Output and Sprite Decisions"
Cohesion: 0.20
Nodes (14): clampToBudget(), fitCitations(), sourceHost(), buildRokaMessage(), buildToolFooter(), TOOL_USAGE_LABELS, worstCaseToolFooterLabels, THREE (+6 more)

### Community 7 - "Memory Claim Management"
Cohesion: 0.14
Nodes (29): Claims Tenancy Model, activateClaim(), appendEvidence(), appendEvidenceInTransaction(), assertClaimInTransaction(), assertSafeValue(), assertWritableGuild(), ClaimAssert (+21 more)

### Community 8 - "Game Configuration"
Cohesion: 0.13
Nodes (26): jev Config Section, Jev Design (Per-Feature Modes), Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk, Jev Shadow Mode, Jev Judgments, Jev Memory Admission (+18 more)

### Community 9 - "Memory Extraction Configuration"
Cohesion: 0.14
Nodes (19): drainOnce(), finishJob(), inFlightGuilds, inFlightTasks, orderedGuilds(), resetForTest(), runJob(), scheduleDrain() (+11 more)

### Community 10 - "Bot Startup and Shutdown"
Cohesion: 0.16
Nodes (18): cleanupExpired(), monitoredChannels, restoreMonitoredChannels(), flushOpenEpisodes(), stopExtractionScheduler(), waitForInFlightExtractions(), destroyAllSessions(), beginShutdown() (+10 more)

### Community 11 - "Statistics Query Logic"
Cohesion: 0.09
Nodes (33): activeClaimCount(), activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome (+25 more)

### Community 12 - "Discord Test Doubles"
Cohesion: 0.06
Nodes (45): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+37 more)

### Community 13 - "Reply Splitting and Concurrency"
Cohesion: 0.15
Nodes (33): isMonitored(), markActive(), withSearchCitations(), startTurnEntryWork(), isChannelBusy(), markBusy(), markFree(), IGNORABLE_CODES (+25 more)

### Community 14 - "Memory Privacy and Tenancy"
Cohesion: 0.31
Nodes (7): cleanupExpiredCooldowns(), cooldowns, findMatchingRule(), REACTION_RULES, ReactionRule, resetCooldowns(), shouldReact()

### Community 15 - "Web Search Decisions"
Cohesion: 0.24
Nodes (6): Where Rokabot Decides Today, recordSearchCitations(), searchWeb(), SearchWebParams, TavilyResponse, TavilyResult

### Community 16 - "Metrics and Diagnostics"
Cohesion: 0.17
Nodes (17): Failure Diagnostics Table, countMemoryEvents(), ExtractionEventInput, FailureDiagnosticInput, getExtractionEventStatement(), getFailureDiagnosticStatement(), getMemoryEventStatement(), getResponseEventStatement() (+9 more)

### Community 17 - "Gemini Fallback Routing"
Cohesion: 0.18
Nodes (4): configState, RequestCall, responses(), TextLlm

### Community 18 - "Hangman Game Logic"
Cohesion: 0.20
Nodes (21): attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow, legalScopes() (+13 more)

### Community 19 - "Memory Extraction Test Script"
Cohesion: 0.15
Nodes (20): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), recordEpisodeMessage(), resetEpisodeTrackerForTest(), scheduleLull(), timers (+12 more)

### Community 20 - "Development Tooling"
Cohesion: 0.08
Nodes (25): @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, husky, lint-staged, devDependencies, @biomejs/biome, @commitlint/cli (+17 more)

### Community 21 - "Session Attachment Management"
Cohesion: 0.11
Nodes (15): attachmentMarker(), abortActiveTurns(), runner, clearSessionErrorCount(), ensureSession(), idleTimers, incrementSessionErrorCount(), rehydrationSuppressed (+7 more)

### Community 22 - "Live Gate and Quota Diagnostics"
Cohesion: 0.10
Nodes (24): argumentsFrom(), liveAdapters(), loadTranscriptLines(), main(), offlineAdapters(), ReplayArgs, ReplayMetrics, transcriptFiles() (+16 more)

### Community 23 - "SQLite Data Access"
Cohesion: 0.22
Nodes (14): claim(), asClaim(), asScenario(), evaluateMemoryShadow(), FixtureClaim, loadReplaySet(), MemoryShadowReport, percentile95() (+6 more)

### Community 24 - "Response Generation Testing"
Cohesion: 0.12
Nodes (22): generateResponse(), __resetTestRunTurnFactory(), __setTestRunTurnFactory(), TestRunTurn, destroySession(), resetIdleTimer(), sessionService, droppedFor() (+14 more)

### Community 25 - "Claim Retrieval Ranking"
Cohesion: 0.12
Nodes (28): Memory, Bounded Retrieval Contract, ClaimSource, touchRecalled(), ClaimRow, compareRetrieved(), getActiveClaims(), mapClaim() (+20 more)

### Community 26 - "Transcript Processing"
Cohesion: 0.16
Nodes (22): fixturePath(), loadTranscript(), main(), parseTranscriptLine(), renderTokenTable(), requestMessageContent(), runTranscript(), RunTranscriptOptions (+14 more)

### Community 27 - "Bot Technology Stack"
Cohesion: 0.08
Nodes (25): better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml, @napi-rs/canvas, dependencies (+17 more)

### Community 28 - "CodeRabbit Gate History"
Cohesion: 0.18
Nodes (11): AdmissionResult, admitEpisode(), isTrivial(), normalize(), precheckEpisode(), SENSITIVE_PATTERNS, mocks, getJevEventStatement() (+3 more)

### Community 29 - "Rate Limiting Logic"
Cohesion: 0.19
Nodes (4): FR-6: Rate Limiting, DECLINE_MESSAGES, mocks, RateLimiter

### Community 30 - "Token Usage Estimation"
Cohesion: 0.21
Nodes (16): FR-4: Layered Personality Prompts, Prompt System, AssemblerInput, buildContextPrompt(), getTimeOfDay(), CORE_PROMPT_MEMORY_FREE, MEMORY_TOOL_RULES, TONE_PROMPTS (+8 more)

### Community 31 - "TypeScript Build Config"
Cohesion: 0.09
Nodes (22): ES2022, **/*.test.ts, compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib (+14 more)

### Community 32 - "Game Command Handling"
Cohesion: 0.21
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 33 - "Channel Session Window"
Cohesion: 0.26
Nodes (13): ImageAttachment, describeEmbed(), describeForwardedSnapshots(), describePoll(), extractComponentMedia(), extractComponentTexts(), extractCurrentMessageContent(), ExtractedMessageContent (+5 more)

### Community 34 - "CI/CD Pipeline Gates"
Cohesion: 0.08
Nodes (26): scripts, build, dev, dev:quiet, export:vault, format, format:check, harness (+18 more)

### Community 35 - "Mock Object Factories"
Cohesion: 0.06
Nodes (72): reminders Config Section, assert(), fail(), main(), makeMessage(), pass(), results, TestResult (+64 more)

### Community 36 - "Legacy Fact Extractor"
Cohesion: 0.22
Nodes (11): buildLookedUpBlock(), clip(), decidePrefetch(), JevPrefetchMode, PrefetchContext, PrefetchDecision, PrefetchOutcome, runPrefetchForJudgment() (+3 more)

### Community 37 - "Config Loading and Claims Rollout"
Cohesion: 0.15
Nodes (9): Configuration (AGENTS.md), episodeMaxMessages, maxJitterAchievableRetries, minJitterAchievableRetries, NUMERIC_BOUNDS, requiredEnv(), yaml, YamlConfig (+1 more)

### Community 38 - "Claim Extraction Pipeline"
Cohesion: 0.22
Nodes (13): retractClaim(), baseSalienceOf(), cardinalityOf(), isKnownPredicate(), normalizePredicate(), predicate(), PredicateCardinality, predicateCategory (+5 more)

### Community 39 - "Phase 8 Test Script"
Cohesion: 0.22
Nodes (12): FR-3: Per-Channel Conversational Memory, FR-5: Tone Detection, Attachment History Stripping, ChannelSession, ToneKey, WindowMessage, detectTone(), detectToneWithSource() (+4 more)

### Community 40 - "Anime Lookup Tools"
Cohesion: 0.05
Nodes (61): Tool Footer, flipCoin(), FlipCoinResult, ForgetUserParams, BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan() (+53 more)

### Community 41 - "Discord Fake Builders"
Cohesion: 0.24
Nodes (10): enqueueEpisode(), EpisodeCursor, ExtractionEpisode, ExtractionQueueJob, ExtractionQueueRow, mapJob(), QueueWriteOptions, enqueueEpisodeAndAdvanceCursor() (+2 more)

### Community 42 - "ModelScope Fallback Adapter"
Cohesion: 0.16
Nodes (17): AnswerModel, attachmentKind(), attachmentMarker(), ChatMessage, GeneratedCall, isRecord(), JsonObject, MessageEntry (+9 more)

### Community 43 - "In-Flight Attachment Byte Budget"
Cohesion: 0.20
Nodes (8): Global In-Flight Byte Budget, Global In-Flight Attachment Budget, inFlightBytes(), release(), reservationFor(), tryReserve(), client, mocks

### Community 44 - "Guild Permissions and Message Intake"
Cohesion: 0.19
Nodes (6): ModelRoute, afterHedge(), DeferredLlm, loggerMock, Outcome, responses()

### Community 45 - "Media Validation Policies"
Cohesion: 0.14
Nodes (26): attachment_url, Audio Intake Recommendation, PDF Intake Recommendation, Video Low Resolution Recommendation, Attachment Types and Their Ceilings, requestCarriesVideo(), ALLOWED_AUDIO_TYPES, ALLOWED_DOCUMENT_TYPES (+18 more)

### Community 46 - "Gemini Error Handling"
Cohesion: 0.13
Nodes (21): FailureKind, activeAbortControllers, ErrorRecoveryPlugin, fallbackResult(), hasStickyFallback(), markerFrom(), modelNameForCurrentRequest(), ModelVerdict (+13 more)

### Community 47 - "Tool Trigger Fixtures"
Cohesion: 0.06
Nodes (50): getLocalHour(), emitTrialRecord(), formatTrialRecord(), TrialRecord, describeQuotaFailure(), diagnoseKey(), errorText(), record (+42 more)

### Community 48 - "Memory Predicates and Privacy"
Cohesion: 0.22
Nodes (13): assertClaim(), getActiveClaims(), normalizeKey(), sensitiveFactReason, addNickname(), addUser(), LEGITIMATE, SENSITIVE (+5 more)

### Community 49 - "Chart Rendering Logic"
Cohesion: 0.28
Nodes (13): degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut(), ROKA_CHART_PALETTE (+5 more)

### Community 50 - "Core Architecture and Fallback Tests"
Cohesion: 0.17
Nodes (9): modelRouteForRequest, __resetModelFallbackForTest(), TurnOutcome, existingFallbackReplies, mocks, mutableFallbackConfig, mutableGeminiConfig, mutableJevConfig (+1 more)

### Community 51 - "Extraction Scheduler Tests"
Cohesion: 0.15
Nodes (12): resetMonitor(), CaptureInput, CaptureKind, CaptureRecord, createCaptureSink(), responseEventCount(), transcript, mocks (+4 more)

### Community 52 - "Test TypeScript Config"
Cohesion: 0.13
Nodes (14): node, tests/**/*, ./tsconfig.json, vitest/globals, compilerOptions, noEmit, rootDir, types (+6 more)

### Community 53 - "Benchmark Pacing Logic"
Cohesion: 0.16
Nodes (17): GPT-6-Astra, Jev Rollout Plan, Second Opinion, Who-Is-Who Resolver, buildNameIndex(), escapeRegex(), isAscii(), MATCH_PRIORITY (+9 more)

### Community 54 - "Timezone Testing"
Cohesion: 0.22
Nodes (10): discord Config Section, emoji Config Section, games Config Section, gemini Config Section, logging Config Section, metrics Config Section, rateLimit Config Section, session Config Section (+2 more)

### Community 55 - "Harness Capture Sink"
Cohesion: 0.20
Nodes (5): benchmarkTranscript, mocks, responseText(), scriptedResponse(), transcript

### Community 56 - "Obsidian Export Logic"
Cohesion: 0.23
Nodes (11): memory Config Section, Browsing Memory in Obsidian, MemoryClaim, ActiveClaimSubject, ExportedClaim, exportVault(), formatClaimGroups(), formatNote() (+3 more)

### Community 57 - "Reminders"
Cohesion: 0.22
Nodes (5): errorText(), isHedgeEligible(), raceForWinner(), RoutedLlm, withAbort()

### Community 58 - "LLM Tool Registry"
Cohesion: 0.29
Nodes (9): BackoffOptions, classifyGeminiFailure(), classifyMarker(), computeBackoff(), extractGeminiStatus(), GeminiFailureResult, isRecord(), result() (+1 more)

### Community 59 - "Multimodal Intake Research"
Cohesion: 0.20
Nodes (5): citationsForTurn, SearchCitation, ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS

### Community 60 - "Token Budget Management"
Cohesion: 0.32
Nodes (9): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, canAffordAttachments(), chargeTokens(), drain(), lastDrain, remainingTokensThisMinute(), __resetTokenBudgetForTest() (+1 more)

### Community 61 - "Attachment Type Limits"
Cohesion: 0.33
Nodes (5): Deliberately Not Done, Gemini-Outage Fallback (Qwen3.5), The Fallback Model, createRokaModel(), ModelScopeLlm

### Community 62 - "Attachment Token Cost Findings"
Cohesion: 0.50
Nodes (4): fallback Config Section, ModelScope Qwen Fallback, Tech Stack (README), Fallback Model (runbook)

### Community 63 - "Tone Detection"
Cohesion: 0.36
Nodes (8): Architecture (AGENTS.md), Critical Do-Nots, Project (Rokabot description), Reference Docs (AGENTS.md), Rokabot PRD, Documentation (README index), Jev Integration (Research Doc), Rokabot TRD

### Community 64 - "Product Requirements"
Cohesion: 0.10
Nodes (24): FR-10: Graceful Shutdown, FR-2: Mention/Reply Interaction, FR-7: Error Handling, FR-8: Response Formatting, FR-9: Docker Deployment, Functional Requirements, ALLOWED_IMAGE_TYPES Consolidation, Byte Cap as Duration Proxy (+16 more)

### Community 65 - "Interaction Metrics Testing"
Cohesion: 0.18
Nodes (7): attachmentOptionName(), expectedPolicy, createInteraction(), askWith(), client, createInteraction(), mocks

### Community 66 - "CI Deploy Pipeline"
Cohesion: 0.19
Nodes (15): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping), Deployment & Operations (+7 more)

### Community 67 - "Discord Command Registration"
Cohesion: 0.33
Nodes (6): Tech Stack (AGENTS.md), config, createClient(), mocks, logger, getSharedRateLimiter()

### Community 68 - "Test Trial Recording"
Cohesion: 0.29
Nodes (5): buildCommandBody(), handleReady(), mocks, startStatusCycler(), STATUS_SCHEDULE

### Community 69 - "Stats Command and Error Handling"
Cohesion: 0.22
Nodes (10): distinctRememberedUsers(), memoryGrowthSeries(), newClaimsThisMonth(), topPredicates(), topRememberedMembers(), buildMemory(), memoryQuote(), predicateLabel() (+2 more)

### Community 70 - "Buddy Collection UI"
Cohesion: 0.28
Nodes (8): Discord Gateway Layer, RateLimiterConfig, RPM-Budget Accounting, A Turn Reserves the Calls It May Make, The Two Limiters Bound Their Windows Differently, modelCallsForRequest, CallReservation, RateLimiterConfig

### Community 71 - "Project Metadata"
Cohesion: 0.18
Nodes (10): description, engines, node, lint-staged, *.{json,md,yml,yaml}, *.{ts,js}, main, name (+2 more)

### Community 72 - "Model Comparison Testing"
Cohesion: 0.22
Nodes (9): CapturingErrorPlugin, classify(), ITERATIONS, main(), MODELS, PROBES, runOne(), RunOutcome (+1 more)

### Community 73 - "Memory Candidate Gate"
Cohesion: 0.33
Nodes (5): Expressions & Tones, Message Pipeline, System Architecture, TONE_STYLES, ToneStyle

### Community 74 - "Attachment Measurement Script"
Cohesion: 0.22
Nodes (12): Getting Started, npm run test:live Gate, Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION, mimeForPath() (+4 more)

### Community 75 - "Payload Rendering Logic"
Cohesion: 0.42
Nodes (10): asObject(), asObjects(), chunkLabel(), componentDetails(), isComponentsV2Payload(), PayloadObject, renderEmbeds(), renderPayload() (+2 more)

### Community 76 - "Deployment and Infrastructure"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 79 - "Stats Views Tests"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "Message Handling Tests"
Cohesion: 0.12
Nodes (13): metrics, mocks, turnEntryWork, createMessage(), createRateLimiter(), handle(), metrics, mocks (+5 more)

### Community 81 - "Database Management and Migration"
Cohesion: 0.15
Nodes (10): evicted, pinClaim(), pruneActiveClaimOverflow(), REMEMBER_TURN, closeDb(), createTables(), resolveDbPath(), runMigrations() (+2 more)

### Community 82 - "Product Requirements Document"
Cohesion: 0.40
Nodes (5): Problem Statement, Product Requirements Document, Project Objectives, Target Users, User Workflow Overview

### Community 85 - "Gemini Failure Handling"
Cohesion: 0.17
Nodes (12): ADK Error Delivery Constraint, Attachment Bytes Do Not Live in History, Concurrency & Lifecycle Under Retry, Gemini Failure Taxonomy, Gemini API, Roka Agent (ADK), Session Manager, A Spent Day Is Not a Spent Minute (+4 more)

### Community 86 - "ADK Smoke Testing"
Cohesion: 0.25
Nodes (9): AssemblerInput, ErrorRecoveryPlugin, main(), results, runQuery(), test(), TestResult, wordCount() (+1 more)

### Community 91 - "Streaming Media Prefix Policy"
Cohesion: 0.13
Nodes (22): RFC-3003, Handing Her a File, Multimodal Research Doc, PDF Token Cost Measurement, Attachment Token Admission, measureAttachmentTokens(), needsMeasuring(), GEMINI_SPELLINGS (+14 more)

### Community 92 - "ADK Inline Data Testing"
Cohesion: 0.25
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 95 - "Gemini Safety Settings"
Cohesion: 0.53
Nodes (4): ALLOWED_HARM_BLOCK_THRESHOLDS, buildSafetySettings(), SAFETY_SETTINGS, SUPPORTED_HARM_CATEGORIES

### Community 97 - "README Architecture and Tones"
Cohesion: 0.38
Nodes (5): EXPRESSION_URLS, getExpressionUrl(), lastExpressionByTone, __resetExpressionState(), TONE_EXPRESSIONS

### Community 98 - "Claims Memory Tables"
Cohesion: 0.36
Nodes (8): Claim Lifecycle, Claims Memory Architecture, extraction_queue Table, memory_claim_fts Table, memory_claim Table, memory_events Table, memory_evidence Table, Vault Export

### Community 99 - "Memory Safety Logic"
Cohesion: 0.12
Nodes (21): buildFactsEnvelope(), buildOverheardBlock(), isSafeFactScalar(), normalizeOverheardText(), renderOverheardBlock(), GenerateOptions, PrefetchResult, settlePrefetch() (+13 more)

### Community 102 - "Rate Limiting Tests"
Cohesion: 0.40
Nodes (4): MEMORY_TOOL_NAMES, makeInteraction(), mocks, turn()

### Community 105 - "Chat Input Testing"
Cohesion: 0.67
Nodes (3): handleInput(), main(), username

### Community 108 - "Character and Source Work"
Cohesion: 0.67
Nodes (3): Maniwa Roka, Rokabot, Senren*Banka

## Ambiguous Edges - Review These
- `Rokabot TRD` → `Second Opinion`  [AMBIGUOUS]
  docs/research/jev-integration.md · relation: conceptually_related_to

## Knowledge Gaps
- **494 isolated node(s):** `$schema`, `enabled`, `indentStyle`, `indentWidth`, `lineWidth` (+489 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Rokabot TRD` and `Second Opinion`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `getDb()` connect `Hangman Game Logic` to `Gacha Buddy System`, `Retry Loop Design History`, `Memory Statistics Visualization`, `Memory Claim Management`, `Memory Extraction Configuration`, `Bot Startup and Shutdown`, `Statistics Query Logic`, `Reply Splitting and Concurrency`, `Metrics and Diagnostics`, `Memory Extraction Test Script`, `Live Gate and Quota Diagnostics`, `SQLite Data Access`, `Claim Retrieval Ranking`, `CodeRabbit Gate History`, `Mock Object Factories`, `Claim Extraction Pipeline`, `Discord Fake Builders`, `Tool Trigger Fixtures`, `Memory Predicates and Privacy`, `Extraction Scheduler Tests`, `Benchmark Pacing Logic`, `Harness Capture Sink`, `Obsidian Export Logic`, `Stats Command and Error Handling`, `Database Management and Migration`, `Memory Safety Logic`, `Rate Limiting Tests`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Why does `config` connect `Discord Command Registration` to `Gacha Buddy System`, `Retry Loop Design History`, `Memory Claim Management`, `Game Configuration`, `Bot Startup and Shutdown`, `Reply Splitting and Concurrency`, `Memory Privacy and Tenancy`, `Memory Extraction Test Script`, `Session Attachment Management`, `SQLite Data Access`, `Response Generation Testing`, `Claim Retrieval Ranking`, `CodeRabbit Gate History`, `Mock Object Factories`, `Config Loading and Claims Rollout`, `Anime Lookup Tools`, `ModelScope Fallback Adapter`, `In-Flight Attachment Byte Budget`, `Gemini Error Handling`, `Tool Trigger Fixtures`, `Core Architecture and Fallback Tests`, `Harness Capture Sink`, `Obsidian Export Logic`, `Token Budget Management`, `Product Requirements`, `Interaction Metrics Testing`, `Test Trial Recording`, `Model Comparison Testing`, `Message Handling Tests`, `ADK Smoke Testing`, `Streaming Media Prefix Policy`, `Gemini Safety Settings`, `Memory Safety Logic`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Why does `logger` connect `Discord Command Registration` to `Gacha Buddy System`, `Discord Output and Sprite Decisions`, `Memory Claim Management`, `Game Configuration`, `Memory Extraction Configuration`, `Bot Startup and Shutdown`, `Reply Splitting and Concurrency`, `Memory Privacy and Tenancy`, `Web Search Decisions`, `Metrics and Diagnostics`, `Hangman Game Logic`, `Session Attachment Management`, `Response Generation Testing`, `CodeRabbit Gate History`, `Mock Object Factories`, `Legacy Fact Extractor`, `Anime Lookup Tools`, `ModelScope Fallback Adapter`, `Gemini Error Handling`, `Memory Predicates and Privacy`, `Chart Rendering Logic`, `Token Budget Management`, `Test Trial Recording`, `Database Management and Migration`, `Streaming Media Prefix Policy`, `README Architecture and Tones`, `Memory Safety Logic`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `generateResponse()` (e.g. with `Attachment Bytes Do Not Live in History` and `responseText()`) actually correct?**
  _`generateResponse()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `enabled`, `indentStyle` to the rest of the system?**
  _494 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Gacha Buddy System` be split into smaller, more focused modules?**
  _Cohesion score 0.0545361875637105 - nodes in this community are weakly interconnected._