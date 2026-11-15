#!/usr/bin/env bash
set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$dir/compose.sh" up -d --build --wait postgres redis
"$dir/compose.sh" run --rm --build --no-deps ingest-once
"$dir/compose.sh" up -d --build api ingestion
