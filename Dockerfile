# Stage 1: Build
FROM node:24-alpine AS build

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# Stage 2: Runtime
FROM node:24-alpine

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT
ENV NODE_ENV=production

WORKDIR /app

RUN apk add --no-cache python3 make g++ font-dejavu fontconfig

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force && apk del python3 make g++

ARG TARGETARCH
ARG YTDLP_VERSION=2026.08.19
ARG YTDLP_AMD64_SHA256=a8a9761628be455368db73ab54a2858da22342084f300f7e0d50bdcbef2acf82
ARG YTDLP_ARM64_SHA256=46087f4965f48612d056c6e4b00a0898e8230ba90d709a0a751c7cc5735a1da3
# The onedir zip, not the single-file build: the single file unpacks itself into a temp dir on every run, which
# cost the Pi about 0.6-1.4 s per lookup.
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) asset=yt-dlp_musllinux; expected="$YTDLP_AMD64_SHA256" ;; \
      arm64) asset=yt-dlp_musllinux_aarch64; expected="$YTDLP_ARM64_SHA256" ;; \
      *) echo "Unsupported yt-dlp architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/yt-dlp/yt-dlp/releases/download/$YTDLP_VERSION"; \
    wget -q -O /tmp/SHA2-256SUMS "$base/SHA2-256SUMS"; \
    release_sha256="$(awk -v asset="$asset.zip" '$2 == asset { print $1 }' /tmp/SHA2-256SUMS)"; \
    test "$release_sha256" = "$expected"; \
    wget -q -O /tmp/yt-dlp.zip "$base/$asset.zip"; \
    echo "$expected  /tmp/yt-dlp.zip" | sha256sum -c -; \
    mkdir -p /opt/yt-dlp; \
    unzip -q /tmp/yt-dlp.zip -d /opt/yt-dlp; \
    chown -R root:root /opt/yt-dlp; \
    chmod -R a+rX,go-w /opt/yt-dlp; \
    ln -s "/opt/yt-dlp/$asset" /usr/local/bin/yt-dlp; \
    rm /tmp/yt-dlp.zip /tmp/SHA2-256SUMS

COPY --from=build /app/dist/ dist/
COPY config.yml ./

USER node

CMD ["node", "dist/index.js"]
