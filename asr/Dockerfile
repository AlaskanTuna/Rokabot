# syntax=docker/dockerfile:1

FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1 AS models

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates bzip2 \
 && rm -rf /var/lib/apt/lists/*

ARG RELEASE=https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models

RUN mkdir -p /models/sensevoice /models/moonshine /tmp/dl \
 && curl -fsSL --retry 5 --retry-all-errors --retry-delay 5 -o /models/silero_vad.onnx "${RELEASE}/silero_vad.onnx" \
 && curl -fsSL --retry 5 --retry-all-errors --retry-delay 5 -o /tmp/dl/sensevoice.tar.bz2 "${RELEASE}/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2" \
 && tar -xjf /tmp/dl/sensevoice.tar.bz2 -C /tmp/dl \
 && cp /tmp/dl/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/model.int8.onnx /tmp/dl/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/tokens.txt /models/sensevoice/ \
 && rm -rf /tmp/dl/* \
 && curl -fsSL --retry 5 --retry-all-errors --retry-delay 5 -o /tmp/dl/moonshine.tar.bz2 "${RELEASE}/sherpa-onnx-moonshine-base-en-int8.tar.bz2" \
 && tar -xjf /tmp/dl/moonshine.tar.bz2 -C /tmp/dl \
 && cp /tmp/dl/sherpa-onnx-moonshine-base-en-int8/preprocess.onnx \
       /tmp/dl/sherpa-onnx-moonshine-base-en-int8/encode.int8.onnx \
       /tmp/dl/sherpa-onnx-moonshine-base-en-int8/uncached_decode.int8.onnx \
       /tmp/dl/sherpa-onnx-moonshine-base-en-int8/cached_decode.int8.onnx \
       /tmp/dl/sherpa-onnx-moonshine-base-en-int8/tokens.txt \
       /models/moonshine/ \
 && rm -rf /tmp/dl \
 && chmod -R a+rX /models


FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN pip install --no-cache-dir sherpa-onnx==1.13.8 numpy==2.5.3

RUN useradd --uid 10001 --home-dir /app --shell /usr/sbin/nologin asr

COPY --from=models /models /models
WORKDIR /app
COPY server.py /app/server.py

USER asr
ENV ASR_PORT=8000 \
    ASR_THREADS=3
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD ["python", "-c", "import os, urllib.request as u; u.urlopen('http://127.0.0.1:' + os.environ.get('ASR_PORT', '8000') + '/health', timeout=4)"]

CMD ["python", "-u", "server.py"]
