import * as bcrypt from "bcrypt";
import {
  PrismaClient,
  Role,
  OfferType,
  LedgerEntryType,
  NotificationType,
  DepositStatus,
  WithdrawalStatus,
  TradeStatus,
} from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

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

function walletIdentifier(seed: string) {
  const digest = createHash("sha256").update(`wallet:${seed}`).digest("hex").slice(0, 8).toUpperCase();
  return `MLX-USDT-${digest}`;
}

function walletAddress(seed: string, network: "BTC" | "ERC20" | "TRC20") {
  const digest = createHash("sha256").update(`${network}:${seed}`).digest("hex");
  if (network === "BTC") return `bc1q${digest.slice(0, 30)}`;
  if (network === "TRC20") return `T${digest.slice(0, 33)}`;
  return `0x${digest.slice(0, 40)}`;
}

async function postLedgerEntry(params: {
  walletId: string;
  userId: string;
  type: LedgerEntryType;
  availableDeltaMinor: bigint;
  escrowDeltaMinor: bigint;
  referenceType: string;
  referenceId?: string;
}) {
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: params.walletId },
  });

  const nextAvailable = wallet.availableBalanceMinor + params.availableDeltaMinor;
  const nextEscrow = wallet.escrowBalanceMinor + params.escrowDeltaMinor;

  await prisma.wallet.update({
    where: { id: wallet.id },
    data: {
      availableBalanceMinor: nextAvailable,
      escrowBalanceMinor: nextEscrow,
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      walletId: params.walletId,
      userId: params.userId,
      type: params.type,
      availableDeltaMinor: params.availableDeltaMinor,
      escrowDeltaMinor: params.escrowDeltaMinor,
      balanceAfterAvailableMinor: nextAvailable,
      balanceAfterEscrowMinor: nextEscrow,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
    },
  });
}

async function ensureWalletWithSeedBalance(userId: string, amountMinor: bigint, currency = "INR") {
  const wallet = await prisma.wallet.upsert({
    where: { userId },
    update: {
      walletIdentifier: walletIdentifier(userId),
      depositAddressBtc: walletAddress(userId, "BTC"),
      depositAddressErc20: walletAddress(userId, "ERC20"),
      depositAddressTrc20: walletAddress(userId, "TRC20"),
    },
    create: {
      userId,
      walletIdentifier: walletIdentifier(userId),
      depositAddressBtc: walletAddress(userId, "BTC"),
      depositAddressErc20: walletAddress(userId, "ERC20"),
      depositAddressTrc20: walletAddress(userId, "TRC20"),
      currency,
      availableBalanceMinor: BigInt(0),
      escrowBalanceMinor: BigInt(0),
    },
  });

  if (amountMinor > BigInt(0)) {
    await postLedgerEntry({
      walletId: wallet.id,
      userId,
      type: LedgerEntryType.DEPOSIT,
      availableDeltaMinor: amountMinor,
      escrowDeltaMinor: BigInt(0),
      referenceType: "Seed",
      referenceId: `seed-initial-${userId}`,
    });
  }

  return prisma.wallet.findUniqueOrThrow({
    where: { id: wallet.id },
  });
}

