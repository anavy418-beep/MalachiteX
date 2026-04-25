import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DepositStatus, LedgerEntryType, NotificationType, WithdrawalStatus } from "@prisma/client";
import { WalletService } from "./wallet.service";

describe("WalletService", () => {
  const prisma: any = {
    wallet: {
      findUnique: jest.fn(),
    },
    deposit: {
      findMany: jest.fn(),
    },
    withdrawalRequest: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const walletLedgerService: any = {
    postEntry: jest.fn(),
  };

  const auditService: any = {
    log: jest.fn(),
  };

  const notificationsService: any = {
    create: jest.fn(),
  };

  let service: WalletService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.wallet.findUnique.mockReset();
    prisma.$transaction.mockReset();
    walletLedgerService.postEntry.mockReset();
    auditService.log.mockReset();
    notificationsService.create.mockReset();

    service = new WalletService(prisma, walletLedgerService, auditService, notificationsService);
  });

  it("credits available balance through ledger on deposit confirmation", async () => {
    prisma.wallet.findUnique.mockResolvedValue({
      id: "wallet-1",
      userId: "user-1",
      availableBalanceMinor: 0n,
      escrowBalanceMinor: 0n,
    });

    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        deposit: {
          create: jest.fn().mockResolvedValue({
            id: "deposit-1",
            walletId: "wallet-1",
            userId: "user-1",
            amountMinor: 150000n,
            txRef: "MX-DEP-1",
            status: DepositStatus.CONFIRMED,
          }),
        },
      }),
    );

    await service.mockDeposit("user-1", { amountMinor: "150000", txRef: "MX-DEP-1" });

    expect(walletLedgerService.postEntry).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        walletId: "wallet-1",
        userId: "user-1",
        type: LedgerEntryType.DEPOSIT,
        availableDeltaMinor: 150000n,
        escrowDeltaMinor: 0n,
      }),
    );
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: NotificationType.WALLET,
      }),
    );
  });

  it("creates withdrawal request and debits available balance through ledger", async () => {
    prisma.wallet.findUnique.mockResolvedValue({
      id: "wallet-1",
      userId: "user-1",
      availableBalanceMinor: 500000n,
      escrowBalanceMinor: 0n,
    });

    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        withdrawalRequest: {
          create: jest.fn().mockResolvedValue({
            id: "wd-1",
            walletId: "wallet-1",
            userId: "user-1",
            amountMinor: 100000n,
            destination: "bank-account",
            status: WithdrawalStatus.PENDING,
          }),
        },
      }),
    );

    await service.requestWithdrawal("user-1", {
      amountMinor: "100000",
      destination: "bank-account",
    });

    expect(walletLedgerService.postEntry).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        walletId: "wallet-1",
        userId: "user-1",
        type: LedgerEntryType.WITHDRAWAL_REQUEST,
        availableDeltaMinor: -100000n,
        escrowDeltaMinor: 0n,
      }),
    );
  });

  it("rejects withdrawal when available balance is insufficient", async () => {
    prisma.wallet.findUnique.mockResolvedValue({
      id: "wallet-1",
      userId: "user-1",
      availableBalanceMinor: 1000n,
      escrowBalanceMinor: 0n,
    });

    await expect(
      service.requestWithdrawal("user-1", {
        amountMinor: "5000",
        destination: "bank-account",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails when wallet does not exist for requested user", async () => {
    prisma.wallet.findUnique.mockResolvedValue(null);

    await expect(service.mockDeposit("user-1", { amountMinor: "2000", txRef: "MX-DEP-2" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

