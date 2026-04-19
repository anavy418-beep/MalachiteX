# AGENTS.md

## Mission
Build and maintain a secure, demo-ready custodial wallet + P2P marketplace MVP with strict financial correctness, strong architecture boundaries, and production-minded defaults.

## Non-Negotiable Engineering Rules

### 1) Language and stack discipline
- Use TypeScript only across frontend, backend, scripts, and shared packages.
- Do not introduce JavaScript files for application logic unless explicitly approved for tooling constraints.

### 2) Money safety rules
- Never use floating-point values for financial amounts.
- Represent money using integer minor units (`BigInt` / integer) or decimal-safe strategy already approved for the module.
- Never convert financial calculations to `number` when precision can be lost.

### 3) Ledger-first wallet accounting
- All wallet balance changes must be recorded via ledger entries.
- Never directly mutate balances without corresponding ledger records.
- Wallet state must be derivable/auditable from ledger history.

### 4) Escrow correctness
- Escrow hold/release/refund operations must be transactional.
- Trade state updates and escrow balance changes must happen atomically.
- Escrow transitions must always be auditable.

### 5) Data access boundaries
- Use Prisma service layer only.
- No direct database access from controllers.
- Controllers must stay thin: parse input, call service, return response.

### 6) Validation and authorization
- DTO validation is required for all external inputs (REST, websocket payloads where applicable).
- Use RBAC for admin-only routes.
- Deny by default; grant only required permissions.

### 7) Auditing and traceability
- All critical actions must write audit logs.
- Critical actions include: auth events, wallet mutations, offer/trade transitions, escrow actions, dispute resolutions, admin decisions.

### 8) Testing requirements
- Add unit tests for auth, wallet, trades, and escrow logic.
- Tests must cover success paths and key failure/guard paths.
- Financial and transactional logic must have regression-oriented tests.

### 9) Service design and modularity
- Prefer small reusable services with single clear responsibilities.
- Use descriptive file names and domain-based module structure.
- Keep business rules centralized in services, not duplicated across controllers.

### 10) Secrets and configuration hygiene
- Use environment variables for secrets and sensitive config.
- Avoid hardcoded secrets in source code, tests, and docs.
- Provide safe `.env.example` placeholders only.

### 11) Token/cookie security defaults
- Follow secure defaults for cookies/tokens:
  - Short-lived access tokens.
  - Rotatable refresh tokens.
  - `HttpOnly`, `Secure`, `SameSite` cookies when cookie transport is used.
  - Strong signing secrets and explicit expiry.

### 12) UI quality baseline
- Keep the UI responsive and clean.
- Ensure core flows work on desktop and mobile breakpoints.
- Favor clarity, accessibility, and stable form/error handling over visual complexity.

## Architectural Guardrails
- Keep domain boundaries explicit: `auth`, `users`, `wallet`, `offers`, `trades`, `chat`, `disputes`, `admin`, `audit`, `notifications`.
- Shared contracts/types belong in shared packages.
- Cross-domain interactions should go through service APIs, not controller-to-controller coupling.
- Prefer explicit interfaces and typed return shapes for critical services.

## Definition of Done (MVP)
A task is done only when all are true:
- Type-safe implementation completed.
- DTO validation + authorization applied.
- Audit logging added for critical action paths.
- Tests added/updated for impacted auth/wallet/trade/escrow logic.
- No precision loss in financial logic.
- No controller-level DB access introduced.
- Docs/config updated if behavior or env requirements changed.

## Build order priority for 1-day MVP
1. auth
2. user profile
3. wallet ledger
4. offers
5. trades
6. escrow
7. chat
8. dispute
9. admin
10. audit logs
