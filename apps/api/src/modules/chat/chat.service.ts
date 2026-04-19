import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AuditService } from "@/modules/audit/audit.service";
import { TradeGateway } from "@/modules/trades/trade.gateway";
import { SendTradeMessageDto } from "./dto/send-trade-message.dto";

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly tradeGateway: TradeGateway,
  ) {}

  async sendTradeMessage(userId: string, tradeId: string, dto: SendTradeMessageDto) {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    if (![trade.buyerId, trade.sellerId].includes(userId)) {
      throw new BadRequestException("Only trade participants can chat");
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tradeMessage.create({
        data: {
          tradeId,
          senderId: userId,
          body: dto.body,
          attachmentKey: dto.attachmentKey,
        },
      });

      await this.auditService.log(
        {
          actorId: userId,
          action: "TRADE_CHAT_MESSAGE_SENT",
          entityType: "TradeMessage",
          entityId: created.id,
          payload: { tradeId },
        },
        tx,
      );

      return created;
    });

    this.tradeGateway.notifyNewMessage(tradeId, {
      id: message.id,
      body: message.body,
      senderId: message.senderId,
      createdAt: message.createdAt,
    });

    return message;
  }

  async listTradeMessages(userId: string, tradeId: string) {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });

    if (!trade) {
      throw new NotFoundException("Trade not found");
    }

    if (![trade.buyerId, trade.sellerId].includes(userId)) {
      throw new BadRequestException("Not a participant");
    }

    return this.prisma.tradeMessage.findMany({
      where: { tradeId },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
  }
}
