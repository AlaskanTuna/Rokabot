# Graph Report - .  (2026-09-24)

## Corpus Check
- 40 files · ~217,722 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1971 nodes · 4680 edges · 135 communities (108 shown, 27 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 340 edges (avg confidence: 0.83)
- Token cost: 428,287 input · 0 output

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
- Turn Budgeting Logic
- Utility Tools
- Stats Views Tests
- Message Handling Tests
- Statistical Scoring Logic
- Project Docs Index
- Memory Predicate Logic
- Live Tool-Trigger Gate
- Gemini Failure Handling
- ADK Smoke Testing
- Weather Tool
- Anime Search Logic
- Who-Is-Who and Recall Trigger
- Prompt Length and Voice
- Streaming Media Prefix Policy
- ADK Inline Data Testing
- Scripted LLM Interface
- Tool Trigger Testing
- Gemini Safety Settings
- Live Verdict Thresholds
- README Architecture and Tones
- Claims Memory Tables
- Memory Safety Logic
- Current Time Tool
- Interaction Mocking
- Rate Limiting Tests
- Capture Sink Utilities
- Codex Worker Lessons
- Chat Input Testing
- Commit Conventions
- Rebase Check Corrections
- Character and Source Work
- Fake Channel
- Fake Message
- Harness Collection
- Unit Testing Mocks
- Project Guidelines and Constraints
- Git Commit Convention
- Karpathy Coding Guidelines
- AGENTS.md Guideline Scope
- Biome and Prettier Split
- Chart Font Baking
- Codex Brief Pre-Declines
- Docs Restructure
- Documented Constraint Enforcement
- Docs TitleCase Convention
- PR Check Polling
- AGENTS.md Data Models
- Statistical Gate Mutation Pin
- Mutation Probe Limits
- PM and Peer Sessions
- PM Workflow Visibility
- README Scope Rule
- Request Composition Review
- RTK Lint Masking
- Security Fix Regression Test

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 151 edges
2. `config` - 63 edges
3. `generateResponse()` - 39 edges
4. `createInteractionHandler()` - 38 edges
5. `logger` - 38 edges
6. `main()` - 33 edges
7. `main()` - 28 edges
8. `runTranscript()` - 27 edges
9. `closeDb()` - 26 edges
10. `createGameCommandHandler()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `Command Architecture: Utilities as Implicit ADK Tools, Folklore-Label Footer Disclosure` --references--> `buildCommandBody()`  [INFERRED]
  docs/decisions.md → src/discord/commands/index.ts
- `#58: turnDeadlineMs Raised 60000->63000 Rather Than Lowering Measured Timeout` --references--> `NUMERIC_BOUNDS`  [INFERRED]
  docs/decisions.md → src/config.ts
- `gemini Config Section` --shares_data_with--> `measureAttachmentTokens()`  [INFERRED]
  config.yml → src/agent/attachmentCost.ts
- `Attachment Types and Their Ceilings` --implements--> `GEMINI_SPELLINGS`  [INFERRED]
  docs/trd.md → src/agent/attachmentLimits.ts
- `Gemini Function-Call-Ordering 400 Recovered via Destroy+Rehydrate+Retry (session_corrupt)` --rationale_for--> `classifyGeminiFailure()`  [INFERRED]
  docs/decisions.md → src/agent/geminiReliability.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Gemini Reliability & Failure Handling** — docs_trd_failure_taxonomy, docs_trd_fallback_model, docs_trd_adk_error_delivery, docs_trd_rpm_budget_accounting, docs_trd_concurrency_lifecycle_retry [INFERRED 0.80]
- **Jev Shadow-Mode Judgment Integration** — docs_trd_jev_judgments, docs_trd_jev_turn_judgment, docs_trd_jev_memory_admission, src_agent_jev_client, docs_research_jev_integration_jev, docs_research_jev_integration_design [INFERRED 0.85]
- **Rate-Limit and Token-Budget Guard Mechanisms** — src_agent_tokenbudget, src_discord_bytebudget, docs_trd_rpm_budget_accounting, docs_trd_turn_reserves_calls, docs_trd_two_limiters_diff, docs_trd_per_minute_token_budget [INFERRED 0.80]
- **CodeRabbit Detection-Method Saga (Status Check, Reviews Array, File-List Grep, Verdict Phrase)** — docs_decisions_coderabbit_ratelimited_pass_ambiguity, docs_decisions_coderabbit_bot_login_name, docs_decisions_coderabbit_detection_v2_wrong, docs_decisions_coderabbit_detection_v3_verdict_phrase, docs_decisions_coderabbit_permanent_absence_finding [EXTRACTED 0.95]
- **Family of 'Check That Could Not Fail' Lessons Across the Session** — docs_decisions_bad_check_taxonomy, docs_decisions_wiring_not_logic_probe_lesson, docs_decisions_silent_noop_edit_lesson_173, docs_decisions_environment_incidental_test_defect_162_163, docs_decisions_reservation_hold_assertion_gap_167, docs_decisions_config_drift_guard_complementary_160 [INFERRED 0.85]
- **Media Attachment Token-Cost Investigation (#121/#131/#133/#135/#136/#144/#153/#165/#176)** — docs_decisions_image_token_flat_cost_121, docs_decisions_attachment_history_stripping_131_133, docs_decisions_media_token_cost_model_136, docs_decisions_byte_prefix_media_truncation_135, docs_decisions_rpm_tpm_mismatch_144, docs_decisions_video_token_specimen_bias_153_165, docs_decisions_counttokens_billing_bias_finding_153_165_176 [EXTRACTED 0.95]
- **Jev Judgment Shadow-Mode System** — config_jev, docs_runbook_jev_shadow_mode, docs_readme_getting_started [EXTRACTED 0.85]
- **Deploy-to-Pi CI/CD Pipeline** — _github_workflows_deploy_workflow, _github_workflows_deploy_test_job, _github_workflows_deploy_deploy_job, agents_working_conventions [EXTRACTED 0.90]
- **ModelScope Qwen Fallback Feature** — config_fallback, docs_readme_modelscope_fallback, docs_runbook_fallback_model [EXTRACTED 0.90]
- **Multimodal Attachment Safety Pipeline** — docs_research_multimodal_global_byte_budget, docs_research_multimodal_streaming_size_guard, docs_research_multimodal_attachment_strip_history, docs_research_multimodal_tpm_ceiling_measurement, src_discord_bytebudget [INFERRED 0.95]
- **Rate and Token Budgeting Architecture** — docs_prd_fr_6_rate_limiting, docs_research_multimodal_tpm_ceiling_measurement, src_utils_ratelimiter_ratelimiter, src_agent_tokenbudget [INFERRED 0.95]
- **Conversational Turn Lifecycle** — docs_prd_user_workflow_overview, docs_prd_fr_3_per_channel_conversational_memory, docs_prd_fr_4_layered_personality_prompts, docs_prd_fr_5_tone_detection, src_agent_roka_rokaagent [INFERRED 0.85]

## Communities (135 total, 27 thin omitted)

### Community 0 - "Gacha Buddy System"
Cohesion: 0.10
Nodes (45): Buddy/Games Table Rebuild via Schema-Driven PRAGMA table_info Copy, Gacha Hatch Gate: Rolling 24h via last_hatch_at, Not Calendar-Day, SQLite Database Reference, handleGachaMention(), statBar(), formatBuddySummary(), formatHatchTimeRemaining(), handleBuddyStats() (+37 more)

### Community 1 - "Jev and Live Benchmark Setup"
Cohesion: 0.07
Nodes (40): jev Config Section, Correction: Harness and Production Bot Do Not Share a Quota (Different Google Projects), #94 (Blocked): Harness Project's Daily Gemini Quota Exhausted Mid-Adoption, PR #105 Left as Draft, #196: Jev (TypeSafe, jev-1.13.0) Takes Pick-From-List Decisions Only (Tone/Referent/Memory), Shadow Mode, Fail-Open, Live Benchmark Pacing Set by RPM With Headroom (12s/2-Call Turn = 10 RPM Against 15 Cap), vitest.live.config.ts testTimeout Now Derives From Pacing Instead of Hardcoded 900s; A Timeout Aborting Before a Verdict Reports Nothing, test:live Gate Added: Three Non-Overlapping Gates (Correctness, Perf, Live-Model), TRIAL_PACING_MS Raise-Only, 12000ms Human-Set Floor Enforced in Code, Zero 429s at 30s Pacing (+32 more)

### Community 2 - "Retry Loop Design History"
Cohesion: 0.06
Nodes (40): #58 CodeRabbit: Aggregate Backoff Cap Fix Goes Silent at R>=5, Deferred to #60, #79: attemptTimedOut Flag Distinguishes Per-Attempt Timeout From Shutdown/Deadline Abort, #79: Backoff Sleep Swaps in Fresh AbortController So Timeout Doesn't Cancel Its Own Retry Delay, #60: Guard Tied to Real runTurnWithReliability Loop by a Test Sweeping maxRetries 0-6, Phase 10: Hybrid Dev Harness (Local Discord Sim + Fake-LLM Seam), Phase 19: Safety Blocks Get One Steered Regeneration Before Static Deflection, Phase 20: Turn Deadline via Admission Control, Attempt 0 Never Gated, Phase 28 Shipped Outside PM Pipeline, Six Decisions Reconstructed Later From Squash Commit (+32 more)

### Community 3 - "Slash Command UI"
Cohesion: 0.07
Nodes (32): #19 (PR #92): /chat and /search Retired, Replaced by Single /ask; No Zero-Gemini Factual Path Remains, Regression Tests for Pattern-Matching Fixes Must Be Pinned by Mutation, Not Green Suite, Testing Convention: An Assertion a Mutation Probe Targets Must Sit in Its Own it Block, Phase 17 (Layout B + guild_id Migration) Declined as Unnecessary, #92: Merge Required Explicit Human Authorization, Retiring Commands Is User-Visible Breaking Change, #29: Installation/Context Policy Recorded by Pointer Only; registration.test.ts Is Authoritative, Slash Command Registration: Optional Dev-Guild Route for Instant Propagation, #92: Command-Set Change Verified Against GET /applications/{id}/commands, Never the Deploy Log (+24 more)

### Community 4 - "Code Formatting Configuration"
Cohesion: 0.05
Nodes (40): useLiteralKeys, files, ignore, formatter, enabled, indentStyle, indentWidth, lineWidth (+32 more)

### Community 5 - "Memory Statistics Visualization"
Cohesion: 0.11
Nodes (39): chatsSince(), distinctRememberedUsers(), memoryGrowthSeries(), mostUsedTool(), newClaimsThisMonth(), tokenTotals, topChannels(), topPredicates() (+31 more)

### Community 6 - "Discord Output and Sprite Decisions"
Cohesion: 0.09
Nodes (30): discord Config Section, Buddy Sprite Hosting: Hardcoded CDN URLs, Regenerated Local PNGs Source of Truth, Buddy Sprite Hosting Migrated Catbox to Postimages After Outage, Testing Convention: A Budget Invariant Needs a Swept Input, Not a Sampled One (#92 Citation Row Boundary), Command Architecture: Utilities as Implicit ADK Tools, Folklore-Label Footer Disclosure, #63: discord.maxMessageLength Ceiling Derived as 4000 - MAX_TOOL_FOOTER_CHARS, #56: Discord Ceiling Is Components V2 TextDisplay Budget (4000), Not content's 2000, #76: docs/prd.md Reply-Split Criterion Now Names Enforcement Point, Not a Number (4th Correction) (+22 more)

### Community 7 - "Memory Claim Management"
Cohesion: 0.13
Nodes (33): Claims Tenancy Model, activateClaim(), appendEvidence(), appendEvidenceInTransaction(), assertClaimInTransaction(), assertSafeValue(), assertWritableGuild(), ClaimAssert (+25 more)

### Community 8 - "Game Configuration"
Cohesion: 0.11
Nodes (33): Game Timeout Displays Derive From Configured Timeout, Not Hardcoded, assert(), fail(), main(), makeMessage(), pass(), results, TestResult (+25 more)

### Community 9 - "Memory Extraction Configuration"
Cohesion: 0.11
Nodes (30): completeJob(), dailyBudget(), drainOnce(), enqueueAndSchedule(), ExtractionLimiter, hasExtractionHeadroom(), lastRunAt, localDate() (+22 more)

### Community 10 - "Bot Startup and Shutdown"
Cohesion: 0.09
Nodes (26): restoreMonitoredChannels(), assertClaim(), destroyAllSessions(), stopReminderScheduler(), stopStatusCycler(), client, healthServer, shutdown() (+18 more)

### Community 11 - "Statistics Query Logic"
Cohesion: 0.08
Nodes (32): activeClaimCount(), activityByDay(), busiestChannel, ChannelCount, CountByDay, CountByHour, CountByOutcome, CountByPredicate (+24 more)

### Community 12 - "Discord Test Doubles"
Cohesion: 0.06
Nodes (27): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+19 more)

### Community 13 - "Reply Splitting and Concurrency"
Cohesion: 0.15
Nodes (24): Backtick Escaping Moved From Prompt Into Send Path (responses.ts); Kaomoji Backtick Paired With Later Backtick Broke Markdown, #76: splitResponse Has No Sentence-Boundary Logic; Last-Newline/Last-Space/Hard-Cut Fallback Chain, #19 Follow-Up (PR #95): splitResponse Hard-Cut Steps Back Off Trailing High Surrogate to Avoid Splitting Emoji, Testing Convention: A Sweep Is Only as Good as the Shapes Swept Over (ASCII-Only Sweep Missed Emoji Bug), Concurrency Binding Constraint, activeRequests, isChannelBusy(), markBusy() (+16 more)

### Community 14 - "Memory Privacy and Tenancy"
Cohesion: 0.12
Nodes (24): #29/181: Every Non-Guild Channel Gets Its Own Memory Tenant dm:${channelId}, #70: findUserByName Non-Global Branch Filters by Tenant Across Three Evidence Sources, #70: Filtering vs Preferring Trade-Off Resolves in Favour of Filtering; factCount:0 Either Way, #71 (Parked): 518 Claims/707 Evidence Rows, Zero dm:-Prefixed Tenants Exist, Growth Curve Hasn't Started, Memory Privacy: Predicate Categories May Surface Publicly, Fact Values Never; Guild Isolation Absolute, #29/181: Memory Tools Fail Closed on Absent-or-'global' Tenant State, Structured WARN Log, Prompt-Injection Defense: Structural Inertness Primary, Scalar Validation Defense-in-Depth, saveFact Chokepoint, Privacy Amendment: /stats Memory Quote Surfaces Top-Salience Claim Value In-Guild (+16 more)

### Community 15 - "Web Search Decisions"
Cohesion: 0.10
Nodes (20): #90 (Won't Fix): Rokabot Deployed to NSFW Servers, No exclude_domains List, #19: Do Not Migrate Search Providers; Defect Was Ours (Geo-Poisoning Query Suffix + include_answer:'basic'), #19: include_answer:'basic' Could Leak Hallucinated Self-Identity Into Answer Body, #19: Tavily Credits Priced on search_depth Alone; include_answer Not a Credit Modifier at Any Value, #19: Neither Knob Addresses Recency; days/time_range Measured Net Negative Across 5 News Queries, #19: search_depth Governs Sources, include_answer Governs Synthesis; Neither Substitutes the Other, #19: Tavily GET /usage Counter Lags/Batches, Unusable as Real-Time Spend Meter, Where Rokabot Decides Today (+12 more)

### Community 16 - "Metrics and Diagnostics"
Cohesion: 0.12
Nodes (25): metrics Config Section, #82: failure_diagnostics Table Separate From response_events, Shorter Retention, Records block_side, #59: failure_marker May Persist HTTP Status From Closed Allowlist (400/401/403/429/500/503/504), response_events.failure_marker Persists Only Raw errorCode/finishReason, Never errorMessage, Phase 12: SQLite Metrics Tables (response_events/extraction_events), Never-Throw Writers, tools_used Recorded on response_events as JSON-Array of Tool Names Only, Privacy, Failure Diagnostics Table (+17 more)

### Community 17 - "Gemini Fallback Routing"
Cohesion: 0.09
Nodes (14): Gemini Model Choice: gemini-3.5-flash-lite (GA, Free-Tier Verified), Gemini-Overload Fallback: ModelScope Qwen3.5-122B-A10B (Thinking Off), GonkaRouter Excluded, 12/12 Smoke Test, Deliberately Not Done, Gemini-Outage Fallback (Qwen3.5), The Fallback Model, createRokaModel(), modelRouteForRequest, ModelScopeLlm (+6 more)

### Community 18 - "Hangman Game Logic"
Cohesion: 0.17
Nodes (23): games Config Section, #29: Games Stay Guild-Only Because Timeout-Completion Path Needs Channel Access, Not the Data Reason Assumed, buildHangmanBody(), handleHangmanGuess(), handleHangmanStart(), HANGMAN_COLORS, saveHangmanScore(), activeGames (+15 more)

### Community 19 - "Memory Extraction Test Script"
Cohesion: 0.17
Nodes (21): assert(), fail(), main(), pass(), results, TestResult, cleanupExpired(), getMonitoredCount() (+13 more)

### Community 20 - "Development Tooling"
Cohesion: 0.08
Nodes (25): @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, husky, lint-staged, devDependencies, @biomejs/biome, @commitlint/cli (+17 more)

### Community 21 - "Session Attachment Management"
Cohesion: 0.10
Nodes (14): #131/#133: Attachment Bytes Stripped From Session History After the Turn; Cross-Turn Image Recall Removed, Historical Stats Backfill Declined; History Accrues From 2026-07-22, Probe the Wiring Not the Logic: Five Guards Were Green and Guarding Nothing (#129/#130/#133/#134), Attachment History Stripping, Attachment Bytes Do Not Live in History, attachmentMarker(), ensureSession(), runner (+6 more)

### Community 22 - "Live Gate and Quota Diagnostics"
Cohesion: 0.11
Nodes (21): #92: Citation Renderer Built for /search Migrated to Serve /ask and Mention Reply Paths, Live Benchmark Aborts on Any Turn Not outcome==='ok', Never Scores It, Live-Eval Fixtures Must Not Collide With Seeded World (FTS Term Matching), #132/#141/#145: Live Gate Now Distinguishes Deflection (Abort) From Transient Fallback (Bounded Retry on Fresh Channel), #19: Tool-Trigger Gate Never Exercised a Real Search Result Reaching a Reply; Verified via withSearchCitations Direct Run, sessionService, toolCallsForRequest, describeQuotaFailure() (+13 more)

### Community 23 - "SQLite Data Access"
Cohesion: 0.14
Nodes (20): addUser(), claim(), getAllUserNames(), upsertUserName(), UserName, asClaim(), asScenario(), evaluateMemoryShadow() (+12 more)

### Community 24 - "Response Generation Testing"
Cohesion: 0.16
Nodes (18): #72: ADK Contract Test Builds Own Runner/LlmAgent/InMemorySessionService, Leaves Harness Seam Untouched, #29/181: __setTestRunTurnFactory Consumed Above generateResponse's Call Into runner.runAsync, destroySession(), generateResponse(), resetIdleTimer(), __setTestRunTurnFactory(), TestRunTurn, droppedFor() (+10 more)

### Community 25 - "Claim Retrieval Ranking"
Cohesion: 0.17
Nodes (21): #25: recall_user No Longer Re-Sorts by lastSeenAt; pinned/salience/last_seen/id Ordering Survives to Cap, Memory Recall: Freshest-First, Bounded 15 Facts, Legacy Tail, ClaimSource, ClaimRow, compareRetrieved(), getActiveClaims(), mapClaim(), RetrievalResult (+13 more)

### Community 26 - "Transcript Processing"
Cohesion: 0.16
Nodes (22): fixturePath(), loadTranscript(), main(), parseTranscriptLine(), renderTokenTable(), requestMessageContent(), runTranscript(), RunTranscriptOptions (+14 more)

### Community 27 - "Bot Technology Stack"
Cohesion: 0.09
Nodes (23): better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml, @napi-rs/canvas, dependencies (+15 more)

### Community 28 - "CodeRabbit Gate History"
Cohesion: 0.09
Nodes (23): Biome noDelete Autofix Rewrites delete process.env.X to = undefined, Defeating the !apiKey Guard, Piping biome check . Through tail Hides Real Failures; Check Exit Code Never Tail Alone, CodeRabbit's GitHub Login Is coderabbitai[bot], Not coderabbitai, Correction: CodeRabbit Review-Detection Method (pulls/reviews Body Check) Fails Toward 'Unreviewed' on Every Clean Review, Second Correction: Working CodeRabbit Detector Uses Verdict-Phrase Grep, Not Status Check, Reviews Array, or File-List Grep, CodeRabbit Gate: Required Check via Ruleset 19584734, No Bypass Actors, CodeRabbit Gate Unwind Path: Delete Ruleset First, Then Uninstall App, CodeRabbit's Status Check Reports SUCCESS Without Having Reviewed Anything on Low-Star Repos (+15 more)

### Community 29 - "Rate Limiting Logic"
Cohesion: 0.16
Nodes (12): #168 vs #167: A Doc Correction Written for the World as It Is, Mid-Change, Is a Defect With a Delay on It, #167: Suite Complete About Steady State, Blind to the Transient (Reservation Held DURING a Turn), the Whole Feature, FR-6: Rate Limiting, RateLimiterConfig, RPM-Budget Accounting, A Turn Reserves the Calls It May Make, The Two Limiters Bound Their Windows Differently, modelCallsForRequest (+4 more)

### Community 30 - "Token Usage Estimation"
Cohesion: 0.22
Nodes (16): MAX_SYSTEM_PROMPT_TOKENS=5000 Is a Catastrophe Rail, Not a Latency Constraint, PR #67: docs/trd.md ToneKey Table Pinned by Test Against Object.keys(TONE_PROMPTS), FR-4: Layered Personality Prompts, Prompt System, AssemblerInput, assembleSystemPrompt(), buildContextPrompt(), TONE_PROMPTS (+8 more)

### Community 31 - "TypeScript Build Config"
Cohesion: 0.09
Nodes (22): ES2022, **/*.test.ts, compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib (+14 more)

### Community 32 - "Game Command Handling"
Cohesion: 0.24
Nodes (18): createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleBuddyLeaderboard(), handleHangmanGuide(), handleLeaderboard(), buildGameContainer(), buildTimeoutContainer() (+10 more)

### Community 33 - "Channel Session Window"
Cohesion: 0.21
Nodes (15): FR-3: Per-Channel Conversational Memory, ChannelSession, WindowMessage, clearMessages(), pushMessage(), addMessage(), destroyAllSessions(), destroySession() (+7 more)

### Community 34 - "CI/CD Pipeline Gates"
Cohesion: 0.09
Nodes (22): scripts, build, dev, dev:quiet, export:vault, format, format:check, harness (+14 more)

### Community 35 - "Mock Object Factories"
Cohesion: 0.26
Nodes (15): mocks, createToolCommandHandler(), TOOL_COMMAND_NAMES, handleAnime(), handleRemind(), handleRemindAt(), handleRemindIn(), handleRemindList() (+7 more)

### Community 36 - "Legacy Fact Extractor"
Cohesion: 0.18
Nodes (15): ExtractedFact, generateExtraction(), getClient(), maybeExtractFromBuffer(), messageCounts, parseFacts(), resetCounters(), runBufferExtraction() (+7 more)

### Community 37 - "Config Loading and Claims Rollout"
Cohesion: 0.15
Nodes (11): Configuration (AGENTS.md), Tech Stack (AGENTS.md), Phase 14: Claims Memory Backend Behind config.memory.claimsBackend, Dual-Write Warming, Task 91: Claims Backend Promoted Default-On Globally, No Per-Guild Canary, config, requiredEnv(), yaml, YamlConfig (+3 more)

### Community 38 - "Claim Extraction Pipeline"
Cohesion: 0.16
Nodes (17): #118: Memory Split by Consent, Not Topic; Told -> Explicit Claim, Inferred -> Passive Claim, AppliedChange, applyOps(), ExtractionJob, ExtractionMessage, ExtractionOp, generateExtraction(), getClient() (+9 more)

### Community 39 - "Phase 8 Test Script"
Cohesion: 0.19
Nodes (14): assert(), fail(), main(), pass(), results, TestResult, getTopBuddies(), ChannelUser (+6 more)

### Community 40 - "Anime Lookup Tools"
Cohesion: 0.21
Nodes (19): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleParams, GetAnimeScheduleResult, getCurrentSeason() (+11 more)

### Community 41 - "Discord Fake Builders"
Cohesion: 0.15
Nodes (19): payload(), FakeComponent, has(), makeAttachments(), makeChannel(), makeClient(), makeComponent(), makeGuild() (+11 more)

### Community 42 - "ModelScope Fallback Adapter"
Cohesion: 0.16
Nodes (17): fallback Config Section, ModelScope Qwen Fallback, Tech Stack (README), attachmentKind(), attachmentMarker(), ChatMessage, GeneratedCall, isRecord() (+9 more)

### Community 43 - "In-Flight Attachment Byte Budget"
Cohesion: 0.19
Nodes (9): Global In-Flight Byte Budget, Global In-Flight Attachment Budget, inFlightBytes(), release(), reservationFor(), tryReserve(), client, createInteraction() (+1 more)

### Community 44 - "Guild Permissions and Message Intake"
Cohesion: 0.18
Nodes (17): #75: Guild Permission Set Documented as Derivation (Operation to Permission), No Line Numbers, #75: Reminders Need Guild Send Messages; Channel-First Delivery, DM Only as Fallback, Discord Install Requirements: bot Scope Is Load-Bearing, Guild Permissions Are Derived From the API Surface, There Is No Build-Time Pin, and That Is Deliberate, ImageAttachment, createMessageHandler(), describeEmbed() (+9 more)

### Community 45 - "Media Validation Policies"
Cohesion: 0.21
Nodes (15): attachment_url, ALLOWED_IMAGE_TYPES Consolidation, PDF Intake Recommendation, ALLOWED_DOCUMENT_TYPES, ALLOWED_IMAGE_TYPES, ALLOWED_MEDIA_TYPES, isPrivateAddress(), isSupportedDocument() (+7 more)

### Community 46 - "Gemini Error Handling"
Cohesion: 0.17
Nodes (15): classifyGeminiFailure: HTTP Status Matched Digit-Anchored, Demoted Below Symbolic Markers, Gemini Function-Call-Ordering 400 Recovered via Destroy+Rehydrate+Retry (session_corrupt), retryBackoffCapMs Deliberately Serves as Both Cumulative Ceiling and Per-Attempt maxMs, #58: Transient-Status Classification Adds 504 Only, Others Unfiled Until Observed, A Spent Day Is Not a Spent Minute, BackoffOptions, classifyGeminiFailure(), classifyMarker() (+7 more)

### Community 47 - "Tool Trigger Fixtures"
Cohesion: 0.20
Nodes (16): stateAfterCase(), writeFixture(), asCase(), asClaim(), asHeader(), asHistoryLine(), asMember(), asSessionState() (+8 more)

### Community 48 - "Memory Predicates and Privacy"
Cohesion: 0.19
Nodes (14): #25 (Unactioned): baseSalience Hardcoded 0.5 for Every Predicate, Importance Not Modelled, #118 Follow-Up: privacyGuard.ts Blocks Contact Details/Money/Government IDs/Credentials on Key-or-Value Signal, cardinalityOf(), isKnownPredicate(), normalizePredicate(), predicate(), PredicateCardinality, predicateCategory (+6 more)

### Community 49 - "Chart Rendering Logic"
Cohesion: 0.28
Nodes (13): /stats Redesign: Fixed 30D Window, TW-Style Skeleton, Rule-Based Mood Label, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+5 more)

### Community 50 - "Core Architecture and Fallback Tests"
Cohesion: 0.12
Nodes (13): Discord Gateway Layer, Roka Agent (ADK), Session Manager, SQLite Persistence Store, __resetModelFallbackForTest(), rokaAgent, TurnOutcome, existingFallbackReplies (+5 more)

### Community 51 - "Extraction Scheduler Tests"
Cohesion: 0.16
Nodes (11): resetForTest(), stopExtractionScheduler(), mocks, __resetTestRunTurnFactory(), memoryConfig, responseEventCount(), transcript, mocks (+3 more)

### Community 52 - "Test TypeScript Config"
Cohesion: 0.13
Nodes (14): node, tests/**/*, ./tsconfig.json, vitest/globals, compilerOptions, noEmit, rootDir, types (+6 more)

### Community 53 - "Benchmark Pacing Logic"
Cohesion: 0.21
Nodes (12): buildNameIndex(), escapeRegex(), isAscii(), MATCH_PRIORITY, MatchKind, NameCandidate, NameIndex, orderedCandidates() (+4 more)

### Community 54 - "Timezone Testing"
Cohesion: 0.24
Nodes (12): cancelReminder(), listReminders(), setReminder(), SetReminderParams, handleRemindCancel(), deleteReminder(), getActiveReminders(), getReminderById() (+4 more)

### Community 55 - "Harness Capture Sink"
Cohesion: 0.16
Nodes (9): CaptureInput, CaptureKind, CaptureRecord, createCaptureSink(), benchmarkTranscript, mocks, responseText(), scriptedResponse() (+1 more)

### Community 56 - "Obsidian Export Logic"
Cohesion: 0.21
Nodes (12): memory Config Section, Browsing Memory in Obsidian, Vault Export, MemoryClaim, ActiveClaimSubject, ExportedClaim, exportVault(), formatClaimGroups() (+4 more)

### Community 57 - "Reminders"
Cohesion: 0.25
Nodes (10): reminders Config Section, #55: Reminder Stale-Threshold Guard Uses <=, Not <, Because No Leading Scheduler Tick, startReminderScheduler(), ActiveReminder, countActiveReminders(), createReminder(), CreateReminderResult, DueReminder (+2 more)

### Community 58 - "LLM Tool Registry"
Cohesion: 0.25
Nodes (13): Phase 11: LLM Tool Suite Trimmed to Used+Wanted Set, Tool Footer, cancelReminderTool, flipCoinTool, getAnimeScheduleTool, getCurrentTimeTool, getWeatherTool, listRemindersTool (+5 more)

### Community 59 - "Multimodal Intake Research"
Cohesion: 0.18
Nodes (13): FR-9: Docker Deployment, Byte Cap as Duration Proxy, Container Memory Cap Correction, Flash-Lite Modality Verification, Inline Data vs Files API Decision, Multimodal Intake Research, PDF Token Cost Measurement, Recommended Attachment Caps (+5 more)

### Community 60 - "Token Budget Management"
Cohesion: 0.32
Nodes (9): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, canAffordAttachments(), chargeTokens(), drain(), lastDrain, remainingTokensThisMinute(), __resetTokenBudgetForTest() (+1 more)

### Community 61 - "Attachment Type Limits"
Cohesion: 0.26
Nodes (12): RFC-3003, Audio Intake Recommendation, Video Low Resolution Recommendation, Attachment Types and Their Ceilings, GEMINI_SPELLINGS, geminiMimeType(), sizeLimitFor(), requestCarriesVideo() (+4 more)

### Community 62 - "Attachment Token Cost Findings"
Cohesion: 0.33
Nodes (11): #135: For Oversized Media, Take a Byte Prefix Rather Than Transcoding or Refusing (MP3 Frame-Based, MP4 moov-Dependent), #153/#165/#176: countTokens Is a Biased Estimator in Both Directions at Once; Video Inflation Pays for Audio Blindness, #121: Image Tokens Are Flat (1089 for Any Square Image 64x64-1024x1024); Upscale to 512 Is Free, #136: Token Cost Decoupled From File Size, Differs by Modality (Image 1089 Flat, Audio 32/s, Video ~91/s, PDF 560/page), #144: The Rate Limiter Counts Requests; Attachments Make Requests Cost Ten Times Differently, RPM Does Not Bind TPM, #165: A Comment Naming a Dependency Is a Claim, Not a Check; Fixed by Asserting MAX_ATTACHMENTS Directly, #153/#165: Independent Reproduction Controls for the Method, Not the Specimen; Black-Frames Clips Gave a False Robust Result, Attachment Token Admission (+3 more)

### Community 63 - "Tone Detection"
Cohesion: 0.24
Nodes (10): #132/#141: Live Gate's Own Prompt Changes Mid-Run via getLocalHour(); Two Prompt-Affecting Variables Step Together at 05:00, Tone Detector Rebalance: Avoid-Immediate-Repeat, Annoyed Narrowed, Curious Priority 3, #64: Tone Precedence Documented First-Match-Wins, Pinned by Test, TONE_PATTERNS Not Reordered, FR-5: Tone Detection, AssemblerInput, ToneKey, getTimeOfDay(), detectTone() (+2 more)

### Community 64 - "Product Requirements"
Cohesion: 0.15
Nodes (13): FR-10: Graceful Shutdown, FR-2: Mention/Reply Interaction, FR-7: Error Handling, FR-8: Response Formatting, Functional Requirements, Problem Statement, Product Requirements Document, Project Objectives (+5 more)

### Community 65 - "Interaction Metrics Testing"
Cohesion: 0.18
Nodes (7): attachmentOptionName(), askWith(), metrics, mocks, client, createInteraction(), mocks

### Community 66 - "CI Deploy Pipeline"
Cohesion: 0.26
Nodes (12): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping), Deployment & Operations (+4 more)

### Community 67 - "Discord Command Registration"
Cohesion: 0.24
Nodes (7): Architecture (AGENTS.md), gemini Config Section, logging Config Section, rateLimit Config Section, session Config Section, Configuration (README), mocks

### Community 68 - "Test Trial Recording"
Cohesion: 0.24
Nodes (10): Two Species of Bad Check: One That Could Not Have Failed, One That Could Fail and Was Aimed Until It Didn't, #162/#163: Merged on 'Checks No Longer Pending' Instead of on the Verdict; main Was Red for a Full Day, #162/#163: A Test That Pins an Incidental of Its Environment (getLocalHour via Intl.DateTimeFormat) Is Testing the Environment, Two Mutation Probes Missed Predicted Counts for Opposite Reasons: Probe Changed Two Things vs Corpus Couldn't Discriminate, Surprise Is Not Evidence of a Fault; Discriminator Is Whether the Healthy Version Explains the Result, getLocalHour(), emitTrialRecord(), formatTrialRecord() (+2 more)

### Community 69 - "Stats Command and Error Handling"
Cohesion: 0.29
Nodes (10): /stats Headers Plain, Mood Label Is a Stat Line; Bot's Own User ID Excluded, IGNORABLE_CODES, isIgnorableDiscordError(), handleStatsCommand(), isStatsView(), logStatsError(), selectionFor(), sendStatsError() (+2 more)

### Community 70 - "Buddy Collection UI"
Cohesion: 0.38
Nodes (8): /gacha collection: Separate Paginated Components-v2 Subcommand, buildCollectionPage(), buildPaginatedCollectionPage(), getCollectionPageCount(), handleBuddyCollection(), { getBuddyCollection }, BuddyData, getBuddyCollection()

### Community 71 - "Project Metadata"
Cohesion: 0.18
Nodes (10): description, engines, node, lint-staged, *.{json,md,yml,yaml}, *.{ts,js}, main, name (+2 more)

### Community 72 - "Model Comparison Testing"
Cohesion: 0.22
Nodes (9): CapturingErrorPlugin, classify(), ITERATIONS, main(), MODELS, PROBES, runOne(), RunOutcome (+1 more)

### Community 73 - "Memory Candidate Gate"
Cohesion: 0.31
Nodes (9): CandidateGateResult, hasKeyword(), isSensitive(), isTrivial(), knownKeys(), normalize(), SENSITIVE_PATTERNS, shouldExtract() (+1 more)

### Community 74 - "Attachment Measurement Script"
Cohesion: 0.35
Nodes (9): Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION, mimeForPath(), resolveKey(), TokenLimits (+1 more)

### Community 75 - "Payload Rendering Logic"
Cohesion: 0.42
Nodes (10): asObject(), asObjects(), chunkLabel(), componentDetails(), isComponentsV2Payload(), PayloadObject, renderEmbeds(), renderPayload() (+2 more)

### Community 76 - "Deployment and Infrastructure"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 77 - "Turn Budgeting Logic"
Cohesion: 0.20
Nodes (5): #160: Two Config Tests Are Blind in Complementary Directions; Merging Either Way Reopens a Hole, #55: New Cross-Key Checks Warn but Never Clamp (Clamp Would Be No-Op), NUMERIC_BOUNDS: Single Registry for All 46 Numeric Tunables in src/config.ts, #58: maxLiveRetryWindow and requiredMs Stay Separate Formulas (Different Tails), NUMERIC_BOUNDS

### Community 78 - "Utility Tools"
Cohesion: 0.24
Nodes (6): flipCoin(), FlipCoinResult, rokaTools, rollDice(), RollDiceParams, RollDiceResult

### Community 79 - "Stats Views Tests"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "Message Handling Tests"
Cohesion: 0.24
Nodes (8): createMessage(), createRateLimiter(), handle(), metrics, mocks, mutableJevConfig, mutableMemoryConfig, snapshot()

### Community 81 - "Statistical Scoring Logic"
Cohesion: 0.20
Nodes (6): fixturePath, header, rememberFixturePath, temporaryDirectories, testCase, ToolTriggerReport

### Community 82 - "Project Docs Index"
Cohesion: 0.33
Nodes (9): Critical Do-Nots, Project (Rokabot description), Reference Docs (AGENTS.md), Rokabot PRD, Documentation (README index), Handing Her a File, Jev Integration (Research Doc), Multimodal Research Doc (+1 more)

### Community 83 - "Memory Predicate Logic"
Cohesion: 0.28
Nodes (7): emoji Config Section, cleanupExpiredCooldowns(), cooldowns, findMatchingRule(), REACTION_RULES, ReactionRule, shouldReact()

### Community 84 - "Live Tool-Trigger Gate"
Cohesion: 0.25
Nodes (7): Live Tool-Trigger Gate: Aggregate Precision/Recall >= 0.80, Binomial-Derived Floors, #149: A Test Derived From a Wrong Mental Model of the Bug Cannot Detect It; Fixed as a Sliding Window, A Gate That Finds a Real Defect Ships Red, Never Relabelled to Manufacture Green, CASE_SETS, CaseSetRun, CaseObservations, scoreCaseSet()

### Community 85 - "Gemini Failure Handling"
Cohesion: 0.28
Nodes (9): Fallback Model (runbook), ADK Error Delivery Constraint, Concurrency & Lifecycle Under Retry, Gemini Failure Taxonomy, Gemini API, ErrorRecoveryPlugin, getRandomFallback(), KNOWN_FALLBACKS (+1 more)

### Community 86 - "ADK Smoke Testing"
Cohesion: 0.31
Nodes (7): ErrorRecoveryPlugin, main(), results, runQuery(), test(), TestResult, wordCount()

### Community 87 - "Weather Tool"
Cohesion: 0.28
Nodes (8): emptyResult(), GeocodingResult, getWeather(), GetWeatherParams, GetWeatherResult, OpenMeteoWeather, weatherCodeToCondition(), wmoWeatherCodes

### Community 88 - "Anime Search Logic"
Cohesion: 0.28
Nodes (7): jikanThrottle(), AnimeResult, JikanAnimeEntry, JikanResponse, searchAnime(), SearchAnimeParams, SearchAnimeResult

### Community 89 - "Who-Is-Who and Recall Trigger"
Cohesion: 0.39
Nodes (7): #195: Who-Is-Who Fixed in Code via Deterministic identityResolver (Mentions -> Display Names -> Nickname Claims), Not Memory Rebuild, Harness Needed No Code Change to Benchmark a Second Tool; runCaseSet Scores toolsUsed.includes(header.tool) Generically, #19 Items 4-7: Proactive-Search Rubric Is Positive-Only, Not a 'Never Search' Negative List (Measured Backfire on #39), #52: A Prompt Addition Can Regress the Tool Gate Through Recall, Not Only Precision, recall_user Proactive Trigger Scoped to Current Message, Not Conversation History (#39), #52: Group-Conversation Roster Not Adopted, Collides With core.ts Single-Speaker Rule, #52: Group-Conversation Roster Confirmed REMOVED From Production via Paired A/B; Recall Dropped 1.000->0.722 (p=0.023)

### Community 90 - "Prompt Length and Voice"
Cohesion: 0.43
Nodes (7): #94 (Architecture): System Prompt Cannot Be Conditioned on What a Turn Will Contain; promptAssembler Runs Before the Model, #94 (Root Cause): Four Prompt Layers Contradict Each Other, Later Layer Wins on Recency, #94: Narrowing a Rule's Scope Made It Dramatically Stronger, Not Weaker (Naming search_web Specifically), #94: A Proportion Is the Wrong Instrument for Trimming a Reply; Replaced With a Countable Paragraph-Structure Rule, Roka Voice: 50-70 Word Response Band, Kaomoji-Only Faces, #94: Trailing Roleplay Paragraph Not Produced by Any Instruction; SPEECH_PROMPT Quotas Cannot Be Satisfied in a Factual Paragraph, #94 (Measured): A Searched Turn Overruns the 50-70 Word Band (69/89/55 Words Measured Live)

### Community 91 - "Streaming Media Prefix Policy"
Cohesion: 0.39
Nodes (6): isobmffAllowsPrefix(), PrefixPolicy, prefixPolicyFor(), STREAMABLE_TYPES, box(), moovDeclaring()

### Community 92 - "ADK Inline Data Testing"
Cohesion: 0.25
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 93 - "Scripted LLM Interface"
Cohesion: 0.25
Nodes (3): REMEMBER_TURN, ScriptedLlm, rememberUserTool

### Community 94 - "Tool Trigger Testing"
Cohesion: 0.29
Nodes (6): cases, header, ok(), turn(), CaseSetHeader, ToolTriggerCase

### Community 95 - "Gemini Safety Settings"
Cohesion: 0.48
Nodes (5): Gemini safetySettings Explicit OFF Across Four Harm Categories, Never Rely on Model Defaults, ALLOWED_HARM_BLOCK_THRESHOLDS, buildSafetySettings(), SAFETY_SETTINGS, SUPPORTED_HARM_CATEGORIES

### Community 96 - "Live Verdict Thresholds"
Cohesion: 0.29
Nodes (7): Live-Model Gate Asserts Statistical Verdict (Accuracy Floor + Zero Systematic Failures), Never Per-Case, #19: recall_user Gate's 2 False Positives Are Not a Regression From the Rubric (Historical FP Range 6-9), #19 Items 4-7: Measured 3x12 Trials on search-web.jsonl, P=1.000 R=1.000 Zero Tuning; recall_user Adoption Gate Green Twice, Verdict Thresholds Live in One Exported Constant + Predicate Shared by Gate and Pin, meetsLiveVerdict(), RECALL_FLOOR_BY_TOOL, recallFloorFor()

### Community 97 - "README Architecture and Tones"
Cohesion: 0.29
Nodes (6): Expressions & Tones, Memory, Message Pipeline, System Architecture, TONE_STYLES, ToneStyle

### Community 98 - "Claims Memory Tables"
Cohesion: 0.43
Nodes (7): Claim Lifecycle, Claims Memory Architecture, extraction_queue Table, memory_claim_fts Table, memory_claim Table, memory_events Table, memory_evidence Table

### Community 99 - "Memory Safety Logic"
Cohesion: 0.57
Nodes (5): buildFactsEnvelope(), buildOverheardBlock(), isSafeFactScalar(), normalizeOverheardText(), renderOverheardBlock()

### Community 100 - "Current Time Tool"
Cohesion: 0.40
Nodes (5): cityToTimezone, getCurrentTime(), GetCurrentTimeParams, GetCurrentTimeResult, resolveTimezone()

### Community 102 - "Rate Limiting Tests"
Cohesion: 0.50
Nodes (3): makeInteraction(), mocks, turnState()

### Community 104 - "Codex Worker Lessons"
Cohesion: 0.50
Nodes (4): Codex Workers Over-Apply PM-Orchestration Rules to Themselves From AGENTS.md, Codex Worker Briefs Must Be Self-Contained: api.github.com Unreachable From Sandbox, Codex -o Artifacts Must Be Written Outside Repo to Avoid Biome Parsing as JSON, Codex --sandbox workspace-write Has Network Off by Default, Needs Explicit Opt-In

### Community 105 - "Chat Input Testing"
Cohesion: 0.67
Nodes (3): handleInput(), main(), username

### Community 107 - "Rebase Check Corrections"
Cohesion: 0.67
Nodes (3): Correction: git rev-parse origin/<branch> Check Is Unsound; Default to Merge, Rebase Only Before First Push, Peer Refused PM's Instruction to Rebase a Published Branch, Merged origin/main Instead, PM Violated Its Own Corrected Rule: Rebased a Published Branch After Push, Rejected by Remote

### Community 108 - "Character and Source Work"
Cohesion: 0.67
Nodes (3): Maniwa Roka, Rokabot, Senren*Banka

## Ambiguous Edges - Review These
- `Rokabot TRD` → `Second Opinion`  [AMBIGUOUS]
  docs/research/jev-integration.md · relation: conceptually_related_to

## Knowledge Gaps
- **462 isolated node(s):** `$schema`, `enabled`, `indentStyle`, `indentWidth`, `lineWidth` (+457 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Rokabot TRD` and `Second Opinion`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `config` connect `Config Loading and Claims Rollout` to `Gacha Buddy System`, `Jev and Live Benchmark Setup`, `Retry Loop Design History`, `Slash Command UI`, `Memory Claim Management`, `Game Configuration`, `Memory Extraction Configuration`, `Bot Startup and Shutdown`, `Reply Splitting and Concurrency`, `Memory Privacy and Tenancy`, `Hangman Game Logic`, `Memory Extraction Test Script`, `Live Gate and Quota Diagnostics`, `SQLite Data Access`, `Response Generation Testing`, `Claim Retrieval Ranking`, `Game Command Handling`, `Channel Session Window`, `Mock Object Factories`, `Legacy Fact Extractor`, `Claim Extraction Pipeline`, `Anime Lookup Tools`, `ModelScope Fallback Adapter`, `In-Flight Attachment Byte Budget`, `Guild Permissions and Message Intake`, `Core Architecture and Fallback Tests`, `Extraction Scheduler Tests`, `Timezone Testing`, `Harness Capture Sink`, `Obsidian Export Logic`, `Reminders`, `LLM Tool Registry`, `Token Budget Management`, `Attachment Token Cost Findings`, `Product Requirements`, `Interaction Metrics Testing`, `Model Comparison Testing`, `Message Handling Tests`, `Memory Predicate Logic`, `Live Tool-Trigger Gate`, `ADK Smoke Testing`, `Weather Tool`, `Gemini Safety Settings`, `Current Time Tool`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Why does `getDb()` connect `Memory Claim Management` to `Gacha Buddy System`, `Memory Statistics Visualization`, `Game Configuration`, `Memory Extraction Configuration`, `Bot Startup and Shutdown`, `Statistics Query Logic`, `Memory Privacy and Tenancy`, `Metrics and Diagnostics`, `Hangman Game Logic`, `Memory Extraction Test Script`, `SQLite Data Access`, `Claim Retrieval Ranking`, `Game Command Handling`, `Legacy Fact Extractor`, `Claim Extraction Pipeline`, `Phase 8 Test Script`, `Extraction Scheduler Tests`, `Benchmark Pacing Logic`, `Timezone Testing`, `Harness Capture Sink`, `Obsidian Export Logic`, `Reminders`, `Buddy Collection UI`, `Live Tool-Trigger Gate`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `logger` connect `Game Command Handling` to `Gacha Buddy System`, `Slash Command UI`, `Discord Output and Sprite Decisions`, `Memory Claim Management`, `Game Configuration`, `Bot Startup and Shutdown`, `Reply Splitting and Concurrency`, `Memory Privacy and Tenancy`, `Web Search Decisions`, `Metrics and Diagnostics`, `Hangman Game Logic`, `Memory Extraction Test Script`, `Channel Session Window`, `Mock Object Factories`, `Legacy Fact Extractor`, `Config Loading and Claims Rollout`, `Phase 8 Test Script`, `Anime Lookup Tools`, `Chart Rendering Logic`, `Timezone Testing`, `Reminders`, `Token Budget Management`, `Attachment Token Cost Findings`, `Discord Command Registration`, `Stats Command and Error Handling`, `Memory Predicate Logic`, `Weather Tool`, `Anime Search Logic`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `generateResponse()` (e.g. with `#96: A Valid Review Finding Is Not Evidence a Defect Was Averted; fitCitations Absorbed the Smaller Footer` and `Attachment Bytes Do Not Live in History`) actually correct?**
  _`generateResponse()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `createInteractionHandler()` (e.g. with `message()` and `isSupportedMedia()`) actually correct?**
  _`createInteractionHandler()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `enabled`, `indentStyle` to the rest of the system?**
  _462 weakly-connected nodes found - possible documentation gaps or missing edges._