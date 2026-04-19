import { Injectable, NotFoundException } from "@nestjs/common";
import { TradeStatus } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(userId: string) {
    const [wallet, openTrades, activeOffers, unreadNotifications] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.prisma.trade.count({
        where: {
          OR: [{ buyerId: userId }, { sellerId: userId }],
          status: {
            in: [
              TradeStatus.OPEN,
              TradeStatus.PAYMENT_PENDING,
              TradeStatus.PAYMENT_SENT,
              TradeStatus.RELEASE_PENDING,
              TradeStatus.DISPUTED,
              TradeStatus.PENDING_PAYMENT,
              TradeStatus.PAID,
            ],
          },
        },
      }),
      this.prisma.offer.count({ where: { userId, status: "ACTIVE" } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    return {
      wallet: {
        currency: wallet.currency,
        availableBalanceMinor: wallet.availableBalanceMinor.toString(),
        escrowBalanceMinor: wallet.escrowBalanceMinor.toString(),
      },
      openTrades,
      activeOffers,
      unreadNotifications,
    };
  }
}
