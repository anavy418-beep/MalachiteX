import { Controller, Get, Patch, Param, ParseUUIDPipe } from "@nestjs/common";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getMine(@CurrentUser() user: RequestUser) {
    return this.notificationsService.getForUser(user.userId);
  }

  @Patch(":id/read")
  markRead(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.notificationsService.markRead(user.userId, id);
  }
}
