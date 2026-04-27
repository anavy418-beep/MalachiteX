# Xorviqa MVP

Turbo-style monorepo for a demo-ready, semi-production, production-style MVP of a crypto wallet + P2P platform.

## Node Version

- Required Node major: `20` (LTS).
- Local version hints are pinned in root `.nvmrc` and `.node-version`.
- Workspace `engines.node` is set to `>=20 <23` (root, API, and web package manifests).
- Vercel and Railway should use Node 20 by honoring these engine constraints.
- Vercel: set Project Settings -> Node.js Version to `20.x` (and keep `apps/web/package.json` engines in sync).
- Railway: set `NIXPACKS_NODE_VERSION=20` if the platform does not auto-detect from `engines`.

## Monorepo Structure (with folder comments)

```text
p2p-market/
  apps/                         # Deployable applications
    web/                        # Next.js frontend app (App Router)
      app/                      # Route segments, pages, layouts
      components/               # App-specific UI components
      lib/                      # Shared frontend helpers/utilities
      hooks/                    # Reusable React hooks
      store/                    # Client state layer (store contracts)
      services/                 # API service wrappers and integrations
      types/                    # Web-only TypeScript types
      middleware.ts             # Next middleware entrypoint
    api/                        # NestJS backend app
      src/
        main.ts                 # Nest bootstrap
        app.module.ts           # Root module composition
        common/                 # Cross-cutting concerns (guards, decorators, interceptors)
        config/                 # Env/config loading + validation
        modules/                # Domain modules
          auth/                 # Signup/login/refresh/forgot-reset
          users/                # User profile/dashboard endpoints
          wallet/               # Ledger-backed balances and withdrawals
          offers/               # P2P offer creation/listing
          trades/               # Trade lifecycle + escrow transitions
          chat/                 # Trade chat handlers + realtime bridges
          disputes/             # Dispute opening/resolution
          admin/                # Admin moderation/ops endpoints
          audit/                # Audit log capture service
          notifications/        # In-app notifications
        prisma/                 # Prisma integration boundary in app source
      test/                     # API tests
  packages/                     # Shared packages used by apps
    ui/                         # Reusable UI primitives/components
    types/                      # Shared contracts and DTO-like types
    config/                     # Shared TypeScript/base config presets
  infra/                        # Infrastructure assets
    docker/                     # Docker compose and container-related files
    nginx/                      # Reverse proxy configs
  docs/                         # Architecture/ops/product documentation
  prisma/                       # Root-level Prisma workspace placeholders
  scripts/                      # Repo automation scripts (bootstrap/dev helpers)
  AGENTS.md                     # Collaboration and repository working conventions
  README.md                     # Repo overview and usage guide
  package.json                  # Root workspace manifest
  turbo.json                    # Turborepo task pipeline config
  pnpm-workspace.yaml           # pnpm workspace package globs
  .env.example                  # Environment variable template
```

## What Was Added As Starter Content
- Missing scaffold directories from your required structure (`infra`, `docs`, root `prisma`, `scripts`, `apps/web` subfolders, `apps/api/src/config`, `apps/api/src/prisma`).
- Placeholder config/docs/scripts files so every major folder is immediately discoverable.
- Middleware and starter hook/service/store/types files in `apps/web`.
- Starter config files in `apps/api/src/config`.

## Quick Start
1. Copy env file
```powershell
Copy-Item .env.example .env
Copy-Item .env apps/api/.env -Force
@"
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
NEXT_PUBLIC_API_SOCKET_URL=http://localhost:4000
"@ | Set-Content apps/web/.env.local
```

2. Install dependencies
```powershell
pnpm install
```

3. Prepare database schema (run from API app)
```powershell
cd apps/api
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
cd ../..
```

4. Run API
```powershell
cd apps/api
pnpm start:dev
```

5. Run Web
```powershell
cd apps/web
pnpm dev
```

6. Run both apps from root (optional)
```powershell
pnpm dev
```

## Build Commands
- Frontend build
```powershell
cd apps/web
pnpm build
```

- Backend build
```powershell
cd apps/api
pnpm build
```

- Root build
```powershell
cd ../..
pnpm build
```

## Key Routes To Verify
- Landing: `http://localhost:3000`
- Login: `http://localhost:3000/login`
- Signup: `http://localhost:3000/signup`
- Dashboard: `http://localhost:3000/dashboard`
- Wallet: `http://localhost:3000/wallet`
- Wallet Deposit: `http://localhost:3000/wallet/deposit`
- Wallet Withdraw: `http://localhost:3000/wallet/withdraw`
- Wallet History: `http://localhost:3000/wallet/history`
- API Docs: `http://localhost:4000/api/docs`

## Notes
- Existing API and web implementation files were kept intact and extended with missing scaffold files.
- Current canonical Prisma runtime schema is `apps/api/prisma/schema.prisma`.
- Root `prisma/schema.prisma` is intentionally a placeholder. Use API package Prisma commands for runtime setup.
- If PowerShell blocks `pnpm` with an execution-policy error, run this once (no admin needed): `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## MVP Safety Disclaimer
- This project is a demo/staging MVP and is **not** safe for real-money production trading.
- Deposit/withdraw flows are intentionally mocked or approval-based.
- Security, compliance, and infrastructure hardening are intentionally incomplete for a 1-day build scope.
