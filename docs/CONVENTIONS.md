# Conventions

House rules for this repository. Add a rule only after an agent repeats a mistake, and give the reason. Delete rules that stop applying.

## Commands

Scripts live in `package.json`. It cannot tell you these:

- **Full Verification:** `npm test`, `npm run test:perf`, `npm run typecheck` and `npm run format:check`.
- **Typecheck:** `npm run build` checks only `src/`, and Vitest strips types, so `npm run typecheck` is the only gate that sees a test file.
- **Test Scopes:** `npm test` runs contract and eval tests with the unit suite, except the perf-only memory-shadow test and live tests. `npm run test:contract` runs contract (`.contract.test.ts`) and eval (`.eval.test.ts`) files only. `npm run test:perf` runs only the perf-only memory-shadow test. `npm run test:live` runs the live harness on the `flash` route with the harness Gemini key unless `LLM_MAIN` overrides it; it needs `GRAPHIFY_GEMINI_API_KEY` and spends real calls, so it stays outside full verification.

## Configuration

- **Tunables:** every tunable lives in `config.yml` with an inline comment. `src/config.ts` wires environment overrides, and `NUMERIC_BOUNDS` bounds numbers.
- **Secrets:** `.env.example` lists them. `.env` is never committed.

## Code Style

- **Formatting:** Biome owns TS and JS (lint, format, import order). Prettier owns Markdown, YAML and JSON. Biome's `quoteStyle: single` means prefer: `"I couldn't open that file"` is correct, and rewriting it fails `biome check`.
- **Error Handling:** validate at system boundaries. Do not wrap internal framework calls in try/catch.
- **Comments:** write one only when the why is non-obvious.

## Documentation

- **Casing:** TitleCase for headings, table headers and bold bullet labels. Never re-case identifiers, paths, commands, config keys, env vars, model IDs or URLs.
- **Docs Names:** files directly in `docs/` are in full uppercase. Files in its subfolders stay lowercase.
- **Architecture:** it lives in `docs/TRD.md` and `docs/trd/`. Do not create `docs/architecture.md`.
- **Planning Files:** design documents go in `docs/specs/YYYY-MM-DD-topic.md`. Plans and run notes go in `.superpowers/`. This overrides any skill's default path.
- **Decisions:** check `docs/DECISIONS.md` before reversing an earlier choice. A new lasting decision adds a row in the PR that makes it.

## Shipping

- **PRs:** `main` is PR-only, and a PR merges only once `test` and `images-ok` pass. Poll with `gh pr checks`, never a fixed sleep. On a failure, stop, report the PR URL and the failing check, and leave the PR open.
- **Merging:** use `gh pr merge --squash --delete-branch`; `--auto` and `--admin` are forbidden. A merge deploys unless every changed path is in `paths-ignore` of `.github/workflows/deploy.yml`, so it needs the same explicit human authorization as a restart.
- **Authorization:** commit and push only with explicit human authorization. Never force-push or rewrite published history. Do not restart or redeploy the production bot without explicit human authorization.
- **Follow-Ups:** record each follow-up as a labelled, assigned issue, not only in chat.

## Commits

Use Conventional Commits, `<type>[scope]: <description>`: one imperative sentence, no trailing period, no body or footer. `commitlint.config.js` holds the allowed values. **Types and Scopes:** both are enforced. The `type:` and `area:` labels in `.github/labels.yml` mirror them, and a test keeps the two in step. **Titles:** check issue and PR titles with `commitlint` before creating them.
