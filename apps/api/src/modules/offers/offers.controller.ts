import { Body, Controller, Get, Post } from "@nestjs/common";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { Public } from "@/common/decorators/public.decorator";
import { OffersService } from "./offers.service";
import { CreateOfferDto } from "./dto/create-offer.dto";

@Controller("offers")
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Public()
  @Get()
  listActive() {
    return this.offersService.listActive();
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateOfferDto) {
    return this.offersService.create(user.userId, dto);
  }
}
