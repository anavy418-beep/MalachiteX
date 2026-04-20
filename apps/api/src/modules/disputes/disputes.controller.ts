import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { DisputesService } from "./disputes.service";
import { CreateDisputeDto } from "./dto/create-dispute.dto";
import { ResolveDisputeDto } from "./dto/resolve-dispute.dto";

@Controller("disputes")
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateDisputeDto) {
    return this.disputesService.create(user.userId, dto);
  }

  @Get("mine")
  listMine(@CurrentUser() user: RequestUser) {
    return this.disputesService.listMine(user.userId);
  }

  @Roles(Role.ADMIN)
  @Post(":id/resolve")
  resolve(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.disputesService.resolve(user.userId, id, dto);
  }
}
