# Graph Report - rokabot  (2026-09-25)

## Corpus Check
- 271 files · ~254,971 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2315 nodes · 5850 edges · 146 communities (113 shown, 33 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 358 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `87c140df`
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
- expressions.ts
- memoryClaimSchema.ts
- Gemini Safety Settings
- session.ts
- README Architecture and Tones
- episodePersistence.ts
- Memory Safety Logic
- Current Time Tool
- Interaction Mocking
- Jev Turn Judgment
- queries.test.ts
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
- deploy Job
- Functional Requirements
- FakeMessage
- emojiReactor.ts
- mediaPrefix.ts
- replayMemoryV2.test.ts
- Prompt-Injection Defense: Structural Inertness Primary, Scalar Validation Defense-in-Depth, saveFact Chokepoint
- promptSafety.ts
- guildFactDates.test.ts
- interactionCreate.memory.test.ts

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
- `Attachment Types and Their Ceilings` --implements--> `GEMINI_SPELLINGS`  [INFERRED]
  docs/trd.md → src/agent/attachmentLimits.ts
- `Attachment Bytes Do Not Live in History` --conceptually_related_to--> `generateResponse()`  [INFERRED]
  docs/trd.md → src/agent/roka.ts
- `#58: turnDeadlineMs Raised 60000->63000 Rather Than Lowering Measured Timeout` --references--> `NUMERIC_BOUNDS`  [INFERRED]
  docs/decisions.md → src/config.ts
- `Command Architecture: Utilities as Implicit ADK Tools, Folklore-Label Footer Disclosure` --rationale_for--> `buildToolFooter()`  [INFERRED]
  docs/decisions.md → src/discord/messageBuilder.ts
- `Phase 9: Rate-Aware Bounded Retries, Busy-Reply Drop, Terminal-Only Session Destroy` --references--> `getRandomBusy()`  [INFERRED]
  docs/decisions.md → src/discord/responses.ts

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

## Communities (146 total, 33 thin omitted)

### Community 0 - "Gacha Buddy System"
Cohesion: 0.14
Nodes (27): Gacha Hatch Gate: Rolling 24h via last_hatch_at, Not Calendar-Day, BuddyRow, DailyBuddyHatch, DailyHatchRow, generateBuddy(), generateName(), generatePersonality(), getDailyHatchRow() (+19 more)

### Community 1 - "Jev and Live Benchmark Setup"
Cohesion: 0.13
Nodes (28): parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, agreement(), buildConfusionMatrix(), buildProbabilityBins(), buildReplayTurn() (+20 more)

### Community 2 - "Retry Loop Design History"
Cohesion: 0.19
Nodes (23): attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow, legalScopes() (+15 more)

### Community 3 - "Slash Command UI"
Cohesion: 0.07
Nodes (33): #19 (PR #92): /chat and /search Retired, Replaced by Single /ask; No Zero-Gemini Factual Path Remains, Command Architecture: Utilities as Implicit ADK Tools, Folklore-Label Footer Disclosure, #29: Games Stay Guild-Only Because Timeout-Completion Path Needs Channel Access, Not the Data Reason Assumed, Regression Tests for Pattern-Matching Fixes Must Be Pinned by Mutation, Not Green Suite, Testing Convention: An Assertion a Mutation Probe Targets Must Sit in Its Own it Block, Phase 17 (Layout B + guild_id Migration) Declined as Unnecessary, #92: Merge Required Explicit Human Authorization, Retiring Commands Is User-Visible Breaking Change, #29: Installation/Context Policy Recorded by Pointer Only; registration.test.ts Is Authoritative (+25 more)

### Community 4 - "Code Formatting Configuration"
Cohesion: 0.05
Nodes (40): useLiteralKeys, files, ignore, formatter, enabled, indentStyle, indentWidth, lineWidth (+32 more)

### Community 5 - "Memory Statistics Visualization"
Cohesion: 0.11
Nodes (36): distinctRememberedUsers(), memoryGrowthSeries(), newClaimsThisMonth(), retrySummary, tokenTotals, topChannels(), topPredicates(), topRememberedMembers() (+28 more)

### Community 6 - "Discord Output and Sprite Decisions"
Cohesion: 0.16
Nodes (19): Testing Convention: A Budget Invariant Needs a Swept Input, Not a Sampled One (#92 Citation Row Boundary), #63: discord.maxMessageLength Ceiling Derived as 4000 - MAX_TOOL_FOOTER_CHARS, #56: Discord Ceiling Is Components V2 TextDisplay Budget (4000), Not content's 2000, #76: docs/prd.md Reply-Split Criterion Now Names Enforcement Point, Not a Number (4th Correction), #96: A Valid Review Finding Is Not Evidence a Defect Was Averted; fitCitations Absorbed the Smaller Footer, clampToBudget(), fitCitations(), sourceHost() (+11 more)

### Community 7 - "Memory Claim Management"
Cohesion: 0.08
Nodes (44): #25 (Unactioned): baseSalience Hardcoded 0.5 for Every Predicate, Importance Not Modelled, Memory, activateClaim(), appendEvidenceInTransaction(), assertClaimInTransaction(), assertSafeValue(), ClaimAssert, ClaimRetract (+36 more)

### Community 8 - "Game Configuration"
Cohesion: 0.12
Nodes (32): Game Timeout Displays Derive From Configured Timeout, Not Hardcoded, assert(), fail(), main(), makeMessage(), pass(), results, TestResult (+24 more)

### Community 9 - "Memory Extraction Configuration"
Cohesion: 0.12
Nodes (22): result(), drainOnce(), finishJob(), inFlightGuilds, inFlightTasks, orderedGuilds(), runJob(), scheduleDrain() (+14 more)

### Community 10 - "Bot Startup and Shutdown"
Cohesion: 0.11
Nodes (28): EpisodeMaintenanceReport, pruneEpisodesAndReembed(), buildEpisodeRecallBlock(), cosineSimilarity(), formatEpisodeRecallBlock(), RecalledEpisode, recallEpisodes(), selectEpisodesWithinBudget() (+20 more)

### Community 11 - "Statistics Query Logic"
Cohesion: 0.10
Nodes (28): activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome, CountByPredicate (+20 more)

### Community 12 - "Discord Test Doubles"
Cohesion: 0.06
Nodes (42): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+34 more)

### Community 13 - "Reply Splitting and Concurrency"
Cohesion: 0.12
Nodes (37): Backtick Escaping Moved From Prompt Into Send Path (responses.ts); Kaomoji Backtick Paired With Later Backtick Broke Markdown, #59: failure_marker May Persist HTTP Status From Closed Allowlist (400/401/403/429/500/503/504), response_events.failure_marker Persists Only Raw errorCode/finishReason, Never errorMessage, #76: splitResponse Has No Sentence-Boundary Logic; Last-Newline/Last-Space/Hard-Cut Fallback Chain, #19 Follow-Up (PR #95): splitResponse Hard-Cut Steps Back Off Trailing High Surrogate to Avoid Splitting Emoji, Testing Convention: A Sweep Is Only as Good as the Shapes Swept Over (ASCII-Only Sweep Missed Emoji Bug), tools_used Recorded on response_events as JSON-Array of Tool Names Only, Concurrency Binding Constraint (+29 more)

### Community 14 - "Memory Privacy and Tenancy"
Cohesion: 0.13
Nodes (15): Architecture (AGENTS.md), discord Config Section, emoji Config Section, games Config Section, gemini Config Section, logging Config Section, memory Config Section, metrics Config Section (+7 more)

### Community 15 - "Web Search Decisions"
Cohesion: 0.11
Nodes (21): #58 CodeRabbit: Aggregate Backoff Cap Fix Goes Silent at R>=5, Deferred to #60, #79: attemptTimedOut Flag Distinguishes Per-Attempt Timeout From Shutdown/Deadline Abort, #79: Backoff Sleep Swaps in Fresh AbortController So Timeout Doesn't Cancel Its Own Retry Delay, #82: failure_diagnostics Table Separate From response_events, Shorter Retention, Records block_side, #60: Guard Tied to Real runTurnWithReliability Loop by a Test Sweeping maxRetries 0-6, Phase 19: Safety Blocks Get One Steered Regeneration Before Static Deflection, Phase 20: Turn Deadline via Admission Control, Attempt 0 Never Gated, Phase 28 Shipped Outside PM Pipeline, Six Decisions Reconstructed Later From Squash Commit (+13 more)

### Community 16 - "Metrics and Diagnostics"
Cohesion: 0.12
Nodes (22): Phase 12: SQLite Metrics Tables (response_events/extraction_events), Never-Throw Writers, Failure Diagnostics Table, GenerateResult, getJevEventStatement(), JevEventInput, JevEventKind, recordJevEvent(), countMemoryEvents() (+14 more)

### Community 18 - "Hangman Game Logic"
Cohesion: 0.26
Nodes (16): addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth(), monthForMonth() (+8 more)

### Community 19 - "Memory Extraction Test Script"
Cohesion: 0.14
Nodes (23): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), resetEpisodeTrackerForTest(), scheduleLull() (+15 more)

