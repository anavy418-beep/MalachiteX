CREATE TYPE "PaperPositionType" AS ENUM ('LONG', 'SHORT');

ALTER TYPE "PaperOrderType" ADD VALUE IF NOT EXISTS 'LIMIT';
ALTER TYPE "PaperOrderStatus" ADD VALUE IF NOT EXISTS 'OPEN';
ALTER TYPE "PaperOrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "PaperPosition"
ADD COLUMN "type" "PaperPositionType" NOT NULL DEFAULT 'LONG',
ADD COLUMN "leverage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "marginMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "liquidationPriceMinor" BIGINT,
ADD COLUMN "stopLossPriceMinor" BIGINT,
ADD COLUMN "takeProfitPriceMinor" BIGINT;

UPDATE "PaperPosition"
SET "marginMinor" = "costBasisMinor"
WHERE "marginMinor" = 0;

ALTER TABLE "PaperOrder"
ADD COLUMN "positionType" "PaperPositionType" NOT NULL DEFAULT 'LONG',
ADD COLUMN "leverage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "limitPriceMinor" BIGINT,
ADD COLUMN "reservedMarginMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "stopLossPriceMinor" BIGINT,
ADD COLUMN "takeProfitPriceMinor" BIGINT,
ADD COLUMN "triggerReason" TEXT,
ADD COLUMN "filledAt" TIMESTAMP(3);

UPDATE "PaperOrder"
SET "filledAt" = "createdAt"
WHERE "status" = 'FILLED' AND "filledAt" IS NULL;

ALTER TABLE "PaperOrder"
ALTER COLUMN "executedPriceMinor" DROP NOT NULL,
ALTER COLUMN "notionalMinor" SET DEFAULT 0;

ALTER TABLE "PaperTradeHistory"
ADD COLUMN "positionType" "PaperPositionType" NOT NULL DEFAULT 'LONG',
ADD COLUMN "leverage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "closeReason" TEXT;
