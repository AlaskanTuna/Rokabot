# AGENTS.md

> **Read `docs/roles.md` first** — it defines your role, boundaries, and the gates in this project's PM-orchestrated workflow. This file is the **canonical, tool-agnostic** project instructions — every agentic tool (Claude Code, Codex, Antigravity, …) works from it. Tool-specific adapters (e.g. `CLAUDE.md`, `.claude/agents/`) only point here; see "Execution Adapters" in `docs/roles.md`.

---

## Project

**{{PROJECT_NAME}}** — {{ONE_LINE_PURPOSE}}

{{OPTIONAL_CONTEXT_PARAGRAPH}}

---

## Architecture

{{ARCHITECTURE_SUMMARY — or: "See `docs/trd.md` (canonical). Do not create `docs/architecture.md`."}}

### Repo layout

```
{{REPO_LAYOUT}}
```

---

## Tech Stack

{{TECH_STACK — frameworks, languages, key libraries, infra, deploy target. Pin versions where they matter.}}

---

## Commands

```bash
{{COMMON_COMMANDS — install, dev, build, lint, test, deploy}}
```

---

## Code Style

- **Naming:** {{NAMING_CONVENTIONS}}
- **Types:** {{TYPE_RULES — e.g. "No `any`; prefer `unknown` + narrowing; Zod/Pydantic at boundaries."}}
- **Error handling:** Validate at system boundaries; do not wrap internal framework calls in try/catch.
- **Comments:** Default to none. Comment only when the _why_ is non-obvious. Never describe _what_ the code does.
- **Changes are surgical:** touch only what the task requires; match existing style; don't refactor what isn't broken.

> Full behavioral coding guidelines (Andrej Karpathy) are appended at the end of this file.

---

## Working Conventions

- **CLI-first.** Configure via CLI tools over GUI where possible.
- **Gate 2 (ship) mode:** `{{GATE2_MODE}}` into `{{TARGET_BRANCH}}` — **direct** (commit + push to the working branch), **pr-manual** (PM opens a PR; the human reviews & merges), or **pr-auto** (PM opens a PR and self-merges). In the PR modes, a PR is opened **only for substantial changes / the end of an iteration**; small hotfixes or minor edits are committed + pushed straight to the target branch. Merged PR branches are deleted (`--delete-branch`) so no residue is left. Agents never bypass this mode. {{AGENT_COMMIT_POLICY}}
- **Workflow visibility:** `{{VISIBILITY — private | shared}}` — **private**: the pm-workflow artifacts exist only locally (listed in `.git/info/exclude`); never stage or commit them, and never modify a repo-tracked instructions file. **shared**: they're part of the repo like any other file.
- **Model profile:** `{{MODEL_PROFILE — max | balanced | economy}}` — one knob that routes every role's model on **both vendors**, pins efforts (planner **max**, programmer **high**, QA **high** — on every profile), and caps parallel waves:

  | Profile    | PL (Claude) | PG (Claude) | QA (Claude) | PL + QA (Codex) | PG / workers (Codex) | Wave cap |
  | ---------- | ----------- | ----------- | ----------- | --------------- | -------------------- | -------- |
  | `max`      | opus        | sonnet      | opus        | gpt-5.6-sol     | gpt-5.6-terra        | 3        |
  | `balanced` | opus        | sonnet      | sonnet      | gpt-5.6-sol     | gpt-5.6-terra        | 3        |
  | `economy`  | sonnet      | sonnet      | sonnet      | gpt-5.6-terra   | gpt-5.6-terra        | 2        |

  The `.claude/agents/*.md` and `.codex/agents/*.toml` frontmatter is filled from this at scaffold; switch profiles via the upgrade flow. The Codex columns also govern delegation (second opinions, peer consults, workers) when the main agent is Claude.

