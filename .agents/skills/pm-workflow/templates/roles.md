# ROLES (AGENT ONLY)

Defines every participant's role, responsibilities, and boundaries in this project's PM-orchestrated workflow. **Identify your role before acting.**

## Role Registry

| Key | Role             | Model / Effort     | Drives on skills                                                                                                                                                                          |
| --- | ---------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PO  | Project Owner    | HUMAN              | —                                                                                                                                                                                         |
| PM  | Orchestrator     | Opus / high        | sequences PL→PG→QA, holds the gates                                                                                                                                                       |
| PL  | Planner          | per profile / max  | `brainstorming`, `writing-plans`                                                                                                                                                          |
| PG  | Programmer       | Sonnet / high      | `test-driven-development`, `executing-plans`, `react-doctor`                                                                                                                              |
| QA  | QA Reviewer      | per profile / high | `code-review`, `systematic-debugging`                                                                                                                                                     |
| CX  | Codex (optional) | OpenAI Codex       | Claude main only, per the enabled features: `second-opinion` (QA review) · `peer-consult` (blind planning consult, human-triggered) · `executor` (PG-contract workers) — each independent |

> Models/efforts are filled into each `.claude/agents/*.md` **and** `.codex/agents/*.toml` frontmatter from the project's **model profile** (`max` / `balanced` / `economy` — the full matrix, including Codex models and the parallel-wave cap, lives in `AGENTS.md`). The table above shows the `max` profile; `balanced`/`economy` step the Opus bookends down to Sonnet while **effort stays pinned**. The PM is whatever model you launch the session as — **Opus / high recommended** on Claude (it only routes and gates). `settings.local.json` carries a session-level `fallbackModel` as an outage hedge.

## PO — Project Owner (you, the human)

| Item     | Detail                                       |
| -------- | -------------------------------------------- |
| Owns     | `docs/`, all final decisions                 |
| Approves | Gate 1 (plan) and Gate 2 (ship — see modes)  |
| Commits  | Human authorizes; no agent pushes unprompted |

## PM — Orchestrator

Runs the pipeline from one prompt; never implements. Dispatches PL, PG, QA as subagents, relays each one's summary, and enforces the two gates. At Gate 2 it appends any lasting decision to `docs/decisions.md` (one line). Keeps its own context lean — relies on subagent summaries and the `docs/` files, not on re-reading everything. **Cannot spawn nested subagents**, so it stays the main session.

## PL — Planner

| Item     | Detail                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------- |
| Trigger  | PM starts a new feature/phase                                                                  |
| Reads    | `AGENTS.md`, `docs/decisions.md`, `docs/prd.md`, `docs/trd.md`, `docs/roadmap.md` (if present) |
| Produces | Checkboxed task breakdown in `docs/plan.md` + open-questions list                              |
| Updates  | `docs/plan.md` only                                                                            |

**Rules:** Does not implement. Brainstorms before planning. Reads `docs/decisions.md` first and never silently reverses a recorded decision — flags it at Gate 1. Flags ambiguity for the human at Gate 1 instead of guessing.

## PG — Programmer

| Item     | Detail                                                      |
| -------- | ----------------------------------------------------------- |
| Trigger  | Plan passes Gate 1; or QA returns a Reject                  |
| Reads    | `docs/plan.md`, `docs/trd.md`, `AGENTS.md`, relevant skills |
| Produces | Code + ticked checkboxes + dated `docs/progress.md` entries |

**Rules:** Surgical changes only. TDD for logic. Surfaces ambiguity, never guesses. Does not commit or re-architect.

## QA — QA Reviewer

| Item    | Detail                                                                                                                                                         |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger | PG completes a task                                                                                                                                            |
| Checks  | Correctness, types, edge cases, boundary error-handling, TRD contract, style — plus design (`npx impeccable detect` on UI diffs, when Impeccable is installed) |
| Verdict | **Approve** / **Approve with comments** / **Reject with reasons** → `docs/test.md`                                                                             |

**Rules:** Review only; never rewrites. Does not re-litigate `docs/trd.md` architecture.

## Execution Adapters

The workflow contract — roles, `docs/` files, gates — is **tool-agnostic**; canonical project instructions live in `AGENTS.md` at the repo root. How each tool realizes the roles:

