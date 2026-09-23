# AGENTS.md

> This file is the **canonical, tool-agnostic** project instructions — every agentic tool (Claude Code, Codex, Antigravity, …) works from it. Tool-specific adapters (e.g. `CLAUDE.md`) only point here.

---

## Project

**Rokabot** — a server-wide Discord character chatbot embodying Maniwa Roka (馬庭 芦花) from Senren\*Banka.

It runs on Gemini via Google ADK TypeScript, deployed on a Raspberry Pi 5 (8GB, reachable over Tailscale) using Docker Compose. The bot responds to slash commands (`/ask`) and mention/reply/name-keyword triggers, maintaining per-channel conversational memory with a FIFO window and idle TTL configured by `session.windowSize` and `session.ttl` in `config.yml`.

---

## Architecture

```
Discord Server
    │
    ▼
Discord Gateway Layer (discord.js)
  - /ask slash command + mention/reply + name-keyword trigger
  - Rate limit guard (windowed RPM + daily RPD)
  - Concurrency guard (1 active request per channel)
    │
    ▼
Session Manager (in-memory)
  - channelId → ChannelSession map
  - Per-channel FIFO window and idle TTL (configured in `config.yml`)
    │
    ▼
Roka Agent (ADK)
  - 4-layer prompt system (core → speech → tone → context)
  - Rule-based tone detection (zero LLM cost)
  - Gemini Flash Lite backend, with a ModelScope Qwen fallback when Gemini is unavailable
    │
    ▼
Gemini API (rate limits configured in `config.yml`)
```

**Key Constraints:**

- SQLite (better-sqlite3, `data/rokabot.db`) is canonical for session history, memory claims, reminders, game/gacha data, and metrics. The per-channel in-memory window is a hot cache rehydrated from SQLite on restart.
- RPM, rather than RPD, is the binding rate limit; its value is configured in `config.yml`.
- System prompt (4 assembled layers) is size-capped; the cap is `MAX_SYSTEM_PROMPT_TOKENS` in `tests/harness/tokens.ts`, enforced by `tests/harness/__tests__/tokens.test.ts`. It exists for change detection, not latency.
- Docker container memory is capped by `docker-compose.yml`.

See `docs/trd.md` (canonical) for contracts and data models. Do not create `docs/architecture.md`.

---

## Tech Stack

- **Runtime:** TypeScript (compiler options in `tsconfig.json`), Node.js (version pinned in `package.json` `engines` and the `Dockerfile`)
- **Discord:** discord.js (Guilds, GuildMessages, MessageContent intents)
- **AI/Agent:** @google/adk (TypeScript ADK), Gemini Flash Lite (model name set in `config.yml` → `gemini.model`)
- **Utilities:** pino (structured JSON logging), dotenv (secrets), js-yaml (YAML config)
- **Testing:** vitest
- **Deployment:** Docker Compose (multi-stage build) on Raspberry Pi 5

---

## Commands

```bash
npm run dev       # Start with tsx watch (hot reload)
npm run build     # Compile TypeScript to dist/
npm run lint      # Check all files with Biome; npm run format:check also checks Prettier formatting
npm run typecheck # Type-check src/ AND tests/ (tsconfig.test.json). npm run build type-checks src/ only, and its `include` leaves the whole tests/ tree outside the project — vitest strips types without checking them, so this is the only gate that sees a test file
npm test          # Run Vitest — main gate
npm run test:perf    # Separate performance-evaluation gate; full verification remains npm test && npm run test:perf
npm run test:live    # Opt-in live-model gate; needs GRAPHIFY_GEMINI_API_KEY, spends real Gemini calls; not part of full verification
```

See `package.json` for all other scripts.

---

## Configuration

Secrets are enumerated in `.env.example`; `requiredEnv` in `src/config.ts` validates the variables it guards.

Every tunable lives in `config.yml` with an inline comment; environment overrides are wired in `src/config.ts`, and numeric tunables are bounded by `NUMERIC_BOUNDS`.

---

## Code Style

- **Formatting:** Prettier (`.prettierrc`): single quotes, no semicolons, no trailing commas, 120 char line width, 2-space indent. Biome's `quoteStyle: single` (biome.json) means _prefer_ single — it switches a string to double quotes rather than escape an apostrophe inside it, so `"I couldn't open that file"` is correct and rewriting it to single quotes fails `biome check`. Biome owns TS/JS linting, formatting, and import-sorting (biome.json); Prettier formats md/yml/json (.prettierignore excludes _.ts/_.js). Conventional Commits enforced by commitlint via husky commit-msg hook; lint-staged runs on pre-commit.
- **Error Handling:** Validate at system boundaries; do not wrap internal framework calls in try/catch.
- **Comments:** Default to none. Comment only when the _why_ is non-obvious. Never describe _what_ the code does.
- **Changes Are Surgical:** touch only what the task requires; match existing style; don't refactor what isn't broken.

> Full behavioral coding guidelines (Andrej Karpathy) are appended at the end of this file.

