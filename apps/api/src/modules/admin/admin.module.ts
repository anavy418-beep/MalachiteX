import { Module } from "@nestjs/common";
import { DisputesModule } from "@/modules/disputes/disputes.module";
import { WalletModule } from "@/modules/wallet/wallet.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [WalletModule, DisputesModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
