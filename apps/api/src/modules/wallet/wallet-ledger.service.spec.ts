import { BadRequestException, NotFoundException } from "@nestjs/common";
import { LedgerEntryType } from "@prisma/client";
import { WalletLedgerService } from "./wallet-ledger.service";

describe("WalletLedgerService", () => {
  let service: WalletLedgerService;

  beforeEach(() => {
    service = new WalletLedgerService();
  });

  it("posts a ledger entry and updates balances", async () => {
    const tx: any = {
      $queryRaw: jest.fn(),
      wallet: {
        findUnique: jest.fn().mockResolvedValue({
          id: "wallet-1",
          availableBalanceMinor: BigInt(1000),
          escrowBalanceMinor: BigInt(100),
        }),
        update: jest.fn(),
      },
      ledgerEntry: {
        create: jest.fn().mockResolvedValue({ id: "entry-1" }),
      },
    };

    await service.postEntry(tx, {
      walletId: "wallet-1",
      userId: "user-1",
      type: LedgerEntryType.ADJUSTMENT,
      availableDeltaMinor: BigInt(-200),
      escrowDeltaMinor: BigInt(0),
    });

    expect(tx.wallet.update).toHaveBeenCalled();
    expect(tx.ledgerEntry.create).toHaveBeenCalled();
  });

  it("throws when wallet is not found", async () => {
    const tx: any = {
      $queryRaw: jest.fn(),
      wallet: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    await expect(
      service.postEntry(tx, {
        walletId: "missing",
        userId: "user-1",
        type: LedgerEntryType.ADJUSTMENT,
        availableDeltaMinor: BigInt(10),
        escrowDeltaMinor: BigInt(0),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws when operation causes negative balance", async () => {
    const tx: any = {
      $queryRaw: jest.fn(),
      wallet: {
        findUnique: jest.fn().mockResolvedValue({
          id: "wallet-1",
          availableBalanceMinor: BigInt(100),
          escrowBalanceMinor: BigInt(0),
        }),
      },
    };

    await expect(
      service.postEntry(tx, {
        walletId: "wallet-1",
        userId: "user-1",
        type: LedgerEntryType.ADJUSTMENT,
        availableDeltaMinor: BigInt(-200),
        escrowDeltaMinor: BigInt(0),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
