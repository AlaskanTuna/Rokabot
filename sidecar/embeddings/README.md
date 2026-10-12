# Embedding Sidecar

A small HTTP service that turns memory text into vectors for the bot when `embeddings.provider` is `local`. It runs
[Transformers.js](https://github.com/huggingface/transformers.js) 4.3.0 on `onnxruntime-node` 1.30.0 with
`Xenova/multilingual-e5-small` (q8, 384 dimensions), baked into the image at revision `761b726d`. It targets a
Raspberry Pi 5 (arm64) as well as amd64. The image is Debian-based because the native ONNX runtime needs glibc.

## API

### `GET /health`

Returns `200 {"ok": true, "model": "...", "dim": 384}`. The server listens only after the model has loaded and answered
one warm-up request, so the endpoint is unreachable before that.

### `POST /embed`

- Body: `{"texts": string[], "role": "document" | "query"}`, with 1 to 4 texts and at most 1 MiB. Other bodies get `400`; larger ones get `413`.
- Each text gets the E5 prefix for its role (`passage: ` or `query: `), then mean pooling and L2 normalisation.
- Texts past 512 tokens are truncated. `truncated` reports which ones, and the sidecar logs the token count, never the text.
- Requests run one at a time on one inference thread.

Response (`200`):

```json
{ "model": "Xenova/multilingual-e5-small@761b726d-q8", "dim": 384, "vectors": [[0.01]], "truncated": [false] }
```

`model` names the repository, the first eight characters of the revision and the quantisation. The bot stores it with
every vector and compares only vectors with the same `model`, so a build with another revision starts a new embedding
space. Errors return `{"error": "..."}`.

## Configuration

- `EMBEDDINGS_PORT`: listen port (default `8080`).
- `EMBEDDINGS_MODEL`, `EMBEDDINGS_REVISION`, `EMBEDDINGS_MODEL_DIR`: set by the image. Change them only together with the `Dockerfile` build arguments and `model.sha256`.

Remote downloads are disabled at runtime. The build fetches the model files once from the pinned revision and checks
them against `model.sha256`; a mismatch fails the build.

## Build and Run

```bash
docker build -t rokabot-embeddings sidecar/embeddings
docker run --rm -p 8080:8080 rokabot-embeddings
curl -s -X POST -H 'content-type: application/json' -d '{"texts":["We planned a picnic."],"role":"document"}' http://localhost:8080/embed
```

In the stack it runs as the `embeddings` service under the compose profile `local-embeddings`. The bot reaches it at
`http://embeddings:8080`.

## Tests

`npm test` in the repository root runs `src/__tests__/` with a stubbed pipeline. It downloads no model.

## Smoke Test

With the container running, `npx tsx sidecar/embeddings/scripts/smoke.ts http://localhost:8080` checks the real model:
dimensions, unit norms, a related passage outranking an unrelated one, truncation past 512 tokens, and the first
values against `golden.json`. `--record` rewrites `golden.json`. The smoke test is not part of `npm test`.

## Model and Licences

- `intfloat/multilingual-e5-small` (ONNX export `Xenova/multilingual-e5-small`): MIT.
- Transformers.js: Apache-2.0. ONNX Runtime: MIT.
