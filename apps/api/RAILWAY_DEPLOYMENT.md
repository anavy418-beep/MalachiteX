# Railway API Deployment

Use package scripts for a predictable monorepo deploy flow.

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