---

## Documentation Hygiene

All Markdown documentation in this repo (`README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/**/*.md`) follows **TitleCase** formatting:

- **Headings and Subheadings:** every word capitalized except short articles/prepositions/conjunctions (a, an, the, of, in, on, for, and, or, to, vs), e.g. `## Getting Started`, `### WindowMessage`.
- **Table Headers:** TitleCase in every column header cell.
- **Bullet Point Labels:** the bold lead-in label of a bullet (`- **Label:** …`) is TitleCase, e.g. `- **Error Handling:** …`.
- **Never re-case** code identifiers, file paths, CLI commands, config keys, env vars, model IDs, or URLs — TitleCase applies to prose labels only.
- New docs must follow this from the start; when touching an existing doc, fix casing in the sections you touch.

---

## Working Conventions

- **CLI-first.** Configure via CLI tools over GUI where possible.
- **Shipping:** `main` is PR-only (repo ruleset `main-pr-ci-gate`): every change, including a small hotfix or minor edit, opens a PR, and a PR can merge only once the `test` check (the `test` job in `.github/workflows/deploy.yml`) passes. After opening a PR, poll `test` to a terminal state with `gh pr checks` or a bounded `gh api` loop; poll, never a fixed sleep. On a failure, STOP, report the PR URL and the failing check to the human, and leave the PR open and the branch intact. Merge with `gh pr merge --squash --delete-branch`; `gh pr merge --auto` and `gh pr merge --admin` are forbidden. Merging to `main` runs the deploy workflow, which rebuilds and restarts the production bot unless every changed path is in its `paths-ignore`, so a merge needs the same explicit human authorization as a restart. Agents commit and push only with explicit human authorization — never unprompted, never `--force`.
- **Local History:** `docs/decisions.md` (past decisions and their rationale) and `docs/progress.md` are git-excluded local logs. Check `docs/decisions.md` before reversing an earlier choice.
- **No secrets in repo.** `.env.example` committed, `.env` gitignored. Discord and Gemini keys live in `.env`, never committed.

---

## Critical Do-Nots

- **Do not** `git push --force`, rewrite published history, or delete branches.
- **Do not** commit or push without explicit human authorization.
- **Do not** create `docs/architecture.md` — architecture lives in `docs/trd.md`.
- **Do not** commit anything in `graphify-out/` except the current graph (`graph.json`, `graph.html`, `GRAPH_REPORT.md`, `manifest.json`, `.graphify_labels.json`, `.graphify_labels.json.sig`, `.graphify_analysis.json`) — dated backups, `cache/` and `.graphify_python` stay local.
- **Do not** restart or redeploy the production bot on the Pi without explicit human authorization.

---

## Reference Docs

Reference `docs/prd.md` (requirements) and `docs/trd.md` (architecture/contracts). `docs/runbook.md` covers Pi deployment/operations. Research write-ups live in `docs/research/`.

---

## Git Commit Convention

[Conventional Commits](https://www.conventionalcommits.org/): `<type>[scope]: <description>` — single imperative sentence, no trailing period, no body or footer. Allowed types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`. Scopes: `discord`, `agent`, `session`, `utils`, `config`. The human authorizes every commit.

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

## RTK Commands By Workflow

### Build & Compile (80-90% Savings)

```bash
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
```

### Test (60-99% Savings)

```bash
rtk vitest              # Vitest failures only (99.5%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% Savings)

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

### GitHub (26-87% Savings)

```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% Savings)

```bash
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
```

### Files & Search (60-75% Savings)

```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% Savings)

```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% Savings)

```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
```

### Network (65-70% Savings)

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

## When to Use It

If `graphify-out/graph.json` exists, treat codebase questions ("how does X work", "what calls Y", "where is Z handled", "trace the data flow") as a **`graphify query`** FIRST — before grep/read:

```bash
graphify query "how does a mention reach the Gemini call"   # BFS over the graph
graphify query "..." --budget 1500                           # cap the answer at N tokens
graphify path "SessionManager" "RokaAgent"                   # shortest path between two concepts
graphify explain "SomeNode"                                  # plain-language explanation of a node
```

**Applies to every agent**, subagents included: run `graphify query` before grepping for architecture/relationship questions, then drop to grep/sed/Read for exact `file:line` evidence — the graph gives you the file, not the line.

## Keeping the Graph Fresh

- After changing code, refresh incrementally: `graphify update .` (no LLM).
- LLM steps (community labeling / semantic extraction) use the dedicated key from `.env`: run them as `GEMINI_API_KEY="$GRAPHIFY_GEMINI_API_KEY" graphify label .` — never burn the bot's own `GEMINI_API_KEY` on graph refreshes.
- **The current graph in `graphify-out/` is committed** — refreshing it is a normal PR, and graph-only changes do not redeploy the bot.

Graphify (codebase comprehension) and RTK (command-output compression) are complementary — use both when present.

<!-- /graphify-instructions -->
