# Railway API Deployment

Use package scripts for a predictable monorepo deploy flow.

## Node Runtime (important)

- Pin Railway to Node `20` (LTS), not Node 24.
- If needed, set Railway variable: `NIXPACKS_NODE_VERSION=20`.
- The repo and API package both declare `engines.node: >=20 <23`.

## Build command

```bash
corepack pnpm --filter @p2p/api build
```

## Start command

```bash
corepack pnpm --filter @p2p/api start:prod
```

## Health check

```text
/api/health
```

The API now exposes a public health endpoint:

```json
{ "ok": true, "service": "api", "timestamp": "..." }
```

## Migration note

Do not block runtime startup on `prisma migrate deploy` for demo/presentation environments.
Run migration recovery/deploy as a separate operational step.
