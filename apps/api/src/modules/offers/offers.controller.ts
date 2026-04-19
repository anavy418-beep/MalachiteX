import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
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
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateOfferDto) {
    return this.offersService.create(user.userId, dto);
  }

  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: UpdateOfferStatusDto,
  ) {
    return this.offersService.updateStatus(user.userId, id, dto.status);
  }

  @Delete(":id")
  archive(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.offersService.archive(user.userId, id);
  }
}
