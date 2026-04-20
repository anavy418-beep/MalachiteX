import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import {
  NotificationType,
  PaperOrderSide,
  PaperOrderStatus,
  PaperOrderType,
  PaperPositionType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AuditService } from "@/modules/audit/audit.service";
import { MarketsService } from "@/modules/markets/markets.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { CreatePaperOrderDto } from "./dto/create-paper-order.dto";
import { UpdatePaperPositionRiskDto } from "./dto/update-paper-position-risk.dto";
import {
  calculateAveragePriceMinor,
  calculateDirectionalPnlMinor,
  calculateLiquidationPriceMinor,
  calculateMarginMinor,
  calculatePnlPercentString,
  multiplyScaled,
  normalizeTradingSymbol,
  parseDecimalToScaledBigInt,
  prorateCostBasis,
  scaledBigIntToDecimalString,
} from "./paper-trading.math";

const DEFAULT_ACCOUNT_BALANCE_MINOR = parseDecimalToScaledBigInt("100000");
const SUPPORTED_LEVERAGES = new Set([1, 2, 5, 10]);

type ExecutionReason = "MANUAL" | "LIMIT" | "STOP_LOSS" | "TAKE_PROFIT" | "LIQUIDATION";

type ExecutionRequest = {
  userId: string;
  accountId: string;
  symbol: string;
  positionType: PaperPositionType;
  side: PaperOrderSide;
  leverage: number;
  quantityAtomic: bigint;
  executedPriceMinor: bigint;
  limitPriceMinor?: bigint | null;
  stopLossPriceMinor?: bigint | null;
  takeProfitPriceMinor?: bigint | null;
  triggerReason: ExecutionReason;
  existingOrderId?: string | null;
};

type ExecutionResult = {
  userId: string;
  title: string;
  message: string;
};

type TriggerMarketContext = {
  markPriceMinor: bigint;
  bestBidMinor: bigint | null;
  bestAskMinor: bigint | null;
};

