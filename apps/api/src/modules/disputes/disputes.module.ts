import { Module } from "@nestjs/common";
import { AuditModule } from "@/modules/audit/audit.module";
import { NotificationsModule } from "@/modules/notifications/notifications.module";
import { TradesModule } from "@/modules/trades/trades.module";
import { DisputesController } from "./disputes.controller";
import { DisputesService } from "./disputes.service";

@Module({
  imports: [TradesModule, AuditModule, NotificationsModule],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
