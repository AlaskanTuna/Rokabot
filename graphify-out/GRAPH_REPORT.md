# Graph Report - bugs  (2026-11-03)

## Corpus Check
- 715 files · ~597,002 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 30 file(s) not represented in the graph (top: (none) 13, .jsonl 11, .rss 2)

## Summary
- 5785 nodes · 16087 edges · 241 communities (194 shown, 47 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 532 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d4772457`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- contentKey.ts
- jevReplay.ts
- qwenWatch.ts
- better-sqlite3
- Project Linting Config
- buddy.ts
- messageBuilder.ts
- getDb
- src/games/hangman.ts
- scheduler.ts
- searchNativeAnthropic.test.ts
- queries.ts
- discordDoubles.ts
- messageCreate.ts
- character/index.ts
- __tests__/tools.test.ts
- views.ts
- replies/service.ts
- guildFactDates.ts
- metrics.eval.test.ts
- Dev Tooling Dependencies
- Media
- workspace.ts
- memoryShadow.ts
- database.ts
- turnContext.ts
- run.ts
- Project Dependencies
- closeDb
- rateLimiter.ts
- DiscordPreview.tsx
- TypeScript Configuration
- turnMedia.ts
- YamlForm.tsx
- scripts
- recall-calibration-sample.ts
- src/games/shiritori.ts
- youtubeStreams.ts
- toolTriggerScoring.ts
- memoryEpisodeReplay.ts
- getAnimeSchedule.ts
- worst-case.ts
- chatCompletionsLlm.test.ts
- memoryEpisodeStore.ts
- configShared.tsx
- byteBudget.ts
- recall.ts
- generateObject.ts
- discord/attachments.ts
- charts.ts
- Secrets.tsx
- Inline Data Contract
- TypeScript Build Config
- handler.ts
- predicates.ts
- session.ts
- obsidianExport.ts
- budget.ts
- schedule.test.ts
- Moods.tsx
- reportCommand.ts
- extractor.ts
- digest.ts
- markdown.ts
- Speech-to-Text HTTP Server
- socialPosts/types.ts
- serve.ts
- parsers.ts
- Design System Documentation
- vitest
- Prefetch Measurement Tools
- package.json
- test
- File Upload Handling
- interactionCreate.metrics.test.ts
- renderPayload.ts
- roka Service
- toolTrigger.ts
- getWeather.ts
- views.test.ts
- watch.ts
- nativeAnthropic.ts
- Search Prefetch Reporting
- models.ts
- messageContent.ts
- PackFileScreen.tsx
- retriever.ts
- config.ts
- Social Post Viewing Research
- ToneKey
- gameCommands.ts
- extractionSchema.ts
- markdownGuard.ts
- embeddings/client.ts
- memoryClaimSchema.ts
- anthropicLlm.ts
- WAV File Validation
- load.ts
- reclassify.ts
- ASR Sidecar Service
- app.test.ts
- fallbackModel.ts
- memoryTools.test.ts
- identityResolver.ts
- duration.ts
- turnMedia.test.ts
- Commit Linting Rules
- Character Harness Research 2026
- Raspberry Pi Runbook
- Speech Budget Management
- gacha.ts
- redditFeed.ts
- replyShape.ts
- Documentation Style Guide
- Git Commit Standards
- Coding Best Practices
- Characters
- promptSafety.ts
- Audio Decoding Tests
- Memory
- metadata.ts
- emojiReactor.ts
- hiddenRetractions.test.ts
- test-chat.ts
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
- embedEpisodeText
- migrate-memory-v2.ts
- deploy Job
- ref_node_fs
- recall.test.ts
- Text Cleaning Utilities
- roka.ts
- verification.test.ts
- test-features.ts
- UI TypeScript Configuration
- System Architecture
- downloadAttachment
- attachmentCost.ts
- anthropicLlm.test.ts
- yamlEdit.ts
- render.ts
- Configuration
- persona-replay.ts
- Configuration Changes
- privacy
- pack.ts
- Reliability
- queries.test.ts
- config
- promptGolden.test.ts
- Jev Judgments
- README.md
- recall-calibration-thresholds.ts
- Rules Across Modules
- judgments.ts
- Product
- API and Security Tests
- Models
- tools/index.ts
- toneStyles.ts
- Deployment and Setup Guide
- Auto-Deploy Platforms
- Roka Voice v3: Restoring Variety on Haiku
- persona-report.ts
- Embedding Project Config
- searchAnime.ts
- FakeInteraction
- Features
- Embedding Service Docs
- react
- models.spec.ts
- yamlText.ts
- Speech Pattern Documentation
- Persona Identity Definition
- collection.ts
- Changelog
- Character Packs
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
- roka.test.ts
- measure.ts
- Product Requirements
- getCurrentTime.ts
- replyBlocks.ts
- UI Styling Assets
- pull_request_template.md
- readReplies.ts
- reports.ts
- Decisions
- smoke.ts
- Template Speaking Prompts
- Template Calm Mood
- Cheerful Mood Prompt
- Persona Identity Prompts
- Media Watching
- Coding Guidelines (Andrej Karpathy)
- graphify.md
- issue-tracker.md
- rtk.md
- Deliberately Not Done
- Reference Docs (AGENTS.md)

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 248 edges
2. `vitest` - 243 edges
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
- `At a Glance` --references--> `startCall()`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/budget.ts
- `ADK Error Delivery Constraint` --references--> `ProviderError`  [INFERRED]
  docs/trd/reliability.md → src/agent/llm/providerError.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Deploy-to-Pi CI/CD Pipeline** — _github_workflows_deploy_workflow, _github_workflows_deploy_test_job, _github_workflows_deploy_deploy_job, agents_working_conventions [EXTRACTED 0.90]
- **Multimodal Attachment Safety Pipeline** — docs_research_multimodal_global_byte_budget, docs_research_multimodal_streaming_size_guard, docs_research_multimodal_attachment_strip_history, docs_research_multimodal_tpm_ceiling_measurement, src_discord_bytebudget [INFERRED 0.95]

## Communities (241 total, 47 thin omitted)

### Community 0 - "contentKey.ts"
Cohesion: 0.46
Nodes (6): bytesContentKey(), DISCORD_CDN_HOSTS, discordAttachmentContentKey(), postContentKey(), requireId(), youtubeContentKey()

### Community 1 - "jevReplay.ts"
Cohesion: 0.13
Nodes (26): parseReplayArgs(), runReplayCli(), TurnJudgment, TurnJudgmentInput, agreement(), buildConfusionMatrix(), buildProbabilityBins(), buildReplayTurn() (+18 more)

### Community 2 - "qwenWatch.ts"
Cohesion: 0.09
Nodes (29): Qwen Watcher, binOf(), ChatCompletion, ContentPart, promptFor(), quoted(), QwenFrame, QwenWatchInput (+21 more)

### Community 3 - "better-sqlite3"
Cohesion: 0.08
Nodes (35): better-sqlite3, EmbeddingResult, GEMINI_FINGERPRINT, geminiVector(), LOCAL_FINGERPRINT, localVector(), configMock, mocks (+27 more)

### Community 4 - "Project Linting Config"
Cohesion: 0.05
Nodes (39): useLiteralKeys, css, formatter, files, ignore, formatter, enabled, indentStyle (+31 more)

### Community 5 - "buddy.ts"
Cohesion: 0.12
Nodes (30): BuddyRow, DailyBuddyHatch, DailyHatchRow, generateBuddy(), generateName(), generatePersonality(), getDailyHatchRow(), getStreak() (+22 more)

### Community 6 - "messageBuilder.ts"
Cohesion: 0.06
Nodes (50): discord Config Section, Link Priority, Lookup Limits, Model Input, Replies, Social Post Viewing, Supported Platforms, URL and Extractor Safety (+42 more)

### Community 7 - "getDb"
Cohesion: 0.11
Nodes (49): evicted, claimCount(), seedLegacyRow(), tableExists(), activateClaim(), appendEvidence(), appendEvidenceInTransaction(), assertClaimInTransaction() (+41 more)

### Community 8 - "src/games/hangman.ts"
Cohesion: 0.18
Nodes (23): games Config Section, buildHangmanBody(), handleHangmanGuess(), handleHangmanStart(), HANGMAN_COLORS, saveHangmanScore(), src_games_data_hangmanwords, src_games_data_hangmanwords_hangman_words (+15 more)

### Community 9 - "scheduler.ts"
Cohesion: 0.04
Nodes (73): AdmissionResult, admitEpisode(), isTrivial(), normalize(), precheckEpisode(), SENSITIVE_PATTERNS, ABORT_CODES, classifyExtractionError() (+65 more)

### Community 10 - "searchNativeAnthropic.test.ts"
Cohesion: 0.05
Nodes (18): AnthropicMessagesClient, profileFor(), haiku, qwen, route(), ContentBlock, Create, HAIKU (+10 more)

### Community 11 - "queries.ts"
Cohesion: 0.10
Nodes (28): activityByDay(), busiestChannel, ChannelCount, chatsSince(), CountByDay, CountByHour, CountByOutcome, CountByPredicate (+20 more)

### Community 12 - "discordDoubles.ts"
Cohesion: 0.05
Nodes (43): AttachmentSpec, CaptureKind, CaptureSink, ChannelSpec, ClientSpec, ComponentData, ComponentSpec, EmbedSpec (+35 more)

### Community 13 - "messageCreate.ts"
Cohesion: 0.08
Nodes (64): Field Reference, lines.yml, Commands, isMonitored(), markActive(), asksAboutReplies(), withReplyOutcomes(), withSearchCitations() (+56 more)

### Community 14 - "character/index.ts"
Cohesion: 0.11
Nodes (33): ref_discordjs_builders, character, fillLine(), gachaCommand, gameCommands, hangmanCommand, shiritoriCommand, reportCommand (+25 more)

### Community 15 - "__tests__/tools.test.ts"
Cohesion: 0.25
Nodes (7): flipCoin(), FlipCoinResult, flipCoinTool, rollDiceTool, rollDice(), RollDiceParams, RollDiceResult

### Community 16 - "views.ts"
Cohesion: 0.14
Nodes (30): activeClaimCount(), memoryGrowthSeries(), newClaimsThisMonth(), retrySummary, tokenTotals, topChannels(), topPredicates(), topRememberedMembers() (+22 more)

### Community 17 - "replies/service.ts"
Cohesion: 0.22
Nodes (27): resolveBlueskyDid(), array(), nonNegativeInteger(), bilibiliAid(), fetchBilibiliReplies(), fetchBlueskyReplies(), BROWSER_USER_AGENT, compactReplyText() (+19 more)

### Community 18 - "guildFactDates.ts"
Cohesion: 0.17
Nodes (21): GuildFactDate, addDays(), addMonths(), CalendarDate, CalendarMonth, dateForMonthDay(), isoDate(), isoMonth() (+13 more)

### Community 19 - "metrics.eval.test.ts"
Cohesion: 0.10
Nodes (35): resetMonitor(), asEpisodeLine(), clearTimer(), deltaStart(), flushEpisode(), flushOpenEpisodes(), recordEpisodeMessage(), resetEpisodeTrackerForTest() (+27 more)

### Community 20 - "Dev Tooling Dependencies"
Cohesion: 0.07
Nodes (29): devDependencies, @axe-core/playwright, @biomejs/biome, @commitlint/cli, @commitlint/config-conventional, diff, @fontsource-variable/geist, @fontsource-variable/geist-mono (+21 more)

### Community 21 - "Media"
Cohesion: 0.11
Nodes (12): At a Glance, Bytes Do Not Stay in History, Configuration, Media, Source Files, Token Admission, attachmentMarker(), isStrippable() (+4 more)

### Community 22 - "workspace.ts"
Cohesion: 0.06
Nodes (77): lucide-react, App(), CommandPalette(), Item, Ambient(), Page(), PageProps, SaveActions() (+69 more)

### Community 23 - "memoryShadow.ts"
Cohesion: 0.20
Nodes (14): asClaim(), asScenario(), evaluateMemoryShadow(), FixtureClaim, loadReplaySet(), MemoryShadowReport, percentile95(), REPLAY_PATH (+6 more)

### Community 24 - "database.ts"
Cohesion: 0.06
Nodes (33): metrics Config Section, pruneExpiredExtractionSamples(), createTables(), resolveDbPath(), runMigrations(), countExtractionSamples(), ExtractionSampleInput, pruneExtractionSamples() (+25 more)

### Community 25 - "turnContext.ts"
Cohesion: 0.06
Nodes (52): Source Files, Turn Entry Work, Embeddings and Episodic Recall, Models Summary, Prompt Engine Summary, Turn Walkthrough, GenerateOptions, recordSearchCitations() (+44 more)

### Community 26 - "run.ts"
Cohesion: 0.09
Nodes (35): createCaptureSink(), makeClient(), makeGuild(), makeInteraction(), makeMember(), makeUser(), fixturePath(), loadTranscript() (+27 more)

### Community 27 - "Project Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @anthropic-ai/sdk, better-sqlite3, discord.js, dotenv, @google/adk, @google/genai, js-yaml (+7 more)

### Community 28 - "closeDb"
Cohesion: 0.06
Nodes (32): Database File, axis(), detailOf(), fact(), history(), mix(), openFixture(), seedGuild() (+24 more)

### Community 29 - "rateLimiter.ts"
Cohesion: 0.08
Nodes (19): Architecture (AGENTS.md), Critical Do-Nots, Project (Rokabot description), gemini Config Section, rateLimit Config Section, RateLimiterConfig, Turn Admission, mocks (+11 more)

### Community 30 - "DiscordPreview.tsx"
Cohesion: 0.11
Nodes (32): Problem, lineForPath(), splitPath(), firstLine(), lineFor(), ProblemBanner(), ProblemBannerProps, screenName() (+24 more)

### Community 31 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 32 - "turnMedia.ts"
Cohesion: 0.11
Nodes (40): Coverage Plan, prepareAttachments(), watchOutcomeFor(), durationFromTokens(), equalBins(), estimateMediaTokens(), focusWindow(), FPS_LADDER (+32 more)

### Community 33 - "YamlForm.tsx"
Cohesion: 0.13
Nodes (40): cleanComment(), Context, FOCUS_ORDER, Group(), helpFor(), isRecord(), MapBody(), MapFields() (+32 more)

### Community 34 - "scripts"
Cohesion: 0.06
Nodes (36): scripts, build, character, dev, dev:quiet, export:vault, format, format:check (+28 more)

### Community 35 - "recall-calibration-sample.ts"
Cohesion: 0.09
Nodes (35): CandidateRow, chunk(), configuredEmbed(), Embed, loadShadowRows(), main(), MATCH_WINDOW_MS, matchTurnMessage() (+27 more)

### Community 36 - "src/games/shiritori.ts"
Cohesion: 0.14
Nodes (22): ref_node_module, src_games_data_wordlist, activeGames, destroyAllGames(), getLastLetter(), getScores(), getTimeoutAt(), handleTimeout() (+14 more)

### Community 37 - "youtubeStreams.ts"
Cohesion: 0.12
Nodes (26): metadata, realisticFormats, AudioFormat, audioFormats(), directHttpsUrl(), finiteNumber(), hasCodec(), headersOf() (+18 more)

### Community 38 - "toolTriggerScoring.ts"
Cohesion: 0.10
Nodes (28): fixturePath, header, rememberFixturePath, searchWebFixturePath, temporaryDirectories, testCase, CaseSetRun, asCase() (+20 more)

### Community 39 - "memoryEpisodeReplay.ts"
Cohesion: 0.11
Nodes (23): ref_node_perf_hooks, argumentsFrom(), estimatedTokens(), inputText(), liveAdapters(), measure(), loadTranscriptLines(), main() (+15 more)

### Community 40 - "getAnimeSchedule.ts"
Cohesion: 0.21
Nodes (16): BROADCAST_TIMEZONES, clampLimit(), convertBroadcastTime(), fetchJikan(), getAnimeSchedule(), getCurrentSeason(), getTodayName(), handleAnimeLookup() (+8 more)

### Community 41 - "worst-case.ts"
Cohesion: 0.12
Nodes (32): sandboxPaths(), appendToBlock(), applyDataset(), applyEmpty(), applyOne(), applyWorst(), base64url(), blockRange() (+24 more)

### Community 42 - "chatCompletionsLlm.test.ts"
Cohesion: 0.05
Nodes (49): Reply Model and Fallback, Budgets, Usage and Cost, Provider IDs, @google/adk, BudgetDenial, requestTokenEstimate(), ChatCompletionsLlm, ModelScopeLlm (+41 more)

### Community 43 - "memoryEpisodeStore.ts"
Cohesion: 0.10
Nodes (35): BackfillPace, delay(), EpisodeMaintenanceReport, pruneEpisodesAndReembed(), runPass(), findMediaDigest(), findMediaSharedBy(), forgetMediaForUser() (+27 more)

### Community 44 - "configShared.tsx"
Cohesion: 0.10
Nodes (48): diff, DiffView(), humanize(), DiscordScreen(), ELSEWHERE, OWN, LimitsScreen(), BLOCKS (+40 more)

### Community 45 - "byteBudget.ts"
Cohesion: 0.05
Nodes (49): RFC-3003, ALLOWED_IMAGE_TYPES Consolidation, Attachment History Stripping, Audio Intake Recommendation, Byte Cap as Duration Proxy, Concurrency Binding Constraint, Container Memory Cap Correction, Flash-Lite Modality Verification (+41 more)

### Community 46 - "recall.ts"
Cohesion: 0.15
Nodes (30): cosineSimilarity(), factKey(), ClaimPeriod, byScore(), cooldownPenalty(), coreRank(), countKind(), Ctx (+22 more)

### Community 47 - "generateObject.ts"
Cohesion: 0.05
Nodes (48): Extraction Run Trace, Background Jobs, @google/genai, zod, ModelJudgment, SYSTEM, mocks, questions (+40 more)

### Community 48 - "discord/attachments.ts"
Cohesion: 0.08
Nodes (31): PDF Intake Recommendation, Post Media, ref_node_dns, ref_node_net, ALLOWED_DOCUMENT_TYPES, ALLOWED_MEDIA_TYPES, ASK_ATTACHMENT_SLOTS, attachmentOptionName() (+23 more)

### Community 49 - "charts.ts"
Cohesion: 0.28
Nodes (13): @napi-rs/canvas, degreeColor(), hexColor(), renderActivityHeatmap(), renderChannelHistogram(), renderLatencyTrend(), renderMemoryGrowth(), renderMoodDonut() (+5 more)

### Community 50 - "Secrets.tsx"
Cohesion: 0.08
Nodes (60): Badge(), BadgeTone, TONES, Button(), IconButton(), Field(), Toggle(), Dialog() (+52 more)

### Community 51 - "Inline Data Contract"
Cohesion: 0.29
Nodes (3): CapturingLlm, PDF_BASE64, sendPart()

### Community 52 - "TypeScript Build Config"
Cohesion: 0.22
Nodes (8): ./tsconfig.json, compilerOptions, noEmit, rootDir, types, exclude, extends, include

### Community 53 - "handler.ts"
Cohesion: 0.06
Nodes (39): @huggingface/transformers, @types/node, dependencies, @huggingface/transformers, devDependencies, @types/node, typescript, engines (+31 more)

### Community 54 - "predicates.ts"
Cohesion: 0.07
Nodes (28): GUILD_PREDICATES, GuildPredicateId, isKnownPredicate(), MemoryPredicateId, normalizePredicate(), PredicateCardinality, PredicateDefinition, PredicateRetentionTier (+20 more)

### Community 55 - "session.ts"
Cohesion: 0.07
Nodes (28): abortActiveTurns(), __resetModelFallbackForTest(), APP_NAME, clearSessionErrorCount(), destroyAllSessions(), idleTimers, incrementSessionErrorCount(), rehydrationSuppressed (+20 more)

### Community 56 - "obsidianExport.ts"
Cohesion: 0.17
Nodes (16): memory Config Section, PAST_FACT_MARKER, ActiveClaimSubject, ActiveGuildSubject, ExportedClaim, ExportedGuildClaim, exportVault(), formatClaimGroups() (+8 more)

### Community 57 - "budget.ts"
Cohesion: 0.06
Nodes (50): Free-Tier TPM Ceiling Measurement, The Per-Minute Token Budget, acquireSlot(), backgroundShareSpent(), billingExhaustedIn, BudgetReservation, CallInput, CallReservation (+42 more)

### Community 58 - "schedule.test.ts"
Cohesion: 0.14
Nodes (12): GetAnimeScheduleResult, ScheduleEntry, containerOf(), { getAnimeSchedule }, Handler, JsonNode, makeCollector(), makeEntries() (+4 more)

### Community 59 - "Moods.tsx"
Cohesion: 0.16
Nodes (30): readYaml(), inMood(), addMoodText(), dependents(), MOOD_NAME, moodKeys(), moodPrompt(), moodsPath() (+22 more)

### Community 60 - "reportCommand.ts"
Cohesion: 0.06
Nodes (42): AssemblerInput, At a Glance, Bug Reports, Data Models, Data Models and Storage, Outbound Model Request, Persistence and Storage, Retention (+34 more)

### Community 61 - "extractor.ts"
Cohesion: 0.09
Nodes (34): EXTRACTION_RESPONSE_SCHEMA, ExtractionOutput, ExtractionOutputSchema, episodeObservedAt(), episodePrompt(), EpisodeWriteOp, ExtractedEpisode, extractEpisode() (+26 more)

### Community 62 - "digest.ts"
Cohesion: 0.15
Nodes (24): boundedString(), coverageLine(), cutAtWord(), formatClock(), frameInterval(), framesLine(), HEARD_LINES, isRecord() (+16 more)

### Community 63 - "markdown.ts"
Cohesion: 0.10
Nodes (25): blockQuote(), buildList(), codeBlock, EMOJI, emojiImage(), emphasis(), EMPHASIS_RULES, formatTimestamp() (+17 more)

### Community 64 - "Speech-to-Text HTTP Server"
Cohesion: 0.13
Nodes (17): Speech-to-text HTTP sidecar: Silero VAD -> SenseVoice language ID -> Moonshine…, collections, http_server, io, json, math, numpy, os (+9 more)

### Community 65 - "socialPosts/types.ts"
Cohesion: 0.09
Nodes (20): ParsedBlueskyThread, ReplyReaderDependencies, failure(), isAbort(), isYtDlpPlatform(), SocialPostViewer, SocialPostViewerDependencies, ThreadsPage (+12 more)

### Community 66 - "serve.ts"
Cohesion: 0.14
Nodes (13): item(), lists(), ORDER, row(), ENV_TEXT, REPO, SANDBOX, app (+5 more)

### Community 67 - "parsers.ts"
Cohesion: 0.15
Nodes (34): base(), BlueskyBlob, blueskyQuote(), capped(), compact(), date(), finiteNumber(), headers() (+26 more)

### Community 68 - "Design System Documentation"
Cohesion: 0.07
Nodes (27): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Action Chips, Badges (+19 more)

### Community 69 - "vitest"
Cohesion: 0.11
Nodes (28): vitest, ReplyFetchContext, createSocialPostViewer(), hostMatches(), HOSTS, parseSocialPostUrl(), platformForHost(), target() (+20 more)

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
Cohesion: 0.08
Nodes (19): ref_node_async_hooks, outcomeForTurn, recordReplyOutcome(), ReplyOutcome, citationsForTurn, SearchCitation, NAME_MENTION_REGEX, askWith() (+11 more)

### Community 75 - "renderPayload.ts"
Cohesion: 0.36
Nodes (12): asObject(), asObjects(), chunkLabel(), componentDetails(), walk(), isComponentsV2Payload(), PayloadObject, renderEmbeds() (+4 more)

### Community 76 - "roka Service"
Cohesion: 0.22
Nodes (9): ADK_QUIET Environment Variable, Data Volume Mount, Environment File (.env), Docker Logging (json-file), Memory Limit (1g), Memory Swap Limit (1g), Management Panel Labels, Port 3000 Mapping (+1 more)

### Community 77 - "toolTrigger.ts"
Cohesion: 0.08
Nodes (30): getLocalHour(), emitTrialRecord(), formatTrialRecord(), TrialRecord, BACKEND_OUT_OF_CAPACITY, describeQuotaFailure(), diagnoseKey(), DIAGNOSTIC_TIMEOUT_MS (+22 more)

### Community 78 - "getWeather.ts"
Cohesion: 0.15
Nodes (12): GeocodingResult, getWeather(), GetWeatherParams, GetWeatherResult, OpenMeteoWeather, weatherCodeToCondition(), WeatherFailure, WeatherReading (+4 more)

### Community 79 - "views.test.ts"
Cohesion: 0.24
Nodes (9): charts, contentFor(), errors, guild, jsonFor(), queries, selectsFor(), getMoodLabel() (+1 more)

### Community 80 - "watch.ts"
Cohesion: 0.11
Nodes (17): HalfWatch, mocks, CoveragePlan, elapsedSince(), getClient(), instructions(), mediaPart(), messageOf() (+9 more)

### Community 81 - "nativeAnthropic.ts"
Cohesion: 0.04
Nodes (81): Rerunning the Check, Evidence, describeUsage(), KEY_ENV, main(), MODEL, nativeRoute(), Options (+73 more)

### Community 82 - "Search Prefetch Reporting"
Cohesion: 0.19
Nodes (11): needsLookupValue(), parseObject(), prefetchModeValue(), PrefetchShadowReport, readSearchPrefetchRows(), renderPrefetchShadowReport(), scorePrefetchShadow(), SearchPrefetchRow (+3 more)

### Community 83 - "models.ts"
Cohesion: 0.16
Nodes (17): Extraction Funnel, Fact Reclassification, Storage Schema, BuiltIn, detail(), errorText(), failure(), listed() (+9 more)

### Community 84 - "messageContent.ts"
Cohesion: 0.09
Nodes (34): Attachment Intake, Linked Files (`attachment_url`), Where Files Come From, ImageAttachment, isSupportedMedia(), describeEmbed(), describeForwardedSnapshots(), describePoll() (+26 more)

### Community 85 - "PackFileScreen.tsx"
Cohesion: 0.08
Nodes (46): Band, bandFor(), MEMORY, PanelTab, PreviewPanel(), PreviewPanelProps, Tabs(), api (+38 more)

### Community 86 - "retriever.ts"
Cohesion: 0.15
Nodes (24): ClaimSource, GuildMemoryClaim, ClaimRow, compareRetrieved(), formatGuildFactDate(), getActiveClaims(), mapClaim(), MONTH_NAMES (+16 more)

### Community 87 - "config.ts"
Cohesion: 0.04
Nodes (77): Configuration (AGENTS.md), Secrets, Source Files, Source Files, At a Glance, Legacy Config, Model Profiles, Models (+69 more)

### Community 88 - "Social Post Viewing Research"
Cohesion: 0.29
Nodes (6): Decision, Limits, Live Experiments, Platform Findings, Social Post Viewing Research, X/Twitter Finding

### Community 89 - "ToneKey"
Cohesion: 0.13
Nodes (23): AssemblerInput, splitStablePrefix(), STABLE_PREFIXES, CORE_PROMPT, CORE_PROMPT_FORGET_ONLY, CORE_PROMPT_MEMORY_FREE, MEMORY_TOOL_RULES, FaceGroup (+15 more)

### Community 90 - "gameCommands.ts"
Cohesion: 0.25
Nodes (20): createGameCommandHandler(), GAME_COMMAND_NAMES, handleBuddyGuide(), handleHangmanGuide(), handleLeaderboard(), buildGameContainer(), buildTimeoutContainer(), handleShiritoriEnd() (+12 more)

### Community 91 - "extractionSchema.ts"
Cohesion: 0.05
Nodes (40): AddOperationSchema, calendarDateProperties, DATED_GUILD_PREDICATES, DatedGuildAddOperationSchema, DatedGuildPredicateId, datedGuildPredicates, DatedGuildPredicateSchema, DatedGuildUpdateOperationSchema (+32 more)

### Community 92 - "markdownGuard.ts"
Cohesion: 0.50
Nodes (6): eachOutside(), guardMarkdown(), guardProse(), guardText(), isFace(), KAOMOJI

### Community 93 - "embeddings/client.ts"
Cohesion: 0.11
Nodes (23): EmbeddingClient, EmbeddingRole, EmbeddingSettings, FACTORIES, resetEmbeddingClientForTest(), isEmbeddingVector(), createGeminiEmbeddingClient(), createLocalEmbeddingClient() (+15 more)

### Community 94 - "memoryClaimSchema.ts"
Cohesion: 0.40
Nodes (9): columnsOf(), createEvidenceTable(), createFts(), createIndexes(), ensureMemoryClaimSchema(), migrateClaimLifecycle(), migrateClaimTable(), needsSubjectMigration() (+1 more)

### Community 95 - "anthropicLlm.ts"
Cohesion: 0.04
Nodes (81): Failure Classification, FailureKind, Block, classifyAnthropicError(), create(), Effort, ImageMediaType, markerBlock() (+73 more)

### Community 96 - "WAV File Validation"
Cohesion: 0.38
Nodes (5): read_wav(), WavError, make_wav(), ReadWavTest, ValueError

### Community 97 - "load.ts"
Cohesion: 0.05
Nodes (60): main(), MEMORY_MODES, summary(), copies, run(), buildContextPrompt(), Character, deepFreeze() (+52 more)

### Community 98 - "reclassify.ts"
Cohesion: 0.09
Nodes (31): oldClaimId, undone, confidenceForEvidence(), isMoveTarget(), predicate(), PredicateId, activeCount(), CandidateRow (+23 more)

### Community 99 - "ASR Sidecar Service"
Cohesion: 0.22
Nodes (8): API, ASR Sidecar, Build and Run, Configuration, `GET /health`, Models and Licences, `POST /transcribe?maxSpeechSec=120`, Tests

### Community 100 - "app.test.ts"
Cohesion: 0.12
Nodes (18): StudioOptions, DEFAULT_BASE_URLS, ApiError, commentedConfig(), ENV_TEXT, FilesBody, json(), MODEL_ENV (+10 more)

### Community 101 - "fallbackModel.ts"
Cohesion: 0.06
Nodes (30): fallback Config Section, Logs, Pinning, Routing, Sticky Window, Switch, AnswerModel, errorText() (+22 more)

### Community 102 - "memoryTools.test.ts"
Cohesion: 0.15
Nodes (16): Where Rokabot Decides Today, touchRecalled(), forgetUserTool, recallUserTool, embedQuery(), identityOf(), recallUser(), RecallUserResult (+8 more)

### Community 103 - "identityResolver.ts"
Cohesion: 0.07
Nodes (40): GPT-6-Astra, Jev Rollout Plan, Second Opinion, Who-Is-Who Resolver, channelVisibility, buildEpisodeRecallBlock(), formatEpisodeRecallBlock(), RecalledEpisode (+32 more)

### Community 104 - "duration.ts"
Cohesion: 0.33
Nodes (8): Box, movieDuration(), mp4DurationSec(), readBox(), box(), BoxSize, mvhdV0(), mvhdV1()

### Community 105 - "turnMedia.test.ts"
Cohesion: 0.20
Nodes (5): digestFor(), emptyPrepared, mocks, okWatch(), watchedHalf()

### Community 107 - "Character Harness Research 2026"
Cohesion: 0.12
Nodes (18): 1. Character as a Folder Pack, 2. Static First, Dynamic After, Reply Shape Last, 3. Any OpenAI-Compatible Endpoint, 4. Files First, Dashboard Later, Character Formats, Character Harness Research 2026, Decisions for Rokabot, Evidence-Backed (+10 more)

### Community 108 - "Raspberry Pi Runbook"
Cohesion: 0.08
Nodes (26): Access, At a Glance, Bot Lifecycle, Bug Reports, Data and Backups, Docker, Episodes, Media Memory and Recall, Failure Diagnostics (+18 more)

### Community 109 - "Speech Budget Management"
Cohesion: 0.42
Nodes (4): Keep time-ordered segments within the speech budget, spread across the clip.…, Segment, select_segments(), SelectSegmentsTest

### Community 110 - "gacha.ts"
Cohesion: 0.18
Nodes (25): handleGachaMention(), statBar(), formatBuddySummary(), formatHatchTimeRemaining(), handleBuddyLeaderboard(), handleBuddyStats(), handleBuddyView(), handleHatch() (+17 more)

### Community 111 - "redditFeed.ts"
Cohesion: 0.56
Nodes (9): decodeEntities(), entryAuthor(), entryContent(), feedEntries(), feedField(), htmlToText(), NAMED_ENTITIES, parseRedditFeedPost() (+1 more)

### Community 112 - "replyShape.ts"
Cohesion: 0.09
Nodes (36): Tunables, Known Limits, Rerunning the Check, Results, Roka Voice v4: Looked-Up Turns and Saying No, Root Causes, Tunables, What Changed (+28 more)

### Community 116 - "Characters"
Cohesion: 0.08
Nodes (28): A Pack Outside the Image, At a Glance, character.yml, Characters, Harness Prompts and Overrides, How the Bot Picks a Pack, Make a New Character, moods.yml (+20 more)

### Community 117 - "promptSafety.ts"
Cohesion: 0.14
Nodes (20): Bounded Retrieval (Legacy), escapeRegExp(), stripNarratedToolCalls(), buildFactsEnvelope(), buildOverheardBlock(), FACTS_UNTRUSTED_DATA_LABEL, isSafeFactKey(), isSafeFactScalar() (+12 more)

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
Nodes (26): Extraction, Jev Judgments, Main-Model Judge, Memory Judge, Memory Judgments, renderFactSentence(), HiddenRetract, reconcileHiddenRetractions() (+18 more)

### Community 123 - "test-chat.ts"
Cohesion: 0.10
Nodes (22): ref_node_readline, ref_node_util, args, handleInput(), htmlIndex, main(), previewMessages, username (+14 more)

### Community 124 - "replyReader"
Cohesion: 0.23
Nodes (7): createReplyReader(), isAbort(), replyReader, ReplyLookup, FOUND, readerWith(), SETTINGS

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
Cohesion: 0.10
Nodes (31): dotenv, CITY_SCHEMA, hasThinkingTag(), isFilled(), isSupportedProfile(), isTimeZone(), judgeJson(), judgeText() (+23 more)

### Community 130 - "test-gemini-ga-compare.ts"
Cohesion: 0.14
Nodes (16): ErrorRecoveryPlugin, main(), results, runQuery(), TestResult, wordCount(), CapturingErrorPlugin, classify() (+8 more)

### Community 131 - "Speech Transcription Processing"
Cohesion: 0.60
Nodes (5): decode(), detect_speech(), language_code(), transcribe(), ndarray

### Community 133 - "textEdit.ts"
Cohesion: 0.31
Nodes (17): Primitive, Flow, flowMap(), insertLine(), insertPair(), lineEnd(), lineStart(), pairOf() (+9 more)

### Community 134 - "embedEpisodeText"
Cohesion: 0.19
Nodes (12): getEmbeddingClient(), embedEpisodeText(), EpisodeEmbeddingRole, persistEpisodeResult(), EpisodeRunResult, delay(), embedPendingFacts(), sweep() (+4 more)

### Community 135 - "migrate-memory-v2.ts"
Cohesion: 0.27
Nodes (13): attestedScopes(), backfillLegacyRows(), ClaimReviewRow, findUnbackfilledRows(), hasBackfillMarker(), isUnsafeClaimError(), LegacyMemoryRow, legalScopes() (+5 more)

### Community 136 - "deploy Job"
Cohesion: 0.48
Nodes (7): deploy Job, Notify Discord Steps, Health Check Step, test Job, Deploy to Pi Workflow, Commands (AGENTS.md), Working Conventions (PR-only shipping)

### Community 137 - "ref_node_fs"
Cohesion: 0.07
Nodes (29): js-yaml, ref_node_child_process, ref_node_crypto, ref_node_fs, ref_node_http, ref_node_os, ref_node_path, ref_node_worker_threads (+21 more)

### Community 138 - "recall.test.ts"
Cohesion: 0.12
Nodes (19): Unified Recall, registerChannelVisibility(), resetChannelVisibilityForTest(), UNKNOWN, recallForTurn(), RecallInput, RecallItem, here (+11 more)

### Community 140 - "roka.ts"
Cohesion: 0.05
Nodes (54): Video Low Resolution Recommendation, BackoffOptions, classifyGeminiFailure(), classifyMarker(), computeBackoff(), DEFAULT_MAX_BACKOFF_MS, extractGeminiStatus(), GeminiFailureResult (+46 more)

### Community 141 - "verification.test.ts"
Cohesion: 0.14
Nodes (14): OperationApplicationReport, activeFacts(), apply(), candidateFacts(), episode(), evidenceCount(), factsWithStatus(), jevApplied() (+6 more)

### Community 142 - "test-features.ts"
Cohesion: 0.12
Nodes (32): reminders Config Section, session Config Section, assert(), fail(), main(), makeMessage(), pass(), results (+24 more)

### Community 143 - "UI TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noUnusedLocals (+6 more)

### Community 144 - "System Architecture"
Cohesion: 0.12
Nodes (16): Architecture, At a Glance, Core Code Modules, Discord Events (Inbound), Durable State, Gateway Setup, Installation and Context Policy, InteractionCreate (`/ask`) (+8 more)

### Community 145 - "downloadAttachment"
Cohesion: 0.26
Nodes (10): Download, downloadAttachment(), readWithinLimit(), isobmffAllowsPrefix(), PrefixPolicy, prefixPolicyFor(), STREAMABLE_TYPES, box() (+2 more)

### Community 146 - "attachmentCost.ts"
Cohesion: 0.12
Nodes (19): PDF Token Cost Measurement, sharp, spriteFiles, anthropicBlock(), countWithAnthropic(), estimateTokens(), imageTokens(), measureAttachmentTokens() (+11 more)

### Community 147 - "anthropicLlm.test.ts"
Cohesion: 0.10
Nodes (20): @anthropic-ai/sdk, AnthropicLlm, STRUCTURED_OUTPUT_TOOL, ContentBlock, fixtures, usage(), answer(), budget (+12 more)

### Community 148 - "yamlEdit.ts"
Cohesion: 0.23
Nodes (21): yaml, character, config, repo, voice, stringifyDoc(), addItem(), deleteNode() (+13 more)

### Community 149 - "render.ts"
Cohesion: 0.11
Nodes (42): escapeHtml(), linkHtml(), MarkdownContext, renderMarkdown(), renderPlainText(), asObject(), asObjects(), authorKey() (+34 more)

### Community 150 - "Configuration"
Cohesion: 0.07
Nodes (28): At a Glance, Capture and Prompt, Character, Configuration, `discord`, `embeddings`, `emoji`, `fallback` (+20 more)

### Community 151 - "persona-replay.ts"
Cohesion: 0.11
Nodes (28): ANTHROPIC_SEARCH, appendReplyShape(), Arm, claudeSettings(), GEMINI_CONFIG, GEMINI_SEARCH, loadArm(), LoadedArm (+20 more)

### Community 152 - "Configuration Changes"
Cohesion: 0.22
Nodes (9): Any OpenAI-Compatible Model, Budgets and Monthly Spend, Configuration Changes, Discord App Install and Permissions, Environment Switches, Gemini Terms, Hedging Slow Calls, Verify a Model Profile (+1 more)

### Community 153 - "privacy"
Cohesion: 0.06
Nodes (36): Memory, At a Glance, Browse Memory in Obsidian, Forgetting and Opting Out, How She Learns, Key Settings, Maintenance Scripts, Memory (+28 more)

### Community 154 - "pack.ts"
Cohesion: 0.08
Nodes (71): createApp(), route(), Handler, PREVIEW_FIELDS, previewQuery(), CHECK_SCRIPT, checkConfig(), ConfigPaths (+63 more)

### Community 155 - "Reliability"
Cohesion: 0.10
Nodes (22): `search`, Hedge, At a Glance, Source Files, A Spent Day Is Not a Spent Minute, ADK Error Delivery Constraint, At a Glance, Concurrency and Lifecycle Under Retry (+14 more)

### Community 156 - "queries.test.ts"
Cohesion: 0.13
Nodes (14): distinctRememberedUsers(), episodeCount(), MEMORY_STATS_SQL, outcomeBreakdown(), successRate, topTones(), insertClaim(), insertGuildClaim() (+6 more)

### Community 157 - "config"
Cohesion: 0.04
Nodes (57): Tech Stack (AGENTS.md), logging Config Section, Process Lifecycle, discord.js, GEMINI_IMAGE_TOKENS, PreparedAttachments, cleanupExpired(), monitoredChannels (+49 more)

### Community 158 - "promptGolden.test.ts"
Cohesion: 0.21
Nodes (12): computeGolden(), digest(), FIXTURE, MESSAGES, MODES, RECENT, seeded(), TONES (+4 more)

### Community 159 - "Jev Judgments"
Cohesion: 0.20
Nodes (10): At a Glance, Client, Configuration, Jev Judgments, Modes, Questions, Search Prefetch, Tools (+2 more)

### Community 160 - "README.md"
Cohesion: 0.22
Nodes (8): Jev Integration (Research Doc), Contributing, Documentation, How It Works, License, Quick Start, Tech Stack, Who Is Maniwa Roka and Rokabot?

### Community 161 - "recall-calibration-thresholds.ts"
Cohesion: 0.19
Nodes (17): chooseFloor(), cli(), cohensKappa(), currentFloorOf(), KindReport, Label, main(), MIN_AGREED_PAIRS (+9 more)

### Community 162 - "Rules Across Modules"
Cohesion: 0.22
Nodes (9): At a Glance, Changing a Contract, Modules, Rules Across Modules, SQLite Is Canonical, Technical Requirements, The Character Pack Is the Persona Source, The System Prompt Has a Size Cap (+1 more)

### Community 163 - "judgments.ts"
Cohesion: 0.10
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
Cohesion: 0.14
Nodes (21): ForgetUserParams, GetAnimeScheduleParams, cancelReminderTool, getAnimeScheduleTool, listRemindersTool, MEMORY_TOOL_NAMES, readRepliesTool, searchAvailable (+13 more)

### Community 168 - "toneStyles.ts"
Cohesion: 0.50
Nodes (3): getToneStyle(), TONE_STYLES, ToneStyle

### Community 169 - "Deployment and Setup Guide"
Cohesion: 0.14
Nodes (14): At a Glance, First-Run Checks, Getting Started, Install and Configure, Model Keys for the Shipped Config, Next Steps, Prerequisites, Register Slash Commands (+6 more)

### Community 170 - "Auto-Deploy Platforms"
Cohesion: 0.14
Nodes (13): Answer, Auto-Deploy Platforms, Coolify, Docker API Version, Fly.io, GHCR Limits, Maintained Fork, Original Project (+5 more)

### Community 171 - "Roka Voice v3: Restoring Variety on Haiku"
Cohesion: 0.22
Nodes (8): Canon Research, Complaints After the Haiku Switch, Known Weak Spots, Replay and Blind-Judge Method, Results, Roka Voice v3: Restoring Variety on Haiku, Root Causes, Tuning Rounds

### Community 173 - "persona-report.ts"
Cohesion: 0.14
Nodes (23): countSlurRepetitions(), firstWord(), formatTable(), innerThoughts(), main(), MARKERS, paragraphs(), pct() (+15 more)

### Community 174 - "Embedding Project Config"
Cohesion: 0.15
Nodes (12): compilerOptions, lib, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+4 more)

### Community 175 - "searchAnime.ts"
Cohesion: 0.24
Nodes (8): searchAnimeTool, jikanThrottle(), AnimeResult, JikanAnimeEntry, JikanResponse, searchAnime(), SearchAnimeParams, SearchAnimeResult

### Community 179 - "Features"
Cohesion: 0.20
Nodes (10): At a Glance, Features, Games and Gacha, Reactions, Status Rotation and Update Notices, Reminders, Seeing and Watching, Source Files, Stats (+2 more)

### Community 180 - "Embedding Service Docs"
Cohesion: 0.20
Nodes (9): API, Build and Run, Configuration, Embedding Sidecar, `GET /health`, Model and Licences, `POST /embed`, Smoke Test (+1 more)

### Community 182 - "react"
Cohesion: 0.08
Nodes (37): react, NoticeRow(), NotificationCenter(), THEMES, ThemeSwitch(), ToastCard(), Toaster(), TONE_ICON (+29 more)

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
Cohesion: 0.35
Nodes (9): buildCollectionPage(), buildPaginatedCollectionPage(), COLLECTION_PAGE_SIZE, getCollectionPageCount(), handleBuddyCollection(), { getBuddyCollection }, BuddyData, getBuddyCollection() (+1 more)

### Community 193 - "Changelog"
Cohesion: 0.20
Nodes (9): [0.2.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.1.0...v0.2.0) (2026-10-16), [0.3.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.2.0...v0.3.0) (2026-10-16), [0.4.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.3.0...v0.4.0) (2026-10-17), Bug Fixes, Bug Fixes, Changelog, Features, Features (+1 more)

### Community 194 - "Character Packs"
Cohesion: 0.25
Nodes (7): Character Packs, Layout, Locked Prompts, Macros, Making a New Character, Prompt Files, Search Prompts

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
Cohesion: 0.13
Nodes (30): estimateTokens(), TextEditor, TextEditorHandle, TextEditorProps, Columns(), EntryNote(), EntryNoteProps, characterPath() (+22 more)

### Community 223 - "fixtures.ts"
Cohesion: 0.06
Nodes (22): @axe-core/playwright, @playwright/test, PAGES, at(), field(), studio_ui_e2e_fixtures_expect, Studio, test (+14 more)

### Community 224 - "roka.test.ts"
Cohesion: 0.11
Nodes (26): generateResponse(), getRandomFallback(), requestTimeoutFor(), __setTestRunTurnFactory(), steeringForRequest, TestRunTurn, destroySession(), resetIdleTimer() (+18 more)

### Community 225 - "measure.ts"
Cohesion: 0.35
Nodes (9): Ceiling, ceilingsFor(), formatReport(), main(), MIME_BY_EXTENSION, mimeForPath(), resolveKey(), TokenLimits (+1 more)

### Community 226 - "Product Requirements"
Cohesion: 0.22
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

### Community 232 - "readReplies.ts"
Cohesion: 0.20
Nodes (13): SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL, MAX_REQUESTED_REPLIES, ReadRepliesParams, author(), formatSocialPostLine(), PLATFORM_NAMES, quoted(), replies() (+5 more)

### Community 235 - "reports.ts"
Cohesion: 0.43
Nodes (6): main(), parseArgs(), ReportOptions, ReportRow, showMany(), showOne()

### Community 236 - "Decisions"
Cohesion: 0.22
Nodes (8): Agent and Prompts, Decisions, Deployment, Discord, Media, Memory, Models and Search, Repository

### Community 238 - "smoke.ts"
Cohesion: 0.25
Nodes (5): ref_node_assert, EmbedReply, golden, goldenPath, record

### Community 248 - "Media Watching"
Cohesion: 0.25
Nodes (8): Accounting, Digest and Turn Input, Gemini Watcher, Media Watching, Remembered Media, Speech Sidecar, Transport, Watcher Modes

### Community 250 - "Coding Guidelines (Andrej Karpathy)"
Cohesion: 0.33
Nodes (5): 1. Think Before Coding, 2. Simplicity First, 3. Surgical Changes, 4. Goal-Driven Execution, Coding Guidelines (Andrej Karpathy)

## Knowledge Gaps
- **1648 isolated node(s):** `$schema`, `indentStyle`, `indentWidth`, `lineWidth`, `enabled` (+1643 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2130 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **47 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `contentKey.ts`, `jevReplay.ts`, `qwenWatch.ts`, `better-sqlite3`, `buddy.ts`, `messageBuilder.ts`, `getDb`, `src/games/hangman.ts`, `scheduler.ts`, `searchNativeAnthropic.test.ts`, `messageCreate.ts`, `character/index.ts`, `replies/service.ts`, `guildFactDates.ts`, `metrics.eval.test.ts`, `Media`, `memoryShadow.ts`, `database.ts`, `turnContext.ts`, `run.ts`, `closeDb`, `rateLimiter.ts`, `turnMedia.ts`, `recall-calibration-sample.ts`, `src/games/shiritori.ts`, `youtubeStreams.ts`, `toolTriggerScoring.ts`, `memoryEpisodeReplay.ts`, `getAnimeSchedule.ts`, `chatCompletionsLlm.test.ts`, `memoryEpisodeStore.ts`, `byteBudget.ts`, `generateObject.ts`, `discord/attachments.ts`, `charts.ts`, `Inline Data Contract`, `handler.ts`, `predicates.ts`, `session.ts`, `budget.ts`, `schedule.test.ts`, `reportCommand.ts`, `extractor.ts`, `digest.ts`, `socialPosts/types.ts`, `parsers.ts`, `Prefetch Measurement Tools`, `package.json`, `File Upload Handling`, `interactionCreate.metrics.test.ts`, `toolTrigger.ts`, `getWeather.ts`, `views.test.ts`, `watch.ts`, `nativeAnthropic.ts`, `Search Prefetch Reporting`, `messageContent.ts`, `retriever.ts`, `config.ts`, `ToneKey`, `markdownGuard.ts`, `embeddings/client.ts`, `anthropicLlm.ts`, `load.ts`, `reclassify.ts`, `app.test.ts`, `fallbackModel.ts`, `memoryTools.test.ts`, `identityResolver.ts`, `duration.ts`, `turnMedia.test.ts`, `gacha.ts`, `replyShape.ts`, `promptSafety.ts`, `metadata.ts`, `emojiReactor.ts`, `hiddenRetractions.test.ts`, `replyReader`, `transcribe.test.ts`, `probe-llm-profile.ts`, `embedEpisodeText`, `ref_node_fs`, `recall.test.ts`, `roka.ts`, `verification.test.ts`, `test-features.ts`, `downloadAttachment`, `attachmentCost.ts`, `anthropicLlm.test.ts`, `yamlEdit.ts`, `persona-replay.ts`, `queries.test.ts`, `config`, `promptGolden.test.ts`, `judgments.ts`, `tools/index.ts`, `toneStyles.ts`, `persona-report.ts`, `collection.ts`, `roka.test.ts`, `measure.ts`, `getCurrentTime.ts`, `replyBlocks.ts`, `readReplies.ts`?**
  _High betweenness centrality (0.234) - this node is a cross-community bridge._
- **Why does `config` connect `config` to `test-gemini-ga-compare.ts`, `buddy.ts`, `embedEpisodeText`, `getDb`, `src/games/hangman.ts`, `scheduler.ts`, `ref_node_fs`, `recall.test.ts`, `roka.ts`, `messageCreate.ts`, `character/index.ts`, `test-features.ts`, `replies/service.ts`, `attachmentCost.ts`, `metrics.eval.test.ts`, `guildFactDates.ts`, `memoryShadow.ts`, `database.ts`, `turnContext.ts`, `run.ts`, `closeDb`, `rateLimiter.ts`, `turnMedia.ts`, `recall-calibration-thresholds.ts`, `recall-calibration-sample.ts`, `judgments.ts`, `youtubeStreams.ts`, `src/games/shiritori.ts`, `tools/index.ts`, `getAnimeSchedule.ts`, `chatCompletionsLlm.test.ts`, `memoryEpisodeStore.ts`, `byteBudget.ts`, `recall.ts`, `generateObject.ts`, `discord/attachments.ts`, `session.ts`, `obsidianExport.ts`, `budget.ts`, `reportCommand.ts`, `extractor.ts`, `collection.ts`, `File Upload Handling`, `interactionCreate.metrics.test.ts`, `toolTrigger.ts`, `getWeather.ts`, `watch.ts`, `nativeAnthropic.ts`, `retriever.ts`, `config.ts`, `embeddings/client.ts`, `roka.test.ts`, `reclassify.ts`, `getCurrentTime.ts`, `fallbackModel.ts`, `memoryTools.test.ts`, `identityResolver.ts`, `readReplies.ts`, `gacha.ts`, `emojiReactor.ts`, `hiddenRetractions.test.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `getDb()` connect `getDb` to `better-sqlite3`, `buddy.ts`, `embedEpisodeText`, `migrate-memory-v2.ts`, `src/games/hangman.ts`, `scheduler.ts`, `recall.test.ts`, `queries.ts`, `messageCreate.ts`, `test-features.ts`, `verification.test.ts`, `views.ts`, `metrics.eval.test.ts`, `memoryShadow.ts`, `database.ts`, `turnContext.ts`, `run.ts`, `closeDb`, `config`, `queries.test.ts`, `rateLimiter.ts`, `src/games/shiritori.ts`, `tools/index.ts`, `memoryEpisodeReplay.ts`, `memoryEpisodeStore.ts`, `recall.ts`, `obsidianExport.ts`, `budget.ts`, `reportCommand.ts`, `extractor.ts`, `collection.ts`, `retriever.ts`, `gameCommands.ts`, `reclassify.ts`, `memoryTools.test.ts`, `identityResolver.ts`, `gacha.ts`, `hiddenRetractions.test.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `$schema`, `indentStyle`, `indentWidth` to the rest of the system?**
  _1648 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `jevReplay.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1310483870967742 - nodes in this community are weakly interconnected._
- **Should `qwenWatch.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08558558558558559 - nodes in this community are weakly interconnected._
- **Should `better-sqlite3` be split into smaller, more focused modules?**
  _Cohesion score 0.083710407239819 - nodes in this community are weakly interconnected._