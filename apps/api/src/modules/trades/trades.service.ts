import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  DisputeStatus,
  NotificationType,
  OfferStatus,
  OfferType,
  Prisma,
  TradeStatus,
} from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AuditService } from "@/modules/audit/audit.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { WalletService } from "@/modules/wallet/wallet.service";
import { CreateTradeDto } from "./dto/create-trade.dto";
import { MarkTradePaidDto } from "./dto/mark-trade-paid.dto";
import { OpenTradeDisputeDto } from "./dto/open-trade-dispute.dto";
import { TradeGateway } from "./trade.gateway";

@Injectable()
export class TradesService {
  private readonly logger = new Logger(TradesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly tradeGateway: TradeGateway,
  ) {}

  private isPaymentPendingStatus(status: TradeStatus): boolean {
    const paymentPendingStates: TradeStatus[] = [
      TradeStatus.OPEN,
      TradeStatus.PAYMENT_PENDING,
      TradeStatus.PENDING_PAYMENT,
    ];
    return paymentPendingStates.includes(status);
  }

  private isPaymentSentStatus(status: TradeStatus): boolean {
    const paymentSentStates: TradeStatus[] = [
      TradeStatus.PAYMENT_SENT,
      TradeStatus.PAID,
      TradeStatus.RELEASE_PENDING,
    ];
    return paymentSentStates.includes(status);
  }

  private isCompletedStatus(status: TradeStatus): boolean {
    const completedStates: TradeStatus[] = [TradeStatus.COMPLETED, TradeStatus.RELEASED];
    return completedStates.includes(status);
  }

  private isCancelledStatus(status: TradeStatus): boolean {
    const cancelledStates: TradeStatus[] = [TradeStatus.CANCELLED, TradeStatus.CANCELED];
    return cancelledStates.includes(status);
  }

  private buildPaymentInstructions(
    offer: {
      paymentMethod: string;
      paymentDetails?: Prisma.JsonValue | null;
      fiatCurrency: string;
    },
    fiatTotalMinor: bigint,
  ): Prisma.JsonObject {
    const details =
      offer.paymentDetails && typeof offer.paymentDetails === "object" && !Array.isArray(offer.paymentDetails)
        ? (offer.paymentDetails as Prisma.JsonObject)
        : {};

    const fallbackReceiver = details.receiverName ?? "Verified Malachitex merchant";

    return {
      method: offer.paymentMethod,
      receiverName: fallbackReceiver,
      upiId: details.upiId ?? null,
      bankName: details.bankName ?? null,
      accountNumber: details.accountNumber ?? null,
      ifsc: details.ifsc ?? null,
      fiatCurrency: offer.fiatCurrency,
      amountMinor: fiatTotalMinor.toString(),
      note: "Demo-safe payment instructions. Verify receiver details before marking paid.",
    };
  }

  private buildPaymentProof(dto: MarkTradePaidDto, tradeId: string): Prisma.JsonObject {
    const paymentReference = dto.paymentReference?.trim();
    const proofFileName = dto.proofFileName?.trim();

    if (!paymentReference && !proofFileName && !dto.proofUrl) {
      throw new BadRequestException("Payment reference or proof screenshot is required");
    }

    const safeFileName = proofFileName?.replace(/[^A-Za-z0-9._\- ()]/g, "_");

    return {
      paymentReference: paymentReference ?? null,
      proofFileName: safeFileName ?? null,
      proofMimeType: dto.proofMimeType ?? null,
      proofUrl:
        dto.proofUrl ??
        (safeFileName ? `/mock-payment-proofs/${tradeId}/${Date.now()}-${safeFileName}` : null),
      uploadedAt: new Date().toISOString(),
    };
  }

