import * as bcrypt from "bcrypt";
import { PrismaClient, Role, OfferType, LedgerEntryType } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = value.replace(/^['"]|['"]$/g, "");
  }
}

loadEnv(resolve(process.cwd(), ".env"));
loadEnv(resolve(process.cwd(), "../../.env"));

const prisma = new PrismaClient();

async function ensureWalletWithSeedBalance(userId: string, amountMinor: bigint, currency = "INR") {
  const wallet = await prisma.wallet.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      currency,
      availableBalanceMinor: BigInt(0),
      escrowBalanceMinor: BigInt(0),
    },
  });

  if (amountMinor > BigInt(0)) {
    const nextAvailable = wallet.availableBalanceMinor + amountMinor;

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { availableBalanceMinor: nextAvailable },
    });

    await prisma.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        userId,
        type: LedgerEntryType.DEPOSIT,
        availableDeltaMinor: amountMinor,
        escrowDeltaMinor: BigInt(0),
        balanceAfterAvailableMinor: nextAvailable,
        balanceAfterEscrowMinor: wallet.escrowBalanceMinor,
        referenceType: "Seed",
      },
    });
  }

  return wallet;
}

async function main() {
  const defaultPasswordHash = await bcrypt.hash("Password@123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@p2p.local" },
    update: {},
    create: {
      email: "admin@p2p.local",
      username: "admin",
      passwordHash: defaultPasswordHash,
      role: Role.ADMIN,
    },
  });

  const alice = await prisma.user.upsert({
    where: { email: "alice@p2p.local" },
    update: {},
    create: {
      email: "alice@p2p.local",
      username: "alice",
      passwordHash: defaultPasswordHash,
      role: Role.USER,
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@p2p.local" },
    update: {},
    create: {
      email: "bob@p2p.local",
      username: "bob",
      passwordHash: defaultPasswordHash,
      role: Role.USER,
    },
  });

  await ensureWalletWithSeedBalance(admin.id, BigInt(500000));
  await ensureWalletWithSeedBalance(alice.id, BigInt(1500000));
  await ensureWalletWithSeedBalance(bob.id, BigInt(1200000));

  await prisma.offer.upsert({
    where: { id: "seed-offer-alice-sell-usdt" },
    update: {},
    create: {
      id: "seed-offer-alice-sell-usdt",
      userId: alice.id,
      type: OfferType.SELL,
      asset: "USDT",
      fiatCurrency: "INR",
      priceMinor: BigInt(8500),
      minAmountMinor: BigInt(10000),
      maxAmountMinor: BigInt(250000),
      paymentMethod: "UPI",
      terms: "Payment within 15 minutes.",
    },
  });

  await prisma.offer.upsert({
    where: { id: "seed-offer-bob-buy-usdt" },
    update: {},
    create: {
      id: "seed-offer-bob-buy-usdt",
      userId: bob.id,
      type: OfferType.BUY,
      asset: "USDT",
      fiatCurrency: "INR",
      priceMinor: BigInt(8400),
      minAmountMinor: BigInt(5000),
      maxAmountMinor: BigInt(200000),
      paymentMethod: "IMPS",
      terms: "Bank transfer only.",
    },
  });

  console.log("Seed complete.");
  console.log("Admin login: admin@p2p.local / Password@123");
  console.log("Trader login: alice@p2p.local / Password@123");
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