@Injectable()
export class PaperTradingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaperTradingService.name);
  private readonly processingSymbols = new Set<string>();
  private unsubscribeTickerListener: (() => void) | null = null;
  private unsubscribeOrderBookListener: (() => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly marketsService: MarketsService,
  ) {}

  onModuleInit() {
    this.unsubscribeTickerListener = this.marketsService.registerTickerListener((ticker) =>
      this.processSymbolTriggers(ticker.symbol, parseDecimalToScaledBigInt(ticker.lastPrice)),
    );
    this.unsubscribeOrderBookListener = this.marketsService.registerOrderBookListener((orderBook) => {
      const markPriceMinor = this.getMarkFromOrderBook(orderBook.bestBid, orderBook.bestAsk);
      if (!markPriceMinor) {
        return;
      }
      return this.processSymbolTriggers(orderBook.symbol, markPriceMinor);
    });
  }

  onModuleDestroy() {
    this.unsubscribeTickerListener?.();
    this.unsubscribeOrderBookListener?.();
  }

  private buildPaperTradingNotificationData(
    data?: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    return {
      ...(data ?? {}),
      domain: "DEMO_TRADING",
    } as Prisma.InputJsonValue;
  }

  private async notifyPaperTrading(
    userId: string,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ) {
    await this.notificationsService.create({
      userId,
      type: NotificationType.SYSTEM,
      title,
      message,
      data: this.buildPaperTradingNotificationData(data),
    });
  }

  async createAccount(userId: string) {
    const existing = await this.prisma.paperTradingAccount.findUnique({
      where: { userId },
    });

    if (!existing) {
      await this.prisma.paperTradingAccount.create({
        data: {
          userId,
          currency: "USDT",
          balanceMinor: DEFAULT_ACCOUNT_BALANCE_MINOR,
        },
      });

      await this.auditService.log({
        actorId: userId,
        action: "PAPER_TRADING_ACCOUNT_CREATED",
        entityType: "PaperTradingAccount",
        entityId: userId,
        payload: {
          balanceMinor: DEFAULT_ACCOUNT_BALANCE_MINOR.toString(),
          currency: "USDT",
        },
      });

      await this.notifyPaperTrading(
        userId,
        "Demo trading ready",
        "Your Malachitex paper trading account has been created.",
      );
    }

    return this.getAccountSummary(userId);
  }

  async getAccountSummary(userId: string) {
    await this.syncAccountState(userId);

    const account = await this.prisma.paperTradingAccount.findUnique({
      where: { userId },
      include: {
        positions: {
          orderBy: { updatedAt: "desc" },
        },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        tradeHistory: {
          orderBy: { closedAt: "desc" },
          take: 50,
        },
      },
    });

    if (!account) {
      throw new NotFoundException("Demo trading account not found");
    }

    const trackedSymbols = [
      ...new Set([
        ...account.positions.map((position) => position.symbol),
        ...account.orders
          .filter((order) => order.status === PaperOrderStatus.OPEN)
          .map((order) => order.symbol),
      ]),
    ];
    const priceMap = await this.getPriceMap(trackedSymbols);

    const positions = account.positions.map((position) => {
      const livePriceMinor = priceMap.get(position.symbol) ?? position.averageEntryPriceMinor;
      const currentNotionalMinor = multiplyScaled(livePriceMinor, position.quantityAtomic);
      const unrealizedPnlMinor = calculateDirectionalPnlMinor(
        position.type,
        position.averageEntryPriceMinor,
        livePriceMinor,
        position.quantityAtomic,
      );

      return {
        id: position.id,
        symbol: position.symbol,
        positionType: position.type,
        leverage: position.leverage,
        baseAsset: position.baseAsset,
        quoteAsset: position.quoteAsset,
        quantity: scaledBigIntToDecimalString(position.quantityAtomic),
        quantityAtomic: position.quantityAtomic.toString(),
        averageEntryPrice: scaledBigIntToDecimalString(position.averageEntryPriceMinor),
        averageEntryPriceMinor: position.averageEntryPriceMinor.toString(),
        currentPrice: scaledBigIntToDecimalString(livePriceMinor),
        currentPriceMinor: livePriceMinor.toString(),
        currentNotional: scaledBigIntToDecimalString(currentNotionalMinor),
        currentNotionalMinor: currentNotionalMinor.toString(),
        margin: scaledBigIntToDecimalString(position.marginMinor),
        marginMinor: position.marginMinor.toString(),
        liquidationPrice: position.liquidationPriceMinor
          ? scaledBigIntToDecimalString(position.liquidationPriceMinor)
          : null,
        liquidationPriceMinor: position.liquidationPriceMinor?.toString() ?? null,
        stopLossPrice: position.stopLossPriceMinor
          ? scaledBigIntToDecimalString(position.stopLossPriceMinor)
          : null,
        stopLossPriceMinor: position.stopLossPriceMinor?.toString() ?? null,
        takeProfitPrice: position.takeProfitPriceMinor
          ? scaledBigIntToDecimalString(position.takeProfitPriceMinor)
          : null,
        takeProfitPriceMinor: position.takeProfitPriceMinor?.toString() ?? null,
        unrealizedPnl: scaledBigIntToDecimalString(unrealizedPnlMinor),
        unrealizedPnlMinor: unrealizedPnlMinor.toString(),
        unrealizedPnlPercent: calculatePnlPercentString(unrealizedPnlMinor, position.marginMinor),
        openedAt: position.openedAt,
        updatedAt: position.updatedAt,
      };
    });

    const usedMarginMinor = account.positions.reduce(
      (total, position) => total + position.marginMinor,
      0n,
    );
    const reservedOrderMarginMinor = account.orders.reduce(
      (total, order) =>
        order.status === PaperOrderStatus.OPEN ? total + order.reservedMarginMinor : total,
      0n,
    );
    const unrealizedPnlMinor = positions.reduce(
      (total, position) => total + BigInt(position.unrealizedPnlMinor),
      0n,
    );
    const equityMinor =
      account.balanceMinor + usedMarginMinor + reservedOrderMarginMinor + unrealizedPnlMinor;

    return {
      account: {
        id: account.id,
        currency: account.currency,
        balance: scaledBigIntToDecimalString(account.balanceMinor),
        balanceMinor: account.balanceMinor.toString(),
        usedMargin: scaledBigIntToDecimalString(usedMarginMinor),
        usedMarginMinor: usedMarginMinor.toString(),
        reservedOrderMargin: scaledBigIntToDecimalString(reservedOrderMarginMinor),
        reservedOrderMarginMinor: reservedOrderMarginMinor.toString(),
        realizedPnl: scaledBigIntToDecimalString(account.realizedPnlMinor),
        realizedPnlMinor: account.realizedPnlMinor.toString(),
        unrealizedPnl: scaledBigIntToDecimalString(unrealizedPnlMinor),
        unrealizedPnlMinor: unrealizedPnlMinor.toString(),
        equity: scaledBigIntToDecimalString(equityMinor),
        equityMinor: equityMinor.toString(),
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
      positions,
      orders: account.orders.map((order) => ({
        id: order.id,
        symbol: order.symbol,
        positionType: order.positionType,
        side: order.side,
        leverage: order.leverage,
        type: order.type,
        status: order.status,
        quantity: scaledBigIntToDecimalString(order.quantityAtomic),
        quantityAtomic: order.quantityAtomic.toString(),
        limitPrice: order.limitPriceMinor ? scaledBigIntToDecimalString(order.limitPriceMinor) : null,
        limitPriceMinor: order.limitPriceMinor?.toString() ?? null,
        executedPrice: order.executedPriceMinor
          ? scaledBigIntToDecimalString(order.executedPriceMinor)
          : null,
        executedPriceMinor: order.executedPriceMinor?.toString() ?? null,
        reservedMargin: scaledBigIntToDecimalString(order.reservedMarginMinor),
        reservedMarginMinor: order.reservedMarginMinor.toString(),
        notional: scaledBigIntToDecimalString(order.notionalMinor),
        notionalMinor: order.notionalMinor.toString(),
        stopLossPrice: order.stopLossPriceMinor
          ? scaledBigIntToDecimalString(order.stopLossPriceMinor)
          : null,
        stopLossPriceMinor: order.stopLossPriceMinor?.toString() ?? null,
        takeProfitPrice: order.takeProfitPriceMinor
          ? scaledBigIntToDecimalString(order.takeProfitPriceMinor)
          : null,
        takeProfitPriceMinor: order.takeProfitPriceMinor?.toString() ?? null,
        realizedPnl: scaledBigIntToDecimalString(order.realizedPnlMinor),
        realizedPnlMinor: order.realizedPnlMinor.toString(),
        triggerReason: order.triggerReason,
        filledAt: order.filledAt,
        createdAt: order.createdAt,
      })),
      tradeHistory: account.tradeHistory.map((trade) => ({
        id: trade.id,
        symbol: trade.symbol,
        positionType: trade.positionType,
        leverage: trade.leverage,
        side: trade.side,
        quantity: scaledBigIntToDecimalString(trade.quantityAtomic),
        quantityAtomic: trade.quantityAtomic.toString(),
        entryPrice: scaledBigIntToDecimalString(trade.entryPriceMinor),
        entryPriceMinor: trade.entryPriceMinor.toString(),
        exitPrice: scaledBigIntToDecimalString(trade.exitPriceMinor),
        exitPriceMinor: trade.exitPriceMinor.toString(),
        realizedPnl: scaledBigIntToDecimalString(trade.realizedPnlMinor),
        realizedPnlMinor: trade.realizedPnlMinor.toString(),
        closeReason: this.normalizeCloseReason(trade.closeReason),
        openedAt: trade.openedAt,
        closedAt: trade.closedAt,
      })),
    };
  }

  async placeOrder(userId: string, dto: CreatePaperOrderDto) {
    const symbol = normalizeTradingSymbol(dto.symbol);
    if (!symbol.endsWith("USDT")) {
      throw new BadRequestException("Paper trading currently supports USDT pairs only.");
    }
    this.marketsService.registerTickerSymbols([symbol]);
    this.marketsService.registerOrderBookSymbols([symbol]);

    const leverage = Number.parseInt(dto.leverage, 10);
    if (!SUPPORTED_LEVERAGES.has(leverage)) {
      throw new BadRequestException("Supported leverage values are 1x, 2x, 5x, and 10x.");
    }

    const quantityAtomic = parseDecimalToScaledBigInt(dto.quantity);
    if (quantityAtomic <= 0n) {
      throw new BadRequestException("Quantity must be greater than zero.");
    }

    const positionType =
      dto.positionType === "SHORT" ? PaperPositionType.SHORT : PaperPositionType.LONG;
    const side = dto.side === "SELL" ? PaperOrderSide.SELL : PaperOrderSide.BUY;
    const orderType = dto.orderType === "LIMIT" ? PaperOrderType.LIMIT : PaperOrderType.MARKET;
    const stopLossPriceMinor = dto.stopLossPrice
      ? parseDecimalToScaledBigInt(dto.stopLossPrice)
      : null;
    const takeProfitPriceMinor = dto.takeProfitPrice
      ? parseDecimalToScaledBigInt(dto.takeProfitPrice)
      : null;

    const account = await this.prisma.paperTradingAccount.findUnique({
      where: { userId },
      include: {
        positions: {
          where: { symbol },
        },
        orders: {
          where: { symbol, status: PaperOrderStatus.OPEN },
        },
      },
    });

    if (!account) {
      throw new NotFoundException("Demo trading account not found");
    }

    if (account.orders.length > 0) {
      throw new BadRequestException("Resolve the existing open limit order for this pair first.");
    }

    const existingPosition = account.positions[0] ?? null;
    const openingSide = this.getOpeningSide(positionType);
    const isOpeningOrder = side === openingSide;

    if (existingPosition && existingPosition.type !== positionType) {
      throw new BadRequestException("Close the current demo position before switching direction.");
    }

    if (!existingPosition && !isOpeningOrder) {
      throw new BadRequestException("There is no open demo position to reduce on this pair.");
    }

    if (existingPosition && !isOpeningOrder && existingPosition.quantityAtomic < quantityAtomic) {
      throw new BadRequestException("Close quantity exceeds the current demo position size.");
    }

    if (existingPosition && isOpeningOrder && existingPosition.leverage !== leverage) {
      throw new BadRequestException("Increase orders must use the same leverage as the open position.");
    }

    if (!isOpeningOrder && (stopLossPriceMinor || takeProfitPriceMinor)) {
      throw new BadRequestException("Stop loss and take profit can only be set when opening a position.");
    }

    if (orderType === PaperOrderType.MARKET) {
      const executedPriceMinor = await this.getExecutablePriceMinor(symbol, side);
      this.validateRiskLevels(positionType, executedPriceMinor, stopLossPriceMinor, takeProfitPriceMinor);

      const result = await this.executeImmediateOrder({
        userId,
        accountId: account.id,
        symbol,
        positionType,
        side,
        leverage: existingPosition?.leverage ?? leverage,
        quantityAtomic,
        executedPriceMinor,
        stopLossPriceMinor,
        takeProfitPriceMinor,
        triggerReason: "MANUAL",
      });

      if (result) {
        await this.notifyPaperTrading(
          result.userId,
          `Demo trading: ${result.title}`,
          result.message,
          {
            symbol,
            side,
            positionType,
          },
        );
      }

      return this.getAccountSummary(userId);
    }

    if (!dto.limitPrice) {
      throw new BadRequestException("Limit price is required for limit orders.");
    }

    const limitPriceMinor = parseDecimalToScaledBigInt(dto.limitPrice);
    if (limitPriceMinor <= 0n) {
      throw new BadRequestException("Limit price must be greater than zero.");
    }

    const referencePriceMinor =
      existingPosition?.averageEntryPriceMinor ?? (await this.getMarkPriceMinor(symbol));
    this.validateRiskLevels(positionType, referencePriceMinor, stopLossPriceMinor, takeProfitPriceMinor);

    const limitNotionalMinor = multiplyScaled(limitPriceMinor, quantityAtomic);
    const reservedMarginMinor = isOpeningOrder
      ? calculateMarginMinor(limitNotionalMinor, existingPosition?.leverage ?? leverage)
      : 0n;

    if (account.balanceMinor < reservedMarginMinor) {
      throw new BadRequestException("Insufficient demo balance for the reserved limit-order margin.");
    }

    await this.prisma.$transaction(async (tx) => {
      const liveAccount = await tx.paperTradingAccount.findUnique({
        where: { id: account.id },
      });

      if (!liveAccount) {
        throw new NotFoundException("Demo trading account not found");
      }

      await tx.paperTradingAccount.update({
        where: { id: liveAccount.id },
        data: {
          balanceMinor: liveAccount.balanceMinor - reservedMarginMinor,
        },
      });

      const order = await tx.paperOrder.create({
        data: {
          accountId: liveAccount.id,
          symbol,
          positionType,
          side,
          leverage: existingPosition?.leverage ?? leverage,
          type: PaperOrderType.LIMIT,
          status: PaperOrderStatus.OPEN,
          quantityAtomic,
          limitPriceMinor,
          reservedMarginMinor,
          stopLossPriceMinor,
          takeProfitPriceMinor,
          notionalMinor: limitNotionalMinor,
          triggerReason: "LIMIT",
        },
      });

      await this.auditService.log(
        {
          actorId: userId,
          action: "PAPER_LIMIT_ORDER_PLACED",
          entityType: "PaperOrder",
          entityId: order.id,
          payload: {
            symbol,
            positionType,
            side,
            leverage: existingPosition?.leverage ?? leverage,
            quantityAtomic: quantityAtomic.toString(),
            limitPriceMinor: limitPriceMinor.toString(),
            reservedMarginMinor: reservedMarginMinor.toString(),
            stopLossPriceMinor: stopLossPriceMinor?.toString() ?? null,
            takeProfitPriceMinor: takeProfitPriceMinor?.toString() ?? null,
          } as Prisma.InputJsonValue,
        },
        tx,
      );
    });

    await this.notifyPaperTrading(
      userId,
      "Demo trading: paper limit order placed",
      `${dto.positionType} ${dto.side} ${dto.quantity} ${symbol.replace("USDT", "")} at ${dto.limitPrice} USDT.`,
      {
        symbol,
        side,
        positionType,
      },
    );

    await this.processSymbolTriggers(symbol, await this.getMarkPriceMinor(symbol));

    return this.getAccountSummary(userId);
  }

  async closePosition(userId: string, symbol: string) {
    const normalizedSymbol = normalizeTradingSymbol(symbol);
    const account = await this.prisma.paperTradingAccount.findUnique({
      where: { userId },
      include: {
        positions: {
          where: { symbol: normalizedSymbol },
        },
      },
    });

    if (!account) {
      throw new NotFoundException("Demo trading account not found");
    }

    const position = account.positions[0];
    if (!position) {
      throw new NotFoundException("Paper position not found");
    }

    const closeSide = this.getClosingSide(position.type);
    const result = await this.executeImmediateOrder({
      userId,
      accountId: account.id,
      symbol: normalizedSymbol,
      positionType: position.type,
      side: closeSide,
      leverage: position.leverage,
      quantityAtomic: position.quantityAtomic,
      executedPriceMinor: await this.getExecutablePriceMinor(normalizedSymbol, closeSide),
      triggerReason: "MANUAL",
    });

    if (result) {
      await this.notifyPaperTrading(
        result.userId,
        `Demo trading: ${result.title}`,
        result.message,
        {
          symbol: normalizedSymbol,
          positionType: position.type,
        },
      );
    }

    return this.getAccountSummary(userId);
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.paperOrder.findFirst({
      where: {
        id: orderId,
        status: PaperOrderStatus.OPEN,
        type: PaperOrderType.LIMIT,
        account: { is: { userId } },
      },
      include: {
        account: {
          select: {
            id: true,
            balanceMinor: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException("Open paper order not found");
    }

    await this.prisma.$transaction(async (tx) => {
      const liveOrder = await tx.paperOrder.findUnique({
        where: { id: order.id },
        include: {
          account: {
            select: {
              id: true,
              balanceMinor: true,
            },
          },
        },
      });

      if (!liveOrder || liveOrder.status !== PaperOrderStatus.OPEN) {
        throw new BadRequestException("Order is no longer open.");
      }

      await tx.paperTradingAccount.update({
        where: { id: liveOrder.account.id },
        data: {
          balanceMinor: liveOrder.account.balanceMinor + liveOrder.reservedMarginMinor,
        },
      });

      await tx.paperOrder.update({
        where: { id: liveOrder.id },
        data: {
          status: PaperOrderStatus.CANCELLED,
          triggerReason: "MANUAL_CANCEL",
        },
      });

      await this.auditService.log(
        {
          actorId: userId,
          action: "PAPER_LIMIT_ORDER_CANCELLED",
          entityType: "PaperOrder",
          entityId: liveOrder.id,
          payload: {
            symbol: liveOrder.symbol,
            reservedMarginMinor: liveOrder.reservedMarginMinor.toString(),
          } as Prisma.InputJsonValue,
        },
        tx,
      );
    });

    await this.notifyPaperTrading(
      userId,
      "Demo trading: paper order cancelled",
      `Pending order on ${order.symbol.replace("USDT", "/USDT")} was cancelled.`,
      {
        symbol: order.symbol,
        orderId: order.id,
      },
    );

    return this.getAccountSummary(userId);
  }

  async updatePositionRisk(userId: string, symbol: string, dto: UpdatePaperPositionRiskDto) {
    const normalizedSymbol = normalizeTradingSymbol(symbol);
    if (!dto.stopLossPrice && !dto.takeProfitPrice) {
      throw new BadRequestException("Provide stop loss and/or take profit to update risk.");
    }

    const account = await this.prisma.paperTradingAccount.findUnique({
      where: { userId },
      include: {
        positions: {
          where: { symbol: normalizedSymbol },
        },
      },
    });

    if (!account) {
      throw new NotFoundException("Demo trading account not found");
    }

    const position = account.positions[0];
    if (!position) {
      throw new NotFoundException("Paper position not found");
    }

    const referencePriceMinor = await this.getMarkPriceMinor(normalizedSymbol);
    const nextStopLossMinor = dto.stopLossPrice
      ? parseDecimalToScaledBigInt(dto.stopLossPrice)
      : position.stopLossPriceMinor;
    const nextTakeProfitMinor = dto.takeProfitPrice
      ? parseDecimalToScaledBigInt(dto.takeProfitPrice)
      : position.takeProfitPriceMinor;

    this.validateRiskLevels(position.type, referencePriceMinor, nextStopLossMinor, nextTakeProfitMinor);

    await this.prisma.$transaction(async (tx) => {
      await tx.paperPosition.update({
        where: { id: position.id },
        data: {
          stopLossPriceMinor: nextStopLossMinor,
          takeProfitPriceMinor: nextTakeProfitMinor,
        },
      });

      await this.auditService.log(
        {
          actorId: userId,
          action: "PAPER_POSITION_RISK_UPDATED",
          entityType: "PaperPosition",
          entityId: position.id,
          payload: {
            symbol: normalizedSymbol,
            stopLossPriceMinor: nextStopLossMinor?.toString() ?? null,
            takeProfitPriceMinor: nextTakeProfitMinor?.toString() ?? null,
          } as Prisma.InputJsonValue,
        },
        tx,
      );
    });

    await this.notifyPaperTrading(
      userId,
      "Demo trading: risk updated",
      `Updated stop loss / take profit for ${normalizedSymbol.replace("USDT", "/USDT")}.`,
      {
        symbol: normalizedSymbol,
        stopLossPriceMinor: nextStopLossMinor?.toString() ?? null,
        takeProfitPriceMinor: nextTakeProfitMinor?.toString() ?? null,
      },
    );

    return this.getAccountSummary(userId);
  }

  private async syncAccountState(userId: string) {
    const account = await this.prisma.paperTradingAccount.findUnique({
      where: { userId },
      include: {
        positions: {
          select: { symbol: true },
        },
        orders: {
          where: { status: PaperOrderStatus.OPEN },
          select: { symbol: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundException("Demo trading account not found");
    }

    const symbols = [
      ...new Set([...account.positions.map((position) => position.symbol), ...account.orders.map((order) => order.symbol)]),
    ];
    if (symbols.length === 0) {
      return;
    }

    this.marketsService.registerTickerSymbols(symbols);
    this.marketsService.registerOrderBookSymbols(symbols);

    const priceMap = await this.getPriceMap(symbols);
    await Promise.all(
      [...priceMap.entries()].map(([symbol, priceMinor]) => this.processSymbolTriggers(symbol, priceMinor)),
    );
  }

  private async processSymbolTriggers(symbol: string, fallbackPriceMinor: bigint) {
    if (this.processingSymbols.has(symbol)) {
      return;
    }

    this.processingSymbols.add(symbol);

    try {
      const marketContext = this.getTriggerMarketContext(symbol, fallbackPriceMinor);
      const openOrders = await this.prisma.paperOrder.findMany({
        where: {
          symbol,
          status: PaperOrderStatus.OPEN,
          type: PaperOrderType.LIMIT,
        },
        orderBy: { createdAt: "asc" },
      });

      for (const order of openOrders) {
        if (!order.limitPriceMinor) continue;
        if (
          !this.shouldExecuteLimitOrder(
            order.side,
            order.limitPriceMinor,
            marketContext.bestBidMinor,
            marketContext.bestAskMinor,
            marketContext.markPriceMinor,
          )
        ) {
          continue;
        }

        try {
          const executedPriceMinor = this.resolveLimitExecutionPrice(
            order.side,
            order.limitPriceMinor,
            marketContext.bestBidMinor,
            marketContext.bestAskMinor,
          );
          const result = await this.executeImmediateOrder({
            userId: await this.getUserIdForAccount(order.accountId),
            accountId: order.accountId,
            symbol: order.symbol,
            positionType: order.positionType,
            side: order.side,
            leverage: order.leverage,
            quantityAtomic: order.quantityAtomic,
            executedPriceMinor,
            limitPriceMinor: order.limitPriceMinor,
            stopLossPriceMinor: order.stopLossPriceMinor,
            takeProfitPriceMinor: order.takeProfitPriceMinor,
            triggerReason: "LIMIT",
            existingOrderId: order.id,
          });

          if (result) {
            await this.notifyPaperTrading(
              result.userId,
              `Demo trading: ${result.title}`,
              result.message,
              {
                symbol: order.symbol,
                side: order.side,
                positionType: order.positionType,
              },
            );
          }
        } catch (error) {
          this.logger.debug(
            `Limit order ${order.id} could not be executed: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }

      const positions = await this.prisma.paperPosition.findMany({
        where: { symbol },
      });

      for (const position of positions) {
        const reason = this.getTriggeredCloseReason(position, marketContext.markPriceMinor);
        if (!reason) continue;

        try {
          const result = await this.executeImmediateOrder({
            userId: await this.getUserIdForAccount(position.accountId),
            accountId: position.accountId,
            symbol: position.symbol,
            positionType: position.type,
            side: this.getClosingSide(position.type),
            leverage: position.leverage,
            quantityAtomic: position.quantityAtomic,
            executedPriceMinor: marketContext.markPriceMinor,
            triggerReason: reason,
          });

          if (result) {
            await this.notifyPaperTrading(
              result.userId,
              `Demo trading: ${result.title}`,
              result.message,
              {
                symbol: position.symbol,
                positionType: position.type,
                reason,
              },
            );
          }
        } catch (error) {
          this.logger.debug(
            `Triggered close for ${position.symbol} skipped: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }
    } finally {
      this.processingSymbols.delete(symbol);
    }
  }

  private async executeImmediateOrder(request: ExecutionRequest): Promise<ExecutionResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.paperTradingAccount.findUnique({
        where: { id: request.accountId },
      });

      if (!account) {
        throw new NotFoundException("Demo trading account not found");
      }

      const existingPosition = await tx.paperPosition.findUnique({
        where: {
          accountId_symbol: {
            accountId: request.accountId,
            symbol: request.symbol,
          },
        },
      });

      if (existingPosition && existingPosition.type !== request.positionType) {
        throw new BadRequestException("Close the current demo position before switching direction.");
      }

      const openingSide = this.getOpeningSide(request.positionType);
      const isOpeningOrder = request.side === openingSide;
      const orderNotionalMinor = multiplyScaled(request.executedPriceMinor, request.quantityAtomic);
      const reservedOrder = request.existingOrderId
        ? await tx.paperOrder.findUnique({
            where: { id: request.existingOrderId },
          })
        : null;

      if (request.existingOrderId && (!reservedOrder || reservedOrder.status !== PaperOrderStatus.OPEN)) {
        return null;
      }

      const reservedMarginMinor = reservedOrder?.reservedMarginMinor ?? 0n;

      if (isOpeningOrder) {
        if (existingPosition && existingPosition.leverage !== request.leverage) {
          throw new BadRequestException("Increase orders must use the same leverage as the open position.");
        }

        const marginMinor = calculateMarginMinor(orderNotionalMinor, request.leverage);
        const nextBalanceMinor = account.balanceMinor - marginMinor + reservedMarginMinor;
        if (nextBalanceMinor < 0n) {
          throw new BadRequestException("Insufficient demo balance.");
        }

        await tx.paperTradingAccount.update({
          where: { id: account.id },
          data: {
            balanceMinor: nextBalanceMinor,
          },
        });

        if (existingPosition) {
          const nextQuantityAtomic = existingPosition.quantityAtomic + request.quantityAtomic;
          const nextCostBasisMinor = existingPosition.costBasisMinor + orderNotionalMinor;
          const nextMarginMinor = existingPosition.marginMinor + marginMinor;
          const nextAverageEntryPriceMinor = calculateAveragePriceMinor(
            nextCostBasisMinor,
            nextQuantityAtomic,
          );

          await tx.paperPosition.update({
            where: { id: existingPosition.id },
            data: {
              leverage: request.leverage,
              quantityAtomic: nextQuantityAtomic,
              costBasisMinor: nextCostBasisMinor,
              averageEntryPriceMinor: nextAverageEntryPriceMinor,
              marginMinor: nextMarginMinor,
              liquidationPriceMinor: calculateLiquidationPriceMinor(
                existingPosition.type,
                nextAverageEntryPriceMinor,
                request.leverage,
              ),
              stopLossPriceMinor:
                request.stopLossPriceMinor ?? existingPosition.stopLossPriceMinor ?? null,
              takeProfitPriceMinor:
                request.takeProfitPriceMinor ?? existingPosition.takeProfitPriceMinor ?? null,
            },
          });
        } else {
          const { baseAsset, quoteAsset } = this.splitSymbol(request.symbol);
          await tx.paperPosition.create({
            data: {
              accountId: account.id,
              symbol: request.symbol,
              type: request.positionType,
              leverage: request.leverage,
              baseAsset,
              quoteAsset,
              quantityAtomic: request.quantityAtomic,
              averageEntryPriceMinor: request.executedPriceMinor,
              costBasisMinor: orderNotionalMinor,
              marginMinor,
              liquidationPriceMinor: calculateLiquidationPriceMinor(
                request.positionType,
                request.executedPriceMinor,
                request.leverage,
              ),
              stopLossPriceMinor: request.stopLossPriceMinor ?? null,
              takeProfitPriceMinor: request.takeProfitPriceMinor ?? null,
            },
          });
        }

        const order = reservedOrder
          ? await tx.paperOrder.update({
              where: { id: reservedOrder.id },
              data: {
                status: PaperOrderStatus.FILLED,
                executedPriceMinor: request.executedPriceMinor,
                notionalMinor: orderNotionalMinor,
                realizedPnlMinor: 0n,
                reservedMarginMinor,
                filledAt: new Date(),
              },
            })
          : await tx.paperOrder.create({
              data: {
                accountId: account.id,
                symbol: request.symbol,
                positionType: request.positionType,
                side: request.side,
                leverage: request.leverage,
                type: PaperOrderType.MARKET,
                status: PaperOrderStatus.FILLED,
                quantityAtomic: request.quantityAtomic,
                limitPriceMinor: request.limitPriceMinor ?? null,
                executedPriceMinor: request.executedPriceMinor,
                reservedMarginMinor,
                stopLossPriceMinor: request.stopLossPriceMinor ?? null,
                takeProfitPriceMinor: request.takeProfitPriceMinor ?? null,
                notionalMinor: orderNotionalMinor,
                realizedPnlMinor: 0n,
                triggerReason: request.triggerReason,
                filledAt: new Date(),
              },
            });

        await this.auditService.log(
          {
            actorId: request.userId,
            action: reservedOrder ? "PAPER_LIMIT_ORDER_FILLED" : "PAPER_ORDER_FILLED",
            entityType: "PaperOrder",
            entityId: order.id,
            payload: {
              symbol: request.symbol,
              positionType: request.positionType,
              side: request.side,
              leverage: request.leverage,
              quantityAtomic: request.quantityAtomic.toString(),
              executedPriceMinor: request.executedPriceMinor.toString(),
              marginMinor: marginMinor.toString(),
              stopLossPriceMinor: request.stopLossPriceMinor?.toString() ?? null,
              takeProfitPriceMinor: request.takeProfitPriceMinor?.toString() ?? null,
            } as Prisma.InputJsonValue,
          },
          tx,
        );

        return {
          userId: request.userId,
          title:
            request.triggerReason === "LIMIT" ? "Paper limit order filled" : "Paper position opened",
          message: `${request.positionType} ${request.side} ${scaledBigIntToDecimalString(request.quantityAtomic)} ${request.symbol.replace("USDT", "")} at ${scaledBigIntToDecimalString(request.executedPriceMinor)} USDT.`,
        };
      }

      if (!existingPosition) {
        throw new BadRequestException("No open demo position found for this pair.");
      }

      if (existingPosition.quantityAtomic < request.quantityAtomic) {
        throw new BadRequestException("Close quantity exceeds the current demo position size.");
      }

      const realizedPnlMinor = calculateDirectionalPnlMinor(
        existingPosition.type,
        existingPosition.averageEntryPriceMinor,
        request.executedPriceMinor,
        request.quantityAtomic,
      );
      const releasedCostBasisMinor = prorateCostBasis(
        existingPosition.costBasisMinor,
        existingPosition.quantityAtomic,
        request.quantityAtomic,
      );
      const releasedMarginMinor = prorateCostBasis(
        existingPosition.marginMinor,
        existingPosition.quantityAtomic,
        request.quantityAtomic,
      );
      const remainingQuantityAtomic = existingPosition.quantityAtomic - request.quantityAtomic;
      const remainingCostBasisMinor = existingPosition.costBasisMinor - releasedCostBasisMinor;
      const remainingMarginMinor = existingPosition.marginMinor - releasedMarginMinor;

      await tx.paperTradingAccount.update({
        where: { id: account.id },
        data: {
          balanceMinor: account.balanceMinor + releasedMarginMinor + realizedPnlMinor + reservedMarginMinor,
          realizedPnlMinor: account.realizedPnlMinor + realizedPnlMinor,
        },
      });

      if (remainingQuantityAtomic === 0n) {
        await tx.paperPosition.delete({
          where: { id: existingPosition.id },
        });
      } else {
        await tx.paperPosition.update({
          where: { id: existingPosition.id },
          data: {
            quantityAtomic: remainingQuantityAtomic,
            costBasisMinor: remainingCostBasisMinor,
            marginMinor: remainingMarginMinor,
            averageEntryPriceMinor: calculateAveragePriceMinor(
              remainingCostBasisMinor,
              remainingQuantityAtomic,
            ),
            liquidationPriceMinor: calculateLiquidationPriceMinor(
              existingPosition.type,
              calculateAveragePriceMinor(remainingCostBasisMinor, remainingQuantityAtomic),
              existingPosition.leverage,
            ),
          },
        });
      }

      const order = reservedOrder
        ? await tx.paperOrder.update({
            where: { id: reservedOrder.id },
            data: {
              status: PaperOrderStatus.FILLED,
              executedPriceMinor: request.executedPriceMinor,
              notionalMinor: orderNotionalMinor,
              realizedPnlMinor,
              reservedMarginMinor,
              filledAt: new Date(),
            },
          })
        : await tx.paperOrder.create({
            data: {
              accountId: account.id,
              symbol: request.symbol,
              positionType: request.positionType,
              side: request.side,
              leverage: existingPosition.leverage,
              type: PaperOrderType.MARKET,
              status: PaperOrderStatus.FILLED,
              quantityAtomic: request.quantityAtomic,
              limitPriceMinor: request.limitPriceMinor ?? null,
              executedPriceMinor: request.executedPriceMinor,
              reservedMarginMinor,
              notionalMinor: orderNotionalMinor,
              realizedPnlMinor,
              triggerReason: request.triggerReason,
              filledAt: new Date(),
            },
          });

      await tx.paperTradeHistory.create({
        data: {
          accountId: account.id,
          orderId: order.id,
          symbol: request.symbol,
          positionType: existingPosition.type,
          leverage: existingPosition.leverage,
          side: request.side,
          quantityAtomic: request.quantityAtomic,
          entryPriceMinor: existingPosition.averageEntryPriceMinor,
          exitPriceMinor: request.executedPriceMinor,
          realizedPnlMinor,
          closeReason: request.triggerReason === "LIMIT" ? "MANUAL" : request.triggerReason,
          openedAt: existingPosition.openedAt,
          closedAt: new Date(),
        },
      });

      await this.auditService.log(
        {
          actorId: request.userId,
          action:
            request.triggerReason === "MANUAL"
              ? "PAPER_POSITION_REDUCED"
              : "PAPER_POSITION_AUTO_CLOSED",
          entityType: "PaperOrder",
          entityId: order.id,
          payload: {
            symbol: request.symbol,
            positionType: existingPosition.type,
            side: request.side,
            leverage: existingPosition.leverage,
            triggerReason: request.triggerReason,
            quantityAtomic: request.quantityAtomic.toString(),
            realizedPnlMinor: realizedPnlMinor.toString(),
          } as Prisma.InputJsonValue,
        },
        tx,
      );

      return {
        userId: request.userId,
        title:
          request.triggerReason === "STOP_LOSS"
            ? "Stop loss triggered"
            : request.triggerReason === "TAKE_PROFIT"
              ? "Take profit triggered"
              : request.triggerReason === "LIQUIDATION"
                ? "Paper position liquidated"
                : "Paper position closed",
        message: `${request.symbol.replace("USDT", "/USDT")} ${existingPosition.type.toLowerCase()} closed at ${scaledBigIntToDecimalString(request.executedPriceMinor)} USDT with ${scaledBigIntToDecimalString(realizedPnlMinor)} USDT realized PnL.`,
      };
    });
  }

  private getOpeningSide(positionType: PaperPositionType) {
    return positionType === PaperPositionType.SHORT ? PaperOrderSide.SELL : PaperOrderSide.BUY;
  }

  private getClosingSide(positionType: PaperPositionType) {
    return positionType === PaperPositionType.SHORT ? PaperOrderSide.BUY : PaperOrderSide.SELL;
  }

  private shouldExecuteLimitOrder(
    side: PaperOrderSide,
    limitPriceMinor: bigint,
    bestBidMinor: bigint | null,
    bestAskMinor: bigint | null,
    markPriceMinor: bigint,
  ) {
    if (side === PaperOrderSide.BUY) {
      if (bestAskMinor !== null) {
        return bestAskMinor <= limitPriceMinor;
      }
      return markPriceMinor <= limitPriceMinor;
    }

    if (bestBidMinor !== null) {
      return bestBidMinor >= limitPriceMinor;
    }
    return markPriceMinor >= limitPriceMinor;
  }

  private resolveLimitExecutionPrice(
    side: PaperOrderSide,
    limitPriceMinor: bigint,
    bestBidMinor: bigint | null,
    bestAskMinor: bigint | null,
  ) {
    if (side === PaperOrderSide.BUY) {
      if (bestAskMinor !== null && bestAskMinor <= limitPriceMinor) {
        return bestAskMinor;
      }
      return limitPriceMinor;
    }

    if (bestBidMinor !== null && bestBidMinor >= limitPriceMinor) {
      return bestBidMinor;
    }
    return limitPriceMinor;
  }

  private getTriggerMarketContext(symbol: string, fallbackPriceMinor: bigint): TriggerMarketContext {
    const orderBook = this.marketsService.getCachedOrderBook(symbol);
    const bestBidMinor = orderBook?.bestBid ? parseDecimalToScaledBigInt(orderBook.bestBid) : null;
    const bestAskMinor = orderBook?.bestAsk ? parseDecimalToScaledBigInt(orderBook.bestAsk) : null;

    const midpoint =
      bestBidMinor !== null && bestAskMinor !== null
        ? (bestBidMinor + bestAskMinor) / 2n
        : null;
    const markPriceMinor = midpoint ?? bestBidMinor ?? bestAskMinor ?? fallbackPriceMinor;

    return {
      markPriceMinor,
      bestBidMinor,
      bestAskMinor,
    };
  }

  private getMarkFromOrderBook(bestBid: string | null, bestAsk: string | null) {
    if (!bestBid || !bestAsk) {
      return null;
    }

    const bidMinor = parseDecimalToScaledBigInt(bestBid);
    const askMinor = parseDecimalToScaledBigInt(bestAsk);
    if (bidMinor <= 0n || askMinor <= 0n || askMinor < bidMinor) {
      return null;
    }

    return (bidMinor + askMinor) / 2n;
  }

  private getTriggeredCloseReason(
    position: {
      type: PaperPositionType;
      liquidationPriceMinor: bigint | null;
      stopLossPriceMinor: bigint | null;
      takeProfitPriceMinor: bigint | null;
    },
    livePriceMinor: bigint,
  ): ExecutionReason | null {
    if (position.type === PaperPositionType.LONG) {
      if (position.liquidationPriceMinor && livePriceMinor <= position.liquidationPriceMinor) {
        return "LIQUIDATION";
      }
      if (position.stopLossPriceMinor && livePriceMinor <= position.stopLossPriceMinor) {
        return "STOP_LOSS";
      }
      if (position.takeProfitPriceMinor && livePriceMinor >= position.takeProfitPriceMinor) {
        return "TAKE_PROFIT";
      }
      return null;
    }

    if (position.liquidationPriceMinor && livePriceMinor >= position.liquidationPriceMinor) {
      return "LIQUIDATION";
    }
    if (position.stopLossPriceMinor && livePriceMinor >= position.stopLossPriceMinor) {
      return "STOP_LOSS";
    }
    if (position.takeProfitPriceMinor && livePriceMinor <= position.takeProfitPriceMinor) {
      return "TAKE_PROFIT";
    }
    return null;
  }

  private validateRiskLevels(
    positionType: PaperPositionType,
    referencePriceMinor: bigint,
    stopLossPriceMinor: bigint | null,
    takeProfitPriceMinor: bigint | null,
  ) {
    if (!stopLossPriceMinor && !takeProfitPriceMinor) {
      return;
    }

    if (positionType === PaperPositionType.LONG) {
      if (stopLossPriceMinor && stopLossPriceMinor >= referencePriceMinor) {
        throw new BadRequestException("Long stop loss must be below the entry or limit price.");
      }
      if (takeProfitPriceMinor && takeProfitPriceMinor <= referencePriceMinor) {
        throw new BadRequestException("Long take profit must be above the entry or limit price.");
      }
      return;
    }

    if (stopLossPriceMinor && stopLossPriceMinor <= referencePriceMinor) {
      throw new BadRequestException("Short stop loss must be above the entry or limit price.");
    }
    if (takeProfitPriceMinor && takeProfitPriceMinor >= referencePriceMinor) {
      throw new BadRequestException("Short take profit must be below the entry or limit price.");
    }
  }

  private async getTicker(symbol: string) {
    const overview = await this.marketsService.getOverview(symbol);
    const ticker = overview.pairs[0];
    if (!ticker) {
      throw new NotFoundException("Live market price unavailable for symbol.");
    }
    return ticker;
  }

  private async getPriceMap(symbols: string[]) {
    const uniqueSymbols = [...new Set(symbols)];
    if (uniqueSymbols.length === 0) return new Map<string, bigint>();

    const markMap = await this.marketsService.getMarkPriceMap(uniqueSymbols);
    const priceMap = new Map(
      [...markMap.entries()].map(([symbol, markPrice]) => [symbol, parseDecimalToScaledBigInt(markPrice)]),
    );

    await Promise.all(
      uniqueSymbols
        .filter((symbol) => !priceMap.has(symbol))
        .map(async (symbol) => {
          const ticker = await this.getTicker(symbol);
          priceMap.set(symbol, parseDecimalToScaledBigInt(ticker.lastPrice));
        }),
    );

    return priceMap;
  }

  private async getMarkPriceMinor(symbol: string) {
    this.marketsService.registerTickerSymbols([symbol]);
    this.marketsService.registerOrderBookSymbols([symbol]);

    const markPriceMap = await this.marketsService.getMarkPriceMap([symbol]);
    const markPrice = markPriceMap.get(symbol);
    if (!markPrice) {
      const ticker = await this.getTicker(symbol);
      return parseDecimalToScaledBigInt(ticker.lastPrice);
    }
    return parseDecimalToScaledBigInt(markPrice);
  }

  private async getExecutablePriceMinor(symbol: string, side: PaperOrderSide) {
    this.marketsService.registerTickerSymbols([symbol]);
    this.marketsService.registerOrderBookSymbols([symbol]);

    const cachedOrderBook = this.marketsService.getCachedOrderBook(symbol);
    if (side === PaperOrderSide.BUY && cachedOrderBook?.bestAsk) {
      return parseDecimalToScaledBigInt(cachedOrderBook.bestAsk);
    }
    if (side === PaperOrderSide.SELL && cachedOrderBook?.bestBid) {
      return parseDecimalToScaledBigInt(cachedOrderBook.bestBid);
    }

    const orderBook = await this.marketsService.getOrderBook(symbol).catch(() => null);
    if (side === PaperOrderSide.BUY && orderBook?.orderBook.bestAsk) {
      return parseDecimalToScaledBigInt(orderBook.orderBook.bestAsk);
    }
    if (side === PaperOrderSide.SELL && orderBook?.orderBook.bestBid) {
      return parseDecimalToScaledBigInt(orderBook.orderBook.bestBid);
    }

    return this.getMarkPriceMinor(symbol);
  }

  private async getUserIdForAccount(accountId: string) {
    const account = await this.prisma.paperTradingAccount.findUnique({
      where: { id: accountId },
      select: { userId: true },
    });

    if (!account) {
      throw new NotFoundException("Demo trading account not found");
    }

    return account.userId;
  }

  private splitSymbol(symbol: string) {
    if (symbol.endsWith("USDT")) {
      return {
        baseAsset: symbol.slice(0, -4),
        quoteAsset: "USDT",
      };
    }

    return {
      baseAsset: symbol.slice(0, 3),
      quoteAsset: symbol.slice(3),
    };
  }

  private normalizeCloseReason(
    closeReason: string | null,
  ): "manual" | "stop_loss" | "take_profit" | "liquidation" | null {
    if (!closeReason) return null;

    switch (closeReason) {
      case "STOP_LOSS":
        return "stop_loss";
      case "TAKE_PROFIT":
        return "take_profit";
      case "LIQUIDATION":
        return "liquidation";
      default:
        return "manual";
    }
  }
}
