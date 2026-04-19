import { Body, Controller, Get, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { WalletService } from "./wallet.service";
import { MockDepositDto } from "./dto/mock-deposit.dto";
import { CreateWithdrawalDto } from "./dto/create-withdrawal.dto";

@Controller("wallet")
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  getWallet(@CurrentUser() user: RequestUser) {
    return this.walletService.getWallet(user.userId);
  }

  @Get("deposits")
  listDeposits(@CurrentUser() user: RequestUser) {
    return this.walletService.listDeposits(user.userId);
  }

  @Get("withdrawals")
  listWithdrawals(@CurrentUser() user: RequestUser) {
    return this.walletService.listWithdrawals(user.userId);
  }

  @Post("withdrawals")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  requestWithdrawal(@CurrentUser() user: RequestUser, @Body() dto: CreateWithdrawalDto) {
    return this.walletService.requestWithdrawal(user.userId, dto);
  }

  @Post("mock-deposit")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  mockDeposit(@CurrentUser() user: RequestUser, @Body() dto: MockDepositDto) {
    return this.walletService.mockDeposit(user.userId, dto);
  }
}
