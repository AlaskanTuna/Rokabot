# Repo Restructure Design

Date: 2026-11-03. Status: approved by the owner.

## Intent

The owner wants a clean, modular and professional repository for continuous development, with no messy folders or formats. Every issue and PR must carry an assignee and relevant labels. Agents must get the rules they need without reading a long file on every turn.

A read-only audit of `origin/main` at `7412692` found a healthy codebase: 0.36% duplication, one import cycle and no TODO markers. It does not need a rewrite. It needs clearer agent files, real GitHub rules, consistent docs names, 4 bug fixes and a set of targeted refactors.

## Goals

Each goal has a check.

| Goal                                                | Check                                                                                                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Short always-loaded agent context                   | `AGENTS.md` is at most 20 lines; it and every file it imports total at most 150 lines (379 today)                                                                                              |
| One source for each tool's agent file               | `CLAUDE.md` and `GEMINI.md` are symlinks to `AGENTS.md`                                                                                                                                        |
| Every open issue has an assignee and labels         | A query for open issues missing either returns nothing                                                                                                                                         |
| Every PR has an assignee and labels                 | A required `metadata` check fails without them                                                                                                                                                 |
| Loose docs in full uppercase                        | Every `docs/*.md` matches `^[A-Z-]+\.md$`                                                                                                                                                      |
| No wrong-way imports except the one kept on purpose | No import from `src/agent` in `src/storage` or `src/utils`; no import from `src/discord` in `src/agent`; no import cycles from `src/index.ts`; `src/character/schema.ts` -> `predicates` stays |
| CI sees all TypeScript                              | CI runs `npm run typecheck`, and `scripts/**/*` is in `tsconfig.test.json`                                                                                                                     |
| The 4 bugs stay fixed                               | Each has a test that failed before its fix                                                                                                                                                     |
| No audit finding is lost                            | Every finding is done, filed as a labelled and assigned issue, or listed as not adopted                                                                                                        |

## Non-Goals

- Changing Roka's voice, prompts, tools or models.
- Splitting `src/config.ts`. It is the single registry of settings, so a split spreads each new setting across files without reducing its churn.
- Rewriting the `reliability.ts` retry loop, `roka.ts` or `database.ts`.
- Removing the legacy config path for installs with no `llm:` block.
- Choosing a recall mode. #262 stays a separate decision, and it runs after this work.
- Moving `src/**/__tests__` into a separate tree. Tests stay beside their modules.
- Adding priority, size or status labels beyond `needs-triage`.

## Anti-Goals

This work fails, even if everything else passes, if any of these happen:

- **Prompt Drift:** `tests/fixtures/prompt-golden.json` changes in any stage.
- **Behaviour Change in a Move:** a folder-move PR holds anything but moved code and path edits.
- **Unapproved Restart:** anything reaches `main` that restarts the bot without the owner's go-ahead for that merge.
- **Lost Local Work:** an untracked plan, spec or log is deleted instead of moved.
- **Private Details in Public:** the repository is public, so an IP address, machine path, secret or operator-specific detail enters a tracked file.
- **New Weight:** a new runtime dependency, a vendored skill pack or a new agent tool.

## Constraints

- **Shipping Rules:** `main` is PR-only through the `main-pr-ci-gate` ruleset, which requires `test` and `images-ok`. Merges use `gh pr merge --squash --delete-branch`. `--auto`, `--admin` and force pushes stay forbidden. On a failed check, stop and report.
- **Deploy Trigger:** a merge deploys unless every changed path is in `paths-ignore` of `.github/workflows/deploy.yml`. Today that list is `*.md`, `docs/**`, `.claude/**` and `graphify-out/**`.
- **Test That Reads a Doc:** `src/agent/__tests__/promptAssembler.test.ts` reads `docs/trd/data.md`, so that file keeps its path.
- **Open PRs:** #335 and #336 stay open and untouched. The folder moves will conflict with them, and they get rebased under #262. Release PR #363 is left alone.

## Target Layout

```text
AGENTS.md                   about 15 lines of pointers
CLAUDE.md, GEMINI.md        symlinks to AGENTS.md
README.md                   moved from docs/README.md
CONTRIBUTING.md             how to branch, commit, file issues and open PRs
.github/
  labels.yml                every label, one place
  ISSUE_TEMPLATE/           bug.yml, feature.yml, task.yml, config.yml
  pull_request_template.md  Summary, Evidence, Merge Danger
  workflows/                deploy.yml, metadata.yml
docs/
  CONVENTIONS.md            house rules
  DECISIONS.md              curated table of lasting decisions
  PRD.md, TRD.md, RUNBOOK.md
  agents/                   karpathy.md, rtk.md, graphify.md, issue-tracker.md
  specs/                    tracked design documents
  trd/, guide/, deploy/, research/, diagrams/   same names, lowercase
.superpowers/               ignored: plans, run notes, raw logs
```

