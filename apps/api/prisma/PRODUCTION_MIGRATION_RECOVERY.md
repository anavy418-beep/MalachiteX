# Prisma Production Migration Recovery (P3009)

This runbook is for failed migration recovery in production without resetting or deleting data.

## Failed migration
- `20260420140000_p2p_payment_system`

## Root cause pattern
A migration can fail with `P3009` when a prior migration is marked failed in `_prisma_migrations`.
In this case, the SQL was non-idempotent `ADD COLUMN` statements, which can fail if the database is partially updated.

## 1) Check migration status
Run from `apps/api`:

```bash
pnpm prisma migrate status
```

If running from repo root:

```bash
pnpm --filter @p2p/api prisma migrate status
```

## 2) Inspect Prisma migration history

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at, logs
FROM "_prisma_migrations"
WHERE migration_name = '20260420140000_p2p_payment_system';
```

## 3) Inspect target schema state (partial-apply checks)

### Tables
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('Offer', 'Trade')
ORDER BY table_name;
```

### Columns introduced by this migration
```sql
SELECT table_name, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'Offer' AND column_name IN ('paymentDetails')) OR
    (table_name = 'Trade' AND column_name IN ('paymentInstructions', 'paymentProof', 'sellerPaymentConfirmedAt'))
  )
ORDER BY table_name, column_name;
```

### Indexes on affected tables
```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('Offer', 'Trade')
ORDER BY tablename, indexname;
```

### Constraints on affected tables
```sql
SELECT conrelid::regclass AS table_name,
       conname AS constraint_name,
       contype AS constraint_type,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid::regclass::text IN ('"Offer"', '"Trade"')
ORDER BY table_name, constraint_name;
```

## 4) Recovery flow (production-safe)
If migration is failed in Prisma history, mark it rolled back and re-run deploy.

```bash
pnpm prisma migrate resolve --rolled-back "20260420140000_p2p_payment_system"
pnpm prisma migrate deploy
```

From repo root, equivalent:

```bash
pnpm --filter @p2p/api prisma migrate resolve --rolled-back "20260420140000_p2p_payment_system"
pnpm --filter @p2p/api prisma migrate deploy
```

## 5) Important guardrail
Only use `--applied` if the schema is already fully in the expected final state.
For partial-apply states, prefer:
1. make migration SQL idempotent,
2. mark as rolled back,
3. re-run `migrate deploy`.

## 6) Deploy command with better diagnostics
Use:

```bash
pnpm --filter @p2p/api prisma:migrate:deploy
```

This prints migration status before applying migrations, so production failures are easier to diagnose.
