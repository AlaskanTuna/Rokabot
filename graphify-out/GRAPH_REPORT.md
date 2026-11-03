# Graph Report - native-search  (2026-11-03)

## Corpus Check
- 701 files · ~592,522 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 30 file(s) not represented in the graph (top: (none) 13, .jsonl 11, .rss 2)

## Summary
- 5702 nodes · 16106 edges · 233 communities (191 shown, 42 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 616 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `07306fb6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- buddy.ts
- jevReplay.ts
- qwenWatch.ts
- memoryEpisodeStore.ts
- Project Linting Config
- gacha.ts
- messageBuilder.ts
- getDb
- test-features.ts
- scheduler.ts
- profiles.ts
- queries.ts
- discordDoubles.ts
- messageCreate.ts
- discord.js
- tools/index.ts
- views.ts
- replies/service.ts
- guildFactDates.ts
- memoryEpisodeReplay.ts
- Dev Tooling Dependencies
- WindowedSessionService
- Sidebar.tsx
- memoryShadow.ts
- extractor.ts
- retriever.ts
- run.ts
- Project Dependencies
- Secrets.tsx
- RateLimiter
- PackFileScreen.tsx
- TypeScript Configuration
- turnMedia.ts
- YamlForm.tsx
- Build Dev Scripts
- recall-calibration-sample.ts
- src/games/shiritori.ts
- YouTube Media Stream
- searchNativeAnthropic.test.ts
- promptGolden.test.ts
- getAnimeSchedule.ts
- worst-case.ts
- fallbackModel.ts
- pack.ts
- configShared.tsx
- discord/attachments.ts
- roka.ts
- generateObject.ts
- character/schema.ts
- Activity Visualization Charts
- parts.tsx
- Inline Data Contract
- TypeScript Build Config
- handler.ts
- gameCommands.ts
- identityResolver.ts
- obsidianExport.ts
- config
- memoryTools.test.ts
- Moods.tsx
- reportCommand.ts
- judgments.ts
- digest.ts
- Functional Requirements
- Speech-to-Text HTTP Server
- socialPosts/service.ts
- serve.ts
- parsers.ts
- Design System Documentation
- vitest
- Prefetch Measurement Tools
- package.json
- Deployment
- File Upload Handling
- interactionCreate.metrics.test.ts
- anthropicMain.eval.test.ts
- roka Service
- toolTriggerScoring.ts
- probe-llm-profile.test.ts
- views.test.ts
- watch.ts
- logger.ts
- Search Prefetch Reporting
- hiddenRetractions.test.ts
- messageContent.ts
- DiscordPreview.tsx
- src/index.ts
- config.ts
- Social Viewing Research
- ToneKey
- embeddings/client.ts
- extractionSchema.ts
- test-chat.ts
- local.test.ts
- memoryClaimSchema.ts
- anthropicLlm.ts
- WAV File Validation
- load.ts
- predicates.ts
- ASR Sidecar Service
- app.test.ts
- renderComponent
- timezone.ts
- Rokabot TRD
- duration.ts
- turnMedia.test.ts
- Commit Linting Rules
- media.ts
- Rokabot Character Data
- Speech Budget Management
- markdown.ts
- redditFeed.ts
- replyShape.ts
- Documentation Style Guide
- Git Commit Standards
- Coding Best Practices
- secrets.ts
- promptSafety.ts
- Audio Decoding Tests
- recall.ts
- recall-calibration.test.ts
- emojiReactor.ts
- database.ts
- escapeHtml
- SocialPlatform
- transcribe.test.ts
- Speech Server Engines
- Linting Configuration
- HTTP Request Handler
- probe-llm-profile.ts
- test-gemini-ga-compare.ts
- Speech Transcription Processing
- Speech Parsing Tests
- textEdit.ts
- searchPrefetch.test.ts
- linesGolden.test.ts
- CI/CD Deployment Pipeline
- ref_node_fs
- estimateTokens
- Text Cleaning Utilities
- roka.test.ts
- test-phase8.ts
- UI TypeScript Configuration
- System Architecture
- agent/attachments.ts
- anthropicLlm.test.ts
- yamlEdit.ts
- render.ts
- Configuration
- persona-replay.ts
- turnContext.ts
- privacy
- app.ts
- interactionCreate.memory.test.ts
- Memory
- updateNotifier.ts
- Character Harness Research
- Raspberry Pi Command Reference
- recall-calibration-thresholds.ts
- Characters
- Jev Judgments
- Product
- API and Security Tests
- Models
- Claims Memory Architecture
- main.test.ts
- Deployment and Setup Guide
- Auto-Deploy Platforms
- Roka Voice v3: Restoring Variety on Haiku
- queries.test.ts
- persona-report.ts
- Embedding Project Config
- fingerprint.ts
- Reply Shape
- searchNativeGemini.test.ts
- Features
- Embedding Service Docs
- mediaDigestStore.ts
- HeaderUtilities.tsx
- models.spec.ts
- playwright.config.ts
- toolTrigger.ts
- yamlText.ts
- Speech Pattern Documentation
- Persona Identity Definition
- Embedding Smoke Tests
- markdownGuard.ts
- Changelog
- Character Packs
- Audio Video Documentation
- Release Configuration
- Question Answering Documentation
- Speaking Style Prompts
- Annoyed Mood Prompt
- Competitive Mood Prompt
- Confident Mood Prompt
- Curious Mood Prompt
- Domestic Mood Prompt
- Flustered Mood Prompt
- Mischievous Mood Prompt
- Nostalgic Mood Prompt
- Playful Mood Prompt
- Sincere Mood Prompt
- Sleepy Mood Prompt
- Tender Mood Prompt
- Hard Boundaries Documentation
- Image Handling Documentation
- Safety Steering Prompts
- Situation Context Documentation
- Tool Usage Documentation
- Image Pruning Script
- Calm Mood Prompt
- workspace.ts
- fixtures.ts
- measure.ts
- replyBlocks.ts
- UI Styling Assets
- socialPosts/types.ts
- Media Watching
- reports.ts
- Template Speaking Prompts
- Template Calm Mood
- Cheerful Mood Prompt
- Persona Identity Prompts
- gemini.test.ts
- discord/client.ts

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 247 edges
2. `vitest` - 239 edges
3. `config` - 119 edges
4. `logger` - 79 edges
5. `createMessageHandler()` - 54 edges
6. `closeDb()` - 53 edges
7. `generateResponse()` - 51 edges
8. `discord.js` - 50 edges
9. `createInteractionHandler()` - 48 edges
10. `assertClaim()` - 46 edges

## Surprising Connections (you probably didn't know these)
- `Reading Validation Errors` --references--> `faces()`  [INFERRED]
  docs/guide/characters.md → scripts/persona-report.ts
- `Faces` --references--> `faces()`  [INFERRED]
  docs/trd/prompt-engine.md → scripts/persona-report.ts
- `Token Admission` --references--> `prepareAttachments()`  [INFERRED]
  docs/trd/media.md → src/agent/attachments.ts
- `Client` --references--> `getJevClient()`  [INFERRED]
  docs/trd/jev.md → src/agent/jev/client.ts
- `Turn Events` --references--> `answer()`  [INFERRED]
  docs/trd/jev.md → src/agent/llm/__tests__/anthropicLlm.test.ts

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

## Communities (233 total, 42 thin omitted)

### Community 0 - "buddy.ts"
Cohesion: 0.12
Nodes (31): BuddyRow, DailyBuddyHatch, DailyHatchRow, generateBuddy(), generateName(), generatePersonality(), getDailyHatchRow(), getStreak() (+23 more)

### Community 1 - "jevReplay.ts"
Cohesion: 0.13
Nodes (25): parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, agreement(), buildConfusionMatrix(), buildProbabilityBins(), buildReplayTurn() (+17 more)

### Community 2 - "qwenWatch.ts"
Cohesion: 0.10
Nodes (23): binOf(), ChatCompletion, ContentPart, promptFor(), quoted(), QwenFrame, QwenWatchInput, QwenWatchResult (+15 more)

### Community 3 - "memoryEpisodeStore.ts"
Cohesion: 0.07
Nodes (48): better-sqlite3, GEMINI_FINGERPRINT, LOCAL_FINGERPRINT, localVector(), buildEpisodeRecallBlock(), formatEpisodeRecallBlock(), RecalledEpisode, recallEpisodes() (+40 more)

### Community 4 - "Project Linting Config"
Cohesion: 0.05
Nodes (39): useLiteralKeys, css, formatter, files, ignore, formatter, enabled, indentStyle (+31 more)

### Community 5 - "gacha.ts"
Cohesion: 0.14
Nodes (32): handleGachaMention(), statBar(), buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount(), handleBuddyCollection(), formatBuddySummary() (+24 more)

### Community 6 - "messageBuilder.ts"
Cohesion: 0.07
Nodes (41): clampToBudget(), fitCitations(), sourceHost(), sourceLabel(), getExpressionUrl(), lastExpressionByTone, __resetExpressionState(), TONE_EXPRESSIONS (+33 more)

### Community 7 - "getDb"
Cohesion: 0.07
Nodes (78): Claims Tenancy Model, attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow (+70 more)

### Community 8 - "test-features.ts"
Cohesion: 0.16
Nodes (27): assert(), fail(), pass(), results, TestResult, buildHangmanBody(), handleHangmanGuess(), handleHangmanStart() (+19 more)

### Community 9 - "scheduler.ts"
Cohesion: 0.05
Nodes (61): Memory, persistEpisodeResult(), ABORT_CODES, classifyExtractionError(), ExtractionErrorClassification, JevUnavailableError, SHUTDOWN_SENSITIVE_NAMES, TRANSIENT_HTTP_STATUSES (+53 more)

### Community 10 - "profiles.ts"
Cohesion: 0.04
Nodes (51): Entry Options, Profile Facts, Tested Providers, @google/adk, BudgetDenial, COMPATIBLE_DEFAULTS, compatibleProfile(), MODEL_PROFILES (+43 more)

### Community 11 - "queries.ts"
Cohesion: 0.10
Nodes (28): activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome, CountByPredicate (+20 more)

### Community 12 - "discordDoubles.ts"
Cohesion: 0.04
Nodes (48): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+40 more)

### Community 13 - "messageCreate.ts"
Cohesion: 0.09
Nodes (44): Concurrency Binding Constraint, isMonitored(), markActive(), asksAboutReplies(), withReplyOutcomes(), withSearchCitations(), startTurnEntryWork(), activeRequests (+36 more)

### Community 14 - "discord.js"
Cohesion: 0.09
Nodes (43): FR-1: Slash Command Interaction, Features, discord.js, ref_discordjs_builders, AnimeResult, JikanAnimeEntry, JikanResponse, searchAnime() (+35 more)

### Community 15 - "tools/index.ts"
Cohesion: 0.06
Nodes (46): Tool Footer, flipCoin(), FlipCoinResult, ForgetUserParams, GetAnimeScheduleParams, cityToTimezone, getCurrentTime(), GetCurrentTimeFound (+38 more)

### Community 16 - "views.ts"
Cohesion: 0.14
Nodes (30): episodeCount(), memoryGrowthSeries(), newClaimsThisMonth(), retrySummary, tokenTotals, topChannels(), topPredicates(), topRememberedMembers() (+22 more)

### Community 17 - "replies/service.ts"
Cohesion: 0.23
Nodes (27): array(), nonNegativeInteger(), bilibiliAid(), fetchBilibiliReplies(), fetchBlueskyReplies(), BROWSER_USER_AGENT, compactReplyText(), failed() (+19 more)

### Community 18 - "guildFactDates.ts"
Cohesion: 0.17
Nodes (21): GuildFactDate, addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth() (+13 more)

### Community 19 - "memoryEpisodeReplay.ts"
Cohesion: 0.06
Nodes (50): ref_node_perf_hooks, argumentsFrom(), estimatedTokens(), inputText(), liveAdapters(), measure(), loadTranscriptLines(), main() (+42 more)

### Community 20 - "Dev Tooling Dependencies"
Cohesion: 0.07
Nodes (29): devDependencies, @axe-core/playwright, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, diff, @fontsource-variable/geist, @fontsource-variable/geist-mono (+21 more)

### Community 21 - "WindowedSessionService"
Cohesion: 0.13
Nodes (8): Bytes Do Not Stay in History, Source Files, attachmentMarker(), isStrippable(), WindowedSessionService, CapturingLlm, newConversation(), PNG_BASE64

### Community 22 - "Sidebar.tsx"
Cohesion: 0.11
Nodes (36): App(), Ambient(), BrandMark(), checkedLabel(), follow(), initialCollapsed(), LogoToggle(), MarkGlyph() (+28 more)

### Community 23 - "memoryShadow.ts"
Cohesion: 0.20
Nodes (14): asClaim(), asScenario(), evaluateMemoryShadow(), FixtureClaim, loadReplaySet(), MemoryShadowReport, percentile95(), REPLAY_PATH (+6 more)

### Community 24 - "extractor.ts"
Cohesion: 0.07
Nodes (41): episodeObservedAt(), episodePrompt(), EpisodeWriteOp, ExtractedEpisode, extractEpisode(), formatEpisodeLine(), GuildWriteOperation, hasCompleteVerification() (+33 more)

### Community 25 - "retriever.ts"
Cohesion: 0.09
Nodes (39): ClaimSource, GuildMemoryClaim, touchRecalled(), routeTopics(), ClaimRow, compareRetrieved(), formatGuildFactDate(), getActiveClaims() (+31 more)

### Community 26 - "run.ts"
Cohesion: 0.07
Nodes (43): resetMonitor(), resetForTest(), stopExtractionScheduler(), __resetTestRunTurnFactory(), CaptureInput, CaptureKind, CaptureRecord, CaptureSink (+35 more)

### Community 27 - "Project Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @anthropic-ai/sdk, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml (+7 more)

### Community 28 - "Secrets.tsx"
Cohesion: 0.09
Nodes (42): ActionChipProps, Button(), ButtonProps, ButtonStyle, IconButton(), IconButtonProps, STYLES, Dialog() (+34 more)

### Community 29 - "RateLimiter"
Cohesion: 0.13
Nodes (12): FR-6: Rate Limiting, Discord Gateway Layer, RateLimiterConfig, RPM-Budget Accounting, A Turn Reserves the Calls It May Make, modelCallsForRequest, rateLimiter(), client (+4 more)

### Community 30 - "PackFileScreen.tsx"
Cohesion: 0.08
Nodes (52): react, DiffView(), Band, bandFor(), MEMORY, PanelTab, PreviewPanel(), PreviewPanelProps (+44 more)

### Community 31 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "turnMedia.ts"
Cohesion: 0.10
Nodes (42): Coverage Plan, geminiMimeType(), isStreamedUpload(), durationFromTokens(), equalBins(), estimateMediaTokens(), focusWindow(), FPS_LADDER (+34 more)

### Community 33 - "YamlForm.tsx"
Cohesion: 0.14
Nodes (37): cleanComment(), Context, Group(), helpFor(), humanize(), isRecord(), MapBody(), MapFields() (+29 more)

### Community 34 - "Build Dev Scripts"
Cohesion: 0.06
Nodes (35): scripts, build, character, dev, dev:quiet, export:vault, format, format:check (+27 more)

### Community 35 - "recall-calibration-sample.ts"
Cohesion: 0.14
Nodes (23): chunk(), loadShadowRows(), main(), MATCH_WINDOW_MS, matchTurnMessage(), mean(), median(), PairLine (+15 more)

### Community 36 - "src/games/shiritori.ts"
Cohesion: 0.14
Nodes (24): ref_node_module, main(), makeMessage(), src_games_data_wordlist, activeGames, destroyAllGames(), endGame(), getLastLetter() (+16 more)

### Community 37 - "YouTube Media Stream"
Cohesion: 0.19
Nodes (19): metadata, realisticFormats, AudioFormat, audioFormats(), directHttpsUrl(), finiteNumber(), hasCodec(), headersOf() (+11 more)

### Community 38 - "searchNativeAnthropic.test.ts"
Cohesion: 0.06
Nodes (27): Failure Classification, Hedge, ADK Error Delivery Constraint, At a Glance, Configuration, Failure Kinds, Model Switch, Native Time Budget (+19 more)

### Community 39 - "promptGolden.test.ts"
Cohesion: 0.07
Nodes (34): FR-3: Per-Channel Conversational Memory, Attachment History Stripping, ChannelSession, At a Glance, Golden Test, Mood Detection, Prompt Engine, Safety Ladder (+26 more)

### Community 40 - "getAnimeSchedule.ts"
Cohesion: 0.09
Nodes (30): Request Slots and Daily Units, BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleResult, getCurrentSeason() (+22 more)

### Community 41 - "worst-case.ts"
Cohesion: 0.12
Nodes (32): sandboxPaths(), appendToBlock(), applyDataset(), applyEmpty(), applyOne(), applyWorst(), base64url(), blockRange() (+24 more)

### Community 42 - "fallbackModel.ts"
Cohesion: 0.05
Nodes (37): Deliberately Not Done, Gemini-Outage Fallback (Qwen3.5), The Fallback Model, Logs, Pinning, Routing, Sticky Window, Switch (+29 more)

### Community 43 - "pack.ts"
Cohesion: 0.12
Nodes (46): createApp(), CHECK_SCRIPT, checkConfig(), ConfigPaths, configProblem(), readConfig(), setTopLevelValue(), validateConfig() (+38 more)

### Community 44 - "configShared.tsx"
Cohesion: 0.09
Nodes (42): FOCUS_ORDER, Route, DiscordScreen(), ELSEWHERE, OWN, SCREENS, LimitsScreen(), BLOCKS (+34 more)

### Community 45 - "discord/attachments.ts"
Cohesion: 0.05
Nodes (65): RFC-3003, attachment_url, Handing Her a File, ALLOWED_IMAGE_TYPES Consolidation, Audio Intake Recommendation, Byte Cap as Duration Proxy, Container Memory Cap Correction, Multimodal Research Doc (+57 more)

### Community 46 - "roka.ts"
Cohesion: 0.07
Nodes (42): A Spent Day Is Not a Spent Minute, The Retry Loop, A Spent Day Is Not a Spent Minute, BackoffOptions, classifyGeminiFailure(), classifyMarker(), computeBackoff(), DEFAULT_MAX_BACKOFF_MS (+34 more)

### Community 47 - "generateObject.ts"
Cohesion: 0.06
Nodes (43): Background Jobs, @google/genai, zod, adapterFor(), adapters, attempt(), BackgroundWorkload, callUsage() (+35 more)

### Community 48 - "character/schema.ts"
Cohesion: 0.09
Nodes (24): CharacterFile, characterFileSchema, color, command, differ, ending, hour, linesFileSchema (+16 more)

### Community 49 - "Activity Visualization Charts"
Cohesion: 0.26
Nodes (14): @napi-rs/canvas, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+6 more)

### Community 50 - "parts.tsx"
Cohesion: 0.09
Nodes (50): lucide-react, Badge(), BadgeTone, TONES, Field(), fieldClass(), FieldProps, Option (+42 more)

### Community 51 - "Inline Data Contract"
Cohesion: 0.29
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 52 - "TypeScript Build Config"
Cohesion: 0.22
Nodes (8): ./tsconfig.json, compilerOptions, noEmit, rootDir, types, exclude, extends, include

### Community 53 - "handler.ts"
Cohesion: 0.06
Nodes (39): @huggingface/transformers, @types/node, dependencies, @huggingface/transformers, devDependencies, @types/node, typescript, engines (+31 more)

### Community 54 - "gameCommands.ts"
Cohesion: 0.23
Nodes (20): createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleBuddyLeaderboard(), handleHangmanGuide(), HANGMAN_COLORS, handleLeaderboard(), buildGameContainer() (+12 more)

### Community 55 - "identityResolver.ts"
Cohesion: 0.11
Nodes (25): Who-Is-Who Resolver, Bounded Retrieval Contract, buildNameIndex(), escapeRegex(), isAscii(), MATCH_PRIORITY, MatchKind, NameCandidate (+17 more)

### Community 56 - "obsidianExport.ts"
Cohesion: 0.13
Nodes (20): Browsing Memory in Obsidian, Getting Started, npm run test:live Gate, PAST_FACT_MARKER, ActiveClaimSubject, ActiveGuildSubject, ExportedClaim, ExportedGuildClaim (+12 more)

### Community 57 - "config"
Cohesion: 0.06
Nodes (59): Free-Tier TPM Ceiling Measurement, RateLimiterConfig, The Per-Minute Token Budget, The Per-Minute Token Budget, Turn Admission, The Two Limiters Bound Their Windows Differently, acquireSlot(), backgroundShareSpent() (+51 more)

### Community 58 - "memoryTools.test.ts"
Cohesion: 0.14
Nodes (20): geminiVector(), RecallInput, RecallItem, seedMedia(), seedMedia(), axis(), corrupt(), input() (+12 more)

### Community 59 - "Moods.tsx"
Cohesion: 0.11
Nodes (37): estimateTokens(), TextEditor, TextEditorHandle, TextEditorProps, readYaml(), inMood(), addMoodText(), dependents() (+29 more)

### Community 60 - "reportCommand.ts"
Cohesion: 0.07
Nodes (36): AssemblerInput, At a Glance, Data Models, Data Models and Storage, Outbound Model Request, Source Files, ToneKey, isAllowedDiscordCdnUrl() (+28 more)

### Community 61 - "judgments.ts"
Cohesion: 0.08
Nodes (41): jev Config Section, Jev Design (Per-Feature Modes), Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk, Jev Shadow Mode, Jev Judgments, Jev Memory Admission (+33 more)

### Community 62 - "digest.ts"
Cohesion: 0.12
Nodes (30): boundedString(), coverageLine(), cutAtWord(), formatClock(), frameInterval(), framesLine(), HEARD_LINES, isRecord() (+22 more)

### Community 63 - "Functional Requirements"
Cohesion: 0.11
Nodes (20): FR-10: Graceful Shutdown, FR-2: Mention/Reply Interaction, FR-7: Error Handling, FR-8: Response Formatting, FR-9: Docker Deployment, Functional Requirements, Problem Statement, Product Requirements Document (+12 more)

### Community 64 - "Speech-to-Text HTTP Server"
Cohesion: 0.13
Nodes (17): Speech-to-text HTTP sidecar: Silero VAD -> SenseVoice language ID -> Moonshine…, collections, http_server, io, json, math, numpy, os (+9 more)

### Community 65 - "socialPosts/service.ts"
Cohesion: 0.09
Nodes (22): Process Lifecycle, endpoint(), resolveBlueskyDid(), createSocialPostViewer(), failure(), initializeSocialPosts(), isAbort(), isYtDlpPlatform() (+14 more)

### Community 66 - "serve.ts"
Cohesion: 0.11
Nodes (13): item(), lists(), ORDER, row(), ENV_TEXT, REPO, SANDBOX, app (+5 more)

### Community 67 - "parsers.ts"
Cohesion: 0.16
Nodes (33): base(), BlueskyBlob, blueskyQuote(), capped(), compact(), date(), finiteNumber(), headers() (+25 more)

### Community 68 - "Design System Documentation"
Cohesion: 0.07
Nodes (27): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Action Chips, Badges (+19 more)

### Community 69 - "vitest"
Cohesion: 0.11
Nodes (30): vitest, mocks, questions, ReplyFetchContext, hostMatches(), HOSTS, parseSocialPostUrl(), platformForHost() (+22 more)

### Community 70 - "Prefetch Measurement Tools"
Cohesion: 0.21
Nodes (9): main(), MeasurementAnomaly, Options, parseOptions(), percentile(), PrefetchMeasurementCase, PrefetchMeasurementSummary, PrefetchMeasurementTrial (+1 more)

### Community 71 - "package.json"
Cohesion: 0.07
Nodes (28): description, engines, node, typescript, main, name, type, version (+20 more)

### Community 72 - "Deployment"
Cohesion: 0.14
Nodes (17): At a Glance, Bot Image (`Dockerfile`), Deploy on the Pi, Deployment, Docker Build, Docker Compose, Image Tags, Jobs (+9 more)

### Community 73 - "File Upload Handling"
Cohesion: 0.17
Nodes (9): countedBody(), deleteFile(), FileResource, getFile(), sleep(), streamToFiles(), UploadedFile, videoDurationSec() (+1 more)

### Community 74 - "interactionCreate.metrics.test.ts"
Cohesion: 0.08
Nodes (18): ref_node_async_hooks, outcomeForTurn, recordReplyOutcome(), ReplyOutcome, citationsForTurn, SearchCitation, NAME_MENTION_REGEX, metrics (+10 more)

### Community 75 - "anthropicMain.eval.test.ts"
Cohesion: 0.20
Nodes (15): asObject(), asObjects(), chunkLabel(), componentDetails(), walk(), isComponentsV2Payload(), PayloadObject, renderEmbeds() (+7 more)

### Community 76 - "roka Service"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 77 - "toolTriggerScoring.ts"
Cohesion: 0.09
Nodes (30): CASE_SETS, fixturePath, header, rememberFixturePath, searchWebFixturePath, temporaryDirectories, testCase, CaseSetRun (+22 more)

### Community 78 - "probe-llm-profile.test.ts"
Cohesion: 0.16
Nodes (11): dotenv, isSupportedProfile(), main(), parseProbeArgs(), renderProbeReport(), resolveProbeKey(), ANSWER, OBJECT (+3 more)

### Community 79 - "views.test.ts"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "watch.ts"
Cohesion: 0.11
Nodes (16): HalfWatch, mocks, CoveragePlan, elapsedSince(), getClient(), mediaPart(), messageOf(), reasonFor() (+8 more)

### Community 81 - "logger.ts"
Cohesion: 0.04
Nodes (80): Evidence, Footer, @anthropic-ai/sdk, callUsage(), geminiUsage(), SEARCH_EXCERPTS_UNTRUSTED_DATA_LABEL, buildLookedUpBlock(), clip() (+72 more)

### Community 82 - "Search Prefetch Reporting"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "hiddenRetractions.test.ts"
Cohesion: 0.08
Nodes (31): Extraction, Main-Model Judge, Memory Judge, Memory Judgments, AdmissionResult, admitEpisode(), isTrivial(), normalize() (+23 more)

### Community 84 - "messageContent.ts"
Cohesion: 0.10
Nodes (32): ImageAttachment, isSupportedMedia(), describeEmbed(), describeForwardedSnapshots(), describePoll(), embedMatchesSocialPost(), extractComponentMedia(), walk() (+24 more)

### Community 85 - "DiscordPreview.tsx"
Cohesion: 0.12
Nodes (30): Problem, lineForPath(), splitPath(), firstLine(), lineFor(), ProblemBanner(), ProblemBannerProps, screenName() (+22 more)

### Community 86 - "src/index.ts"
Cohesion: 0.11
Nodes (23): Bot Management, URL and Extractor Safety, cleanupExpired(), monitoredChannels, restoreMonitoredChannels(), pruneEpisodesAndReembed(), startExtractionScheduler(), waitForInFlightExtractions() (+15 more)

### Community 87 - "config.ts"
Cohesion: 0.04
Nodes (62): Configuration (AGENTS.md), Source Files, At a Glance, Legacy Config, Model Profiles, Models, Request Shaping, Resolution (+54 more)

### Community 88 - "Social Viewing Research"
Cohesion: 0.29
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "ToneKey"
Cohesion: 0.10
Nodes (33): FR-4: Layered Personality Prompts, FR-5: Tone Detection, Expressions & Tones, Message Pipeline, Prompt System, System Architecture, AssemblerInput, ToneKey (+25 more)

### Community 90 - "embeddings/client.ts"
Cohesion: 0.21
Nodes (10): EmbeddingResult, EmbeddingRole, FACTORIES, getEmbeddingClient(), resetEmbeddingClientForTest(), factories, state, embedEpisodeText() (+2 more)

### Community 91 - "extractionSchema.ts"
Cohesion: 0.03
Nodes (60): AddOperationSchema, calendarDateProperties, DATED_GUILD_PREDICATES, DatedGuildAddOperationSchema, DatedGuildPredicateId, datedGuildPredicates, DatedGuildPredicateSchema, DatedGuildUpdateOperationSchema (+52 more)

### Community 92 - "test-chat.ts"
Cohesion: 0.13
Nodes (18): ref_node_readline, ref_node_util, args, handleInput(), htmlIndex, main(), previewMessages, username (+10 more)

### Community 93 - "local.test.ts"
Cohesion: 0.26
Nodes (10): fakeFetch(), FetchCall, hangingFetch(), json(), logger, reply(), settings, vector384 (+2 more)

### Community 94 - "memoryClaimSchema.ts"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 95 - "anthropicLlm.ts"
Cohesion: 0.05
Nodes (81): Provider IDs, Block, classifyAnthropicError(), create(), Effort, ImageMediaType, markerBlock(), mediaBlock() (+73 more)

### Community 96 - "WAV File Validation"
Cohesion: 0.38
Nodes (5): read_wav(), WavError, make_wav(), ReadWavTest, ValueError

### Community 97 - "load.ts"
Cohesion: 0.09
Nodes (30): Character, deepFreeze(), escapeRegExp(), inHours(), loadCharacter(), expand(), prompt(), readYaml() (+22 more)

### Community 98 - "predicates.ts"
Cohesion: 0.09
Nodes (33): confidenceForEvidence(), baseSalienceOf(), cardinalityOf(), GuildPredicateId, isKnownPredicate(), isMoveTarget(), MemoryPredicateId, normalizePredicate() (+25 more)

### Community 99 - "ASR Sidecar Service"
Cohesion: 0.22
Nodes (8): API, ASR Sidecar, Build and Run, Configuration, `GET /health`, Models and Licences, `POST /transcribe?maxSpeechSec=120`, Tests

### Community 100 - "app.test.ts"
Cohesion: 0.13
Nodes (17): StudioOptions, ApiError, commentedConfig(), ENV_TEXT, FilesBody, json(), MODEL_ENV, modelStudio() (+9 more)

### Community 101 - "renderComponent"
Cohesion: 0.31
Nodes (14): renderMarkdown(), asObject(), asObjects(), formatBytes(), hex(), mediaHtml(), mediaUrl(), renderComponent() (+6 more)

### Community 102 - "timezone.ts"
Cohesion: 0.35
Nodes (9): loadGetLocalHour(), loadTimezoneModule(), unpinnedHour(), dateString(), dateTimeParts(), getLocalDate(), localDateStartEpoch(), localDateTimeFormatter() (+1 more)

### Community 103 - "Rokabot TRD"
Cohesion: 0.27
Nodes (10): Critical Do-Nots, Project (Rokabot description), Reference Docs (AGENTS.md), Rokabot PRD, Documentation (README index), Jev Integration (Research Doc), GPT-6-Astra, Jev Rollout Plan (+2 more)

### Community 104 - "duration.ts"
Cohesion: 0.33
Nodes (8): Box, movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0(), mvhdV1()

### Community 105 - "turnMedia.test.ts"
Cohesion: 0.20
Nodes (5): digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf()

### Community 107 - "media.ts"
Cohesion: 0.11
Nodes (24): At a Glance, Attachment Intake, Configuration, Link Priority, Linked Files (`attachment_url`), Lookup Limits, Media, Model Input (+16 more)

### Community 108 - "Rokabot Character Data"
Cohesion: 0.67
Nodes (3): Maniwa Roka, Rokabot, Senren*Banka

### Community 109 - "Speech Budget Management"
Cohesion: 0.42
Nodes (4): Keep time-ordered segments within the speech budget, spread across the clip.…, Segment, select_segments(), SelectSegmentsTest

### Community 110 - "markdown.ts"
Cohesion: 0.10
Nodes (25): blockQuote(), buildList(), codeBlock, EMOJI, emojiImage(), emphasis(), EMPHASIS_RULES, formatTimestamp() (+17 more)

### Community 111 - "redditFeed.ts"
Cohesion: 0.56
Nodes (9): decodeEntities(), entryAuthor(), entryContent(), feedEntries(), feedField(), htmlToText(), NAMED_ENTITIES, parseRedditFeedPost() (+1 more)

### Community 112 - "replyShape.ts"
Cohesion: 0.09
Nodes (35): Tunables, Known Limits, Rerunning the Check, Results, Roka Voice v4: Looked-Up Turns and Saying No, Root Causes, Tunables, What Changed (+27 more)

### Community 116 - "secrets.ts"
Cohesion: 0.26
Nodes (13): ALWAYS_REQUIRED, checkKey(), deleteSecret(), entry(), envLine(), ExampleKey, exampleKeys(), keysIn() (+5 more)

### Community 117 - "promptSafety.ts"
Cohesion: 0.16
Nodes (18): escapeRegExp(), stripNarratedToolCalls(), buildFactsEnvelope(), buildOverheardBlock(), FACTS_UNTRUSTED_DATA_LABEL, isSafeFactKey(), isSafeFactScalar(), MAX_FACT_KEY_LEN (+10 more)

### Community 119 - "recall.ts"
Cohesion: 0.16
Nodes (28): cosineSimilarity(), factKey(), ClaimPeriod, byScore(), cooldownPenalty(), coreRank(), countKind(), Ctx (+20 more)

### Community 120 - "recall-calibration.test.ts"
Cohesion: 0.24
Nodes (7): CandidateRow, Embed, axis(), detailOf(), history(), mix(), shadowRow()

### Community 121 - "emojiReactor.ts"
Cohesion: 0.10
Nodes (23): Architecture (AGENTS.md), discord Config Section, emoji Config Section, fallback Config Section, games Config Section, gemini Config Section, logging Config Section, memory Config Section (+15 more)

### Community 122 - "database.ts"
Cohesion: 0.04
Nodes (42): Failure Diagnostics Table, Database File, openFixture(), oldClaimId, undone, REMEMBER_TURN, runTurn(), ScriptedLlm (+34 more)

### Community 123 - "escapeHtml"
Cohesion: 0.33
Nodes (9): escapeHtml(), linkHtml(), renderPlainText(), emojiHtml(), nameHtml(), reactionEmoji(), renderButton(), renderReactions() (+1 more)

### Community 124 - "SocialPlatform"
Cohesion: 0.22
Nodes (8): createReplyReader(), isAbort(), replyReader, ReplyLookup, SocialPlatform, FOUND, readerWith(), SETTINGS

### Community 125 - "transcribe.test.ts"
Cohesion: 0.08
Nodes (34): EMPTY, extractFrame(), extractFrames(), frameBins(), frameCount(), FrameRunner, FrameSource, frameTimestamps() (+26 more)

### Community 126 - "Speech Server Engines"
Cohesion: 0.33
Nodes (6): Engines, load_engines(), main(), SpeechServer, NamedTuple, ThreadingHTTPServer

### Community 127 - "Linting Configuration"
Cohesion: 0.67
Nodes (3): lint-staged, *.{json,md,yml,yaml}, *.{ts,js}

### Community 129 - "probe-llm-profile.ts"
Cohesion: 0.18
Nodes (20): CITY_SCHEMA, hasThinkingTag(), isFilled(), isTimeZone(), judgeJson(), judgeText(), judgeTool(), judgeToolResult() (+12 more)

### Community 130 - "test-gemini-ga-compare.ts"
Cohesion: 0.13
Nodes (16): ref_node_dns, ErrorRecoveryPlugin, main(), results, runQuery(), TestResult, wordCount(), CapturingErrorPlugin (+8 more)

### Community 131 - "Speech Transcription Processing"
Cohesion: 0.60
Nodes (5): decode(), detect_speech(), language_code(), transcribe(), ndarray

### Community 133 - "textEdit.ts"
Cohesion: 0.31
Nodes (17): Primitive, Flow, flowMap(), insertLine(), insertPair(), lineEnd(), lineStart(), pairOf() (+9 more)

### Community 134 - "searchPrefetch.test.ts"
Cohesion: 0.50
Nodes (3): runPrefetchForJudgment(), startSearchPrefetch(), mocks

### Community 135 - "linesGolden.test.ts"
Cohesion: 0.18
Nodes (27): Field Reference, lines.yml, Commands, Bug Reports, Persistence and Storage, Retention, Tables, stopReminderScheduler() (+19 more)

### Community 136 - "CI/CD Deployment Pipeline"
Cohesion: 0.36
Nodes (9): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping), Deployment & Operations (+1 more)

### Community 137 - "ref_node_fs"
Cohesion: 0.12
Nodes (19): js-yaml, ref_node_child_process, ref_node_fs, ref_node_os, ref_node_path, ref_node_worker_threads, main(), MEMORY_MODES (+11 more)

### Community 138 - "estimateTokens"
Cohesion: 0.10
Nodes (22): channelVisibility, ChannelVisibilityResolver, registerChannelVisibility(), resetChannelVisibilityForTest(), UNKNOWN, buildMediaRecallBlock(), formatMediaRecallBlock(), RecalledMedia (+14 more)

### Community 140 - "roka.test.ts"
Cohesion: 0.08
Nodes (39): Attachment Bytes Do Not Live in History, Concurrency and Lifecycle Under Retry, Roka Agent (ADK), Session Manager, SQLite Persistence Store, abortActiveTurns(), generateResponse(), __setTestRunTurnFactory() (+31 more)

### Community 142 - "test-phase8.ts"
Cohesion: 0.09
Nodes (32): SQLite Database Reference, assert(), fail(), main(), pass(), results, TestResult, cancelReminder() (+24 more)

### Community 143 - "UI TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals (+6 more)

### Community 144 - "System Architecture"
Cohesion: 0.12
Nodes (16): Architecture, At a Glance, Core Code Modules, Discord Events (Inbound), Durable State, Gateway Setup, Installation and Context Policy, InteractionCreate (`/ask`) (+8 more)

### Community 146 - "agent/attachments.ts"
Cohesion: 0.08
Nodes (35): PDF Token Cost Measurement, Attachment Token Admission, Download, sharp, spriteFiles, anthropicBlock(), countWithAnthropic(), estimateTokens() (+27 more)

### Community 147 - "anthropicLlm.test.ts"
Cohesion: 0.09
Nodes (21): `ResolvedModel` Defaults, AnthropicLlm, STRUCTURED_OUTPUT_TOOL, ContentBlock, fixtures, usage(), answer(), budget (+13 more)

### Community 148 - "yamlEdit.ts"
Cohesion: 0.23
Nodes (21): yaml, character, config, repo, voice, stringifyDoc(), addItem(), deleteNode() (+13 more)

### Community 149 - "render.ts"
Cohesion: 0.13
Nodes (19): MarkdownContext, authorKey(), avatarUrl(), BUTTON_STYLES, fileDataUri(), headerTime(), IMAGE_TYPES, initials() (+11 more)

### Community 150 - "Configuration"
Cohesion: 0.08
Nodes (27): At a Glance, Character, Configuration, `discord`, `embeddings`, `emoji`, `fallback`, `games` (+19 more)

### Community 151 - "persona-replay.ts"
Cohesion: 0.10
Nodes (29): ref_node_url, ANTHROPIC_SEARCH, appendReplyShape(), Arm, claudeSettings(), GEMINI_CONFIG, GEMINI_SEARCH, loadArm() (+21 more)

### Community 152 - "turnContext.ts"
Cohesion: 0.07
Nodes (41): Where Rokabot Decides Today, Source Files, Turn Entry Work, Embeddings and Episodic Recall, Unified Recall, Models Summary, Prompt Engine Summary, Turn Walkthrough (+33 more)

### Community 153 - "privacy"
Cohesion: 0.11
Nodes (20): Capture and Prompt, `memory`, Recall, Retention, Memory, At a Glance, Browse Memory in Obsidian, Forgetting and Opting Out (+12 more)

### Community 154 - "app.ts"
Cohesion: 0.10
Nodes (33): ref_node_crypto, ref_node_http, PROVIDER_KEY_ENV, route(), Handler, PREVIEW_FIELDS, previewQuery(), fail() (+25 more)

### Community 155 - "interactionCreate.memory.test.ts"
Cohesion: 0.29
Nodes (5): MEMORY_TOOL_NAMES, CapturingRunner, makeInteraction(), mocks, turn()

### Community 156 - "Memory"
Cohesion: 0.09
Nodes (25): Admission, Bounded Retrieval (Legacy), Capture, Claim Lifecycle and Retention, Deferred Items, Extraction, Extraction Run Trace, Fact Reclassification (+17 more)

### Community 157 - "updateNotifier.ts"
Cohesion: 0.15
Nodes (16): cfg, LATEST, store, checkForUpdate(), fetchLatestRelease(), isNewerVersion(), LatestRelease, moduleDirectory (+8 more)

### Community 158 - "Character Harness Research"
Cohesion: 0.11
Nodes (18): 1. Character as a Folder Pack, 2. Static First, Dynamic After, Reply Shape Last, 3. Any OpenAI-Compatible Endpoint, 4. Files First, Dashboard Later, Character Formats, Character Harness Research 2026, Decisions for Rokabot, Evidence-Backed (+10 more)

### Community 161 - "recall-calibration-thresholds.ts"
Cohesion: 0.19
Nodes (17): chooseFloor(), cli(), cohensKappa(), currentFloorOf(), KindReport, Label, main(), MIN_AGREED_PAIRS (+9 more)

### Community 162 - "Characters"
Cohesion: 0.15
Nodes (13): A Pack Outside the Image, At a Glance, character.yml, Characters, Harness Prompts and Overrides, How the Bot Picks a Pack, Make a New Character, moods.yml (+5 more)

### Community 163 - "Jev Judgments"
Cohesion: 0.20
Nodes (10): At a Glance, Client, Configuration, Jev Judgments, Modes, Questions, Search Prefetch, Tools (+2 more)

### Community 164 - "Product"
Cohesion: 0.18
Nodes (10): Accessibility & Inclusion, Anti-references, Brand Personality, Design Principles, Platform, Positioning, Product, Product Purpose (+2 more)

### Community 165 - "API and Security Tests"
Cohesion: 0.20
Nodes (10): API, Errors, Model Connection Test, Pack File Rules, Persona Studio, Security Model, Source Files, Start It (+2 more)

### Community 166 - "Models"
Cohesion: 0.17
Nodes (12): Any OpenAI-Compatible Model, At a Glance, Budgets and Limits, Capabilities Reference, Choose the Main and Fallback, Copy-Paste Entries, Fields for OpenAI-Compatible Entries, How the Fallback Behaves (+4 more)

### Community 167 - "Claims Memory Architecture"
Cohesion: 0.36
Nodes (8): Claim Lifecycle, Claims Memory Architecture, extraction_queue Table, memory_claim_fts Table, memory_claim Table, memory_events Table, memory_evidence Table, Vault Export

### Community 168 - "main.test.ts"
Cohesion: 0.24
Nodes (5): ref_node_net, browserCommands(), Command, openBrowser(), children

### Community 169 - "Deployment and Setup Guide"
Cohesion: 0.14
Nodes (14): At a Glance, First-Run Checks, Getting Started, Install and Configure, Model Keys for the Shipped Config, Next Steps, Prerequisites, Register Slash Commands (+6 more)

### Community 170 - "Auto-Deploy Platforms"
Cohesion: 0.14
Nodes (13): Answer, Auto-Deploy Platforms, Coolify, Docker API Version, Fly.io, GHCR Limits, Maintained Fork, Original Project (+5 more)

### Community 171 - "Roka Voice v3: Restoring Variety on Haiku"
Cohesion: 0.20
Nodes (9): Canon Research, Complaints After the Haiku Switch, Known Weak Spots, Replay and Blind-Judge Method, Rerunning the Check, Results, Roka Voice v3: Restoring Variety on Haiku, Root Causes (+1 more)

### Community 172 - "queries.test.ts"
Cohesion: 0.14
Nodes (13): activeClaimCount(), distinctRememberedUsers(), MEMORY_STATS_SQL, outcomeBreakdown(), successRate, topTones(), insertClaim(), insertGuildClaim() (+5 more)

### Community 173 - "persona-report.ts"
Cohesion: 0.13
Nodes (25): voice.yml, countSlurRepetitions(), faces(), firstWord(), formatTable(), innerThoughts(), main(), MARKERS (+17 more)

### Community 174 - "Embedding Project Config"
Cohesion: 0.15
Nodes (12): compilerOptions, lib, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+4 more)

### Community 175 - "fingerprint.ts"
Cohesion: 0.20
Nodes (12): EmbeddingClient, DEFAULT_EMBEDDING_MODELS, embeddingDimensions(), embeddingFingerprint(), EmbeddingProvider, isEmbeddingVector(), LOCAL_EMBEDDING_MODEL, RECIPES (+4 more)

### Community 177 - "Reply Shape"
Cohesion: 0.17
Nodes (12): Beats, Edge, Ending, Faces, Message Weight, Opener, Paragraphs, Reply Shape (+4 more)

### Community 178 - "searchNativeGemini.test.ts"
Cohesion: 0.06
Nodes (31): `search`, Budgets, Usage and Cost, describeUsage(), KEY_ENV, main(), MODEL, nativeRoute(), Options (+23 more)

### Community 179 - "Features"
Cohesion: 0.20
Nodes (10): At a Glance, Features, Games and Gacha, Reactions, Status Rotation and Update Notices, Reminders, Seeing and Watching, Source Files, Stats (+2 more)

### Community 180 - "Embedding Service Docs"
Cohesion: 0.20
Nodes (9): API, Build and Run, Configuration, Embedding Sidecar, `GET /health`, Model and Licences, `POST /embed`, Smoke Test (+1 more)

### Community 181 - "mediaDigestStore.ts"
Cohesion: 0.10
Nodes (33): BackfillPace, delay(), EpisodeMaintenanceReport, runPass(), delay(), embedPendingFacts(), sweep(), configMock (+25 more)

### Community 182 - "HeaderUtilities.tsx"
Cohesion: 0.11
Nodes (26): NoticeRow(), NotificationCenter(), THEMES, ThemeSwitch(), ToastCard(), Toaster(), TONE_ICON, ActionChip() (+18 more)

### Community 183 - "models.spec.ts"
Cohesion: 0.29
Nodes (3): WindowMessage, role(), roleSelect()

### Community 185 - "toolTrigger.ts"
Cohesion: 0.09
Nodes (28): emitTrialRecord(), formatTrialRecord(), TrialRecord, BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey(), DIAGNOSTIC_TIMEOUT_MS, errorText() (+20 more)

### Community 186 - "yamlText.ts"
Cohesion: 0.50
Nodes (12): appendEntry(), expectAfter(), lineEnd(), lineStart(), readIn(), removeKey(), removeListItem(), same() (+4 more)

### Community 187 - "Speech Pattern Documentation"
Cohesion: 0.25
Nodes (7): Dialogue Style, Example Lines, Example Replies With Structure, Expressions, Formatting Your Reply, Speech Patterns, Verbal Style

### Community 188 - "Persona Identity Definition"
Cohesion: 0.25
Nodes (7): Identity & Appearance, Insecurities, People You Know, Personality, Romantic Side, Who You Are, Your World

### Community 189 - "Embedding Smoke Tests"
Cohesion: 0.25
Nodes (5): ref_node_assert, EmbedReply, golden, goldenPath, record

### Community 191 - "markdownGuard.ts"
Cohesion: 0.50
Nodes (6): eachOutside(), guardMarkdown(), guardProse(), guardText(), isFace(), KAOMOJI

### Community 193 - "Changelog"
Cohesion: 0.20
Nodes (9): [0.2.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.1.0...v0.2.0) (2026-10-16), [0.3.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.2.0...v0.3.0) (2026-10-16), [0.4.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.3.0...v0.4.0) (2026-10-17), Bug Fixes, Bug Fixes, Changelog, Features, Features (+1 more)

### Community 194 - "Character Packs"
Cohesion: 0.25
Nodes (7): Character Packs, Layout, Locked Prompts, Macros, Making a New Character, Prompt Files, Search Prompts

### Community 197 - "Audio Video Documentation"
Cohesion: 0.50
Nodes (3): Audio and Video, When You Couldn't Watch It, When You've Watched Something

### Community 198 - "Release Configuration"
Cohesion: 0.50
Nodes (3): bootstrap-sha, packages, $schema

### Community 221 - "workspace.ts"
Cohesion: 0.11
Nodes (48): CommandPalette(), Item, Page(), PageProps, SaveActions(), StatusBadges(), Validation, ConfigDiff() (+40 more)

### Community 223 - "fixtures.ts"
Cohesion: 0.07
Nodes (20): @axe-core/playwright, @playwright/test, PAGES, at(), field(), studio_ui_e2e_fixtures_expect, Studio, test (+12 more)

### Community 225 - "measure.ts"
Cohesion: 0.35
Nodes (9): Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION, mimeForPath(), resolveKey(), TokenLimits (+1 more)

### Community 228 - "replyBlocks.ts"
Cohesion: 0.38
Nodes (8): blockCount(), BlockKind, capReplyBlocks(), countReplyBlocks(), MAX_REPLY_BLOCKS, parse(), Piece, splitAtDividers()

### Community 229 - "UI Styling Assets"
Cohesion: 0.33
Nodes (5): @fontsource-variable/geist, @fontsource-variable/geist-mono, react-dom, root, studio_ui_src_styles

### Community 232 - "socialPosts/types.ts"
Cohesion: 0.14
Nodes (19): SOCIAL_POST_UNTRUSTED_DATA_LABEL, SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL, author(), formatSocialPostLine(), PLATFORM_NAMES, quoted(), replies(), ParsedBlueskyThread (+11 more)

### Community 233 - "Media Watching"
Cohesion: 0.20
Nodes (10): Accounting, Digest and Turn Input, Gemini Watcher, Media Watching, Qwen Watcher, Remembered Media, Speech Sidecar, Transport (+2 more)

### Community 235 - "reports.ts"
Cohesion: 0.43
Nodes (6): main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne()

### Community 249 - "gemini.test.ts"
Cohesion: 0.29
Nodes (4): configuredEmbed(), EmbeddingSettings, createGeminiEmbeddingClient(), mocks

### Community 250 - "discord/client.ts"
Cohesion: 0.10
Nodes (19): Tech Stack (AGENTS.md), Discord Install Requirements: bot Scope Is Load-Bearing, Guild Permissions Are Derived From the API Surface, There Is No Build-Time Pin, and That Is Deliberate, createClient(), buildCommandBody(), handleReady(), mocks (+11 more)

## Ambiguous Edges - Review These
- `Second Opinion` → `Rokabot TRD`  [AMBIGUOUS]
  docs/research/jev-integration.md · relation: conceptually_related_to

## Knowledge Gaps
- **1543 isolated node(s):** `$schema`, `indentStyle`, `indentWidth`, `lineWidth`, `enabled` (+1538 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2015 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **42 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Second Opinion` and `Rokabot TRD`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `vitest` connect `vitest` to `buddy.ts`, `jevReplay.ts`, `qwenWatch.ts`, `memoryEpisodeStore.ts`, `gacha.ts`, `messageBuilder.ts`, `getDb`, `test-features.ts`, `scheduler.ts`, `profiles.ts`, `messageCreate.ts`, `discord.js`, `tools/index.ts`, `replies/service.ts`, `guildFactDates.ts`, `memoryEpisodeReplay.ts`, `WindowedSessionService`, `memoryShadow.ts`, `extractor.ts`, `retriever.ts`, `run.ts`, `RateLimiter`, `turnMedia.ts`, `src/games/shiritori.ts`, `YouTube Media Stream`, `searchNativeAnthropic.test.ts`, `promptGolden.test.ts`, `getAnimeSchedule.ts`, `fallbackModel.ts`, `discord/attachments.ts`, `roka.ts`, `generateObject.ts`, `Activity Visualization Charts`, `Inline Data Contract`, `handler.ts`, `identityResolver.ts`, `obsidianExport.ts`, `config`, `memoryTools.test.ts`, `reportCommand.ts`, `judgments.ts`, `digest.ts`, `socialPosts/service.ts`, `parsers.ts`, `Prefetch Measurement Tools`, `package.json`, `File Upload Handling`, `interactionCreate.metrics.test.ts`, `anthropicMain.eval.test.ts`, `toolTriggerScoring.ts`, `probe-llm-profile.test.ts`, `views.test.ts`, `watch.ts`, `logger.ts`, `Search Prefetch Reporting`, `hiddenRetractions.test.ts`, `messageContent.ts`, `src/index.ts`, `config.ts`, `ToneKey`, `embeddings/client.ts`, `extractionSchema.ts`, `local.test.ts`, `load.ts`, `predicates.ts`, `app.test.ts`, `timezone.ts`, `duration.ts`, `turnMedia.test.ts`, `media.ts`, `replyShape.ts`, `promptSafety.ts`, `recall-calibration.test.ts`, `emojiReactor.ts`, `database.ts`, `SocialPlatform`, `transcribe.test.ts`, `searchPrefetch.test.ts`, `linesGolden.test.ts`, `ref_node_fs`, `estimateTokens`, `roka.test.ts`, `test-phase8.ts`, `agent/attachments.ts`, `anthropicLlm.test.ts`, `yamlEdit.ts`, `persona-replay.ts`, `turnContext.ts`, `interactionCreate.memory.test.ts`, `updateNotifier.ts`, `main.test.ts`, `queries.test.ts`, `persona-report.ts`, `fingerprint.ts`, `searchNativeGemini.test.ts`, `mediaDigestStore.ts`, `toolTrigger.ts`, `markdownGuard.ts`, `measure.ts`, `replyBlocks.ts`, `socialPosts/types.ts`, `gemini.test.ts`, `discord/client.ts`?**
  _High betweenness centrality (0.227) - this node is a cross-community bridge._
- **Why does `react` connect `PackFileScreen.tsx` to `YamlForm.tsx`, `UI Styling Assets`, `package.json`, `configShared.tsx`, `parts.tsx`, `DiscordPreview.tsx`, `Sidebar.tsx`, `HeaderUtilities.tsx`, `Moods.tsx`, `Secrets.tsx`, `workspace.ts`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `config` connect `config` to `buddy.ts`, `test-gemini-ga-compare.ts`, `memoryEpisodeStore.ts`, `gacha.ts`, `getDb`, `linesGolden.test.ts`, `scheduler.ts`, `estimateTokens`, `profiles.ts`, `roka.test.ts`, `messageCreate.ts`, `discord.js`, `tools/index.ts`, `test-features.ts`, `replies/service.ts`, `agent/attachments.ts`, `memoryEpisodeReplay.ts`, `guildFactDates.ts`, `test-phase8.ts`, `memoryShadow.ts`, `extractor.ts`, `retriever.ts`, `turnContext.ts`, `run.ts`, `RateLimiter`, `updateNotifier.ts`, `turnMedia.ts`, `recall-calibration-thresholds.ts`, `recall-calibration-sample.ts`, `src/games/shiritori.ts`, `YouTube Media Stream`, `getAnimeSchedule.ts`, `fallbackModel.ts`, `discord/attachments.ts`, `roka.ts`, `generateObject.ts`, `mediaDigestStore.ts`, `identityResolver.ts`, `obsidianExport.ts`, `toolTrigger.ts`, `memoryTools.test.ts`, `reportCommand.ts`, `judgments.ts`, `Functional Requirements`, `socialPosts/service.ts`, `File Upload Handling`, `interactionCreate.metrics.test.ts`, `watch.ts`, `logger.ts`, `hiddenRetractions.test.ts`, `src/index.ts`, `config.ts`, `embeddings/client.ts`, `anthropicLlm.ts`, `emojiReactor.ts`, `predicates.ts`, `timezone.ts`, `media.ts`, `recall.ts`, `recall-calibration.test.ts`, `gemini.test.ts`, `discord/client.ts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `$schema`, `indentStyle`, `indentWidth` to the rest of the system?**
  _1543 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `buddy.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11586452762923351 - nodes in this community are weakly interconnected._
- **Should `jevReplay.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12903225806451613 - nodes in this community are weakly interconnected._