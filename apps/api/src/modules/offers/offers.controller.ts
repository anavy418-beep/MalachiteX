import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { Public } from "@/common/decorators/public.decorator";
import { OffersService } from "./offers.service";
import { CreateOfferDto } from "./dto/create-offer.dto";
import { UpdateOfferStatusDto } from "./dto/update-offer-status.dto";

@Controller("offers")
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Public()
  @Get()
  listActive() {
    return this.offersService.listActive();
  }

  @Get("mine")
  listMine(@CurrentUser() user: RequestUser) {
    return this.offersService.listMine(user.userId);
  }

  @Post()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateOfferDto) {
    return this.offersService.create(user.userId, dto);
  }

  @Patch(":id/status")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  updateStatus(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateOfferStatusDto,
  ) {
    return this.offersService.updateStatus(user.userId, id, dto.status);
  }

  @Delete(":id")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  archive(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.offersService.archive(user.userId, id);
  }
}
