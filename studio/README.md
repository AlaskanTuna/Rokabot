# Persona Studio

Persona Studio is a local console for configuring the bot end to end: the character pack, `config.yml` and the
secrets in `.env`. It checks every edit with the bot's own validation before it saves anything, so a saved
configuration is one the bot will start with. [PRODUCT.md](PRODUCT.md) is the product brief.

![Persona Studio editing a prompt, with the live preview on the right](screenshot.png)

This folder holds a local server with a JSON API under `/api`, the React UI in `studio/ui/` that it serves at every
other path, and `studio/template/`, the starter pack a new character is copied from.

## Start It

```bash
npm run studio
```

It builds the UI, starts the server, prints one line and opens that URL in your default browser:

```
Persona Studio: http://127.0.0.1:5174/#token=<token>
```

The UI reads the session token from the `#token=` fragment, which the browser never sends to a server. If no browser
opens, the studio prints one more line; open the URL by hand.

- **Port:** `STUDIO_PORT`, default `5174`.
- **Token:** `STUDIO_TOKEN`, for end-to-end tests that need a known token: at least 24 characters, each a letter, a digit, `-` or `_`. Without it, a random token is made at each start.
- **No Browser:** `STUDIO_NO_OPEN=1` prints the URL without opening it. The studio tries `xdg-open` on Linux, `wslview` and then `xdg-open` on WSL, `open` on macOS and `cmd /c start` on Windows.
- **UI Folder:** `STUDIO_UI_DIR`, absolute or relative to the repo root, default `studio/ui/dist`. Without a built UI, every path outside `/api` answers 503.
- **Secrets File:** `STUDIO_ENV_PATH`, default `.env` at the repo root.
- **Pack:** the one the bot would load: `CHARACTER_DIR`, else `character:` in `config.yml`, else `characters/roka`. If that folder has no `character.yml`, the studio still starts, and the pack routes answer 409 until you select or create a pack.
- **Config File:** `ROKABOT_CONFIG_PATH`, default `config.yml` at the repo root.
- **Applying a Change:** a save writes the file. Restart the bot to load it.

```bash
curl -H "X-Studio-Token: <token>" "http://127.0.0.1:5174/api/preview?mood=playful&hour=21&memory=full"
```

## What It Edits

| Page                    | File                                          | What You Do                                                               |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| Identity                | `character.yml`                               | Names, wake words, sampling hints, time-of-day bands                      |
| Prompts                 | `prompt.system` and the prompt Markdown files | Order, add and edit the cached system prompt; override a harness prompt   |
| Voice                   | `voice.yml`                                   | The reply-shape dice: lengths, openers, endings, faces                    |
| Moods                   | `moods.yml` and `prompts/moods/`              | Moods, detection rules, pairs and portraits                               |
| Lines                   | `lines.yml`                                   | Every line the bot posts outside a reply, with a Discord preview          |
| Models                  | `config.yml` › `llm`                          | Main and fallback models, routing, adding and testing a compatible server |
| Memory, Limits, Discord | `config.yml`                                  | Every other config block, with the bot's own bounds as help               |
| Secrets                 | `.env`                                        | Add, replace and clear keys; values stay masked                           |

Every page shows the bot's own error on the field that caused it, previews the exact prompt for a mood, hour and
memory mode, and keeps comments and layout in the YAML byte for byte outside the value you change.

## Tests

```bash
npx vitest run studio              # server and YAML-editing unit tests
npm run test:e2e                   # Playwright, on a sandbox copy of the pack, config.yml and .env
E2E_DATA=worst npm run test:e2e    # the same against stress data (also: empty, one)
```

The end-to-end run builds the UI and starts the studio on port 5199 (`E2E_PORT`) against
`node_modules/.cache/persona-studio-e2e-<port>/`, so the real files are never touched. `npx playwright install
chromium` installs the browser once.

## API

Every path is under `/api`. Request and response bodies are JSON. File paths in requests and responses are relative
to the repo root, for example `characters/roka/moods.yml` or `prompts/boundaries.md`.

