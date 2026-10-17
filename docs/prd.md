# Product Requirements

What Rokabot must do, for whom, and how far each requirement has shipped. Contracts live in [`trd.md`](./trd.md).

## At a Glance

| Item     | Value                                                                               |
| -------- | ----------------------------------------------------------------------------------- |
| Product  | A server-wide Discord chatbot that plays Maniwa Roka (馬庭 芦花) from Senren\*Banka |
| Users    | Server members who chat with her, and the operator who self-hosts her               |
| Surfaces | @mention, reply, the word "Roka", `/ask`, and seven other slash commands            |
| Host     | Docker Compose on a Raspberry Pi 5 (8 GB)                                           |
| Status   | 24 requirements: 21 Shipped, 3 Partial                                              |

## Problem

Fans of a visual novel character want to talk with her in a natural way. Most chatbots lack her personality, speech
patterns and emotional range. A small Discord community has no simple way to run a character bot that keeps context
and stays in character across a group conversation.

## Objectives

1. **Authentic Character:** a layered prompt keeps Roka's personality, speech, tone and quirks.
2. **Natural Conversation:** members reach her by mention, reply, name or `/ask`. She keeps per-channel context.
3. **Useful and Playful:** she uses tools, reads media, remembers the server, and runs small games.
4. **Resource Efficiency:** she runs on a Raspberry Pi 5 inside the configured rate limits and monthly spend caps.
5. **Graceful Degradation:** limits and errors produce in-character replies instead of raw error text.

## Target Users

| User Type       | Description                                     | Primary Need                                 |
| --------------- | ----------------------------------------------- | -------------------------------------------- |
| Server Members  | Anime and visual novel fans in a Discord server | Chat with Roka in character; games and tools |
| Casual Chatters | Members who mention her mid-conversation        | Natural replies that fit the channel context |
| Bot Operator    | Self-hosts the bot, for example on a Pi 5       | Easy deployment, low upkeep, bounded cost    |

## User Workflow

1. A member mentions Roka, replies to her, writes "roka", or runs `/ask`.
2. If the channel already has a turn in progress, she sends a busy line that deletes itself after 5 seconds.
3. If the rate limiter cannot admit `gemini.maxLlmCalls` (4) model calls, she declines in character.
4. She shows typing, opens a linked social post, and admits attachments under the byte and token budgets.
5. The turn builds the channel's session window, detected tone, memory blocks (not on `/ask`) and a reply shape.
6. The main model answers through Google ADK and may call tools. Retries and the fallback model cover failures.
7. She sends a reply card with a tool footer. The session window updates. Passive memory continues in the background.

## Functional Requirements