async function seedWalletActivity(params: {
  userId: string;
  walletId: string;
  depositTxRef: string;
  withdrawalId: string;
}) {
  const demoDepositAmount = BigInt(250000);
  const demoWithdrawalAmount = BigInt(125000);

  const existingDeposit = await prisma.deposit.findUnique({
    where: { txRef: params.depositTxRef },
  });

  if (!existingDeposit) {
    const deposit = await prisma.deposit.create({
      data: {
        walletId: params.walletId,
        userId: params.userId,
        amountMinor: demoDepositAmount,
        txRef: params.depositTxRef,
        status: DepositStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
    });

    await postLedgerEntry({
      walletId: params.walletId,
      userId: params.userId,
      type: LedgerEntryType.DEPOSIT,
      availableDeltaMinor: demoDepositAmount,
      escrowDeltaMinor: BigInt(0),
      referenceType: "Deposit",
      referenceId: deposit.id,
    });
  }

  const existingWithdrawal = await prisma.withdrawalRequest.findUnique({
    where: { id: params.withdrawalId },
  });

  if (!existingWithdrawal) {
    const withdrawal = await prisma.withdrawalRequest.create({
      data: {
        id: params.withdrawalId,
        walletId: params.walletId,
        userId: params.userId,
        amountMinor: demoWithdrawalAmount,
        destination: "UPI: demo@xorviqa",
        status: WithdrawalStatus.PENDING,
      },
    });

    await postLedgerEntry({
      walletId: params.walletId,
      userId: params.userId,
      type: LedgerEntryType.WITHDRAWAL_REQUEST,
      availableDeltaMinor: -demoWithdrawalAmount,
      escrowDeltaMinor: BigInt(0),
      referenceType: "WithdrawalRequest",
      referenceId: withdrawal.id,
    });
  }
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

  const adminWallet = await ensureWalletWithSeedBalance(admin.id, BigInt(500000));
  const aliceWallet = await ensureWalletWithSeedBalance(alice.id, BigInt(1500000));
  const bobWallet = await ensureWalletWithSeedBalance(bob.id, BigInt(1200000));

  await seedWalletActivity({
    userId: alice.id,
    walletId: aliceWallet.id,
    depositTxRef: "MX-SEED-ALICE-DEP-001",
    withdrawalId: "seed-withdrawal-alice-001",
  });

  await seedWalletActivity({
    userId: bob.id,
    walletId: bobWallet.id,
    depositTxRef: "MX-SEED-BOB-DEP-001",
    withdrawalId: "seed-withdrawal-bob-001",
  });

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

  const existingTrade = await prisma.trade.findUnique({
    where: { id: "seed-trade-alice-bob-001" },
  });

  if (!existingTrade) {
    const amountMinor = BigInt(50000);
    const priceMinor = BigInt(8500);

    const trade = await prisma.trade.create({
      data: {
        id: "seed-trade-alice-bob-001",
        offerId: "seed-offer-alice-sell-usdt",
        buyerId: bob.id,
        sellerId: alice.id,
        amountMinor,
        fiatPriceMinor: priceMinor,
        fiatTotalMinor: (priceMinor * amountMinor) / BigInt(100),
        escrowHeldMinor: amountMinor,
        status: TradeStatus.OPEN,
      },
    });

    await postLedgerEntry({
      walletId: aliceWallet.id,
      userId: alice.id,
      type: LedgerEntryType.TRADE_ESCROW_HOLD,
      availableDeltaMinor: -amountMinor,
      escrowDeltaMinor: amountMinor,
      referenceType: "Trade",
      referenceId: trade.id,
    });

    await prisma.tradeEscrowEvent.create({
      data: {
        tradeId: trade.id,
        action: "HOLD",
        amountMinor,
        actorId: bob.id,
      },
    });

    await prisma.tradeMessage.createMany({
      data: [
        {
          tradeId: trade.id,
          senderId: bob.id,
          body: "Hello, payment will be sent shortly.",
        },
        {
          tradeId: trade.id,
          senderId: alice.id,
          body: "[Trade Assistant] Hello, I am the trade assistant.",
        },
      ],
    });
  }

  await prisma.notification.upsert({
    where: { id: "seed-notification-alice-001" },
    update: {},
    create: {
      id: "seed-notification-alice-001",
      userId: alice.id,
      type: NotificationType.WALLET,
      title: "Deposit confirmed",
      message: "Seed wallet deposit has been confirmed.",
    },
  });

  await prisma.notification.upsert({
    where: { id: "seed-notification-bob-001" },
    update: {},
    create: {
      id: "seed-notification-bob-001",
      userId: bob.id,
      type: NotificationType.TRADE,
      title: "Trade awaiting payment",
      message: "A seed trade is ready for demo walkthrough.",
    },
  });

  await prisma.notification.upsert({
    where: { id: "seed-notification-admin-001" },
    update: {},
    create: {
      id: "seed-notification-admin-001",
      userId: admin.id,
      type: NotificationType.SYSTEM,
      title: "Admin console ready",
      message: "Seed environment initialized successfully.",
    },
  });

  console.log("Seed complete.");
  console.log("Admin login: admin@p2p.local / Password@123");
  console.log("Trader login: alice@p2p.local / Password@123");
  console.log("Trade demo ID: seed-trade-alice-bob-001");
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
