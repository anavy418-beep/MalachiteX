CREATE TYPE "PaperOrderSide" AS ENUM ('BUY', 'SELL');
CREATE TYPE "PaperOrderType" AS ENUM ('MARKET');
CREATE TYPE "PaperOrderStatus" AS ENUM ('FILLED');

CREATE TABLE "PaperTradingAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USDT',
  "balanceMinor" BIGINT NOT NULL DEFAULT 0,
  "realizedPnlMinor" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaperTradingAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaperPosition" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "baseAsset" TEXT NOT NULL,
  "quoteAsset" TEXT NOT NULL,
  "quantityAtomic" BIGINT NOT NULL,
  "averageEntryPriceMinor" BIGINT NOT NULL,
  "costBasisMinor" BIGINT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaperPosition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaperOrder" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "side" "PaperOrderSide" NOT NULL,
  "type" "PaperOrderType" NOT NULL DEFAULT 'MARKET',
  "status" "PaperOrderStatus" NOT NULL DEFAULT 'FILLED',
  "quantityAtomic" BIGINT NOT NULL,
  "executedPriceMinor" BIGINT NOT NULL,
  "notionalMinor" BIGINT NOT NULL,
  "realizedPnlMinor" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaperOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaperTradeHistory" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "side" "PaperOrderSide" NOT NULL,
  "quantityAtomic" BIGINT NOT NULL,
  "entryPriceMinor" BIGINT NOT NULL,
  "exitPriceMinor" BIGINT NOT NULL,
  "realizedPnlMinor" BIGINT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaperTradeHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaperTradingAccount_userId_key" ON "PaperTradingAccount"("userId");
CREATE UNIQUE INDEX "PaperPosition_accountId_symbol_key" ON "PaperPosition"("accountId", "symbol");
CREATE INDEX "PaperOrder_accountId_createdAt_idx" ON "PaperOrder"("accountId", "createdAt");
CREATE INDEX "PaperTradeHistory_accountId_closedAt_idx" ON "PaperTradeHistory"("accountId", "closedAt");

ALTER TABLE "PaperTradingAccount"
ADD CONSTRAINT "PaperTradingAccount_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaperPosition"
ADD CONSTRAINT "PaperPosition_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "PaperTradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaperOrder"
ADD CONSTRAINT "PaperOrder_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "PaperTradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaperTradeHistory"
ADD CONSTRAINT "PaperTradeHistory_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "PaperTradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaperTradeHistory"
ADD CONSTRAINT "PaperTradeHistory_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "PaperOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
