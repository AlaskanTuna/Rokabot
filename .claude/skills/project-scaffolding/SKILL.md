---
name: project-scaffolding
description: Bootstrap a new project from zero — research objectives via superpowers brainstorming, generate agent config and docs, then scaffold the repo structure and dependencies for any tech stack.
---

# Project Scaffolding

## When to Use

Use this skill when:

- Starting a brand-new project from scratch (no existing code)
- The user says "scaffold", "bootstrap", "init", "set up a new project", or similar
- You need to go from idea to a runnable repo skeleton in a structured way

Do NOT use this skill when:

- The project already has a working codebase and the user wants to add features (use `superpowers:brainstorming` + `superpowers:writing-plans` directly)
- The user only wants to add docs to an existing project
- The user only wants to install dependencies

## Hard Rules

1. **Phases are gated.** Each phase must complete and receive explicit user approval before the next begins.
2. **No code before alignment.** Phase 1 produces only documents. No project files, no `package.json`, no `cargo init` — nothing — until Phase 1 is approved.
3. **No stack assumptions.** The tech stack, language, framework, and project structure are determined by Phase 1 outputs, never hardcoded.
4. **Superpowers are required for Phase 1.** If the brainstorming and writing-plans skills are unavailable, install them before proceeding.

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Verify superpowers availability** — check and install if missing
2. **Run Phase 1: Research & Objectives** — brainstorm, spec, plan
3. **User approves Phase 1 outputs** — spec doc + implementation plan
4. **Run Phase 2: Agent & Docs Initialization** — generate CLAUDE.md and docs/
5. **User approves Phase 2 outputs** — reviews generated files
6. **Run Phase 3: Project Scaffolding** — create repo structure, install deps
7. **User approves Phase 3 outputs** — verify the skeleton compiles/runs
8. **Suggest initial commit**

---

## Phase 0: Verify Superpowers

Before anything else, check whether the `superpowers:brainstorming` and `superpowers:writing-plans` skills are available.

**If available:** Proceed to Phase 1.

**If missing:** Install the superpowers plugin at project scope:

```bash
claude plugins add claude-plugins-official/superpowers --scope project
```

If the command fails or the plugin system is unavailable, direct the user to install manually:

> Superpowers plugin is required but could not be auto-installed.
> See: https://github.com/obra/superpowers
> Install it, then re-run this skill.

Do NOT proceed to Phase 1 without superpowers. There is no fallback.

---

## Phase 1: Research & Objectives

**Goal:** Produce a validated project spec and implementation plan before any files are created.

### Step 1.1 — Brainstorm

Invoke `superpowers:brainstorming`. Follow its full process:

- Explore project context (or lack thereof for a greenfield project)
- Ask clarifying questions one at a time to understand:
  - What the project does and why
  - Target users
  - Core features (MVP scope)
  - Tech stack preferences (language, frameworks, database, hosting)
  - Project structure preference (monorepo with workspaces, polyrepo, single-package)
  - Development methodology and timeline (if any)
  - Team composition (solo dev, multi-agent, team)
- Propose 2-3 architectural approaches with trade-offs
- Present the design in sections, get approval per section
- Write and commit the spec doc

**Critical questions the brainstorming MUST resolve** (these feed Phase 2 and 3):

| Question                             | Feeds Into                                           |
| ------------------------------------ | ---------------------------------------------------- |
| Primary language(s)                  | Phase 3: toolchain selection                         |
| Package manager / build system       | Phase 3: init commands                               |
| Project structure (mono/poly/single) | Phase 3: directory layout                            |
| Workspaces / modules and their roles | Phase 3: per-workspace scaffolding                   |
| Frameworks per workspace             | Phase 3: framework-specific init                     |
| Database / ORM                       | Phase 3: schema init                                 |
| External services / APIs             | Phase 2: env var documentation                       |
| Code style preferences               | Phase 2: CLAUDE.md, Phase 3: linter/formatter config |
| Commit conventions                   | Phase 2: CLAUDE.md                                   |
| Agent roles (if multi-agent)         | Phase 2: ROLES.md                                    |

### Step 1.2 — Write Implementation Plan

Invoke `superpowers:writing-plans`. This produces a phased, checkboxed implementation plan derived from the spec.

### Phase 1 Gate

Present both outputs to the user:

> **Phase 1 complete.**
>
> - Spec: `docs/superpowers/specs/YYYY-MM-DD-<project>-design.md`
> - Plan: `docs/PLAN.md` (or wherever writing-plans placed it)
>
> Review both documents. Once you approve, I'll generate the agent configuration and project documentation (Phase 2).

