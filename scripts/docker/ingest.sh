#!/usr/bin/env bash
set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$dir/compose.sh" up -d --wait postgres redis
"$dir/compose.sh" run --rm --build --no-deps ingest-once
