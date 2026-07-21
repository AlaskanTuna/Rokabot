# Technical Requirements Document — Rokabot

> References: [`docs/PRD.md`](./PRD.md) for product requirements, [`docs/ROADMAP.md`](./ROADMAP.md) for phase timeline.

---

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                  Discord Server                  │
│  User sends /chat or @Roka                       │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│              Discord Gateway Layer                │
│  discord.js v14 client                            │
│  - Slash command handler (/chat)                  │
│  - Message handler (mention/reply detection)      │
│  - Rate limit guard (token bucket RPM + daily RPD)│
│  - Concurrency guard (1 active req per channel)   │
│  - Typing indicator management                    │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│              Session Manager                      │
│  In-memory Map<channelId, ChannelSession>         │
│  - 10-message FIFO window (push/shift)            │
│  - 5-min idle TTL (setTimeout per channel)        │
│  - Creates/destroys sessions on demand            │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│              Roka Agent (ADK)                     │
│  - 4-layer prompt system                          │
│  - Rule-based tone detector                       │
│  - Prompt assembler                               │
│  - Gemini 3.1 Flash Lite backend                  │
│  - Future: ADK tool integrations                  │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│              Gemini API                           │
│  gemini-3.5-flash-lite                            │
│  15 RPM │ 250K TPM │ 500 RPD                     │
└─────────────────────────────────────────────────┘
```

## Technology Stack

### Runtime

| Component       | Technology | Version | Notes                         |
| --------------- | ---------- | ------- | ----------------------------- |
| Language        | TypeScript | ^5.8    | ES2022 target, Node16 modules |
| Runtime         | Node.js    | 24      | Alpine-based, ARM64 for RPi 5 |
| Package Manager | npm        | bundled | Lockfile committed            |

### Discord

| Component | Technology                            | Version | Notes                                                     |
| --------- | ------------------------------------- | ------- | --------------------------------------------------------- |
| SDK       | discord.js                            | ^14.18  | Gateway + REST                                            |
| Intents   | Guilds, GuildMessages, MessageContent | —       | MessageContent is privileged (auto-approved <100 servers) |
| Partials  | Channel, Message                      | —       | Required for reply detection                              |

### AI / Agent

| Component       | Technology            | Version | Notes                                                    |
| --------------- | --------------------- | ------- | -------------------------------------------------------- |
| Agent Framework | @google/adk           | ^0.1    | TypeScript ADK; fallback to @google/genai if unavailable |
| LLM Client      | @google/genai         | ^1.0    | Gemini API client (ADK dependency)                       |
| Model           | gemini-3.5-flash-lite | —       | 1M context, 15 RPM / 250K TPM / 500 RPD                  |

### Utilities

| Component  | Technology | Version | Notes                               |
| ---------- | ---------- | ------- | ----------------------------------- |
| Logging    | pino       | ^9.6    | Structured JSON; pino-pretty in dev |
| Env Vars   | dotenv     | ^16.5   | Loaded at startup                   |
| Dev Runner | tsx        | ^4.19   | Watch mode for development          |

### Testing

| Component   | Technology | Version  | Notes                              |
| ----------- | ---------- | -------- | ---------------------------------- |
| Test Runner | vitest     | ^3.1     | TypeScript-native, globals enabled |
| Coverage    | v8         | built-in | Via vitest coverage provider       |

### Deployment

| Component        | Technology           | Notes                       |
| ---------------- | -------------------- | --------------------------- |
| Containerization | Docker               | Multi-stage build           |
| Orchestration    | Docker Compose       | Single service (expandable) |
| Base Image       | node:24-alpine       | ARM64 native, ~150MB image  |
| Target Hardware  | Raspberry Pi 5 (8GB) | mem_limit: 512MB            |

## Data Models

### WindowMessage

Represents a single message in the per-channel FIFO window.

| Field         | Type                    | Description                                   |
| ------------- | ----------------------- | --------------------------------------------- |
| `role`        | `'user' \| 'assistant'` | Who sent the message                          |
| `displayName` | `string`                | Discord display name of the sender            |
| `content`     | `string`                | Message text content                          |
| `timestamp`   | `number`                | Unix timestamp (ms) when message was received |

### ChannelSession

Per-channel session state maintained by the SessionManager.

| Field          | Type              | Description                          |
| -------------- | ----------------- | ------------------------------------ |
| `channelId`    | `string`          | Discord channel ID (map key)         |
| `messages`     | `WindowMessage[]` | FIFO window (max 10, oldest evicted) |
| `idleTimer`    | `Timeout \| null` | 5-min idle TTL timer handle          |
| `lastActivity` | `number`          | Unix timestamp of last interaction   |

### RateLimiterConfig

Configuration for the dual rate limiter.

| Field | Type     | Default | Description                                     |
| ----- | -------- | ------- | ----------------------------------------------- |
| `rpm` | `number` | `15`    | Max requests per minute (token bucket capacity) |
| `rpd` | `number` | `500`   | Max requests per day (daily counter)            |

### AssemblerInput

Input to the prompt assembler for building the system prompt.

| Field          | Type       | Description                                      |
| -------------- | ---------- | ------------------------------------------------ |
| `tone`         | `ToneKey`  | Detected conversation tone                       |
| `participants` | `string[]` | Display names of recent participants             |
| `hour`         | `number`   | Current hour (0-23) for time-of-day context      |
| `displayName`  | `string`   | Display name of the current user being addressed |

### ToneKey

Enum of detected conversation tones.

| Value         | Trigger                            | Layer 2 Effect                     |
| ------------- | ---------------------------------- | ---------------------------------- |
| `'playful'`   | Default / no match                 | Teasing, big-sister energy         |
| `'sincere'`   | Emotional/supportive keywords      | Genuine, reflective                |
| `'domestic'`  | Food/daily life keywords           | Cozy, food-centered care           |
| `'flustered'` | Romantic/flirty keywords           | Stammering, composure breaking     |
| `'curious'`   | Questions/learning/analysis        | Engaged, enthusiastic, explanatory |
| `'annoyed'`   | Defiance/recklessness/teasing her  | Pouty exasperation, "mou~" energy  |
| `'tender'`    | Vulnerability/worry/quiet softness | Guard down, warm vulnerability     |
| `'confident'` | Help/advice/trust keywords         | Cool, composed onee-san authority  |

## API Contracts

### Discord Events (Inbound)

#### InteractionCreate (Slash Command)

```
Event: interactionCreate
Filter: isChatInputCommand() && commandName === 'chat'
Extract: interaction.options.getString('message'), channelId, user.displayName
Flow: deferReply() → process → editReply(response)
```

#### MessageCreate (Mention/Reply)

```
Event: messageCreate
Filter: !author.bot && (isMentioned || isReplyToBot)
Extract: content (stripped of mention tags), channelId, member.displayName
Flow: sendTyping() → process → message.reply(response)
```

### Gemini API (Outbound)

#### GenerateContent

```
Model: gemini-3.5-flash-lite
System Instruction: assembleSystemPrompt(tone, participants, hour)
Contents: [
  ...history.map(m => ({ role: m.role, parts: [{ text: `[${m.displayName}]: ${m.content}` }] })),
  { role: 'user', parts: [{ text: `[${displayName}]: ${userMessage}` }] }
]
```

**Token budget per request:**

- System prompt: ~1000-1600 tokens
- History (10 msgs x ~200-400 tokens): ~2000-4000 tokens
- User message: ~50-200 tokens
- **Total input: ~3K-6K tokens**

**Rate limits:**

- 15 RPM (binding constraint)
- 250K TPM (not the bottleneck at ~3K-6K per request)
- 500 RPD (~20 req/hr sustained)

## Deployment Pipeline

### Docker Build (Multi-Stage)

```
Stage 1: build
  ├── FROM node:24-alpine
  ├── COPY package.json + lockfile
  ├── npm ci (all deps)
  ├── COPY src/ + tsconfig.json
  └── npm run build (tsc → dist/)