### Community 20 - "Development Tooling"
Cohesion: 0.08
Nodes (25): @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, husky, lint-staged, devDependencies, @biomejs/biome, @commitlint/cli (+17 more)

### Community 21 - "Session Attachment Management"
Cohesion: 0.14
Nodes (7): attachmentMarker(), runner, ensureSession(), WindowedSessionService, CapturingLlm, newConversation(), PNG_BASE64

### Community 22 - "Live Gate and Quota Diagnostics"
Cohesion: 0.11
Nodes (23): #92: Citation Renderer Built for /search Migrated to Serve /ask and Mention Reply Paths, Live Benchmark Aborts on Any Turn Not outcome==='ok', Never Scores It, Live-Eval Fixtures Must Not Collide With Seeded World (FTS Term Matching), #132/#141/#145: Live Gate Now Distinguishes Deflection (Abort) From Transient Fallback (Bounded Retry on Fresh Channel), #19: Tool-Trigger Gate Never Exercised a Real Search Result Reaching a Reply; Verified via withSearchCitations Direct Run, toolCallsForRequest, sessionService, describeQuotaFailure() (+15 more)

### Community 23 - "SQLite Data Access"
Cohesion: 0.18
Nodes (16): claim(), asClaim(), asScenario(), evaluateMemoryShadow(), FixtureClaim, loadReplaySet(), MemoryShadowReport, percentile95() (+8 more)

