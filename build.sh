#!/usr/bin/env bash
set -euo pipefail
npm ci --include=optional --no-audit --no-fund
npm run build
