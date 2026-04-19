import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";

interface AuditLogInput {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  payload?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: AuditLogInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;

    await client.auditLog.create({
      data: {
        actorId: data.actorId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        payload: data.payload,
      },
    });
  }
}
