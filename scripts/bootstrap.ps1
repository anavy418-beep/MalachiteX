$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

pnpm install
pnpm --filter @p2p/api prisma:generate

Write-Host "Bootstrap complete."