| ID    | Requirement                                                                                                                                                                                                                                                                                | Status  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| FR-1  | Reply to an @mention, a reply to her message, or the whole word `roka` in any case. Bots can trigger her only by name.                                                                                                                                                                     | Shipped |
| FR-2  | `/ask` takes a required `question`, 3 attachment slots and `attachment_url`. It works in servers, DMs and user installs. It reads no memory, offers no memory tools and writes no memory.                                                                                                  | Shipped |
| FR-3  | Register every slash command globally on each startup.                                                                                                                                                                                                                                     | Shipped |
| FR-4  | Keep one session per channel: the last `session.windowSize` (20) messages, closed after `session.ttl` idle, rebuilt from SQLite up to `session.maxRehydrationAge` (2 hours) old.                                                                                                           | Shipped |
| FR-5  | Assemble the system prompt from 4 layers (core, speech, tone, context) and close it with a reply shape picked in code, including an in-character saying-no scene for lewd bait or a hard line.                                                                                             | Shipped |
| FR-6  | Keep the system prompt under `MAX_SYSTEM_PROMPT_TOKENS` (6,500) in `tests/harness/tokens.ts`, enforced by `tests/harness/__tests__/tokens.test.ts`.                                                                                                                                        | Shipped |
| FR-7  | Detect one of 12 tones with rules at zero model cost. With `jev.tone: on`, Jev picks the tone at or above `jev.toneMinProbability`.                                                                                                                                                        | Shipped |
| FR-8  | Limit model calls with a sliding-window RPM (`rateLimit.rpm`, 15) and a daily RPD (`rateLimit.rpd`, 500) that resets at midnight UTC. Decline in character; the decline deletes itself after 5 seconds.                                                                                    | Shipped |
| FR-9  | Allow one active turn per channel.                                                                                                                                                                                                                                                         | Shipped |
| FR-10 | Retry transient model errors with backoff, up to `gemini.liveMaxRetries` times, inside `gemini.turnDeadlineMs`. Answer from `llm.fallback` when the main model fails, and stay on it for `llm.stickyMs`.                                                                                   | Shipped |
| FR-11 | Cap paid providers at `llm.monthlyBudgetUsd`: background jobs stop at 80% of the cap, replies at 100%.                                                                                                                                                                                     | Shipped |
| FR-12 | Show every error as an in-character line. Log and skip Discord permission and unknown-message errors (codes 50013, 10008). Replace an empty model reply with an in-character fallback.                                                                                                     | Shipped |
| FR-13 | Send replies as Components V2 cards with a tone-matched expression. Split long text at a newline, else a word, else a hard cut, under `discord.maxMessageLength`, and reopen cut code blocks.                                                                                              | Shipped |
| FR-14 | Offer 14 tools (dice, coin, time, weather, web search, anime, schedule, replies, reminders, memory) and show a footer of tools used plus up to 3 search citations.                                                                                                                         | Shipped |
| FR-15 | Read images, PDFs, audio and video by upload or link, under per-type size ceilings and per-turn byte and token budgets. Say so when a file cannot be read.                                                                                                                                 | Shipped |
| FR-16 | Open linked posts from X, Bluesky, YouTube, TikTok, Reddit, Instagram, Bilibili and Threads, and read their most-liked replies on request.                                                                                                                                                 | Shipped |
| FR-17 | Write passive memory from monitored server channels: user claims, guild facts and episode summaries, gated by Jev or the main model. Honor `memory.privacy` (`relaxed`, `balanced`, `strict`, `off`).                                                                                      | Shipped |
| FR-18 | Recall memory as one relevance-ranked block (`memory.recall: unified`). The default `shadow` mode logs the unified recall and keeps the legacy blocks.                                                                                                                                     | Partial |
| FR-19 | Start a web search before the first model call when Jev predicts a lookup (`jev.prefetch: on`). It runs in `shadow` mode by default.                                                                                                                                                       | Partial |
| FR-20 | Embed memory with a local sidecar (`embeddings.provider: local`). `config.yml` pins `gemini` until the sidecar passes its Pi memory check, and its recall floors still need calibration.                                                                                                   | Partial |
| FR-21 | Run games with SQLite progress: `/gacha` companions, `/hangman` and `/shiritori`, each with a top-10 leaderboard.                                                                                                                                                                          | Shipped |
| FR-22 | Provide `/remind`, `/anime`, `/stats` (four 30-day views) and `/report` (rate-limited bug reports).                                                                                                                                                                                        | Shipped |
| FR-23 | Add ambient touches: keyword emoji reactions, a time-of-day status every `statusCycleMs`, and one owner DM per new GitHub release.                                                                                                                                                         | Shipped |
| FR-24 | Deploy with Docker Compose: multi-stage `node:24-alpine` build, non-root `node` user, `mem_limit: 1g`, `restart: unless-stopped`, logs rotated at 10 MB x 3, health endpoint on port 3000. On SIGTERM or SIGINT, close sessions, the database and Discord, and force exit after 5 seconds. | Shipped |

## Source Files

- `src/discord/events/messageCreate.ts`, `src/discord/events/interactionCreate.ts`, `src/discord/commands/`
- `src/agent/roka.ts`, `src/agent/session.ts`, `src/agent/replyShape.ts`, `src/agent/reliability.ts`, `src/agent/llm/budget.ts`
- `src/agent/tools/index.ts`, `src/discord/messageBuilder.ts`, `src/discord/responses.ts`
- `src/utils/rateLimiter.ts`, `src/discord/concurrency.ts`, `src/discord/errorHandler.ts`
- `src/index.ts`, `Dockerfile`, `docker-compose.yml`, `config.yml`
