import { Injectable } from "@nestjs/common";
import { OfferStatus, Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AuditService } from "@/modules/audit/audit.service";
import { CreateOfferDto } from "./dto/create-offer.dto";

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listActive() {
    const offers = await this.prisma.offer.findMany({
      where: { status: OfferStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return offers.map((offer) => ({
      ...offer,
      priceMinor: offer.priceMinor.toString(),
      minAmountMinor: offer.minAmountMinor.toString(),
      maxAmountMinor: offer.maxAmountMinor.toString(),
    }));
  }

  async create(userId: string, dto: CreateOfferDto) {
    const offer = await this.prisma.offer.create({
      data: {
        userId,
        type: dto.type,
        asset: dto.asset,
        fiatCurrency: dto.fiatCurrency,
        priceMinor: BigInt(dto.priceMinor),
        minAmountMinor: BigInt(dto.minAmountMinor),
        maxAmountMinor: BigInt(dto.maxAmountMinor),
        paymentMethod: dto.paymentMethod,
        terms: dto.terms,
      },
    });

    await this.auditService.log({
      actorId: userId,
      action: "OFFER_CREATED",
      entityType: "Offer",
      entityId: offer.id,
      payload: dto as unknown as Prisma.InputJsonValue,
    });

    return {
      ...offer,
      priceMinor: offer.priceMinor.toString(),
      minAmountMinor: offer.minAmountMinor.toString(),
      maxAmountMinor: offer.maxAmountMinor.toString(),
    };
  }
}
