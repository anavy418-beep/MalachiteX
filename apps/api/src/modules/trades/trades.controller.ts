import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { TradesService } from "./trades.service";
import { CreateTradeDto } from "./dto/create-trade.dto";

@Controller("trades")
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTradeDto) {
    return this.tradesService.create(user.userId, dto);
  }

  @Get(":id")
  getOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tradesService.getByIdForParticipant(user.userId, user.role, id);
  }

  @Post(":id/mark-paid")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  markPaid(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tradesService.markPaid(user.userId, id);
  }

  @Post(":id/release")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  release(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tradesService.releaseEscrow(user.userId, user.role, id);
  }

  @Post(":id/cancel")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  cancel(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tradesService.cancelTrade(user.userId, id);
  }
}
