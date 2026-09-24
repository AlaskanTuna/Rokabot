# Jev Integration

> Research and design for bringing TypeSafe's Jev model into Rokabot. Written 2026-09-24. Jev decides; Gemini still writes every reply.

## Why

A regular in a group server said Roka "needs more context for who is who" and suggested Jev for memory extraction and for "the entire decision layer". This note records what Jev can and cannot do, what Rokabot's decision points actually are, and the rollout that came out of it.

## What Jev Is

- **Decision Model:** Jev (TypeSafe's "System One" model) takes a JSON `state` plus typed questions and returns typed answers only. It never writes text.
- **Primitives:** `choice` (one of up to 255 options, with probabilities and confidence), `noul` (probability of yes), `score` (position on 2–10 ordered levels).
- **API:** `POST https://api.typesafe.ai/v1/systemone`, Bearer `TYPESAFE_API_KEY`, JS SDK `@typesafe-ai/sdk`. Questions in one request run in parallel and cannot see each other's answers.
- **Model:** pinned to `jev-1.13.0`. The aliases `jev-latest`/`jev-preview` move, and thresholds are tuned against one version.
- **Cost:** $0.042 per million input tokens, output free. A turn's judgment costs roughly 350–900 input tokens.
- **Weak Spots (per the docs):** pronoun resolution, arithmetic and dates, irrelevant state, adversarial text. Japanese is handled "not equally well" as English.

## Measured From The Pi

Six sequential requests from the production Pi, three questions each (referent, tone, memory), 720 input tokens:

| Run     | 1    | 2    | 3    | 4    | 5    | 6    |
| ------- | ---- | ---- | ---- | ---- | ---- | ---- |
| Seconds | 0.53 | 0.82 | 0.39 | 0.50 | 1.96 | 0.48 |

Median about 0.5 s, one 1.96 s outlier. Each run opened a new TLS connection. That is well above the documented 100–150 ms, so the in-reply deadline is 1.2 s, not the 500 ms first proposed.

The shipped `judgeTurn` and `judgeExtraction`, run live before merge:

| Case                                                               | Answer             | Seconds |
| ------------------------------------------------------------------ | ------------------ | ------- |
| "did bocchi ever tell you what guitar she wants?" (two candidates) | right member, 0.98 | 0.45    |
| Same turn, tone                                                    | `playful`, 0.28    | same    |
| Memory: "actually call me Aki-chan from now on, i changed my name" | 0.94               | 0.33    |
| Memory: "gg"                                                       | 0.03               | 0.37    |
| Memory: "i just moved to Osaka for my new job at a bakery"         | 0.89               | 0.33    |

The tone answer's low confidence is why tone ships in shadow: the threshold has to come from real chats.

## Where Rokabot Decides Today

- **Reply Trigger:** rules (mention, reply-to-bot, `/\broka\b/i`). Unchanged. Deterministic and correct.
- **Tone:** a regex detector. Before #195 it never saw the current message; it now reads the current message plus the two before it.
- **Tool Routing:** Gemini function calling. The tool-trigger harness already scores `recall_user` 0.9/1.0 and `search_web` 1.0/1.0, so there is little headroom.
- **Memory Admission:** a rule gate (`candidateGate.ts`). Before #195 it rejected corrections and "remember this" whenever the predicate was already known.
- **Who-Is-Who:** before #195 only the speaker was named, facts covered people who had recently addressed the bot, and name lookup was exact and ignored nicknames. #195 added a deterministic resolver (`identityResolver.ts`); in production at the time there were 2 active nickname claims and 1 colliding display name, so Jev's referent question is expected to fire rarely.

## Design

- **Replace Nothing Wholesale:** Jev takes decisions that are a pick from a known list. Gemini keeps generation, tool calling and fact writing.
- **One Client:** `src/agent/jev/client.ts` wraps the SDK. No key means no client, and every feature falls back to today's behaviour. One attempt only, no retries; failures log `Jev judgment failed` and return nothing.
- **Per-Feature Modes:** `off`, `shadow` (ask Jev and log the answer next to the current decision, change nothing, never delay a reply) and `on`. All three ship in `shadow`.
- **In The Reply Path (one request per turn):**
  - **Tone:** a `choice` over the 12 tones. In `on` mode it replaces the regex tone at or above `jev.toneMinProbability`.
  - **Referents:** a `choice` over candidate members for each name the resolver found ambiguous, plus `none`/`unclear`. In `on` mode a pick at or above `jev.referentMinConfidence` joins the people whose facts are injected. Unresolved stays unresolved.
  - In `on` mode the request is awaited (bounded by `jev.timeoutMs`); in `shadow` it runs alongside the reply without changing it.
- **In The Background:** a `noul` asks whether the newest human message in a batch the rule gate rejected states a lasting fact or a correction. In `on` mode, at or above `jev.extractionAdmitThreshold`, the batch is queued with `admitted_by = 'jev'` so the extractor's re-gate does not drop it. Jev never overrides a sensitive or trivial refusal, and never vetoes a batch the rules admit.

## Rollout

1. **Shadow:** use the persisted `jev_events` query in `docs/runbook.md` to review turn judgments across deploys, alongside `Jev extraction admission` logs.
2. **Tune:** set the thresholds in `config.yml` from persisted turn judgments and extraction admission logs. Where Jev and the rules disagree is where to look.
3. **Switch On:** one feature at a time, tone first, since its mistakes are visible and harmless. `JEV_TONE`, `JEV_REFERENTS` and `JEV_EXTRACTION` in `.env` override the `config.yml` modes without a code change.

## Deliberately Not Done

- **No Roster In The Prompt:** #52 measured `recall_user` recall falling from 1.000 to 0.722 with it.
- **No Jev Tool Routing:** little headroom, and free-text arguments stay with Gemini anyway.
- **No Jev Fact Verification:** deferred until wrong-person attribution is actually observed.
- **No Reply-Trigger Change:** answering unaddressed messages is a behaviour change, not a fix.
- **No Jev As A Fallback Model:** it cannot write text. The Gemini-outage fallback is a separate piece of work (`MODELSCOPE_API_KEY`, `Qwen/Qwen3.5-122B-A10B`).

## Second Opinion

GPT-6-Astra, consulted blind on the same facts, agreed on the direction. It pushed the name resolution to plain code first with Jev only for leftovers, and made tone the first Jev feature. It also found the gate-ordering bug fixed in #195.
