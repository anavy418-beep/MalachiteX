import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { resolve } from "node:path";
import { validateEnv } from "./config/env.validation";
import { PrismaModule } from "./common/prisma/prisma.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { BigIntSerializationInterceptor } from "./common/interceptors/bigint-serialization.interceptor";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { WalletModule } from "./modules/wallet/wallet.module";
import { OffersModule } from "./modules/offers/offers.module";
import { TradesModule } from "./modules/trades/trades.module";
import { ChatModule } from "./modules/chat/chat.module";
import { DisputesModule } from "./modules/disputes/disputes.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AdminModule } from "./modules/admin/admin.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { FilesModule } from "./modules/files/files.module";
import { MarketsModule } from "./modules/markets/markets.module";
import { PaperTradingModule } from "./modules/paper-trading/paper-trading.module";
import { RedisModule } from "./modules/redis/redis.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), ".env"),
        resolve(process.cwd(), "../../.env"),
      ],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60,
      },
    ]),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    WalletModule,
    OffersModule,
    TradesModule,
    ChatModule,
    DisputesModule,
    AuditModule,
    AdminModule,
    NotificationsModule,
    FilesModule,
    MarketsModule,
    PaperTradingModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: BigIntSerializationInterceptor,
    },
  ],
})
export class AppModule {}
