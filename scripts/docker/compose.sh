#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

args=(-f infrastructure/docker/docker-compose.yml -f infrastructure/docker/docker-compose.apps.yml)
if [[ -f .env ]]; then
  args=(--env-file .env "${args[@]}")
fi

docker compose "${args[@]}" "$@"
