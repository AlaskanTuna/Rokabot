# Search Depth Replay Gate

Offline regression gate for the search-depth work (issue #522, spec `docs/specs/2026-11-18-search-depth-design.md`).
Later PRs move depth into code inside `search_web`. This gate replays recorded provider payloads through the
real `searchWeb` and checks whether the evidence handed to the model carries each case's facts.
Model grading stays live and manual.

## What the gate checks

`tests/harness/__tests__/searchDepth.eval.test.ts` replays every fixture in `fixtures/` through the real
`searchWeb` under `SEARCH_PROVIDER=exa` with a dummy key. HTTP is faked per fixture: search requests are
answered from that fixture's recorded exchanges by URL and query, page-read requests (`/contents`,
`/extract`) by requested URL, and an unmatched request gets a 599 so the test sees the miss. DNS for page
reads is stubbed to a public address, so replay never resolves real hosts. The concatenated tool results
are the evidence. Each fact in `facts.json` is a case-insensitive regex over that evidence.

- A fact listed as `covered` in `expected-coverage.json` that the replay no longer finds fails the test.
- A fact listed as `missing` that now shows up prints as an improvement without failing.
- News cases (`N1`-`N3`, `volatile: true`) never fail: their facts expire.
- With no fixtures present the test reports zero cases and passes.
- Two L1 brief tests pin the depth loop (issue #534): the saved `L1` fixture replayed with the live gate's
  `fields` must surface hotcakes, a named drink and another food item inside a cited brief, and the
  hand-built `L1-thin` fixture (thin snippets, one recorded `/contents` exchange) must need a page read
  with no `local_query` and pass via that read.

## Recording fixtures

From `tests/harness/search-depth/baseline-2026-11-18/`, next to `cases.jsonl`:

```sh
npx tsx run.mts "" out.jsonl --record ../fixtures/
RECORD_COMMIT="$(git rev-parse HEAD)" npx tsx run.mts "" out.jsonl --record ../fixtures/
```

`run.mts` runs each case through `runModelTurn`, so the per-turn budget and deadline apply, and keeps its
existing JSONL output and also writes one `<caseId>.json` per case: the case id, recording time, commit
(from `RECORD_COMMIT`, else null), the model's real `search_web` arguments as the wrapped tool saw them
(including `fields`, `local_query` and `source`), and every Exa, Tavily and Jikan request and response
(method, URL, request body, status, response JSON), `/contents` and `/extract` included. Recording is a
live run and spends real calls.

## Updating coverage

Improvements print without failing so a later PR promotes them deliberately:

```sh
npx tsx tests/harness/search-depth/updateCoverage.ts
```

This reruns the replay and rewrites `expected-coverage.json`. Review the diff before committing it:
promoting an improvement means the evidence now carries that fact.

## Baselines and grades

`baseline-2026-11-18/` holds the frozen live run of all 38 cases plus the recording runner. Its
`grades.json` is the owner-reviewed record: 31 pass, 5 flag, 2 fail. The J3 grade already carries the
18 Nov correction: the official store page confirms Pokemon Center Osaka is at LUCUA SOUTH 13F.

## Suite membership

`vitest.contract.config.ts` includes `**/*.eval.test.ts`, so the gate runs in `npm run test:contract`.
`vitest.live.config.ts` only includes `*.live.test.ts`, so the gate never runs in `npm run test:live`.
