import { Module } from "@nestjs/common";
import { AuditModule } from "@/modules/audit/audit.module";
import { TradesModule } from "@/modules/trades/trades.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [AuditModule, TradesModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
