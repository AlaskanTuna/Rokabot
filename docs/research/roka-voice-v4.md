# Roka Voice v4: Looked-Up Turns and Saying No

Investigated and built 2026-10-16. Follows v3 (#345), which brought the Gemini-era voice back to plain chat on
Claude Haiku 5.5 by choosing each reply's shape in code (`src/agent/replyShape.ts`).

## What Users Reported After v3

- **Search, Media and Explanations:** replies to "explain this", a shared video or a fact-check read like v1 and
  v2 again: a neutral summary, a disclaimer, and a single cute line at the end.
- **Edgy and Softcore Questions:** Roka answered lewd bait by announcing a boundary instead of playing along, and
  closed hard-line refusals with the same moderator script turn after turn.
- **Angry Faces:** `(╬ಠ益ಠ)` and `(｀д´)` turned up everywhere.
- **Customers:** she started treating people as customers rather than as someone she is drawn to.

## Evidence

| Source                                  | What It Holds                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Production snapshot before the v3 reset | 437 replies, 2026-10-09 to 2026-10-16, across the Gemini, v1 and v2 eras          |
| Production snapshot after the v3 deploy | 28 live v3 replies                                                                |
| Tool-turn replay                        | 97 real search, media, link and explain turns from every era, Haiku at effort low |
| Edgy replay                             | 18 real lewd-bait and hard-line turns picked by the new detector                  |
| Chat regression replay                  | The 80-turn v3 chat set, fresh window                                             |
| Worker audits                           | Two independent model reviews of every live v3 reply against the v3 goals         |

Replays send the production prompt, the reply shape and the real conversation history to the production model
settings. Search turns call the bot's own `searchWeb`, fetched once per turn and shared by every arm.

## Root Causes

1. **An older template overrode v3 on searched and watched turns.** The core prompt's "Presenting What You Looked
   Up or Watched" section (#287, 2026-10-08, the Gemini era) said the first words answer the question, no "Ara~",
   70% content and 30% reaction, two paragraphs, and one closing sentence of character. The v3 reply shape
   stepped aside for it ("those rules win"). Flash Lite read it loosely; Haiku followed it to the letter, so the
   character shrank to a tacked-on last line. With the section removed, Haiku used the asked-for opener in 97% of
   these replies instead of 59%.
2. **Disclaimers had their own drivers.** With the template gone they stayed at 29% (Gemini era: 2%). They came
   from media hedging ("can't tell from these frames"), web searches for the server's own in-jokes that came back
   empty, and Haiku's habit of flagging what it could not confirm.
3. **The v3 benchmark could not see these turns.** Its turn picker skipped media, linked posts, replies to Roka and
   every tool turn; replies to Roka alone are about 40% of production traffic.
4. **The prompt said what was off limits but not how to say no.** An in-character redirect existed, but only on
   the safety retry path, which Gemini's blocks triggered and Haiku never does. Haiku filled the gap with "I'm not
   answering that".
5. **Faces and framing.** The annoyed face group mixed the rage face in with mild pouts, users echoed her faces
   back and she copied them, and two v3 lines (the "dear customer" example and a "difficult customer" comedy
   opener) made people customers in 11% of live replies, against 0 to 2% before.

## What Changed

- **Looked-Up and Watched Turns:** the template is gone. These turns keep the useful parts (sum it up, about 120
  words looked up and 180 watched, the main point first when they ask what a link says, a verdict early when they
  ask for a judgement), and the Reply Shape sets the opener, length and ending as on any other turn. Her voice
  runs through the whole reply. A detail the results don't settle is left out or offered as a guess, never written
  up as unconfirmed. The server's own in-jokes are never searched for.
- **Saying No as a Scene:** `messageEdge` in `src/agent/replyShape.ts` reads lewd bait about adults and hard lines
  (sexual content about a minor, sexual violence, slurs) in what the user wrote or in a message they replied to,
  ignoring Roka's own quoted reply. Lewd bait adds a flustered-scene beat; a hard line adds a refusal beat with one
  burst of outrage, no flirting, no onee-san, no cute opener and no question back. The core prompt's hard
  boundaries say the scene itself is the no, with no announced refusal, rule or lecture, and they still refuse
  anything sexual about a minor every time. No forbidden phrase is quoted, since Haiku copies quoted examples.
- **Faces:** the rage faces moved to a `furious` group offered only on hard lines, and a face the user just posted
  is never offered back.
- **People, Not Customers:** both customer lines are gone, the comedy opener is now mock innocence, saying-no
  threats are drawn per turn from twelve themes from her life in Hoori rather than the shop counter, and a new line
  says people here are hers to tease and fuss over, never people she serves.

## Results

Haiku 5.5 at effort low, two runs per turn unless noted. Gemini is production's own replies to the same turns.

| Searched, Watched and Explain Turns | Gemini Era | v3  | v4  |
| ----------------------------------- | ---------- | --- | --- |
| Asked-for opener used               | n/a        | 59% | 98% |
| Disclaimers                         | 2%         | 29% | 21% |
| Exclamation marks                   | 65%        | 52% | 64% |
| Flirty line                         | 42%        | 31% | 40% |
| Character only in the last sentence | 2%         | 13% | 6%  |
| Search used on real search turns    | n/a        | 61% | 62% |

The tool-turn arm was the first v4 build; the final build changed only the saying-no wording, the threat
rotation, the new people-not-customers line and one phrase in the looked-up rules.

Edgy turns: 18 real turns (10 lewd bait, 8 hard lines), three runs each. The Gemini column is production's own
replies, which cover only 6 of the lewd turns.

| Lewd Bait                          | Gemini Era | v3  | v4   |
| ---------------------------------- | ---------- | --- | ---- |
| Announces a refusal                | 0%         | 13% | 10%  |
| Moderator wording                  | 0%         | 7%  | 3%   |
| Flustered (stammer, blush, gasp)   | 100%       | 83% | 90%  |
| Over-the-top threat from her world | 50%        | 47% | 100% |

| Hard Lines                                | v3    | v4    |
| ----------------------------------------- | ----- | ----- |
| Refused                                   | 24/24 | 24/24 |
| Repeats the slur or describes the content | 0     | 0     |
| Moderator wording                         | 33%   | 25%   |
| Over-the-top threat from her world        | 46%   | 100%  |

An earlier build named two example threats in the prompt; one of them ("Dad's broom") then appeared in 98% of
saying-no replies and 22% of plain chat. The threat is now drawn per turn from twelve themes, skipping any she
used in her last three replies: "broom" fell to 13% of saying-no replies and 0% of chat.

Plain chat, the v3 80-turn set with a fresh window, two runs each, to check v4 did not undo v3:

| Plain Chat                   | v3           | v4           |
| ---------------------------- | ------------ | ------------ |
| One / two / three paragraphs | 61 / 36 / 3% | 52 / 45 / 2% |
| Exclamation marks            | 69%          | 72%          |
| Flirty line                  | 45%          | 52%          |
| Disclaimers                  | 9%           | 4%           |
| Calls someone a customer     | 6%           | 2%           |
| "Ehh~" / "Ahaha"             | 1% / 0%      | 2% / 1%      |
| Meal or sleep fussing        | 7%           | 8%           |

## Known Limits

- **Disclaimers:** still around a fifth of looked-up replies, against 2% in the Gemini era. Some are honest (a
  four-frame clip really does not show the answer); the rest is Haiku's own caution.
- **Image-Only Bait:** a hard line that lives only in an image cannot be read by `messageEdge`; the core prompt's
  hard boundaries still refuse it.
- **Detector:** a word list, tuned for precision. A false lewd match costs a flustered reply; a missed one falls
  back to the core prompt's saying-no rule.
- **History:** live channels still hold v3 refusal scripts. The history should be cleared once at deploy, as for
  v3, so she does not copy them.
- **Reliability:** separate from the voice. One live turn failed when Haiku hit a network error mid-search and the
  Qwen fallback returned empty text twice.

## Tunables

- **Detector Word Lists:** `MINOR`, `SEXUAL`, `HARD_LINE` and `LEWD` in `src/agent/replyShape.ts`.
- **Beat Wording:** the lewd and hard-line lines in `renderReplyShape`.
- **Threat Themes:** `THREATS` in `src/agent/replyShape.ts`; each entry pairs a theme with the pattern that marks it
  as recently used.
- **Faces:** `FACES.furious` and the tone groups in `src/agent/prompts/kaomoji.ts`.

## Rerunning the Check

Use the reusable harness against a copy of the production database. Include all four turn kinds and compare production history with a fresh window when history may be reinforcing an old pattern.

```bash
npx tsx scripts/persona-replay.ts \
  --db /path/to/copy.sqlite \
  --out /tmp/roka-v4.jsonl \
  --trials 2 \
  --kinds chat,tool,reply,edgy \
  --window baseline=2026-10-09T00:00:00Z..2026-10-16T00:00:00Z \
  --history prod \
  v4=worktree@haiku:low

npx tsx scripts/persona-report.ts /tmp/roka-v4.jsonl --by arm,kinds
```

Use another arm such as `candidate=ref:main@haiku:low` to compare a Git source. The report expands a multi-kind turn into each applicable kind group. Review edgy turns for refusal, moderator wording and the numeric slur-repetition count; do not print or publish the source terms or the private replay data.
