# Roka Voice v3: Restoring Variety on Haiku

Investigated 2026-10-15 and 2026-10-16. PR #337 moved production from Gemini Flash Lite to Claude Haiku 5.5. PR #345 changed the persona prompt and added a code-selected reply shape to restore variation.

## Complaints After the Haiku Switch

The first Haiku prompt pass made replies feel repetitive and overly careful. Replies often opened with the same interjection, used two paragraphs regardless of the message, and added a food or caretaking question even when it did not fit. Haiku also used fewer dramatic and affectionate beats than Gemini. These were measurable changes, not just a change in writing style:

| Marker                                         | Gemini Era | Haiku v1 | Haiku v2 | Observed Effect                                     |
| ---------------------------------------------- | ---------: | -------: | -------: | --------------------------------------------------- |
| Replies opening with the repeated interjection |         0% |        — |      33% | A quoted prompt example became a default opener.    |
| Replies containing the stock laughter marker   |         0% |        — |       9% | A second prompt example was copied into replies.    |
| Replies with two paragraphs                    |        67% |        — |      98% | The prompt strongly favored a fixed two-part shape. |
| Meal-related replies                           |         5% |      28% |      75% | Caretaking became a routine coda.                   |
| Replies ending in a question                   |        33% |        — |      60% | Many answers ended with an unnecessary question.    |
| Flirty marker                                  |        36% |        — |       8% | Haiku expressed less of the lively, teasing voice.  |
| Onee-san marker                                |        33% |        — |       2% | A defining voice marker nearly disappeared.         |
| Distinct faces per 50 replies                  |         31 |       14 |       18 | Haiku repeatedly chose from the small listed pool.  |

The v2 sample contained 55 production replies over about 18 hours, mostly from two channels. That small, uneven sample limits the precision of the percentages.

## Root Causes

- **Copyable Examples:** The prompt quoted several interjections and stock laughter examples. Haiku repeated these literally. Removing the quoted interjections in an ablation reduced the repeated opener from 20% to 0% and the laughter marker from 21% to 1%.
- **A Fixed Reply Template:** The core prompt favored two short paragraphs, with a tease, a caretaking beat, or a question in the second paragraph. Loosening that wording alone changed two-paragraph replies from 95% to 80%, but did not remove the pattern.
- **A Mandatory Caretaking Coda:** The personality prompt suggested asking about meals. Combined with the second-paragraph slot, this made food and sleep checks appear in unrelated conversations.
- **Model Behavior:** On identical older prompts, Gemini used more flirting and drama than Haiku. Changing effort settings did not recover the voice: Haiku with thinking disabled copied examples more often, while medium effort changed little. Sonnet was more varied, but cost about twenty times as much as Haiku in the measured setup and still fussed about meals more often.
- **History Reinforced the Prompt:** 35 of 55 v2 replies already contained the repeated opener in the last six context turns. On v2-era turns, every replay arm, including Gemini, mentioned meals in 48–70% of replies. On clean Gemini-era history, the range was 9–38%.
- **A Narrow Face List:** Haiku selected 68–83% of its faces from the short list in the prompt. Recent faces in conversation history also encouraged copying.

## Canon Research

The research compared 816 Japanese and English character lines from a Senren\*Banka dataset slice. The English lines were likely from the commercial localization, so findings about English cadence carry that qualification.

Roka's canon voice is brisk and expressive. Most lines begin with their content; soft openers are occasional, while surprise interjections and laughter are rare. Her comedy comes from mock politeness, loud comebacks, playful threats, melodramatic self-pity, quick resets, and repeated words. Teasing sounds like an old friend, including flustered scolding when a joke crosses a line. Short English lines had a median of 10 words. Routine food checks, repeated catchphrases, romantic possessiveness, and self-described big-sister talk were uncommon.

The target was therefore canon-like comedy with the Gemini era's energy and variety, without importing Gemini's less-canon romance and staged big-sister behavior.

## Replay and Blind-Judge Method

The v2 investigation used 60 real turns with production history: 20 from the recent Haiku period and 40 from the Gemini period. It compared nine prompt/model/effort arms at two trials each, for 1,080 replies with no replay errors. The turns came from a copy of the production SQLite database. User identities and original messages remain in the local benchmark data and are not reproduced here.

Two independent blind judges reviewed 248 items each: 152 production replies and 96 replay replies. Each also compared a 25-versus-25 contrast. A third judge route failed before returning results. Agreement between the two completed judges was weak for organic ratings (r = -0.04) and modest for humor (r = 0.27), so the review emphasized repeated patterns, explicit flags, and paired contrasts rather than treating average scores as ground truth. Judge ratings put caution at 2.49 versus 2.11 and humor near 2.5/5 across eras.

