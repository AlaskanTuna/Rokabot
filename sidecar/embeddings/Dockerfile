# syntax=docker/dockerfile:1

# Debian, not Alpine: the onnxruntime-node binaries need glibc.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

FROM ${NODE_IMAGE} AS build
WORKDIR /app
# The CPU binaries ship inside the npm package; skip the optional GPU download.
ENV ONNXRUNTIME_NODE_INSTALL=skip
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build && npm prune --omit=dev

FROM ${NODE_IMAGE} AS model
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ARG MODEL=Xenova/multilingual-e5-small
ARG REVISION=761b726dd34fb83930e26aab4e9ac3899aa1fa78
COPY model.sha256 /tmp/model.sha256
RUN set -eu; \
    dir="/models/$MODEL"; \
    mkdir -p "$dir/onnx"; \
    for file in config.json tokenizer.json tokenizer_config.json special_tokens_map.json onnx/model_quantized.onnx; do \
      curl -fsSL --retry 5 --retry-all-errors --retry-delay 5 -o "$dir/$file" \
        "https://huggingface.co/$MODEL/resolve/$REVISION/$file"; \
    done; \
    cd "$dir"; \
    sha256sum -c /tmp/model.sha256; \
    chmod -R a+rX /models

FROM ${NODE_IMAGE}
ARG MODEL=Xenova/multilingual-e5-small
ARG REVISION=761b726dd34fb83930e26aab4e9ac3899aa1fa78
ENV NODE_ENV=production \
    EMBEDDINGS_PORT=8080 \
    EMBEDDINGS_MODEL=$MODEL \
    EMBEDDINGS_REVISION=$REVISION \
    EMBEDDINGS_MODEL_DIR=/models
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/dist/ dist/
COPY --from=model /models /models
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.EMBEDDINGS_PORT || 8080) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