### Community 24 - "Response Generation Testing"
Cohesion: 0.12
Nodes (21): #72: ADK Contract Test Builds Own Runner/LlmAgent/InMemorySessionService, Leaves Harness Seam Untouched, #131/#133: Attachment Bytes Stripped From Session History After the Turn; Cross-Turn Image Recall Removed, #29/181: __setTestRunTurnFactory Consumed Above generateResponse's Call Into runner.runAsync, Probe the Wiring Not the Logic: Five Guards Were Green and Guarding Nothing (#129/#130/#133/#134), generateResponse(), __setTestRunTurnFactory(), TestRunTurn, TestRunTurnFactory (+13 more)

### Community 25 - "Claim Retrieval Ranking"
Cohesion: 0.14
Nodes (28): #25: recall_user No Longer Re-Sorts by lastSeenAt; pinned/salience/last_seen/id Ordering Survives to Cap, Memory Recall: Freshest-First, Bounded 15 Facts, Legacy Tail, ClaimSource, predicateCategory, routeTopics(), ClaimRow, compareRetrieved(), formatGuildFactDate() (+20 more)

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
Cohesion: 0.18
Nodes (19): MAX_SYSTEM_PROMPT_TOKENS=5000 Is a Catastrophe Rail, Not a Latency Constraint, #94 (Architecture): System Prompt Cannot Be Conditioned on What a Turn Will Contain; promptAssembler Runs Before the Model, PR #67: docs/trd.md ToneKey Table Pinned by Test Against Object.keys(TONE_PROMPTS), Prompt System, AssemblerInput, AssemblerInput, assembleSystemPrompt(), buildContextPrompt() (+11 more)