## Agent Files

`AGENTS.md` becomes a router. Its shape, with the final names:

```markdown
# AGENTS.md

Rokabot is a Discord character bot for Maniwa Roka: TypeScript, discord.js, Google ADK and SQLite, on a Raspberry Pi with Docker Compose.

Read these before working:

@docs/CONVENTIONS.md
@docs/agents/karpathy.md
@docs/agents/graphify.md
@docs/agents/rtk.md

Read these when the task needs them:

- docs/agents/issue-tracker.md: before creating or changing an issue or PR
- docs/TRD.md: before changing a contract or the architecture
- docs/PRD.md: for requirements
- docs/RUNBOOK.md: for Pi deployment and operations
- docs/DECISIONS.md: before reversing an earlier choice
```

The plain "Read these" sentence serves any tool that does not expand `@` imports.

| Current `AGENTS.md` Section                              | New Home                                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Project, Architecture, Key Constraints, Tech Stack       | Removed; `docs/trd.md` and `docs/trd/system.md` already hold these. Any fact found only here moves there first                             |
| Commands                                                 | Only what `package.json` cannot say goes in `CONVENTIONS.md`: which gates are full verification, and that `build` does not typecheck tests |
| Configuration, Code Style, Documentation Hygiene         | `CONVENTIONS.md`                                                                                                                           |
| Working Conventions, Critical Do-Nots, Commit Convention | `CONVENTIONS.md`, with the human steps in `CONTRIBUTING.md`                                                                                |
| Karpathy guidelines                                      | `docs/agents/karpathy.md`                                                                                                                  |
| RTK, 122 lines                                           | `docs/agents/rtk.md`, about 5 lines; only "use it if installed" and the meta commands                                                      |
| Graphify, 30 lines                                       | `docs/agents/graphify.md`, about 12 lines                                                                                                  |

`docs/CONVENTIONS.md` also gains:

- **Docs Names:** files directly in `docs/` are in full uppercase. Files in its subfolders stay lowercase.
- **Planning Files:** design documents go in `docs/specs/YYYY-MM-DD-topic.md`. Plans and run notes go in `.superpowers/`. This overrides any skill's default path.
- **Follow-Ups:** record each follow-up as a labelled, assigned issue, not only in chat.
- **Titles:** check issue and PR titles with `commitlint` before creating them.
- **Adding Rules:** add a rule only after an agent repeats a mistake, and give the reason. Delete rules that stop applying.

Stale text gets fixed as it moves. Examples: "once the owner adds `images-ok`" (the ruleset already requires it), and the two overlapping passive-memory bullets.

`.claude/skills/{brainstorming,gemini-document-scanner,project-scaffolding,writing-plans}` and `.claude/agents/bro.md` leave the repository; none has changed since 2026-07-22. No `.agents/` folder is created, because the repository needs no project skills today.

## GitHub Rules

**One Vocabulary:** an issue or PR title is already a Conventional Commit, so labels come from it.

| Title Part | Label       | Values                                                                                             |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------- |
| Type       | `type:*`    | `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`                                |
| Scope      | `area:*`    | `agent`, `memory`, `media`, `discord`, `games`, `studio`, `config`, `storage`, `deploy`, `harness` |
| No scope   | `area:repo` | Allowed                                                                                            |

- `commitlint.config.js` gains a `scope-enum` with those scopes plus `main`, which release-please uses. It stays the source of the two lists. A test fails if `.github/labels.yml` disagrees with it.
- Other labels: `needs-triage`, `good first issue`, `help wanted`, `duplicate` and `wontfix`. `autorelease: pending` and `autorelease: tagged` stay, because release-please needs them. `bug`, `enhancement`, `documentation`, `question` and `invalid` go after the backfill.

**Assignee:** the author if assignable, otherwise `AlaskanTuna`. `owoSnow` stays assignable by hand.

**Workflow:** `.github/workflows/metadata.yml` runs a small script with no dependencies.

