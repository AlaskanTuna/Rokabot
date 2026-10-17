# Memory

What Roka remembers in your server, how to set its privacy, how members make her forget, and how to maintain it.

## At a Glance

- **Where:** server channels only. DMs and `/ask` never read or write memory.
- **When:** a mention, a reply to Roka or the word "Roka" makes a channel monitored for 24 hours. She learns only from
  monitored channels.
- **Needs:** a judge. Set `TYPESAFE_API_KEY` (Jev), or use an `llm:` block in `config.yml` so the main model judges.
  With neither, she learns nothing passively and warns once at startup.
- **Privacy:** `memory.privacy` sets where memories may come back. The default is `relaxed` (whole server).
- **Stored In:** `data/rokabot.db` on your host. Nothing leaves one server for another.
- **Full Contract:** [Memory TRD](../trd/memory.md).

## What She Remembers

| Kind                | Example                                      | How Long It Lasts                                                                                                                 |
| ------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Member facts, heard | "I draw on weekends" becomes a `hobby`       | 180 days for identity and social facts, 30 for lifestyle and interests, 14 for opinions. Counted from the last time she heard it. |
| Member facts, asked | "Remember that my cat is Mochi"              | Pinned. No expiry and no cap.                                                                                                     |
| Server facts        | An event next Friday, a running joke, a rule | Events and plans end after their date. Other server facts stay.                                                                   |
| Conversation recaps | One or two sentences per conversation        | 90 days                                                                                                                           |
| Watched media notes | A summary of a shared video                  | 90 days after the last share                                                                                                      |

- Each member keeps at most 20 unpinned active facts. Old history goes first, then the least important facts.
- She keeps past facts as history ("used to be a nurse") apart from current ones.
- She never stores contact details, passwords, tokens, bank or card numbers. A conversation that mentions an email,
  phone number, address, age, school, workplace or a medical term is dropped before any model sees it.
- A member can also ask "what do you know about me?" or about another member. She answers from the notes this channel
  may see.

### How She Learns

1. She buffers messages in a monitored channel.
2. A conversation closes after 3 minutes of silence or 25 messages.
3. The judge asks: does this state a lasting fact? If not, she drops it.
4. The main model proposes typed changes and a short recap.
5. The judge checks each change: lasting, about the right person, still true. Unsure changes wait as candidates.
6. Accepted facts, the recap and their vectors go to SQLite.

This runs in the background. It never slows a reply.

### Where the Text Goes

- Conversation text goes to the main model's provider for extraction.
- With `TYPESAFE_API_KEY`, conversation text and proposed facts also go to TypeSafe Jev for judging.
- Recaps, facts, media notes and the message she is answering go to the embedding provider (`embeddings.provider`).
  The `local` provider keeps them on your host.
- A small sample of rejected conversations (at most 200, for 14 days) is kept as text for offline review. Set
  `memory.extractionSampleRate: 0` to stop it.

Tell your members that Roka reads channels where she was mentioned.

## Privacy Settings

Set `memory.privacy` in `config.yml`, or `MEMORY_PRIVACY` in `.env`, then restart the bot.

| Level      | What Members See                                                                   |
| ---------- | ---------------------------------------------------------------------------------- |
| `relaxed`  | Default. She can bring up anything she learned anywhere in the server.             |
| `balanced` | Things said in public channels travel. Things said in private channels stay there. |
| `strict`   | Each channel keeps its own memories.                                               |
| `off`      | No new memories and no recall. Members can still make her forget.                  |

- A public channel is one `@everyone` can view that is not NSFW. Threads follow their parent channel.
- If your server hides every channel from `@everyone` and opens them by role, `balanced` acts like `strict`.
- Changing the level changes only what she recalls. You can switch back at any time.
- Under `off`, stored memories stay until their normal expiry.

## Forgetting and Opting Out

- **Forget:** a member says "forget my osu stuff". She deletes their own matching notes and media they shared or posted. She
  removes up to three at once and asks which one when more match.
- **Only Their Own:** a member cannot make her forget someone else's notes or server facts.
- **No Opt-Out Command:** there is no per-member opt-out. To stop all learning, set `memory.privacy: off`. To keep a
  channel out, do not mention Roka there; monitoring ends 24 hours after the last trigger.
