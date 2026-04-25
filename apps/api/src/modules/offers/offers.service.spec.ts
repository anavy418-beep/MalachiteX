import { OfferStatus, OfferType } from "@prisma/client";
import { OffersService } from "./offers.service";

describe("OffersService", () => {
  const prisma: any = {
    offer: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const auditService: any = {
    log: jest.fn(),
  };

  const notificationsService: any = {
    create: jest.fn(),
  };

  let service: OffersService;

  const baseOfferRecord = {
    id: "offer-1",
    userId: "user-1",
    type: OfferType.SELL,
    status: OfferStatus.ACTIVE,
    asset: "USDT",
    fiatCurrency: "INR",
    priceMinor: 8350n,
    minAmountMinor: 10000n,
    maxAmountMinor: 50000n,
    paymentMethod: "BANK_TRANSFER",
    paymentDetails: null,
    terms: "Smoke",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.offer.create.mockReset();
    auditService.log.mockReset();
    notificationsService.create.mockReset();
    service = new OffersService(prisma, auditService, notificationsService);
  });

  it("creates offer with payment details when supported", async () => {
    prisma.offer.create.mockResolvedValue({
      ...baseOfferRecord,
      paymentDetails: { receiverName: "Smoke Tester" },
    });

    const result = await service.create("user-1", {
      type: OfferType.SELL,
      asset: "USDT",
      fiatCurrency: "INR",
      priceMinor: "8350",
      minAmountMinor: "10000",
      maxAmountMinor: "50000",
      paymentMethod: "BANK_TRANSFER",
      paymentReceiverName: "Smoke Tester",
      terms: "Smoke",
    });

    expect(prisma.offer.create).toHaveBeenCalledTimes(1);
    expect(prisma.offer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentDetails: { receiverName: "Smoke Tester" },
        }),
      }),
    );
    expect(result.paymentDetails).toEqual({ receiverName: "Smoke Tester" });
  });

  it("retries offer creation without paymentDetails when compatibility error occurs", async () => {
    prisma.offer.create
      .mockRejectedValueOnce(new Error("Unknown arg `paymentDetails` in data.paymentDetails for type OfferCreateInput"))
      .mockResolvedValueOnce(baseOfferRecord);

    const result = await service.create("user-1", {
      type: OfferType.SELL,
      asset: "USDT",
      fiatCurrency: "INR",
      priceMinor: "8350",
      minAmountMinor: "10000",
      maxAmountMinor: "50000",
      paymentMethod: "BANK_TRANSFER",
      paymentReceiverName: "Smoke Tester",
      terms: "Smoke",
    });

    expect(prisma.offer.create).toHaveBeenCalledTimes(2);
    expect(prisma.offer.create.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        data: expect.not.objectContaining({
          paymentDetails: expect.anything(),
        }),
      }),
    );
    expect(result.paymentDetails).toBeNull();
  });
});

