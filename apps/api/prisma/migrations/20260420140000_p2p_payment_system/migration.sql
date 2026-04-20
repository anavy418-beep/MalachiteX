ALTER TABLE "Offer" ADD COLUMN "paymentDetails" JSONB;
ALTER TABLE "Trade" ADD COLUMN "paymentInstructions" JSONB;
ALTER TABLE "Trade" ADD COLUMN "paymentProof" JSONB;
ALTER TABLE "Trade" ADD COLUMN "sellerPaymentConfirmedAt" TIMESTAMP(3);
