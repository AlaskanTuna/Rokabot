# ASR Sidecar

A small speech-to-text HTTP service for the Discord bot. It runs Silero VAD to find speech, uses SenseVoice to identify the language, then transcribes English with Moonshine and everything else with SenseVoice. It is built on [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) 1.13.8 and targets a Raspberry Pi 5 (arm64) as well as amd64.

## API

### `GET /health`

Returns `200 {"ok": true}` once the models are loaded. The server only starts listening after the models load, so the endpoint is unreachable before that.

### `POST /transcribe?maxSpeechSec=120`

- Body: a WAV file, 16 kHz, mono, 16-bit PCM. Other formats get `400`. Bodies over 12 MiB get `413`. A `Content-Length` header is required (`411` otherwise).
- `maxSpeechSec` is clamped to 10..600 (default 120). When the detected speech exceeds it, the service transcribes an evenly spread subset of segments.

Response (`200`):

```json
{
  "language": "en",
  "engine": "moonshine",
  "speechSec": 63.42,
  "segments": [{ "start": 1.54, "end": 20.83, "text": "..." }]
}
```

- `language` is `en`, `zh`, `ja`, `ko`, `yue`, or `unknown`.
- `engine` is `moonshine`, `sensevoice`, or `none` (no speech found).
- `speechSec` is the total detected speech in the whole clip. Times are seconds from the start of the posted WAV.

Errors return `{"error": "..."}`.

## Configuration

- `ASR_PORT`: listen port (default `8000`).
- `ASR_THREADS`: inference threads per model (default `3`). Requests run one at a time.

## Build and Run

```bash
docker build -t rokabot-asr asr/
docker run --rm -p 8000:8000 rokabot-asr
curl -s -X POST --data-binary @clip.wav -H 'Content-Type: audio/wav' 'http://localhost:8000/transcribe'
```

## Tests

```bash
python -m unittest asr/test_server.py
```

The tests need `numpy` but not the models or `sherpa-onnx`.

## Models and Licences

- Silero VAD: MIT.
- Moonshine English (base, int8): MIT, per the [Moonshine repository](https://github.com/moonshine-ai/moonshine).
- SenseVoice-Small (zh/en/ja/ko/yue): weights are under the [FunASR Model Open Source License Agreement](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE), as stated on the [SenseVoiceSmall model card](https://huggingface.co/FunAudioLLM/SenseVoiceSmall).
- sherpa-onnx runtime: Apache-2.0.
