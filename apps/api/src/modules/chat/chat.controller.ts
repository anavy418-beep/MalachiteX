import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { ChatService } from "./chat.service";
import { SendTradeMessageDto } from "./dto/send-trade-message.dto";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get("trades/:tradeId/messages")
  listTradeMessages(
    @CurrentUser() user: RequestUser,
    @Param("tradeId") tradeId: string,
  ) {
    return this.chatService.listTradeMessages(user.userId, tradeId);
  }

  @Post("trades/:tradeId/messages")
  sendTradeMessage(
    @CurrentUser() user: RequestUser,
    @Param("tradeId") tradeId: string,
    @Body() dto: SendTradeMessageDto,
  ) {
    return this.chatService.sendTradeMessage(user.userId, tradeId, dto);
  }
}
