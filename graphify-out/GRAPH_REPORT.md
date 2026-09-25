# Graph Report - rokabot  (2026-09-25)

## Corpus Check
- 271 files · ~253,311 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2305 nodes · 5827 edges · 134 communities (101 shown, 33 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 358 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `66a5a466`
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
- searchPrefetchShadow.ts
- searchPrefetch.ts
- messageContent.ts
- Gemini Failure Handling
- ADK Smoke Testing
- Weather Tool
- Anime Search Logic
- Who-Is-Who and Recall Trigger
- Prompt Length and Voice
- Streaming Media Prefix Policy
- ADK Inline Data Testing
- memoryClaimSchema.ts
- Gemini Safety Settings
- README Architecture and Tones
- Memory Safety Logic
- Current Time Tool
- Interaction Mocking
- Codex Worker Lessons
- Chat Input Testing
- Commit Conventions
- Rebase Check Corrections
- Character and Source Work
- Fake Channel
- toolTrigger.retry.test.ts
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
- toolTrigger.live.test.ts
- FakeMessage
- replayMemoryV2.test.ts
- Prompt-Injection Defense: Structural Inertness Primary, Scalar Validation Defense-in-Depth, saveFact Chokepoint

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 178 edges
2. `config` - 69 edges
3. `logger` - 51 edges
4. `generateResponse()` - 46 edges
5. `createMessageHandler()` - 42 edges
6. `createInteractionHandler()` - 39 edges
7. `runTranscript()` - 31 edges
8. `assertClaim()` - 29 edges
9. `closeDb()` - 29 edges
10. `main()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Attachment Bytes Do Not Live in History` --conceptually_related_to--> `generateResponse()`  [INFERRED]
  docs/trd.md → src/agent/roka.ts
- `Command Architecture: Utilities as Implicit ADK Tools, Folklore-Label Footer Disclosure` --rationale_for--> `buildToolFooter()`  [INFERRED]
  docs/decisions.md → src/discord/messageBuilder.ts
- `Phase 9: Rate-Aware Bounded Retries, Busy-Reply Drop, Terminal-Only Session Destroy` --references--> `getRandomBusy()`  [INFERRED]
  docs/decisions.md → src/discord/responses.ts
- `gemini Config Section` --shares_data_with--> `measureAttachmentTokens()`  [INFERRED]
  config.yml → src/agent/attachmentCost.ts
- `Attachment Types and Their Ceilings` --implements--> `sizeLimitFor()`  [INFERRED]
  docs/trd.md → src/agent/attachmentLimits.ts

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

## Communities (134 total, 33 thin omitted)

### Community 0 - "Gacha Buddy System"
Cohesion: 0.14
Nodes (28): Buddy/Games Table Rebuild via Schema-Driven PRAGMA table_info Copy, Gacha Hatch Gate: Rolling 24h via last_hatch_at, Not Calendar-Day, BuddyRow, DailyBuddyHatch, DailyHatchRow, generateBuddy(), generateName(), generatePersonality() (+20 more)

### Community 1 - "Jev and Live Benchmark Setup"
Cohesion: 0.15
Nodes (24): parseReplayArgs(), runReplayCli(), agreement(), buildConfusionMatrix(), buildProbabilityBins(), buildReplayTurn(), formatAgreement(), formatRecentLine() (+16 more)

### Community 2 - "Retry Loop Design History"
Cohesion: 0.21
Nodes (19): attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow, legalScopes() (+11 more)

### Community 3 - "Slash Command UI"
Cohesion: 0.07
Nodes (33): #19 (PR #92): /chat and /search Retired, Replaced by Single /ask; No Zero-Gemini Factual Path Remains, #90 (Won't Fix): Rokabot Deployed to NSFW Servers, No exclude_domains List, Phase 17 (Layout B + guild_id Migration) Declined as Unnecessary, #92: Merge Required Explicit Human Authorization, Retiring Commands Is User-Visible Breaking Change, #19: Do Not Migrate Search Providers; Defect Was Ours (Geo-Poisoning Query Suffix + include_answer:'basic'), Slash Command Registration: Optional Dev-Guild Route for Instant Propagation, Slash Consolidation Layout A Shipped; Layout B Deferred With guild_id Migration, #19: include_answer:'basic' Could Leak Hallucinated Self-Identity Into Answer Body (+25 more)

### Community 4 - "Code Formatting Configuration"
Cohesion: 0.05
Nodes (40): useLiteralKeys, files, ignore, formatter, enabled, indentStyle, indentWidth, lineWidth (+32 more)

### Community 5 - "Memory Statistics Visualization"
Cohesion: 0.11
Nodes (35): busiestChannel, latencyE2e, mostUsedTool(), p95ByDay, percentile(), retrySummary, tokenTotals, topChannels() (+27 more)

### Community 6 - "Discord Output and Sprite Decisions"
Cohesion: 0.09
Nodes (27): Buddy Sprite Hosting: Hardcoded CDN URLs, Regenerated Local PNGs Source of Truth, Buddy Sprite Hosting Migrated Catbox to Postimages After Outage, Testing Convention: A Budget Invariant Needs a Swept Input, Not a Sampled One (#92 Citation Row Boundary), #63: discord.maxMessageLength Ceiling Derived as 4000 - MAX_TOOL_FOOTER_CHARS, #56: Discord Ceiling Is Components V2 TextDisplay Budget (4000), Not content's 2000, Sharp Pipeline Rule: One .resize() Per Pipeline, Materialize Between Stages, #96: A Valid Review Finding Is Not Evidence a Defect Was Averted; fitCitations Absorbed the Smaller Footer, spriteFiles (+19 more)

### Community 7 - "Memory Claim Management"
Cohesion: 0.10
Nodes (45): Claims Tenancy Model, evicted, activateClaim(), appendEvidence(), appendEvidenceInTransaction(), assertClaimInTransaction(), assertGuildClaim(), assertSafeValue() (+37 more)

### Community 8 - "Game Configuration"
Cohesion: 0.09
Nodes (39): Game Timeout Displays Derive From Configured Timeout, Not Hardcoded, assert(), fail(), main(), makeMessage(), pass(), results, TestResult (+31 more)

### Community 9 - "Memory Extraction Configuration"
Cohesion: 0.12
Nodes (22): Memory, drainOnce(), finishJob(), inFlightGuilds, inFlightTasks, orderedGuilds(), runJob(), scheduleDrain() (+14 more)

### Community 10 - "Bot Startup and Shutdown"
Cohesion: 0.10
Nodes (27): embedEpisodeText(), EpisodeEmbeddingRole, getEmbeddingClient(), resetEpisodeEmbeddingClientForTest(), EpisodeMaintenanceReport, pruneEpisodesAndReembed(), persistEpisodeResult(), EpisodeRunResult (+19 more)

### Community 11 - "Statistics Query Logic"
Cohesion: 0.08
Nodes (36): activeClaimCount(), activityByDay(), ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome, CountByPredicate (+28 more)

### Community 12 - "Discord Test Doubles"
Cohesion: 0.06
Nodes (41): AttachmentSpec, CaptureKind, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec, FakeAttachment (+33 more)

### Community 13 - "Reply Splitting and Concurrency"
Cohesion: 0.10
Nodes (41): Backtick Escaping Moved From Prompt Into Send Path (responses.ts); Kaomoji Backtick Paired With Later Backtick Broke Markdown, #59: failure_marker May Persist HTTP Status From Closed Allowlist (400/401/403/429/500/503/504), response_events.failure_marker Persists Only Raw errorCode/finishReason, Never errorMessage, #76: docs/prd.md Reply-Split Criterion Now Names Enforcement Point, Not a Number (4th Correction), #76: splitResponse Has No Sentence-Boundary Logic; Last-Newline/Last-Space/Hard-Cut Fallback Chain, #19 Follow-Up (PR #95): splitResponse Hard-Cut Steps Back Off Trailing High Surrogate to Avoid Splitting Emoji, Testing Convention: A Sweep Is Only as Good as the Shapes Swept Over (ASCII-Only Sweep Missed Emoji Bug), tools_used Recorded on response_events as JSON-Array of Tool Names Only (+33 more)

### Community 14 - "Memory Privacy and Tenancy"
Cohesion: 0.17
Nodes (17): Architecture (AGENTS.md), Critical Do-Nots, Project (Rokabot description), Reference Docs (AGENTS.md), discord Config Section, emoji Config Section, games Config Section, gemini Config Section (+9 more)

### Community 15 - "Web Search Decisions"
Cohesion: 0.29
Nodes (15): cancelReminder(), listReminders(), setReminder(), SetReminderParams, handleRemind(), handleRemindAt(), handleRemindCancel(), handleRemindIn() (+7 more)

### Community 16 - "Metrics and Diagnostics"
Cohesion: 0.07
Nodes (35): metrics Config Section, #82: failure_diagnostics Table Separate From response_events, Shorter Retention, Records block_side, Phase 12: SQLite Metrics Tables (response_events/extraction_events), Never-Throw Writers, Phase 28 Shipped Outside PM Pipeline, Six Decisions Reconstructed Later From Squash Commit, #81: Rung 3 Destroys Session, Suppresses Rehydration to Prevent Re-Importing Contaminating History, #81: Safety Blocks Handled by Three-Rung De-Escalation Ladder, Replacing Single Steering Retry (100% Failure Rate), #83: Retry Token Consumed Only When a Ladder Rung Is Actually Available, Privacy (+27 more)

### Community 18 - "Hangman Game Logic"
Cohesion: 0.22
Nodes (19): buildHangmanBody(), handleHangmanGuess(), handleHangmanStart(), saveHangmanScore(), activeGames, getDisplayWord(), getGame(), getHangmanArt() (+11 more)

### Community 19 - "Memory Extraction Test Script"
Cohesion: 0.14
Nodes (23): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), resetEpisodeTrackerForTest(), scheduleLull() (+15 more)

### Community 20 - "Development Tooling"
Cohesion: 0.08
Nodes (25): @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, husky, lint-staged, devDependencies, @biomejs/biome, @commitlint/cli (+17 more)

### Community 21 - "Session Attachment Management"
Cohesion: 0.09
Nodes (16): attachmentMarker(), abortActiveTurns(), runner, clearSessionErrorCount(), destroyAllSessions(), ensureSession(), idleTimers, incrementSessionErrorCount() (+8 more)

### Community 22 - "Live Gate and Quota Diagnostics"
Cohesion: 0.10
Nodes (24): #92: Citation Renderer Built for /search Migrated to Serve /ask and Mention Reply Paths, Live Benchmark Aborts on Any Turn Not outcome==='ok', Never Scores It, Live-Eval Fixtures Must Not Collide With Seeded World (FTS Term Matching), #132/#141/#145: Live Gate Now Distinguishes Deflection (Abort) From Transient Fallback (Bounded Retry on Fresh Channel), Live Tool-Trigger Gate: Aggregate Precision/Recall >= 0.80, Binomial-Derived Floors, #149: A Test Derived From a Wrong Mental Model of the Bug Cannot Detect It; Fixed as a Sliding Window, #19: Tool-Trigger Gate Never Exercised a Real Search Result Reaching a Reply; Verified via withSearchCitations Direct Run, A Gate That Finds a Real Defect Ships Red, Never Relabelled to Manufacture Green (+16 more)

### Community 23 - "SQLite Data Access"
Cohesion: 0.15
Nodes (18): addNickname(), addUser(), upsertUserName(), asClaim(), asScenario(), evaluateMemoryShadow(), FixtureClaim, loadReplaySet() (+10 more)

### Community 24 - "Response Generation Testing"
Cohesion: 0.10
Nodes (24): #72: ADK Contract Test Builds Own Runner/LlmAgent/InMemorySessionService, Leaves Harness Seam Untouched, Phase 19: Safety Blocks Get One Steered Regeneration Before Static Deflection, Phase 9: Rate-Aware Bounded Retries, Busy-Reply Drop, Terminal-Only Session Destroy, #29/181: __setTestRunTurnFactory Consumed Above generateResponse's Call Into runner.runAsync, generateResponse(), __setTestRunTurnFactory(), steeringForRequest, TestRunTurn (+16 more)

### Community 25 - "Claim Retrieval Ranking"
Cohesion: 0.16
Nodes (24): #25: recall_user No Longer Re-Sorts by lastSeenAt; pinned/salience/last_seen/id Ordering Survives to Cap, Memory Recall: Freshest-First, Bounded 15 Facts, Legacy Tail, ClaimSource, predicateCategory, routeTopics(), ClaimRow, compareRetrieved(), getActiveClaims() (+16 more)

### Community 26 - "Transcript Processing"
Cohesion: 0.17
Nodes (21): fixturePath(), loadTranscript(), main(), parseTranscriptLine(), renderTokenTable(), requestMessageContent(), runTranscript(), RunTranscriptOptions (+13 more)

### Community 27 - "Bot Technology Stack"
Cohesion: 0.08
Nodes (25): better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml, @napi-rs/canvas, dependencies (+17 more)

### Community 28 - "CodeRabbit Gate History"
Cohesion: 0.09
Nodes (23): Biome noDelete Autofix Rewrites delete process.env.X to = undefined, Defeating the !apiKey Guard, Piping biome check . Through tail Hides Real Failures; Check Exit Code Never Tail Alone, CodeRabbit's GitHub Login Is coderabbitai[bot], Not coderabbitai, Correction: CodeRabbit Review-Detection Method (pulls/reviews Body Check) Fails Toward 'Unreviewed' on Every Clean Review, Second Correction: Working CodeRabbit Detector Uses Verdict-Phrase Grep, Not Status Check, Reviews Array, or File-List Grep, CodeRabbit Gate: Required Check via Ruleset 19584734, No Bypass Actors, CodeRabbit Gate Unwind Path: Delete Ruleset First, Then Uninstall App, CodeRabbit's Status Check Reports SUCCESS Without Having Reviewed Anything on Low-Star Repos (+15 more)

### Community 29 - "Rate Limiting Logic"
Cohesion: 0.15
Nodes (13): #168 vs #167: A Doc Correction Written for the World as It Is, Mid-Change, Is a Defect With a Delay on It, #167: Suite Complete About Steady State, Blind to the Transient (Reservation Held DURING a Turn), the Whole Feature, FR-6: Rate Limiting, Discord Gateway Layer, RateLimiterConfig, RPM-Budget Accounting, A Turn Reserves the Calls It May Make, The Two Limiters Bound Their Windows Differently (+5 more)

### Community 30 - "Token Usage Estimation"
Cohesion: 0.16
Nodes (22): MAX_SYSTEM_PROMPT_TOKENS=5000 Is a Catastrophe Rail, Not a Latency Constraint, PR #67: docs/trd.md ToneKey Table Pinned by Test Against Object.keys(TONE_PROMPTS), FR-4: Layered Personality Prompts, Prompt System, AssemblerInput, AssemblerInput, assembleSystemPrompt(), buildContextPrompt() (+14 more)

### Community 31 - "TypeScript Build Config"
Cohesion: 0.09
Nodes (22): ES2022, **/*.test.ts, compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib (+14 more)

### Community 32 - "Game Command Handling"
Cohesion: 0.26
Nodes (17): createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleHangmanGuide(), HANGMAN_COLORS, handleLeaderboard(), buildGameContainer(), buildTimeoutContainer() (+9 more)

### Community 33 - "Channel Session Window"
Cohesion: 0.27
Nodes (10): assert(), fail(), main(), pass(), results, TestResult, ChannelUser, clearHistory() (+2 more)

### Community 34 - "CI/CD Pipeline Gates"
Cohesion: 0.08
Nodes (26): scripts, build, dev, dev:quiet, export:vault, format, format:check, harness (+18 more)

### Community 35 - "Mock Object Factories"
Cohesion: 0.33
Nodes (11): searchAnime(), createToolCommandHandler(), TOOL_COMMAND_NAMES, handleAnime(), capitalize(), formatTimezoneList(), handleSchedule(), buildToolMessage() (+3 more)

### Community 36 - "Legacy Fact Extractor"
Cohesion: 0.10
Nodes (24): argumentsFrom(), liveAdapters(), loadTranscriptLines(), main(), offlineAdapters(), ReplayArgs, ReplayMetrics, transcriptFiles() (+16 more)

### Community 37 - "Config Loading and Claims Rollout"
Cohesion: 0.15
Nodes (13): #25 (Unactioned): baseSalience Hardcoded 0.5 for Every Predicate, Importance Not Modelled, supersedePriorActive(), baseSalienceOf(), cardinalityOf(), GUILD_PREDICATES, GuildPredicateId, MemoryPredicateId, PredicateCardinality (+5 more)

### Community 38 - "Claim Extraction Pipeline"
Cohesion: 0.09
Nodes (24): judgeEpisodeOperations(), ExtractionOp, ExtractionOutput, episodePrompt(), EpisodeWriteOp, extractEpisode(), formatEpisodeLine(), getClient() (+16 more)

### Community 39 - "Phase 8 Test Script"
Cohesion: 0.19
Nodes (15): #196: Jev (TypeSafe, jev-1.13.0) Takes Pick-From-List Decisions Only (Tone/Referent/Memory), Shadow Mode, Fail-Open, #132/#141: Live Gate's Own Prompt Changes Mid-Run via getLocalHour(); Two Prompt-Affecting Variables Step Together at 05:00, Tone Detector Rebalance: Avoid-Immediate-Repeat, Annoyed Narrowed, Curious Priority 3, #64: Tone Precedence Documented First-Match-Wins, Pinned by Test, TONE_PATTERNS Not Reordered, FR-3: Per-Channel Conversational Memory, FR-5: Tone Detection, Attachment History Stripping, ChannelSession (+7 more)

### Community 40 - "Anime Lookup Tools"
Cohesion: 0.20
Nodes (19): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleResult, getCurrentSeason(), getTodayName() (+11 more)

### Community 41 - "Discord Fake Builders"
Cohesion: 0.15
Nodes (12): reminders Config Section, #75: Guild Permission Set Documented as Derivation (Operation to Permission), No Line Numbers, #75: Reminders Need Guild Send Messages; Channel-First Delivery, DM Only as Fallback, #55: Reminder Stale-Threshold Guard Uses <=, Not <, Because No Leading Scheduler Tick, monitoredChannels, startReminderScheduler(), ActiveReminder, CreateReminderResult (+4 more)

### Community 42 - "ModelScope Fallback Adapter"
Cohesion: 0.14
Nodes (16): fallback Config Section, ModelScope Qwen Fallback, Tech Stack (README), AnswerModel, ChatMessage, errorText(), GeneratedCall, isHedgeEligible() (+8 more)

### Community 43 - "In-Flight Attachment Byte Budget"
Cohesion: 0.13
Nodes (9): Multimodal Research Doc, Global In-Flight Attachment Budget, attachmentOptionName(), inFlightBytes(), client, createInteraction(), mocks, askWith() (+1 more)

### Community 44 - "Guild Permissions and Message Intake"
Cohesion: 0.19
Nodes (6): ModelRoute, afterHedge(), DeferredLlm, loggerMock, Outcome, responses()

### Community 45 - "Media Validation Policies"
Cohesion: 0.16
Nodes (25): RFC-3003, attachment_url, Handing Her a File, Audio Intake Recommendation, PDF Intake Recommendation, Video Low Resolution Recommendation, Attachment Types and Their Ceilings, GEMINI_SPELLINGS (+17 more)

### Community 46 - "Gemini Error Handling"
Cohesion: 0.07
Nodes (40): classifyGeminiFailure: HTTP Status Matched Digit-Anchored, Demoted Below Symbolic Markers, Gemini Function-Call-Ordering 400 Recovered via Destroy+Rehydrate+Retry (session_corrupt), Phase 10: Hybrid Dev Harness (Local Discord Sim + Fake-LLM Seam), retryBackoffCapMs Deliberately Serves as Both Cumulative Ceiling and Per-Attempt maxMs, #58: Transient-Status Classification Adds 504 Only, Others Unfiled Until Observed, BackoffOptions, classifyGeminiFailure(), classifyMarker() (+32 more)

### Community 47 - "Tool Trigger Fixtures"
Cohesion: 0.08
Nodes (34): Live-Model Gate Asserts Statistical Verdict (Accuracy Floor + Zero Systematic Failures), Never Per-Case, #19: recall_user Gate's 2 False Positives Are Not a Regression From the Rubric (Historical FP Range 6-9), #19 Items 4-7: Measured 3x12 Trials on search-web.jsonl, P=1.000 R=1.000 Zero Tuning; recall_user Adoption Gate Green Twice, Verdict Thresholds Live in One Exported Constant + Predicate Shared by Gate and Pin, isKnownPredicate(), cases, header, ok() (+26 more)

### Community 48 - "Memory Predicates and Privacy"
Cohesion: 0.12
Nodes (25): #29/181: Every Non-Guild Channel Gets Its Own Memory Tenant dm:${channelId}, #70: findUserByName Non-Global Branch Filters by Tenant Across Three Evidence Sources, #70: Filtering vs Preferring Trade-Off Resolves in Favour of Filtering; factCount:0 Either Way, #118: Memory Split by Consent, Not Topic; Told -> Explicit Claim, Inferred -> Passive Claim, #71 (Parked): 518 Claims/707 Evidence Rows, Zero dm:-Prefixed Tenants Exist, Growth Curve Hasn't Started, #29/181: Memory Tools Fail Closed on Absent-or-'global' Tenant State, Structured WARN Log, #118 Follow-Up: privacyGuard.ts Blocks Contact Details/Money/Government IDs/Credentials on Key-or-Value Signal, Where Rokabot Decides Today (+17 more)

### Community 49 - "Chart Rendering Logic"
Cohesion: 0.26
Nodes (14): /stats Redesign: Fixed 30D Window, TW-Style Skeleton, Rule-Based Mood Label, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+6 more)

### Community 50 - "Core Architecture and Fallback Tests"
Cohesion: 0.15
Nodes (17): cleanupExpired(), restoreMonitoredChannels(), resetForTest(), startExtractionScheduler(), stopExtractionScheduler(), waitForInFlightExtractions(), enqueue(), episode() (+9 more)

### Community 51 - "Extraction Scheduler Tests"
Cohesion: 0.22
Nodes (8): resetMonitor(), makeClient(), makeGuild(), toChannelMap(), mocks, ResponseEventRow, responseRows(), transcript

### Community 52 - "Test TypeScript Config"
Cohesion: 0.13
Nodes (14): node, tests/**/*, ./tsconfig.json, vitest/globals, compilerOptions, noEmit, rootDir, types (+6 more)

### Community 53 - "Benchmark Pacing Logic"
Cohesion: 0.14
Nodes (19): GPT-6-Astra, Jev Rollout Plan, Second Opinion, Who-Is-Who Resolver, Bounded Retrieval Contract, buildNameIndex(), escapeRegex(), isAscii() (+11 more)

### Community 54 - "Timezone Testing"
Cohesion: 0.16
Nodes (13): __resetTestRunTurnFactory(), sessionService, line(), responseEventCount(), transcript, writeFixture(), channels, header (+5 more)

### Community 55 - "Harness Capture Sink"
Cohesion: 0.16
Nodes (9): CaptureInput, CaptureKind, CaptureRecord, createCaptureSink(), benchmarkTranscript, mocks, responseText(), scriptedResponse() (+1 more)

### Community 56 - "Obsidian Export Logic"
Cohesion: 0.07
Nodes (42): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping), Browsing Memory in Obsidian (+34 more)

