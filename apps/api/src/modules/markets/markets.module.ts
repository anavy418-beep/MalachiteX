import { Module } from "@nestjs/common";
import { MarketsController } from "./markets.controller";
import { MarketsGateway } from "./markets.gateway";
import { MarketsService } from "./markets.service";

@Module({
  controllers: [MarketsController],
  providers: [MarketsService, MarketsGateway],
  exports: [MarketsService],
})
export class MarketsModule {}
