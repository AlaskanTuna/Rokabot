# Contributing

How to get a change into Rokabot. Agent rules live in [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).

## Branches

Branch from `main`. Every change, small ones included, lands through a pull request.

## Titles

Write issue and pull request titles as Conventional Commits: `<type>(<scope>): <sentence>`, one imperative sentence with no trailing period and at most 100 characters. [`commitlint.config.js`](commitlint.config.js) holds the allowed types and scopes. A scope is optional.

## Labels and Assignees

Every issue and pull request carries a `type:` label, an `area:` label and an assignee. The `metadata` workflow reads the title, adds the matching labels and assigns the author, so a valid title is usually all you need. A pull request fails the `metadata` check if any of these is missing. [`.github/labels.yml`](.github/labels.yml) lists every label.

## Pull Requests

Fill in the template: Summary, Evidence and Merge Danger. Name the issue the pull request closes. When a change alters a contract, update its [TRD](docs/TRD.md) module in the same pull request.

## Gates

Run these before asking for review: `npm test`, `npm run test:perf`, `npm run typecheck`, `npm run lint` and `npm run format:check`.

## Merging

A pull request merges once its required checks pass, with `gh pr merge --squash --delete-branch`. A merge redeploys and restarts the production bot unless every changed path is in `paths-ignore` of [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
