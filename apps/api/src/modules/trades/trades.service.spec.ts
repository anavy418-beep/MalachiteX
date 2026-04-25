import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { OfferStatus, OfferType, TradeStatus } from "@prisma/client";
import { TradesService } from "./trades.service";

describe("TradesService", () => {
  const prisma: any = {
    offer: { findUnique: jest.fn() },
    wallet: { findUnique: jest.fn() },
    trade: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const walletService: any = {
    postTradeEscrowHold: jest.fn(),
    postTradeEscrowRelease: jest.fn(),
    postTradeEscrowRefund: jest.fn(),
  };
  const auditService: any = { log: jest.fn() };
  const notificationsService: any = { create: jest.fn() };
  const tradeGateway: any = { notifyTradeStatus: jest.fn() };

  let service: TradesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TradesService(
      prisma,
      walletService,
      auditService,
      notificationsService,
      tradeGateway,
    );
  });

  it("creates a trade and moves seller funds to escrow", async () => {
    prisma.offer.findUnique.mockResolvedValue({
      id: "offer-1",
      userId: "seller-1",
      status: OfferStatus.ACTIVE,
      type: OfferType.SELL,
      asset: "USDT",
      fiatCurrency: "INR",
      paymentMethod: "UPI",
      paymentDetails: null,
      minAmountMinor: BigInt(100),
      maxAmountMinor: BigInt(100000),
      priceMinor: BigInt(8300),
    });

    prisma.wallet.findUnique
      .mockResolvedValueOnce({ id: "wallet-seller", userId: "seller-1", availableBalanceMinor: BigInt(50000) })
      .mockResolvedValueOnce({ id: "wallet-buyer", userId: "buyer-1", availableBalanceMinor: BigInt(1000) });

    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        trade: {
          create: jest.fn().mockResolvedValue({
            id: "trade-1",
            offerId: "offer-1",
            buyerId: "buyer-1",
            sellerId: "seller-1",
            amountMinor: BigInt(1000),
            fiatPriceMinor: BigInt(8300),
            fiatTotalMinor: BigInt(83000),
            escrowHeldMinor: BigInt(1000),
            status: "OPEN",
          }),
        },
        tradeEscrowEvent: { create: jest.fn().mockResolvedValue({ id: "event-1" }) },
      }),
    );

    const trade = await service.create("buyer-1", { offerId: "offer-1", amountMinor: "1000" });

    expect(trade.id).toBe("trade-1");
    expect(walletService.postTradeEscrowHold).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        walletId: "wallet-seller",
        userId: "seller-1",
        amountMinor: BigInt(1000),
        tradeId: "trade-1",
      }),
    );
    expect(notificationsService.create).toHaveBeenCalled();
    expect(tradeGateway.notifyTradeStatus).toHaveBeenCalledWith("trade-1", expect.any(Object));
  });

  it("rejects creating trade on own offer", async () => {
    prisma.offer.findUnique.mockResolvedValue({
      id: "offer-1",
      userId: "user-1",
      status: OfferStatus.ACTIVE,
      minAmountMinor: BigInt(1),
      maxAmountMinor: BigInt(1000),
      type: OfferType.SELL,
    });

    await expect(
      service.create("user-1", { offerId: "offer-1", amountMinor: "100" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects missing trade on mark paid", async () => {
    prisma.trade.findUnique.mockResolvedValue(null);

    await expect(service.markPaid("buyer-1", "trade-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects mark paid when actor is not buyer", async () => {
    prisma.trade.findUnique.mockResolvedValue({
      id: "trade-1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      status: TradeStatus.PENDING_PAYMENT,
    });

    await expect(service.markPaid("seller-1", "trade-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