- **Claude Code** (full experience): the PM is the main session; PL/PG/QA are named subagents in `.claude/agents/` with pinned model + effort. `CLAUDE.md` is a thin adapter importing `AGENTS.md`.
- **Codex CLI** (full experience, native): the PM is the Codex session; PL/PG/QA are **native Codex subagents** defined in `.codex/agents/{planner,programmer,qa}.toml` with pinned `model` + `model_reasoning_effort` from the same profile. Fan-out is governed by `[agents] max_threads` / `max_depth` in Codex config. A Codex main **never delegates Claude subagents** (cost inversion) and ignores the Codex-delegation mode below — it _is_ Codex.
- **Antigravity or any other agent** (degraded but correct): one context plays every role **sequentially** — same phases, same docs files, same gates. Announce which role you're in as you switch. Model pinning doesn't apply; the human gates always do.
- **Codex delegation** (optional, **Claude main only**, requires the `codex` CLI): per the feature set in `AGENTS.md`, each gating independently — `second-opinion`: a read-only review at QA; `peer-consult`: a blind planning consult for high-stakes tasks (human-triggered; PL and Codex get the same brief independently and neither sees the other's output before synthesis); `executor`: Codex workers implementing PG tasks (note: Impeccable's live design hook does not reach Codex-executed work — its Codex-provider hook is unverified on the CLI and non-functional in the Windows Codex app — so QA's `detect` pass is the design guarantee there). Every invocation follows the PM's hardened contract (preflight, pinned model+effort, closed stdin, hard timeout, liveness monitoring) — a hung Codex never blocks the pipeline.

## Handoff Protocol & Gates

```
PO gives task
  → PM dispatches PL → writes docs/plan.md
      → ╔═ GATE 1 ═╗ PM shows plan + open questions to PO
        ║ Approve  ║──────────────┐  Revise → back to PL
        ╚══════════╝               ▼
      → PM dispatches PG → implements approved tasks
          → PM dispatches QA → writes verdict to docs/test.md
              → ╔═ GATE 2 ═╗ PM relays verdict to PO, ships per Gate 2 mode
                ║ Reject   ║── back to PG with QA findings → QA again
                ║ Approve  ║── direct: commit+push · pr-manual: PR→PO merges
                ╚══════════╝   · pr-auto: PR→PM self-merges → next task
```

**Gate 2 ship modes** (set per project in `AGENTS.md`): **direct** — commit + push to the working branch · **pr-manual** — PM opens a PR into the target branch and the human merges · **pr-auto** — PM opens a PR and self-merges. In the PR modes a PR is opened **only for substantial changes / the end of an iteration**; small hotfixes commit + push straight to the target branch, and merged PR branches are deleted (`--delete-branch`). The human owns the choice; agents never deviate from it.

**Fast lane** (PM-triaged, three tiers): **trivial** (typo, one-liner, doc/config tweak, no design decision) → the PM takes the fast lane **automatically**, announcing it in one line (the announcement is the human's chance to object); **ambiguous** → the PM asks fast-lane-or-full; **substantial** → full pipeline, no question. The fast lane skips PL and Gate 1 — the PM supplies explicit acceptance criteria in the dispatch and sends the task straight to PG. **QA and Gate 2 always run.**

**Loop cap:** after 2 consecutive QA Rejects on the same task, the PM stops looping and asks the human: keep looping, escalate PG's fix one tier (one-off — to Opus where reachable, else Sonnet), or take over manually.

**Parallel waves:** tasks whose `Depends on:` are satisfied and whose `Files:` scopes are **disjoint** may run as a wave of up to the **profile's wave cap** — see the model profile matrix in `AGENTS.md` (3 on `max`/`balanced`, 2 on `economy`) — of PGs (or Codex workers, per the Codex mode) — the wave grouping is part of what the human approves at Gate 1. In a wave, PGs stay inside their file scope (stop-and-report otherwise), run targeted tests only, and don't write `docs/` — the PM ticks the plan and logs progress. Waves never overlap.

**Hard rules:** One agent per task. **One checkout = one PM** — a fresh `docs/.pm-lock` means another PM is active here: do not run a second pipeline in this folder; parallel features run one PM per **git worktree**, each with its own docs, lock, branch, and gates (shipping via PR to avoid racing the target branch). Parallelism only within a Gate-1-approved wave with disjoint file scopes — otherwise one agent at a time. Handoffs go through the `docs/` files. The human reads the diff before any commit/merge. No agent pushes or merges without honoring the Gate 2 mode (and human authorization where the mode requires it).