Stage 2: runtime
  ├── FROM node:24-alpine
  ├── COPY package.json + lockfile
  ├── npm ci --omit=dev (prod deps only)
  ├── COPY dist/ from build stage
  ├── USER node (non-root)
  └── CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
services:
  roka:
    build: .
    restart: unless-stopped
    env_file: .env
    mem_limit: 512m
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
```

### RPi 5 Deployment Notes

- ARM64 architecture — `node:24-alpine` supports natively
- No cross-compilation needed if building on-device
- Expected runtime memory: ~80-150MB
- `mem_limit: 512m` is a safety guardrail against memory leaks
- `restart: unless-stopped` survives crashes and RPi reboots (Docker must start on boot)
- Log rotation prevents storage exhaustion on RPi's limited disk

## Reliability & Failure Handling

Gemini failures are classified before a live response or background extraction is finalized. The live
path uses `liveMaxRetries = 2`: up to two retries after the initial call, with a 1s exponential base
backoff and full jitter. Retrying must stop once the total added latency reaches approximately 12s, at
which point the specified fallback behavior applies.

| Taxonomy             | Examples / Detection                                                                          | Retryable                    | Max Attempts                 | Backoff                                                          | Rate-Limiter Token                                                                                                                    | Session Action                                                  | User-Visible Result                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `transient_http`     | 429, 500, 503, overloaded, quota, `RESOURCE_EXHAUSTED`, or `UNAVAILABLE`                      | Yes                          | `liveMaxRetries = 2` retries | 1s exponential base with full jitter; stop at ~12s added latency | Yes; each retry consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)                                                    | Preserve                                                        | Real answer if a retry succeeds; generic fallback after exhaustion or when the RPM floor prevents a retry                        |
| `network`            | `fetch failed`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, or abort-timeout                      | Yes                          | `liveMaxRetries = 2` retries | 1s exponential base with full jitter; stop at ~12s added latency | Yes; each retry consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)                                                    | Preserve                                                        | Real answer if a retry succeeds; generic fallback after exhaustion or when the RPM floor prevents a retry                        |
| `empty_text`         | No parts; `finishReason` `STOP`, `OTHER`, or unset; or `MAX_TOKENS` with thoughts-only output | Yes                          | `liveMaxRetries = 2` retries | 1s exponential base with full jitter; stop at ~12s added latency | Yes; each retry consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)                                                    | Preserve                                                        | Real answer if a retry succeeds; generic fallback after exhaustion or when the RPM floor prevents a retry                        |
| `safety`             | `SAFETY`, `PROHIBITED_CONTENT`, `BLOCKLIST`, or `SPII`                                        | No                           | 0 retries                    | None                                                             | The initial user message consumes its token; no retry token is consumed                                                               | Preserve                                                        | Distinct in-character safety deflection: “Ehh… let's not get into that one~”                                                     |
| `recitation`         | Gemini recitation finish reason or equivalent response classification                         | Yes, once                    | 1 resample                   | 1s full-jitter resample delay                                    | Yes; the resample consumes a token, only while `remainingRpm >= retryRpmFloor` (`2`)                                                  | Preserve                                                        | Real answer if the resample succeeds; otherwise an in-character decline                                                          |
| `terminal`           | 400, `INVALID_ARGUMENT`, authentication failure, or permission failure                        | No                           | 0 retries                    | None                                                             | The initial user message consumes its token; no retry token is consumed                                                               | Destroy                                                         | In-character decline                                                                                                             |
| `extraction_failure` | Any background memory-extraction failure                                                      | Only for a transient failure | 1 light retry                | Light full-jitter retry delay                                    | Yes; each extraction attempt, including its retry, consumes a token and may run only while `remainingRpm >= extractionRpmFloor` (`3`) | Preserve; background extraction never destroys the live session | No user-facing message; quietly give up after the retry or immediately for a non-transient failure, and never block user traffic |

### RPM-Budget Accounting

- A user message consumes one rate-limiter token today. Every live retry and every background extraction
  attempt, including an extraction retry, must also consume a token.
- Live retries require `remainingRpm >= retryRpmFloor` (`2`). Background extraction requires
  `remainingRpm >= extractionRpmFloor` (`3`); otherwise it is skipped so user traffic retains priority.
- Tool-chain calls up to `maxLlmCalls = 4` remain uncounted. This is known debt and is outside this
  reliability-policy change.

### Concurrency & Lifecycle Under Retry

- A concurrent message in a channel whose live turn is retrying is rejected by the per-channel guard
  with the existing in-character busy reply. It is dropped rather than queued or used to cancel the
  retrying turn; its content remains in the passive buffer for a later turn, and it consumes no
  rate-limiter token.
- Independent channels may retry concurrently. Cross-channel RPM contention is resolved by the
  synchronous `tryConsumeAboveFloor()` primitive, which is race-free under JavaScript run-to-completion.
  The extraction floor (`3`) exceeds the live-retry floor (`2`), so user-facing retries win over
  background extraction when tokens are scarce.
- An idle TTL cannot fire during a retry: `ttlMs` is much greater than the maximum retry window. If a
  session is nevertheless destroyed while its retry loop is in flight, the loop must resolve to a
  graceful fallback rather than throw.
- On `SIGTERM`, a retrying live turn aborts promptly within the existing 5s force-exit budget. This
  lifecycle behavior does not require a change to `index.ts`.
- The initial live attempt reuses the token already consumed by the Discord handler. Only subsequent
  retries consume additional rate-limiter tokens.

### ADK Error Delivery Constraint

Google ADK yields model-call errors as runner events rather than throwing them from `runner.runAsync()`.
Reliability handling must therefore classify yielded error events and `LlmResponse` fields before choosing
the taxonomy behavior above; it cannot rely solely on an outer `try`/`catch` around the runner.
