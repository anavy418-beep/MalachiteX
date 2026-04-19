import { Module } from "@nestjs/common";
import { AuditModule } from "@/modules/audit/audit.module";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";

@Module({
  imports: [AuditModule],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
