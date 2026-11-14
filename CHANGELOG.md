# Changelog

## [0.8.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.7.0...v0.8.0) (2026-11-14)


### Features

* **memory:** drop the legacy memory tables through an explicit backup-guarded script ([#501](https://github.com/AlaskanTuna/Rokabot/issues/501)) ([8f93a49](https://github.com/AlaskanTuna/Rokabot/commit/8f93a49406fc359e59fd4e239f20ecbb317c7541))
* **memory:** read prompt-facing memory through the scoped item store under memory.store item ([#499](https://github.com/AlaskanTuna/Rokabot/issues/499)) ([777c6ca](https://github.com/AlaskanTuna/Rokabot/commit/777c6cad5db4cbff4afc696a56267b6dda8c02b2))
* **memory:** write memory items directly under memory.store item, with a reverse export to legacy ([#500](https://github.com/AlaskanTuna/Rokabot/issues/500)) ([e62d520](https://github.com/AlaskanTuna/Rokabot/commit/e62d520123365c7922446c474b26f0090ec39da8))


### Bug Fixes

* **memory:** drop a call-shaped fact value instead of failing the whole extraction batch ([#492](https://github.com/AlaskanTuna/Rokabot/issues/492)) ([1da3f9a](https://github.com/AlaskanTuna/Rokabot/commit/1da3f9a67080cc4e97840a45a692fcb2eee55ff2))
* **memory:** send memory model calls prompt-local refs in a stable order ([#498](https://github.com/AlaskanTuna/Rokabot/issues/498)) ([1e2ea4f](https://github.com/AlaskanTuna/Rokabot/commit/1e2ea4fb21e74693e9dc5ebdba71611c0079a207))

## [0.7.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.6.1...v0.7.0) (2026-11-13)


### Features

* **memory:** add the typed memory item tables with an offline backfill and replay check ([#485](https://github.com/AlaskanTuna/Rokabot/issues/485)) ([1d2ad7e](https://github.com/AlaskanTuna/Rokabot/commit/1d2ad7e4e81fccd27b053c2adbc60c29d185a383))
* **memory:** mirror legacy memory writes into the item tables under the dual store ([#486](https://github.com/AlaskanTuna/Rokabot/issues/486)) ([885c4fe](https://github.com/AlaskanTuna/Rokabot/commit/885c4feebbe877635ace7baef7ee9b7a36f43299))


### Bug Fixes

* **memory:** drop only the invalid ops when a Haiku extraction reply partly fails validation ([#482](https://github.com/AlaskanTuna/Rokabot/issues/482)) ([456b482](https://github.com/AlaskanTuna/Rokabot/commit/456b482aaf6cd02e1c963a79911780aa37dabcca))

## [0.6.1](https://github.com/AlaskanTuna/Rokabot/compare/v0.6.0...v0.6.1) (2026-11-13)


### Bug Fixes

* **agent:** follow explicit reply format requests on every model ([#474](https://github.com/AlaskanTuna/Rokabot/issues/474)) ([81f2f97](https://github.com/AlaskanTuna/Rokabot/commit/81f2f979299978f0b0902c592f8c43a0879a69de))
* **agent:** run extraction on Haiku and stop bad images and Jikan outages breaking replies ([#472](https://github.com/AlaskanTuna/Rokabot/issues/472)) ([e68dafc](https://github.com/AlaskanTuna/Rokabot/commit/e68dafcf28bc0aad9cd0fade6c37b05ea0e27983))
* **memory:** record the model that actually answered in the extraction trace ([#480](https://github.com/AlaskanTuna/Rokabot/issues/480)) ([a2d873b](https://github.com/AlaskanTuna/Rokabot/commit/a2d873b2faf6cd78f872d4b25b60c411fc86b894))
* **memory:** stop the sensitive precheck matching emoji, Discord IDs, dates and everyday phrases ([#478](https://github.com/AlaskanTuna/Rokabot/issues/478)) ([72a1c30](https://github.com/AlaskanTuna/Rokabot/commit/72a1c301de72657ea37f20fdae63a9caeacf1773))

## [0.6.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.5.1...v0.6.0) (2026-11-08)


### Features

* **agent:** run a Jev relevance gate on recalled memories in shadow and log its picks ([#451](https://github.com/AlaskanTuna/Rokabot/issues/451)) ([ba927f1](https://github.com/AlaskanTuna/Rokabot/commit/ba927f198b461478296206387993fa4d1ab3adad))
* **memory:** check episode summaries and drop the ones that fail before embedding ([#460](https://github.com/AlaskanTuna/Rokabot/issues/460)) ([ce2bf97](https://github.com/AlaskanTuna/Rokabot/commit/ce2bf97dd2be42447ae21f44da1cc260b08a35c2))
* **memory:** record the source message and speaker on evidence and count each job once ([#462](https://github.com/AlaskanTuna/Rokabot/issues/462)) ([1b57ecd](https://github.com/AlaskanTuna/Rokabot/commit/1b57ecd600e154e157354f5bd9def598d490ca94))
* **memory:** save open episode lines so a crash does not lose them ([#459](https://github.com/AlaskanTuna/Rokabot/issues/459)) ([fcbeee7](https://github.com/AlaskanTuna/Rokabot/commit/fcbeee7c452d1ef10e6aa761b3267621c9ca58f1))


### Bug Fixes

* **agent:** let background work run on a Gemini route and pin the live harness route ([#471](https://github.com/AlaskanTuna/Rokabot/issues/471)) ([e009f86](https://github.com/AlaskanTuna/Rokabot/commit/e009f86e99af2d0344564b1825d4b0ec0169f87f))
* **agent:** wait long enough for the query embedding in the Jev recall gate ([#456](https://github.com/AlaskanTuna/Rokabot/issues/456)) ([e3f60cb](https://github.com/AlaskanTuna/Rokabot/commit/e3f60cb42bcfbfaffb0c1bed355fec5e58146069))
* **deploy:** retry the yt-dlp release download so a GitHub hiccup does not fail the image build ([#468](https://github.com/AlaskanTuna/Rokabot/issues/468)) ([6e573ba](https://github.com/AlaskanTuna/Rokabot/commit/6e573bade4ae7cea0c96ad37e9428180aba71365))
* **media:** download images at vision size so large photos and slow links stop dropping them ([#466](https://github.com/AlaskanTuna/Rokabot/issues/466)) ([2d4bf7f](https://github.com/AlaskanTuna/Rokabot/commit/2d4bf7fc6fbbc690f28e8eb12de3fffdfea2c2b8))
* **media:** label an image the processor could not convert with its real type ([#469](https://github.com/AlaskanTuna/Rokabot/issues/469)) ([42824ba](https://github.com/AlaskanTuna/Rokabot/commit/42824bab9404121781f3f643a8734cfbd7c7a7ba))
* **storage:** stop rewriting the claim search index on every boot ([#457](https://github.com/AlaskanTuna/Rokabot/issues/457)) ([cf2296c](https://github.com/AlaskanTuna/Rokabot/commit/cf2296c3110ffe190c64fe9cc14eb450798d9842))

## [0.5.1](https://github.com/AlaskanTuna/Rokabot/compare/v0.5.0...v0.5.1) (2026-11-04)


### Bug Fixes

* **deploy:** let promote recover when release-please fails after tagging ([#449](https://github.com/AlaskanTuna/Rokabot/issues/449)) ([251701d](https://github.com/AlaskanTuna/Rokabot/commit/251701d61526e5bf104fb5932594634510b8653c))

## [0.5.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.4.0...v0.5.0) (2026-11-03)


### Features

* **agent:** default web search to the main model, so set search.provider: tavily to keep Tavily ([#364](https://github.com/AlaskanTuna/Rokabot/issues/364)) ([4f194f6](https://github.com/AlaskanTuna/Rokabot/commit/4f194f6abd8992ed222aaf9fd4399856c9deae84))
* **agent:** let config.yml choose off, tavily or exa for web search ([#362](https://github.com/AlaskanTuna/Rokabot/issues/362)) ([cd06bc5](https://github.com/AlaskanTuna/Rokabot/commit/cd06bc5f4cec93f4111c8bf1e1e1fe952038ebf1))


### Bug Fixes

* **agent:** keep /ask nickname lookups away from the Jev judge ([#439](https://github.com/AlaskanTuna/Rokabot/issues/439)) ([6d516a6](https://github.com/AlaskanTuna/Rokabot/commit/6d516a69e9d19763e7c317b45c1431af390a2850))
* **agent:** make retries and the fallback reach a model again ([#365](https://github.com/AlaskanTuna/Rokabot/issues/365)) ([7412692](https://github.com/AlaskanTuna/Rokabot/commit/7412692dfc462d9c62121af63ec9098a30c400ff))
* **discord:** send the /ask error before defer and ignore emoji names in the replies check ([#421](https://github.com/AlaskanTuna/Rokabot/issues/421)) ([ac52ee4](https://github.com/AlaskanTuna/Rokabot/commit/ac52ee46e1d10c367186937237266fe7181ea9bb))
* **games:** keep Shiritori scores and fix three smaller failures ([#408](https://github.com/AlaskanTuna/Rokabot/issues/408)) ([724ec3f](https://github.com/AlaskanTuna/Rokabot/commit/724ec3f458a8707e885cc4ea6b69f5b29f2a0f00))
* **media:** refuse private addresses written in hex v4-mapped form ([#445](https://github.com/AlaskanTuna/Rokabot/issues/445)) ([b521c94](https://github.com/AlaskanTuna/Rokabot/commit/b521c944f171fc2ee3f04df12a7d25b3b0f6b716))
* **media:** stop re-watching a video because one note ran long ([#420](https://github.com/AlaskanTuna/Rokabot/issues/420)) ([87914b4](https://github.com/AlaskanTuna/Rokabot/commit/87914b4c23858fc41320828aa8bc96734027067b))
* **media:** watch a playable video from a Discord embed ([#443](https://github.com/AlaskanTuna/Rokabot/issues/443)) ([8596978](https://github.com/AlaskanTuna/Rokabot/commit/8596978b455ac816a994f8cfde308b00456d6acd))

## [0.4.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.3.0...v0.4.0) (2026-10-17)


### Features

* add the Persona Studio dashboard for the pack, config.yml and .env ([#359](https://github.com/AlaskanTuna/Rokabot/issues/359)) ([9553ec4](https://github.com/AlaskanTuna/Rokabot/commit/9553ec4b53416572777dd7ffb5c1da16134ee196))
* add the Persona Studio local API that validates pack, config and secret edits before saving ([#355](https://github.com/AlaskanTuna/Rokabot/issues/355)) ([35216d5](https://github.com/AlaskanTuna/Rokabot/commit/35216d516ce84d50adaad50fb8524713ef9ee218))
* **agent:** run main and fallback models on any OpenAI-compatible endpoint declared in config.yml ([#349](https://github.com/AlaskanTuna/Rokabot/issues/349)) ([b3a90dc](https://github.com/AlaskanTuna/Rokabot/commit/b3a90dcdd65968daa486b6dac30869d40e8e0600))


### Bug Fixes

* **agent:** reject a command description that Discord's limit refuses once its macros are filled ([#357](https://github.com/AlaskanTuna/Rokabot/issues/357)) ([ae49e70](https://github.com/AlaskanTuna/Rokabot/commit/ae49e700fdde77ebab52967d78c20bba5e33c6df))
* **config:** log startup warnings without deadlocking the config and logger imports ([#358](https://github.com/AlaskanTuna/Rokabot/issues/358)) ([a02ae44](https://github.com/AlaskanTuna/Rokabot/commit/a02ae445f7a5631c61aa519c6610e0f0fe0d519d))

## [0.3.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.2.0...v0.3.0) (2026-10-16)


### Features

* **discord:** DM the bot owner once per new Rokabot release ([#343](https://github.com/AlaskanTuna/Rokabot/issues/343)) ([11b8c25](https://github.com/AlaskanTuna/Rokabot/commit/11b8c25e07cc5ec89da495e24d9a970e6529c3f0))


### Bug Fixes

* **agent:** bring back the Gemini-era Roka on Haiku by picking each reply shape in code ([#345](https://github.com/AlaskanTuna/Rokabot/issues/345)) ([c55a7d8](https://github.com/AlaskanTuna/Rokabot/commit/c55a7d83c1d50170748ad5e9ef6fd6ac94126e1f))
* **agent:** keep Roka in voice on looked-up, watched and edgy turns and say no as a dramatic scene ([#346](https://github.com/AlaskanTuna/Rokabot/issues/346)) ([a258ddc](https://github.com/AlaskanTuna/Rokabot/commit/a258ddcf5cf3d464bd426c241a4c9cd64c5c60c8))
* **agent:** record what the model returned when a turn comes back empty so the Qwen fallback failure can be traced ([#348](https://github.com/AlaskanTuna/Rokabot/issues/348)) ([0453719](https://github.com/AlaskanTuna/Rokabot/commit/0453719f6f9957774b82ec96b842c3ab69297102))

## [0.2.0](https://github.com/AlaskanTuna/Rokabot/compare/v0.1.0...v0.2.0) (2026-10-16)


### Features

* publish releases to a stable image tag and let users run and auto-update Rokabot from it ([#341](https://github.com/AlaskanTuna/Rokabot/issues/341)) ([f2e1a70](https://github.com/AlaskanTuna/Rokabot/commit/f2e1a70f45dce8582d9b9dfdff9ca9e42e887bec))
