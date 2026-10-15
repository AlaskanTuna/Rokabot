#!/usr/bin/env bash
# Usage: prune-images.sh <repository> <keep-tag>
# Deletes local <repository>:sha-* images except <keep-tag> and the newest other one, which stays for rollback.
set -euo pipefail
repo="$1"
keep="$2"
kept_previous=""
docker image ls "$repo" --format '{{.Repository}}:{{.Tag}}' | { grep -E ":sha-[0-9a-f]{7}$" || true; } | while read -r ref; do
  tag="${ref##*:}"
  if [ "$tag" = "$keep" ]; then continue; fi
  if [ -z "$kept_previous" ]; then kept_previous="$tag"; continue; fi
  docker rmi "$ref" > /dev/null || echo "Kept $ref: still in use"
done