### Community 31 - "TypeScript Build Config"
Cohesion: 0.09
Nodes (22): ES2022, **/*.test.ts, compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib (+14 more)

### Community 32 - "Game Command Handling"
Cohesion: 0.20
Nodes (23): SQLite Database Reference, createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), buildHangmanBody(), handleHangmanGuess(), handleHangmanGuide(), handleHangmanStart() (+15 more)

### Community 33 - "Channel Session Window"
Cohesion: 0.11
Nodes (32): reminders Config Section, #75: Guild Permission Set Documented as Derivation (Operation to Permission), No Line Numbers, #75: Reminders Need Guild Send Messages; Channel-First Delivery, DM Only as Fallback, #55: Reminder Stale-Threshold Guard Uses <=, Not <, Because No Leading Scheduler Tick, assert(), fail(), main(), pass() (+24 more)

### Community 34 - "CI/CD Pipeline Gates"
Cohesion: 0.08
Nodes (26): scripts, build, dev, dev:quiet, export:vault, format, format:check, harness (+18 more)

### Community 35 - "Mock Object Factories"
Cohesion: 0.25
Nodes (16): mocks, createToolCommandHandler(), TOOL_COMMAND_NAMES, handleAnime(), handleRemind(), handleRemindAt(), handleRemindCancel(), handleRemindIn() (+8 more)

### Community 36 - "Legacy Fact Extractor"
Cohesion: 0.11
Nodes (22): argumentsFrom(), liveAdapters(), loadTranscriptLines(), main(), offlineAdapters(), ReplayArgs, ReplayMetrics, transcriptFiles() (+14 more)

### Community 37 - "Config Loading and Claims Rollout"
Cohesion: 0.18
Nodes (13): classifyGeminiFailure: HTTP Status Matched Digit-Anchored, Demoted Below Symbolic Markers, Gemini Function-Call-Ordering 400 Recovered via Destroy+Rehydrate+Retry (session_corrupt), retryBackoffCapMs Deliberately Serves as Both Cumulative Ceiling and Per-Attempt maxMs, #58: Transient-Status Classification Adds 504 Only, Others Unfiled Until Observed, BackoffOptions, classifyGeminiFailure(), classifyMarker(), computeBackoff() (+5 more)

### Community 38 - "Claim Extraction Pipeline"
Cohesion: 0.15
Nodes (28): Claims Tenancy Model, episodePrompt(), EpisodeWriteOp, extractEpisode(), formatEpisodeLine(), getClient(), GuildWriteOperation, hasCompleteVerification() (+20 more)

### Community 39 - "Phase 8 Test Script"
Cohesion: 0.20
Nodes (14): #132/#141: Live Gate's Own Prompt Changes Mid-Run via getLocalHour(); Two Prompt-Affecting Variables Step Together at 05:00, Tone Detector Rebalance: Avoid-Immediate-Repeat, Annoyed Narrowed, Curious Priority 3, #64: Tone Precedence Documented First-Match-Wins, Pinned by Test, TONE_PATTERNS Not Reordered, FR-3: Per-Channel Conversational Memory, FR-5: Tone Detection, ChannelSession, ToneKey, WindowMessage (+6 more)

### Community 40 - "Anime Lookup Tools"
Cohesion: 0.14
Nodes (24): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleResult, getCurrentSeason(), getTodayName() (+16 more)

### Community 41 - "Discord Fake Builders"
Cohesion: 0.24
Nodes (10): RFC-3003, Byte Cap as Duration Proxy, GEMINI_SPELLINGS, geminiMimeType(), sizeLimitFor(), downloadAttachment(), PreparedAttachments, readWithinLimit() (+2 more)

### Community 42 - "ModelScope Fallback Adapter"
Cohesion: 0.13
Nodes (20): fallback Config Section, ModelScope Qwen Fallback, Tech Stack (README), AnswerModel, attachmentKind(), attachmentMarker(), ChatMessage, GeneratedCall (+12 more)

### Community 43 - "In-Flight Attachment Byte Budget"
Cohesion: 0.16
Nodes (11): FR-7: Error Handling, Global In-Flight Byte Budget, Silent SIGKILL Risk, Global In-Flight Attachment Budget, inFlightBytes(), release(), reservationFor(), tryReserve() (+3 more)

### Community 44 - "Guild Permissions and Message Intake"
Cohesion: 0.19
Nodes (6): ModelRoute, afterHedge(), DeferredLlm, loggerMock, Outcome, responses()

### Community 45 - "Media Validation Policies"
Cohesion: 0.20
Nodes (21): attachment_url, Handing Her a File, Audio Intake Recommendation, PDF Intake Recommendation, Video Low Resolution Recommendation, Attachment Types and Their Ceilings, requestCarriesVideo(), ALLOWED_AUDIO_TYPES (+13 more)

### Community 46 - "Gemini Error Handling"
Cohesion: 0.10
Nodes (25): Phase 10: Hybrid Dev Harness (Local Discord Sim + Fake-LLM Seam), modelRouteForRequest, FailureKind, activeAbortControllers, ErrorRecoveryPlugin, fallbackResult(), hasStickyFallback(), markerFrom() (+17 more)

### Community 47 - "Tool Trigger Fixtures"
Cohesion: 0.05
Nodes (50): Two Species of Bad Check: One That Could Not Have Failed, One That Could Fail and Was Aimed Until It Didn't, #162/#163: Merged on 'Checks No Longer Pending' Instead of on the Verdict; main Was Red for a Full Day, #162/#163: A Test That Pins an Incidental of Its Environment (getLocalHour via Intl.DateTimeFormat) Is Testing the Environment, Live-Model Gate Asserts Statistical Verdict (Accuracy Floor + Zero Systematic Failures), Never Per-Case, Live Tool-Trigger Gate: Aggregate Precision/Recall >= 0.80, Binomial-Derived Floors, Two Mutation Probes Missed Predicted Counts for Opposite Reasons: Probe Changed Two Things vs Corpus Couldn't Discriminate, #19: recall_user Gate's 2 False Positives Are Not a Regression From the Rubric (Historical FP Range 6-9), #19 Items 4-7: Measured 3x12 Trials on search-web.jsonl, P=1.000 R=1.000 Zero Tuning; recall_user Adoption Gate Green Twice (+42 more)

### Community 48 - "Memory Predicates and Privacy"
Cohesion: 0.19
Nodes (15): #118: Memory Split by Consent, Not Topic; Told -> Explicit Claim, Inferred -> Passive Claim, #118 Follow-Up: privacyGuard.ts Blocks Contact Details/Money/Government IDs/Credentials on Key-or-Value Signal, assertClaim(), getActiveClaims(), normalizeKey(), sensitiveFactReason, addNickname(), addUser() (+7 more)

### Community 49 - "Chart Rendering Logic"
Cohesion: 0.26
Nodes (14): /stats Redesign: Fixed 30D Window, TW-Style Skeleton, Rule-Based Mood Label, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+6 more)

### Community 50 - "Core Architecture and Fallback Tests"
Cohesion: 0.11
Nodes (19): cleanupExpired(), monitoredChannels, restoreMonitoredChannels(), resetForTest(), stopExtractionScheduler(), waitForInFlightExtractions(), enqueue(), episode() (+11 more)

### Community 51 - "Extraction Scheduler Tests"
Cohesion: 0.21
Nodes (12): #90 (Won't Fix): Rokabot Deployed to NSFW Servers, No exclude_domains List, #19: Do Not Migrate Search Providers; Defect Was Ours (Geo-Poisoning Query Suffix + include_answer:'basic'), #19: include_answer:'basic' Could Leak Hallucinated Self-Identity Into Answer Body, #19: Tavily Credits Priced on search_depth Alone; include_answer Not a Credit Modifier at Any Value, #19: Neither Knob Addresses Recency; days/time_range Measured Net Negative Across 5 News Queries, #19: search_depth Governs Sources, include_answer Governs Synthesis; Neither Substitutes the Other, #19: Tavily GET /usage Counter Lags/Batches, Unusable as Real-Time Spend Meter, recordSearchCitations() (+4 more)

### Community 52 - "Test TypeScript Config"
Cohesion: 0.13
Nodes (14): node, tests/**/*, ./tsconfig.json, vitest/globals, compilerOptions, noEmit, rootDir, types (+6 more)

### Community 53 - "Benchmark Pacing Logic"
Cohesion: 0.17
Nodes (16): Where Rokabot Decides Today, buildNameIndex(), escapeRegex(), isAscii(), MATCH_PRIORITY, MatchKind, NameCandidate, NameIndex (+8 more)

