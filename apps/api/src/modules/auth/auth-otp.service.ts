import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { randomInt } from "node:crypto";
import { RedisService } from "@/modules/redis/redis.service";
import { OtpChannel, OtpPurpose } from "./dto/otp.dto";

@Injectable()
export class AuthOtpService {
  constructor(private readonly redisService: RedisService) {}

  async issueOtp(input: {
    purpose: OtpPurpose;
    channel: OtpChannel;
    target: string;
    ttlSec?: number;
  }) {
    const otp = String(randomInt(100000, 999999));
    const key = this.getKey(input.purpose, input.channel, input.target);
    const hash = await bcrypt.hash(otp, 10);

    await this.redisService.setWithTtl(key, hash, input.ttlSec ?? 300);

    return {
      expiresInSec: input.ttlSec ?? 300,
      otp: process.env.NODE_ENV === "production" ? undefined : otp,
    };
  }

  async verifyOtp(input: {
    purpose: OtpPurpose;
    channel: OtpChannel;
    target: string;
    code: string;
  }): Promise<boolean> {
    const key = this.getKey(input.purpose, input.channel, input.target);
    const hash = await this.redisService.get(key);

    if (!hash) {
      return false;
    }

    return bcrypt.compare(input.code, hash);
  }

  private getKey(purpose: OtpPurpose, channel: OtpChannel, target: string) {
    return `auth:otp:${purpose}:${channel}:${target.toLowerCase()}`;
  }
}
