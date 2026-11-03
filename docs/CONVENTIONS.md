# Conventions

House rules for this repository. Add a rule only after an agent repeats a mistake, and give the reason. Delete rules that stop applying.

## Commands

Scripts live in `package.json`. It cannot tell you these:

- **Full Verification:** `npm test`, `npm run test:perf`, `npm run typecheck` and `npm run format:check`.
- **Typecheck:** `npm run build` checks only `src/`, and Vitest strips types, so `npm run typecheck` is the only gate that sees a test file.
- **Live Gate:** `npm run test:live` needs `GRAPHIFY_GEMINI_API_KEY` and spends real Gemini calls. It is outside full verification.

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
- **Architecture:** it lives in `docs/trd.md` and `docs/trd/`. Do not create `docs/architecture.md`.
- **Planning Files:** design documents go in `docs/specs/YYYY-MM-DD-topic.md`. Plans and run notes go in `.superpowers/`. This overrides any skill's default path.
- **Local History:** `docs/decisions.md` and `docs/progress.md` are git-excluded logs. Check the first before reversing an earlier choice.

## Shipping

- **PRs:** `main` is PR-only, and a PR merges only once `test` and `images-ok` pass. Poll with `gh pr checks`, never a fixed sleep. On a failure, stop, report the PR URL and the failing check, and leave the PR open.
- **Merging:** use `gh pr merge --squash --delete-branch`; `--auto` and `--admin` are forbidden. A merge deploys unless every changed path is in `paths-ignore` of `.github/workflows/deploy.yml`, so it needs the same explicit human authorization as a restart.
- **Authorization:** commit and push only with explicit human authorization. Never force-push or rewrite published history. Do not restart or redeploy the production bot without explicit human authorization.
- **Follow-Ups:** record each follow-up as a labelled, assigned issue, not only in chat.

## Commits

Use Conventional Commits, `<type>[scope]: <description>`: one imperative sentence, no trailing period, no body or footer. `commitlint.config.js` holds the allowed values. **Titles:** check issue and PR titles with `commitlint` before creating them.
