import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS_CLIENT } from "@/common/constants/redis.constants";

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async publish(channel: string, payload: unknown): Promise<number> {
    return this.redis.publish(channel, JSON.stringify(payload));
  }

  async setWithTtl(key: string, value: string, ttlSec: number): Promise<void> {
    await this.redis.set(key, value, "EX", ttlSec);
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
