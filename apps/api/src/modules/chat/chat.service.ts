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

    const result = await this.prisma.$transaction(async (tx) => {
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

      const botMessageBody = this.getDemoBotReply(dto.body, trade.status);
      let botMessage: typeof created | null = null;

      if (this.demoBotEnabled && botMessageBody) {
        const botSenderId = trade.buyerId === userId ? trade.sellerId : trade.buyerId;

        botMessage = await tx.tradeMessage.create({
          data: {
            tradeId,
            senderId: botSenderId,
            body: `[Demo Bot] ${botMessageBody}`,
          },
        });

        await this.auditService.log(
          {
            actorId: botSenderId,
            action: "TRADE_CHAT_BOT_MESSAGE_SENT",
            entityType: "TradeMessage",
            entityId: botMessage.id,
            payload: { tradeId },
          },
          tx,
        );
      }

      return { created, botMessage };
    });

    this.tradeGateway.notifyNewMessage(tradeId, {
      id: result.created.id,
      body: result.created.body,
      senderId: result.created.senderId,
      createdAt: result.created.createdAt,
    });

    if (result.botMessage) {
      this.tradeGateway.notifyNewMessage(tradeId, {
        id: result.botMessage.id,
        body: result.botMessage.body,
        senderId: result.botMessage.senderId,
        createdAt: result.botMessage.createdAt,
      });
    }

    return {
      message: result.created,
      botMessage: result.botMessage,
    };
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

  private get demoBotEnabled(): boolean {
    return process.env.DEMO_CHAT_BOT_ENABLED !== "false";
  }

  private getDemoBotReply(messageBody: string, tradeStatus: string): string | null {
    const body = messageBody.trim().toLowerCase();
    const status = tradeStatus.toUpperCase();

    if (!body || body.startsWith("[demo bot]")) {
      return null;
    }

    if (status === "COMPLETED" || status === "RELEASED") {
      return "Trade marked as completed.";
    }

    if (status === "CANCELED" || status === "CANCELLED") {
      return "Trade cancelled. If this seems incorrect, open a dispute from the trade panel.";
    }

    if (status === "DISPUTED") {
      return "Trade is under dispute review. Please share payment proof and details in this chat.";
    }

    if (status === "RELEASE_PENDING") {
      return "Payment acknowledged. Release is pending from seller confirmation.";
    }

    if (/(help|how|what next|status)/i.test(body)) {
      if (status === "OPEN" || status === "PAYMENT_PENDING" || status === "PENDING_PAYMENT") {
        return "Trade is open. Buyer should send payment and click Mark as Paid.";
      }
      if (status === "PAYMENT_SENT" || status === "PAID") {
        return "Payment marked. Waiting for seller to confirm funds and release escrow.";
      }
      if (status === "RELEASE_PENDING") {
        return "Release is processing. Keep this chat open for final confirmation.";
      }
      return "Escrow is active. Keep all proof and communication on-platform.";
    }

    if (/(paid|payment sent|payment done|sent payment|utr|reference|receipt)/i.test(body)) {
      if (status === "OPEN" || status === "PAYMENT_PENDING" || status === "PENDING_PAYMENT") {
        return "Thanks. Please click Mark as Paid so seller can verify and release.";
      }
      return "Payment proof received. Waiting for seller release.";
    }

    if (/(release|unlock|escrow)/i.test(body) || status === "PAYMENT_SENT" || status === "PAID") {
      return "Escrow is locked and awaiting seller release after payment confirmation.";
    }

    if (/(hello|hi|hey|start)/i.test(body) && (status === "OPEN" || status === "PAYMENT_PENDING" || status === "PENDING_PAYMENT")) {
      return "Hello, I am the demo trade assistant. Share payment details here and keep trade on-platform.";
    }

    return "Hello, I am the demo trade assistant.";
  }
}