- **On an Issue, Opened or Edited:** add the labels its title gives and assign someone. If the title does not parse, add `needs-triage`. An issue can't be refused, so this job never fails.
- **On a PR:** do the same, then fail the `metadata` check if the title is invalid, or the assignee, `type:*` or `area:*` is missing.
- **Release PRs:** branches starting `release-please--` pass untouched.
- **Security:** it uses `pull_request_target` so it can write labels. It checks out only the base branch and never runs PR code. Titles reach the script through environment variables, never interpolated into shell.
- **Rollout:** `metadata` joins the ruleset only after it has passed on a real PR. Changing the ruleset needs the owner's go-ahead.

**Templates:** `bug.yml`, `feature.yml` and `task.yml` set labels and an assignee for the web form. `gh issue create` uses a template only as starting text, so `docs/agents/issue-tracker.md` gives agents the exact command, with `--assignee` and `--label`, and says to read existing issues first. The PR template is the Summary, Evidence and Merge Danger format recent PRs already use.

**`paths-ignore`** gains `.github/ISSUE_TEMPLATE/**`, `.github/pull_request_template.md`, `.github/labels.yml`, `.github/workflows/metadata.yml`, `.gitignore` and `.graphifyignore`, so later edits to them don't redeploy.

**`.gitignore`** gains `/.superpowers/` and `/.dkm/`.

**Backfill:** a one-off local script, never committed, labels all 111 issues and all PRs from their titles, and assigns open issues. Titles that do not parse get handled by hand, such as #74, which also gets a valid title. The script runs at most one write per second.

## Docs

| From                                            | To                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `docs/README.md`                                | `README.md`, reversing the 2026-07-23 decision; links and image paths updated |
| `docs/prd.md`, `docs/trd.md`, `docs/runbook.md` | `docs/PRD.md`, `docs/TRD.md`, `docs/RUNBOOK.md`                               |
| `docs/superpowers/specs/*` (tracked)            | `docs/specs/`                                                                 |
| `docs/superpowers/plans/*` (tracked)            | Removed from the tree, kept in history                                        |
| Local files in `docs/superpowers/`              | `.superpowers/`, still local; moved, never deleted                            |
| `docs/decisions.md`, `docs/progress.md` (local) | `.superpowers/logs/`, still local                                             |
| New                                             | `docs/DECISIONS.md`, a Date, Decision and Why table                           |

- **`docs/DECISIONS.md`:** curated from the raw log's 260 entries. It keeps only decisions that still govern the code, and every row gets read for private details. New lasting decisions enter through the PR that makes them.
- **Old Names:** every live reference gets updated, including `.graphifyignore`, `config.yml`, `studio/template/character.yml`, `src/agent/__tests__/toneDetector.test.ts:390`, `tests/harness/tokens.ts:18` and `tests/harness/__tests__/tokens.test.ts:292`. `CHANGELOG.md`, `docs/specs/` and `docs/research/` are history, so they keep the names they were written with. `git grep -E 'docs/(prd|trd|runbook|README|decisions|progress)\.md' -- . ':!CHANGELOG.md' ':!docs/specs' ':!docs/research' ':!graphify-out'` returns nothing.
- **Stale Claims:** read-only workers compare `docs/guide/`, `docs/deploy/`, `docs/trd/`, `docs/PRD.md`, `docs/RUNBOOK.md` and `README.md` with the code. Verified errors get fixed in this stage.

## Code

### Bugs

All four come from reading the code and have not been reproduced. Each fix starts with a failing test.

| Bug                                                                                                                                                                                                                             | Where                                                                           | Fix                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Shiritori saves other players' scores under display names, so they break mentions and never match score queries                                                                                                                 | `src/discord/events/games/shiritori.ts:133`                                     | The engine tracks each player's user ID and display name, which also stops two players with the same name colliding                            |
| A Shiritori timeout ending never announces the winner, because the callback runs before `active` turns false. It saves no scores unless someone later runs `/shiritori end`, and the channel cannot start a new game until then | `src/games/shiritori.ts:106`, `src/discord/events/gameCommands.ts:60`           | The engine marks the game finished before the callback. The callback announces the winner, then ends the game through one shared save function |
| Inline audio and video watched by Qwen is never remembered, because `contentKey` stays undefined                                                                                                                                | `src/agent/media/turnMedia.ts:574`, `:678`                                      | Give Qwen's path a key; it has no bytes to hash, so the Discord path key is the starting point                                                 |
| `/stats` throws on a pack with no `playful` mood                                                                                                                                                                                | `src/discord/events/stats/views.ts:252`, `:359`, `src/discord/toneStyles.ts:16` | Fall back to `character.defaultMood`                                                                                                           |