### Community 57 - "Reminders"
Cohesion: 0.22
Nodes (20): handleGachaMention(), statBar(), formatBuddySummary(), formatHatchTimeRemaining(), handleBuddyLeaderboard(), handleBuddyStats(), handleBuddyView(), handleHatch() (+12 more)

### Community 58 - "LLM Tool Registry"
Cohesion: 0.11
Nodes (29): Phase 11: LLM Tool Suite Trimmed to Used+Wanted Set, Tool Footer, flipCoin(), FlipCoinResult, ForgetUserParams, GetAnimeScheduleParams, cityToTimezone, getCurrentTime() (+21 more)

### Community 59 - "Multimodal Intake Research"
Cohesion: 0.18
Nodes (6): citationsForTurn, SearchCitation, runSearchTurn(), ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS

### Community 60 - "Token Budget Management"
Cohesion: 0.19
Nodes (11): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, canAffordAttachments(), chargeTokens(), drain(), lastDrain, remainingTokensThisMinute(), __resetTokenBudgetForTest() (+3 more)

### Community 61 - "Attachment Type Limits"
Cohesion: 0.12
Nodes (26): jev Config Section, Jev Design (Per-Feature Modes), Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk, Jev Shadow Mode, Jev Judgments, Jev Memory Admission (+18 more)

