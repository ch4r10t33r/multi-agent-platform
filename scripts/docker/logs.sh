#!/usr/bin/env bash
set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ $# -eq 0 ]]; then
  set -- api ingestion
fi
"$dir/compose.sh" logs -f "$@"