## Tuning Rounds

1. **Check Model and Effort:** Haiku at none, low, and medium effort showed that effort was not the main control. Sonnet was varied but expensive and did not solve the caretaking pattern.
2. **Remove Copyable Interjections:** The ablation that removed quoted interjections almost eliminated the repeated opener and laughter marker. This confirmed that examples themselves were a driver.
3. **Loosen Paragraph Wording:** Changing the two-paragraph instruction alone moved the two-paragraph share from 95% to 80%. The remaining concentration showed that descriptive wording could not reliably select a shape per turn.
4. **Choose the Shape in Code:** PR #345 added `replyShape.ts`. It chooses length, opener, ending, face candidates, and occasional teasing beats before the model call. The resulting instruction closes the system prompt as it does in production.
5. **Remove the Coda and Broaden the Voice:** The prompt stopped treating food or sleep checks as a default follow-up and added short-form canon comedy. Faces moved into tone-specific groups, with candidates rotated against recent replies.
6. **Reset the Conversation Window Once:** Existing channel history carried the old repeated patterns into new replies. The v3 rollout cleared active session windows once so the model would not keep copying them. Normal window and idle-TTL behavior resumed afterward.

## Results

The final v3 chat replay became the comparison baseline for v4. On the 80-turn plain-chat regression set with a fresh history window and two runs per turn, v3 produced one, two, and three paragraphs at 61%, 36%, and 3%; exclamation marks at 69%; flirty lines at 45%; disclaimers at 9%; customer wording at 6%; meal or sleep fussing at 7%; and the two repeated interjection markers at 1% and 0%. These figures show that prompt changes and a per-turn shape restored range, while also exposing remaining issues that the next investigation addressed.

The earlier production comparison also showed why a code-selected shape mattered: the same older prompt generated 95% two-paragraph replies from Haiku, while the prose-only length ablation reached 80%. The shape makes the length decision explicit on each turn rather than asking the model to infer variety from general guidance.

## Known Weak Spots

- **Search and Media Turns:** The v3 turn sample skipped watched media, linked posts, replies to Roka, and tool turns. It did not test whether the new voice held up in those cases.
- **Conversation History:** A prompt change alone did not remove old habits already present in channel history. The one-time reset addressed that launch condition; it is not a substitute for measuring fresh and production history separately.
- **Judging:** The completed blind judges disagreed on organic quality ratings. Repeated-marker counts and paired comparisons are more reliable evidence than small score differences.
- **Model Differences:** The same prompt can produce different rates of drama, flirting, and caution across model families. The shape sets a structure but does not guarantee the quality of each line.
- **Expressions:** Playful remained a common tone with a small portrait pool. The voice replay measured text markers, not whether the displayed expression matched each reply.

## Tunables

`src/agent/replyShape.ts` holds the main per-turn controls:

- **Paragraph Weights:** `PARAGRAPHS` sets the one-, two-, and three-paragraph probabilities for quick, ordinary, and rich messages.
- **Openers:** `WORDS`, `COMEDY`, `STYLE_OUT_OF`, and `chooseOpener` control opener styles, tone restrictions, and recent-opener rotation.
- **Endings:** `ENDINGS` sets statement, question, and aside probabilities; the previous reply can suppress a second question ending.
- **Voice Beats:** `FLIRT`, `ONEESAN`, and `DRAMA` set the tone-specific chance of those beats.
- **Faces:** `FACES`, `TONE_FACES`, and `chooseFaces` control tone-matched face candidates and recent-face rotation.
- **Edge Scenes:** `messageEdge`, `THREATS`, and `renderReplyShape` control lewd-bait and hard-line scenes in the current file.

These values are deliberate tuning knobs. Change one group at a time and replay the same turns so its effect can be measured.

## Rerunning the Check

Use a copy of the production SQLite database. Choose time windows that cover the eras you want to compare. The replay offers `search_web` on every turn; searches use the bot's `searchWeb` implementation and are cached beside the results file for reuse across arms.

```bash
npx tsx scripts/persona-replay.ts \
  --db /path/to/copy.sqlite \
  --out /tmp/roka-v3.jsonl \
  --trials 2 \
  --kinds chat,tool,reply,edgy \
  --window baseline=2026-10-09T00:00:00Z..2026-10-16T00:00:00Z \
  --history prod \
  v3=worktree@haiku:low

npx tsx scripts/persona-report.ts /tmp/roka-v3.jsonl --by arm,kinds
```

For a source from a Git ref, use an arm such as `candidate=ref:main@haiku:low`. Use `--history fresh` to test only the current user message. The result rows include IDs, kinds, window, model, reply shape, search queries, and generated output; do not commit replay data from the private production snapshot.