- **Owner Deletes:** to remove rows by hand, follow the database steps in the [Runbook](../runbook.md).

## Key Settings

Every key, default and bound is in [Configuration](configuration.md#memory). The ones owners change most:

| Key                                  | Default          | Env Override                        | What It Does                                          |
| ------------------------------------ | ---------------- | ----------------------------------- | ----------------------------------------------------- |
| `memory.privacy`                     | `relaxed`        | `MEMORY_PRIVACY`                    | Where memories may come back                          |
| `memory.recall`                      | `shadow`         | `MEMORY_RECALL`                     | `legacy`, `shadow` (logs the new recall) or `unified` |
| `memory.channelMonitorTtlMs`         | `86400000`       | —                                   | How long a channel stays monitored (24 h)             |
| `memory.maxActiveClaimsPerUser`      | `20`             | `MEMORY_MAX_ACTIVE_CLAIMS_PER_USER` | Unpinned facts kept per member                        |
| `memory.stableClaimRetentionDays`    | `180`            | —                                   | Identity and social facts                             |
| `memory.claimRetentionDays`          | `30`             | `MEMORY_CLAIM_RETENTION_DAYS`       | Lifestyle, interest and personality facts             |
| `memory.transientClaimRetentionDays` | `14`             | —                                   | Opinions, `misc` and currently-watching facts         |
| `memory.episodeRetentionDays`        | `90`             | —                                   | Conversation recaps                                   |
| `memory.mediaRetentionDays`          | `90`             | —                                   | Watched media notes                                   |
| `memory.extractionSampleRate`        | `0.1`            | `MEMORY_EXTRACTION_SAMPLE_RATE`     | Share of rejected conversations kept; `0` stops it    |
| `memory.reclassifyMaxPerRun`         | `20`             | `MEMORY_RECLASSIFY_MAX_PER_RUN`     | Misfiled facts moved per day; `0` stops it            |
| `memory.vaultExportDir`              | `data/vault`     | `MEMORY_VAULT_EXPORT_DIR`           | Where `export:vault` writes                           |
| `embeddings.provider`                | shipped `gemini` | `EMBEDDINGS_PROVIDER`               | `gemini`, `local` or `openai`                         |

## Maintenance Scripts

Run these from a repository checkout. Set `ROKABOT_DB_PATH` to point a script at the live database. Stop the bot and
back up `data/rokabot.db` before the migration. The [Runbook](../runbook.md) has the production steps.

| Command                                           | What It Does                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run export:vault`                            | Writes a read-only Obsidian snapshot of member notes, server facts and recaps.                            |
| `npm run memory:prune-overflow`                   | Applies the 20-fact cap to every member now.                                                              |
| `npm run memory:undo-reclassify -- <id>`          | Puts back one fact that the daily pass moved to another category.                                         |
| `npm run migrate:memory-v2`                       | One-time move of the old `user_memory` table to claims. A rerun does nothing.                             |
| `npm run memory:replay -- --session-history <db>` | Replays saved chats through the pipeline offline, with no network calls.                                  |
| `npm run memory:replay:live`                      | The same with real models. Needs `ROKABOT_MEMORY_REPLAY_LIVE=1`, `GEMINI_API_KEY` and `TYPESAFE_API_KEY`. |

### Browse Memory in Obsidian

1. Run `npm run export:vault` against the live database. It writes to `data/vault/` by default.
2. Copy the folder to a desktop machine.
3. Open it as an Obsidian vault. Each server has member notes, `guild.md` and `Episodes.md`.
4. Run the export again to refresh. The snapshot never syncs back.

```bash
npm run export:vault
rsync -av data/vault/ desktop-user@desktop-host:~/Rokabot-vault/
```

## Source Files

- `config.yml` (`memory:` and `embeddings:` blocks), `src/config.ts`
- `src/agent/memory/`, `src/agent/tools/rememberUser.ts`, `src/agent/tools/recallUser.ts`,
  `src/agent/tools/forgetUser.ts`
- `scripts/export-vault.ts`, `scripts/prune-claim-overflow.ts`, `scripts/undo-reclassify.ts`,
  `scripts/migrate-memory-v2.ts`, `scripts/replay-memory-v2.ts`