Existing wrong rows in `game_scores` are not rewritten. Before merging the Shiritori fix, the owner gets a read-only count from production and decides about cleanup.

### Refactors

| Work                  | Evidence                                                                                                                                                                                                        | Target                                                                                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dead Code**         | No references: `ChannelSession`, `MEMORY_TOOL_RULES`, `getMonitoredCount`, `getUsernameMap`, `clearBuffer`, `getMessageCount`, `updateBuddyName`, `uuid`, the function re-exports in `src/agent/tools/index.ts` | Deleted                                                                                                                                                                                                                                                                                                                     |
| **Dead Scripts**      | `test-features.ts` and `test-phase8.ts` make no model or Discord calls and run in no gate. `test-gemini-ga-compare.ts` compares models from July                                                                | Deleted, with their `package.json` entries, after checking each asserted behaviour has a Vitest test                                                                                                                                                                                                                        |
| **Script Types**      | 19 of 22 scripts are unchecked, CI runs only `npx tsc --noEmit`, and checking them today gives 13 errors in 4 files                                                                                             | `scripts/**/*` in `tsconfig.test.json`, CI runs `npm run typecheck`, all 13 fixed                                                                                                                                                                                                                                           |
| **Wrong-Way Imports** | `config` <-> `logger`; `src/storage/memoryEpisodeStore.ts` -> `agent/memory/embeddings/fingerprint`; `src/utils/imageProcessor.ts` -> `agent/attachmentLimits`                                                  | `src/config.ts` collects startup warnings, and `src/index.ts` logs them at boot, so the cycle ends. `fingerprint.ts` merges into `src/storage/vectorProvenance.ts`. `imageProcessor.ts` moves below                                                                                                                         |
| **One Claim Store**   | `memory_claim` SQL in 9 files; `retriever.ts` has a private `getActiveClaims`, `SOURCE_WEIGHT` and `mapClaim`; game scores and stats SQL live in Discord code                                                   | `retriever.ts`, `extractor.ts`, `identityResolver.ts` and `reclassify.ts` use public functions of `memoryClaims.ts`. New `src/storage/gameStore.ts`. `src/discord/events/stats/queries.ts` moves into stores, leaving presentation behind. `obsidianExport.ts` keeps its own SQL, because it is an offline read-only export |
| **Small Duplicates**  | Reminder clock math in 2 files (19 lines); buddy summary in 2 files (17); pagination in 3 files, where `collection.ts:99` hardcodes a line the pack should own                                                  | `src/utils/timezone.ts` helper, `src/discord/events/games/shared.ts` and one pagination helper. `collection.ts:99` uses `character.lines`                                                                                                                                                                                   |
| **Turn Pipeline**     | Roughly 80 of the `/ask` path's 100 distinct lines repeat in the message path; 34 commits to those 2 files since September                                                                                      | One shared admission and delivery module with a small transport adapter. This stage gets its own short plan, because it is the main reply path                                                                                                                                                                              |
| **Provider History**  | Both adapters repeat ADK history translation; `retryAfterMs` differs (`>= 0` vs `> 0`); 4 usage mappings                                                                                                        | Shared normalization in `src/agent/llm/requestShape.ts`, one usage constructor in `usage.ts`                                                                                                                                                                                                                                |

**Behaviour in Stages 8 to 11:** these stages keep behaviour, and existing tests stay unchanged.

- A deliberate difference between two copies, such as the legacy route in `chatCompletionsLlm.ts`, stays as an explicit parameter.
- An accidental difference also stays, and the PR names it. It converges only with a named winner and a test, in a separate PR, so the owner can see each change to the main reply path.
- The only behaviour change allowed in these stages is the `collection.ts:99` fix under Small Duplicates.

### Folder Moves

