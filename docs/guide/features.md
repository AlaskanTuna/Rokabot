# Features

What Rokabot does for the members of a Discord server, and how they reach each feature.

## At a Glance

| Area                                                                   | What Members Get                                                 | How They Reach It                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| [Talking to Her](#talking-to-her)                                      | In-character chat with Roka, per-channel context                 | @mention, reply, the word "Roka", `/ask`           |
| [Commands](#commands)                                                  | Games, anime lookups, reminders, server stats, bug reports       | Slash commands                                     |
| [Tools She Uses](#tools-she-uses)                                      | Dice, coins, time, weather, web search, anime, reminders, memory | Roka calls them herself during a chat              |
| [Memory](#memory)                                                      | She remembers members and server facts                           | Chat in a server channel she watches               |
| [Seeing and Watching](#seeing-and-watching)                            | Images, PDFs, audio, video and social post links                 | Attach a file or paste a link when you talk to her |
| [Games and Gacha](#games-and-gacha)                                    | Companion spirits, Hangman, Shiritori, leaderboards              | `/gacha`, `/hangman`, `/shiritori`                 |
| [Reminders](#reminders)                                                | Timed pings in the channel                                       | `/remind`, or ask Roka                             |
| [Stats](#stats)                                                        | Four views of the last 30 days                                   | `/stats`                                           |
| [Reactions and Notices](#reactions-status-rotation-and-update-notices) | Emoji reactions, status rotation, release notices for the owner  | Automatic                                          |

![Features Map](../diagrams/features-map.svg)

How each way of reaching Roka leads to her features. Only mention, reply and name-keyword turns use memory.

## Talking to Her

| Trigger      | What Starts a Reply                                              | Who Can Use It     | Reads or Writes Memory |
| ------------ | ---------------------------------------------------------------- | ------------------ | ---------------------- |
| @mention     | A message that mentions the bot                                  | Humans only        | Yes, in a server       |
| Reply        | A reply to one of Roka's messages                                | Humans only        | Yes, in a server       |
| Name Keyword | The whole word `roka` anywhere in a message, any case            | Humans and bots    | Yes, in a server       |
| `/ask`       | The slash command, with a required `question` and optional files | Anyone, in DMs too | No                     |

- **Conversation Window:** each channel has its own session. It keeps the last `session.windowSize` (20) messages. After `session.ttl` of silence, or a restart, the session rebuilds from SQLite and skips messages older than `session.maxRehydrationAge` (2 hours).
- **Overheard Context:** a mention, reply or name keyword marks the channel as monitored for `memory.channelMonitorTtlMs` (24 hours). In a monitored server channel she also reads up to `memory.contextSize` (10) recent messages she was not asked about.
- **One Turn per Channel:** while she answers in a channel, a second trigger there gets a short busy line. The line deletes itself after 5 seconds.
- **Rate Limits:** when the minute or day budget runs out, she declines in character. The decline deletes itself after 5 seconds.
- **Reply Card:** each reply is a Components V2 card with an expression portrait that matches the detected tone. Long replies split into several messages at `discord.maxMessageLength`.
- **Direct Messages:** the bot has no direct-message intent, so mentions in a DM never reach it. Slash commands marked "Anywhere" below do work in DMs.

## Commands

"Anywhere" means servers, DMs with the bot, and private channels through the user-installed app. "Server" means server channels only.

| Command      | Subcommand        | Purpose                                                                                    | Where    |
| ------------ | ----------------- | ------------------------------------------------------------------------------------------ | -------- |
| `/ask`       | none              | Ask Roka anything. Options: `question`, `attachment_1` to `attachment_3`, `attachment_url` | Anywhere |
| `/anime`     | `search`          | Find an anime by title                                                                     | Anywhere |
| `/anime`     | `browse`          | Browse by sort (`sort_by`), `type` and airing `status`                                     | Anywhere |
| `/anime`     | `schedule search` | Show one anime's broadcast slot                                                            | Anywhere |
| `/anime`     | `schedule browse` | Browse what airs today, this week or this season                                           | Anywhere |
| `/remind`    | `in`              | Remind me in 1 to 10,080 minutes (7 days)                                                  | Anywhere |
| `/remind`    | `at`              | Remind me at an hour and minute in the bot's `timezone`                                    | Anywhere |
| `/remind`    | `list`            | Show my active reminders                                                                   | Anywhere |
| `/remind`    | `cancel`          | Cancel a reminder by its ID                                                                | Anywhere |
| `/gacha`     | `hatch`           | Hatch a companion spirit (one per 24 hours)                                                | Anywhere |
| `/gacha`     | `view`            | Show my latest companion                                                                   | Anywhere |
| `/gacha`     | `pet`             | Interact with my latest companion                                                          | Anywhere |
| `/gacha`     | `stats`           | Collection overview and detailed stats                                                     | Anywhere |
| `/gacha`     | `collection`      | Browse my whole collection                                                                 | Anywhere |
| `/gacha`     | `guide`           | Explain rarities, stats and commands                                                       | Anywhere |
| `/gacha`     | `leaderboard`     | Top 10 companions by total stats                                                           | Anywhere |
| `/hangman`   | `start`           | Start a game in this channel                                                               | Server   |
| `/hangman`   | `guess`           | Guess a letter or the full word                                                            | Server   |
| `/hangman`   | `guide`           | Explain the rules                                                                          | Server   |
| `/hangman`   | `leaderboard`     | Top 10 players                                                                             | Server   |
| `/shiritori` | `start`           | Start a word-chain game in this channel                                                    | Server   |
| `/shiritori` | `join`            | Join before the first word is played                                                       | Server   |
| `/shiritori` | `play`            | Submit my word                                                                             | Server   |
| `/shiritori` | `end`             | End the game and show the scores                                                           | Server   |
| `/shiritori` | `scores`          | Show current scores, word and turn                                                         | Server   |
| `/shiritori` | `guide`           | Explain the rules                                                                          | Server   |
| `/shiritori` | `leaderboard`     | Top 10 players                                                                             | Server   |
| `/stats`     | none              | Open the server activity notebook                                                          | Server   |
| `/report`    | none              | File a bug report: `type`, `message` (up to 1,500 characters), optional `attachment`       | Anywhere |

- **Registration:** the bot registers every command globally each time it starts.
- **Bug Reports:** a report reply is visible only to its author. One member may file `report.maxPerUserPerHour` (5) reports per rolling hour. The bot keeps a copy of an attachment up to `report.maxAttachmentBytes` (8 MiB).

## Tools She Uses

Roka decides when to call a tool. Each reply ends with a one-line footer that names up to two tools she used, then a count of the rest (`+2`). A web search adds a second line with up to three linked source sites.

| Tool                 | What It Does                                       | Footer Label         | Matching Command  |
| -------------------- | -------------------------------------------------- | -------------------- | ----------------- |
| `roll_dice`          | Roll 1 to 10 dice with 2 to 100 sides              | cast the dice        | none              |
| `flip_coin`          | Heads or tails                                     | tossed a coin        | none              |
| `get_current_time`   | Time and date for a city or IANA timezone          | checked the clock    | none              |
| `get_weather`        | Current weather for a city (Open-Meteo)            | checked the weather  | none              |
| `search_web`         | Web search (Tavily, needs `TAVILY_API_KEY`)        | searched the web     | `/ask`            |
| `search_anime`       | Anime search (Jikan)                               | looked up anime      | `/anime`          |
| `get_anime_schedule` | Airing schedule by day, week or season (Jikan)     | checked airing times | `/anime schedule` |
| `read_replies`       | Most-liked replies on a linked social post         | read the replies     | none              |
| `set_reminder`       | Set a reminder for the speaker                     | set a reminder       | `/remind`         |
| `list_reminders`     | List the speaker's reminders                       | listed reminders     | `/remind list`    |
| `cancel_reminder`    | Cancel one of the speaker's reminders              | cancelled a reminder | `/remind cancel`  |
| `remember_user`      | Save a fact the speaker asked her to keep          | saved a memory       | none              |
| `recall_user`        | Look up what she knows about a member              | recalled a memory    | none              |
| `forget_user`        | Forget the speaker's own notes that match keywords | forgot a memory      | none              |

- **Withheld Tools:** `/ask` turns never get `remember_user`, `recall_user` or `forget_user`. With `memory.privacy: off` she keeps only `forget_user`. She gets `read_replies` only when the message asks about a post's replies.
- **Social Footer Labels:** an opened post leads the footer, for example `peeked at the X post`, and becomes the first citation. A post she could not open shows as `couldn't open the X post`.
- **Watch Labels:** watched media adds a label such as `watched the video`, `watched most of the video`, `skimmed the video` or `couldn't watch the video`.

## Memory

Roka remembers lasting facts about members and the server. Full guide: [Memory](memory.md).

- **Where:** memory works in server channels through mentions, replies and the name keyword. `/ask` and DMs never read or write memory.
- **Passive:** in a monitored channel she notes lasting facts from the conversation without being asked.
- **On Request:** "remember that..." saves a fact. "Forget my osu stuff" removes matching notes about the speaker only.
- **Privacy Mode:** `memory.privacy` sets the scope: `relaxed` (whole server, default), `balanced`, `strict` or `off`.
- **Peek:** `/stats` has a Memory view with totals and the five members she remembered most recently.

## Seeing and Watching

She reads files and links on both `/ask` and the mention path. Full contract: [Media](../trd/media.md).

| Input            | Accepted Formats                                                  | Per-File Ceiling                                                         |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Image            | PNG, JPEG, GIF, WebP                                              | 4 MB                                                                     |
| PDF              | PDF                                                               | 10 MB                                                                    |
| Audio            | MP3, WAV, OGG, FLAC, AAC, AIFF                                    | 8 MB, or up to `media.maxStreamedUploadBytes` (50 MB) with a watcher on  |
| Video            | MP4, MOV, WebM, AVI, MPEG, FLV, WMV, 3GP                          | 10 MB, or up to `media.maxStreamedUploadBytes` (50 MB) with a watcher on |
| File Link        | Same formats, through `/ask` `attachment_url`                     | Same as the file type                                                    |
| Social Post Link | X, Bluesky, YouTube, TikTok, Reddit, Instagram, Bilibili, Threads | `socialPosts.maxLookupsPerTurn` (1) post per turn                        |

- **Per Turn:** up to 10 files (on `/ask`, 3 uploads and 1 link), at most one audio or video file, and at most `discord.maxAttachmentBytesPerTurn` (10 MB) reserved.
- **Watcher:** `media.watcher` picks how she takes in audio and video: `gemini`, `qwen`, `direct` or `off`.
- **Unreadable Files:** she tells the member when she cannot open a file, or could read only its opening.
- **Other Message Parts:** she also reads forwarded messages, embeds, polls, stickers and files inside Components V2 messages.

## Games and Gacha

| Game              | How It Works                                                                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Companion Spirits | `/gacha hatch` once per 24 hours. 18 species in 5 rarities: Common 60%, Uncommon 25%, Rare 10%, Epic 4%, Legendary 1%. Five stats: CHARM, WIT, DERE, DRAMA, LUCK. `games.shinyChance` (1%) gives a shiny.                                    |
| Gacha Shortcut    | @mention Roka with only `gacha`, `draw`, `fortune` or `omikuji` to see your companion card.                                                                                                                                                  |
| Hangman           | One game per channel. `games.hangmanLives` (6) wrong guesses end it. `games.hangmanTimeoutMs` (2 minutes) of silence ends it.                                                                                                                |
| Shiritori         | Each word starts with the last letter of the one before. Words are English, 2 or more letters, in the dictionary, and not used yet. A game needs 2 players. A player who misses `games.shiritoriTimeoutMs` (2 minutes) on their turn is out. |

Progress, scores and leaderboards live in SQLite. Leaderboards count across every server.

## Reminders

| Rule         | Value                                                                                   |
| ------------ | --------------------------------------------------------------------------------------- |
| Range        | 1 minute to 7 days                                                                      |
| Active Limit | `reminders.maxPerUser` (5) per member                                                   |
| Delivery     | Posted in the original channel with a mention; a DM when the channel cannot be reached  |
| Check Period | Every `reminders.checkIntervalMs` (5 seconds)                                           |
| Stale Drop   | A reminder more than `reminders.staleThresholdMs` (5 minutes) overdue is dropped unsent |

## Stats

`/stats` opens one card with a view picker. Only the member who opened it can switch views, and the picker closes after 2 minutes.

| View     | Shows                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Overview | Chats, unique chatters, busiest channel, most active day and hour, streak, top tool, trigger split, 12-month heatmap, channel histogram |
| Mood     | Server mood label, top three tones, tone donut chart                                                                                    |
| Memory   | Active memories, members and episodes remembered, new facts, top categories, the 5 most recently remembered members, growth chart       |
| Nerd     | Response time p50 and p95, fastest and slowest reply, success and retry rates, words exchanged, daily p95 latency chart                 |

All views cover the last 30 days, except the Overview heatmap. `/stats` works in servers only.

## Reactions, Status Rotation and Update Notices

| Feature         | Behavior                                                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Emoji Reactions | Any human message in a server can earn a reaction from 8 keyword groups: compliments, greetings, goodnight, sadness, food, anime, celebration, anger. The chance is `emoji.probability` (0.33), with an `emoji.cooldownMs` (3 minutes) cooldown per channel. |
| Status Rotation | Her Discord status changes every `statusCycleMs` (15 minutes). Each line fits the hour in `timezone`, for example opening the shop between 05:00 and 09:00.                                                                                                  |
| Update Notices  | Every `updates.checkIntervalHours` (24) hours the bot checks GitHub releases for `updates.repo`. It DMs the application owner once per newer release. `updates.notify: false` or `UPDATES_NOTIFY=false` turns it off.                                        |

## Source Files

- `src/discord/events/messageCreate.ts`, `src/discord/events/interactionCreate.ts`
- `src/discord/commands/`
- `src/agent/tools/index.ts`, `src/discord/messageBuilder.ts`
- `src/discord/attachments.ts`, `src/agent/attachmentLimits.ts`, `src/discord/byteBudget.ts`
- `src/games/`, `src/discord/events/games/`, `src/discord/events/stats/`
- `src/discord/emojiReactor.ts`, `src/discord/statusCycler.ts`, `src/discord/updateNotifier.ts`, `src/discord/reminderScheduler.ts`
