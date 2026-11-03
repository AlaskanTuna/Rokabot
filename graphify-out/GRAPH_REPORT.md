# Graph Report - restructure  (2026-11-03)

## Corpus Check
- 713 files · ~595,805 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 30 file(s) not represented in the graph (top: (none) 13, .jsonl 11, .rss 2)

## Summary
- 5780 nodes · 16058 edges · 257 communities (208 shown, 49 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 532 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a1900a60`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- media.ts
- jevReplay.ts
- qwenWatch.ts
- memoryEpisodeStore.ts
- Project Linting Config
- buddy.ts
- messageBuilder.ts
- getDb
- test-features.ts
- scheduler.ts
- searchNativeAnthropic.test.ts
- queries.ts
- discordDoubles.ts
- messageCreate.ts
- reminder.ts
- __tests__/tools.test.ts
- views.ts
- replies/service.ts
- guildFactDates.ts
- episodeTracker.ts
- Dev Tooling Dependencies
- WindowedSessionService
- workspace.ts
- memoryShadow.ts
- database.ts
- turnContext.ts
- run.ts
- Project Dependencies
- Secrets.tsx
- rateLimiter.ts
- PreviewPanel.tsx
- TypeScript Configuration
- turnMedia.ts
- YamlForm.tsx
- scripts
- recall-calibration.test.ts
- gameCommands.ts
- youtubeStreams.ts
- toolTriggerScoring.ts
- memoryEpisodeReplay.ts
- getAnimeSchedule.ts
- worst-case.ts
- profiles.ts
- pack.ts
- configShared.tsx
- discord/attachments.ts
- recall.ts
- generateObject.ts
- discord.js
- charts.ts
- parts.tsx
- Inline Data Contract
- TypeScript Build Config
- handler.ts
- extractionSchema.test.ts
- anthropicLlm.ts
- obsidianExport.ts
- budget.ts
- schedule.test.ts
- Moods.tsx
- reportStore.ts
- extractor.ts
- digest.ts
- markdown.ts
- Speech-to-Text HTTP Server
- socialPosts/service.ts
- serve.ts
- parsers.ts
- Design System Documentation
- vitest
- Prefetch Measurement Tools
- package.json
- test
- File Upload Handling
- interactionCreate.metrics.test.ts
- anthropicMain.eval.test.ts
- roka Service
- quotaDiagnostic.ts
- getWeather.ts
- views.test.ts
- watch.ts
- logger.ts
- Search Prefetch Reporting
- models.ts
- messageContent.ts
- PackFileScreen.tsx
- src/index.ts
- config.ts
- Social Post Viewing Research
- ToneKey
- reportCommand.ts
- extractionSchema.ts
- test-chat.ts
- embeddings/client.ts
- memoryClaimSchema.ts
- chatCompletionsLlm.ts
- WAV File Validation
- load.ts
- reclassifyModels.ts
- ASR Sidecar Service
- app.test.ts
- fallbackModel.ts
- timezone.ts
- GPT-6-Astra
- duration.ts
- turnMedia.test.ts
- Commit Linting Rules
- verifyThreshold
- Raspberry Pi Runbook
- Speech Budget Management
- gacha.ts
- redditFeed.ts
- replyShape.ts
- Documentation Style Guide
- Git Commit Standards
- Coding Best Practices
- Prompt Engine
- promptSafety.ts
- Audio Decoding Tests
- Memory
- metadata.ts
- emojiReactor.ts
- hiddenRetractions.test.ts
- cli.ts
- replyReader
- transcribe.test.ts
- Speech Server Engines
- Linting Configuration
- HTTP Request Handler
- probe-llm-profile.ts
- test-gemini-ga-compare.ts
- Speech Transcription Processing
- Speech Parsing Tests
- textEdit.ts
- displayName
- linesGolden.test.ts
- deploy Job
- ref_node_fs
- config
- Text Cleaning Utilities
- roka.ts
- verification.test.ts
- test-phase8.ts
- UI TypeScript Configuration
- System Architecture
- metrics.eval.test.ts
- agent/attachments.ts
- anthropicLlm.test.ts
- yamlEdit.ts
- render.ts
- Configuration
- persona-replay.ts
- searchPrefetch.ts
- privacy
- app.ts
- Reliability
- queries.test.ts
- updateNotifier.ts
- promptGolden.test.ts
- Jev Judgments
- README.md
- recall-calibration-thresholds.ts
- Characters
- judgments.ts
- Product
- API and Security Tests
- Models
- tools/index.ts
- scheduler.test.ts
- Deployment and Setup Guide
- Auto-Deploy Platforms
- searchWeb
- guildFactDates.test.ts
- persona-report.ts
- Embedding Project Config
- searchAnime.ts
- reportCommand.test.ts
- FakeInteraction
- toolTrigger.retry.test.ts
- Features
- Embedding Service Docs
- turnContext.test.ts
- react
- models.spec.ts
- playwright.config.ts
- admission.ts
- yamlText.ts
- Speech Pattern Documentation
- Persona Identity Definition
- collection.ts
- fingerprint.ts
- local.test.ts
- reminderScheduler.ts
- Changelog
- Character Packs
- packs.ts
- Contributing
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
- Prompts.tsx
- fixtures.ts
- toolTrigger.ts
- attachmentLimits.ts
- Product Requirements
- getCurrentTime.ts
- replyBlocks.ts
- UI Styling Assets
- pull_request_template.md
- gemini.test.ts
- socialPosts/format.ts
- extractionErrors.ts
- statusCycler.test.ts
- reports.ts
- Decisions
- smoke.ts
- Template Speaking Prompts
- Template Calm Mood
- Cheerful Mood Prompt
- Persona Identity Prompts
- interactionCreate.memory.test.ts
- Media Watching
- citations.ts
- Coding Guidelines (Andrej Karpathy)
- embeddings/__tests__/client.test.ts
- graphify.md
- issue-tracker.md
- rtk.md
- Deliberately Not Done
- Reference Docs (AGENTS.md)

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 247 edges
2. `vitest` - 241 edges
3. `config` - 119 edges
4. `logger` - 79 edges
5. `createMessageHandler()` - 54 edges
6. `closeDb()` - 53 edges
7. `discord.js` - 50 edges
8. `generateResponse()` - 49 edges
9. `createInteractionHandler()` - 48 edges
10. `assertClaim()` - 46 edges

## Surprising Connections (you probably didn't know these)
- `Token Admission` --references--> `prepareAttachments()`  [INFERRED]
  docs/trd/media.md → src/agent/attachments.ts
- `A Spent Day Is Not a Spent Minute` --references--> `computeBackoff()`  [INFERRED]
  docs/trd/reliability.md → src/agent/geminiReliability.ts
- `Client` --references--> `getJevClient()`  [INFERRED]
  docs/trd/jev.md → src/agent/jev/client.ts
- `Reply Model and Fallback` --references--> `luna()`  [INFERRED]
  docs/RUNBOOK.md → src/agent/llm/__tests__/chatCompletionsLlm.test.ts
- `At a Glance` --references--> `startCall()`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/budget.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Deploy-to-Pi CI/CD Pipeline** — _github_workflows_deploy_workflow, _github_workflows_deploy_test_job, _github_workflows_deploy_deploy_job, agents_working_conventions [EXTRACTED 0.90]
- **Multimodal Attachment Safety Pipeline** — docs_research_multimodal_global_byte_budget, docs_research_multimodal_streaming_size_guard, docs_research_multimodal_attachment_strip_history, docs_research_multimodal_tpm_ceiling_measurement, src_discord_bytebudget [INFERRED 0.95]

## Communities (257 total, 49 thin omitted)

### Community 0 - "media.ts"
Cohesion: 0.10
Nodes (28): At a Glance, Attachment Intake, Configuration, Global In-Flight Byte Budget, Link Priority, Linked Files (`attachment_url`), Lookup Limits, Media (+20 more)

### Community 1 - "jevReplay.ts"
Cohesion: 0.13
Nodes (26): parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, agreement(), buildConfusionMatrix(), buildProbabilityBins(), buildReplayTurn() (+18 more)

### Community 2 - "qwenWatch.ts"
Cohesion: 0.10
Nodes (23): Qwen Watcher, binOf(), ChatCompletion, ContentPart, promptFor(), quoted(), QwenFrame, QwenWatchInput (+15 more)

### Community 3 - "memoryEpisodeStore.ts"
Cohesion: 0.04
Nodes (92): better-sqlite3, EmbeddingResult, GEMINI_FINGERPRINT, geminiVector(), LOCAL_FINGERPRINT, localVector(), BackfillPace, delay() (+84 more)

### Community 4 - "Project Linting Config"
Cohesion: 0.05
Nodes (39): useLiteralKeys, css, formatter, files, ignore, formatter, enabled, indentStyle (+31 more)

### Community 5 - "buddy.ts"
Cohesion: 0.12
Nodes (29): BuddyRow, DailyBuddyHatch, DailyHatchRow, generateBuddy(), generateName(), generatePersonality(), getDailyHatchRow(), getStreak() (+21 more)

### Community 6 - "messageBuilder.ts"
Cohesion: 0.08
Nodes (37): discord Config Section, getExpressionUrl(), lastExpressionByTone, __resetExpressionState(), TONE_EXPRESSIONS, buildRokaMessage(), buildToolFooter(), footerLeads (+29 more)

### Community 7 - "getDb"
Cohesion: 0.07
Nodes (82): attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow, legalScopes() (+74 more)

### Community 8 - "test-features.ts"
Cohesion: 0.15
Nodes (28): assert(), fail(), pass(), results, TestResult, buildHangmanBody(), handleHangmanGuess(), handleHangmanStart() (+20 more)

### Community 9 - "scheduler.ts"
Cohesion: 0.10
Nodes (33): classifyExtractionError(), finishRunTrace(), noteError(), noteSummary(), RunOutcome, RunStage, RunTrace, startRunTrace() (+25 more)

### Community 10 - "searchNativeAnthropic.test.ts"
Cohesion: 0.08
Nodes (16): Failure Classification, FailureKind, AnthropicMessagesClient, ProviderId, ProviderError, budget, route(), ROUTES (+8 more)

### Community 11 - "queries.ts"
Cohesion: 0.10
Nodes (28): activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome, CountByPredicate (+20 more)

### Community 12 - "discordDoubles.ts"
Cohesion: 0.05
Nodes (43): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+35 more)

### Community 13 - "messageCreate.ts"
Cohesion: 0.10
Nodes (45): Replies, isMonitored(), markActive(), asksAboutReplies(), withReplyOutcomes(), withSearchCitations(), startTurnEntryWork(), release() (+37 more)

### Community 14 - "reminder.ts"
Cohesion: 0.20
Nodes (22): ref_discordjs_builders, mocks, createToolCommandHandler(), TOOL_COMMAND_NAMES, handleAnime(), dueSlots(), handleRemind(), handleRemindAt() (+14 more)

### Community 15 - "__tests__/tools.test.ts"
Cohesion: 0.25
Nodes (7): flipCoin(), FlipCoinResult, flipCoinTool, rollDiceTool, rollDice(), RollDiceParams, RollDiceResult

### Community 16 - "views.ts"
Cohesion: 0.13
Nodes (31): episodeCount(), memoryGrowthSeries(), newClaimsThisMonth(), retrySummary, tokenTotals, topChannels(), topPredicates(), topRememberedMembers() (+23 more)

### Community 17 - "replies/service.ts"
Cohesion: 0.20
Nodes (30): array(), nonNegativeInteger(), bilibiliAid(), fetchBilibiliReplies(), fetchBlueskyReplies(), BROWSER_USER_AGENT, compactReplyText(), failed() (+22 more)

### Community 18 - "guildFactDates.ts"
Cohesion: 0.26
Nodes (16): addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth(), monthForMonth() (+8 more)

### Community 19 - "episodeTracker.ts"
Cohesion: 0.14
Nodes (22): asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), resetEpisodeTrackerForTest(), scheduleLull() (+14 more)

### Community 20 - "Dev Tooling Dependencies"
Cohesion: 0.07
Nodes (29): devDependencies, @axe-core/playwright, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, diff, @fontsource-variable/geist, @fontsource-variable/geist-mono (+21 more)

### Community 21 - "WindowedSessionService"
Cohesion: 0.14
Nodes (7): Bytes Do Not Stay in History, attachmentMarker(), isStrippable(), WindowedSessionService, CapturingLlm, newConversation(), PNG_BASE64

### Community 22 - "workspace.ts"
Cohesion: 0.09
Nodes (56): App(), CommandPalette(), Item, Ambient(), Page(), PageProps, SaveActions(), StatusBadges() (+48 more)

### Community 23 - "memoryShadow.ts"
Cohesion: 0.20
Nodes (14): asClaim(), asScenario(), evaluateMemoryShadow(), FixtureClaim, loadReplaySet(), MemoryShadowReport, percentile95(), REPLAY_PATH (+6 more)

### Community 24 - "database.ts"
Cohesion: 0.05
Nodes (35): metrics Config Section, Database File, openFixture(), oldClaimId, undone, REMEMBER_TURN, runTurn(), ScriptedLlm (+27 more)

### Community 25 - "turnContext.ts"
Cohesion: 0.05
Nodes (74): Where Rokabot Decides Today, Models Summary, Prompt Engine Summary, Turn Walkthrough, getEmbeddingClient(), embedEpisodeText(), EpisodeEmbeddingRole, buildNameIndex() (+66 more)

### Community 26 - "run.ts"
Cohesion: 0.10
Nodes (33): createCaptureSink(), makeClient(), makeGuild(), makeInteraction(), makeMember(), makeUser(), fixturePath(), loadTranscript() (+25 more)

### Community 27 - "Project Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @anthropic-ai/sdk, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml (+7 more)

### Community 28 - "Secrets.tsx"
Cohesion: 0.15
Nodes (26): fieldClass(), Dialog(), Secret, middleEllipsis(), middleSplit(), actionId(), announce(), Bar() (+18 more)

### Community 29 - "rateLimiter.ts"
Cohesion: 0.09
Nodes (17): RateLimiterConfig, attachmentOptionName(), client, createInteraction(), mocks, rateLimiter(), mocks, askWith() (+9 more)

### Community 30 - "PreviewPanel.tsx"
Cohesion: 0.12
Nodes (30): DiffView(), Band, bandFor(), MEMORY, PanelTab, PreviewPanel(), PreviewPanelProps, DialogProps (+22 more)

### Community 31 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "turnMedia.ts"
Cohesion: 0.10
Nodes (44): Coverage Plan, isStreamedUpload(), durationFromTokens(), equalBins(), estimateMediaTokens(), FPS_LADDER, HalfWatch, HALVES_MAX_DURATION_SEC (+36 more)

### Community 33 - "YamlForm.tsx"
Cohesion: 0.15
Nodes (35): cleanComment(), Context, Group(), helpFor(), humanize(), isRecord(), MapBody(), MapFields() (+27 more)

### Community 34 - "scripts"
Cohesion: 0.06
Nodes (36): scripts, build, character, dev, dev:quiet, export:vault, format, format:check (+28 more)

### Community 35 - "recall-calibration.test.ts"
Cohesion: 0.09
Nodes (35): CandidateRow, chunk(), configuredEmbed(), Embed, loadShadowRows(), main(), MATCH_WINDOW_MS, matchTurnMessage() (+27 more)

### Community 36 - "gameCommands.ts"
Cohesion: 0.11
Nodes (41): games Config Section, ref_node_module, createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleHangmanGuide(), handleLeaderboard(), buildGameContainer() (+33 more)

### Community 37 - "youtubeStreams.ts"
Cohesion: 0.19
Nodes (19): metadata, realisticFormats, AudioFormat, audioFormats(), directHttpsUrl(), finiteNumber(), hasCodec(), headersOf() (+11 more)

### Community 38 - "toolTriggerScoring.ts"
Cohesion: 0.09
Nodes (28): CASE_SETS, fixturePath, header, rememberFixturePath, searchWebFixturePath, temporaryDirectories, testCase, asCase() (+20 more)

### Community 39 - "memoryEpisodeReplay.ts"
Cohesion: 0.10
Nodes (29): ref_node_perf_hooks, argumentsFrom(), estimatedTokens(), inputText(), liveAdapters(), measure(), loadTranscriptLines(), main() (+21 more)

### Community 40 - "getAnimeSchedule.ts"
Cohesion: 0.18
Nodes (18): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), GetAnimeScheduleParams, getCurrentSeason(), getTodayName() (+10 more)

### Community 41 - "worst-case.ts"
Cohesion: 0.12
Nodes (32): sandboxPaths(), appendToBlock(), applyDataset(), applyEmpty(), applyOne(), applyWorst(), base64url(), blockRange() (+24 more)

### Community 42 - "profiles.ts"
Cohesion: 0.04
Nodes (55): Budgets, Usage and Cost, @google/adk, scripted(), BudgetDenial, ChatCompletionsLlm, ChatCompletionsProvider, ModelScopeLlm, COMPATIBLE_DEFAULTS (+47 more)

### Community 43 - "pack.ts"
Cohesion: 0.16
Nodes (25): writeAtomic(), StudioError, assemble(), FileEdit, invalid(), loadScratch(), markdownUnder(), MEMORY_MODES (+17 more)

### Community 44 - "configShared.tsx"
Cohesion: 0.09
Nodes (51): diff, FOCUS_ORDER, Route, DiscordScreen(), ELSEWHERE, OWN, LimitsScreen(), BLOCKS (+43 more)

### Community 45 - "discord/attachments.ts"
Cohesion: 0.06
Nodes (44): ALLOWED_IMAGE_TYPES Consolidation, Attachment History Stripping, Audio Intake Recommendation, Byte Cap as Duration Proxy, Concurrency Binding Constraint, Container Memory Cap Correction, Flash-Lite Modality Verification, Global In-Flight Byte Budget (+36 more)

### Community 46 - "recall.ts"
Cohesion: 0.16
Nodes (31): cosineSimilarity(), factKey(), nicknameRows(), canRecall(), byScore(), cooldownPenalty(), coreRank(), countKind() (+23 more)

### Community 47 - "generateObject.ts"
Cohesion: 0.06
Nodes (31): Background Jobs, @google/genai, adapterFor(), adapters, attempt(), BackgroundWorkload, callUsage(), GenerateObjectInput (+23 more)

### Community 48 - "discord.js"
Cohesion: 0.13
Nodes (21): discord.js, character, askCommand, command, gachaCommand, gameCommands, hangmanCommand, shiritoriCommand (+13 more)

### Community 49 - "charts.ts"
Cohesion: 0.21
Nodes (16): @napi-rs/canvas, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+8 more)

### Community 50 - "parts.tsx"
Cohesion: 0.10
Nodes (42): Badge(), BadgeTone, TONES, Field(), FieldProps, Option, Select(), SelectProps (+34 more)

### Community 51 - "Inline Data Contract"
Cohesion: 0.29
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 52 - "TypeScript Build Config"
Cohesion: 0.22
Nodes (8): ./tsconfig.json, compilerOptions, noEmit, rootDir, types, exclude, extends, include

### Community 53 - "handler.ts"
Cohesion: 0.06
Nodes (39): @huggingface/transformers, @types/node, dependencies, @huggingface/transformers, devDependencies, @types/node, typescript, engines (+31 more)

### Community 54 - "extractionSchema.test.ts"
Cohesion: 0.09
Nodes (20): EXTRACTION_RESPONSE_SCHEMA, ExtractionOutputSchema, GUILD_PREDICATES, comparable(), DateVariant, GEMINI_SCHEMA, keysIn(), subject (+12 more)

### Community 55 - "anthropicLlm.ts"
Cohesion: 0.07
Nodes (60): Block, callUsage(), classifyAnthropicError(), create(), Effort, ImageMediaType, markerBlock(), mediaBlock() (+52 more)

### Community 56 - "obsidianExport.ts"
Cohesion: 0.15
Nodes (18): memory Config Section, PAST_FACT_MARKER, GuildMemoryClaim, ActiveClaimSubject, ActiveGuildSubject, ExportedClaim, ExportedGuildClaim, exportVault() (+10 more)

### Community 57 - "budget.ts"
Cohesion: 0.05
Nodes (53): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, acquireSlot(), backgroundShareSpent(), billingExhaustedIn, BudgetReservation, CallInput, CallReservation (+45 more)

### Community 58 - "schedule.test.ts"
Cohesion: 0.14
Nodes (12): GetAnimeScheduleResult, ScheduleEntry, containerOf(), { getAnimeSchedule }, Handler, JsonNode, makeCollector(), makeEntries() (+4 more)

### Community 59 - "Moods.tsx"
Cohesion: 0.11
Nodes (36): lucide-react, estimateTokens(), TextEditor, TextEditorHandle, TextEditorProps, inMood(), addMoodText(), dependents() (+28 more)

### Community 60 - "reportStore.ts"
Cohesion: 0.15
Nodes (14): BugReportContext, BugReportInput, BugReportType, captureSnapshot(), countReportsSince(), MAX_CONTEXT_JSON_BYTES, queryRecentRows(), ReportAttachmentMetadata (+6 more)

### Community 61 - "extractor.ts"
Cohesion: 0.05
Nodes (61): judgeEpisodeOperations(), ExtractionOp, episodeObservedAt(), episodePrompt(), EpisodeWriteOp, ExtractedEpisode, extractEpisode(), formatEpisodeLine() (+53 more)

### Community 62 - "digest.ts"
Cohesion: 0.13
Nodes (28): Gemini Watcher, boundedString(), coverageLine(), cutAtWord(), formatClock(), frameInterval(), framesLine(), HEARD_LINES (+20 more)

### Community 63 - "markdown.ts"
Cohesion: 0.09
Nodes (26): blockQuote(), buildList(), codeBlock, EMOJI, emojiImage(), emphasis(), EMPHASIS_RULES, formatTimestamp() (+18 more)

### Community 64 - "Speech-to-Text HTTP Server"
Cohesion: 0.13
Nodes (17): Speech-to-text HTTP sidecar: Silero VAD -> SenseVoice language ID -> Moonshine…, collections, http_server, io, json, math, numpy, os (+9 more)

### Community 65 - "socialPosts/service.ts"
Cohesion: 0.09
Nodes (24): Process Lifecycle, resolveBlueskyDid(), ParsedBlueskyThread, ReplyReaderDependencies, createSocialPostViewer(), failure(), initializeSocialPosts(), isAbort() (+16 more)

### Community 66 - "serve.ts"
Cohesion: 0.11
Nodes (13): item(), lists(), ORDER, row(), ENV_TEXT, REPO, SANDBOX, app (+5 more)

### Community 67 - "parsers.ts"
Cohesion: 0.12
Nodes (40): base(), BlueskyBlob, blueskyQuote(), capped(), compact(), date(), finiteNumber(), headers() (+32 more)

### Community 68 - "Design System Documentation"
Cohesion: 0.07
Nodes (27): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Action Chips, Badges (+19 more)

### Community 69 - "vitest"
Cohesion: 0.12
Nodes (29): vitest, ReplyFetchContext, hostMatches(), HOSTS, parseSocialPostUrl(), platformForHost(), target(), youtubeStartSec() (+21 more)

### Community 70 - "Prefetch Measurement Tools"
Cohesion: 0.21
Nodes (9): main(), MeasurementAnomaly, Options, parseOptions(), percentile(), PrefetchMeasurementCase, PrefetchMeasurementSummary, PrefetchMeasurementTrial (+1 more)

### Community 71 - "package.json"
Cohesion: 0.07
Nodes (27): description, engines, node, typescript, main, name, type, version (+19 more)

### Community 72 - "test"
Cohesion: 0.09
Nodes (25): Shipping, Deploy and Roll Back, GHCR Visibility, How a Deploy Runs, Redeploy, Release to Stable, Roll Back, Self-Hosted Runner (+17 more)

### Community 73 - "File Upload Handling"
Cohesion: 0.17
Nodes (9): countedBody(), deleteFile(), FileResource, getFile(), sleep(), streamToFiles(), UploadedFile, videoDurationSec() (+1 more)

### Community 74 - "interactionCreate.metrics.test.ts"
Cohesion: 0.07
Nodes (22): outcomeForTurn, recordReplyOutcome(), ReplyOutcome, MEMORY_TOOL_NAMES, readRepliesTool, MAX_REQUESTED_REPLIES, readReplies(), ReadRepliesParams (+14 more)

### Community 75 - "anthropicMain.eval.test.ts"
Cohesion: 0.19
Nodes (15): asObject(), asObjects(), chunkLabel(), componentDetails(), walk(), isComponentsV2Payload(), PayloadObject, renderEmbeds() (+7 more)

### Community 76 - "roka Service"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 77 - "quotaDiagnostic.ts"
Cohesion: 0.20
Nodes (12): BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey(), DIAGNOSTIC_TIMEOUT_MS, errorText(), KEY_IS_LIVE, OUTPACING_THE_CAP, SPENT_FOR_THE_DAY (+4 more)

### Community 78 - "getWeather.ts"
Cohesion: 0.15
Nodes (12): GeocodingResult, getWeather(), GetWeatherParams, GetWeatherResult, OpenMeteoWeather, weatherCodeToCondition(), WeatherFailure, WeatherReading (+4 more)

### Community 79 - "views.test.ts"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "watch.ts"
Cohesion: 0.12
Nodes (15): mocks, elapsedSince(), getClient(), instructions(), mediaPart(), messageOf(), reasonFor(), requestFor() (+7 more)

### Community 81 - "logger.ts"
Cohesion: 0.05
Nodes (57): Tech Stack (AGENTS.md), logging Config Section, ref_node_async_hooks, describeUsage(), KEY_ENV, main(), MODEL, nativeRoute() (+49 more)

### Community 82 - "Search Prefetch Reporting"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "models.ts"
Cohesion: 0.16
Nodes (17): Extraction Run Trace, Fact Reclassification, PROVIDER_KEY_ENV, BuiltIn, detail(), errorText(), failure(), listed() (+9 more)

### Community 84 - "messageContent.ts"
Cohesion: 0.09
Nodes (33): ImageAttachment, isSupportedMedia(), MAX_ATTACHMENTS, describeEmbed(), describeForwardedSnapshots(), describePoll(), embedMatchesSocialPost(), extractComponentMedia() (+25 more)

### Community 85 - "PackFileScreen.tsx"
Cohesion: 0.06
Nodes (63): ApiError, call(), ModelTest, PackFile, PackSummary, Problem, query(), Validation (+55 more)

### Community 86 - "src/index.ts"
Cohesion: 0.13
Nodes (20): waitForInFlightExtractions(), stopUpdateNotifier(), destroyAllGames(), client, healthServer, pruneEpisodesInBackground(), pruneExpiredExtractionSamples(), pruneExpiredFailedExtractions() (+12 more)

### Community 87 - "config.ts"
Cohesion: 0.04
Nodes (67): Configuration (AGENTS.md), Source Files, At a Glance, Legacy Config, Model Profiles, Models, Provider IDs, Request Shaping (+59 more)

### Community 88 - "Social Post Viewing Research"
Cohesion: 0.33
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "ToneKey"
Cohesion: 0.12
Nodes (25): AssemblerInput, assembleSystemPrompt(), CORE_PROMPT, CORE_PROMPT_FORGET_ONLY, CORE_PROMPT_MEMORY_FREE, MEMORY_TOOL_RULES, FaceGroup, FACES (+17 more)

### Community 90 - "reportCommand.ts"
Cohesion: 0.26
Nodes (13): isAllowedDiscordCdnUrl(), AttachmentCopyError, copyAttachment(), handleReportCommand(), moduleDirectory, packageMetadata, projectDirectory, readLimitedBody() (+5 more)

### Community 91 - "extractionSchema.ts"
Cohesion: 0.05
Nodes (40): AddOperationSchema, calendarDateProperties, DATED_GUILD_PREDICATES, DatedGuildAddOperationSchema, DatedGuildPredicateId, datedGuildPredicates, DatedGuildPredicateSchema, DatedGuildUpdateOperationSchema (+32 more)

### Community 92 - "test-chat.ts"
Cohesion: 0.19
Nodes (13): ref_node_readline, args, handleInput(), htmlIndex, main(), previewMessages, username, eachOutside() (+5 more)

### Community 93 - "embeddings/client.ts"
Cohesion: 0.27
Nodes (9): EmbeddingClient, EmbeddingRole, EmbeddingSettings, FACTORIES, isEmbeddingVector(), createGeminiEmbeddingClient(), createLocalEmbeddingClient(), SidecarReply (+1 more)

### Community 94 - "memoryClaimSchema.ts"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 95 - "chatCompletionsLlm.ts"
Cohesion: 0.05
Nodes (56): markBillingExhausted(), arrayOf(), callUsage(), CHAT_COMPLETIONS_BASE_URLS, ChatCompletionsOptions, ChatCompletionsResponse, ChatMessage, constsMatch() (+48 more)

### Community 96 - "WAV File Validation"
Cohesion: 0.38
Nodes (5): read_wav(), WavError, make_wav(), ReadWavTest, ValueError

### Community 97 - "load.ts"
Cohesion: 0.05
Nodes (53): moods.yml, buildContextPrompt(), Character, deepFreeze(), escapeRegExp(), inHours(), loadCharacter(), expand() (+45 more)

### Community 98 - "reclassifyModels.ts"
Cohesion: 0.10
Nodes (21): Main-Model Judge, zod, ModelJudgment, SYSTEM, mocks, questions, failureFields(), generateObject() (+13 more)

### Community 99 - "ASR Sidecar Service"
Cohesion: 0.22
Nodes (8): API, ASR Sidecar, Build and Run, Configuration, `GET /health`, Models and Licences, `POST /transcribe?maxSpeechSec=120`, Tests

### Community 100 - "app.test.ts"
Cohesion: 0.12
Nodes (18): StudioOptions, DEFAULT_BASE_URLS, ApiError, commentedConfig(), ENV_TEXT, FilesBody, json(), MODEL_ENV (+10 more)

### Community 101 - "fallbackModel.ts"
Cohesion: 0.07
Nodes (26): Architecture (AGENTS.md), Critical Do-Nots, Project (Rokabot description), fallback Config Section, gemini Config Section, rateLimit Config Section, session Config Section, Logs (+18 more)

### Community 102 - "timezone.ts"
Cohesion: 0.33
Nodes (8): loadGetLocalHour(), loadTimezoneModule(), unpinnedHour(), dateString(), dateTimeParts(), localDateStartEpoch(), localDateTimeFormatter(), LocalDateTimeParts

### Community 103 - "GPT-6-Astra"
Cohesion: 0.50
Nodes (4): GPT-6-Astra, Jev Rollout Plan, Second Opinion, Who-Is-Who Resolver

### Community 104 - "duration.ts"
Cohesion: 0.33
Nodes (8): Box, movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0(), mvhdV1()

### Community 105 - "turnMedia.test.ts"
Cohesion: 0.18
Nodes (6): apiKey(), digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf()

### Community 107 - "verifyThreshold"
Cohesion: 0.10
Nodes (23): Capture and Prompt, Extraction, `memory`, Recall, Retention, Bug Reports, Data and Backups, Episodes, Media Memory and Recall (+15 more)

### Community 108 - "Raspberry Pi Runbook"
Cohesion: 0.08
Nodes (25): Access, Any OpenAI-Compatible Model, At a Glance, Bot Lifecycle, Budgets and Monthly Spend, Configuration Changes, Discord App Install and Permissions, Docker (+17 more)

### Community 109 - "Speech Budget Management"
Cohesion: 0.42
Nodes (4): Keep time-ordered segments within the speech budget, spread across the clip.…, Segment, select_segments(), SelectSegmentsTest

### Community 110 - "gacha.ts"
Cohesion: 0.20
Nodes (23): handleGachaMention(), statBar(), formatBuddySummary(), formatHatchTimeRemaining(), handleBuddyLeaderboard(), handleBuddyStats(), handleBuddyView(), handleHatch() (+15 more)

### Community 111 - "redditFeed.ts"
Cohesion: 0.56
Nodes (9): decodeEntities(), entryAuthor(), entryContent(), feedEntries(), feedField(), htmlToText(), NAMED_ENTITIES, parseRedditFeedPost() (+1 more)

### Community 112 - "replyShape.ts"
Cohesion: 0.09
Nodes (35): Tunables, Known Limits, Rerunning the Check, Results, Roka Voice v4: Looked-Up Turns and Saying No, Root Causes, Tunables, What Changed (+27 more)

### Community 116 - "Prompt Engine"
Cohesion: 0.08
Nodes (25): At a Glance, Beats, Edge, Ending, Memory Modes, Message Weight, Mood Detection, Opener (+17 more)

### Community 117 - "promptSafety.ts"
Cohesion: 0.10
Nodes (28): At a Glance, Changing a Contract, Bounded Retrieval (Legacy), Modules, Rules Across Modules, SQLite Is Canonical, Technical Requirements, The Character Pack Is the Persona Source (+20 more)

### Community 119 - "Memory"
Cohesion: 0.11
Nodes (20): Admission, At a Glance, Capture, Claim Lifecycle and Retention, Deferred Items, Extraction, Guild Facts and Dates, Hidden-Fact Reconciliation (+12 more)

### Community 120 - "metadata.ts"
Cohesion: 0.18
Nodes (18): ref_node_url, api(), assignable(), CommitlintConfig, GitHubActor, GitHubIssue, GitHubLabel, GitHubPullRequest (+10 more)

### Community 121 - "emojiReactor.ts"
Cohesion: 0.27
Nodes (8): emoji Config Section, cleanupExpiredCooldowns(), cooldowns, findMatchingRule(), REACTION_RULES, ReactionRule, resetCooldowns(), shouldReact()

### Community 122 - "hiddenRetractions.test.ts"
Cohesion: 0.11
Nodes (27): delay(), embedPendingFacts(), sweep(), renderFactSentence(), HiddenRetract, reconcileHiddenRetractions(), reconcileOne(), userFactSentence() (+19 more)

### Community 123 - "cli.ts"
Cohesion: 0.14
Nodes (15): ref_node_util, CaptureInput, CaptureKind, CaptureRecord, CaptureSink, main(), rokaAuthor(), transcriptMessages() (+7 more)

### Community 124 - "replyReader"
Cohesion: 0.39
Nodes (3): isAbort(), replyReader, ReplyLookup

### Community 125 - "transcribe.test.ts"
Cohesion: 0.08
Nodes (35): EMPTY, extractFrame(), extractFrames(), frameBins(), frameCount(), FrameRunner, FrameSource, frameTimestamps() (+27 more)

### Community 126 - "Speech Server Engines"
Cohesion: 0.33
Nodes (6): Engines, load_engines(), main(), SpeechServer, NamedTuple, ThreadingHTTPServer

### Community 127 - "Linting Configuration"
Cohesion: 0.67
Nodes (3): lint-staged, *.{json,md,yml,yaml}, *.{ts,js}

### Community 129 - "probe-llm-profile.ts"
Cohesion: 0.06
Nodes (48): 1. Character as a Folder Pack, 2. Static First, Dynamic After, Reply Shape Last, 3. Any OpenAI-Compatible Endpoint, 4. Files First, Dashboard Later, Character Formats, Character Harness Research 2026, Decisions for Rokabot, Evidence-Backed (+40 more)

### Community 130 - "test-gemini-ga-compare.ts"
Cohesion: 0.13
Nodes (17): ref_node_dns, ErrorRecoveryPlugin, main(), results, runQuery(), TestResult, wordCount(), CapturingErrorPlugin (+9 more)

### Community 131 - "Speech Transcription Processing"
Cohesion: 0.60
Nodes (5): decode(), detect_speech(), language_code(), transcribe(), ndarray

### Community 133 - "textEdit.ts"
Cohesion: 0.31
Nodes (17): Primitive, Flow, flowMap(), insertLine(), insertPair(), lineEnd(), lineStart(), pairOf() (+9 more)

### Community 134 - "displayName"
Cohesion: 0.25
Nodes (8): AssemblerInput, At a Glance, Data Models, Data Models and Storage, Outbound Model Request, Source Files, ToneKey, displayName()

### Community 135 - "linesGolden.test.ts"
Cohesion: 0.18
Nodes (27): Field Reference, lines.yml, Commands, Bug Reports, Persistence and Storage, Retention, Tables, stopReminderScheduler() (+19 more)

### Community 136 - "deploy Job"
Cohesion: 0.48
Nodes (7): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping)

### Community 137 - "ref_node_fs"
Cohesion: 0.07
Nodes (32): js-yaml, ref_node_child_process, ref_node_crypto, ref_node_fs, ref_node_net, ref_node_os, ref_node_path, ref_node_worker_threads (+24 more)

### Community 138 - "config"
Cohesion: 0.07
Nodes (32): Storage Schema, Unified Recall, channelVisibility, ChannelVisibilityResolver, registerChannelVisibility(), resetChannelVisibilityForTest(), UNKNOWN, predicate() (+24 more)

### Community 140 - "roka.ts"
Cohesion: 0.03
Nodes (97): Switch, Concurrency and Lifecycle Under Retry, The Retry Loop, BackoffOptions, classifyGeminiFailure(), classifyMarker(), computeBackoff(), DEFAULT_MAX_BACKOFF_MS (+89 more)

### Community 141 - "verification.test.ts"
Cohesion: 0.14
Nodes (14): OperationApplicationReport, activeFacts(), apply(), candidateFacts(), episode(), evidenceCount(), factsWithStatus(), jevApplied() (+6 more)

### Community 142 - "test-phase8.ts"
Cohesion: 0.12
Nodes (26): reminders Config Section, main(), makeMessage(), assert(), fail(), main(), pass(), results (+18 more)

### Community 143 - "UI TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals (+6 more)

### Community 144 - "System Architecture"
Cohesion: 0.12
Nodes (16): Architecture, At a Glance, Core Code Modules, Discord Events (Inbound), Durable State, Gateway Setup, Installation and Context Policy, InteractionCreate (`/ask`) (+8 more)

### Community 145 - "metrics.eval.test.ts"
Cohesion: 0.16
Nodes (13): cleanupExpired(), monitoredChannels, resetMonitor(), restoreMonitoredChannels(), resetForTest(), stopExtractionScheduler(), __resetTestRunTurnFactory(), responseEventCount() (+5 more)

### Community 146 - "agent/attachments.ts"
Cohesion: 0.08
Nodes (34): PDF Token Cost Measurement, Download, sharp, spriteFiles, anthropicBlock(), countWithAnthropic(), estimateTokens(), imageTokens() (+26 more)

### Community 147 - "anthropicLlm.test.ts"
Cohesion: 0.12
Nodes (18): @anthropic-ai/sdk, STRUCTURED_OUTPUT_TOOL, ContentBlock, fixtures, usage(), answer(), budget, CreateOptions (+10 more)

### Community 148 - "yamlEdit.ts"
Cohesion: 0.23
Nodes (21): yaml, character, config, repo, voice, stringifyDoc(), addItem(), deleteNode() (+13 more)

### Community 149 - "render.ts"
Cohesion: 0.11
Nodes (41): escapeHtml(), MarkdownContext, renderMarkdown(), renderPlainText(), asObject(), asObjects(), authorKey(), avatarUrl() (+33 more)

### Community 150 - "Configuration"
Cohesion: 0.08
Nodes (27): At a Glance, Character, Configuration, `discord`, `embeddings`, `emoji`, `fallback`, `games` (+19 more)

### Community 151 - "persona-replay.ts"
Cohesion: 0.11
Nodes (28): ANTHROPIC_SEARCH, appendReplyShape(), Arm, claudeSettings(), GEMINI_CONFIG, GEMINI_SEARCH, loadArm(), LoadedArm (+20 more)

### Community 152 - "searchPrefetch.ts"
Cohesion: 0.16
Nodes (16): Source Files, Footer, recordSearchCitations(), buildLookedUpBlock(), clip(), decidePrefetch(), JevPrefetchMode, PREFETCH_TOOL_NAME (+8 more)

### Community 153 - "privacy"
Cohesion: 0.08
Nodes (26): Memory, At a Glance, Browse Memory in Obsidian, Forgetting and Opting Out, How She Learns, Key Settings, Maintenance Scripts, Memory (+18 more)

### Community 154 - "app.ts"
Cohesion: 0.13
Nodes (34): ref_node_http, createApp(), route(), Handler, PREVIEW_FIELDS, previewQuery(), readConfig(), readText() (+26 more)

### Community 155 - "Reliability"
Cohesion: 0.12
Nodes (17): `search`, Hedge, A Spent Day Is Not a Spent Minute, ADK Error Delivery Constraint, At a Glance, Configuration, Failure Kinds, Model Switch (+9 more)

### Community 156 - "queries.test.ts"
Cohesion: 0.13
Nodes (14): activeClaimCount(), distinctRememberedUsers(), MEMORY_STATS_SQL, outcomeBreakdown(), successRate, topTones(), insertClaim(), insertGuildClaim() (+6 more)

### Community 157 - "updateNotifier.ts"
Cohesion: 0.16
Nodes (15): cfg, LATEST, store, checkForUpdate(), fetchLatestRelease(), isNewerVersion(), LatestRelease, moduleDirectory (+7 more)

### Community 158 - "promptGolden.test.ts"
Cohesion: 0.21
Nodes (12): computeGolden(), digest(), FIXTURE, MESSAGES, MODES, RECENT, seeded(), TONES (+4 more)

### Community 159 - "Jev Judgments"
Cohesion: 0.12
Nodes (17): At a Glance, Client, Configuration, Jev Judgments, Modes, Questions, Search Prefetch, Tools (+9 more)

### Community 160 - "README.md"
Cohesion: 0.20
Nodes (8): Jev Integration (Research Doc), Contributing, Documentation, How It Works, License, Quick Start, Tech Stack, Who Is Maniwa Roka and Rokabot?

### Community 161 - "recall-calibration-thresholds.ts"
Cohesion: 0.19
Nodes (17): chooseFloor(), cli(), cohensKappa(), currentFloorOf(), KindReport, Label, main(), MIN_AGREED_PAIRS (+9 more)

### Community 162 - "Characters"
Cohesion: 0.18
Nodes (11): A Pack Outside the Image, At a Glance, character.yml, Characters, Harness Prompts and Overrides, How the Bot Picks a Pack, Make a New Character, Pack Layout (+3 more)

### Community 163 - "judgments.ts"
Cohesion: 0.09
Nodes (30): jev Config Section, Jev Design (Per-Feature Modes), Jev (TypeSafe System One Model), Measured Latency From The Pi, @typesafe-ai/sdk, @typesafe-ai/sdk, undici, fetchWithKeepAlive() (+22 more)

### Community 164 - "Product"
Cohesion: 0.18
Nodes (10): Accessibility & Inclusion, Anti-references, Brand Personality, Design Principles, Platform, Positioning, Product, Product Purpose (+2 more)

### Community 165 - "API and Security Tests"
Cohesion: 0.20
Nodes (10): API, Errors, Model Connection Test, Pack File Rules, Persona Studio, Security Model, Source Files, Start It (+2 more)

### Community 166 - "Models"
Cohesion: 0.13
Nodes (15): Any OpenAI-Compatible Model, At a Glance, Budgets and Limits, Capabilities Reference, Choose the Main and Fallback, Copy-Paste Entries, Entry Options, Fields for OpenAI-Compatible Entries (+7 more)

### Community 167 - "tools/index.ts"
Cohesion: 0.21
Nodes (15): ForgetUserParams, cancelReminderTool, listRemindersTool, searchAvailable, setReminderTool, RecallUserParams, RememberUserParams, cancelReminder() (+7 more)

### Community 168 - "scheduler.test.ts"
Cohesion: 0.19
Nodes (14): maybeSample(), shouldSample(), startExtractionScheduler(), advancePastRetryDelay(), configMock, drain(), enqueue(), enqueueDelayed() (+6 more)

### Community 169 - "Deployment and Setup Guide"
Cohesion: 0.14
Nodes (14): At a Glance, First-Run Checks, Getting Started, Install and Configure, Model Keys for the Shipped Config, Next Steps, Prerequisites, Register Slash Commands (+6 more)

### Community 170 - "Auto-Deploy Platforms"
Cohesion: 0.14
Nodes (13): Answer, Auto-Deploy Platforms, Coolify, Docker API Version, Fly.io, GHCR Limits, Maintained Fork, Original Project (+5 more)

### Community 171 - "searchWeb"
Cohesion: 0.11
Nodes (14): Canon Research, Complaints After the Haiku Switch, Known Weak Spots, Replay and Blind-Judge Method, Rerunning the Check, Results, Roka Voice v3: Restoring Variety on Haiku, Root Causes (+6 more)

### Community 172 - "guildFactDates.test.ts"
Cohesion: 0.40
Nodes (5): GuildFactDate, DateResolver, expectResolved(), loadResolver(), ResolvedDate

### Community 173 - "persona-report.ts"
Cohesion: 0.12
Nodes (28): Reading Validation Errors, voice.yml, Faces, Golden Test, countSlurRepetitions(), faces(), firstWord(), formatTable() (+20 more)

### Community 174 - "Embedding Project Config"
Cohesion: 0.15
Nodes (12): compilerOptions, lib, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+4 more)

### Community 175 - "searchAnime.ts"
Cohesion: 0.24
Nodes (8): searchAnimeTool, jikanThrottle(), AnimeResult, JikanAnimeEntry, JikanResponse, searchAnime(), SearchAnimeParams, SearchAnimeResult

### Community 178 - "toolTrigger.retry.test.ts"
Cohesion: 0.19
Nodes (11): getLocalHour(), emitTrialRecord(), formatTrialRecord(), TrialRecord, record, cases, header, ok() (+3 more)

### Community 179 - "Features"
Cohesion: 0.20
Nodes (10): At a Glance, Features, Games and Gacha, Reactions, Status Rotation and Update Notices, Reminders, Seeing and Watching, Source Files, Stats (+2 more)

### Community 180 - "Embedding Service Docs"
Cohesion: 0.20
Nodes (9): API, Build and Run, Configuration, Embedding Sidecar, `GET /health`, Model and Licences, `POST /embed`, Smoke Test (+1 more)

### Community 181 - "turnContext.test.ts"
Cohesion: 0.16
Nodes (7): citationsForTurn, SearchCitation, entryWork(), jevConfig, mocks, turnOptions(), turnWith()

### Community 182 - "react"
Cohesion: 0.11
Nodes (27): react, NoticeRow(), NotificationCenter(), THEMES, ThemeSwitch(), ToastCard(), Toaster(), TONE_ICON (+19 more)

### Community 183 - "models.spec.ts"
Cohesion: 0.29
Nodes (3): WindowMessage, role(), roleSelect()

### Community 185 - "admission.ts"
Cohesion: 0.24
Nodes (7): AdmissionResult, admitEpisode(), isTrivial(), normalize(), precheckEpisode(), SENSITIVE_PATTERNS, mocks

### Community 186 - "yamlText.ts"
Cohesion: 0.50
Nodes (12): appendEntry(), expectAfter(), lineEnd(), lineStart(), readIn(), removeKey(), removeListItem(), same() (+4 more)

### Community 187 - "Speech Pattern Documentation"
Cohesion: 0.25
Nodes (7): Dialogue Style, Example Lines, Example Replies With Structure, Expressions, Formatting Your Reply, Speech Patterns, Verbal Style

### Community 188 - "Persona Identity Definition"
Cohesion: 0.25
Nodes (7): Identity & Appearance, Insecurities, People You Know, Personality, Romantic Side, Who You Are, Your World

### Community 189 - "collection.ts"
Cohesion: 0.36
Nodes (9): buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount(), handleBuddyCollection(), { getBuddyCollection }, BuddyData, getBuddyCollection() (+1 more)

### Community 190 - "fingerprint.ts"
Cohesion: 0.36
Nodes (7): DEFAULT_EMBEDDING_MODELS, embeddingDimensions(), embeddingFingerprint(), EmbeddingProvider, LOCAL_EMBEDDING_MODEL, RECIPES, resolveEmbeddings()

### Community 191 - "local.test.ts"
Cohesion: 0.26
Nodes (10): fakeFetch(), FetchCall, hangingFetch(), json(), logger, reply(), settings, vector384 (+2 more)

### Community 192 - "reminderScheduler.ts"
Cohesion: 0.21
Nodes (4): fillLine(), startReminderScheduler(), FakeSender, NOW

### Community 193 - "Changelog"
Cohesion: 0.20
Nodes (9): [0.2.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.1.0...v0.2.0) (2026-10-16), [0.3.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.2.0...v0.3.0) (2026-10-16), [0.4.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.3.0...v0.4.0) (2026-10-17), Bug Fixes, Bug Fixes, Changelog, Features, Features (+1 more)

### Community 194 - "Character Packs"
Cohesion: 0.25
Nodes (7): Character Packs, Layout, Locked Prompts, Macros, Making a New Character, Prompt Files, Search Prompts

### Community 195 - "packs.ts"
Cohesion: 0.24
Nodes (18): CHECK_SCRIPT, checkConfig(), ConfigPaths, configProblem(), setTopLevelValue(), validateConfig(), writeConfig(), apiPath() (+10 more)

### Community 196 - "Contributing"
Cohesion: 0.13
Nodes (13): Branches, Contributing, Gates, Labels and Assignees, Merging, Pull Requests, Titles, Code Style (+5 more)

### Community 197 - "Audio Video Documentation"
Cohesion: 0.50
Nodes (3): Audio and Video, When You Couldn't Watch It, When You've Watched Something

### Community 198 - "Release Configuration"
Cohesion: 0.50
Nodes (3): bootstrap-sha, packages, $schema

### Community 221 - "Prompts.tsx"
Cohesion: 0.12
Nodes (35): ActionChipProps, Button(), ButtonProps, ButtonStyle, IconButtonProps, STYLES, Columns(), EntryNote() (+27 more)

### Community 223 - "fixtures.ts"
Cohesion: 0.07
Nodes (20): @axe-core/playwright, @playwright/test, PAGES, at(), field(), studio_ui_e2e_fixtures_expect, Studio, test (+12 more)

### Community 224 - "toolTrigger.ts"
Cohesion: 0.21
Nodes (11): stateAfterCase(), writeFixture(), pacingWith(), CaseSetRun, runCaseSet(), RunCaseSetOptions, seedWorld(), sleep() (+3 more)

### Community 225 - "attachmentLimits.ts"
Cohesion: 0.12
Nodes (21): RFC-3003, Media Watching, The `openai-compatible` Exception, GEMINI_SPELLINGS, MAX_AUDIO_SIZE_BYTES, MAX_DOCUMENT_SIZE_BYTES, MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES (+13 more)

### Community 226 - "Product Requirements"
Cohesion: 0.25
Nodes (8): At a Glance, Functional Requirements, Objectives, Problem, Product Requirements, Source Files, Target Users, User Workflow

### Community 227 - "getCurrentTime.ts"
Cohesion: 0.22
Nodes (9): cityToTimezone, getCurrentTime(), GetCurrentTimeFound, GetCurrentTimeParams, GetCurrentTimeResult, GetCurrentTimeUnknown, resolveTimezone(), getCurrentTimeTool (+1 more)

### Community 228 - "replyBlocks.ts"
Cohesion: 0.38
Nodes (8): blockCount(), BlockKind, capReplyBlocks(), countReplyBlocks(), MAX_REPLY_BLOCKS, parse(), Piece, splitAtDividers()

### Community 229 - "UI Styling Assets"
Cohesion: 0.33
Nodes (5): @fontsource-variable/geist, @fontsource-variable/geist-mono, react-dom, root, studio_ui_src_styles

### Community 230 - "pull_request_template.md"
Cohesion: 0.50
Nodes (3): Evidence, Merge Danger, Summary

### Community 232 - "socialPosts/format.ts"
Cohesion: 0.23
Nodes (12): SOCIAL_POST_UNTRUSTED_DATA_LABEL, SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL, author(), formatSocialPostLine(), PLATFORM_NAMES, quoted(), replies(), SOCIAL_POST_FAILURE_MARKER (+4 more)

### Community 233 - "extractionErrors.ts"
Cohesion: 0.22
Nodes (6): ABORT_CODES, ExtractionErrorClassification, JevUnavailableError, SHUTDOWN_SENSITIVE_NAMES, TRANSIENT_HTTP_STATUSES, TRANSIENT_NETWORK_CODES

### Community 234 - "statusCycler.test.ts"
Cohesion: 0.22
Nodes (6): Bucket, BUCKETS, cfg, lastPayload(), lastState(), PresenceMock

### Community 235 - "reports.ts"
Cohesion: 0.43
Nodes (6): main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne()

### Community 236 - "Decisions"
Cohesion: 0.22
Nodes (8): Agent and Prompts, Decisions, Deployment, Discord, Media, Memory, Models and Search, Repository

### Community 238 - "smoke.ts"
Cohesion: 0.25
Nodes (5): ref_node_assert, EmbedReply, golden, goldenPath, record

### Community 247 - "interactionCreate.memory.test.ts"
Cohesion: 0.33
Nodes (4): CapturingRunner, makeInteraction(), mocks, turn()

### Community 248 - "Media Watching"
Cohesion: 0.29
Nodes (7): Accounting, Digest and Turn Input, Media Watching, Remembered Media, Speech Sidecar, Transport, Watcher Modes

### Community 249 - "citations.ts"
Cohesion: 0.48
Nodes (5): clampToBudget(), fitCitations(), sourceHost(), sourceLabel(), THREE

### Community 250 - "Coding Guidelines (Andrej Karpathy)"
Cohesion: 0.33
Nodes (5): 1. Think Before Coding, 2. Simplicity First, 3. Surgical Changes, 4. Goal-Driven Execution, Coding Guidelines (Andrej Karpathy)

### Community 251 - "embeddings/__tests__/client.test.ts"
Cohesion: 0.50
Nodes (3): resetEmbeddingClientForTest(), factories, state

## Knowledge Gaps
- **1648 isolated node(s):** `$schema`, `indentStyle`, `indentWidth`, `lineWidth`, `enabled` (+1643 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2129 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `media.ts`, `jevReplay.ts`, `qwenWatch.ts`, `memoryEpisodeStore.ts`, `buddy.ts`, `messageBuilder.ts`, `getDb`, `test-features.ts`, `scheduler.ts`, `searchNativeAnthropic.test.ts`, `messageCreate.ts`, `reminder.ts`, `replies/service.ts`, `episodeTracker.ts`, `WindowedSessionService`, `memoryShadow.ts`, `database.ts`, `turnContext.ts`, `run.ts`, `rateLimiter.ts`, `turnMedia.ts`, `recall-calibration.test.ts`, `gameCommands.ts`, `youtubeStreams.ts`, `toolTriggerScoring.ts`, `memoryEpisodeReplay.ts`, `getAnimeSchedule.ts`, `profiles.ts`, `discord/attachments.ts`, `generateObject.ts`, `discord.js`, `charts.ts`, `Inline Data Contract`, `handler.ts`, `extractionSchema.test.ts`, `budget.ts`, `schedule.test.ts`, `reportStore.ts`, `extractor.ts`, `digest.ts`, `socialPosts/service.ts`, `parsers.ts`, `Prefetch Measurement Tools`, `package.json`, `File Upload Handling`, `interactionCreate.metrics.test.ts`, `anthropicMain.eval.test.ts`, `quotaDiagnostic.ts`, `getWeather.ts`, `views.test.ts`, `watch.ts`, `logger.ts`, `Search Prefetch Reporting`, `messageContent.ts`, `src/index.ts`, `config.ts`, `ToneKey`, `test-chat.ts`, `chatCompletionsLlm.ts`, `load.ts`, `reclassifyModels.ts`, `app.test.ts`, `fallbackModel.ts`, `timezone.ts`, `duration.ts`, `turnMedia.test.ts`, `verifyThreshold`, `gacha.ts`, `replyShape.ts`, `promptSafety.ts`, `metadata.ts`, `emojiReactor.ts`, `hiddenRetractions.test.ts`, `transcribe.test.ts`, `probe-llm-profile.ts`, `linesGolden.test.ts`, `ref_node_fs`, `config`, `roka.ts`, `verification.test.ts`, `test-phase8.ts`, `metrics.eval.test.ts`, `agent/attachments.ts`, `anthropicLlm.test.ts`, `yamlEdit.ts`, `persona-replay.ts`, `searchPrefetch.ts`, `queries.test.ts`, `updateNotifier.ts`, `promptGolden.test.ts`, `judgments.ts`, `scheduler.test.ts`, `searchWeb`, `guildFactDates.test.ts`, `persona-report.ts`, `reportCommand.test.ts`, `toolTrigger.retry.test.ts`, `turnContext.test.ts`, `admission.ts`, `collection.ts`, `fingerprint.ts`, `local.test.ts`, `reminderScheduler.ts`, `toolTrigger.ts`, `attachmentLimits.ts`, `getCurrentTime.ts`, `replyBlocks.ts`, `gemini.test.ts`, `socialPosts/format.ts`, `extractionErrors.ts`, `statusCycler.test.ts`, `interactionCreate.memory.test.ts`, `citations.ts`, `embeddings/__tests__/client.test.ts`?**
  _High betweenness centrality (0.253) - this node is a cross-community bridge._
- **Why does `config` connect `config` to `media.ts`, `test-gemini-ga-compare.ts`, `memoryEpisodeStore.ts`, `buddy.ts`, `getDb`, `linesGolden.test.ts`, `scheduler.ts`, `test-features.ts`, `roka.ts`, `messageCreate.ts`, `reminder.ts`, `test-phase8.ts`, `metrics.eval.test.ts`, `agent/attachments.ts`, `episodeTracker.ts`, `guildFactDates.ts`, `replies/service.ts`, `memoryShadow.ts`, `turnContext.ts`, `run.ts`, `rateLimiter.ts`, `updateNotifier.ts`, `turnMedia.ts`, `recall-calibration-thresholds.ts`, `recall-calibration.test.ts`, `judgments.ts`, `youtubeStreams.ts`, `gameCommands.ts`, `tools/index.ts`, `getAnimeSchedule.ts`, `discord/attachments.ts`, `recall.ts`, `generateObject.ts`, `discord.js`, `turnContext.test.ts`, `anthropicLlm.ts`, `obsidianExport.ts`, `budget.ts`, `extractor.ts`, `collection.ts`, `reminderScheduler.ts`, `socialPosts/service.ts`, `File Upload Handling`, `interactionCreate.metrics.test.ts`, `quotaDiagnostic.ts`, `getWeather.ts`, `watch.ts`, `logger.ts`, `src/index.ts`, `config.ts`, `reportCommand.ts`, `embeddings/client.ts`, `toolTrigger.ts`, `attachmentLimits.ts`, `reclassifyModels.ts`, `getCurrentTime.ts`, `fallbackModel.ts`, `timezone.ts`, `gemini.test.ts`, `verifyThreshold`, `gacha.ts`, `emojiReactor.ts`, `hiddenRetractions.test.ts`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `getDb()` connect `getDb` to `memoryEpisodeStore.ts`, `buddy.ts`, `test-features.ts`, `scheduler.ts`, `config`, `queries.ts`, `messageCreate.ts`, `test-phase8.ts`, `verification.test.ts`, `views.ts`, `metrics.eval.test.ts`, `episodeTracker.ts`, `memoryShadow.ts`, `database.ts`, `turnContext.ts`, `run.ts`, `queries.test.ts`, `updateNotifier.ts`, `recall-calibration.test.ts`, `gameCommands.ts`, `toolTriggerScoring.ts`, `tools/index.ts`, `memoryEpisodeReplay.ts`, `recall.ts`, `reportCommand.test.ts`, `obsidianExport.ts`, `budget.ts`, `reportStore.ts`, `extractor.ts`, `collection.ts`, `anthropicMain.eval.test.ts`, `src/index.ts`, `reportCommand.ts`, `gacha.ts`, `interactionCreate.memory.test.ts`, `hiddenRetractions.test.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `$schema`, `indentStyle`, `indentWidth` to the rest of the system?**
  _1648 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `media.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0989247311827957 - nodes in this community are weakly interconnected._
- **Should `jevReplay.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1310483870967742 - nodes in this community are weakly interconnected._
- **Should `qwenWatch.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09885057471264368 - nodes in this community are weakly interconnected._