### Community 55 - "Harness Capture Sink"
Cohesion: 0.11
Nodes (19): resetMonitor(), __resetTestRunTurnFactory(), CaptureInput, CaptureKind, CaptureRecord, createCaptureSink(), makeClient(), makeGuild() (+11 more)

### Community 56 - "Obsidian Export Logic"
Cohesion: 0.05
Nodes (47): Correction: Harness and Production Bot Do Not Share a Quota (Different Google Projects), #94 (Blocked): Harness Project's Daily Gemini Quota Exhausted Mid-Adoption, PR #105 Left as Draft, Live Benchmark Pacing Set by RPM With Headroom (12s/2-Call Turn = 10 RPM Against 15 Cap), vitest.live.config.ts testTimeout Now Derives From Pacing Instead of Hardcoded 900s; A Timeout Aborting Before a Verdict Reports Nothing, test:live Gate Added: Three Non-Overlapping Gates (Correctness, Perf, Live-Model), TRIAL_PACING_MS Raise-Only, 12000ms Human-Set Floor Enforced in Code, Zero 429s at 30s Pacing, Browsing Memory in Obsidian, Getting Started (+39 more)

### Community 57 - "Reminders"
Cohesion: 0.22
Nodes (20): handleGachaMention(), statBar(), formatBuddySummary(), formatHatchTimeRemaining(), handleBuddyLeaderboard(), handleBuddyStats(), handleBuddyView(), handleHatch() (+12 more)

### Community 58 - "LLM Tool Registry"
Cohesion: 0.09
Nodes (33): Harness Needed No Code Change to Benchmark a Second Tool; runCaseSet Scores toolsUsed.includes(header.tool) Generically, Phase 11: LLM Tool Suite Trimmed to Used+Wanted Set, #19 Items 4-7: Proactive-Search Rubric Is Positive-Only, Not a 'Never Search' Negative List (Measured Backfire on #39), recall_user Proactive Trigger Scoped to Current Message, Not Conversation History (#39), Tool Footer, flipCoin(), FlipCoinResult, ForgetUserParams (+25 more)

### Community 59 - "Multimodal Intake Research"
Cohesion: 0.25
Nodes (4): runSearchTurn(), ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS

### Community 60 - "Token Budget Management"
Cohesion: 0.32
Nodes (9): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, canAffordAttachments(), chargeTokens(), drain(), lastDrain, remainingTokensThisMinute(), __resetTokenBudgetForTest() (+1 more)

### Community 61 - "Attachment Type Limits"
Cohesion: 0.16
Nodes (20): jev Config Section, #196: Jev (TypeSafe, jev-1.13.0) Takes Pick-From-List Decisions Only (Tone/Referent/Memory), Shadow Mode, Fail-Open, Jev Shadow Mode, fetchWithKeepAlive(), getJevClient(), resetJevClientForTest(), BoundedAlias, boundedAliases() (+12 more)

### Community 62 - "Attachment Token Cost Findings"
Cohesion: 0.31
Nodes (12): #135: For Oversized Media, Take a Byte Prefix Rather Than Transcoding or Refusing (MP3 Frame-Based, MP4 moov-Dependent), #153/#165/#176: countTokens Is a Biased Estimator in Both Directions at Once; Video Inflation Pays for Audio Blindness, #121: Image Tokens Are Flat (1089 for Any Square Image 64x64-1024x1024); Upscale to 512 Is Free, #136: Token Cost Decoupled From File Size, Differs by Modality (Image 1089 Flat, Audio 32/s, Video ~91/s, PDF 560/page), #165: A Comment Naming a Dependency Is a Claim, Not a Check; Fixed by Asserting MAX_ATTACHMENTS Directly, #153/#165: Independent Reproduction Controls for the Method, Not the Specimen; Black-Frames Clips Gave a False Robust Result, PDF Token Cost Measurement, Attachment Token Admission (+4 more)

### Community 63 - "Tone Detection"
Cohesion: 0.14
Nodes (15): FR-9: Docker Deployment, ALLOWED_IMAGE_TYPES Consolidation, Attachment History Stripping, Container Memory Cap Correction, Flash-Lite Modality Verification, Inline Data vs Files API Decision, Multimodal Intake Research, Recommended Attachment Caps (+7 more)

### Community 64 - "Product Requirements"
Cohesion: 0.14
Nodes (9): attachmentOptionName(), createInteraction(), askWith(), metrics, mocks, turnEntryWork, client, createInteraction() (+1 more)

### Community 65 - "Interaction Metrics Testing"
Cohesion: 0.18
Nodes (10): createMessage(), createRateLimiter(), handle(), metrics, mocks, snapshot(), turnEntryWork, assertTurnEntryRejections() (+2 more)

### Community 66 - "CI Deploy Pipeline"
Cohesion: 0.17
Nodes (15): Critical Do-Nots, Project (Rokabot description), Reference Docs (AGENTS.md), Rokabot PRD, Documentation (README index), Jev Integration (Research Doc), Second Opinion, Multimodal Research Doc (+7 more)

### Community 67 - "Discord Command Registration"
Cohesion: 0.28
Nodes (8): emptyResult(), GeocodingResult, getWeather(), GetWeatherParams, GetWeatherResult, OpenMeteoWeather, weatherCodeToCondition(), wmoWeatherCodes

