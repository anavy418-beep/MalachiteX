import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { ResolveDisputeDto } from "@/modules/disputes/dto/resolve-dispute.dto";
import { AdminService } from "./admin.service";
import { RejectWithdrawalDto } from "./dto/reject-withdrawal.dto";

@Roles(Role.ADMIN)
@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("withdrawals/pending")
  getPendingWithdrawals() {
    return this.adminService.getPendingWithdrawals();
  }

  @Post("withdrawals/:id/approve")
  approveWithdrawal(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.approveWithdrawal(user.userId, id);
  }

  @Post("withdrawals/:id/reject")
  rejectWithdrawal(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: RejectWithdrawalDto,
  ) {
    return this.adminService.rejectWithdrawal(user.userId, id, dto.reason);
  }

  @Get("disputes/open")
  listOpenDisputes() {
    return this.adminService.listOpenDisputes();
  }

  @Post("disputes/:id/resolve")
  resolveDispute(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.adminService.resolveDispute(user.userId, id, dto);
  }

  @Get("audit-logs")
  listAuditLogs() {
    return this.adminService.listAuditLogs();
  }

  @Get("users")
  listUsers() {
    return this.adminService.listUsers();
  }

  @Get("trades")
  listTrades() {
    return this.adminService.listTrades();
  }
}