### Community 62 - "Attachment Token Cost Findings"
Cohesion: 0.07
Nodes (41): #58 CodeRabbit: Aggregate Backoff Cap Fix Goes Silent at R>=5, Deferred to #60, #131/#133: Attachment Bytes Stripped From Session History After the Turn; Cross-Turn Image Recall Removed, #79: attemptTimedOut Flag Distinguishes Per-Attempt Timeout From Shutdown/Deadline Abort, #79: Backoff Sleep Swaps in Fresh AbortController So Timeout Doesn't Cancel Its Own Retry Delay, Two Species of Bad Check: One That Could Not Have Failed, One That Could Fail and Was Aimed Until It Didn't, #135: For Oversized Media, Take a Byte Prefix Rather Than Transcoding or Refusing (MP3 Frame-Based, MP4 moov-Dependent), #160: Two Config Tests Are Blind in Complementary Directions; Merging Either Way Reopens a Hole, #153/#165/#176: countTokens Is a Biased Estimator in Both Directions at Once; Video Inflation Pays for Audio Blindness (+33 more)

### Community 63 - "Tone Detection"
Cohesion: 0.08
Nodes (30): FR-10: Graceful Shutdown, FR-2: Mention/Reply Interaction, FR-7: Error Handling, FR-8: Response Formatting, FR-9: Docker Deployment, Functional Requirements, Problem Statement, Product Requirements Document (+22 more)

