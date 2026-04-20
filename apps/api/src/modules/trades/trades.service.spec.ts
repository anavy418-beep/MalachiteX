import { BadRequestException, NotFoundException } from "@nestjs/common";
import { OfferStatus, OfferType, TradeStatus } from "@prisma/client";
import { TradesService } from "./trades.service";

describe("TradesService", () => {
  const prisma: any = {
    offer: { findUnique: jest.fn() },
    wallet: { findUnique: jest.fn() },
    trade: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const walletService: any = {};
  const auditService: any = {};
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
      BadRequestException,
    );
  });
});
