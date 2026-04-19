import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
  cors: {
    origin: "*",
  },
})
export class TradeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
      });

      client.data.userId = payload.sub;
      client.data.role = payload.role;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {}

  @SubscribeMessage("trade:join")
  onJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { tradeId: string }) {
    client.join(`trade:${payload.tradeId}`);
  }

  @SubscribeMessage("trade:leave")
  onLeave(@ConnectedSocket() client: Socket, @MessageBody() payload: { tradeId: string }) {
    client.leave(`trade:${payload.tradeId}`);
  }

  notifyTradeStatus(tradeId: string, payload: unknown) {
    this.server.to(`trade:${tradeId}`).emit("trade:status:updated", payload);
  }

  notifyNewMessage(tradeId: string, payload: unknown) {
    this.server.to(`trade:${tradeId}`).emit("trade:chat:new", payload);
  }
}