### Community 64 - "Product Requirements"
Cohesion: 0.24
Nodes (9): attachmentKind(), attachmentMarker(), isRecord(), openAiMessages(), openAiTools(), systemText(), textContent(), toJsonSchema() (+1 more)

### Community 65 - "Interaction Metrics Testing"
Cohesion: 0.12
Nodes (13): metrics, mocks, turnEntryWork, createMessage(), createRateLimiter(), handle(), metrics, mocks (+5 more)

### Community 66 - "CI Deploy Pipeline"
Cohesion: 0.36
Nodes (7): #162/#163: Merged on 'Checks No Longer Pending' Instead of on the Verdict; main Was Red for a Full Day, #162/#163: A Test That Pins an Incidental of Its Environment (getLocalHour via Intl.DateTimeFormat) Is Testing the Environment, getLocalHour(), emitTrialRecord(), formatTrialRecord(), TrialRecord, record

### Community 67 - "Discord Command Registration"
Cohesion: 0.28
Nodes (8): emptyResult(), GeocodingResult, getWeather(), GetWeatherParams, GetWeatherResult, OpenMeteoWeather, weatherCodeToCondition(), wmoWeatherCodes

### Community 69 - "Stats Command and Error Handling"
Cohesion: 0.27
Nodes (10): Memory Privacy: Predicate Categories May Surface Publicly, Fact Values Never; Guild Isolation Absolute, /stats Headers Plain, Mood Label Is a Stat Line; Bot's Own User ID Excluded, Privacy Amendment: /stats Memory Quote Surfaces Top-Salience Claim Value In-Guild, handleStatsCommand(), isStatsView(), logStatsError(), selectionFor(), sendStatsError() (+2 more)

