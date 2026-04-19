-- Add canonical offer lifecycle value.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OfferStatus' AND e.enumlabel = 'ARCHIVED'
  ) THEN
    ALTER TYPE "OfferStatus" ADD VALUE 'ARCHIVED';
  END IF;
END $$;

-- Add canonical trade lifecycle values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TradeStatus' AND e.enumlabel = 'OPEN'
  ) THEN
    ALTER TYPE "TradeStatus" ADD VALUE 'OPEN';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TradeStatus' AND e.enumlabel = 'PAYMENT_PENDING'
  ) THEN
    ALTER TYPE "TradeStatus" ADD VALUE 'PAYMENT_PENDING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TradeStatus' AND e.enumlabel = 'PAYMENT_SENT'
  ) THEN
    ALTER TYPE "TradeStatus" ADD VALUE 'PAYMENT_SENT';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TradeStatus' AND e.enumlabel = 'RELEASE_PENDING'
  ) THEN
    ALTER TYPE "TradeStatus" ADD VALUE 'RELEASE_PENDING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TradeStatus' AND e.enumlabel = 'COMPLETED'
  ) THEN
    ALTER TYPE "TradeStatus" ADD VALUE 'COMPLETED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TradeStatus' AND e.enumlabel = 'CANCELLED'
  ) THEN
    ALTER TYPE "TradeStatus" ADD VALUE 'CANCELLED';
  END IF;
END $$;

-- Persist wallet identity and deposit coordinates.
ALTER TABLE "Wallet"
ADD COLUMN IF NOT EXISTS "walletIdentifier" TEXT,
ADD COLUMN IF NOT EXISTS "depositAddressBtc" TEXT,
ADD COLUMN IF NOT EXISTS "depositAddressErc20" TEXT,
ADD COLUMN IF NOT EXISTS "depositAddressTrc20" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Wallet_walletIdentifier_key" ON "Wallet"("walletIdentifier");
