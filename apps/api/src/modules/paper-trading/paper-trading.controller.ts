import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { okResponse } from "@/common/utils/api-response.util";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { CancelPaperOrderDto } from "./dto/cancel-paper-order.dto";
import { ClosePaperPositionDto } from "./dto/close-paper-position.dto";
import { CreatePaperOrderDto } from "./dto/create-paper-order.dto";
import { UpdatePaperPositionRiskDto } from "./dto/update-paper-position-risk.dto";
import { PaperTradingService } from "./paper-trading.service";

@Controller("paper-trading")
export class PaperTradingController {
  constructor(private readonly paperTradingService: PaperTradingService) {}

  @Get("account")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async getAccount(@CurrentUser() user: RequestUser) {
    const data = await this.paperTradingService.getAccountSummary(user.userId);
    return okResponse("Demo trading account fetched", data);
  }

  @Post("account")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createAccount(@CurrentUser() user: RequestUser) {
    const data = await this.paperTradingService.createAccount(user.userId);
    return okResponse("Demo trading account ready", data);
  }

  @Post("orders")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async placeOrder(@CurrentUser() user: RequestUser, @Body() dto: CreatePaperOrderDto) {
    const data = await this.paperTradingService.placeOrder(user.userId, dto);
    return okResponse("Paper order accepted", data);
  }

  @Post("positions/:symbol/close")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async closePosition(@CurrentUser() user: RequestUser, @Param() params: ClosePaperPositionDto) {
    const data = await this.paperTradingService.closePosition(user.userId, params.symbol);
    return okResponse("Paper position closed", data);
  }

  @Post("orders/:orderId/cancel")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async cancelOrder(@CurrentUser() user: RequestUser, @Param() params: CancelPaperOrderDto) {
    const data = await this.paperTradingService.cancelOrder(user.userId, params.orderId);
    return okResponse("Paper order cancelled", data);
  }

  @Post("positions/:symbol/risk")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async updatePositionRisk(
    @CurrentUser() user: RequestUser,
    @Param() params: ClosePaperPositionDto,
    @Body() dto: UpdatePaperPositionRiskDto,
  ) {
    const data = await this.paperTradingService.updatePositionRisk(user.userId, params.symbol, dto);
    return okResponse("Paper position risk updated", data);
  }
}