### Community 70 - "Buddy Collection UI"
Cohesion: 0.38
Nodes (8): /gacha collection: Separate Paginated Components-v2 Subcommand, buildCollectionPage(), buildPaginatedCollectionPage(), getCollectionPageCount(), handleBuddyCollection(), { getBuddyCollection }, BuddyData, getBuddyCollection()

### Community 71 - "Project Metadata"
Cohesion: 0.18
Nodes (10): description, engines, node, lint-staged, *.{json,md,yml,yaml}, *.{ts,js}, main, name (+2 more)

### Community 72 - "Model Comparison Testing"
Cohesion: 0.22
Nodes (9): CapturingErrorPlugin, classify(), ITERATIONS, main(), MODELS, PROBES, runOne(), RunOutcome (+1 more)

### Community 75 - "Payload Rendering Logic"
Cohesion: 0.42
Nodes (10): asObject(), asObjects(), chunkLabel(), componentDetails(), isComponentsV2Payload(), PayloadObject, renderEmbeds(), renderPayload() (+2 more)

### Community 76 - "Deployment and Infrastructure"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 78 - "Utility Tools"
Cohesion: 0.29
Nodes (10): serializeGuildFact(), loadGetLocalHour(), loadTimezoneModule(), unpinnedHour(), dateString(), dateTimeParts(), getLocalDate(), localDateStartEpoch() (+2 more)

