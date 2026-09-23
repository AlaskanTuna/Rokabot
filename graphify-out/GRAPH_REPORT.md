# Graph Report - rokabot  (2026-09-24)

## Corpus Check
- 231 files · ~211,897 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2010 nodes · 4930 edges · 128 communities (99 shown, 29 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 205 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ba206f6a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Reminder and Session Config
- Memory Isolation and Safety
- Memory Extraction Configuration
- Session and Prompt Management
- Code Formatting Configuration
- Message Handling Logic
- TypeScript Configuration
- Memory Claim Management
- Discord Mocking Utilities
- Memory Statistics Visualization
- Attachment Limit Policies
- Gacha Buddy System
- SQLite Data Access
- Response Generation Testing
- Metrics and Diagnostics
- CI/CD Pipeline Gates
- Retry and Safety Logic
- Utility Tool Functions
- Configuration and Tuning
- Hangman Game Logic
- Statistics Query Logic
- Development Tooling
- Database Administration
- Logging and Tooling
- Media Validation Policies
- Memory Extraction Privacy
- Rate Limiting Logic
- Gacha Interaction Logic
- Discord Command Registration
- Transcript Processing
- Evaluation Harness Utilities
- Bot Technology Stack
- Documentation and Governance
- Anime Lookup Tools
- Session Attachment Management
- Slash Command UI
- Memory Retrieval Logic
- Background Task Scheduling
- Game Command Handling
- Deployment and Infrastructure
- Prompt Assembly Logic
- Memory Budgeting
- Chart Rendering Logic
- Turn Budgeting Logic
- Gemini Error Handling
- Privacy and Isolation
- Mock Object Factories
- Project Guidelines and Constraints
- Gemini Configuration
- Web Search Integration
- Interaction Handling
- Rate Limiting Tests
- Memory Predicate Logic
- Turn Reliability Logic
- Tool Trigger Fixtures
- Token Usage Estimation
- Reminder System Configuration
- Obsidian Export Logic
- Message Formatting Logic
- Benchmark Pacing Logic
- Token Budget Management
- Interaction Metrics Testing
- Multimodal Intake Policy
- Search Citation Logic
- Test Fixture Management
- Live Model Benchmarking
- Statistical Scoring Logic
- Prompt and Recall Logic
- Tone and Expression Logic
- Project Metadata
- Model Comparison Testing
- Extraction Filtering Logic
- Payload Rendering Logic
- View Statistics Testing
- Sprite Optimization Pipeline
- ADK Smoke Testing
- Weather Lookup Tool
- Anime Search Logic
- Error Handling Logic
- Buddy Collection UI
- Message Handling Tests
- Test Trial Recording
- Citation Budgeting Logic
- Core Message Pipeline
- Memory Safety Logic
- ADK Inline Data Testing
- Tool Trigger Testing
- Quota Diagnostic Logic
- Interaction Mocking
- memoryQuote
- Game Configuration
- Capture Sink Utilities
- User Recall Logic
- Chat Input Testing
- Scripted LLM Interface
- Benchmark Pacing Config
- Attachment Error Messaging
- Timezone Testing
- Channel Mocking
- Key Diagnostic Testing
- Commit Message Standards
- Production Testing Conventions
- Roka Bot Documentation
- Docker Container Management
- Self-Hosted CI Infrastructure
- Unit Testing Mocks
- Biome Linting Rules
- CI Status Verification
- CodeRabbit Account Management
- CodeRabbit Review Logic
- CodeRabbit Merge Policies
- CodeRabbit Verdict Detection
- Document Sync Logic
- Evidence Rule Validation
- Formatter Concurrency Control
- Gemini Fallback Strategy
- Gemini Quota Management
- Worktree Peer Protocol
- Branch Rebase Restrictions
- Specimen Control Principles
- Error Classification Logic
- System Guard Probing
- Embed Link Permissions
- Game Score Database
- Network System Services
- SSH Access Configuration

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 154 edges
2. `config` - 70 edges
3. `createMessageHandler()` - 57 edges
4. `generateResponse()` - 50 edges
5. `logger` - 46 edges
6. `createInteractionHandler()` - 39 edges
7. `main()` - 33 edges
8. `main()` - 28 edges
9. `RateLimiter` - 28 edges
10. `runTranscript()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `memory.channelMonitorTtlMs (86400000ms)` --conceptually_related_to--> `markActive()`  [INFERRED]
  config.yml → src/agent/channelMonitor.ts
- `memory.retrievalTokenBudget (350)` --conceptually_related_to--> `retrieveForTurn()`  [INFERRED]
  config.yml → src/agent/memory/retriever.ts
- `memory.bufferSize (30)` --conceptually_related_to--> `addMessage()`  [INFERRED]
  config.yml → src/agent/passiveBuffer.ts
- `4-Layer Prompt System` --conceptually_related_to--> `assembleSystemPrompt()`  [INFERRED]
  AGENTS.md → src/agent/promptAssembler.ts
- `gemini.maxAttachmentTokens (50000)` --conceptually_related_to--> `canAffordAttachments()`  [INFERRED]
  config.yml → src/agent/tokenBudget.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Turn Reliability, Retry Limits, and Admission Control** — docs_decisions_phase_9_reliability, docs_decisions_phase_20_turn_deadline, docs_decisions_turn_deadline_budget_derivation, docs_decisions_retry_budget_jitter_tails, src_agent_roka_runturnwithreliability [EXTRACTED 1.00]
- **Memory Tenancy, Privacy Boundaries, and Failure Handling** — docs_decisions_prompt_injection_defense, docs_decisions_memory_privacy_guild_isolation, docs_decisions_dm_channel_memory_tenancy, docs_decisions_memory_tools_fail_closed_tenant, src_storage_usermemory_savefact, src_storage_usermemory_getfacts [EXTRACTED 1.00]
- **Live Model Evaluation Harness and Testing Gates** — docs_decisions_test_live_third_gate, docs_decisions_live_model_statistical_verdict, docs_decisions_live_tool_trigger_gate_floors, tests_harness_tests_tooltrigger_live_test, tests_harness_tooltriggerscoring_meetsliveverdict [EXTRACTED 1.00]
- **Safety De-escalation and History Suppression Subsystem** — docs_decisions_safety_deescalation_ladder, docs_decisions_safety_rehydration_suppression, docs_decisions_safety_retry_token_gating, src_agent_roka, src_agent_roka_rehydrationsuppressed [EXTRACTED 1.00]
- **Multimodal Attachment Token Budgeting Subsystem** — docs_decisions_flat_image_token_cost, docs_decisions_post_turn_attachment_stripping, docs_decisions_modality_decoupled_token_cost, docs_decisions_attachment_tpm_rpm_divergence, src_agent_attachmentcost, src_agent_tokenbudget [EXTRACTED 1.00]
- **Search Arbitration and Citation Pipeline Subsystem** — docs_decisions_tavily_search_quality_repair, docs_decisions_positive_only_search_rubric, docs_decisions_search_citation_pipeline_migration, src_agent_tools_searchweb, src_discord_citations [EXTRACTED 1.00]
- **Rate and Token Budget Multi-Layer Quota Defense** — src_utils_ratelimiter_ratelimiter_reservecalls, src_agent_tokenbudget, src_discord_bytebudget, docs_trd_per_minute_token_budget, docs_trd_attachment_byte_budget [INFERRED 0.95]
- **Attachment Processing and Memory Defense Pipeline** — src_discord_bytebudget_tryreserve, src_agent_roka_readwithinlimit, src_agent_attachmentcost_needsmeasuring, src_agent_roka_windowedsessionservice_stripattachmentbytes, docs_trd_attachment_history_stripping [EXTRACTED 1.00]
- **Claims Memory Extraction and Retrieval Pipeline** — src_storage_extractionqueue, src_agent_memory_scheduler, src_agent_memory_memoryclaims, src_agent_memory_retriever_retrieveforturn, src_agent_promptsafety_buildfactsenvelope [EXTRACTED 1.00]
- **Message Admission and Guard Pipeline Flow** — docs_readme_concurrency_guard, docs_readme_admission_guards_ladder, docs_readme_one_attachment_per_turn, src_utils_ratelimiter_ratelimiter_canadmitcalls, src_discord_bytebudget_tryreserve [INFERRED 0.85]
- **Claims Memory Extraction and Retrieval Lifecycle** — docs_readme_claims_based_memory, docs_readme_tenant_isolation, docs_readme_pinned_claims_exemption, docs_runbook_user_memory_table, src_agent_memory_extractor_generateextraction [INFERRED 0.85]
- **Discord Permission Derivation and Gateway Requirements** — docs_runbook_bot_scope_requirement, docs_runbook_permission_derivation, docs_runbook_no_build_time_pin_decision, docs_runbook_reminder_channel_permission, src_discord_client_createclient [INFERRED 0.85]
- **Multimodal Attachment Safety Pipeline** — docs_research_multimodal_global_byte_budget, docs_research_multimodal_streaming_size_guard, docs_research_multimodal_attachment_strip_history, docs_research_multimodal_tpm_ceiling_measurement, src_discord_bytebudget [INFERRED 0.95]
- **Rate and Token Budgeting Architecture** — docs_prd_fr_6_rate_limiting, docs_research_multimodal_tpm_ceiling_measurement, src_utils_ratelimiter_ratelimiter, src_agent_tokenbudget [INFERRED 0.95]
- **Conversational Turn Lifecycle** — docs_prd_user_workflow_overview, docs_prd_fr_3_per_channel_conversational_memory, docs_prd_fr_4_layered_personality_prompts, docs_prd_fr_5_tone_detection, src_agent_roka_rokaagent [INFERRED 0.85]
- **CI/CD Deployment Pipeline to Raspberry Pi 5** — _github_workflows_deploy_workflow, _github_workflows_deploy_job_test, _github_workflows_deploy_job_deploy, _github_workflows_deploy_health_check, docker_compose_roka [EXTRACTED 1.00]
- **Gemini Free-Tier Rate & Token Budget Guard System** — config_gemini_max_attachment_tokens, config_gemini_max_tokens_per_minute, config_rate_limit_rpm, config_gemini_retry_rpm_floor, config_memory_extraction_daily_budget_ratio [INFERRED 0.85]
- **Rokabot Request Processing Architecture Pipeline** — agents_discord_gateway_layer, agents_rate_limit_guard, agents_concurrency_guard, agents_session_manager, agents_roka_agent [EXTRACTED 1.00]

## Communities (128 total, 29 thin omitted)

### Community 0 - "Reminder and Session Config"
Cohesion: 0.12
Nodes (28): Guild Permissions Derivation Documentation, Historical Stats Backfill Declined, Reminder Channel First Delivery, reminders Table Operations, session_history Table Operations, SQLite Durable Tables Ecosystem, assert(), fail() (+20 more)

### Community 1 - "Memory Isolation and Safety"
Cohesion: 0.08
Nodes (46): Gemini Safety Settings Explicit OFF Configuration, Prompt Injection Defense and Memory Chokepoint, assert(), fail(), main(), pass(), results, TestResult (+38 more)

### Community 2 - "Memory Extraction Configuration"
Cohesion: 0.06
Nodes (50): gemini.extractionRpmFloor (3), memory Configuration Section, memory.bufferSize (30), memory.channelMonitorTtlMs (86400000ms), memory.claimRetentionDays (90), memory.contextSize (10), memory.extractionDailyBudgetRatio (0.4), memory.extractionGapMs (20000ms) (+42 more)

### Community 3 - "Session and Prompt Management"
Cohesion: 0.06
Nodes (47): 4-Layer Prompt System, Gemini Flash Lite Backend, Roka Agent (ADK), Rule-Based Tone Detection, Session Manager In-Memory Cache, gemini.model (gemini-3.5-flash-lite), session Configuration Section, session.historyRetentionDays (7) (+39 more)

### Community 4 - "Code Formatting Configuration"
Cohesion: 0.05
Nodes (45): Biome and Prettier Formatting, useLiteralKeys, files, ignore, formatter, enabled, indentStyle, indentWidth (+37 more)

### Community 5 - "Message Handling Logic"
Cohesion: 0.11
Nodes (42): Response Events Tools Used Logging, Send Path Markdown Backtick Escaping, Split Response Midpoint Heuristic, UTF-16 Emoji Surrogate Split Protection, Per-Channel Concurrency Guard, Rich Message Perception, Trigger Surfaces (Mentions, Replies, Keywords), MessageCreate Mention/Reply Contract (+34 more)

### Community 6 - "TypeScript Configuration"
Cohesion: 0.05
Nodes (37): Two-Tier Typecheck Gate, ES2022, node, **/*.test.ts, tests/**/*, ./tsconfig.json, vitest/globals, compilerOptions (+29 more)

### Community 7 - "Memory Claim Management"
Cohesion: 0.09
Nodes (47): Phase 14 Claims Memory Backend Dormant Ship, SQLite Storage Engine, Raspberry Pi Operations Runbook, SQLite Database Administration, Claim Deduplication Constraint (idx_memory_claim_dedup), Claim Lifecycle Management, Claim Retention and Capacity Limits, Memory Claim FTS5 Mirror (+39 more)

### Community 8 - "Discord Mocking Utilities"
Cohesion: 0.06
Nodes (43): payload(), AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec (+35 more)

### Community 9 - "Memory Statistics Visualization"
Cohesion: 0.14
Nodes (30): Last 30 Days Stats Views, activeClaimCount(), memoryGrowthSeries(), newClaimsThisMonth(), retrySummary, tokenTotals, topChannels(), topPredicates() (+22 more)

### Community 10 - "Attachment Limit Policies"
Cohesion: 0.07
Nodes (36): RFC-3003, Buddy Sprite Hosting Migration, Buddy Sprites Generation and CDN Hosting, Sharp Multi-Stage Resize Pipeline, Attachment Ceilings by Media Type, One Attachment Per Turn Constraint, Oversized Media Truncation Policy, Byte Cap as Duration Proxy (+28 more)

### Community 11 - "Gacha Buddy System"
Cohesion: 0.14
Nodes (27): Buddy Table Unique Constraint Drop, Gacha Rolling 24h Hatch Cadence, BuddyRow, DailyBuddyHatch, DailyHatchRow, generateBuddy(), generateName(), generatePersonality() (+19 more)

### Community 12 - "SQLite Data Access"
Cohesion: 0.19
Nodes (16): claim(), asClaim(), asScenario(), evaluateMemoryShadow(), FixtureClaim, loadReplaySet(), MemoryShadowReport, oldAllFactsTokenEstimate() (+8 more)

### Community 13 - "Response Generation Testing"
Cohesion: 0.12
Nodes (22): Gemini Function Call Ordering 400 Recovery, Prompt-Assembly Retrieval Invariant, destroySession(), eventsToWindowMessages(), generateResponse(), resetIdleTimer(), __setTestRunTurnFactory(), TestRunTurn (+14 more)

### Community 14 - "Metrics and Diagnostics"
Cohesion: 0.12
Nodes (22): metrics Configuration Section, metrics.diagnosticsRetentionHours (72), metrics.retentionDays (90), Phase 12 SQLite Observability Metrics, HTTP 429 Classification, failure_diagnostics Forensics, Context De-escalation Safety Ladder, countMemoryEvents() (+14 more)

### Community 15 - "CI/CD Pipeline Gates"
Cohesion: 0.12
Nodes (26): CI Test Job, Core NPM Commands & Verification, Main Branch PR CI Gate, Phase 10 Dev Workspace Hybrid Harness, Live Model Behavior Third Test Gate, Verification and Acceptance Gates, scripts, build (+18 more)

### Community 16 - "Retry and Safety Logic"
Cohesion: 0.09
Nodes (25): AbortController Swap on Timed Out Retry, Attempt Timed Out Retry Mechanism, Capturing Runner Pattern, CountTokens Video Audio Bias Balance, Flat Image Token Cost, Post-Turn Attachment Stripping, Safety De-escalation Ladder, Safety Rehydration Suppression (+17 more)

### Community 17 - "Utility Tool Functions"
Cohesion: 0.09
Nodes (29): flipCoin(), FlipCoinResult, cityToTimezone, getCurrentTime(), GetCurrentTimeParams, GetCurrentTimeResult, resolveTimezone(), emptyResult() (+21 more)

### Community 18 - "Configuration and Tuning"
Cohesion: 0.14
Nodes (10): Cross-Key Config Checks Warning Without Clamping, Separate Max Live Retry Window and Reachability Formulas, Docker Multi-Stage Deployment, Runtime Environment, envString(), extractionInterval, JevMode, yaml (+2 more)

### Community 19 - "Hangman Game Logic"
Cohesion: 0.19
Nodes (21): buildHangmanBody(), handleHangmanGuess(), handleHangmanStart(), HANGMAN_COLORS, saveHangmanScore(), activeGames, getDisplayWord(), getGame() (+13 more)

### Community 20 - "Statistics Query Logic"
Cohesion: 0.08
Nodes (37): /stats Headers and Bot Self-Exclusion, activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome (+29 more)

### Community 21 - "Development Tooling"
Cohesion: 0.09
Nodes (24): Conventional Commits Convention, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, husky, lint-staged, devDependencies, @biomejs/biome (+16 more)

### Community 22 - "Database Administration"
Cohesion: 0.50
Nodes (4): topTones(), isToneKey(), TONE_KEYS, toneCounts()

### Community 23 - "Logging and Tooling"
Cohesion: 0.17
Nodes (9): Failure Diagnostics Table, Native Timer Seam Limitation, Database Wipe and Reinitialization, mocks, closeDb(), createTables(), runMigrations(), DatabaseModule (+1 more)

### Community 24 - "Media Validation Policies"
Cohesion: 0.14
Nodes (23): Attachment URL SSRF and Type Validation, ALLOWED_IMAGE_TYPES Consolidation, Audio Intake Recommendation, PDF Intake Recommendation, Video Low Resolution Recommendation, Components V2 Media Extraction, SSRF Guarded Media URL Resolution, ALLOWED_AUDIO_TYPES (+15 more)

### Community 25 - "Memory Extraction Privacy"
Cohesion: 0.11
Nodes (28): gemini.extractionMaxRetries (1), memory.claimsBackend (true), Memory Consent Split Architecture, Privacy Guard Loose Floor, CandidateGateResult, hasKeyword(), isSensitive(), isTrivial() (+20 more)

### Community 26 - "Rate Limiting Logic"
Cohesion: 0.23
Nodes (6): rateLimit Configuration Section, rateLimit.rpd (500), Four-Stage Admission Guards Ladder, Turn Call Reservation Guard (#167), RPM Budget Accounting and Floor Priority, RateLimiter

### Community 27 - "Gacha Interaction Logic"
Cohesion: 0.23
Nodes (19): handleGachaMention(), statBar(), formatBuddySummary(), formatHatchTimeRemaining(), handleBuddyLeaderboard(), handleBuddyStats(), handleBuddyView(), handleHatch() (+11 more)

### Community 28 - "Discord Command Registration"
Cohesion: 0.15
Nodes (10): Direct Messages Intent Omission Growth Barrier, In-Flight Hold Assertion Principle, Sliding Window Rate Limiting, Discord Platform and Gateway, Installation and Context Policy, createClient(), handleReady(), mocks (+2 more)

### Community 29 - "Transcript Processing"
Cohesion: 0.17
Nodes (21): fixturePath(), loadTranscript(), main(), parseTranscriptLine(), renderTokenTable(), requestMessageContent(), runTranscript(), RunTranscriptOptions (+13 more)

### Community 30 - "Evaluation Harness Utilities"
Cohesion: 0.10
Nodes (21): resetForTest(), stopExtractionScheduler(), __resetTestRunTurnFactory(), CaptureInput, CaptureKind, CaptureRecord, createCaptureSink(), makeClient() (+13 more)

### Community 31 - "Bot Technology Stack"
Cohesion: 0.09
Nodes (25): Rokabot Technology Stack, discord.js, Chart Rendering Container Font Parity, Gemini API Backend, Roka Agent (ADK), dotenv, @google/adk, @google/genai (+17 more)

### Community 32 - "Documentation and Governance"
Cohesion: 0.10
Nodes (20): AGENTS.md Data Models Section Deletion, AGENTS.md General Guidelines and No Build Pin, CodeRabbit CI PR Gate, CodeRabbit Rate Limit Review Handling, CodeRabbit Gate Unwind Procedure, Codex Worker AGENTS.md PM Lock Preamble, Codex Sandbox Network Access Flag, Codex Worker Briefs Interactive Features Pre-Decline (+12 more)

### Community 33 - "Anime Lookup Tools"
Cohesion: 0.21
Nodes (19): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleParams, GetAnimeScheduleResult, getCurrentSeason() (+11 more)

### Community 34 - "Session Attachment Management"
Cohesion: 0.12
Nodes (10): Attachment History Stripping, Attachment History Stripping, attachmentMarker(), ensureSession(), runner, WindowedSessionService, runTurn(), CapturingLlm (+2 more)

### Community 35 - "Slash Command UI"
Cohesion: 0.08
Nodes (26): Ask Command Consolidation, Command Architecture and Tool Disclosure Footer, Command Registration Policy by Pointer, Command Set API Verification, Gacha Collection Components V2 UI, Game Command Guild Restriction Rationale, Isolated It Block Assertion Convention, Discord Max Message Length Derived Ceiling (+18 more)

### Community 36 - "Memory Retrieval Logic"
Cohesion: 0.10
Nodes (35): Claim Salience Ranking Preservation, Uniform Predicate Salience Model, User By Name Tenant Filtering, Recall Relevance Ranking, needs_review Quarantine Invariant, touchRecalled(), baseSalienceOf(), cardinalityOf() (+27 more)

### Community 37 - "Background Task Scheduling"
Cohesion: 0.18
Nodes (11): restoreMonitoredChannels(), destroyAllSessions(), cleanupExpiredCooldowns(), stopReminderScheduler(), STATUS_SCHEDULE, stopStatusCycler(), client, healthServer (+3 more)

### Community 38 - "Game Command Handling"
Cohesion: 0.26
Nodes (17): createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleHangmanGuide(), handleLeaderboard(), buildGameContainer(), buildTimeoutContainer(), GameContainerOptions (+9 more)

### Community 39 - "Deployment and Infrastructure"
Cohesion: 0.13
Nodes (15): Discord Deployment Webhook Notifications, Deployment Health Check Loop, CD Deploy Job, CI Paths Ignore Filter, Deploy to Pi Workflow, Docker Memory Cap Constraint, ADK_QUIET Environment Variable, Data Volume Mount (+7 more)

### Community 40 - "Prompt Assembly Logic"
Cohesion: 0.24
Nodes (9): Request Composition Prose Enumeration Avoidance, ToneKey Table Test Pinning, AssemblerInput Model, ToneKey Model, AssemblerInput, buildContextPrompt(), getTimeOfDay(), ToneKey (+1 more)

### Community 41 - "Memory Budgeting"
Cohesion: 0.10
Nodes (18): FR-9: Docker Deployment, Concurrency Binding Constraint, Container Memory Cap Correction, Flash-Lite Modality Verification, Global In-Flight Byte Budget, Inline Data vs Files API Decision, Multimodal Intake Research, 4.7x RSS Attachment Multiplier (+10 more)

### Community 42 - "Chart Rendering Logic"
Cohesion: 0.30
Nodes (12): degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut(), ROKA_CHART_PALETTE (+4 more)

### Community 43 - "Turn Budgeting Logic"
Cohesion: 0.20
Nodes (5): Complementary Config Test Split, Retry Budget Dual Jitter Tails, Turn Deadline Budget Max-Jitter Derivation, maxJitterAchievableRetries, minJitterAchievableRetries

### Community 44 - "Gemini Error Handling"
Cohesion: 0.13
Nodes (18): Failure Marker Closed HTTP Status Allowlist, Failure Marker Raw Token Cap and Privacy, Digit-Anchored HTTP Status Failure Classification, Transient Status 504 Classification Addition, Spent Day vs Spent Minute Classification, Telemetry Failure Marker Privacy Contract, BackoffOptions, classifyGeminiFailure() (+10 more)

### Community 45 - "Privacy and Isolation"
Cohesion: 0.16
Nodes (15): Per-Channel DM Memory Tenancy Isolation, Memory Tools Fail Closed on Missing Tenant State, assertClaim(), normalizeKey(), sensitiveFactReason, addNickname(), LEGITIMATE, SENSITIVE (+7 more)

### Community 46 - "Mock Object Factories"
Cohesion: 0.25
Nodes (16): mocks, createToolCommandHandler(), TOOL_COMMAND_NAMES, handleAnime(), handleRemind(), handleRemindAt(), handleRemindCancel(), handleRemindIn() (+8 more)

### Community 47 - "Project Guidelines and Constraints"
Cohesion: 0.17
Nodes (11): Karpathy Coding Guidelines, Critical Agent Constraints, TitleCase Documentation Hygiene, Graphify Knowledge Graph Integration, Maniwa Roka Persona, Rokabot Character Bot Overview, Rust Token Killer (RTK) Proxy, SQLite Canonical Storage (+3 more)

### Community 48 - "Gemini Configuration"
Cohesion: 0.15
Nodes (15): gemini Configuration Section, gemini.liveMaxRetries (2), gemini.maxAttachmentTokens (50000), gemini.maxLlmCalls (4), gemini.maxOutputTokens (500), gemini.maxRetries (3), gemini.retryBackoffBaseMs (1000ms), gemini.retryBackoffCapMs (12000ms) (+7 more)

### Community 49 - "Web Search Integration"
Cohesion: 0.15
Nodes (12): NSFW Search Domain Policy, Positive-Only Search Rubric, Search Depth and Synthesis Layering, Search Recency Handling Limitation, Search Web Tool Scoped Prompt Rules, Tavily Search Quality Repair, Tavily Search API, Shrine Ritual Tool Footer (+4 more)

### Community 50 - "Interaction Handling"
Cohesion: 0.15
Nodes (13): Per-Channel Concurrency Guard, Discord Gateway Layer, Rate Limit Guard Mechanism, FR-1: Slash Command Interaction, Discord Gateway Layer, InteractionCreate Slash Command Contract, Per-Channel Concurrency Guard, askCommand (+5 more)

### Community 51 - "Rate Limiting Tests"
Cohesion: 0.33
Nodes (5): ADK Runner Contract Test Isolation, recallUserTool, makeInteraction(), mocks, turnState()

### Community 52 - "Memory Predicate Logic"
Cohesion: 0.16
Nodes (19): assert(), fail(), main(), makeMessage(), pass(), results, TestResult, cooldowns (+11 more)

### Community 53 - "Turn Reliability Logic"
Cohesion: 0.15
Nodes (13): Phase 19 Steered Safety Regeneration, Phase 20 Turn Deadline Admission Control, Phase 9 Turn Reliability, Reliability Guard Test Loop Binding, FR-7: Error Handling, Silent SIGKILL Risk, fallbackResult(), GenerateOptions (+5 more)

### Community 54 - "Tool Trigger Fixtures"
Cohesion: 0.24
Nodes (14): asCase(), asClaim(), asHeader(), asHistoryLine(), asMember(), asSessionState(), DEFAULT_CASE_SET_PATH, FixtureClaim (+6 more)

### Community 55 - "Token Usage Estimation"
Cohesion: 0.21
Nodes (13): System Prompt Token Cap, MAX_SYSTEM_PROMPT_TOKENS Catastrophe Rail, FR-4: Layered Personality Prompts, System Prompt Token Cap Guard, TONE_PROMPTS, rokaTools, estimateTokens(), fixture (+5 more)

### Community 56 - "Reminder System Configuration"
Cohesion: 0.22
Nodes (10): reminders Configuration Section, reminders.checkIntervalMs (5000ms), reminders.maxPerUser (5), reminders.staleThresholdMs (300000ms), Reminder Stale Threshold Inclusive Comparison, Load-Bearing bot Scope Requirement, No Build-Time Permission Pin Decision, API-Derived Discord Permissions (+2 more)

### Community 57 - "Obsidian Export Logic"
Cohesion: 0.19
Nodes (13): memory.vaultExportDir (data/vault), Obsidian Vault Export, Obsidian Vault Export Technical Contract, export:vault, MemoryClaim, ActiveClaimSubject, ExportedClaim, exportVault() (+5 more)

### Community 58 - "Message Formatting Logic"
Cohesion: 0.18
Nodes (14): Components V2 TextDisplay 4000 Character Ceiling, Reply Split Bound Derivation, Tight Tool Footer Chars Bound, buildRokaMessage(), buildToolFooter(), worstCaseToolFooterLabels, footerWithoutTimestamp(), labelFor() (+6 more)

### Community 59 - "Benchmark Pacing Logic"
Cohesion: 0.13
Nodes (20): Live Eval Fixture World Collision Avoidance, Guild Tenancy and DM Isolation, buildNameIndex(), escapeRegex(), isAscii(), MATCH_PRIORITY, MatchKind, NameCandidate (+12 more)

### Community 60 - "Token Budget Management"
Cohesion: 0.10
Nodes (24): RPM Binding Rate Limit, gemini.maxTokensPerMinute (125000), rateLimit.rpm (15), Gemini Model Selection, Task 91 Claims Backend Default Promotion, FR-6: Rate Limiting, Memory Configuration Tunables, Free-Tier TPM Ceiling Measurement (+16 more)

### Community 61 - "Interaction Metrics Testing"
Cohesion: 0.20
Nodes (9): citationsForTurn, recordSearchCitations(), SearchCitation, attachmentOptionName(), createInteraction(), askWith(), metrics, mocks (+1 more)

### Community 62 - "Multimodal Intake Policy"
Cohesion: 0.17
Nodes (12): getJevClient(), resetJevClientForTest(), BoundedAlias, boundedAliases(), judgeExtraction(), judgeTurn(), timeOfDay(), TurnJudgment (+4 more)

### Community 63 - "Search Citation Logic"
Cohesion: 0.22
Nodes (5): runSearchTurn(), ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS, searchWebTool

### Community 64 - "Test Fixture Management"
Cohesion: 0.22
Nodes (9): Group Conversation Roster Removal, Session State Fixture Seeding, sessionService, channels, header, probeCase, stateAfterCase(), temporaryDirectories (+1 more)

### Community 65 - "Live Model Benchmarking"
Cohesion: 0.15
Nodes (14): Live Benchmark Abort on Non-Ok Turns, Live Gate Transient Fallback Retries, Live Model Statistical Verdict, Live Tool Trigger Gate Aggregate Floors, Prompt Addition Recall Regression Principle, Ship Red on Real Defect Policy, Verdict Thresholds Shared Registry and Predicate, Live Model Benchmark Gate (npm run test:live) (+6 more)

### Community 66 - "Statistical Scoring Logic"
Cohesion: 0.16
Nodes (10): Statistical Gate Pure Scorer Data Mutation Pin, fixturePath, header, rememberFixturePath, temporaryDirectories, testCase, CaseSetRun, CaseObservations (+2 more)

### Community 67 - "Prompt and Recall Logic"
Cohesion: 0.25
Nodes (7): Group Conversation Roster Rejection, Phase 11 Tool Suite Trimming and Prompt Diet, Prompt Layer Recency Precedence, Recall User Proactive Trigger Current Message Scoping, Roka Voice and Kaomoji Guidelines, Speech Quota Roleplay Scoping, Unconditional Prompt Assembly Architecture

### Community 68 - "Tone and Expression Logic"
Cohesion: 0.20
Nodes (10): Tone Expression Variety and Detector Rebalance, Discord Components V2 Reply, Rule-Based Tone Detection, Tone Expression and Accent Mapping, RawComponent, EXPRESSION_URLS, getExpressionUrl(), lastExpressionByTone (+2 more)

### Community 69 - "Project Metadata"
Cohesion: 0.18
Nodes (10): description, engines, node, lint-staged, *.{json,md,yml,yaml}, *.{ts,js}, main, name (+2 more)

### Community 70 - "Model Comparison Testing"
Cohesion: 0.22
Nodes (9): CapturingErrorPlugin, classify(), ITERATIONS, main(), MODELS, PROBES, runOne(), RunOutcome (+1 more)

### Community 71 - "Extraction Filtering Logic"
Cohesion: 0.22
Nodes (11): Artifact-Anchored Test Assertion, Media Byte Prefix Ingestion, Modality-Decoupled Token Cost, Attachment and Budget Tunables, Attachment Token Measure Utility (npm run measure), PDF Token Cost Measurement, Attachment Token Admission Control, measure (+3 more)

### Community 72 - "Payload Rendering Logic"
Cohesion: 0.38
Nodes (11): getToneStyle(), asObject(), asObjects(), chunkLabel(), componentDetails(), isComponentsV2Payload(), PayloadObject, renderEmbeds() (+3 more)

### Community 73 - "View Statistics Testing"
Cohesion: 0.16
Nodes (16): /stats Redesign Specifications, handleStatsCommand(), isStatsView(), logStatsError(), selectionFor(), sendStatsError(), charts, contentFor() (+8 more)

### Community 74 - "Sprite Optimization Pipeline"
Cohesion: 0.17
Nodes (11): discord Configuration Section, discord.maxInFlightAttachmentBytes (33554432), discord.maxMessageLength (1500), emoji Configuration Section, emoji.cooldownMs (180000ms), emoji.probability (0.33), logging.level (info), statusCycleMs (900000ms) (+3 more)

### Community 75 - "ADK Smoke Testing"
Cohesion: 0.25
Nodes (9): Four-Layer Prompt Assembly, ErrorRecoveryPlugin, main(), results, runQuery(), test(), TestResult, wordCount() (+1 more)

### Community 76 - "Weather Lookup Tool"
Cohesion: 0.20
Nodes (9): Deliberately Not Done, Design, Jev Integration, Measured From The Pi, Rollout, Second Opinion, What Jev Is, Where Rokabot Decides Today (+1 more)

### Community 77 - "Anime Search Logic"
Cohesion: 0.24
Nodes (8): Jikan Unofficial MyAnimeList API, jikanThrottle(), AnimeResult, JikanAnimeEntry, JikanResponse, searchAnime(), SearchAnimeParams, SearchAnimeResult

### Community 78 - "Error Handling Logic"
Cohesion: 0.22
Nodes (9): CI Dummy Secrets, Configuration & Numeric Bounds, Attachment TPM RPM Divergence, NUMERIC_BOUNDS Single Registry, Surgical Mutation Probe Discipline, Turn Deadline Default Raised to 63000ms, .env Secrets Configuration, NUMERIC_BOUNDS (+1 more)

### Community 79 - "Buddy Collection UI"
Cohesion: 0.38
Nodes (8): buddy and gacha_daily Tables, buildCollectionPage(), buildPaginatedCollectionPage(), getCollectionPageCount(), handleBuddyCollection(), { getBuddyCollection }, BuddyData, getBuddyCollection()

### Community 80 - "Message Handling Tests"
Cohesion: 0.24
Nodes (8): createMessage(), createRateLimiter(), handle(), metrics, mocks, mutableJevConfig, mutableMemoryConfig, snapshot()

### Community 81 - "Test Trial Recording"
Cohesion: 0.39
Nodes (6): Environment-Independent Test Derivation, getLocalHour(), emitTrialRecord(), formatTrialRecord(), TrialRecord, record

### Community 82 - "Citation Budgeting Logic"
Cohesion: 0.39
Nodes (6): Search Citation Pipeline Migration, toolCallsForRequest, clampToBudget(), fitCitations(), sourceHost(), THREE

### Community 83 - "Core Message Pipeline"
Cohesion: 0.25
Nodes (8): Message Processing Pipeline, Gemini API and Google ADK, ADK Error Delivery Constraint, Gemini Failure Taxonomy, Gemini Safety Settings Contract, Session Corrupt Recovery Mechanism, Steered Safety Regeneration, rokaAgent

### Community 84 - "Memory Safety Logic"
Cohesion: 0.46
Nodes (6): Bounded Memory Retrieval Contract, buildFactsEnvelope(), buildOverheardBlock(), isSafeFactScalar(), normalizeOverheardText(), renderOverheardBlock()

### Community 85 - "ADK Inline Data Testing"
Cohesion: 0.25
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 86 - "Tool Trigger Testing"
Cohesion: 0.29
Nodes (6): cases, header, ok(), turn(), CaseSetHeader, ToolTriggerCase

### Community 87 - "Quota Diagnostic Logic"
Cohesion: 0.43
Nodes (5): describeQuotaFailure(), diagnoseKey(), errorText(), SPENT_KEY_429, THROTTLED_429

### Community 89 - "memoryQuote"
Cohesion: 0.40
Nodes (5): Memory Privacy and Guild Isolation, Memory Recall Freshest-First Bounded Retrieval, /stats Memory Quote Top-Salience Privacy Amendment, memoryQuote(), predicatePhrase()

### Community 90 - "Game Configuration"
Cohesion: 0.12
Nodes (24): games Configuration Section, games.hangmanLives (6), games.hangmanTimeoutMs (120000ms), games.shinyChance (0.01), games.shiritoriTimeoutMs (120000ms), Game Countdown Timers Configuration, SQLite-Backed Games Suite, activeGames (+16 more)

### Community 92 - "User Recall Logic"
Cohesion: 0.67
Nodes (3): Achievable Retry Attempt Count Derivation, Gemini Tunables (config.yml), deriveAchievableRetries()

### Community 93 - "Chat Input Testing"
Cohesion: 0.67
Nodes (3): handleInput(), main(), username

### Community 94 - "Scripted LLM Interface"
Cohesion: 0.13
Nodes (13): Claims-Based Memory Pipeline, Pinned Claims Exemption, Tenant Memory Isolation, user_memory Table Operations, Claims Memory System, session_history SQLite Table, REMEMBER_TURN, ScriptedLlm (+5 more)

### Community 95 - "Benchmark Pacing Config"
Cohesion: 0.40
Nodes (5): Harness Timeout Pacing Derivation, Harness Trial Pacing Guard, Live Benchmark RPM Pacing Headroom, TRIAL_PACING_MS, TRIAL_PACING_MS

### Community 96 - "Attachment Error Messaging"
Cohesion: 0.67
Nodes (3): In-Character Attachment Failure Notices, OVERSIZED_ATTACHMENT_MESSAGES, UNSUPPORTED_ATTACHMENT_MESSAGES

### Community 97 - "Timezone Testing"
Cohesion: 0.35
Nodes (8): In-Conversation Tool Rituals, cancelReminder(), listReminders(), setReminder(), loadGetLocalHour(), unpinnedHour(), formatTime(), getTimezoneLabel()

### Community 98 - "Channel Mocking"
Cohesion: 0.17
Nodes (3): FakeChannel, FakeMessage, HarnessCollection

## Knowledge Gaps
- **444 isolated node(s):** `$schema`, `enabled`, `indentStyle`, `indentWidth`, `lineWidth` (+439 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Memory Claim Management` to `Reminder and Session Config`, `Memory Isolation and Safety`, `Memory Extraction Configuration`, `Memory Statistics Visualization`, `Gacha Buddy System`, `SQLite Data Access`, `Response Generation Testing`, `Metrics and Diagnostics`, `Hangman Game Logic`, `Statistics Query Logic`, `Database Administration`, `Logging and Tooling`, `Memory Extraction Privacy`, `Gacha Interaction Logic`, `Evaluation Harness Utilities`, `Memory Retrieval Logic`, `Background Task Scheduling`, `Game Command Handling`, `Privacy and Isolation`, `Project Guidelines and Constraints`, `Memory Predicate Logic`, `Obsidian Export Logic`, `Benchmark Pacing Logic`, `Live Model Benchmarking`, `Buddy Collection UI`, `Scripted LLM Interface`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **Why does `config` connect `Token Budget Management` to `Reminder and Session Config`, `Memory Isolation and Safety`, `Memory Extraction Configuration`, `Session and Prompt Management`, `Message Handling Logic`, `Memory Claim Management`, `Gacha Buddy System`, `SQLite Data Access`, `Response Generation Testing`, `Retry and Safety Logic`, `Utility Tool Functions`, `Configuration and Tuning`, `Hangman Game Logic`, `Memory Extraction Privacy`, `Discord Command Registration`, `Evaluation Harness Utilities`, `Bot Technology Stack`, `Anime Lookup Tools`, `Slash Command UI`, `Memory Retrieval Logic`, `Background Task Scheduling`, `Memory Budgeting`, `Mock Object Factories`, `Gemini Configuration`, `Memory Predicate Logic`, `Turn Reliability Logic`, `Obsidian Export Logic`, `Benchmark Pacing Logic`, `Interaction Metrics Testing`, `Multimodal Intake Policy`, `Live Model Benchmarking`, `Model Comparison Testing`, `Extraction Filtering Logic`, `ADK Smoke Testing`, `Message Handling Tests`, `Core Message Pipeline`, `Quota Diagnostic Logic`, `Game Configuration`, `User Recall Logic`, `Scripted LLM Interface`, `Timezone Testing`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `Core NPM Commands & Verification` connect `CI/CD Pipeline Gates` to `TypeScript Configuration`, `Project Guidelines and Constraints`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `config` (e.g. with `Gemini Model Selection` and `Phase 20 Turn Deadline Admission Control`) actually correct?**
  _`config` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `createMessageHandler()` (e.g. with `Discord Gateway Layer` and `message()`) actually correct?**
  _`createMessageHandler()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `enabled`, `indentStyle` to the rest of the system?**
  _444 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Reminder and Session Config` be split into smaller, more focused modules?**
  _Cohesion score 0.11746031746031746 - nodes in this community are weakly interconnected._