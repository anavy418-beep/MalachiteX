#!/usr/bin/env bash
set -euo pipefail

cp .env.example .env || true
pnpm install
pnpm --filter @p2p/api prisma:generate

echo "Bootstrap complete."