  async listForUser(userId: string, role: "USER" | "ADMIN") {
    const trades = await this.prisma.trade.findMany({
      where:
        role === "ADMIN"
          ? undefined
          : {
              OR: [{ buyerId: userId }, { sellerId: userId }],
            },
      include: {
        offer: {
          select: {
            id: true,
            asset: true,
            fiatCurrency: true,
            paymentMethod: true,
            paymentDetails: true,
          } as any,
        },
        buyer: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        seller: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return trades.map((trade) => ({
      ...trade,
      amountMinor: trade.amountMinor.toString(),
      fiatPriceMinor: trade.fiatPriceMinor.toString(),
      fiatTotalMinor: trade.fiatTotalMinor.toString(),
      escrowHeldMinor: trade.escrowHeldMinor.toString(),
    }));
  }

  async create(actorId: string, dto: CreateTradeDto) {
    const offer = await this.prisma.offer.findUnique({ where: { id: dto.offerId } });

    if (!offer || offer.status !== OfferStatus.ACTIVE) {
      throw new NotFoundException("Offer not found or unavailable");
    }

    if (offer.userId === actorId) {
      throw new BadRequestException("Cannot create a trade on your own offer");
    }

    const amountMinor = BigInt(dto.amountMinor);
    if (amountMinor <= 0n) {
      throw new BadRequestException("Trade amount must be greater than zero");
    }

    if (amountMinor < offer.minAmountMinor || amountMinor > offer.maxAmountMinor) {
      throw new BadRequestException("Trade amount outside offer limits");
    }

    const buyerId = offer.type === OfferType.SELL ? actorId : offer.userId;
    const sellerId = offer.type === OfferType.SELL ? offer.userId : actorId;
    const fiatTotalMinor = (offer.priceMinor * amountMinor) / BigInt(100);

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
          fiatTotalMinor,
          status: TradeStatus.OPEN,
          escrowHeldMinor: amountMinor,
          paymentInstructions: this.buildPaymentInstructions(offer as any, fiatTotalMinor),
        } as any,
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
            paymentMethod: offer.paymentMethod,
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
        message: `Trade ${trade.id} opened and awaiting payment`,
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

    this.logger.log(`Trade ${trade.id} created by ${actorId}`);

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
        offer: {
          select: {
            id: true,
            asset: true,
            fiatCurrency: true,
            paymentMethod: true,
            paymentDetails: true,
            terms: true,
            minAmountMinor: true,
            maxAmountMinor: true,
          } as any,
        },
        dispute: true,
        messages: {
          orderBy: { createdAt: "asc" },
          take: 200,
        },
      },
    }) as any;

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    if (role !== "ADMIN" && trade.buyerId !== userId && trade.sellerId !== userId) {
      throw new ForbiddenException("Not a participant of this trade");
    }

