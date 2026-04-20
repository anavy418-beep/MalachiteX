import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { MARKET_TIMEFRAMES } from "./dto/get-market-candles.dto";
import { MarketsService } from "./markets.service";

interface WatchPayload {
  symbols?: string[];
}

interface CandleWatchPayload {
  symbol?: string;
  interval?: string;
}

interface SymbolWatchPayload {
  symbol?: string;
}

interface TradesWatchPayload {
  symbol?: string;
  limit?: number;
}

@WebSocketGateway({
  namespace: "markets",
  cors: {
    origin: "*",
  },
})
export class MarketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly marketsService: MarketsService) {
    this.marketsService.attachGateway(this);
  }

  handleConnection(client: Socket) {
    client.emit("market:connection", {
      connected: true,
      streaming: this.marketsService.isStreamingAvailable(),
      updatedAt: Date.now(),
    });
  }

  handleDisconnect(_client: Socket) {}

  @SubscribeMessage("market:watch")
  onWatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: WatchPayload,
  ) {
    const symbols = this.marketsService.registerTickerSymbols(payload.symbols ?? []);

    client.join("market:overview");
    symbols.forEach((symbol) => client.join(`market:${symbol}`));

    const snapshots = this.marketsService.getCachedSnapshots(symbols);
    if (snapshots.length > 0) {
      client.emit("market:bootstrap", { tickers: snapshots });
    }
  }

  @SubscribeMessage("market:unwatch")
  onUnwatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: WatchPayload,
  ) {
    const symbols = this.marketsService.normalizeSymbols(payload.symbols ?? []);
    symbols.forEach((symbol) => client.leave(`market:${symbol}`));
  }

  @SubscribeMessage("market:candles:watch")
  onWatchCandles(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CandleWatchPayload,
  ) {
    const symbol = this.marketsService.normalizeSymbols([payload.symbol ?? ""])[0];
    const interval = String(payload.interval ?? "").trim();

    if (!symbol || !MARKET_TIMEFRAMES.includes(interval as (typeof MARKET_TIMEFRAMES)[number])) {
      client.emit("market:error", { message: "Invalid market candle subscription." });
      return;
    }

    this.marketsService.registerCandleStream(symbol, interval as (typeof MARKET_TIMEFRAMES)[number]);
    client.join(`market-candle:${symbol}:${interval}`);

    const candles = this.marketsService.getCachedCandles(symbol, interval);
    if (candles.length > 0) {
      client.emit("market:candles:bootstrap", { symbol, interval, candles });
    }
  }

  @SubscribeMessage("market:candles:unwatch")
  onUnwatchCandles(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CandleWatchPayload,
  ) {
    const symbol = this.marketsService.normalizeSymbols([payload.symbol ?? ""])[0];
    const interval = String(payload.interval ?? "").trim();
    if (!symbol || !interval) return;
    client.leave(`market-candle:${symbol}:${interval}`);
  }

  @SubscribeMessage("market:orderbook:watch")
  onWatchOrderBook(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SymbolWatchPayload,
  ) {
    const symbol = this.marketsService.normalizeSymbols([payload.symbol ?? ""])[0];
    if (!symbol) {
      client.emit("market:error", { message: "Invalid order book subscription." });
      return;
    }

    this.marketsService.registerOrderBookSymbols([symbol]);
    client.join(`market-orderbook:${symbol}`);

    const cached = this.marketsService.getCachedOrderBook(symbol);
    if (cached) {
      client.emit("market:orderbook:bootstrap", { symbol, orderBook: cached });
      return;
    }

    void this.marketsService
      .getOrderBook(symbol)
      .then((response) => {
        client.emit("market:orderbook:bootstrap", { symbol, orderBook: response.orderBook });
      })
      .catch(() => {});
  }

  @SubscribeMessage("market:orderbook:unwatch")
  onUnwatchOrderBook(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SymbolWatchPayload,
  ) {
    const symbol = this.marketsService.normalizeSymbols([payload.symbol ?? ""])[0];
    if (!symbol) return;
    client.leave(`market-orderbook:${symbol}`);
  }

  @SubscribeMessage("market:trades:watch")
  onWatchTrades(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TradesWatchPayload,
  ) {
    const symbol = this.marketsService.normalizeSymbols([payload.symbol ?? ""])[0];
    if (!symbol) {
      client.emit("market:error", { message: "Invalid recent trades subscription." });
      return;
    }

    const limit = Number.isFinite(payload.limit) ? Number(payload.limit) : 40;
    this.marketsService.registerRecentTradesSymbols([symbol]);
    client.join(`market-trades:${symbol}`);

    const cached = this.marketsService.getCachedRecentTrades(symbol);
    if (cached.length > 0) {
      client.emit("market:trades:bootstrap", { symbol, trades: cached.slice(0, limit) });
      return;
    }

    void this.marketsService
      .getRecentTrades(symbol, limit)
      .then((response) => {
        client.emit("market:trades:bootstrap", { symbol, trades: response.trades });
      })
      .catch(() => {});
  }

  @SubscribeMessage("market:trades:unwatch")
  onUnwatchTrades(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SymbolWatchPayload,
  ) {
    const symbol = this.marketsService.normalizeSymbols([payload.symbol ?? ""])[0];
    if (!symbol) return;
    client.leave(`market-trades:${symbol}`);
  }

  emitTicker(ticker: unknown, symbol: string) {
    this.server.to("market:overview").emit("market:ticker", ticker);
    this.server.to(`market:${symbol}`).emit("market:ticker", ticker);
  }

  emitCandle(candle: unknown, symbol: string, interval: string) {
    this.server.to(`market-candle:${symbol}:${interval}`).emit("market:candle", candle);
  }

  emitOrderBook(orderBook: unknown, symbol: string) {
    this.server.to(`market-orderbook:${symbol}`).emit("market:orderbook", orderBook);
  }

  emitRecentTrade(trade: unknown, symbol: string) {
    this.server.to(`market-trades:${symbol}`).emit("market:trade", trade);
  }
}
