# AGENTS.md

> **Read `docs/roles.md` first** — it defines your role, boundaries, and the gates in this project's PM-orchestrated workflow. This file is the **canonical, tool-agnostic** project instructions — every agentic tool (Claude Code, Codex, Antigravity, …) works from it. Tool-specific adapters (e.g. `CLAUDE.md`, `.claude/agents/`) only point here; see "Execution Adapters" in `docs/roles.md`.

---

## Project

**Rokabot** — a server-wide Discord character chatbot embodying Maniwa Roka (馬庭 芦花) from Senren\*Banka.

It runs on Gemini via Google ADK TypeScript, deployed on a Raspberry Pi 5 (8GB, reachable over Tailscale) using Docker Compose. The bot responds to slash commands (`/chat`) and mention/reply/name-keyword triggers, maintaining per-channel conversational memory with a 10-message sliding window and 5-minute idle TTL.

---

## Architecture

```
Discord Server
    │
    ▼
Discord Gateway Layer (discord.js)
  - /chat slash command + mention/reply + name-keyword trigger
  - Rate limit guard (token bucket RPM + daily RPD)
  - Concurrency guard (1 active request per channel)
    │
    ▼
Session Manager (in-memory)
  - channelId → ChannelSession map
  - 10-message FIFO window
  - 5-min idle TTL per channel
    │
    ▼
Roka Agent (ADK)
  - 4-layer prompt system (core → speech → tone → context)
  - Rule-based tone detection (zero LLM cost)
  - Gemini Flash Lite backend
    │
    ▼
Gemini API (15 RPM / 250K TPM / 500 RPD)
```

**Key constraints:**

- All state is in-memory — no persistence. Bot restart = clean slate.
- RPM is the binding rate limit (~1 response every 4 seconds).
- System prompt budget: ~1000-1600 tokens per request.
- Docker memory cap: 512MB (expected runtime: ~80-150MB).

See `docs/trd.md` (canonical) for contracts and data models. Do not create `docs/architecture.md`.

### Key Data Models

- **WindowMessage** — `{ role: 'user' | 'assistant', displayName: string, content: string, timestamp: number }` — single message in the FIFO window
- **ChannelSession** — `{ channelId: string, messages: WindowMessage[], idleTimer: Timeout | null, lastActivity: number }` — per-channel session state
- **RateLimiterConfig** — `{ rpm: number, rpd: number }` — rate limit thresholds
- **AssemblerInput** — `{ tone: ToneKey, participants: string[], hour: number }` — input to the prompt assembler
- **ToneKey** — `'playful' | 'sincere' | 'domestic' | 'flustered'` — detected conversation tone

---

## Tech Stack

- **Runtime:** TypeScript (ES2022, Node16 module resolution), Node.js 24 (Alpine, ARM64 for RPi 5)
- **Discord:** discord.js v14 (Guilds, GuildMessages, MessageContent intents)
- **AI/Agent:** @google/adk (TypeScript ADK), Gemini Flash Lite (model name set in `config.yml` → `gemini.model`)
- **Utilities:** pino (structured JSON logging), dotenv (secrets), js-yaml (YAML config)
- **Testing:** vitest
- **Deployment:** Docker Compose (multi-stage build, node:24-alpine) on Raspberry Pi 5

---

## Commands

```bash
npm run dev          # Start with tsx watch (hot reload)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled JS (production)
npm run lint         # ESLint
npm run format       # Prettier --write
npm run format:check # Prettier --check
npm test             # vitest run
npm run test:watch   # vitest (watch mode)
docker compose up    # Run via Docker
docker compose build # Build Docker image
```

---

## Configuration

Secrets live in `.env`, tunables live in `config.yml` at the project root. Environment variables can override any `config.yml` value.

### Secrets (`.env`)

| Variable            | Required | Description                   |
| ------------------- | -------- | ----------------------------- |
| `DISCORD_TOKEN`     | Yes      | Discord bot token             |
| `DISCORD_CLIENT_ID` | Yes      | Discord application client ID |
| `GEMINI_API_KEY`    | Yes      | Google AI API key             |

### Tunables (`config.yml`)

| YAML Path                  | Env Override                 | Description                             |
| -------------------------- | ---------------------------- | --------------------------------------- |
| `gemini.model`             | `GEMINI_MODEL`               | Gemini model name                       |
| `gemini.timeout`           | `GEMINI_TIMEOUT`             | Request timeout in ms                   |
| `gemini.maxRetries`        | `GEMINI_MAX_RETRIES`         | Max retry attempts for transient errors |
| `rateLimit.rpm`            | `RATE_LIMIT_RPM`             | Requests per minute cap                 |
| `rateLimit.rpd`            | `RATE_LIMIT_RPD`             | Requests per day cap                    |
| `session.ttl`              | `SESSION_TTL_MS`             | Idle session TTL in ms                  |
| `session.windowSize`       | `SESSION_WINDOW_SIZE`        | FIFO message window size                |
| `discord.maxMessageLength` | `DISCORD_MAX_MESSAGE_LENGTH` | Discord message char limit              |
| `logging.level`            | `LOG_LEVEL`                  | Pino log level                          |

