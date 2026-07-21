# Product Requirements Document

> References: [`docs/TRD.md`](./TRD.md) for technical details, [`docs/ROADMAP.md`](./ROADMAP.md) for phase timeline.

---

## Problem Statement

Fans of visual novel characters like Maniwa Roka (Senren\*Banka) want to interact with their favorite characters in a natural, conversational way. Existing chatbots lack the depth of personality, speech patterns, and emotional nuance needed to feel authentic. There is no easy way for a small Discord community to have a character bot that maintains conversational context and responds in-character across group conversations.

## Project Objectives

1. **Authentic character interaction** — Roka's personality, speech patterns, emotional responses, and behavioral quirks are faithfully represented through a layered prompt system derived from a comprehensive character bible.
2. **Natural conversation flow** — Users can interact via slash commands or natural mention/reply, with Roka maintaining per-channel context for coherent multi-turn conversations.
3. **Resource efficiency** — The bot runs on a Raspberry Pi 5 (8GB) within Gemini Flash Lite's free-tier rate limits (15 RPM, 250K TPM, 500 RPD).
4. **Graceful degradation** — When rate-limited or encountering errors, Roka responds in-character rather than showing raw errors.
5. **Future extensibility** — Architecture supports adding utility features via Google ADK tool integrations post-MVP.

## Target Users

| User Type         | Description                             | Primary Need                     |
| ----------------- | --------------------------------------- | -------------------------------- |
| Server Members    | Anime/VN fans in a Discord server       | Chat with Roka in-character      |
| Server Owner (ZJ) | Bot operator, deploys on RPi 5          | Easy deployment, low maintenance |
| Casual Chatters   | Users who @mention Roka in conversation | Natural, context-aware responses |

## User Workflow Overview

```
User types /chat "message"     User @mentions Roka
        │                              │
        ▼                              ▼
  Discord delivers             Discord delivers
  interaction event            message event
        │                              │
        └──────────┬───────────────────┘
                   │
                   ▼
         Rate limit check
        ┌──────────┴──────────┐
        │                     │
     Allowed              Rate limited
        │                     │
        ▼                     ▼
   Show typing         Send in-character
   indicator            decline message
        │
        ▼
   Build session context
   (FIFO window + tone detection)
        │
        ▼
   Assemble layered prompt
   (core + speech + tone + context)
        │
        ▼
   Call Gemini via ADK
        │
        ▼
   Send Roka's response
   (split if >2000 chars)
        │
        ▼
   Update session window
```

## Functional Requirements

### FR-1: Slash Command Interaction

The bot registers a `/chat` guild-scoped slash command with a required `message` string option.

**Acceptance Criteria:**

- [ ] `/chat` command appears in Discord command picker
- [ ] Command accepts a `message` string parameter
- [ ] Bot defers reply (shows "thinking...") while processing
- [ ] Bot edits deferred reply with Roka's response
- [ ] Commands are re-registered on every bot startup

### FR-2: Mention/Reply Interaction

The bot responds when directly @mentioned or when a user replies to one of the bot's messages.

**Acceptance Criteria:**

- [ ] Bot detects @mention and strips the mention tag from message content
- [ ] Bot detects replies to its own messages
- [ ] Bot ignores its own messages and other bots
- [ ] Bot shows typing indicator while processing
- [ ] Bot replies in the same channel

### FR-3: Per-Channel Conversational Memory

Each channel maintains an independent conversation session with a sliding message window.

**Acceptance Criteria:**

- [ ] Session created on first interaction per channel
- [ ] Last 10 messages stored in FIFO order (oldest evicted)
- [ ] Both user and assistant messages tracked with display name, content, timestamp
- [ ] Session destroyed after 5 minutes of inactivity
- [ ] Session state is in-memory only (no persistence)

### FR-4: Layered Personality Prompts

Roka's system prompt is assembled from 4 layers derived from the character bible.

**Acceptance Criteria:**

- [ ] Layer 0 (Core Identity) always included — personality, behavioral rules
- [ ] Layer 1 (Speech Patterns) always included — verbal style, response length
- [ ] Layer 2 (Conversation Tone) dynamically selected — playful/sincere/domestic/flustered
- [ ] Layer 3 (Channel Awareness) dynamically built — participant names, time of day
- [ ] Total system prompt stays within ~1000-1600 tokens

### FR-5: Tone Detection

A rule-based detector selects the appropriate tone layer based on recent messages.

**Acceptance Criteria:**

- [ ] Detects romantic/flirty keywords → flustered tone
- [ ] Detects emotional/supportive keywords → sincere tone
- [ ] Detects food/daily life keywords → domestic tone
- [ ] Defaults to playful tone when no pattern matches
- [ ] Zero LLM cost (keyword matching only)

### FR-6: Rate Limiting

Dual rate limiter prevents exceeding Gemini API quotas.

**Acceptance Criteria:**

- [ ] Token bucket for RPM (refills over time, configurable)
- [ ] Daily counter for RPD (resets at midnight, configurable timezone)
- [ ] Rate limit checked before any Gemini API call
- [ ] When limited, bot sends an in-character decline message
- [ ] Decline messages do not consume session window slots or reset idle timer

### FR-7: Error Handling

All errors surface as in-character messages, never raw errors.

**Acceptance Criteria:**

- [ ] Gemini 429 → respect Retry-After, in-character decline
- [ ] Gemini 500/503 → single retry after 2s, then in-character decline
- [ ] Gemini timeout (>15s) → cancel, in-character decline
- [ ] Discord permission errors → log warning, skip silently
- [ ] Empty Gemini response → send fallback in-character message

### FR-8: Response Formatting

Responses respect Discord's message length limits.

**Acceptance Criteria:**

- [ ] Responses >2000 characters split at sentence boundaries
- [ ] Split chunks sent sequentially with ~500ms delay
- [ ] Empty/whitespace responses replaced with in-character fallback

### FR-9: Docker Deployment

The bot runs as a Docker Compose service on Raspberry Pi 5.

**Acceptance Criteria:**

- [ ] Multi-stage Dockerfile (build + slim runtime)
- [ ] ARM64 compatible (node:24-alpine)
- [ ] Non-root container user
- [ ] Memory capped at 512MB
- [ ] Auto-restart on crash/reboot (`unless-stopped`)
- [ ] Log rotation configured (10MB max, 3 files)

### FR-10: Graceful Shutdown

The bot cleans up resources on shutdown signals.

**Acceptance Criteria:**

- [ ] Handles SIGTERM and SIGINT
- [ ] Clears all session idle timers
- [ ] Destroys Discord client connection
- [ ] 5-second forced exit timeout
