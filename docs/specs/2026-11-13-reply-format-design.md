# Follow Explicit Output-Format Requests

Design for detecting explicit user format constraints, yielding block 14 (`## Reply Shape`), verifying and repairing model output at the model boundary, and measuring compliance across providers and models.

## Problem and Rationale

When a user asked for a rating out of 100 in point form, block 14 (`## Reply Shape`) instructed the model to write "two short paragraphs" with an override note that beats earlier layers. Under the prompt-layer precedence decision, the code-chosen length overruled both the user and general guidance. Because the override comes from code, the fix belongs in the harness so it works identically on every model provider.

## Four-Layer Design

| #   | Layer                 | Where                                            | Mechanism                                                                                                                                                   | Slice                              |
| --- | --------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | **Detect**            | `src/agent/replyFormat.ts`                       | Deterministic regex rules over `speakerWords`, returning `FormatRequest` (`list`, `score`, `length`, `cues`)                                                | 1 (regex), 2 (Jev `format` shadow) |
| 2   | **Yield**             | `src/agent/replyShape.ts`, `prompts/format-*.md` | Keep dice order identical; replace Length (or append Score) unless `edge !== 'none'` or safety rungs 1–3 suppress it                                        | 1                                  |
| 3   | **Verify and Repair** | `src/agent/roka.ts` (`afterModelCallback`)       | Check final single-part text response (`!hasFunctionCall`) after `capReplyBlocks`; deterministic reformat (`reformat`) or later bounded rewrite (`rewrite`) | 1 (reformat), 2 (rewrite)          |
| 4   | **Measure**           | `response_events`, `failure_diagnostics`         | Record `format_kinds`, `format_outcome`, `format_detail` (no message text) and file `format_unmet` (`outcome: 'ok'`) on unmet success turns                 | 1                                  |

**Rejected Alternatives:**

- **Constrained Retry Through `runTurnWithReliability`:** running a second ADK session turn appends the non-compliant reply to session history first.
- **Structured or JSON Output:** conflicts with tool calling on Chat Completions adapters outside effort `none`.

## First Slice

- **Config (`format`):** `mode` (`off | shadow | on`, default `on`, `FORMAT_MODE`), `repair` (`off | reformat`, default `reformat`, `FORMAT_REPAIR`), `minListItems` (2..5, default 3), `minListShare` (0..1, default 0.5), `wordSlack` (0..1, default 0.1). `format.mode: off` keeps prompts and replies byte-identical.
- **Detection:** `speakerWords` uses `ownWords` plus stripping fenced code, bracket-prefixed lines (`[Embed:`, `[Forwarded:`, `[Container:`, etc.), `(sticker:` lines, and `*_UNTRUSTED_DATA_LABEL` lines. Detects `bullets` (`point_form`, `bullets`, `dot_points`, `as_list`, `list_verb`), `numbered` (`steps`, `rank`, `top_n`), `score` (`score_scale`, `how_scale`, `rate_no_scale` defaulting to max 10; 2 <= N <= 100), `words` (`one_word`, `n_words`), and `sentences` (`n_sentences`). If both `words` and `sentences` match, `words` wins.
- **Prompt Yield:** when `edge === 'none'` and `format.mode === 'on'`, `renderReplyShape` substitutes `prompts/format-*.md` for Length on `list`/`length`, appends `format-score.md` (`{{max}}`), and under `length` drops Open, End and beats while keeping Faces and `nameOnce`.
- **Verification and Reformat Repair:** `checkReplyFormat` validates `bullets`, `numbered`, `score` (`N/MAX`, `N out of MAX`, or `%` when MAX is 100), `words` (with `wordSlack` for `max >= 10`, ignoring fences/faces/URLs/markdown), and `sentences`. `enforceReplyFormat` leaves compliant replies byte-identical, renumbers bullet lines for `numbered_from_bullets`, or splits pure-prose blocks via `parseReplyBlocks` (`list_from_prose`) while attaching trailing/leading faces to the preceding sentence; mixed code/quote/list blocks and missing scores are returned unchanged as `not_possible` / `unmet`.
- **Telemetry:** `response_events` gains `format_kinds`, `format_outcome` (`null` on failed turns, `suppressed` on edge or safety suppression) and structured JSON `format_detail` (version 1, mode, cue ids, numeric bounds, first/final checks, repair, suppression). Unmet successful turns record `format_unmet` in `failure_diagnostics` under the 72-hour verbatim retention window.

## Deferred Follow-Ups

1. Bounded tool-less `rewrite` repair on the answering route for unmet `score`, `length` or unrebuildable prose when slice-1 telemetry shows material `unmet` volume.
2. Jev `format` choice question in `judgeTurn` (`jev.format: shadow`) to measure paraphrases and CJK missed by regexes.
3. Additional kinds (`Label: value` / code-block tables, yes/no, no kaomoji, language, TL;DR, exact item counts, one-line-each).
4. Cross-turn format persistence, per-request output token headroom for long lists, deterministic length trim, and review of safety-rung suppression.
5. Offline detector replay over `session_history`, live compliance eval cases, and `/stats` compliance breakdown.

## Risks and Key Assumption

- **False Positives:** mitigated by narrow rules, speaker-only text, edge suppression, `format.mode: shadow`, and `format_kinds` sampling.
- **Mechanical Prose-to-List Rebuilds:** Roka's tildes, ellipses and kaomoji can make sentence splitting stiff; mitigated by attaching faces to prior sentences and leaving non-prose blocks untouched.
- **Key Assumption:** once block 14 explicitly names the requested format, primary and fallback models comply on the first pass in the vast majority of turns, making `list_from_prose` a rare backstop; `format_outcome` grouped by `provider` and `model_id` tests this assumption in production.
