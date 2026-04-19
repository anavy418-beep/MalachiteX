import { Module, forwardRef } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuditModule } from "@/modules/audit/audit.module";
import { WalletModule } from "@/modules/wallet/wallet.module";
import { NotificationsModule } from "@/modules/notifications/notifications.module";
import { TradesController } from "./trades.controller";
import { TradesService } from "./trades.service";
import { TradeGateway } from "./trade.gateway";

@Module({
  imports: [forwardRef(() => WalletModule), AuditModule, NotificationsModule, JwtModule.register({})],
  controllers: [TradesController],
  providers: [TradesService, TradeGateway],
  exports: [TradesService, TradeGateway],
})
export class TradesModule {}
