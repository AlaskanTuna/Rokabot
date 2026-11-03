/** Retry and pacing budgets shared by the live gate, its pacing test and the live Vitest config.
 *
 * Side-effect-free by design: it imports nothing. `vitest.live.config.ts` cannot import
 * `tests/harness/toolTrigger.ts` — that would load `src/config.ts` and dotenv while Vitest is still
 * reading its own config — so the constants live here and every site imports them. */

// Gate-1 amendment (human, 2026-07-29): pacing never runs below this, however cheap the derivation gets.
export const GATE1_FLOOR_MS = 12000

/** How many times one trial may be re-run after a transient before the run is abandoned.
 *
 * Not a retry-until-green dial. A prompt that genuinely makes the model return nothing would otherwise
 * hide behind unlimited retries and score as though it never had, which is the failure the rig's own
 * guard exists to prevent.
 *
 * Budgeted per trial rather than across the run, because the variable that separates the two failures is
 * **concentration on one case**, not total volume: noise on the wire lands one-each on scattered cases,
 * a broken prompt lands repeatedly on the same one, and a run-level count sums that distinction away —
 * it cannot tell three unlucky cases from one broken one. Per-trial is tighter where it should be (a
 * broken case aborts on its own third failure, rather than waiting for a fourth failure anywhere) and
 * looser where it should be (four scattered transients never accumulate into an abort). It also needs no
 * fitted rate to justify it: "this trial failed three times running" is a statement about the trial. */
export const MAX_TRIAL_RETRIES = 2