| Method   | Path                   | Body                                        | Returns                                                                                                                                                                                                                                  |
| -------- | ---------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/pack`            | none                                        | `{ dir, harnessDir, files, validation, candidates }`. `files` holds `character.yml`, `voice.yml`, `moods.yml`, `lines.yml`, every `prompts/**/*.md` in the pack and every harness `prompts/*.md`, each with `kind`, `locked` and `text`. |
| `PUT`    | `/api/pack/file`       | `{ path, text }`                            | `{ path, validation }` after a save. The whole pack is loaded from a scratch copy with the change applied first; on a problem nothing is written.                                                                                        |
| `PUT`    | `/api/pack/files`      | `{ files: [{ path, text }] }`               | `{ files, validation }` after a save of 1 to 50 distinct files; `text: null` deletes one. Every change is checked together on a scratch copy, then each file is written atomically; on a problem nothing is written.                     |
| `POST`   | `/api/pack/validate`   | `{ files: [{ path, text }] }`               | `{ validation }` for the pack with 0 to 50 draft changes applied, under the same rules as `PUT /api/pack/files`. Nothing is written, and a pack that does not load still answers 200.                                                    |
| `POST`   | `/api/pack/select`     | `{ dir }`                                   | The new pack, as `GET /api/pack` returns it. `dir` is one of `candidates`; the pack must load, then `character:` in `config.yml` is rewritten, comments kept, and the config check runs before it is saved.                              |
| `POST`   | `/api/pack/create`     | `{ id }`                                    | The new pack, as `GET /api/pack` returns it. Copies `studio/template/` to `characters/<id>/`, sets its `id:`, and selects it. `id` matches `^[a-z0-9][a-z0-9-]{0,31}$` and the folder must not exist.                                    |
| `GET`    | `/api/preview`         | none                                        | `{ prompt, tokens, stableTokens }` for `mood`, `hour` (0 to 23), `memory` (`full`, `forget` or `none`) and `user`, read from the pack on disk now. An unknown mood returns 400 with `moods`.                                             |
| `POST`   | `/api/preview`         | `{ files, mood?, hour?, memory?, user? }`   | The same, assembled from a scratch copy with 0 to 50 draft changes applied, under the rules of `PUT /api/pack/files`. A draft that does not load answers 422 with `problems`.                                                            |
| `GET`    | `/api/schema`          | none                                        | A JSON Schema per pack file, keyed `character.yml`, `voice.yml`, `moods.yml` and `lines.yml`.                                                                                                                                            |
| `GET`    | `/api/config`          | none                                        | `{ path, text }` of `config.yml`.                                                                                                                                                                                                        |
| `PUT`    | `/api/config`          | `{ text }`                                  | `{ path, ok }` after a save. The bot's config loader and pack loader run first in a child process on a scratch copy, with the current `.env`; on a problem nothing is written.                                                           |
| `POST`   | `/api/config/validate` | `{ text }`                                  | `{ ok: true }`, or `{ ok: false, problem: { file, path, message } }`, from the same check as `PUT /api/config`. Nothing is written.                                                                                                      |
| `GET`    | `/api/secrets`         | none                                        | One `{ key, set, masked, inExample, description, required }` per key in `.env.example`, commented-out ones included, then per extra key in `.env`.                                                                                       |
| `PUT`    | `/api/secrets/:key`    | `{ value }`                                 | The key's entry after it is set. Its line is replaced in place, or appended; every other line and comment stays.                                                                                                                         |
| `DELETE` | `/api/secrets/:key`    | none                                        | The key's entry after its line is removed.                                                                                                                                                                                               |
| `GET`    | `/api/models/profiles` | none                                        | One `{ provider, model, envVar, capabilities: { vision, tools, structuredOutput, efforts }, price }` per tested built-in profile in `src/agent/llm/profiles.ts`.                                                                         |
| `POST`   | `/api/models/test`     | `{ provider, model, baseUrl?, apiKeyEnv? }` | `{ ok, status, latencyMs, message, modelListed }` from one models-list request to the provider, which costs no tokens. See [Model Connection Test](#model-connection-test).                                                              |

`validation` is `{ ok: true, summary }` with the pack's id, name, moods, default mood and stable prompt tokens per
memory mode, or `{ ok: false, problems }`. `candidates` lists `characters/<id>` for each folder under `characters/`
that holds a `character.yml`.

### Pack File Rules

- **Edit:** any file `GET /api/pack` lists.
- **Create and Delete:** only a pack prompt, `<pack>/prompts/<name>.md` or `<pack>/prompts/moods/<name>.md`, with `<name>` matching `^[a-z0-9][a-z0-9-]{0,47}$`. A YAML file or a harness prompt can be edited but never created or deleted.

### Model Connection Test

`provider` is `gemini`, `anthropic`, `openai`, `modelscope` or `openai-compatible`. `baseUrl` must be `http` or
`https`; it is required for `openai-compatible` and ignored for `gemini`, as the bot ignores it. `apiKeyEnv` names the
key variable of an `openai-compatible` server, matching `^[A-Z][A-Z0-9_]*$`; leave it out for a keyless server.

| Provider            | Key Variable         | Request                                                          |
| ------------------- | -------------------- | ---------------------------------------------------------------- |
| `gemini`            | `GEMINI_API_KEY`     | `GET https://generativelanguage.googleapis.com/v1beta/models`    |
| `anthropic`         | `ANTHROPIC_API_KEY`  | `GET {baseUrl or https://api.anthropic.com}/v1/models`           |
| `openai`            | `OPENAI_API_KEY`     | `GET {baseUrl or https://api.openai.com/v1}/models`              |
| `modelscope`        | `MODELSCOPE_API_KEY` | `GET {baseUrl or https://api-inference.modelscope.ai/v1}/models` |
| `openai-compatible` | `apiKeyEnv`, if any  | `GET {baseUrl}/models`                                           |

The key is read as the bot reads it: a variable set in the shell first, then `.env`. It is sent in a header and never
returned or logged. The request times out after 10 s. `modelListed` is `null` when the answer is not a models list or
more pages follow. `message` is one sentence, such as `Connected in 412 ms; qwen3:32b is listed.` or
`The server answered 401: check ANTHROPIC_API_KEY.`; a provider's own error text in it is cut to 200 characters, with
the key masked.

## Errors

A failure returns `{ error: { file, path, message } }`. For a pack problem, `file` and `path` name the file and the
YAML path; for a config problem, `file` is the config file and `path` is the dotted key when the loader names one, as
in `Config value llm.models.local.baseUrl ...`. `message` is the loader's own text, and a field that does not apply is
`null`. A pack failure also lists every problem in `problems`, since the loader reports them all at once.

| Status | Meaning                                                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | A malformed body, query or key.                                                                                                                                  |
| 401    | The `X-Studio-Token` header is missing or wrong.                                                                                                                 |
| 403    | The request came from another origin or named another host.                                                                                                      |
| 404    | No such endpoint or file, a file outside the allow-list for that change, a pack that is not a candidate, or a key not in `.env`.                                 |
| 405    | The method is not allowed on that path.                                                                                                                          |
| 409    | No pack is loaded (`code: 'no_pack'`, with `configured` and `candidates`), the new pack's folder exists, or `CHARACTER_DIR` is set, which outranks `character:`. |
| 413    | The body is over 1 MB.                                                                                                                                           |
| 422    | The bot's validation rejected the change. Nothing was written.                                                                                                   |
| 503    | The UI is not built.                                                                                                                                             |

## Security Model

- **Local Only:** the server binds to `127.0.0.1`, never to a public interface.
- **Session Token:** a random token is made at each start, or taken from `STUDIO_TOKEN`, and printed once in the URL fragment. Every `/api` request must send it in `X-Studio-Token`; it is compared in constant time. The UI's own files need no token.
- **Host Check:** every request, UI files included, must name `127.0.0.1:<port>` or `localhost:<port>` as its host, so a DNS-rebound page cannot reach the studio.
- **Origin Check:** a request with an `Origin` header other than `http://127.0.0.1:<port>` or `http://localhost:<port>` is refused, so another website open in your browser cannot call the API.
- **Security Headers:** every response carries a strict `Content-Security-Policy` (only the studio's own scripts, styles, fonts and API), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`.
- **UI Files:** only files inside the UI folder are served; a dot-file, a symlink or a path that leaves the folder is not found.
- **Allow-List:** only the pack's four YAML files, its `prompts/**/*.md` and the harness `prompts/*.md` can be read or written, matched exactly by path. A symlinked prompt is not listed, a new prompt is refused under a symlinked folder, and a save replaces a file rather than writing through a link, so no write lands outside those folders.
- **Atomic Writes:** a save goes to a temp file in the same folder and is renamed over the original, so the bot never reads half a file.
- **Body Cap:** a JSON body over 1 MB is refused.
- **Secrets Stay Masked:** no response, error or log line holds a full secret. `masked` shows at most the last four characters, and only for a value of 12 characters or more. Keys must match `^[A-Z][A-Z0-9_]*$`, and a value must be a single line.

## Source Files

- `studio/server/main.ts`, `studio/server/browser.ts`: start-up, port, token and opening the browser.
- `studio/server/app.ts`: routing, token, host and origin checks, and the current pack.
- `studio/server/static.ts`: the built UI.
- `studio/server/pack.ts`, `studio/server/schemas.ts`: pack files, validation, preview and JSON Schema.
- `studio/server/packs.ts`: pack candidates, switching and creating from `studio/template/`.
- `studio/server/configFile.ts`, `studio/server/checkConfig.ts`: `config.yml` and the child-process check.
- `studio/server/secrets.ts`: `.env` listing, masking and edits.
- `studio/server/models.ts`: model profiles and the connection test.
- `studio/server/__tests__/app.test.ts`, `studio/server/__tests__/main.test.ts`