### Community 69 - "Stats Command and Error Handling"
Cohesion: 0.23
Nodes (12): #29/181: Every Non-Guild Channel Gets Its Own Memory Tenant dm:${channelId}, #71 (Parked): 518 Claims/707 Evidence Rows, Zero dm:-Prefixed Tenants Exist, Growth Curve Hasn't Started, Memory Privacy: Predicate Categories May Surface Publicly, Fact Values Never; Guild Isolation Absolute, /stats Headers Plain, Mood Label Is a Stat Line; Bot's Own User ID Excluded, Privacy Amendment: /stats Memory Quote Surfaces Top-Salience Claim Value In-Guild, IGNORABLE_CODES, isIgnorableDiscordError(), handleStatsCommand() (+4 more)

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
Cohesion: 0.25
Nodes (8): ADK_QUIET Environment Variable, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping, roka Service

### Community 78 - "Utility Tools"
Cohesion: 0.33
Nodes (9): loadGetLocalHour(), loadTimezoneModule(), unpinnedHour(), dateString(), dateTimeParts(), getLocalDate(), localDateStartEpoch(), localDateTimeFormatter() (+1 more)

### Community 79 - "Stats Views Tests"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "Message Handling Tests"
Cohesion: 0.21
Nodes (12): #70: findUserByName Non-Global Branch Filters by Tenant Across Three Evidence Sources, #70: Filtering vs Preferring Trade-Off Resolves in Favour of Filtering; factCount:0 Either Way, #195: Who-Is-Who Fixed in Code via Deterministic identityResolver (Mentions -> Display Names -> Nickname Claims), Not Memory Rebuild, #29/181: Memory Tools Fail Closed on Absent-or-'global' Tenant State, Structured WARN Log, Who-Is-Who Resolver, Bounded Retrieval Contract, touchRecalled(), recallUser() (+4 more)

### Community 81 - "Database Management and Migration"
Cohesion: 0.07
Nodes (17): Data Volume Mount, Buddy/Games Table Rebuild via Schema-Driven PRAGMA table_info Copy, evicted, pinClaim(), pruneActiveClaimOverflow(), REMEMBER_TURN, runTurn(), ScriptedLlm (+9 more)

### Community 82 - "searchPrefetchShadow.ts"
Cohesion: 0.21
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "searchPrefetch.ts"
Cohesion: 0.25
Nodes (8): AdmissionResult, admitEpisode(), isTrivial(), normalize(), precheckEpisode(), SENSITIVE_PATTERNS, mocks, ExtractionEpisode

### Community 84 - "messageContent.ts"
Cohesion: 0.27
Nodes (13): ImageAttachment, isSupportedImage(), describeEmbed(), describeForwardedSnapshots(), describePoll(), extractComponentMedia(), extractComponentTexts(), extractCurrentMessageContent() (+5 more)

### Community 85 - "Gemini Failure Handling"
Cohesion: 0.17
Nodes (13): Fallback Model (runbook), ADK Error Delivery Constraint, Attachment Bytes Do Not Live in History, Concurrency & Lifecycle Under Retry, Gemini Failure Taxonomy, Gemini API, Roka Agent (ADK), Session Manager (+5 more)

### Community 86 - "ADK Smoke Testing"
Cohesion: 0.31
Nodes (7): ErrorRecoveryPlugin, main(), results, runQuery(), test(), TestResult, wordCount()

### Community 87 - "Weather Tool"
Cohesion: 0.09
Nodes (18): Configuration (AGENTS.md), Tech Stack (AGENTS.md), #160: Two Config Tests Are Blind in Complementary Directions; Merging Either Way Reopens a Hole, #55: New Cross-Key Checks Warn but Never Clamp (Clamp Would Be No-Op), NUMERIC_BOUNDS: Single Registry for All 46 Numeric Tunables in src/config.ts, Phase 14: Claims Memory Backend Behind config.memory.claimsBackend, Dual-Write Warming, #58: maxLiveRetryWindow and requiredMs Stay Separate Formulas (Different Tails), Task 91: Claims Backend Promoted Default-On Globally, No Per-Guild Canary (+10 more)

### Community 88 - "Anime Search Logic"
Cohesion: 0.22
Nodes (13): activeGames, getLastLetter(), getScores(), handleTimeout(), isGameActive(), loadDictionary(), require, resetTimeout() (+5 more)

### Community 89 - "Who-Is-Who and Recall Trigger"
Cohesion: 0.47
Nodes (5): #52: A Prompt Addition Can Regress the Tool Gate Through Recall, Not Only Precision, #52: Group-Conversation Roster Not Adopted, Collides With core.ts Single-Speaker Rule, #52: Group-Conversation Roster Confirmed REMOVED From Production via Paired A/B; Recall Dropped 1.000->0.722 (p=0.023), CORE_PROMPT_MEMORY_FREE, MEMORY_TOOL_RULES