**Do NOT proceed until the user explicitly approves.**

---

## Phase 2: Agent & Docs Initialization

**Goal:** Create the agent configuration and documentation skeleton so all future conversations have project context.

### What Gets Generated

Every file below is populated with project-specific content derived from the Phase 1 spec and plan — never empty boilerplate.

#### Agent Configuration

| File            | Content                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`     | Project description, architecture summary, tech stack, common commands, code style rules, commit conventions, skills table, agent workflow protocol, key data models, environment variables |
| `docs/ROLES.md` | Role registry (owner, planner, programmer, reviewer, advisor), responsibilities, handoff protocol, protected files list                                                                     |

> If a `CLAUDE.md` already exists, diff the proposed changes and ask the user whether to merge or replace.

#### Project Documentation

| File               | Content                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `docs/PRD.md`      | Problem statement, objectives, target users, workflow overview, functional requirements — seeded from the Phase 1 spec |
| `docs/TRD.md`      | System architecture, tech stack table, data models, API contracts, pipeline details — seeded from the Phase 1 spec     |
| `docs/ROADMAP.md`  | Development phases with dates (if timeline was established in Phase 1)                                                 |
| `docs/PLAN.md`     | The implementation plan from Step 1.2 (move or symlink if already written elsewhere)                                   |
| `docs/PROGRESS.md` | Empty log with format template                                                                                         |
| `docs/TEST.md`     | Empty log with format template                                                                                         |

#### Skills Directory

Create `.claude/skills/` as a directory stub for future domain-specific skills. Do NOT create skill files — those come during implementation when domain knowledge crystallizes.

### Document Templates

The generated docs must follow these structural conventions:

**CLAUDE.md structure:**

```
# CLAUDE.md
## Project        — one-paragraph description
## Architecture   — ASCII diagram + key constraints
## Tech Stack     — bulleted by layer (frontend, backend, shared, testing)
## Skills         — table of .claude/skills/ entries (empty initially)
## Commands       — code block of common dev commands
## Code Style     — formatter/linter rules
## Git Commit Convention — format, allowed types, examples
## Agent Workflow & Documentation Protocol — numbered steps
## Documentation Format — templates for PROGRESS.md, PLAN.md, TEST.md
## Key Data Models — bullet descriptions of core entities
## Environment Variables — required keys list
```

**ROLES.md structure:**

```
# ROLES
## Role Registry  — table of roles and assignments
## Per-role sections — trigger, reads, produces, rules
## Handoff Protocol — ASCII flow
## Protected Files — list of files requiring owner approval
```

**PRD.md structure:**

```
# Product Requirements Document
## Problem Statement
## Project Objectives
## Target Users — table
## User Workflow Overview — ASCII flow
## Functional Requirements — numbered FR-N sections with acceptance criteria checkboxes
```

**TRD.md structure:**

```
# Technical Requirements Document
## System Architecture — ASCII diagram
## Technology Stack — tables per layer
## Data Models — per-entity sections with field tables
## API Contracts — per-endpoint sections with request/response examples
## Pipeline Details — numbered step flows (if applicable)
```

### Phase 2 Gate

> **Phase 2 complete.** Generated files:
>
> - `CLAUDE.md`
> - `docs/ROLES.md`, `docs/PRD.md`, `docs/TRD.md`, `docs/ROADMAP.md`
> - `docs/PLAN.md`, `docs/PROGRESS.md`, `docs/TEST.md`
>
> Please review these files. Once you approve, I'll scaffold the project structure and install dependencies (Phase 3).

**Do NOT proceed until the user explicitly approves.**

---

## Phase 3: Project Scaffolding

**Goal:** Create the runnable project skeleton with all dependencies installed and the toolchain configured.

### Step 3.1 — Repository Setup

```
IF not a git repo:
  git init
  create .gitignore (language-appropriate)
```

### Step 3.2 — Root Configuration

Based on the stack determined in Phase 1, create root-level config files. Examples by ecosystem:

| Ecosystem                     | Root Files                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| **Node.js (npm workspaces)**  | `package.json` (workspaces), `tsconfig.base.json`, `.prettierrc`, `.eslintrc.*`, `.env.example` |
| **Node.js (pnpm workspaces)** | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.prettierrc`, `.env.example`      |
| **Python (uv/poetry)**        | `pyproject.toml`, `ruff.toml` or `setup.cfg`, `.env.example`                                    |
| **Rust (cargo workspaces)**   | `Cargo.toml` (workspace members), `rustfmt.toml`, `.env.example`                                |
| **Go (go workspaces)**        | `go.work`, `.env.example`                                                                       |
| **Single-package**            | Language-appropriate config, no workspace setup                                                 |

