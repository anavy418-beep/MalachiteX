import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { NotificationType, OfferStatus, Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AuditService } from "@/modules/audit/audit.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { CreateOfferDto } from "./dto/create-offer.dto";

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private toResponse(
    offer: {
      id: string;
      userId: string;
      type: string;
      status: OfferStatus;
      asset: string;
      fiatCurrency: string;
      priceMinor: bigint;
      minAmountMinor: bigint;
      maxAmountMinor: bigint;
      paymentMethod: string;
      terms: string | null;
      createdAt: Date;
      updatedAt: Date;
      user?: { username: string } | null;
    },
  ) {
    return {
      ...offer,
      merchantName: offer.user?.username ?? `Trader ${offer.userId.slice(0, 6).toUpperCase()}`,
      priceMinor: offer.priceMinor.toString(),
      minAmountMinor: offer.minAmountMinor.toString(),
      maxAmountMinor: offer.maxAmountMinor.toString(),
    };
  }

  async listActive() {
    const offers = await this.prisma.offer.findMany({
      where: { status: OfferStatus.ACTIVE },
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return offers.map((offer) => this.toResponse(offer));
  }

  async listMine(userId: string) {
    const offers = await this.prisma.offer.findMany({
      where: {
        userId,
        status: { notIn: [OfferStatus.ARCHIVED, OfferStatus.CLOSED] },
      },
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return offers.map((offer) => this.toResponse(offer));
  }

  async create(userId: string, dto: CreateOfferDto) {
    if (dto.minAmountMinor >= dto.maxAmountMinor) {
      throw new BadRequestException("minAmountMinor must be lower than maxAmountMinor");
    }

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
      include: { user: { select: { username: true } } },
    });

    await this.auditService.log({
      actorId: userId,
      action: "OFFER_CREATED",
      entityType: "Offer",
      entityId: offer.id,
      payload: dto as unknown as Prisma.InputJsonValue,
    });

    await this.notificationsService.create({
      userId,
      type: NotificationType.SYSTEM,
      title: "Offer created",
      message: `Offer ${offer.id.slice(0, 8)} created successfully.`,
      data: { offerId: offer.id },
    });

    return this.toResponse(offer);
  }

  async updateStatus(userId: string, id: string, status: OfferStatus) {
    if (status === OfferStatus.ARCHIVED || status === OfferStatus.CLOSED) {
      throw new BadRequestException("Use archive endpoint to archive offers.");
    }

    const offer = await this.prisma.offer.findUnique({ where: { id } });
    if (!offer || offer.status === OfferStatus.ARCHIVED || offer.status === OfferStatus.CLOSED) {
      throw new NotFoundException("Offer not found");
    }
    if (offer.userId !== userId) {
      throw new ForbiddenException("Only offer owner can update status");
    }

    const updated = await this.prisma.offer.update({
      where: { id },
      data: { status },
      include: { user: { select: { username: true } } },
    });

    await this.auditService.log({
      actorId: userId,
      action: "OFFER_STATUS_UPDATED",
      entityType: "Offer",
      entityId: id,
      payload: { status },
    });

    await this.notificationsService.create({
      userId,
      type: NotificationType.SYSTEM,
      title: `Offer ${status === OfferStatus.ACTIVE ? "resumed" : "paused"}`,
      message: `Offer ${id.slice(0, 8)} is now ${status}.`,
      data: { offerId: id, status },
    });

    return this.toResponse(updated);
  }

  async archive(userId: string, id: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id } });
    if (!offer || offer.status === OfferStatus.ARCHIVED || offer.status === OfferStatus.CLOSED) {
      throw new NotFoundException("Offer not found");
    }
    if (offer.userId !== userId) {
      throw new ForbiddenException("Only offer owner can archive");
    }

    const archived = await this.prisma.offer.update({
      where: { id },
      data: { status: OfferStatus.ARCHIVED },
      include: { user: { select: { username: true } } },
    });

    await this.auditService.log({
      actorId: userId,
      action: "OFFER_ARCHIVED",
      entityType: "Offer",
      entityId: id,
    });

    await this.notificationsService.create({
      userId,
      type: NotificationType.SYSTEM,
      title: "Offer archived",
      message: `Offer ${id.slice(0, 8)} archived.`,
      data: { offerId: id },
    });

    return this.toResponse(archived);
  }
}