### Community 90 - "Prompt Length and Voice"
Cohesion: 0.52
Nodes (6): #94 (Root Cause): Four Prompt Layers Contradict Each Other, Later Layer Wins on Recency, #94: Narrowing a Rule's Scope Made It Dramatically Stronger, Not Weaker (Naming search_web Specifically), #94: A Proportion Is the Wrong Instrument for Trimming a Reply; Replaced With a Countable Paragraph-Structure Rule, Roka Voice: 50-70 Word Response Band, Kaomoji-Only Faces, #94: Trailing Roleplay Paragraph Not Produced by Any Instruction; SPEECH_PROMPT Quotas Cannot Be Satisfied in a Factual Paragraph, #94 (Measured): A Searched Turn Overruns the 50-70 Word Band (69/89/55 Words Measured Live)

### Community 91 - "Streaming Media Prefix Policy"
Cohesion: 0.06
Nodes (32): AddOperationSchema, calendarDateProperties, datedGuildPredicates, EXTRACTION_RESPONSE_SCHEMA, ExtractionOutputSchema, ExtractionSubject, GuildAddOperationSchema, GuildExtractionOp (+24 more)

### Community 92 - "ADK Inline Data Testing"
Cohesion: 0.25
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 93 - "expressions.ts"
Cohesion: 0.18
Nodes (9): Buddy Sprite Hosting: Hardcoded CDN URLs, Regenerated Local PNGs Source of Truth, Buddy Sprite Hosting Migrated Catbox to Postimages After Outage, Sharp Pipeline Rule: One .resize() Per Pipeline, Materialize Between Stages, spriteFiles, EXPRESSION_URLS, getExpressionUrl(), lastExpressionByTone, __resetExpressionState() (+1 more)

### Community 94 - "memoryClaimSchema.ts"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 95 - "Gemini Safety Settings"
Cohesion: 0.39
Nodes (6): Gemini Model Choice: gemini-3.5-flash-lite (GA, Free-Tier Verified), Gemini safetySettings Explicit OFF Across Four Harm Categories, Never Rely on Model Defaults, ALLOWED_HARM_BLOCK_THRESHOLDS, buildSafetySettings(), SAFETY_SETTINGS, SUPPORTED_HARM_CATEGORIES

### Community 96 - "session.ts"
Cohesion: 0.22
Nodes (10): abortActiveTurns(), clearSessionErrorCount(), destroyAllSessions(), idleTimers, incrementSessionErrorCount(), rehydrationSuppressed, sessionErrorCounts, suppressSessionRehydration() (+2 more)

### Community 97 - "README Architecture and Tones"
Cohesion: 0.33
Nodes (5): Expressions & Tones, Message Pipeline, System Architecture, TONE_STYLES, ToneStyle

### Community 98 - "episodePersistence.ts"
Cohesion: 0.24
Nodes (7): embedEpisodeText(), EpisodeEmbeddingRole, getEmbeddingClient(), resetEpisodeEmbeddingClientForTest(), persistEpisodeResult(), EpisodeRunResult, mocks

### Community 99 - "Memory Safety Logic"
Cohesion: 0.22
Nodes (11): buildLookedUpBlock(), clip(), decidePrefetch(), JevPrefetchMode, PrefetchContext, PrefetchDecision, PrefetchOutcome, runPrefetchForJudgment() (+3 more)

### Community 100 - "Current Time Tool"
Cohesion: 0.22
Nodes (5): errorText(), isHedgeEligible(), raceForWinner(), RoutedLlm, withAbort()

### Community 102 - "Jev Turn Judgment"
Cohesion: 0.20
Nodes (11): Deliberately Not Done, Jev Design (Per-Feature Modes), Gemini-Outage Fallback (Qwen3.5), GPT-6-Astra, Jev (TypeSafe System One Model), Measured Latency From The Pi, Jev Rollout Plan, @typesafe-ai/sdk (+3 more)

### Community 103 - "queries.test.ts"
Cohesion: 0.18
Nodes (10): activeClaimCount(), episodeCount(), MEMORY_STATS_SQL, outcomeBreakdown(), successRate, insertClaim(), insertGuildClaim(), insertResponse() (+2 more)

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
Cohesion: 0.18
Nodes (6): Gemini-Overload Fallback: ModelScope Qwen3.5-122B-A10B (Thinking Off), GonkaRouter Excluded, 12/12 Smoke Test, The Fallback Model, createRokaModel(), ModelScopeLlm, configState, RequestCall

### Community 135 - "toolTrigger.live.test.ts"
Cohesion: 0.14
Nodes (17): GenerateOptions, PrefetchResult, settlePrefetch(), jevConfig, mocks, applyJevTone(), awaitEpisodeRecallBlock(), awaitTurnPrefetch() (+9 more)

### Community 136 - "deploy Job"
Cohesion: 0.36
Nodes (9): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping), Deployment & Operations (+1 more)

### Community 137 - "Functional Requirements"
Cohesion: 0.22
Nodes (9): FR-10: Graceful Shutdown, FR-2: Mention/Reply Interaction, FR-4: Layered Personality Prompts, Functional Requirements, Problem Statement, Product Requirements Document, Project Objectives, Target Users (+1 more)

### Community 139 - "emojiReactor.ts"
Cohesion: 0.31
Nodes (7): cleanupExpiredCooldowns(), cooldowns, findMatchingRule(), REACTION_RULES, ReactionRule, resetCooldowns(), shouldReact()

