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

| Component       | Technology                    | Version | Notes                                                    |
| --------------- | ----------------------------- | ------- | -------------------------------------------------------- |
| Agent Framework | @google/adk                   | ^0.1    | TypeScript ADK; fallback to @google/genai if unavailable |
| LLM Client      | @google/genai                 | ^1.0    | Gemini API client (ADK dependency)                       |
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

#### InteractionCreate (slash command)

```
Event: interactionCreate
Filter: isChatInputCommand() && commandName === 'chat'
Extract: interaction.options.getString('message'), channelId, user.displayName
Flow: deferReply() → process → editReply(response)
```

#### MessageCreate (mention/reply)

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
