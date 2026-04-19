import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DisputeStatus, NotificationType, TradeStatus } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AuditService } from "@/modules/audit/audit.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { TradesService } from "@/modules/trades/trades.service";
import { CreateDisputeDto } from "./dto/create-dispute.dto";
import { DisputeResolutionAction, ResolveDisputeDto } from "./dto/resolve-dispute.dto";

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradesService: TradesService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateDisputeDto) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: dto.tradeId },
      include: { dispute: true },
    });

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    if (![trade.buyerId, trade.sellerId].includes(userId)) {
      throw new BadRequestException("Only participants can open dispute");
    }

    if (trade.dispute) {
      throw new BadRequestException("Dispute already exists for this trade");
    }

    if (trade.status !== TradeStatus.PAID && trade.status !== TradeStatus.PENDING_PAYMENT) {
      throw new BadRequestException("Trade status not eligible for dispute");
    }

    const dispute = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dispute.create({
        data: {
          tradeId: trade.id,
          openedById: userId,
          reason: dto.reason,
          evidenceKeys: dto.evidenceKeys ?? [],
          status: DisputeStatus.OPEN,
        },
      });

      await tx.trade.update({
        where: { id: trade.id },
        data: { status: TradeStatus.DISPUTED },
      });

      await this.auditService.log(
        {
          actorId: userId,
          action: "DISPUTE_OPENED",
          entityType: "Dispute",
          entityId: created.id,
          payload: { tradeId: trade.id },
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
      }),
      this.notificationsService.create({
        userId: trade.sellerId,
        type: NotificationType.DISPUTE,
        title: "Trade disputed",
        message: `Dispute opened for trade ${trade.id}`,
      }),
    ]);

    return dispute;
  }

  listMine(userId: string) {
    return this.prisma.dispute.findMany({
      where: { OR: [{ openedById: userId }, { trade: { buyerId: userId } }, { trade: { sellerId: userId } }] },
      include: { trade: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async resolve(adminId: string, id: string, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: { trade: true },
    });

    if (!dispute) {
      throw new NotFoundException("Dispute not found");
    }

    if (dispute.status === DisputeStatus.RESOLVED) {
      throw new BadRequestException("Dispute already resolved");
    }

    if (dto.action === DisputeResolutionAction.RELEASE_TO_BUYER) {
      await this.tradesService.releaseEscrow(adminId, "ADMIN", dispute.tradeId);
    } else {
      await this.tradesService.forceRefundEscrow(adminId, dispute.tradeId);
    }

    const resolved = await this.prisma.$transaction(async (tx) => {
      const result = await tx.dispute.update({
        where: { id: dispute.id },
        data: {
          status: DisputeStatus.RESOLVED,
          resolutionNote: dto.note,
          resolvedById: adminId,
          resolvedAt: new Date(),
        },
      });

      await this.auditService.log(
        {
          actorId: adminId,
          action: "DISPUTE_RESOLVED",
          entityType: "Dispute",
          entityId: dispute.id,
          payload: { action: dto.action },
        },
        tx,
      );

      return result;
    });

    await Promise.all([
      this.notificationsService.create({
        userId: dispute.trade.buyerId,
        type: NotificationType.DISPUTE,
        title: "Dispute resolved",
        message: `Dispute ${dispute.id} resolved by admin`,
      }),
      this.notificationsService.create({
        userId: dispute.trade.sellerId,
        type: NotificationType.DISPUTE,
        title: "Dispute resolved",
        message: `Dispute ${dispute.id} resolved by admin`,
      }),
    ]);

    return resolved;
  }

  listOpenDisputes() {
    return this.prisma.dispute.findMany({
      where: { status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] } },
      include: { trade: true },
      orderBy: { createdAt: "asc" },
    });
  }
}