### Community 79 - "Stats Views Tests"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "Message Handling Tests"
Cohesion: 0.32
Nodes (8): buildEpisodeRecallBlock(), cosineSimilarity(), formatEpisodeRecallBlock(), RecalledEpisode, recallEpisodes(), selectEpisodesWithinBudget(), toRecalledEpisode(), configMock

### Community 81 - "Database Management and Migration"
Cohesion: 0.12
Nodes (9): pinClaim(), REMEMBER_TURN, ScriptedLlm, closeDb(), createTables(), resolveDbPath(), runMigrations(), DatabaseModule (+1 more)

### Community 82 - "searchPrefetchShadow.ts"
Cohesion: 0.21
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "searchPrefetch.ts"
Cohesion: 0.11
Nodes (21): Correction: Harness and Production Bot Do Not Share a Quota (Different Google Projects), #94 (Blocked): Harness Project's Daily Gemini Quota Exhausted Mid-Adoption, PR #105 Left as Draft, Live Benchmark Pacing Set by RPM With Headroom (12s/2-Call Turn = 10 RPM Against 15 Cap), vitest.live.config.ts testTimeout Now Derives From Pacing Instead of Hardcoded 900s; A Timeout Aborting Before a Verdict Reports Nothing, test:live Gate Added: Three Non-Overlapping Gates (Correctness, Perf, Live-Model), TRIAL_PACING_MS Raise-Only, 12000ms Human-Set Floor Enforced in Code, Zero 429s at 30s Pacing, Getting Started, npm run test:live Gate (+13 more)

