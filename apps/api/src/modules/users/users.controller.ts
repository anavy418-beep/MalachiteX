import { Controller, Get } from "@nestjs/common";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("dashboard")
  getDashboard(@CurrentUser() user: RequestUser) {
    return this.usersService.getDashboard(user.userId);
  }
}
