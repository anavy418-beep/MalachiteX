import { Global, Module } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS_CLIENT } from "@/common/constants/redis.constants";
import { RedisService } from "./redis.service";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
          maxRetriesPerRequest: 2,
        });

        redis.on("error", (error) => {
          if (process.env.NODE_ENV !== "test") {
            console.warn("[Redis] connection issue:", error.message);
          }
        });

        return redis;
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