### Community 84 - "messageContent.ts"
Cohesion: 0.30
Nodes (11): ImageAttachment, describeEmbed(), describeForwardedSnapshots(), describePoll(), extractComponentMedia(), extractComponentTexts(), ExtractedMessageContent, extractMessageContent() (+3 more)

### Community 85 - "Gemini Failure Handling"
Cohesion: 0.14
Nodes (15): #60: Guard Tied to Real runTurnWithReliability Loop by a Test Sweeping maxRetries 0-6, Fallback Model (runbook), ADK Error Delivery Constraint, Attachment Bytes Do Not Live in History, Concurrency & Lifecycle Under Retry, Gemini Failure Taxonomy, Gemini API, Roka Agent (ADK) (+7 more)

### Community 86 - "ADK Smoke Testing"
Cohesion: 0.31
Nodes (7): ErrorRecoveryPlugin, main(), results, runQuery(), test(), TestResult, wordCount()

### Community 87 - "Weather Tool"
Cohesion: 0.07
Nodes (29): Configuration (AGENTS.md), Tech Stack (AGENTS.md), Command Architecture: Utilities as Implicit ADK Tools, Folklore-Label Footer Disclosure, #29: Games Stay Guild-Only Because Timeout-Completion Path Needs Channel Access, Not the Data Reason Assumed, Regression Tests for Pattern-Matching Fixes Must Be Pinned by Mutation, Not Green Suite, Testing Convention: An Assertion a Mutation Probe Targets Must Sit in Its Own it Block, Phase 14: Claims Memory Backend Behind config.memory.claimsBackend, Dual-Write Warming, #29: Installation/Context Policy Recorded by Pointer Only; registration.test.ts Is Authoritative (+21 more)

### Community 88 - "Anime Search Logic"
Cohesion: 0.33
Nodes (5): AnimeResult, JikanAnimeEntry, JikanResponse, SearchAnimeParams, SearchAnimeResult

### Community 89 - "Who-Is-Who and Recall Trigger"
Cohesion: 0.29
Nodes (9): #195: Who-Is-Who Fixed in Code via Deterministic identityResolver (Mentions -> Display Names -> Nickname Claims), Not Memory Rebuild, Harness Needed No Code Change to Benchmark a Second Tool; runCaseSet Scores toolsUsed.includes(header.tool) Generically, #19 Items 4-7: Proactive-Search Rubric Is Positive-Only, Not a 'Never Search' Negative List (Measured Backfire on #39), #52: A Prompt Addition Can Regress the Tool Gate Through Recall, Not Only Precision, recall_user Proactive Trigger Scoped to Current Message, Not Conversation History (#39), #52: Group-Conversation Roster Not Adopted, Collides With core.ts Single-Speaker Rule, #52: Group-Conversation Roster Confirmed REMOVED From Production via Paired A/B; Recall Dropped 1.000->0.722 (p=0.023), CORE_PROMPT_MEMORY_FREE (+1 more)

### Community 90 - "Prompt Length and Voice"
Cohesion: 0.43
Nodes (7): #94 (Architecture): System Prompt Cannot Be Conditioned on What a Turn Will Contain; promptAssembler Runs Before the Model, #94 (Root Cause): Four Prompt Layers Contradict Each Other, Later Layer Wins on Recency, #94: Narrowing a Rule's Scope Made It Dramatically Stronger, Not Weaker (Naming search_web Specifically), #94: A Proportion Is the Wrong Instrument for Trimming a Reply; Replaced With a Countable Paragraph-Structure Rule, Roka Voice: 50-70 Word Response Band, Kaomoji-Only Faces, #94: Trailing Roleplay Paragraph Not Produced by Any Instruction; SPEECH_PROMPT Quotas Cannot Be Satisfied in a Factual Paragraph, #94 (Measured): A Searched Turn Overruns the 50-70 Word Band (69/89/55 Words Measured Live)

### Community 91 - "Streaming Media Prefix Policy"
Cohesion: 0.05
Nodes (45): AddOperationSchema, calendarDateProperties, datedGuildPredicates, EXTRACTION_RESPONSE_SCHEMA, ExtractionOutputSchema, ExtractionSubject, GuildAddOperationSchema, GuildExtractionOp (+37 more)

### Community 92 - "ADK Inline Data Testing"
Cohesion: 0.25
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 94 - "memoryClaimSchema.ts"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 95 - "Gemini Safety Settings"
Cohesion: 0.39
Nodes (6): Gemini Model Choice: gemini-3.5-flash-lite (GA, Free-Tier Verified), Gemini safetySettings Explicit OFF Across Four Harm Categories, Never Rely on Model Defaults, ALLOWED_HARM_BLOCK_THRESHOLDS, buildSafetySettings(), SAFETY_SETTINGS, SUPPORTED_HARM_CATEGORIES

### Community 97 - "README Architecture and Tones"
Cohesion: 0.33
Nodes (5): Expressions & Tones, Message Pipeline, System Architecture, TONE_STYLES, ToneStyle

### Community 99 - "Memory Safety Logic"
Cohesion: 0.13
Nodes (15): TurnJudgment, buildLookedUpBlock(), clip(), decidePrefetch(), JevPrefetchMode, PrefetchContext, PrefetchDecision, PrefetchOutcome (+7 more)

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

