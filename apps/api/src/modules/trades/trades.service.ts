import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { NotificationType, OfferStatus, OfferType, TradeStatus } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AuditService } from "@/modules/audit/audit.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { WalletService } from "@/modules/wallet/wallet.service";
import { CreateTradeDto } from "./dto/create-trade.dto";
import { TradeGateway } from "./trade.gateway";

@Injectable()
export class TradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly tradeGateway: TradeGateway,
  ) {}

  async create(actorId: string, dto: CreateTradeDto) {
    const offer = await this.prisma.offer.findUnique({ where: { id: dto.offerId } });

    if (!offer || offer.status !== OfferStatus.ACTIVE) {
      throw new NotFoundException("Offer not found or unavailable");
    }

    if (offer.userId === actorId) {
      throw new BadRequestException("Cannot create a trade on your own offer");
    }

    const amountMinor = BigInt(dto.amountMinor);

    if (amountMinor < offer.minAmountMinor || amountMinor > offer.maxAmountMinor) {
      throw new BadRequestException("Trade amount outside offer limits");
    }

    const buyerId = offer.type === OfferType.SELL ? actorId : offer.userId;
    const sellerId = offer.type === OfferType.SELL ? offer.userId : actorId;

    const sellerWallet = await this.prisma.wallet.findUnique({ where: { userId: sellerId } });
    const buyerWallet = await this.prisma.wallet.findUnique({ where: { userId: buyerId } });

    if (!sellerWallet || !buyerWallet) {
      throw new NotFoundException("Buyer/seller wallet not found");
    }

    if (sellerWallet.availableBalanceMinor < amountMinor) {
      throw new BadRequestException("Seller has insufficient balance to lock in escrow");
    }

    const trade = await this.prisma.$transaction(async (tx) => {
      const createdTrade = await tx.trade.create({
        data: {
          offerId: offer.id,
          buyerId,
          sellerId,
          amountMinor,
          fiatPriceMinor: offer.priceMinor,
          fiatTotalMinor: (offer.priceMinor * amountMinor) / BigInt(100),
          status: TradeStatus.PENDING_PAYMENT,
          escrowHeldMinor: amountMinor,
        },
      });

      await this.walletService.postTradeEscrowHold(tx, {
        walletId: sellerWallet.id,
        userId: sellerId,
        amountMinor,
        tradeId: createdTrade.id,
      });

      await tx.tradeEscrowEvent.create({
        data: {
          tradeId: createdTrade.id,
          action: "HOLD",
          amountMinor,
          actorId,
        },
      });

      await this.auditService.log(
        {
          actorId,
          action: "TRADE_CREATED_WITH_ESCROW_HOLD",
          entityType: "Trade",
          entityId: createdTrade.id,
          payload: {
            offerId: offer.id,
            amountMinor: dto.amountMinor,
            sellerId,
            buyerId,
          },
        },
        tx,
      );

      return createdTrade;
    });

    await Promise.all([
      this.notificationsService.create({
        userId: buyerId,
        type: NotificationType.TRADE,
        title: "Trade started",
        message: `Trade ${trade.id} opened`,
      }),
      this.notificationsService.create({
        userId: sellerId,
        type: NotificationType.TRADE,
        title: "Escrow locked",
        message: `Trade ${trade.id} locked ${dto.amountMinor} in escrow`,
      }),
    ]);

    this.tradeGateway.notifyTradeStatus(trade.id, {
      status: trade.status,
      event: "created",
    });

    return {
      ...trade,
      amountMinor: trade.amountMinor.toString(),
      fiatPriceMinor: trade.fiatPriceMinor.toString(),
      fiatTotalMinor: trade.fiatTotalMinor.toString(),
      escrowHeldMinor: trade.escrowHeldMinor.toString(),
    };
  }

  async getByIdForParticipant(userId: string, role: "USER" | "ADMIN", id: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 200,
        },
      },
    });

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    if (role !== "ADMIN" && trade.buyerId !== userId && trade.sellerId !== userId) {
      throw new BadRequestException("Not a participant of this trade");
    }

    return {
      ...trade,
      amountMinor: trade.amountMinor.toString(),
      fiatPriceMinor: trade.fiatPriceMinor.toString(),
      fiatTotalMinor: trade.fiatTotalMinor.toString(),
      escrowHeldMinor: trade.escrowHeldMinor.toString(),
      chat: trade.messages,
    };
  }

  async markPaid(actorId: string, tradeId: string) {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    if (trade.buyerId !== actorId) {
      throw new BadRequestException("Only buyer can mark trade as paid");
    }

    if (trade.status !== TradeStatus.PENDING_PAYMENT) {
      throw new BadRequestException("Trade is not awaiting payment");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: TradeStatus.PAID,
          paidAt: new Date(),
        },
      });

      await this.auditService.log(
        {
          actorId,
          action: "TRADE_MARKED_PAID",
          entityType: "Trade",
          entityId: tradeId,
        },
        tx,
      );

      return result;
    });

    await this.notificationsService.create({
      userId: trade.sellerId,
      type: NotificationType.TRADE,
      title: "Buyer marked payment",
      message: `Trade ${trade.id} marked as paid by buyer`,
    });

    this.tradeGateway.notifyTradeStatus(trade.id, {
      status: TradeStatus.PAID,
      event: "marked_paid",
    });

    return updated;
  }

  async releaseEscrow(actorId: string, role: "USER" | "ADMIN", tradeId: string) {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    if (role !== "ADMIN" && trade.sellerId !== actorId) {
      throw new BadRequestException("Only seller or admin can release escrow");
    }

    if (trade.status !== TradeStatus.PAID && trade.status !== TradeStatus.DISPUTED) {
      throw new BadRequestException("Trade not eligible for release");
    }

    const sellerWallet = await this.prisma.wallet.findUnique({ where: { userId: trade.sellerId } });
    const buyerWallet = await this.prisma.wallet.findUnique({ where: { userId: trade.buyerId } });

    if (!sellerWallet || !buyerWallet) {
      throw new NotFoundException("Wallets not found for trade participants");
    }

    const released = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.trade.update({
        where: { id: trade.id },
        data: {
          status: TradeStatus.RELEASED,
          releasedAt: new Date(),
          completedAt: new Date(),
        },
      });

      await this.walletService.postTradeEscrowRelease(tx, {
        sellerWalletId: sellerWallet.id,
        buyerWalletId: buyerWallet.id,
        sellerUserId: trade.sellerId,
        buyerUserId: trade.buyerId,
        amountMinor: trade.escrowHeldMinor,
        tradeId: trade.id,
      });

      await tx.tradeEscrowEvent.create({
        data: {
          tradeId: trade.id,
          action: "RELEASE",
          amountMinor: trade.escrowHeldMinor,
          actorId,
        },
      });

      await this.auditService.log(
        {
          actorId,
          action: "TRADE_ESCROW_RELEASED",
          entityType: "Trade",
          entityId: trade.id,
        },
        tx,
      );

      return updated;
    });

    await Promise.all([
      this.notificationsService.create({
        userId: trade.buyerId,
        type: NotificationType.TRADE,
        title: "Trade completed",
        message: `Escrow released for trade ${trade.id}`,
      }),
      this.notificationsService.create({
        userId: trade.sellerId,
        type: NotificationType.TRADE,
        title: "Trade settled",
        message: `Escrow release completed for trade ${trade.id}`,
      }),
    ]);

    this.tradeGateway.notifyTradeStatus(trade.id, {
      status: TradeStatus.RELEASED,
      event: "released",
    });

    return released;
  }

  async cancelTrade(actorId: string, tradeId: string) {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    if (![trade.buyerId, trade.sellerId].includes(actorId)) {
      throw new BadRequestException("Only participants can cancel this trade");
    }

    if (trade.status !== TradeStatus.PENDING_PAYMENT) {
      throw new BadRequestException("Trade can only be canceled before payment");
    }

    const sellerWallet = await this.prisma.wallet.findUnique({ where: { userId: trade.sellerId } });
    if (!sellerWallet) {
      throw new NotFoundException("Seller wallet not found");
    }

    const canceled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.trade.update({
        where: { id: trade.id },
        data: {
          status: TradeStatus.CANCELED,
          canceledAt: new Date(),
        },
      });

      await this.walletService.postTradeEscrowRefund(tx, {
        walletId: sellerWallet.id,
        userId: trade.sellerId,
        amountMinor: trade.escrowHeldMinor,
        tradeId: trade.id,
      });

      await tx.tradeEscrowEvent.create({
        data: {
          tradeId: trade.id,
          action: "REFUND",
          amountMinor: trade.escrowHeldMinor,
          actorId,
        },
      });

      await this.auditService.log(
        {
          actorId,
          action: "TRADE_CANCELED_AND_REFUNDED",
          entityType: "Trade",
          entityId: trade.id,
        },
        tx,
      );

      return updated;
    });

    this.tradeGateway.notifyTradeStatus(trade.id, {
      status: TradeStatus.CANCELED,
      event: "canceled",
    });

    return canceled;
  }

  async forceRefundEscrow(adminId: string, tradeId: string) {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    const sellerWallet = await this.prisma.wallet.findUnique({ where: { userId: trade.sellerId } });

    if (!sellerWallet) {
      throw new NotFoundException("Seller wallet not found");
    }

    const refunded = await this.prisma.$transaction(async (tx) => {
      const updatedTrade = await tx.trade.update({
        where: { id: trade.id },
        data: {
          status: TradeStatus.CANCELED,
          canceledAt: new Date(),
        },
      });

      await this.walletService.postTradeEscrowRefund(tx, {
        walletId: sellerWallet.id,
        userId: trade.sellerId,
        amountMinor: trade.escrowHeldMinor,
        tradeId: trade.id,
      });

      await tx.tradeEscrowEvent.create({
        data: {
          tradeId: trade.id,
          action: "REFUND",
          amountMinor: trade.escrowHeldMinor,
          actorId: adminId,
        },
      });

      await this.auditService.log(
        {
          actorId: adminId,
          action: "TRADE_ESCROW_FORCE_REFUND",
          entityType: "Trade",
          entityId: trade.id,
        },
        tx,
      );

      return updatedTrade;
    });

    this.tradeGateway.notifyTradeStatus(trade.id, {
      status: TradeStatus.CANCELED,
      event: "force_refund",
    });

    return refunded;
  }
}
