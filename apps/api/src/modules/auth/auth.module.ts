import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuditModule } from "@/modules/audit/audit.module";
import { RedisModule } from "@/modules/redis/redis.module";
import { AuthController } from "./auth.controller";
import { AuthOtpService } from "./auth-otp.service";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [AuditModule, RedisModule, PassportModule, JwtModule.register({ global: false })],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AuthOtpService],
  exports: [AuthService, AuthOtpService],
})
export class AuthModule {}