---

## Code Style

- **Formatting:** Prettier (`.prettierrc`): single quotes, no semicolons, no trailing commas, 120 char line width, 2-space indent. ESLint with TypeScript, eslint-config-prettier to avoid conflicts.
- **Error handling:** Validate at system boundaries; do not wrap internal framework calls in try/catch.
- **Comments:** Default to none. Comment only when the _why_ is non-obvious. Never describe _what_ the code does.
- **Changes are surgical:** touch only what the task requires; match existing style; don't refactor what isn't broken.

> Full behavioral coding guidelines (Andrej Karpathy) are appended at the end of this file.

---

## Working Conventions

- **CLI-first.** Configure via CLI tools over GUI where possible.
- **Gate 2 (ship) mode:** `pr-auto` into `main` — the PM opens a PR and self-merges (`gh pr merge --squash --delete-branch`). A PR is opened **only for substantial changes / the end of an iteration**; small hotfixes or minor edits are committed + pushed straight to the target branch. Merged PR branches are deleted so no residue is left. Agents never bypass this mode. Agents may create commits and push **only after explicit human authorization at Gate 2** — never unprompted, never `--force`.
- **Workflow visibility:** `hybrid` — the workflow inputs (`AGENTS.md`, `CLAUDE.md`, `.claude/agents/`, `.codex/`, `.agents/`) are committed and shared; the generated pm-workflow artifacts (`docs/roles.md`, `docs/plan.md`, `docs/progress.md`, `docs/test.md`, `docs/decisions.md`, `docs/.pm-handoff.md`, `.claude/settings.local.json`) are **local-only** (listed in `.git/info/exclude`, never committed). Each contributor runs `/pm-workflow` on their own machine to scaffold them.
- **Model profile:** `max` — one knob that routes every role's model on **both vendors**, pins efforts (planner **max**, programmer **high**, QA **high** — on every profile), and caps parallel waves:

  | Profile    | PL (Claude) | PG (Claude) | QA (Claude) | PL + QA (Codex) | PG / workers (Codex) | Wave cap |
  | ---------- | ----------- | ----------- | ----------- | --------------- | -------------------- | -------- |
  | `max`      | opus        | sonnet      | opus        | gpt-5.6-sol     | gpt-5.6-terra        | 3        |
  | `balanced` | opus        | sonnet      | sonnet      | gpt-5.6-sol     | gpt-5.6-terra        | 3        |
  | `economy`  | sonnet      | sonnet      | sonnet      | gpt-5.6-terra   | gpt-5.6-terra        | 2        |

  The `.claude/agents/*.md` and `.codex/agents/*.toml` frontmatter is filled from this at scaffold; switch profiles via the upgrade flow. The Codex columns also govern delegation (second opinions, peer consults, workers) when the main agent is Claude.

