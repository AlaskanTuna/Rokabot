# Graph Report - graph-2  (2026-11-04)

## Corpus Check
- 737 files · ~610,930 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 30 file(s) not represented in the graph (top: (none) 13, .jsonl 11, .rss 2)

## Summary
- 5885 nodes · 16450 edges · 240 communities (189 shown, 51 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 526 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `103745e5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- profiles.ts
- jevReplay.ts
- qwenWatch.ts
- memoryEpisodeStore.ts
- Project Linting Config
- buddy.ts
- messageBuilder.ts
- memoryClaims.ts
- createModel.test.ts
- src/index.ts
- roka.test.ts
- parsers.ts
- discordDoubles.ts
- messageCreate.ts
- views.ts
- tools/index.ts
- replies/service.ts
- statsStore.ts
- memoryRecallStore.ts
- Character Harness Research 2026
- Dev Tooling Dependencies
- Media
- workspace.ts
- predicates.ts
- attemptBudget.ts
- memoryShadow.ts
- run.ts
- dependencies
- discord.js
- test-chat.ts
- Prompts.tsx
- TypeScript Configuration
- turnMedia.ts
- YamlForm.tsx
- scripts
- recall.ts
- games/router.ts
- youtubeStreams.ts
- toolTriggerScoring.ts
- episodeTracker.ts
- getAnimeSchedule.ts
- worst-case.ts
- fallbackModel.ts
- app.ts
- configShared.tsx
- yamlEdit.ts
- retriever.ts
- generateObject.ts
- mediaRules.ts
- charts.ts
- promptGolden.test.ts
- Inline Data Contract
- TypeScript Build Config
- handler.ts
- Secrets.tsx
- anthropicLlm.ts
- replyReader
- budget.ts
- recall-calibration-sample.ts
- Moods.tsx
- reportStore.ts
- videoVariant.ts
- digest.ts
- markdown.ts
- server.py
- social/service.ts
- secrets.ts
- vitest
- Design System Documentation
- urls.ts
- HeaderUtilities.tsx
- package.json
- test
- File Upload Handling
- messageCreate.test.ts
- renderPayload.ts
- roka Service
- getDb
- memoryEpisodeReplay.ts
- searchNativeGemini.test.ts
- watch.ts
- searchNativeAnthropic.test.ts
- searchPrefetchShadow.ts
- models.ts
- messageContent.ts
- PackFileScreen.tsx
- DiscordPreview.tsx
- config.ts
- Social Post Viewing Research
- character/index.ts
- Jev Judgments
- extractionSchema.ts
- RateLimiter
- pack.ts
- memoryClaimSchema.ts
- persona-turns.ts
- read_wav
- fixtures.ts
- replay-memory-v2.ts
- downloadAttachment
- app.test.ts
- api.ts
- linesGolden.test.ts
- measure.ts
- Features
- turnMedia.test.ts
- Commit Linting Rules
- Deployment
- Data and Backups
- ExtractionEpisode
- Configuration Changes
- System Architecture
- replyShape.ts
- Documentation Style Guide
- Git Commit Standards
- Coding Best Practices
- Characters
- promptSafety.ts
- roka.ts
- replyBlocks.ts
- metadata.ts
- extractionSchema.test.ts
- pack/ProblemBanner.tsx
- cli.ts
- Raspberry Pi Runbook
- Data Models and Storage
- Engines
- Linting Configuration
- Handler
- probe-llm-profile.ts
- main.test.ts
- anthropicLlm.test.ts
- reportHandler.ts
- contentKey.ts
- toolTrigger.ts
- sessionAttachmentRetention.contract.test.ts
- deploy Job
- ref_node_os
- getLocalHour
- Product Requirements
- Reliability
- playwright.config.ts
- Contributing
- UI TypeScript Configuration
- load.ts
- Conventions
- attachmentCost.ts
- guildFactDates.test.ts
- @google/adk
- render.ts
- Configuration
- persona-replay.ts
- turnContext.ts
- Memory
- reports.ts
- duration.ts
- test_server.py
- citations.ts
- Media Watching
- models.spec.ts
- README.md
- recall-calibration-thresholds.ts
- config-pages.spec.ts
- judgments.ts
- Product
- API and Security Tests
- Models
- voice.spec.ts
- Deployment and Setup Guide
- Auto-Deploy Platforms
- searchWeb
- persona-report.ts
- Embedding Project Config
- ScriptedLlm
- redditFeed.ts
- Features
- Embedding Service Docs
- Media and Sidecars
- parts.tsx
- Multimodal Intake Research
- views.test.ts
- measure-prefetch.ts
- Speech Pattern Documentation
- Persona Identity Definition
- Changelog
- Character Packs
- ref_node_fs
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
- ASR Sidecar
- Segment
- FakeRecognizer
- transcribe.test.ts
- parse_max_speech
- UI Styling Assets
- pull_request_template.md
- vectorProvenance.ts
- config
- Decisions
- src_utils_imageprocessor_gemini_image_tokens
- Template Speaking Prompts
- Template Calm Mood
- Cheerful Mood Prompt
- Persona Identity Prompts
- displayName
- interactionCreate.memory.test.ts
- Coding Guidelines (Andrej Karpathy)
- graphify.md
- issue-tracker.md
- rtk.md
- Deliberately Not Done
- Reference Docs (AGENTS.md)

## God Nodes (most connected - your core abstractions)
1. `vitest` - 261 edges
2. `getDb()` - 251 edges
3. `config` - 124 edges
4. `logger` - 81 edges
5. `discord.js` - 57 edges
6. `closeDb()` - 52 edges
7. `generateResponse()` - 51 edges
8. `assertClaim()` - 48 edges
9. `createMessageHandler()` - 47 edges
10. `createTurnContext()` - 44 edges

## Surprising Connections (you probably didn't know these)
- `At a Glance` --references--> `test()`  [INFERRED]
  docs/trd/deployment.md → scripts/test-adk-smoke.ts
- `Reply Model and Fallback` --references--> `luna()`  [INFERRED]
  docs/RUNBOOK.md → src/agent/llm/__tests__/chatCompletionsLlm.test.ts
- `At a Glance` --references--> `startCall()`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/budget.ts
- `A Spent Day Is Not a Spent Minute` --references--> `computeBackoff()`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/geminiReliability.ts
- `ADK Error Delivery Constraint` --references--> `ProviderError`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/providerError.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Deploy-to-Pi CI/CD Pipeline** — _github_workflows_deploy_workflow, _github_workflows_deploy_test_job, _github_workflows_deploy_deploy_job, agents_working_conventions [EXTRACTED 0.90]
- **Multimodal Attachment Safety Pipeline** — docs_research_multimodal_global_byte_budget, docs_research_multimodal_streaming_size_guard, docs_research_multimodal_attachment_strip_history, docs_research_multimodal_tpm_ceiling_measurement, src_discord_bytebudget [INFERRED 0.95]

## Communities (240 total, 51 thin omitted)

### Community 0 - "profiles.ts"
Cohesion: 0.05
Nodes (43): Model Profiles, The `openai-compatible` Exception, BudgetDenial, ChatCompletionsLlm, ChatCompletionsOptions, LegacyModelSettings, LlmConfig, COMPATIBLE_DEFAULTS (+35 more)

### Community 1 - "jevReplay.ts"
Cohesion: 0.13
Nodes (26): parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, agreement(), buildConfusionMatrix(), buildProbabilityBins(), buildReplayTurn() (+18 more)

### Community 2 - "qwenWatch.ts"
Cohesion: 0.10
Nodes (22): binOf(), ChatCompletion, ContentPart, promptFor(), quoted(), QwenFrame, QwenWatchInput, QwenWatchResult (+14 more)

### Community 3 - "memoryEpisodeStore.ts"
Cohesion: 0.04
Nodes (98): EmbeddingResult, BackfillPace, delay(), EpisodeMaintenanceReport, pruneEpisodesAndReembed(), runPass(), buildEpisodeRecallBlock(), formatEpisodeRecallBlock() (+90 more)

### Community 4 - "Project Linting Config"
Cohesion: 0.05
Nodes (39): useLiteralKeys, css, formatter, files, ignore, formatter, enabled, indentStyle (+31 more)

### Community 5 - "buddy.ts"
Cohesion: 0.08
Nodes (64): buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount(), handleBuddyCollection(), formatHatchTimeRemaining(), handleBuddyLeaderboard(), handleBuddyStats() (+56 more)

### Community 6 - "messageBuilder.ts"
Cohesion: 0.07
Nodes (38): discord Config Section, getExpressionUrl(), lastExpressionByTone, __resetExpressionState(), TONE_EXPRESSIONS, buildRokaMessage(), buildToolFooter(), footerLeads (+30 more)

### Community 7 - "memoryClaims.ts"
Cohesion: 0.05
Nodes (87): Claim Lifecycle and Retention, Retention Tiers, evicted, ExtractionOp, ExtractionOutput, episodeObservedAt(), episodePrompt(), ExtractedEpisode (+79 more)

### Community 8 - "createModel.test.ts"
Cohesion: 0.08
Nodes (19): Provider IDs, ModelScopeLlm, createLlm(), GeminiLlm, budget, configState, haiku, legacyFallback (+11 more)

### Community 9 - "src/index.ts"
Cohesion: 0.04
Nodes (87): memory Config Section, promptTokenTotal(), cleanupExpired(), restoreMonitoredChannels(), ABORT_CODES, classifyExtractionError(), ExtractionErrorClassification, JevUnavailableError (+79 more)

### Community 10 - "roka.test.ts"
Cohesion: 0.05
Nodes (53): Switch, Models Summary, Turn Walkthrough, prepareTurnMedia(), abortActiveTurns(), generateResponse(), requestTimeoutFor(), __setTestRunTurnFactory() (+45 more)

### Community 11 - "parsers.ts"
Cohesion: 0.15
Nodes (35): base(), BlueskyBlob, blueskyQuote(), capped(), compact(), date(), finiteNumber(), headers() (+27 more)

### Community 12 - "discordDoubles.ts"
Cohesion: 0.04
Nodes (47): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+39 more)

### Community 13 - "messageCreate.ts"
Cohesion: 0.05
Nodes (73): Concurrency Binding Constraint, Link Priority, Lookup Limits, Model Input, Post Media, Replies, Social Post Viewing, Supported Platforms (+65 more)

### Community 14 - "views.ts"
Cohesion: 0.12
Nodes (35): addChart(), buildControls(), buildMemory(), buildMood(), buildNerd(), buildStatsView(), DOMINANT_TONE_ADJECTIVES, formatDuration() (+27 more)

### Community 15 - "tools/index.ts"
Cohesion: 0.04
Nodes (55): ErrorRecoveryPlugin, main(), results, runQuery(), TestResult, wordCount(), outcomeForTurn, recordReplyOutcome() (+47 more)

### Community 16 - "replies/service.ts"
Cohesion: 0.20
Nodes (30): array(), nonNegativeInteger(), bilibiliAid(), fetchBilibiliReplies(), fetchBlueskyReplies(), BROWSER_USER_AGENT, compactReplyText(), failed() (+22 more)

### Community 17 - "statsStore.ts"
Cohesion: 0.08
Nodes (36): buildOverview(), activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome (+28 more)

### Community 18 - "memoryRecallStore.ts"
Cohesion: 0.13
Nodes (20): fact(), delay(), embedPendingFacts(), sweep(), normalizeKey(), sensitiveFactReason, configMock, mocks (+12 more)

### Community 19 - "Character Harness Research 2026"
Cohesion: 0.11
Nodes (18): 1. Character as a Folder Pack, 2. Static First, Dynamic After, Reply Shape Last, 3. Any OpenAI-Compatible Endpoint, 4. Files First, Dashboard Later, Character Formats, Character Harness Research 2026, Decisions for Rokabot, Evidence-Backed (+10 more)

### Community 20 - "Dev Tooling Dependencies"
Cohesion: 0.07
Nodes (29): devDependencies, @axe-core/playwright, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, diff, @fontsource-variable/geist, @fontsource-variable/geist-mono (+21 more)

### Community 21 - "Media"
Cohesion: 0.21
Nodes (8): At a Glance, Bytes Do Not Stay in History, Configuration, Media, Source Files, attachmentMarker(), WindowedSessionService, newConversation()

### Community 22 - "workspace.ts"
Cohesion: 0.10
Nodes (47): App(), CommandPalette(), Item, Ambient(), Page(), PageProps, SaveActions(), StatusBadges() (+39 more)

### Community 23 - "predicates.ts"
Cohesion: 0.05
Nodes (61): Extraction, Jev Judgments, Hidden-Fact Reconciliation, Storage Schema, zod, PAST_FACT_MARKER, renderFactSentence(), HiddenRetract (+53 more)

### Community 24 - "attemptBudget.ts"
Cohesion: 0.17
Nodes (11): ref_node_async_hooks, runSearchTurn(), ScriptedLlm, SEARCH_TURN, TAVILY_RESULTS, searchWebTool, attemptForRequest, currentSearchAttempt() (+3 more)

### Community 25 - "memoryShadow.ts"
Cohesion: 0.20
Nodes (14): asClaim(), asScenario(), evaluateMemoryShadow(), FixtureClaim, loadReplaySet(), MemoryShadowReport, percentile95(), REPLAY_PATH (+6 more)

### Community 26 - "run.ts"
Cohesion: 0.07
Nodes (45): resetMonitor(), resetForTest(), stopExtractionScheduler(), __resetTestRunTurnFactory(), CaptureInput, CaptureKind, CaptureRecord, CaptureSink (+37 more)

### Community 27 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, @anthropic-ai/sdk, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml (+6 more)

### Community 28 - "discord.js"
Cohesion: 0.06
Nodes (57): reminders Config Section, discord.js, ref_discordjs_builders, cancelReminderTool, listRemindersTool, searchAnimeTool, setReminderTool, AnimeResult (+49 more)

### Community 29 - "test-chat.ts"
Cohesion: 0.19
Nodes (13): ref_node_readline, args, handleInput(), htmlIndex, main(), previewMessages, username, eachOutside() (+5 more)

### Community 30 - "Prompts.tsx"
Cohesion: 0.19
Nodes (21): estimateTokens(), TextEditor, TextEditorHandle, TextEditorProps, Columns(), EntryNote(), EntryNoteProps, characterPath() (+13 more)

### Community 31 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "turnMedia.ts"
Cohesion: 0.10
Nodes (48): Coverage Plan, geminiMimeType(), discordAttachmentContentKey(), watchOutcomeFor(), durationFromTokens(), ESTIMATED_DURATION_HEADROOM, halvesCouldCover(), MediaMemoryScope (+40 more)

### Community 33 - "YamlForm.tsx"
Cohesion: 0.11
Nodes (44): Problem, cleanComment(), Context, FOCUS_ORDER, Group(), helpFor(), isRecord(), MapBody() (+36 more)

### Community 34 - "scripts"
Cohesion: 0.06
Nodes (36): scripts, build, character, dev, dev:quiet, export:vault, format, format:check (+28 more)

### Community 35 - "recall.ts"
Cohesion: 0.06
Nodes (49): Unified Recall, channelVisibility, ChannelVisibilityResolver, registerChannelVisibility(), resetChannelVisibilityForTest(), UNKNOWN, cosineSimilarity(), byScore() (+41 more)

### Community 36 - "games/router.ts"
Cohesion: 0.07
Nodes (66): games Config Section, ref_node_module, fillLine(), handleBuddyGuide(), buildHangmanBody(), handleHangmanGuess(), handleHangmanGuide(), handleHangmanStart() (+58 more)

### Community 37 - "youtubeStreams.ts"
Cohesion: 0.19
Nodes (19): metadata, realisticFormats, AudioFormat, audioFormats(), directHttpsUrl(), finiteNumber(), hasCodec(), headersOf() (+11 more)

### Community 38 - "toolTriggerScoring.ts"
Cohesion: 0.09
Nodes (31): CASE_SETS, fixturePath, header, rememberFixturePath, searchWebFixturePath, temporaryDirectories, testCase, CaseSetRun (+23 more)

### Community 39 - "episodeTracker.ts"
Cohesion: 0.17
Nodes (21): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), resetEpisodeTrackerForTest(), scheduleLull() (+13 more)

### Community 40 - "getAnimeSchedule.ts"
Cohesion: 0.08
Nodes (31): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleParams, GetAnimeScheduleResult, getCurrentSeason() (+23 more)

### Community 41 - "worst-case.ts"
Cohesion: 0.09
Nodes (39): yaml, sandboxPaths(), app, dataset, paths, port, token, appendToBlock() (+31 more)

### Community 42 - "fallbackModel.ts"
Cohesion: 0.08
Nodes (22): Hedge, Logs, Pinning, Routing, Sticky Window, Request Slots and Daily Units, createRokaModel(), AnswerModel (+14 more)

### Community 43 - "app.ts"
Cohesion: 0.18
Nodes (28): createApp(), route(), Handler, PREVIEW_FIELDS, previewQuery(), CHECK_SCRIPT, checkConfig(), ConfigPaths (+20 more)

### Community 44 - "configShared.tsx"
Cohesion: 0.10
Nodes (46): humanize(), splitPath(), ALIASES, Bound, boundHints(), BOUNDS, boundText(), CardHeading() (+38 more)

### Community 45 - "yamlEdit.ts"
Cohesion: 0.18
Nodes (40): character, config, repo, voice, stringifyDoc(), addItem(), appendEntry(), deleteNode() (+32 more)

### Community 46 - "retriever.ts"
Cohesion: 0.04
Nodes (84): GPT-6-Astra, Jev Rollout Plan, Second Opinion, Who-Is-Who Resolver, At a Glance, Bounded Retrieval (Legacy), Deferred Items, Maintenance Commands (+76 more)

### Community 47 - "generateObject.ts"
Cohesion: 0.06
Nodes (42): Background Jobs, @google/genai, adapterFor(), adapters, attempt(), BackgroundWorkload, callUsage(), failureFields() (+34 more)

### Community 48 - "mediaRules.ts"
Cohesion: 0.05
Nodes (48): RFC-3003, Attachment Intake, Global In-Flight Byte Budget, Linked Files (`attachment_url`), Turn Admission, Types and Ceilings, Where Files Come From, Turn Admission (+40 more)

### Community 49 - "charts.ts"
Cohesion: 0.24
Nodes (14): @napi-rs/canvas, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+6 more)

### Community 50 - "promptGolden.test.ts"
Cohesion: 0.19
Nodes (13): Stable Prefix and Caching, splitStablePrefix(), computeGolden(), digest(), FIXTURE, MESSAGES, MODES, RECENT (+5 more)

### Community 51 - "Inline Data Contract"
Cohesion: 0.29
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 52 - "TypeScript Build Config"
Cohesion: 0.22
Nodes (8): ./tsconfig.json, compilerOptions, noEmit, rootDir, types, exclude, extends, include

### Community 53 - "handler.ts"
Cohesion: 0.05
Nodes (40): @huggingface/transformers, ref_node_net, @types/node, dependencies, @huggingface/transformers, devDependencies, @types/node, typescript (+32 more)

### Community 54 - "Secrets.tsx"
Cohesion: 0.11
Nodes (33): Secret, ActionChipProps, Button(), ButtonProps, ButtonStyle, IconButton(), IconButtonProps, STYLES (+25 more)

### Community 55 - "anthropicLlm.ts"
Cohesion: 0.05
Nodes (75): Block, create(), Effort, ImageMediaType, markerBlock(), mediaBlock(), mergeTurns(), Params (+67 more)

### Community 56 - "replyReader"
Cohesion: 0.39
Nodes (3): isAbort(), replyReader, ReplyLookup

### Community 57 - "budget.ts"
Cohesion: 0.07
Nodes (43): The Per-Minute Token Budget, acquireSlot(), billingExhaustedIn, BudgetReservation, CallInput, CallReservation, CONCURRENCY, grantOrThrow() (+35 more)

### Community 58 - "recall-calibration-sample.ts"
Cohesion: 0.07
Nodes (52): CandidateRow, chunk(), configuredEmbed(), Embed, loadShadowRows(), main(), MATCH_WINDOW_MS, matchTurnMessage() (+44 more)

### Community 59 - "Moods.tsx"
Cohesion: 0.21
Nodes (23): readYaml(), inMood(), addMoodText(), dependents(), moodKeys(), moodPrompt(), moodsPath(), MoodsYaml (+15 more)

### Community 60 - "reportStore.ts"
Cohesion: 0.16
Nodes (13): BugReportContext, BugReportInput, captureSnapshot(), countReportsSince(), MAX_CONTEXT_JSON_BYTES, queryRecentRows(), ReportAttachmentMetadata, ReportSnapshot (+5 more)

### Community 61 - "videoVariant.ts"
Cohesion: 0.17
Nodes (14): Admission, Capture, Extraction, Guild Facts and Dates, Scheduling and Retries, Verification, Write Path, add() (+6 more)

### Community 62 - "digest.ts"
Cohesion: 0.08
Nodes (31): Digest and Turn Input, Gemini Watcher, boundedString(), coverageLine(), cutAtWord(), formatClock(), frameInterval(), framesLine() (+23 more)

### Community 63 - "markdown.ts"
Cohesion: 0.10
Nodes (28): blockQuote(), buildList(), codeBlock, EMOJI, emojiImage(), emphasis(), EMPHASIS_RULES, escapeHtml() (+20 more)

### Community 64 - "server.py"
Cohesion: 0.15
Nodes (16): collections, http_server, json, math, ndarray, re, decode(), detect_speech() (+8 more)

### Community 65 - "social/service.ts"
Cohesion: 0.09
Nodes (25): Process Lifecycle, resolveBlueskyDid(), ParsedBlueskyThread, ReplyReaderDependencies, createSocialPostViewer(), failure(), initializeSocialPosts(), isAbort() (+17 more)

### Community 66 - "secrets.ts"
Cohesion: 0.28
Nodes (14): readText(), writeAtomic(), ALWAYS_REQUIRED, checkKey(), deleteSecret(), entry(), envLine(), ExampleKey (+6 more)

### Community 67 - "vitest"
Cohesion: 0.05
Nodes (35): better-sqlite3, vitest, axis(), detailOf(), history(), mix(), openFixture(), seedGuild() (+27 more)

### Community 68 - "Design System Documentation"
Cohesion: 0.07
Nodes (27): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Action Chips, Badges (+19 more)

### Community 69 - "urls.ts"
Cohesion: 0.13
Nodes (27): ReplyFetchContext, post, mocks, post(), xVideo, PAGE, settings, hostMatches() (+19 more)

### Community 70 - "HeaderUtilities.tsx"
Cohesion: 0.11
Nodes (26): NoticeRow(), NotificationCenter(), THEMES, ThemeSwitch(), ToastCard(), Toaster(), TONE_ICON, ActionChip() (+18 more)

### Community 71 - "package.json"
Cohesion: 0.07
Nodes (27): description, engines, node, typescript, main, name, type, version (+19 more)

### Community 72 - "test"
Cohesion: 0.16
Nodes (15): Shipping, Deploy and Roll Back, GHCR Visibility, How a Deploy Runs, Redeploy, Release to Stable, Roll Back, Self-Hosted Runner (+7 more)

### Community 73 - "File Upload Handling"
Cohesion: 0.17
Nodes (9): countedBody(), deleteFile(), FileResource, getFile(), sleep(), streamToFiles(), UploadedFile, videoDurationSec() (+1 more)

### Community 74 - "messageCreate.test.ts"
Cohesion: 0.14
Nodes (9): NAME_MENTION_REGEX, createRateLimiter(), handle(), metrics, mocks, turnEntryWork, assertTurnEntryRejections(), TurnEntryRejection (+1 more)

### Community 75 - "renderPayload.ts"
Cohesion: 0.36
Nodes (12): asObject(), asObjects(), chunkLabel(), componentDetails(), walk(), isComponentsV2Payload(), PayloadObject, renderEmbeds() (+4 more)

### Community 76 - "roka Service"
Cohesion: 0.20
Nodes (10): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+2 more)

### Community 77 - "getDb"
Cohesion: 0.04
Nodes (78): metrics Config Section, attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow (+70 more)

### Community 78 - "memoryEpisodeReplay.ts"
Cohesion: 0.16
Nodes (11): EpisodeReplayContext, GapDistribution, loadSessionHistorySnapshot(), measureEpisodeGaps(), MemoryEpisodeReplayAdapters, MemoryEpisodeReplayLine, MemoryEpisodeReplayReport, percentile() (+3 more)

### Community 79 - "searchNativeGemini.test.ts"
Cohesion: 0.14
Nodes (5): FLASH_LITE, GeminiClient, GenerateContent, mocks, usageRecords

### Community 80 - "watch.ts"
Cohesion: 0.23
Nodes (15): WatchWindow, elapsedSince(), getClient(), instructions(), mediaPart(), messageOf(), reasonFor(), requestFor() (+7 more)

### Community 81 - "searchNativeAnthropic.test.ts"
Cohesion: 0.05
Nodes (61): Native Time Budget, AnthropicMessagesClient, callUsage(), classifyAnthropicError(), ProviderError, SEARCH_EXCERPTS_UNTRUSTED_DATA_LABEL, nativeSearchTimeMs(), buildAnswer() (+53 more)

### Community 82 - "searchPrefetchShadow.ts"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "models.ts"
Cohesion: 0.15
Nodes (18): Extraction Funnel, Extraction Run Trace, Fact Reclassification, PROVIDER_KEY_ENV, stringField(), BuiltIn, detail(), errorText() (+10 more)

### Community 84 - "messageContent.ts"
Cohesion: 0.08
Nodes (35): MediaAttachment, isSupportedMedia(), collectEmbedVideoUrls(), describeEmbed(), describeForwardedSnapshots(), describePoll(), embedMatchesSocialPost(), embedVideoUrl() (+27 more)

### Community 85 - "PackFileScreen.tsx"
Cohesion: 0.07
Nodes (56): react, DiffView(), Band, bandFor(), MEMORY, PanelTab, PreviewPanel(), PreviewPanelProps (+48 more)

### Community 86 - "DiscordPreview.tsx"
Cohesion: 0.19
Nodes (19): Avatar(), CAPTIONS, Chip(), describe(), DiscordPreview(), filled(), firstLine(), Message() (+11 more)

### Community 87 - "config.ts"
Cohesion: 0.05
Nodes (63): Configuration (AGENTS.md), Source Files, At a Glance, Failure Classification, Legacy Config, Models, Request Shaping, Resolution (+55 more)

### Community 88 - "Social Post Viewing Research"
Cohesion: 0.29
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "character/index.ts"
Cohesion: 0.09
Nodes (33): MemoryScope, AssemblerInput, STABLE_PREFIXES, CORE_PROMPT, CORE_PROMPT_FORGET_ONLY, CORE_PROMPT_MEMORY_FREE, FaceGroup, FACES (+25 more)

### Community 90 - "Jev Judgments"
Cohesion: 0.22
Nodes (9): At a Glance, Configuration, Jev Judgments, Modes, Questions, Search Prefetch, Tools, Turn Events (+1 more)

### Community 91 - "extractionSchema.ts"
Cohesion: 0.05
Nodes (40): AddOperationSchema, calendarDateProperties, DATED_GUILD_PREDICATES, DatedGuildAddOperationSchema, DatedGuildPredicateId, datedGuildPredicates, DatedGuildPredicateSchema, DatedGuildUpdateOperationSchema (+32 more)

### Community 92 - "RateLimiter"
Cohesion: 0.06
Nodes (25): ALLOWED_MEDIA_TYPES, askCommand, command, ASK_ATTACHMENT_SLOTS, attachmentOptionName(), gachaCommand, gameCommands, hangmanCommand (+17 more)

### Community 93 - "pack.ts"
Cohesion: 0.17
Nodes (24): readConfig(), apiPath(), StudioError, assemble(), invalid(), loadScratch(), markdownUnder(), MEMORY_MODES (+16 more)

### Community 94 - "memoryClaimSchema.ts"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 95 - "persona-turns.ts"
Cohesion: 0.23
Nodes (10): T0, chatTurns(), localHour(), mergeRoles(), Message, sample(), Turn, TurnKind (+2 more)

### Community 96 - "read_wav"
Cohesion: 0.38
Nodes (5): read_wav(), WavError, make_wav(), ReadWavTest, ValueError

### Community 97 - "fixtures.ts"
Cohesion: 0.07
Nodes (23): @axe-core/playwright, @playwright/test, PAGES, studio_ui_e2e_fixtures_expect, Studio, test, index(), indexRow() (+15 more)

### Community 98 - "replay-memory-v2.ts"
Cohesion: 0.24
Nodes (12): ref_node_perf_hooks, argumentsFrom(), estimatedTokens(), inputText(), liveAdapters(), measure(), loadTranscriptLines(), main() (+4 more)

### Community 99 - "downloadAttachment"
Cohesion: 0.26
Nodes (10): Download, downloadAttachment(), readWithinLimit(), isobmffAllowsPrefix(), PrefixPolicy, prefixPolicyFor(), STREAMABLE_TYPES, box() (+2 more)

### Community 100 - "app.test.ts"
Cohesion: 0.12
Nodes (18): StudioOptions, DEFAULT_BASE_URLS, ApiError, commentedConfig(), ENV_TEXT, FilesBody, json(), MODEL_ENV (+10 more)

### Community 101 - "api.ts"
Cohesion: 0.16
Nodes (16): FileEdit, MemoryMode, ModelCapabilities, ModelPrice, ModelProfile, ModelTest, Pack, PackFile (+8 more)

### Community 102 - "linesGolden.test.ts"
Cohesion: 0.22
Nodes (23): Field Reference, lines.yml, Commands, stopReminderScheduler(), stopStatusCycler(), anime(), Collect, command() (+15 more)

### Community 103 - "measure.ts"
Cohesion: 0.35
Nodes (9): Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION, mimeForPath(), resolveKey(), TokenLimits (+1 more)

### Community 104 - "Features"
Cohesion: 0.18
Nodes (11): Any Model, Bring Your Own Character, Built to Stay Up, Conversation First, Eyes and Ears, Features, Games and Stats, Memory (+3 more)

### Community 105 - "turnMedia.test.ts"
Cohesion: 0.18
Nodes (6): apiKey(), digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf()

### Community 107 - "Deployment"
Cohesion: 0.20
Nodes (10): At a Glance, Bot Image (`Dockerfile`), Deployment, Docker Build, Docker Compose, Raspberry Pi Notes, `roka` Service, Sidecar Images (+2 more)

### Community 108 - "Data and Backups"
Cohesion: 0.18
Nodes (11): Bug Reports, Data and Backups, Episodes, Media Memory and Recall, Failure Diagnostics, Memory Claims and Extraction Queue, Memory V2 Migration, Overview and Backups, Reclassification (+3 more)

### Community 109 - "ExtractionEpisode"
Cohesion: 0.16
Nodes (13): AdmissionResult, admitEpisode(), isTrivial(), normalize(), precheckEpisode(), SENSITIVE_PATTERNS, mocks, ExtractionEpisode (+5 more)

### Community 110 - "Configuration Changes"
Cohesion: 0.20
Nodes (10): Any OpenAI-Compatible Model, Budgets and Monthly Spend, Configuration Changes, Discord App Install and Permissions, Environment Switches, Gemini Terms, Hedging Slow Calls, Reply Model and Fallback (+2 more)

### Community 111 - "System Architecture"
Cohesion: 0.12
Nodes (16): Architecture, At a Glance, Core Code Modules, Discord Events (Inbound), Durable State, Gateway Setup, Installation and Context Policy, InteractionCreate (`/ask`) (+8 more)

### Community 112 - "replyShape.ts"
Cohesion: 0.07
Nodes (44): Tunables, Known Limits, Rerunning the Check, Results, Roka Voice v4: Looked-Up Turns and Saying No, Root Causes, Tunables, What Changed (+36 more)

### Community 116 - "Characters"
Cohesion: 0.12
Nodes (18): A Pack Outside the Image, At a Glance, character.yml, Characters, Harness Prompts and Overrides, How the Bot Picks a Pack, Make a New Character, moods.yml (+10 more)

### Community 117 - "promptSafety.ts"
Cohesion: 0.08
Nodes (37): At a Glance, Changing a Contract, Modules, Rules Across Modules, SQLite Is Canonical, Technical Requirements, The Character Pack Is the Persona Source, The System Prompt Has a Size Cap (+29 more)

### Community 118 - "roka.ts"
Cohesion: 0.04
Nodes (65): BackoffOptions, classifyGeminiFailure(), classifyMarker(), computeBackoff(), DEFAULT_MAX_BACKOFF_MS, extractGeminiStatus(), FailureKind, GeminiFailureResult (+57 more)

### Community 119 - "replyBlocks.ts"
Cohesion: 0.38
Nodes (8): blockCount(), BlockKind, capReplyBlocks(), countReplyBlocks(), MAX_REPLY_BLOCKS, parse(), Piece, splitAtDividers()

### Community 120 - "metadata.ts"
Cohesion: 0.18
Nodes (18): ref_node_url, api(), assignable(), CommitlintConfig, GitHubActor, GitHubIssue, GitHubLabel, GitHubPullRequest (+10 more)

### Community 121 - "extractionSchema.test.ts"
Cohesion: 0.09
Nodes (20): EXTRACTION_RESPONSE_SCHEMA, ExtractionOutputSchema, GUILD_PREDICATES, comparable(), DateVariant, GEMINI_SCHEMA, keysIn(), subject (+12 more)

### Community 122 - "pack/ProblemBanner.tsx"
Cohesion: 0.19
Nodes (17): BannerShell(), BannerShellProps, Route, FormPageProps, firstLine(), lineFor(), ProblemBanner(), screenName() (+9 more)

### Community 123 - "cli.ts"
Cohesion: 0.22
Nodes (11): ref_node_util, main(), rokaAuthor(), transcriptMessages(), TranscriptTurnRecords, PreviewAuthor, PreviewMessage, renderPreviewPage() (+3 more)

### Community 124 - "Raspberry Pi Runbook"
Cohesion: 0.22
Nodes (9): Access, At a Glance, Bot Lifecycle, Docker, Network, Raspberry Pi Runbook, Source Files, System (+1 more)

### Community 125 - "Data Models and Storage"
Cohesion: 0.22
Nodes (9): At a Glance, Bug Reports, Data Models and Storage, Database File, Outbound Model Request, Persistence and Storage, Retention, Source Files (+1 more)

### Community 126 - "Engines"
Cohesion: 0.33
Nodes (6): NamedTuple, Engines, load_engines(), main(), SpeechServer, ThreadingHTTPServer

### Community 127 - "Linting Configuration"
Cohesion: 0.67
Nodes (3): lint-staged, *.{json,md,yml,yaml}, *.{ts,js}

### Community 129 - "probe-llm-profile.ts"
Cohesion: 0.10
Nodes (31): dotenv, CITY_SCHEMA, hasThinkingTag(), isFilled(), isSupportedProfile(), isTimeZone(), judgeJson(), judgeText() (+23 more)

### Community 130 - "main.test.ts"
Cohesion: 0.28
Nodes (4): browserCommands(), Command, openBrowser(), children

### Community 131 - "anthropicLlm.test.ts"
Cohesion: 0.11
Nodes (19): @anthropic-ai/sdk, AnthropicLlm, STRUCTURED_OUTPUT_TOOL, ContentBlock, fixtures, usage(), answer(), budget (+11 more)

### Community 132 - "reportHandler.ts"
Cohesion: 0.24
Nodes (14): isAllowedDiscordCdnUrl(), AttachmentCopyError, copyAttachment(), handleReportCommand(), moduleDirectory, packageMetadata, projectDirectory, readLimitedBody() (+6 more)

### Community 133 - "contentKey.ts"
Cohesion: 0.46
Nodes (6): bytesContentKey(), DISCORD_CDN_HOSTS, embedVideoContentKey(), postContentKey(), requireId(), youtubeContentKey()

### Community 134 - "toolTrigger.ts"
Cohesion: 0.09
Nodes (27): emitTrialRecord(), GATE1_FLOOR_MS, MAX_TRIAL_RETRIES, BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey(), DIAGNOSTIC_TIMEOUT_MS, errorText() (+19 more)

### Community 136 - "deploy Job"
Cohesion: 0.48
Nodes (7): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping)

### Community 137 - "ref_node_os"
Cohesion: 0.12
Nodes (11): js-yaml, ref_node_os, ref_node_worker_threads, Label, labels, raw, ./src/config.ts, ./src/utils/logger.ts (+3 more)

### Community 138 - "getLocalHour"
Cohesion: 0.36
Nodes (6): getStatusForHour(), updateStatus(), getLocalHour(), formatTrialRecord(), TrialRecord, record

### Community 139 - "Product Requirements"
Cohesion: 0.22
Nodes (8): At a Glance, Functional Requirements, Objectives, Problem, Product Requirements, Source Files, Target Users, User Workflow

### Community 140 - "Reliability"
Cohesion: 0.18
Nodes (11): A Spent Day Is Not a Spent Minute, ADK Error Delivery Constraint, At a Glance, Concurrency and Lifecycle Under Retry, Configuration, Failure Kinds, Model Switch, Reliability (+3 more)

### Community 142 - "Contributing"
Cohesion: 0.25
Nodes (7): Branches, Contributing, Gates, Labels and Assignees, Merging, Pull Requests, Titles

### Community 143 - "UI TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals (+6 more)

### Community 144 - "load.ts"
Cohesion: 0.05
Nodes (58): main(), MEMORY_MODES, summary(), copies, run(), buildContextPrompt(), Character, deepFreeze() (+50 more)

### Community 145 - "Conventions"
Cohesion: 0.29
Nodes (6): Code Style, Commands, Commits, Configuration, Conventions, Documentation

### Community 146 - "attachmentCost.ts"
Cohesion: 0.15
Nodes (17): Token Admission, anthropicBlock(), countWithAnthropic(), estimateTokens(), imageTokens(), measureAttachmentTokens(), needsMeasuring(), pdfPages() (+9 more)

### Community 147 - "guildFactDates.test.ts"
Cohesion: 0.40
Nodes (5): GuildFactDate, DateResolver, expectResolved(), loadResolver(), ResolvedDate

### Community 148 - "@google/adk"
Cohesion: 0.10
Nodes (25): `search`, Budgets, Usage and Cost, Per-Call Budgets, @google/adk, describeUsage(), KEY_ENV, main(), MODEL (+17 more)

### Community 149 - "render.ts"
Cohesion: 0.11
Nodes (39): MarkdownContext, renderPlainText(), asObject(), asObjects(), authorKey(), avatarUrl(), BUTTON_STYLES, emojiHtml() (+31 more)

### Community 150 - "Configuration"
Cohesion: 0.07
Nodes (31): At a Glance, Capture and Prompt, Character, Configuration, `discord`, `embeddings`, `emoji`, `fallback` (+23 more)

### Community 151 - "persona-replay.ts"
Cohesion: 0.11
Nodes (28): ANTHROPIC_SEARCH, appendReplyShape(), Arm, claudeSettings(), GEMINI_CONFIG, GEMINI_SEARCH, loadArm(), LoadedArm (+20 more)

### Community 152 - "turnContext.ts"
Cohesion: 0.05
Nodes (58): Source Files, Turn Entry Work, Embeddings and Episodic Recall, At a Glance, Memory Modes, Mood Detection, Prompt Engine, Safety Ladder (+50 more)

### Community 153 - "Memory"
Cohesion: 0.18
Nodes (11): At a Glance, Browse Memory in Obsidian, Forgetting and Opting Out, How She Learns, Key Settings, Maintenance Scripts, Memory, Privacy Settings (+3 more)

### Community 154 - "reports.ts"
Cohesion: 0.43
Nodes (6): main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne()

### Community 155 - "duration.ts"
Cohesion: 0.33
Nodes (8): Box, movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0(), mvhdV1()

### Community 156 - "test_server.py"
Cohesion: 0.22
Nodes (8): io, numpy, os, clean_text(), CleanTextTest, sys, unittest, wave

### Community 157 - "citations.ts"
Cohesion: 0.48
Nodes (5): clampToBudget(), fitCitations(), sourceHost(), sourceLabel(), THREE

### Community 158 - "Media Watching"
Cohesion: 0.29
Nodes (7): Accounting, Media Watching, Qwen Watcher, Remembered Media, Speech Sidecar, Transport, Watcher Modes

### Community 160 - "README.md"
Cohesion: 0.24
Nodes (9): Jev Integration (Research Doc), Contributing, Documentation, How It Works, License, Privacy, Quick Start, Tech Stack (+1 more)

### Community 161 - "recall-calibration-thresholds.ts"
Cohesion: 0.19
Nodes (17): chooseFloor(), cli(), cohensKappa(), currentFloorOf(), KindReport, Label, main(), MIN_AGREED_PAIRS (+9 more)

### Community 163 - "judgments.ts"
Cohesion: 0.06
Nodes (47): Architecture (AGENTS.md), Critical Do-Nots, Project (Rokabot description), fallback Config Section, gemini Config Section, jev Config Section, rateLimit Config Section, session Config Section (+39 more)

### Community 164 - "Product"
Cohesion: 0.17
Nodes (10): Accessibility & Inclusion, Anti-references, Brand Personality, Design Principles, Platform, Positioning, Product, Product Purpose (+2 more)

### Community 165 - "API and Security Tests"
Cohesion: 0.20
Nodes (10): API, Errors, Model Connection Test, Pack File Rules, Persona Studio, Security Model, Source Files, Start It (+2 more)

### Community 166 - "Models"
Cohesion: 0.13
Nodes (15): Any OpenAI-Compatible Model, At a Glance, Budgets and Limits, Capabilities Reference, Choose the Main and Fallback, Copy-Paste Entries, Entry Options, Fields for OpenAI-Compatible Entries (+7 more)

### Community 169 - "Deployment and Setup Guide"
Cohesion: 0.14
Nodes (14): At a Glance, First-Run Checks, Getting Started, Install and Configure, Model Keys for the Shipped Config, Next Steps, Prerequisites, Register Slash Commands (+6 more)

### Community 170 - "Auto-Deploy Platforms"
Cohesion: 0.14
Nodes (13): Answer, Auto-Deploy Platforms, Coolify, Docker API Version, Fly.io, GHCR Limits, Maintained Fork, Original Project (+5 more)

### Community 171 - "searchWeb"
Cohesion: 0.10
Nodes (16): Where Rokabot Decides Today, Canon Research, Complaints After the Haiku Switch, Known Weak Spots, Replay and Blind-Judge Method, Rerunning the Check, Results, Roka Voice v3: Restoring Variety on Haiku (+8 more)

### Community 173 - "persona-report.ts"
Cohesion: 0.26
Nodes (13): countSlurRepetitions(), firstWord(), formatTable(), innerThoughts(), main(), MARKERS, paragraphs(), pct() (+5 more)

### Community 174 - "Embedding Project Config"
Cohesion: 0.15
Nodes (12): compilerOptions, lib, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+4 more)

### Community 176 - "redditFeed.ts"
Cohesion: 0.38
Nodes (10): decodeEntities(), entryAuthor(), entryContent(), feedEntries(), feedField(), htmlToText(), NAMED_ENTITIES, parseRedditFeedPost() (+2 more)

### Community 179 - "Features"
Cohesion: 0.18
Nodes (11): At a Glance, Features, Games and Gacha, Memory, Reactions, Status Rotation and Update Notices, Reminders, Seeing and Watching, Source Files (+3 more)

### Community 180 - "Embedding Service Docs"
Cohesion: 0.20
Nodes (9): API, Build and Run, Configuration, Embedding Sidecar, `GET /health`, Model and Licences, `POST /embed`, Smoke Test (+1 more)

### Community 181 - "Media and Sidecars"
Cohesion: 0.20
Nodes (10): Hosted Images, Local Embeddings Sidecar, Media and Sidecars, Media Kill Switches, Media Watching, Social Post Viewing, Speech Sidecar, Footer (+2 more)

### Community 182 - "parts.tsx"
Cohesion: 0.07
Nodes (60): lucide-react, Badge(), BadgeTone, TONES, Field(), FieldProps, Option, Select() (+52 more)

### Community 183 - "Multimodal Intake Research"
Cohesion: 0.12
Nodes (21): ALLOWED_IMAGE_TYPES Consolidation, Attachment History Stripping, Audio Intake Recommendation, Byte Cap as Duration Proxy, Container Memory Cap Correction, Flash-Lite Modality Verification, Global In-Flight Byte Budget, Inline Data vs Files API Decision (+13 more)

### Community 184 - "views.test.ts"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 186 - "measure-prefetch.ts"
Cohesion: 0.19
Nodes (9): main(), MeasurementAnomaly, Options, parseOptions(), percentile(), PrefetchMeasurementCase, PrefetchMeasurementSummary, PrefetchMeasurementTrial (+1 more)

### Community 187 - "Speech Pattern Documentation"
Cohesion: 0.25
Nodes (7): Dialogue Style, Example Lines, Example Replies With Structure, Expressions, Formatting Your Reply, Speech Patterns, Verbal Style

### Community 188 - "Persona Identity Definition"
Cohesion: 0.25
Nodes (7): Identity & Appearance, Insecurities, People You Know, Personality, Romantic Side, Who You Are, Your World

### Community 193 - "Changelog"
Cohesion: 0.20
Nodes (9): [0.2.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.1.0...v0.2.0) (2026-10-16), [0.3.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.2.0...v0.3.0) (2026-10-16), [0.4.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.3.0...v0.4.0) (2026-10-17), Bug Fixes, Bug Fixes, Changelog, Features, Features (+1 more)

### Community 194 - "Character Packs"
Cohesion: 0.25
Nodes (7): Character Packs, Layout, Locked Prompts, Macros, Making a New Character, Prompt Files, Search Prompts

### Community 195 - "ref_node_fs"
Cohesion: 0.08
Nodes (22): ref_node_assert, ref_node_crypto, ref_node_fs, ref_node_http, ref_node_path, spriteFiles, EmbedReply, golden (+14 more)

### Community 197 - "Audio Video Documentation"
Cohesion: 0.50
Nodes (3): Audio and Video, When You Couldn't Watch It, When You've Watched Something

### Community 198 - "Release Configuration"
Cohesion: 0.50
Nodes (3): bootstrap-sha, packages, $schema

### Community 221 - "ASR Sidecar"
Cohesion: 0.22
Nodes (8): API, ASR Sidecar, Build and Run, Configuration, `GET /health`, Models and Licences, `POST /transcribe?maxSpeechSec=120`, Tests

### Community 224 - "Segment"
Cohesion: 0.42
Nodes (4): Keep time-ordered segments within the speech budget, spread across the clip.…, Segment, select_segments(), SelectSegmentsTest

### Community 226 - "transcribe.test.ts"
Cohesion: 0.08
Nodes (31): ref_node_child_process, EMPTY, extractFrame(), extractFrames(), frameBins(), frameCount(), FrameRunner, FrameSource (+23 more)

### Community 229 - "UI Styling Assets"
Cohesion: 0.33
Nodes (5): @fontsource-variable/geist, @fontsource-variable/geist-mono, react-dom, root, studio_ui_src_styles

### Community 230 - "pull_request_template.md"
Cohesion: 0.50
Nodes (3): Evidence, Merge Danger, Summary

### Community 231 - "vectorProvenance.ts"
Cohesion: 0.08
Nodes (33): EmbeddingClient, EmbeddingRole, EmbeddingSettings, FACTORIES, getEmbeddingClient(), resetEmbeddingClientForTest(), createGeminiEmbeddingClient(), createLocalEmbeddingClient() (+25 more)

### Community 234 - "config"
Cohesion: 0.05
Nodes (47): Tech Stack (AGENTS.md), emoji Config Section, logging Config Section, sharp, GEMINI_IMAGE_TOKENS, PreparedAttachments, src_agent_media_imageprocessor_gemini_image_tokens, processImageForGemini() (+39 more)

### Community 236 - "Decisions"
Cohesion: 0.22
Nodes (8): Agent and Prompts, Decisions, Deployment, Discord, Media, Memory, Models and Search, Repository

### Community 247 - "displayName"
Cohesion: 0.43
Nodes (7): AssemblerInput, Data Models, RateLimiterConfig, ToneKey, WindowMessage, displayName(), number()

### Community 249 - "interactionCreate.memory.test.ts"
Cohesion: 0.33
Nodes (4): CapturingRunner, makeInteraction(), mocks, turn()

### Community 250 - "Coding Guidelines (Andrej Karpathy)"
Cohesion: 0.33
Nodes (5): 1. Think Before Coding, 2. Simplicity First, 3. Surgical Changes, 4. Goal-Driven Execution, Coding Guidelines (Andrej Karpathy)

## Knowledge Gaps
- **1674 isolated node(s):** `$schema`, `indentStyle`, `indentWidth`, `lineWidth`, `enabled` (+1669 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2185 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **51 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `profiles.ts`, `jevReplay.ts`, `qwenWatch.ts`, `memoryEpisodeStore.ts`, `buddy.ts`, `messageBuilder.ts`, `memoryClaims.ts`, `createModel.test.ts`, `src/index.ts`, `roka.test.ts`, `parsers.ts`, `messageCreate.ts`, `tools/index.ts`, `replies/service.ts`, `statsStore.ts`, `memoryRecallStore.ts`, `predicates.ts`, `attemptBudget.ts`, `memoryShadow.ts`, `run.ts`, `discord.js`, `test-chat.ts`, `turnMedia.ts`, `recall.ts`, `games/router.ts`, `youtubeStreams.ts`, `toolTriggerScoring.ts`, `episodeTracker.ts`, `getAnimeSchedule.ts`, `fallbackModel.ts`, `yamlEdit.ts`, `retriever.ts`, `generateObject.ts`, `mediaRules.ts`, `charts.ts`, `promptGolden.test.ts`, `Inline Data Contract`, `handler.ts`, `anthropicLlm.ts`, `budget.ts`, `recall-calibration-sample.ts`, `reportStore.ts`, `videoVariant.ts`, `digest.ts`, `social/service.ts`, `urls.ts`, `package.json`, `File Upload Handling`, `messageCreate.test.ts`, `getDb`, `memoryEpisodeReplay.ts`, `searchNativeGemini.test.ts`, `searchNativeAnthropic.test.ts`, `searchPrefetchShadow.ts`, `messageContent.ts`, `config.ts`, `character/index.ts`, `RateLimiter`, `persona-turns.ts`, `downloadAttachment`, `app.test.ts`, `linesGolden.test.ts`, `measure.ts`, `turnMedia.test.ts`, `ExtractionEpisode`, `replyShape.ts`, `promptSafety.ts`, `roka.ts`, `replyBlocks.ts`, `metadata.ts`, `extractionSchema.test.ts`, `probe-llm-profile.ts`, `main.test.ts`, `anthropicLlm.test.ts`, `contentKey.ts`, `toolTrigger.ts`, `sessionAttachmentRetention.contract.test.ts`, `ref_node_os`, `getLocalHour`, `load.ts`, `attachmentCost.ts`, `guildFactDates.test.ts`, `@google/adk`, `persona-replay.ts`, `turnContext.ts`, `duration.ts`, `citations.ts`, `judgments.ts`, `searchWeb`, `persona-report.ts`, `redditFeed.ts`, `views.test.ts`, `measure-prefetch.ts`, `ref_node_fs`, `transcribe.test.ts`, `vectorProvenance.ts`, `config`, `interactionCreate.memory.test.ts`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **Why does `config` connect `config` to `memoryEpisodeStore.ts`, `reportHandler.ts`, `buddy.ts`, `toolTrigger.ts`, `memoryClaims.ts`, `src/index.ts`, `roka.test.ts`, `messageCreate.ts`, `tools/index.ts`, `replies/service.ts`, `attachmentCost.ts`, `memoryRecallStore.ts`, `predicates.ts`, `turnContext.ts`, `attemptBudget.ts`, `memoryShadow.ts`, `run.ts`, `discord.js`, `turnMedia.ts`, `recall-calibration-thresholds.ts`, `judgments.ts`, `recall.ts`, `youtubeStreams.ts`, `games/router.ts`, `episodeTracker.ts`, `getAnimeSchedule.ts`, `fallbackModel.ts`, `searchWeb`, `retriever.ts`, `generateObject.ts`, `mediaRules.ts`, `anthropicLlm.ts`, `budget.ts`, `recall-calibration-sample.ts`, `social/service.ts`, `vitest`, `ref_node_fs`, `File Upload Handling`, `messageCreate.test.ts`, `watch.ts`, `searchNativeAnthropic.test.ts`, `config.ts`, `RateLimiter`, `linesGolden.test.ts`, `vectorProvenance.ts`, `roka.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `react` connect `PackFileScreen.tsx` to `YamlForm.tsx`, `UI Styling Assets`, `HeaderUtilities.tsx`, `package.json`, `configShared.tsx`, `workspace.ts`, `parts.tsx`, `Secrets.tsx`, `DiscordPreview.tsx`, `pack/ProblemBanner.tsx`, `Moods.tsx`, `Prompts.tsx`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `$schema`, `indentStyle`, `indentWidth` to the rest of the system?**
  _1674 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `profiles.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0506558118498417 - nodes in this community are weakly interconnected._
- **Should `jevReplay.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1310483870967742 - nodes in this community are weakly interconnected._
- **Should `qwenWatch.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10344827586206896 - nodes in this community are weakly interconnected._