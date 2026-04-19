# Architecture Notes

## Bounded Contexts
- Auth
- Wallet Ledger
- Offers
- Trades + Escrow
- Chat
- Disputes
- Admin
- Audit + Notifications

## Design Principles
- Money in integer minor units only.
- Ledger-backed balance transitions.
- Escrow operations wrapped in DB transactions.
- Every sensitive action creates audit logs.
