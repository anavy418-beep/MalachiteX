import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DepositStatus,
  LedgerEntryType,
  NotificationType,
  Prisma,
  WithdrawalStatus,
} from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AuditService } from "@/modules/audit/audit.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { WalletLedgerService } from "./wallet-ledger.service";
import { CreateWithdrawalDto } from "./dto/create-withdrawal.dto";
import { MockDepositDto } from "./dto/mock-deposit.dto";
import { buildDepositAddresses, buildWalletIdentifier } from "./wallet-identity.util";

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletLedgerService: WalletLedgerService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    if (!wallet.walletIdentifier || !wallet.depositAddressBtc || !wallet.depositAddressErc20 || !wallet.depositAddressTrc20) {
      const addresses = buildDepositAddresses(wallet.id);
      wallet = await this.prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          walletIdentifier: wallet.walletIdentifier ?? buildWalletIdentifier(wallet.id, "USDT"),
          depositAddressBtc: wallet.depositAddressBtc ?? addresses.BTC,
          depositAddressErc20: wallet.depositAddressErc20 ?? addresses.ERC20,
          depositAddressTrc20: wallet.depositAddressTrc20 ?? addresses.TRC20,
        },
      });
    }

    const ledger = await this.prisma.ledgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return {
      currency: wallet.currency,
      availableBalanceMinor: wallet.availableBalanceMinor.toString(),
      escrowBalanceMinor: wallet.escrowBalanceMinor.toString(),
      walletId: wallet.walletIdentifier,
      depositAddresses: {
        BTC: wallet.depositAddressBtc,
        ERC20: wallet.depositAddressErc20,
        TRC20: wallet.depositAddressTrc20,
      },
      ledger: ledger.map((item) => ({
        id: item.id,
        type: item.type,
        amountMinor: item.availableDeltaMinor.toString(),
        createdAt: item.createdAt,
      })),
    };
  }

  listDeposits(userId: string) {
    return this.prisma.deposit.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  listWithdrawals(userId: string) {
    return this.prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async mockDeposit(userId: string, dto: MockDepositDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    const amount = BigInt(dto.amountMinor);
    if (amount <= 0n) {
      throw new BadRequestException("Deposit amount must be greater than zero");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.create({
        data: {
          walletId: wallet.id,
          userId,
          amountMinor: amount,
          txRef: dto.txRef,
          status: DepositStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
      });

      await this.walletLedgerService.postEntry(tx, {
        walletId: wallet.id,
        userId,
        type: LedgerEntryType.DEPOSIT,
        availableDeltaMinor: amount,
        escrowDeltaMinor: BigInt(0),
        referenceType: "Deposit",
        referenceId: deposit.id,
      });

      await this.auditService.log(
        {
          actorId: userId,
          action: "WALLET_DEPOSIT_CONFIRMED",
          entityType: "Deposit",
          entityId: deposit.id,
          payload: { txRef: dto.txRef, amountMinor: dto.amountMinor },
        },
        tx,
      );

      return deposit;
    });

    await this.notificationsService.create({
      userId,
      type: NotificationType.WALLET,
      title: "Deposit confirmed",
      message: `Mock deposit ${dto.txRef} confirmed`,
      data: { amountMinor: dto.amountMinor },
    });

    return result;
  }

  async requestWithdrawal(userId: string, dto: CreateWithdrawalDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    const amount = BigInt(dto.amountMinor);
    if (amount <= 0n) {
      throw new BadRequestException("Withdrawal amount must be greater than zero");
    }

    if (wallet.availableBalanceMinor < amount) {
      throw new BadRequestException("Insufficient available balance");
    }

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      const request = await tx.withdrawalRequest.create({
        data: {
          walletId: wallet.id,
          userId,
          amountMinor: amount,
          destination: dto.destination,
          status: WithdrawalStatus.PENDING,
        },
      });

      await this.walletLedgerService.postEntry(tx, {
        walletId: wallet.id,
        userId,
        type: LedgerEntryType.WITHDRAWAL_REQUEST,
        availableDeltaMinor: -amount,
        escrowDeltaMinor: BigInt(0),
        referenceType: "WithdrawalRequest",
        referenceId: request.id,
      });

      await this.auditService.log(
        {
          actorId: userId,
          action: "WITHDRAWAL_REQUEST_CREATED",
          entityType: "WithdrawalRequest",
          entityId: request.id,
          payload: { amountMinor: dto.amountMinor },
        },
        tx,
      );

      return request;
    });

    await this.notificationsService.create({
      userId,
      type: NotificationType.WALLET,
      title: "Withdrawal requested",
      message: `Withdrawal request ${withdrawal.id} created`,
    });

    return withdrawal;
  }

  async approveWithdrawal(adminId: string, id: string) {
    const request = await this.prisma.withdrawalRequest.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException("Withdrawal request not found");
    }

    if (request.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException("Withdrawal request already processed");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const approval = await tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: WithdrawalStatus.APPROVED,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });

      const walletSnapshot = await tx.wallet.findUniqueOrThrow({
        where: { id: request.walletId },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: request.walletId,
          userId: request.userId,
          type: LedgerEntryType.WITHDRAWAL_APPROVED,
          availableDeltaMinor: BigInt(0),
          escrowDeltaMinor: BigInt(0),
          balanceAfterAvailableMinor: walletSnapshot.availableBalanceMinor,
          balanceAfterEscrowMinor: walletSnapshot.escrowBalanceMinor,
          referenceType: "WithdrawalRequest",
          referenceId: request.id,
        },
      });

      await this.auditService.log(
        {
          actorId: adminId,
          action: "WITHDRAWAL_REQUEST_APPROVED",
          entityType: "WithdrawalRequest",
          entityId: request.id,
          payload: { amountMinor: request.amountMinor.toString() },
        },
        tx,
      );

      return approval;
    });

    await this.notificationsService.create({
      userId: request.userId,
      type: NotificationType.WALLET,
      title: "Withdrawal approved",
      message: `Request ${request.id} approved`,
    });

    return updated;
  }

  async rejectWithdrawal(adminId: string, id: string, reason?: string) {
    const request = await this.prisma.withdrawalRequest.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException("Withdrawal request not found");
    }

    if (request.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException("Withdrawal request already processed");
    }

    const rejected = await this.prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: WithdrawalStatus.REJECTED,
          reviewedById: adminId,
          reviewedAt: new Date(),
          reason,
        },
      });

      await this.walletLedgerService.postEntry(tx, {
        walletId: request.walletId,
        userId: request.userId,
        type: LedgerEntryType.WITHDRAWAL_REJECTED,
        availableDeltaMinor: request.amountMinor,
        escrowDeltaMinor: BigInt(0),
        referenceType: "WithdrawalRequest",
        referenceId: request.id,
      });

      await this.auditService.log(
        {
          actorId: adminId,
          action: "WITHDRAWAL_REQUEST_REJECTED",
          entityType: "WithdrawalRequest",
          entityId: request.id,
          payload: { reason },
        },
        tx,
      );

      return updatedRequest;
    });

    await this.notificationsService.create({
      userId: request.userId,
      type: NotificationType.WALLET,
      title: "Withdrawal rejected",
      message: `Request ${request.id} rejected`,
      data: { reason },
    });

    return rejected;
  }

  async getPendingWithdrawals() {
    return this.prisma.withdrawalRequest.findMany({
      where: { status: WithdrawalStatus.PENDING },
      orderBy: { createdAt: "asc" },
    });
  }

  async postTradeEscrowHold(
    tx: Prisma.TransactionClient,
    params: {
      walletId: string;
      userId: string;
      amountMinor: bigint;
      tradeId: string;
    },
  ) {
    await this.walletLedgerService.postEntry(tx, {
      walletId: params.walletId,
      userId: params.userId,
      type: LedgerEntryType.TRADE_ESCROW_HOLD,
      availableDeltaMinor: -params.amountMinor,
      escrowDeltaMinor: params.amountMinor,
      referenceType: "Trade",
      referenceId: params.tradeId,
    });
  }

  async postTradeEscrowRelease(
    tx: Prisma.TransactionClient,
    params: {
      sellerWalletId: string;
      buyerWalletId: string;
      sellerUserId: string;
      buyerUserId: string;
      amountMinor: bigint;
      tradeId: string;
    },
  ) {
    await this.walletLedgerService.postEntry(tx, {
      walletId: params.sellerWalletId,
      userId: params.sellerUserId,
      type: LedgerEntryType.TRADE_ESCROW_RELEASE,
      availableDeltaMinor: BigInt(0),
      escrowDeltaMinor: -params.amountMinor,
      referenceType: "Trade",
      referenceId: params.tradeId,
    });

    await this.walletLedgerService.postEntry(tx, {
      walletId: params.buyerWalletId,
      userId: params.buyerUserId,
      type: LedgerEntryType.TRADE_ESCROW_RELEASE,
      availableDeltaMinor: params.amountMinor,
      escrowDeltaMinor: BigInt(0),
      referenceType: "Trade",
      referenceId: params.tradeId,
    });
  }

  async postTradeEscrowRefund(
    tx: Prisma.TransactionClient,
    params: {
      walletId: string;
      userId: string;
      amountMinor: bigint;
      tradeId: string;
    },
  ) {
    await this.walletLedgerService.postEntry(tx, {
      walletId: params.walletId,
      userId: params.userId,
      type: LedgerEntryType.TRADE_ESCROW_REFUND,
      availableDeltaMinor: params.amountMinor,
      escrowDeltaMinor: -params.amountMinor,
      referenceType: "Trade",
      referenceId: params.tradeId,
    });
  }
}
