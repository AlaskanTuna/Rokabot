"""Speech-to-text HTTP sidecar: Silero VAD -> SenseVoice language ID -> Moonshine (English) or SenseVoice."""

from __future__ import annotations

import io
import json
import math
import os
import re
import sys
import threading
import time
import traceback
import wave
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import NamedTuple, Sequence
from urllib.parse import parse_qs, urlparse

import numpy as np

MODELS_DIR = "/models"
SAMPLE_RATE = 16000
MAX_BODY_BYTES = 12 * 1024 * 1024
DEFAULT_MAX_SPEECH_SEC = 120.0
MIN_MAX_SPEECH_SEC = 10.0
MAX_MAX_SPEECH_SEC = 600.0
LID_SPEECH_SEC = 15.0
KNOWN_LANGUAGES = ("en", "zh", "ja", "ko", "yue")
TAG_RE = re.compile(r"<\|.*?\|>")
VAD_WINDOW = 512
DECODE_BATCH = 4


class Segment(NamedTuple):
    start: float
    end: float
    samples: np.ndarray | None = None

    @property
    def duration(self) -> float:
        return self.end - self.start


class WavError(ValueError):
    pass


class Engines(NamedTuple):
    vad_config: object
    sensevoice: object
    moonshine: object


def select_segments(segments: Sequence[Segment], max_speech_sec: float) -> list[Segment]:
    """Keep time-ordered segments within the speech budget, spread across the clip.

    Segments are visited coarse to fine (every n-th, then the midpoints, then the quarter points, ...),
    so whatever fits the budget is spread evenly over the clip. A single segment longer than the budget
    is still kept, so a non-empty clip never yields nothing.
    """
    if sum(s.duration for s in segments) <= max_speech_sec:
        return list(segments)
    n = len(segments)
    order: list[int] = []
    seen: set[int] = set()
    step = 1 << (n - 1).bit_length()
    while step >= 1:
        for i in range(0, n, step):
            if i not in seen:
                seen.add(i)
                order.append(i)
        step //= 2
    chosen: list[int] = []
    used = 0.0
    for i in order:
        duration = segments[i].duration
        if not chosen or used + duration <= max_speech_sec:
            chosen.append(i)
            used += duration
    return [segments[i] for i in sorted(chosen)]


def read_wav(data: bytes) -> np.ndarray:
    try:
        with wave.open(io.BytesIO(data), "rb") as wav:
            channels, width, rate = wav.getnchannels(), wav.getsampwidth(), wav.getframerate()
            if (channels, width, rate) != (1, 2, SAMPLE_RATE):
                raise WavError(
                    f"expected 16 kHz mono 16-bit PCM WAV, got {rate} Hz, {channels} channel(s), {width * 8}-bit"
                )
            frames = wav.readframes(wav.getnframes())
    except (wave.Error, EOFError) as exc:
        raise WavError("body is not a valid PCM WAV file") from exc
    return np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0


def clean_text(text: str) -> str:
    return " ".join(TAG_RE.sub("", text).split())


def language_code(raw: str) -> str:
    return raw.strip().strip("<|>").strip().lower()


def parse_max_speech(query: str) -> float:
    raw = parse_qs(query).get("maxSpeechSec", [None])[0]
    if raw is None:
        return DEFAULT_MAX_SPEECH_SEC
    try:
        value = float(raw)
    except ValueError:
        raise ValueError("maxSpeechSec must be a number") from None
    if not math.isfinite(value):
        raise ValueError("maxSpeechSec must be a finite number")
    return min(max(value, MIN_MAX_SPEECH_SEC), MAX_MAX_SPEECH_SEC)


def load_engines(threads: int) -> Engines:
    import sherpa_onnx

    vad_config = sherpa_onnx.VadModelConfig(
        silero_vad=sherpa_onnx.SileroVadModelConfig(
            model=f"{MODELS_DIR}/silero_vad.onnx",
            threshold=0.5,
            min_silence_duration=0.4,
            min_speech_duration=0.25,
            max_speech_duration=15.0,
            window_size=VAD_WINDOW,
        ),
        sample_rate=SAMPLE_RATE,
        num_threads=1,
        provider="cpu",
    )
    sensevoice = sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=f"{MODELS_DIR}/sensevoice/model.int8.onnx",
        tokens=f"{MODELS_DIR}/sensevoice/tokens.txt",
        num_threads=threads,
        language="auto",
        use_itn=True,
    )
    moonshine = sherpa_onnx.OfflineRecognizer.from_moonshine(
        preprocessor=f"{MODELS_DIR}/moonshine/preprocess.onnx",
        encoder=f"{MODELS_DIR}/moonshine/encode.int8.onnx",
        uncached_decoder=f"{MODELS_DIR}/moonshine/uncached_decode.int8.onnx",
        cached_decoder=f"{MODELS_DIR}/moonshine/cached_decode.int8.onnx",
        tokens=f"{MODELS_DIR}/moonshine/tokens.txt",
        num_threads=threads,
    )
    return Engines(vad_config=vad_config, sensevoice=sensevoice, moonshine=moonshine)