```text
src/discord/socialPosts/                 -> src/agent/social/
src/discord/attachments.ts               -> src/agent/media/mediaRules.ts
  ASK_ATTACHMENT_SLOTS, attachmentOptionName -> src/discord/commands/ask.ts
src/discord/events/{games,tools,stats}/  -> src/discord/commands/{games,tools,stats}/
src/discord/events/gameCommands.ts       -> src/discord/commands/games/router.ts
src/discord/events/toolCommands.ts       -> src/discord/commands/tools/router.ts
src/discord/events/reportCommand.ts      -> src/discord/commands/reportHandler.ts
src/discord/commands/tools.test.ts       -> src/discord/commands/__tests__/tools.test.ts
src/agent/{fallbackModel,geminiReliability,tokenBudget,safetySettings}.ts -> src/agent/llm/
src/agent/{attachments,attachmentCost,attachmentLimits,mediaPrefix}.ts    -> src/agent/media/
src/utils/imageProcessor.ts              -> src/agent/media/
src/agent/{channelMonitor,passiveBuffer}.ts -> src/agent/memory/
src/session/types.ts                     -> WindowMessage into src/storage/sessionStore.ts; folder removed
asr/                                     -> sidecar/asr/
```

- `socialPosts` holds no `discord.js` import. It goes under `agent`, not a new top-level folder, because it needs `promptSafety` and `attachments`, and `agent` needs it. It also needs `resolveMediaUrl` and `resolvesToPublicAddress`, so `src/discord/attachments.ts` moves too. That file is a leaf that imports only Node modules, so `src/config.ts` can keep reading `MAX_ATTACHMENTS` from it. That leaves one direction: `discord` -> `agent`.
- `src/discord/commands/` already holds slash command definitions (`games.ts`, `tools.ts`, `stats.ts`, `report.ts`, `ask.ts`). Each definition sits beside its new handler folder.
- `WindowMessage` goes in `sessionStore.ts` because storage already uses it, and `agent` may import from `storage` but not the reverse.
- Tests move with their modules. `gachaMention.ts`, `interactionCreate.ts`, `messageCreate.ts` and `ready.ts` stay in `events/`.
- `src/discord/events/reportCommand.ts:17` resolves a path from `import.meta.url`, so it needs checking after the move.
- 23 docs and diagram sources name moved paths, and they get updated. The rendered SVGs name none of them, so they stay as they are.
- `asr/` moves in its own PR. It changes `docker-compose.yml:40`, `.github/workflows/deploy.yml:102`, `asr/README.md:41,49` and the docs that name it. The service name, image name and URL stay. A missed build path fails `images` before merge.

### Filed as Issues, Not Scheduled

These are verified or plausible, but they have lower value or a larger risk today. Each becomes a labelled, assigned issue carrying its evidence, because the audit reports are local.

- **Agent:** `Image*` names that also cover PDFs and audio; one `MemoryScope` value in place of two booleans; `resolveReferences` running twice per turn; attempt state split across `roka.ts` and `reliability.ts`; `needsLookup` telemetry read before Jev settles; `ToneKey` defined under `agent/prompts` but used by `discord`.
- **Config:** moving `legacyLlm` and `legacyProfile` out of `src/config.ts` into `src/agent/llm/legacy.ts`.
- **Memory:** `verifyAndApplyOperations` is about 370 lines with the most fix commits (8), and it belongs with #265 or #266.
- **Media and Tools:** name resolution inside `src/agent/tools/index.ts`; digest caching inside `turnMedia.ts`.
- **Studio:** shared server and UI types; moving `configShared.tsx` and `PackFileScreen.tsx`; 3 `ProblemBanner` copies; repeated YAML helpers.
- **Tests:** the shared fixture in `embeddings/__tests__`; hand-copied live constants; splitting `config.test.ts`; no `test:contract` script; the `memoryShadow.eval.test.ts` name; config mutation at the top of `roka.test.ts`.
- **Scripts:** `persona-turns.ts` is a library in `scripts/`; the `package.json` scripts block is ungrouped; `measure-native-search.ts` has no script entry.
- **Games:** user-facing game text outside the character pack (about 19 strings).

The agent-core recall branches in `createTurnContext` are not filed separately, because #262 removes them. A comment on #262 records that, and that its 2026-10-15 review date has passed.

## Delivery

Each stage is one PR, except where noted. Any later stage can wait without blocking the earlier ones.

| Stage | Contents                                                              | Restarts Bot                                                   |
| ----- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1     | Agent files                                                           | No: only `*.md`, `docs/**`, `.claude/**` and `graphify-out/**` |
| 2     | GitHub rules, then labels, backfill, then issues for everything below | Yes, once, because `deploy.yml` changes                        |
| 3     | Docs                                                                  | Yes, because test comments and `config.yml` change             |
| 4     | The 4 bugs                                                            | Yes                                                            |
| 5     | Dead code, dead scripts, script types                                 | Yes                                                            |
| 6     | Folder moves in `src/`                                                | Yes                                                            |
| 7     | `asr/` move                                                           | Yes                                                            |
| 8     | Wrong-way imports and claim store                                     | Yes                                                            |
| 9     | Small duplicates                                                      | Yes                                                            |
| 10    | Turn pipeline                                                         | Yes                                                            |
| 11    | Provider history                                                      | Yes                                                            |

