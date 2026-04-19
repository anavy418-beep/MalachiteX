import { Module } from "@nestjs/common";
import { AuditModule } from "@/modules/audit/audit.module";
import { NotificationsModule } from "@/modules/notifications/notifications.module";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