### Community 140 - "mediaPrefix.ts"
Cohesion: 0.39
Nodes (6): isobmffAllowsPrefix(), PrefixPolicy, prefixPolicyFor(), STREAMABLE_TYPES, box(), moovDeclaring()

### Community 143 - "promptSafety.ts"
Cohesion: 0.57
Nodes (5): buildFactsEnvelope(), buildOverheardBlock(), isSafeFactScalar(), normalizeOverheardText(), renderOverheardBlock()

### Community 144 - "guildFactDates.test.ts"
Cohesion: 0.40
Nodes (5): GuildFactDate, DateResolver, expectResolved(), loadResolver(), ResolvedDate

### Community 145 - "interactionCreate.memory.test.ts"
Cohesion: 0.40
Nodes (4): MEMORY_TOOL_NAMES, makeInteraction(), mocks, turn()

## Ambiguous Edges - Review These
- `Rokabot TRD` → `Second Opinion`  [AMBIGUOUS]
  docs/research/jev-integration.md · relation: conceptually_related_to

## Knowledge Gaps
- **551 isolated node(s):** `$schema`, `enabled`, `indentStyle`, `indentWidth`, `lineWidth` (+546 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Rokabot TRD` and `Second Opinion`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `getDb()` connect `Retry Loop Design History` to `Gacha Buddy System`, `Memory Statistics Visualization`, `Memory Claim Management`, `Game Configuration`, `Memory Extraction Configuration`, `FakeMessage`, `Statistics Query Logic`, `Bot Startup and Shutdown`, `Reply Splitting and Concurrency`, `toolTrigger.live.test.ts`, `Web Search Decisions`, `Metrics and Diagnostics`, `interactionCreate.memory.test.ts`, `Memory Extraction Test Script`, `SQLite Data Access`, `Claim Retrieval Ranking`, `Game Command Handling`, `Channel Session Window`, `Legacy Fact Extractor`, `Claim Extraction Pipeline`, `Tool Trigger Fixtures`, `Memory Predicates and Privacy`, `Core Architecture and Fallback Tests`, `Benchmark Pacing Logic`, `Harness Capture Sink`, `Obsidian Export Logic`, `Reminders`, `Buddy Collection UI`, `Message Handling Tests`, `Database Management and Migration`, `queries.test.ts`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `config` connect `Weather Tool` to `Gacha Buddy System`, `Slash Command UI`, `Memory Claim Management`, `toolTrigger.live.test.ts`, `Game Configuration`, `Bot Startup and Shutdown`, `emojiReactor.ts`, `Reply Splitting and Concurrency`, `Hangman Game Logic`, `Memory Extraction Test Script`, `Live Gate and Quota Diagnostics`, `SQLite Data Access`, `Response Generation Testing`, `Claim Retrieval Ranking`, `Channel Session Window`, `Mock Object Factories`, `Claim Extraction Pipeline`, `Anime Lookup Tools`, `Discord Fake Builders`, `ModelScope Fallback Adapter`, `In-Flight Attachment Byte Budget`, `Gemini Error Handling`, `Core Architecture and Fallback Tests`, `Harness Capture Sink`, `Obsidian Export Logic`, `LLM Tool Registry`, `Token Budget Management`, `Attachment Type Limits`, `Attachment Token Cost Findings`, `Product Requirements`, `Discord Command Registration`, `Model Comparison Testing`, `Utility Tools`, `Database Management and Migration`, `searchPrefetch.ts`, `ADK Smoke Testing`, `Anime Search Logic`, `Gemini Safety Settings`, `session.ts`, `episodePersistence.ts`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `logger` connect `Discord Fake Builders` to `Retry Loop Design History`, `Slash Command UI`, `Discord Output and Sprite Decisions`, `Memory Claim Management`, `toolTrigger.live.test.ts`, `Memory Extraction Configuration`, `Bot Startup and Shutdown`, `emojiReactor.ts`, `Reply Splitting and Concurrency`, `Memory Privacy and Tenancy`, `Metrics and Diagnostics`, `Response Generation Testing`, `Game Command Handling`, `Channel Session Window`, `Mock Object Factories`, `Anime Lookup Tools`, `ModelScope Fallback Adapter`, `Gemini Error Handling`, `Memory Predicates and Privacy`, `Chart Rendering Logic`, `Core Architecture and Fallback Tests`, `Extraction Scheduler Tests`, `Reminders`, `LLM Tool Registry`, `Token Budget Management`, `Attachment Type Limits`, `Attachment Token Cost Findings`, `Discord Command Registration`, `Stats Command and Error Handling`, `Utility Tools`, `Database Management and Migration`, `Weather Tool`, `Anime Search Logic`, `expressions.ts`, `session.ts`, `episodePersistence.ts`, `Memory Safety Logic`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `generateResponse()` (e.g. with `#96: A Valid Review Finding Is Not Evidence a Defect Was Averted; fitCitations Absorbed the Smaller Footer` and `Attachment Bytes Do Not Live in History`) actually correct?**
  _`generateResponse()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `enabled`, `indentStyle` to the rest of the system?**
  _551 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Gacha Buddy System` be split into smaller, more focused modules?**
  _Cohesion score 0.14482758620689656 - nodes in this community are weakly interconnected._