- **Log decisions.** At Gate 2, the PM appends one line to `docs/decisions.md` for any task that settles a lasting choice (architecture, library, convention, a resolved trade-off); PL reads that log before planning and flags any reversal at Gate 1. One line per decision — not an ADR system.
- **Codex delegation:** `{{CODEX_MODE — "off", or any combination of second-opinion, peer-consult, executor; set to "off" if the codex CLI is not installed — the human can enable features later via the upgrade flow}}` — each feature gates **independently**: **second-opinion** = a read-only `codex exec` review runs alongside QA (both verdicts reach Gate 2); **peer-consult** = a blind planning consult for high-stakes tasks (human-triggered per task, never automatic; planner and Codex get the same brief independently); **executor** = Codex workers may implement PG tasks (same PG contract: no commits, surgical changes). Delegation applies **only when the main agent is Claude** — a Codex main agent uses the native `.codex/agents/` role subagents instead and ignores this mode. Every invocation is hardened: `codex --version` preflight, model + reasoning effort pinned from the profile matrix, stdin closed, event-silence liveness monitoring with a generous backstop timeout, and salvage of the last complete message on any kill — a hung or missing Codex never blocks the pipeline, and a slow-but-live one is never discarded; the PM degrades silently to Claude-only only when nothing is salvageable, and says so.
- **Design quality:** `{{IMPECCABLE — KEEP this bullet only if Impeccable was installed at scaffold; DELETE the whole bullet otherwise — and delete this placeholder instruction either way}}` — Impeccable's PostToolUse hook gives implementers live design feedback on UI edits; QA runs `npx impeccable detect` on UI diffs as the deterministic audit (recorded in `docs/test.md`). `docs/PRODUCT.md` + `docs/DESIGN.md` are **product docs** — committed like `docs/prd.md`, always kept together in `docs/`. Never suppress a design finding without explicit human confirmation; waivers go through `/impeccable hooks ignore-*` only.
- **Log progress.** After each task, PG appends a dated entry to `docs/progress.md` and ticks `docs/plan.md`. Exception — **parallel waves**: PGs in a wave return summaries instead, and the PM does the ticking/logging.
- **No secrets in repo.** `.env.example` committed, `.env` gitignored.

---

## Critical Do-Nots

- **Do not** `git push --force`, rewrite published history, or delete branches.
- **Do not** commit or push without explicit human authorization (Gate 2).
- **Do not** create `docs/architecture.md` — architecture lives in `docs/trd.md` if present.
  {{PROJECT_SPECIFIC_DO_NOTS}}

---

## Agent Workflow & Documentation Protocol

This project runs the **PM → PL → PG → QA** pipeline defined in `docs/roles.md`, with two human gates:

1. **PL** writes `docs/plan.md` (after brainstorming).
2. **Gate 1** — PM shows the plan + open questions to the human for approval.
3. **PG** implements the approved tasks; ticks `docs/plan.md`, logs `docs/progress.md`. Independent tasks with disjoint file scopes may run as a **parallel wave** (Gate-1-approved; see `docs/roles.md`).
4. **QA** reviews the diff into `docs/test.md` with a verdict — plus an optional read-only **Codex second opinion** when the project's Codex mode enables it.
5. **Gate 2** — PM relays the verdict. Reject → back to PG. Approve → PM proposes a Conventional Commit message and **ships per this project's Gate 2 mode** (see Working Conventions / `docs/roles.md`): `direct` commit+push, or — for substantial changes only — open a PR for manual or self-merge (small fixes commit straight to the target branch), deleting the branch on merge. It never pushes or merges without honoring that mode and any required human authorization.

**One checkout = one PM:** a fresh `docs/.pm-lock` means another PM is active in this folder — never run a second pipeline here; parallel features use one PM per git worktree (see `docs/roles.md`).

**Fast lane** (PM-triaged, three tiers): the PM triages every task — **trivial** (typo, one-liner, doc/config tweak, no design decision) → fast lane **automatically**, announced in one line; **ambiguous** → the PM asks fast-lane-or-full; **substantial** → full pipeline, no question. The fast lane skips PL and Gate 1 (the PM supplies acceptance criteria and dispatches PG directly); QA and Gate 2 always run. **Loop cap:** after 2 consecutive QA Rejects on a task, the PM stops and asks the human how to proceed.

Reference `docs/prd.md` (requirements) and `docs/trd.md` (architecture/contracts) when they exist.

---

## Re-Read Discipline

Start every session by reading, in order: `docs/roles.md` → tail of `docs/progress.md` → `docs/plan.md` (open tasks) → `docs/prd.md`/`docs/trd.md` only when touching the matching domain. Do not rely on memory from prior sessions. If a session-memory assist (e.g. claude-mem) is active, treat its injected recall and search results as **hints and leads** — this reading order stays mandatory, the `docs/` files stay canonical, and `docs/decisions.md` stays the decision ledger.

---

## Git Commit Convention

[Conventional Commits](https://www.conventionalcommits.org/): `<type>[scope]: <description>` — single imperative sentence, no trailing period. Allowed types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`. The PM proposes the message at Gate 2; the human authorizes the commit.

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

{{RTK_BLOCK — If `rtk` is installed (`which rtk` succeeds) KEEP everything between the two `rtk-instructions` markers below and remove only this instruction line; otherwise DELETE from the opening marker through the closing marker AND this instruction line. This directive line must never survive into the final AGENTS.md. You can regenerate/refresh the block any time with `rtk init --claude-md`.}}

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
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)