    return {
      ...trade,
      offer: trade.offer
        ? {
            ...trade.offer,
            minAmountMinor: trade.offer.minAmountMinor.toString(),
            maxAmountMinor: trade.offer.maxAmountMinor.toString(),
          }
        : undefined,
      amountMinor: trade.amountMinor.toString(),
      fiatPriceMinor: trade.fiatPriceMinor.toString(),
      fiatTotalMinor: trade.fiatTotalMinor.toString(),
      escrowHeldMinor: trade.escrowHeldMinor.toString(),
      chat: trade.messages,
    };
  }

  async markPaid(actorId: string, tradeId: string, dto: MarkTradePaidDto = {}) {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    if (trade.buyerId !== actorId) {
      throw new ForbiddenException("Only buyer can mark trade as paid");
    }

    if (!this.isPaymentPendingStatus(trade.status)) {
      throw new BadRequestException("Trade is not in a payable state");
    }

    const paymentProof = this.buildPaymentProof(dto, tradeId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: TradeStatus.PAYMENT_SENT,
          paidAt: new Date(),
          paymentProof,
        } as any,
      });

      await tx.tradeMessage.create({
        data: {
          tradeId,
          senderId: actorId,
          body: `[System] Buyer marked payment as sent. Reference: ${
            paymentProof.paymentReference ?? "not provided"
          }. Proof: ${paymentProof.proofFileName ?? paymentProof.proofUrl ?? "not provided"}. Seller should verify funds before release.`,
          attachmentKey: typeof paymentProof.proofUrl === "string" ? paymentProof.proofUrl : undefined,
        },
      });

      await this.auditService.log(
        {
          actorId,
          action: "TRADE_MARKED_PAID",
          entityType: "Trade",
          entityId: tradeId,
          payload: {
            proofFileName: paymentProof.proofFileName,
            hasReference: Boolean(paymentProof.paymentReference),
          },
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
      status: TradeStatus.PAYMENT_SENT,
      event: "marked_paid",
    });

    this.logger.log(`Trade ${trade.id} marked paid by buyer ${actorId}`);

    return updated;
  }

  async releaseEscrow(actorId: string, role: "USER" | "ADMIN", tradeId: string) {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    if (role !== "ADMIN" && trade.sellerId !== actorId) {
      throw new ForbiddenException("Only seller or admin can release escrow");
    }

    if (trade.status === TradeStatus.DISPUTED && role !== "ADMIN") {
      throw new BadRequestException("Disputed trades must be resolved through dispute workflow");
    }

    if (!this.isPaymentSentStatus(trade.status) && !(role === "ADMIN" && trade.status === TradeStatus.DISPUTED)) {
      throw new BadRequestException("Trade not eligible for release");
    }

    const sellerWallet = await this.prisma.wallet.findUnique({ where: { userId: trade.sellerId } });
    const buyerWallet = await this.prisma.wallet.findUnique({ where: { userId: trade.buyerId } });

    if (!sellerWallet || !buyerWallet) {
      throw new NotFoundException("Wallets not found for trade participants");
    }

    const released = await this.prisma.$transaction(async (tx) => {
      await tx.trade.update({
        where: { id: trade.id },
        data: {
          status: TradeStatus.RELEASE_PENDING,
        },
      });

      const updated = await tx.trade.update({
        where: { id: trade.id },
        data: {
          status: TradeStatus.COMPLETED,
          sellerPaymentConfirmedAt: new Date(),
          releasedAt: new Date(),
          completedAt: new Date(),
        } as any,
      });

      await tx.tradeMessage.create({
        data: {
          tradeId: trade.id,
          senderId: actorId,
          body: "[System] Seller confirmed payment and released escrow. Trade is completed.",
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
          payload: { sellerPaymentConfirmedAt: true },
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
      status: TradeStatus.COMPLETED,
      event: "released",
    });

    this.logger.log(`Trade ${trade.id} released by ${actorId}`);

    return released;
  }

  async cancelTrade(actorId: string, tradeId: string) {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    if (![trade.buyerId, trade.sellerId].includes(actorId)) {
      throw new ForbiddenException("Only participants can cancel this trade");
    }

    if (this.isCompletedStatus(trade.status)) {
      throw new BadRequestException("Completed trades cannot be canceled");
    }

    if (this.isCancelledStatus(trade.status)) {
      throw new BadRequestException("Trade is already canceled");
    }

    if (trade.status === TradeStatus.DISPUTED) {
      throw new BadRequestException("Disputed trades require dispute resolution");
    }

    if (!this.isPaymentPendingStatus(trade.status)) {
      throw new BadRequestException("Trade can only be canceled before payment is marked");
    }

    const sellerWallet = await this.prisma.wallet.findUnique({ where: { userId: trade.sellerId } });
    if (!sellerWallet) {
      throw new NotFoundException("Seller wallet not found");
    }

    const canceled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.trade.update({
        where: { id: trade.id },
        data: {
          status: TradeStatus.CANCELLED,
          canceledAt: new Date(),
        },
      });

      await tx.tradeMessage.create({
        data: {
          tradeId: trade.id,
          senderId: actorId,
          body: "[System] Trade was cancelled. Escrow refund is being processed for the seller.",
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

    await Promise.all([
      this.notificationsService.create({
        userId: trade.buyerId,
        type: NotificationType.TRADE,
        title: "Trade canceled",
        message: `Trade ${trade.id} was canceled and escrow refunded`,
      }),
      this.notificationsService.create({
        userId: trade.sellerId,
        type: NotificationType.TRADE,
        title: "Trade canceled",
        message: `Trade ${trade.id} was canceled and escrow refunded`,
      }),
    ]);

    this.tradeGateway.notifyTradeStatus(trade.id, {
      status: TradeStatus.CANCELLED,
      event: "canceled",
    });

    this.logger.log(`Trade ${trade.id} canceled by ${actorId}`);

    return canceled;
  }

  async openDispute(actorId: string, tradeId: string, input?: OpenTradeDisputeDto | string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: { dispute: true },
    });

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    if (![trade.buyerId, trade.sellerId].includes(actorId)) {
      throw new ForbiddenException("Only trade participants can open dispute");
    }

    if (trade.dispute) {
      throw new BadRequestException("Dispute already exists for this trade");
    }

    if (trade.status === TradeStatus.DISPUTED) {
      throw new BadRequestException("Trade is already disputed");
    }

    if (this.isCompletedStatus(trade.status) || this.isCancelledStatus(trade.status)) {
      throw new BadRequestException("Dispute cannot be opened for closed trades");
    }

    const rawDisputeReason = typeof input === "string" ? input.trim() : input?.reason?.trim();
    const disputeReason = rawDisputeReason || "Dispute opened from trade workspace.";
    const evidenceKeys =
      typeof input === "string"
        ? []
        : [
            ...(input?.evidenceKeys ?? []),
            input?.proofFileName ? `mock-dispute-proof:${input.proofFileName}` : undefined,
            input?.proofUrl ? `proof-url:${input.proofUrl}` : undefined,
            input?.paymentReference ? `payment-reference:${input.paymentReference}` : undefined,
          ].filter((entry): entry is string => Boolean(entry));

    const dispute = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dispute.create({
        data: {
          tradeId: trade.id,
          openedById: actorId,
          reason: disputeReason,
          status: DisputeStatus.OPEN,
          evidenceKeys,
        },
      });

      await tx.trade.update({
        where: { id: trade.id },
        data: {
          status: TradeStatus.DISPUTED,
        },
      });

      await tx.tradeMessage.create({
        data: {
          tradeId: trade.id,
          senderId: actorId,
          body: `[System] Dispute opened. Reason: ${disputeReason}. Keep payment proof and all updates inside this trade chat.`,
          attachmentKey: evidenceKeys.find((entry) => entry.startsWith("proof-url:"))?.replace("proof-url:", ""),
        },
      });

      await this.auditService.log(
        {
          actorId,
          action: "TRADE_DISPUTE_OPENED",
          entityType: "Dispute",
          entityId: created.id,
          payload: { tradeId: trade.id, evidenceCount: evidenceKeys.length },
        },
        tx,
      );

      return created;
    });

    await Promise.all([
      this.notificationsService.create({
        userId: trade.buyerId,
        type: NotificationType.DISPUTE,
        title: "Trade disputed",
        message: `Dispute opened for trade ${trade.id}`,
        data: { tradeId: trade.id, disputeId: dispute.id },
      }),
      this.notificationsService.create({
        userId: trade.sellerId,
        type: NotificationType.DISPUTE,
        title: "Trade disputed",
        message: `Dispute opened for trade ${trade.id}`,
        data: { tradeId: trade.id, disputeId: dispute.id },
      }),
    ]);

    this.tradeGateway.notifyTradeStatus(trade.id, {
      status: TradeStatus.DISPUTED,
      event: "disputed",
    });

    this.logger.log(`Trade ${trade.id} disputed by ${actorId}`);

    return dispute;
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
          status: TradeStatus.CANCELLED,
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

    await Promise.all([
      this.notificationsService.create({
        userId: trade.buyerId,
        type: NotificationType.TRADE,
        title: "Trade refunded",
        message: `Admin refunded escrow for trade ${trade.id}`,
      }),
      this.notificationsService.create({
        userId: trade.sellerId,
        type: NotificationType.TRADE,
        title: "Trade refunded",
        message: `Admin refunded escrow for trade ${trade.id}`,
      }),
    ]);

    this.tradeGateway.notifyTradeStatus(trade.id, {
      status: TradeStatus.CANCELLED,
      event: "force_refund",
    });

    return refunded;
  }
}
