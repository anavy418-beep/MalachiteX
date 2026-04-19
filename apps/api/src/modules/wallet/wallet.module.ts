import { Module } from "@nestjs/common";
import { AuditModule } from "@/modules/audit/audit.module";
import { NotificationsModule } from "@/modules/notifications/notifications.module";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";
import { WalletLedgerService } from "./wallet-ledger.service";

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [WalletController],
  providers: [WalletService, WalletLedgerService],
  exports: [WalletService, WalletLedgerService],
})
export class WalletModule {}