The `CLAUDE.md` and `GEMINI.md` symlinks land in stage 2, not stage 1. Prettier rejects a symlink named on its command line, so `lint-staged` must change too, and `package.json` is not in `paths-ignore`.

From stage 2 on, each PR closes its issue. Every merge needs the owner's go-ahead, unless the owner gives a standing yes for specific stages.

## Verification

Every stage must pass all of these before its PR opens:

- `npm test`, `npm run test:perf`, `npm run typecheck` and `npm run format:check`. A known exception is the load-related `replayMemoryV2.test.ts` timeout; it must pass alone, and if it fails in CI, stop and report.
- `git diff origin/main -- tests/fixtures/prompt-golden.json` is empty.
- `graphify update .` has run, with the graph committed.

Stage-specific checks:

- **Stage 2:** a real PR with no assignee and no labels gets both from the workflow. A PR with a bad title fails `metadata`. The release PR passes.
- **Stage 3:** the old-name grep is clean, and every relative link in `README.md` resolves.
- **Stages 6 and 7:** `git diff -M --stat` shows only moved code and path edits, `images-ok` passes, and the bot reports healthy after deploy.
- **Stage 10:** the existing admission and delivery tests pass unchanged, including `messageCreate`, `ask`, `concurrency`, `byteBudget.handlers` and `tokenBudget.handlers`.

## Owner Decisions

- Agents get a short router file and modular rule files.
- Issues and PRs must have an assignee and relevant labels.
- Loose Markdown directly in `docs/` is in full uppercase, like `PRD.md`.
- Code is in scope, based on an audit.
- The order is agent files, GitHub rules, docs, code, riskiest last, with #262 after the restructure.

## Calls Made by the Author

1. `README.md` moves to the root, reversing the 2026-07-23 decision.
2. Labels come from Conventional Commit titles, in `type:*` and `area:*` form.
3. The default assignee is the author, or `AlaskanTuna`.
4. The 4 stale skills and `bro.md` leave the repository, and no skills get vendored.
5. Only already-tracked specs go to `docs/specs/`. Local specs stay local unless the owner promotes them.
6. Tracked plans leave the tree, because plans are throwaway once merged.
7. `docs/DECISIONS.md` is a curated table. The raw log stays local.
8. `socialPosts` moves under `src/agent/`, not a new top-level folder.
9. The `config` <-> `logger` cycle ends by having `config.ts` collect warnings and `index.ts` log them. `logger` keeps reading its level from `config`.
10. Media files move, although one audit lane called that cosmetic, because the owner rejects messy folders. Typecheck catches any missed path.
11. `test-features.ts`, `test-phase8.ts` and `test-gemini-ga-compare.ts` get deleted. `test-chat.ts` and `test-adk-smoke.ts` stay as manual probes, and `test-adk-smoke.ts` gets its stale `participants` line fixed.
12. npm, TitleCase headings and the existing test approach stay.
13. Audit claims not adopted: a Hangman shutdown crash (`process.exit(0)` runs first); a bug in `studio/server/packs.ts:46` (its comment shows it is deliberate); moving `src/searchSettings.ts` (it would add a wrong-way import); deriving `toolNames.ts` (it is a leaf on purpose, and a test pins it); fetching Studio's bounds from the server (its 114 rows match `config.ts`, apart from one key name).
14. Stages 8 to 11 keep behaviour. Differences between copies get named in the PR, and converge only in a separate PR.
15. `src/discord/attachments.ts` moves under `agent` as `mediaRules.ts`, with its 2 slash-command helpers moved to `commands/ask.ts`.
16. `WindowMessage` moves to `src/storage/sessionStore.ts`, not `src/agent/session.ts`.
17. This document stays tracked and holds nothing operator-specific. Such notes stay in the run's local notes.

## Left to the Builder

- Exact wording of the agent files, within their size limits.
- Label colours and descriptions.
- How the metadata script is laid out, as long as it needs no dependencies and has a unit test.
- Exact seams inside the claim store, turn pipeline and provider-history work.
- Which worker runs each mechanical step, and the review pass on each stage.