def detect_speech(vad_config: object, samples: np.ndarray) -> list[Segment]:
    import sherpa_onnx

    vad = sherpa_onnx.VoiceActivityDetector(vad_config, buffer_size_in_seconds=len(samples) / SAMPLE_RATE + 1)
    for offset in range(0, len(samples), VAD_WINDOW):
        vad.accept_waveform(samples[offset : offset + VAD_WINDOW])
    vad.flush()
    segments: list[Segment] = []
    while not vad.empty():
        speech = vad.front
        start = speech.start / SAMPLE_RATE
        end = start + len(speech.samples) / SAMPLE_RATE
        segments.append(Segment(start, end, np.asarray(speech.samples, dtype=np.float32)))
        vad.pop()
    return segments


def decode(recognizer: object, clips: list[np.ndarray]) -> list[tuple[str, str]]:
    # ONNX Runtime keeps its arena at the largest batch it has seen, so small batches cap the sidecar's memory.
    results: list[tuple[str, str]] = []
    for offset in range(0, len(clips), DECODE_BATCH):
        streams = []
        for clip in clips[offset : offset + DECODE_BATCH]:
            stream = recognizer.create_stream()
            stream.accept_waveform(SAMPLE_RATE, clip)
            streams.append(stream)
        recognizer.decode_streams(streams)
        results.extend((stream.result.text, stream.result.lang) for stream in streams)
    return results


def transcribe(engines: Engines, samples: np.ndarray, max_speech_sec: float) -> dict:
    segments = detect_speech(engines.vad_config, samples)
    speech_sec = round(sum(s.duration for s in segments), 2)
    if not segments:
        return {"language": "unknown", "engine": "none", "speechSec": speech_sec, "segments": []}

    selected = select_segments(segments, max_speech_sec)
    lid_count = 0
    lid_sec = 0.0
    for segment in selected:
        if lid_count and lid_sec >= LID_SPEECH_SEC:
            break
        lid_sec += segment.duration
        lid_count += 1
    lid_results = decode(engines.sensevoice, [s.samples for s in selected[:lid_count]])

    votes: Counter[str] = Counter()
    for segment, (_, raw_lang) in zip(selected, lid_results):
        code = language_code(raw_lang)
        if code in KNOWN_LANGUAGES:
            votes[code] += segment.duration
    language = votes.most_common(1)[0][0] if votes else "unknown"

    if language == "en":
        engine = "moonshine"
        texts = [text for text, _ in decode(engines.moonshine, [s.samples for s in selected])]
    else:
        engine = "sensevoice"
        rest = decode(engines.sensevoice, [s.samples for s in selected[lid_count:]])
        texts = [text for text, _ in lid_results] + [text for text, _ in rest]

    out = []
    for segment, text in zip(selected, texts):
        cleaned = clean_text(text)
        if cleaned:
            out.append({"start": round(segment.start, 2), "end": round(segment.end, 2), "text": cleaned})
    return {"language": language, "engine": engine, "speechSec": speech_sec, "segments": out}


class SpeechServer(ThreadingHTTPServer):
    def __init__(self, address: tuple[str, int], engines: Engines) -> None:
        super().__init__(address, Handler)
        self.engines = engines
        self.lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = "rokabot-asr"

    def log_message(self, format: str, *args: object) -> None:
        return

    def _send_json(self, status: int, payload: dict, close: bool = False) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if close:
            self.send_header("Connection", "close")
            self.close_connection = True
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            self._send_json(200, {"ok": True})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        url = urlparse(self.path)
        if url.path != "/transcribe":
            self._send_json(404, {"error": "not found"}, close=True)
            return
        started = time.monotonic()
        try:
            max_speech_sec = parse_max_speech(url.query)
        except ValueError as exc:
            self._send_json(400, {"error": str(exc)}, close=True)
            return
        length_header = self.headers.get("Content-Length")
        if length_header is None:
            self._send_json(411, {"error": "Content-Length header is required"}, close=True)
            return
        try:
            length = int(length_header)
        except ValueError:
            self._send_json(400, {"error": "invalid Content-Length"}, close=True)
            return
        if length < 0:
            self._send_json(400, {"error": "invalid Content-Length"}, close=True)
            return
        if length > MAX_BODY_BYTES:
            self._send_json(413, {"error": f"body exceeds {MAX_BODY_BYTES} bytes"}, close=True)
            return
        body = self.rfile.read(length)
        try:
            samples = read_wav(body)
        except WavError as exc:
            self._send_json(400, {"error": str(exc)})
            return
        try:
            with self.server.lock:
                result = transcribe(self.server.engines, samples, max_speech_sec)
        except Exception:
            traceback.print_exc(file=sys.stderr)
            self._send_json(500, {"error": "transcription failed"}, close=True)
            return
        elapsed = time.monotonic() - started
        print(
            f"transcribe duration={len(samples) / SAMPLE_RATE:.2f}s speechSec={result['speechSec']:.2f} "
            f"language={result['language']} engine={result['engine']} elapsed={elapsed:.2f}s",
            flush=True,
        )
        self._send_json(200, result)


def main() -> None:
    port = int(os.environ.get("ASR_PORT", "8000"))
    threads = int(os.environ.get("ASR_THREADS", "3"))
    print(f"loading models from {MODELS_DIR} threads={threads}", flush=True)
    engines = load_engines(threads)
    server = SpeechServer(("0.0.0.0", port), engines)
    print(f"listening on :{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
