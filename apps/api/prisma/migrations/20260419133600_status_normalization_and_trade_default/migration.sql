-- Normalize legacy statuses into canonical lifecycle values.
UPDATE "Offer"
SET "status" = 'ARCHIVED'
WHERE "status" = 'CLOSED';

UPDATE "Trade"
SET "status" = 'OPEN'
WHERE "status" = 'PENDING_PAYMENT';

UPDATE "Trade"
SET "status" = 'PAYMENT_SENT'
WHERE "status" = 'PAID';

UPDATE "Trade"
SET "status" = 'COMPLETED'
WHERE "status" = 'RELEASED';

UPDATE "Trade"
SET "status" = 'CANCELLED'
WHERE "status" = 'CANCELED';

ALTER TABLE "Trade"
ALTER COLUMN "status" SET DEFAULT 'OPEN';
