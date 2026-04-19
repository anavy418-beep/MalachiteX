import { Injectable } from "@nestjs/common";
import { NotificationType, Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        data: input.data,
      },
    });
  }

  getForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }
}