- **PM skill (mandatory).** Agents in this workspace follow the PM skill at `.agents/skills/pm-workflow/` (symlinked from `.claude/skills/pm-workflow/`; SOURCE: https://github.com/AlaskanTuna/pm-workflow) when implementing any new feature or phase.
- **Log decisions.** At Gate 2, the PM appends one line to `docs/decisions.md` for any task that settles a lasting choice (architecture, library, convention, a resolved trade-off); PL reads that log before planning and flags any reversal at Gate 1. One line per decision — not an ADR system.
- **Codex delegation:** `executor` — Codex workers (gpt-5.6-terra / high, per the invocation contract) may implement PG tasks to conserve Claude usage; `second-opinion` and `peer-consult` remain off (peer consults still available on explicit human trigger). A Codex main agent still uses the native `.codex/agents/` role subagents regardless of this setting.
- **Log progress.** After each task, PG appends a dated entry to `docs/progress.md` and ticks `docs/plan.md`. Exception — **parallel waves**: PGs in a wave return summaries instead, and the PM does the ticking/logging.
- **No secrets in repo.** `.env.example` committed, `.env` gitignored. Discord and Gemini keys live in `.env`, never committed.

---

## Critical Do-Nots

- **Do not** `git push --force`, rewrite published history, or delete branches.
- **Do not** commit or push without explicit human authorization (Gate 2).
- **Do not** create `docs/architecture.md` — architecture lives in `docs/trd.md`.
- **Do not** commit `graphify-out/` — the knowledge graph is local-only in this workspace.
- **Do not** restart or redeploy the production bot on the Pi without explicit human authorization.

---

## Agent Workflow & Documentation Protocol

This project runs the **PM → PL → PG → QA** pipeline defined in `docs/roles.md`, with two human gates:

1. **PL** writes `docs/plan.md` (after brainstorming).
2. **Gate 1** — PM shows the plan + open questions to the human for approval.
3. **PG** implements the approved tasks; ticks `docs/plan.md`, logs `docs/progress.md`. Independent tasks with disjoint file scopes may run as a **parallel wave** (Gate-1-approved; see `docs/roles.md`).
4. **QA** reviews the diff into `docs/test.md` with a verdict.
5. **Gate 2** — PM relays the verdict. Reject → back to PG. Approve → PM proposes a Conventional Commit message and **ships per this project's Gate 2 mode** (see Working Conventions / `docs/roles.md`).

**One checkout = one PM:** a fresh `docs/.pm-lock` means another PM is active in this folder — never run a second pipeline here; parallel features use one PM per git worktree (see `docs/roles.md`).

**Fast lane** (PM-triaged, three tiers): the PM triages every task — **trivial** (typo, one-liner, doc/config tweak, no design decision) → fast lane **automatically**, announced in one line; **ambiguous** → the PM asks fast-lane-or-full; **substantial** → full pipeline, no question. The fast lane skips PL and Gate 1 (the PM supplies acceptance criteria and dispatches PG directly); QA and Gate 2 always run. **Loop cap:** after 2 consecutive QA Rejects on a task, the PM stops and asks the human how to proceed.

Reference `docs/prd.md` (requirements) and `docs/trd.md` (architecture/contracts). `docs/runbook.md` covers Pi deployment/operations.

---

## Re-Read Discipline

Start every session by reading, in order: `docs/roles.md` → tail of `docs/progress.md` → `docs/plan.md` (open tasks) → `docs/prd.md`/`docs/trd.md` only when touching the matching domain. Do not rely on memory from prior sessions. If a session-memory assist (e.g. claude-mem) is active, treat its injected recall and search results as **hints and leads** — this reading order stays mandatory, the `docs/` files stay canonical, and `docs/decisions.md` stays the decision ledger.

---

## Git Commit Convention

[Conventional Commits](https://www.conventionalcommits.org/): `<type>[scope]: <description>` — single imperative sentence, no trailing period, no body or footer. Allowed types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`. Scopes: `discord`, `agent`, `session`, `utils`, `config`. The PM proposes the message at Gate 2; the human authorizes the commit.

---

<!-- andrej-karpathy-skills -->

# Coding Guidelines (Andrej Karpathy)

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

<!-- andrej-karpathy-skills -->

<!-- rtk-instructions v2 -->

# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Only if `rtk` is installed** (`which rtk`) — not all teammates have it. If it's missing, run commands directly and ignore this entire RTK section.

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:

```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)

```bash
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
```

### Test (60-99% savings)

```bash
rtk vitest              # Vitest failures only (99.5%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)

```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)

```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)

```bash
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
```

### Files & Search (60-75% savings)

```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)

```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)

```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
```

### Network (65-70% savings)

```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands

```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
```

Overall average: **60-90% token reduction** on common development operations.

<!-- /rtk-instructions -->

<!-- graphify-instructions v1 -->

# Graphify - Codebase Knowledge Graph

## Golden Rule

**Only if `graphify` is installed** (`which graphify`) — not all teammates have it. If it's missing, ignore this entire Graphify section and navigate the codebase normally.

Graphify builds a persistent, queryable knowledge graph of this project, so you answer architecture and relationship questions from a compact map instead of grepping and reading many files.

## When to use it

If `graphify-out/graph.json` exists, treat codebase questions ("how does X work", "what calls Y", "where is Z handled", "trace the data flow") as a **`graphify query`** FIRST — before grep/read:

```bash
graphify query "how does a mention reach the Gemini call"   # BFS over the graph
graphify query "..." --budget 1500                           # cap the answer at N tokens
graphify path "SessionManager" "RokaAgent"                   # shortest path between two concepts
graphify explain "SomeNode"                                  # plain-language explanation of a node
```

**Applies to every agent** — the PM _and_ PG/programmer subagents (Codex workers read this AGENTS.md too): run `graphify query` before grepping for architecture/relationship questions, then drop to grep/sed/Read for exact `file:line` evidence — the graph gives you the file, not the line.

## Keeping the graph fresh

- After changing code, refresh incrementally: `graphify update .` (no LLM).
- **The graph is local-only in this workspace** — `graphify-out/` is gitignored and never committed.

Graphify (codebase comprehension) and RTK (command-output compression) are complementary — use both when present.

<!-- /graphify-instructions -->
