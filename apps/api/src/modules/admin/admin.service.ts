import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { DisputesService } from "@/modules/disputes/disputes.service";
import { ResolveDisputeDto } from "@/modules/disputes/dto/resolve-dispute.dto";
import { WalletService } from "@/modules/wallet/wallet.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly disputesService: DisputesService,
  ) {}

  getPendingWithdrawals() {
    return this.walletService.getPendingWithdrawals();
  }

  approveWithdrawal(adminId: string, id: string) {
    return this.walletService.approveWithdrawal(adminId, id);
  }

  rejectWithdrawal(adminId: string, id: string, reason?: string) {
    return this.walletService.rejectWithdrawal(adminId, id, reason);
  }

  listOpenDisputes() {
    return this.disputesService.listOpenDisputes();
  }

  resolveDispute(adminId: string, disputeId: string, dto: ResolveDisputeDto) {
    return this.disputesService.resolve(adminId, disputeId, dto);
  }

  listAuditLogs() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  listUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });
  }

  listTrades() {
    return this.prisma.trade.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
}
