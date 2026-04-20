import { Module } from "@nestjs/common";
import { AuditModule } from "@/modules/audit/audit.module";
import { MarketsModule } from "@/modules/markets/markets.module";
import { NotificationsModule } from "@/modules/notifications/notifications.module";
import { PaperTradingController } from "./paper-trading.controller";
import { PaperTradingService } from "./paper-trading.service";

@Module({
  imports: [AuditModule, NotificationsModule, MarketsModule],
  controllers: [PaperTradingController],
  providers: [PaperTradingService],
  exports: [PaperTradingService],
})
export class PaperTradingModule {}