### Community 110 - "toolTrigger.retry.test.ts"
Cohesion: 0.16
Nodes (9): Gemini-Overload Fallback: ModelScope Qwen3.5-122B-A10B (Thinking Off), GonkaRouter Excluded, 12/12 Smoke Test, Deliberately Not Done, Gemini-Outage Fallback (Qwen3.5), The Fallback Model, createRokaModel(), modelRouteForRequest, ModelScopeLlm, configState (+1 more)

### Community 135 - "toolTrigger.live.test.ts"
Cohesion: 0.14
Nodes (23): retrieveGuildFacts(), buildFactsEnvelope(), buildOverheardBlock(), isSafeFactScalar(), normalizeOverheardText(), renderOverheardBlock(), GenerateOptions, PrefetchResult (+15 more)

## Ambiguous Edges - Review These
- `Rokabot TRD` → `Second Opinion`  [AMBIGUOUS]
  docs/research/jev-integration.md · relation: conceptually_related_to

## Knowledge Gaps
- **547 isolated node(s):** `$schema`, `enabled`, `indentStyle`, `indentWidth`, `lineWidth` (+542 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Rokabot TRD` and `Second Opinion`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `getDb()` connect `Retry Loop Design History` to `Gacha Buddy System`, `Memory Statistics Visualization`, `Memory Claim Management`, `Game Configuration`, `Memory Extraction Configuration`, `Bot Startup and Shutdown`, `Statistics Query Logic`, `toolTrigger.live.test.ts`, `Reply Splitting and Concurrency`, `Web Search Decisions`, `Metrics and Diagnostics`, `Hangman Game Logic`, `Memory Extraction Test Script`, `Live Gate and Quota Diagnostics`, `SQLite Data Access`, `Response Generation Testing`, `Claim Retrieval Ranking`, `Game Command Handling`, `Channel Session Window`, `Legacy Fact Extractor`, `Config Loading and Claims Rollout`, `Claim Extraction Pipeline`, `Discord Fake Builders`, `Memory Predicates and Privacy`, `Core Architecture and Fallback Tests`, `Extraction Scheduler Tests`, `Benchmark Pacing Logic`, `Timezone Testing`, `Harness Capture Sink`, `Obsidian Export Logic`, `Reminders`, `Buddy Collection UI`, `Database Management and Migration`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Why does `config` connect `Weather Tool` to `Gacha Buddy System`, `Memory Claim Management`, `toolTrigger.live.test.ts`, `Game Configuration`, `Bot Startup and Shutdown`, `Reply Splitting and Concurrency`, `Web Search Decisions`, `Metrics and Diagnostics`, `Hangman Game Logic`, `Memory Extraction Test Script`, `Session Attachment Management`, `Live Gate and Quota Diagnostics`, `SQLite Data Access`, `Response Generation Testing`, `Claim Retrieval Ranking`, `Claim Extraction Pipeline`, `Anime Lookup Tools`, `Discord Fake Builders`, `ModelScope Fallback Adapter`, `In-Flight Attachment Byte Budget`, `Gemini Error Handling`, `Core Architecture and Fallback Tests`, `Harness Capture Sink`, `Obsidian Export Logic`, `LLM Tool Registry`, `Token Budget Management`, `Attachment Type Limits`, `Attachment Token Cost Findings`, `Tone Detection`, `Interaction Metrics Testing`, `Discord Command Registration`, `Model Comparison Testing`, `Utility Tools`, `Message Handling Tests`, `ADK Smoke Testing`, `Streaming Media Prefix Policy`, `Gemini Safety Settings`, `Memory Safety Logic`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Why does `logger` connect `Discord Fake Builders` to `Retry Loop Design History`, `Slash Command UI`, `Discord Output and Sprite Decisions`, `Memory Claim Management`, `toolTrigger.live.test.ts`, `Memory Extraction Configuration`, `Bot Startup and Shutdown`, `Game Configuration`, `Reply Splitting and Concurrency`, `Metrics and Diagnostics`, `Hangman Game Logic`, `Session Attachment Management`, `Response Generation Testing`, `Game Command Handling`, `Channel Session Window`, `Mock Object Factories`, `Anime Lookup Tools`, `ModelScope Fallback Adapter`, `Gemini Error Handling`, `Memory Predicates and Privacy`, `Chart Rendering Logic`, `Core Architecture and Fallback Tests`, `Reminders`, `LLM Tool Registry`, `Token Budget Management`, `Attachment Type Limits`, `Attachment Token Cost Findings`, `Discord Command Registration`, `Stats Command and Error Handling`, `Utility Tools`, `Database Management and Migration`, `Weather Tool`, `Anime Search Logic`, `Memory Safety Logic`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `generateResponse()` (e.g. with `#96: A Valid Review Finding Is Not Evidence a Defect Was Averted; fitCitations Absorbed the Smaller Footer` and `Attachment Bytes Do Not Live in History`) actually correct?**
  _`generateResponse()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `enabled`, `indentStyle` to the rest of the system?**
  _547 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Gacha Buddy System` be split into smaller, more focused modules?**
  _Cohesion score 0.13763440860215054 - nodes in this community are weakly interconnected._