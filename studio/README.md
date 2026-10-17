# Persona Studio

Persona Studio is a local console for configuring the bot end to end: the character pack, `config.yml` and the
secrets in `.env`. It checks every edit with the bot's own validation before it saves anything, so a saved
configuration is one the bot will start with. [PRODUCT.md](PRODUCT.md) is the product brief.

This folder holds the headless part: a JSON API on your own machine. The visual UI follows once its design is
approved; until then, call the API with `curl` or any HTTP client.

## Start It

```bash
npm run studio
```

It prints the URL with a session token, and a note that the UI ships after its design is approved:

```
Persona Studio API at http://127.0.0.1:5174/api with X-Studio-Token: <token>
The Persona Studio UI ships after its design is approved; until then, call this JSON API directly.
```

- **Port:** `STUDIO_PORT`, default `5174`.
- **Secrets File:** `STUDIO_ENV_PATH`, default `.env` at the repo root.
- **Pack:** the one the bot would load: `CHARACTER_DIR`, else `character:` in `config.yml`, else `characters/roka`. Restart the studio after you switch packs.
- **Config File:** `ROKABOT_CONFIG_PATH`, default `config.yml` at the repo root.
- **Applying a Change:** a save writes the file. Restart the bot to load it.

```bash
curl -H "X-Studio-Token: <token>" "http://127.0.0.1:5174/api/preview?mood=playful&hour=21&memory=full"
```

## API

Every path is under `/api`. Request and response bodies are JSON. File paths in requests and responses are relative
to the repo root, for example `characters/roka/moods.yml` or `prompts/boundaries.md`.

| Method   | Path                | Body             | Returns                                                                                                                                                                                                                      |
| -------- | ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/pack`         | none             | `{ dir, harnessDir, files, validation }`. `files` holds `character.yml`, `voice.yml`, `moods.yml`, `lines.yml`, every `prompts/**/*.md` in the pack and every harness `prompts/*.md`, each with `kind`, `locked` and `text`. |
| `PUT`    | `/api/pack/file`    | `{ path, text }` | `{ path, validation }` after a save. The whole pack is loaded from a scratch copy with the change applied first; on a problem nothing is written.                                                                            |
| `GET`    | `/api/preview`      | none             | `{ prompt, tokens, stableTokens }` for `mood`, `hour` (0 to 23), `memory` (`full`, `forget` or `none`) and `user`, read from the pack on disk now. An unknown mood returns 400 with `moods`.                                 |
| `GET`    | `/api/schema`       | none             | A JSON Schema per pack file, keyed `character.yml`, `voice.yml`, `moods.yml` and `lines.yml`.                                                                                                                                |
| `GET`    | `/api/config`       | none             | `{ path, text }` of `config.yml`.                                                                                                                                                                                            |
| `PUT`    | `/api/config`       | `{ text }`       | `{ path, ok }` after a save. The bot's config loader and pack loader run first in a child process on a scratch copy, with the current `.env`; on a problem nothing is written.                                               |
| `GET`    | `/api/secrets`      | none             | One `{ key, set, masked, inExample }` per key in `.env.example`, commented-out ones included, then per extra key in `.env`.                                                                                                  |
| `PUT`    | `/api/secrets/:key` | `{ value }`      | The key's entry after it is set. Its line is replaced in place, or appended; every other line and comment stays.                                                                                                             |
| `DELETE` | `/api/secrets/:key` | none             | The key's entry after its line is removed.                                                                                                                                                                                   |

`validation` is `{ ok: true, summary }` with the pack's id, name, moods, default mood and stable prompt tokens per
memory mode, or `{ ok: false, problems }`.

## Errors

A failure returns `{ error: { file, path, message } }`. For a pack problem, `file` and `path` name the file and the
YAML path; for a config problem, `file` is the config file. `message` is the loader's own text, and a field that does
not apply is `null`. A pack failure also lists every problem in `problems`, since the loader reports them all at once.

| Status | Meaning                                                                  |
| ------ | ------------------------------------------------------------------------ |
| 400    | A malformed body, query or key.                                          |
| 401    | The `X-Studio-Token` header is missing or wrong.                         |
| 403    | The request came from another origin.                                    |
| 404    | No such endpoint, a file outside the allow-list, or a key not in `.env`. |
| 413    | The body is over 1 MB.                                                   |
| 422    | The bot's validation rejected the change. Nothing was written.           |

## Security Model

- **Local Only:** the server binds to `127.0.0.1`, never to a public interface.
- **Session Token:** a random token is made at each start and printed once. Every `/api` request must send it in `X-Studio-Token`; it is compared in constant time.
- **Origin Check:** a request with an `Origin` header other than `http://127.0.0.1:<port>` or `http://localhost:<port>` is refused, so another website open in your browser cannot call the API.
- **Allow-List:** only the pack's four YAML files, its `prompts/**/*.md` and the harness `prompts/*.md` can be read or written, matched exactly by path. A symlinked prompt is not listed, and a save replaces a file rather than writing through a link, so no write lands outside those folders.
- **Atomic Writes:** a save goes to a temp file in the same folder and is renamed over the original, so the bot never reads half a file.
- **Body Cap:** a JSON body over 1 MB is refused.
- **Secrets Stay Masked:** no response, error or log line holds a full secret. `masked` shows at most the last four characters, and only for a value of 12 characters or more. Keys must match `^[A-Z][A-Z0-9_]*$`, and a value must be a single line.

## Source Files

- `studio/server/main.ts`: start-up, port and token.
- `studio/server/app.ts`: routing, token and origin checks.
- `studio/server/pack.ts`, `studio/server/schemas.ts`: pack files, validation, preview and JSON Schema.
- `studio/server/configFile.ts`, `studio/server/checkConfig.ts`: `config.yml` and the child-process check.
- `studio/server/secrets.ts`: `.env` listing, masking and edits.
- `studio/server/__tests__/app.test.ts`