> This is not an exhaustive list. Use whatever is appropriate for the chosen stack.

### Step 3.3 — Workspace Scaffolding

For each workspace/module identified in Phase 1:

1. Create the directory (e.g., `backend/`, `frontend/`, `shared/`)
2. Create workspace-specific config (e.g., `package.json`, `tsconfig.json`, `Cargo.toml`)
3. Create entry point stubs:
   - `src/index.ts`, `src/main.rs`, `src/main.py`, etc.
   - Stub should be minimal — a hello-world or empty export, just enough to compile
4. Create workspace-specific `.gitkeep` in empty directories if needed

### Step 3.4 — Framework-Specific Initialization

Run framework init commands as determined by Phase 1. Examples:

| Framework / Tool | Command                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| Prisma           | `npx prisma init` — then seed `schema.prisma` with data models from TRD |
| Vite (React)     | Manual setup or `npm create vite@latest` — adapt to monorepo structure  |
| Next.js          | `npx create-next-app@latest` — adapt to monorepo structure              |
| Django           | `django-admin startproject`                                             |
| Supabase         | Document required env keys in `.env.example`                            |
| Tailwind CSS     | `npx tailwindcss init` — configure content paths for monorepo           |

> Only run init commands for tools explicitly chosen in Phase 1. Do NOT add extras.

### Step 3.5 — Install Dependencies

Run the appropriate install command:

```
npm install          # Node.js (npm)
pnpm install         # Node.js (pnpm)
uv sync              # Python (uv)
cargo build          # Rust
go mod tidy          # Go
```

### Step 3.6 — Verify

Run a minimal verification to confirm the skeleton is valid:

| Ecosystem  | Verification Command                                      |
| ---------- | --------------------------------------------------------- |
| TypeScript | `npx tsc --noEmit`                                        |
| JavaScript | `node -e "require('./src/index.js')"` (or ESM equivalent) |
| Python     | `python -c "import <package>"`                            |
| Rust       | `cargo check`                                             |
| Go         | `go build ./...`                                          |

If verification fails, fix the issue before presenting to the user. Common causes: missing type declarations, misconfigured `tsconfig` paths, workspace resolution errors.

### Step 3.7 — Dev Scripts

Ensure the root config includes at minimum these scripts/commands (adapted to the ecosystem):

- **dev** — start the development server(s)
- **build** — production build
- **format** — run the formatter
- **lint** — run the linter
- **test** — run the test suite

For monorepos, wire these to run across all workspaces (e.g., `npm run dev` starts both backend and frontend via `concurrently` or similar).

### Phase 3 Gate

> **Phase 3 complete.** The project skeleton is ready:
>
> - Root config: `[list files]`
> - Workspaces: `[list directories]`
> - Dependencies installed: [count] packages
> - Verification: `[command]` passed
>
> **Suggested commit:** `chore: scaffold [project-name] monorepo with [stack summary]`

---

## Decision Tree: What If Things Already Exist?

```
Has git repo?
  YES → skip git init
  NO  → git init + .gitignore

Has CLAUDE.md?
  YES → diff proposed vs existing, ask user to merge or replace
  NO  → generate fresh

Has docs/?
  YES → for each doc: if exists, diff and ask; if missing, generate
  NO  → create docs/ and generate all

Has package.json / pyproject.toml / Cargo.toml?
  YES → ask user: extend existing or start fresh?
  NO  → generate from Phase 1 spec
```

## Common Pitfalls

1. **Skipping Phase 1** — "I already know what I want" is not approval of a spec. The brainstorming process catches assumptions. Always run it.
2. **Installing superpowers globally when the user wants project scope** — Always use `--scope project` unless the user says otherwise.
3. **Generating empty template docs** — Every doc must contain project-specific content from Phase 1. A `PRD.md` with only section headers is not acceptable.
4. **Over-scaffolding** — Only create what Phase 1 called for. If the spec says three workspaces, create three — not four "just in case."
5. **Running framework CLIs that clobber monorepo structure** — Many `create-*` commands expect to own the directory. Run them in a temp directory and move files, or use manual setup.
6. **Forgetting `.env.example`** — Every external service identified in Phase 1 must have its required keys documented in `.env.example` with placeholder values.