```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
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
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
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
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
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
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category         | Commands                       | Typical Savings |
| ---------------- | ------------------------------ | --------------- |
| Tests            | vitest, playwright, cargo test | 90-99%          |
| Build            | next, tsc, lint, prettier      | 70-87%          |
| Git              | status, log, diff, add, commit | 59-80%          |
| GitHub           | gh pr, gh run, gh issue        | 26-87%          |
| Package Managers | pnpm, npm, npx                 | 70-90%          |
| Files            | ls, read, grep, find           | 60-75%          |
| Infrastructure   | docker, kubectl                | 85%             |
| Network          | curl, wget                     | 65-70%          |

Overall average: **60-90% token reduction** on common development operations.

<!-- /rtk-instructions -->

{{GRAPHIFY_BLOCK — If `graphify` is installed (`which graphify` succeeds) KEEP everything between the two `graphify-instructions` markers below and remove only this instruction line; otherwise DELETE from the opening marker through the closing marker AND this instruction line. This directive line must never survive into the final AGENTS.md. When kept and the project is a codebase with no graph yet, tell the human they can build one with `/graphify .` — do not auto-build unprompted.}}

<!-- graphify-instructions v1 -->

# Graphify - Codebase Knowledge Graph

## Golden Rule

**Only if `graphify` is installed** (`which graphify`) — not all teammates have it. If it's missing, ignore this entire Graphify section and navigate the codebase normally.

Graphify builds a persistent, queryable knowledge graph of this project, so you answer architecture and relationship questions from a compact map instead of grepping and reading many files.

## When to use it

If `graphify-out/graph.json` exists, treat codebase questions ("how does X work", "what calls Y", "where is Z handled", "trace the data flow") as a **`graphify query`** FIRST — before grep/read:

```bash
graphify query "how does auth reach the database"   # BFS over the graph
graphify query "..." --budget 1500                   # cap the answer at N tokens
graphify path "AuthModule" "Database"                # shortest path between two concepts
graphify explain "SomeNode"                          # plain-language explanation of a node
```

**Applies to every agent** — the PM _and_ PG/programmer subagents (Codex workers read this AGENTS.md too): run `graphify query` before grepping for architecture/relationship questions, then drop to grep/sed/Read for exact `file:line` evidence — the graph gives you the file, not the line. Query results interleave code, UI (screenshot), and doc nodes; ask a narrow question and use `--budget` to keep the answer focused.

## Scope before the first build (avoid a token blowout)

Before the first `/graphify .`, create a `.graphifyignore` at the repo root (gitignore syntax — graphify merges it with `.gitignore`, and `!` can re-include). Write this sensible default, then **ask the human (AskUserQuestion) to confirm or adjust it before building** — large or asset-heavy repos can otherwise burn a lot of tokens on the first extraction:

```gitignore
# Keep the knowledge graph focused. Merged with .gitignore (! re-includes).
# Use docs/* (not docs/) so the ! lines below can re-include specific files.
docs/*
!docs/prd.md
!docs/trd.md
.claude/
AGENTS.md
CLAUDE.md
GEMINI.md
.cursorrules
.windsurfrules
RTK.md
*.pdf
*.png
*.jpg
*.jpeg
*.gif
*.webp
*.ico
*.svg
assets/
public/assets/
```

## Keeping the graph fresh

- No graph yet, and this is a real codebase? **Scope it first** (write/confirm `.graphifyignore`, above), then build once: `/graphify .` (code-only = free, no API key).
- After changing code, refresh incrementally: `graphify update .` (no LLM). A SessionStart hook may already do this automatically.

## Shared graph? Add a commit hook

Sharing the graph with collaborators? Two things.

**Keep the committed surface lean.** Commit only `graph.json` (queryable) and `GRAPH_REPORT.md` (human-readable); gitignore the regenerable, churny artifacts — `graph.html` (megabytes, rebuilt every commit), `cache/`, and machine-local state — which teammates rebuild locally via the hook below. Add to `.gitignore`:

```gitignore
graphify-out/*
!graphify-out/graph.json
!graphify-out/GRAPH_REPORT.md
```

**Refresh on commit.** If `graphify-out/` is committed and the repo uses Husky (`.husky/` exists), add — or append to — a committed `.husky/post-commit` so every commit refreshes the graph in lockstep with the code (fewer `graph.json` merge conflicts):

```sh
# Keep the committed knowledge graph in sync with committed code
[ -f graphify-out/graph.json ] && command -v graphify >/dev/null 2>&1 && graphify update . >/dev/null 2>&1 || true
```

Graphify (codebase comprehension) and RTK (command-output compression) are complementary — use both when present.

<!-- /graphify-instructions -->
