import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AuditService } from "@/modules/audit/audit.service";
import { buildDepositAddresses, buildWalletIdentifier } from "@/modules/wallet/wallet-identity.util";
import { LoginDto } from "./dto/login.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { SignupDto } from "./dto/signup.dto";

interface AuthContext {
  ipAddress?: string;
  userAgent?: string;
}

interface TokenPayloadBase {
  sub: string;
  email: string;
  role: Role;
}

interface AccessTokenPayload extends TokenPayloadBase {
  type: "access";
  sid: string;
}

interface RefreshTokenPayload extends TokenPayloadBase {
  type: "refresh";
  rtid: string;
}

type TxClient = Prisma.TransactionClient;

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  role: Role;
  isEmailVerified: boolean;
  createdAt: Date;
}

interface IssuedAuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async signup(dto: SignupDto, context?: AuthContext) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const normalizedUsername = dto.username.trim();
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { username: normalizedUsername }],
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("Email or username already in use");
    }

    const passwordHash = await bcrypt.hash(dto.password, this.passwordHashRounds);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          username: normalizedUsername,
          passwordHash,
        },
      });

      const addresses = buildDepositAddresses(createdUser.id);

      await tx.wallet.create({
        data: {
          userId: createdUser.id,
          walletIdentifier: buildWalletIdentifier(createdUser.id, "USDT"),
          depositAddressBtc: addresses.BTC,
          depositAddressErc20: addresses.ERC20,
          depositAddressTrc20: addresses.TRC20,
          currency: process.env.DEFAULT_FIAT_CURRENCY ?? "INR",
          availableBalanceMinor: BigInt(0),
          escrowBalanceMinor: BigInt(0),
        },
      });

      await this.auditService.log(
        {
          actorId: createdUser.id,
          action: "AUTH_SIGNUP",
          entityType: "User",
          entityId: createdUser.id,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
          payload: {
            email: createdUser.email,
            username: createdUser.username,
          },
        },
        tx,
      );

      return createdUser;
    });

    const issuedTokens = await this.issueTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: this.toPublicUser(user),
      issuedTokens,
    };
  }

  async login(dto: LoginDto, context?: AuthContext) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    this.logDevelopmentAuthState("login email received", {
      email: normalizedEmail,
    });

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    this.logDevelopmentAuthState("login user lookup completed", {
      email: normalizedEmail,
      userExists: Boolean(user),
    });

    if (!user) {
      await this.recordFailedLogin(normalizedEmail, "user_not_found", context);
      throw new UnauthorizedException("Invalid credentials");
    }

    const validPassword = await this.comparePasswordAgainstStoredHash(
      dto.password,
      user.passwordHash,
      user.id,
    );
    this.logDevelopmentAuthState("login password compare completed", {
      email: normalizedEmail,
      userExists: true,
      passwordComparePassed: validPassword,
    });

    if (!validPassword) {
      await this.recordFailedLogin(normalizedEmail, "invalid_password", context, user.id);
      throw new UnauthorizedException("Invalid credentials");
    }

    const issuedTokens = await this.issueTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    await this.auditService.log({
      actorId: user.id,
      action: "AUTH_LOGIN",
      entityType: "User",
      entityId: user.id,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return {
      user: this.toPublicUser(user),
      issuedTokens,
    };
  }

  async logout(userId: string, refreshToken?: string, context?: AuthContext) {
    if (!refreshToken) {
      await this.revokeAllUserRefreshTokens(userId);
    } else {
      const payload = this.verifyRefreshToken(refreshToken);

      if (payload.sub !== userId) {
        throw new UnauthorizedException("Refresh token does not belong to current user");
      }

      await this.revokeSingleRefreshToken(payload.rtid, userId);
    }

    await this.auditService.log({
      actorId: userId,
      action: "AUTH_LOGOUT",
      entityType: "User",
      entityId: userId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return { loggedOut: true };
  }

  async refresh(refreshToken: string | undefined, context?: AuthContext) {
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token missing");
    }

    const payload = this.verifyRefreshToken(refreshToken);

    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { id: payload.rtid },
      include: { user: true },
    });

    if (!tokenRecord || tokenRecord.userId !== payload.sub) {
      throw new UnauthorizedException("Refresh token not recognized");
    }

    if (tokenRecord.revokedAt || tokenRecord.expiresAt <= new Date()) {
      await this.revokeAllUserRefreshTokens(payload.sub);
      throw new UnauthorizedException("Refresh token expired or revoked");
    }

    const hashMatches = await bcrypt.compare(refreshToken, tokenRecord.tokenHash);

    if (!hashMatches) {
      await this.revokeAllUserRefreshTokens(payload.sub);
      throw new UnauthorizedException("Refresh token invalid");
    }

    const next = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revokedAt: new Date() },
      });

      const issuedTokens = await this.issueTokenPair(
        {
          id: tokenRecord.user.id,
          email: tokenRecord.user.email,
          role: tokenRecord.user.role,
        },
        tx,
      );

      await this.auditService.log(
        {
          actorId: tokenRecord.user.id,
          action: "AUTH_REFRESH",
          entityType: "RefreshToken",
          entityId: tokenRecord.id,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
        tx,
      );

      return {
        user: this.toPublicUser(tokenRecord.user),
        issuedTokens,
      };
    });

    return next;
  }

  async forgotPassword(email: string, context?: AuthContext) {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return { requestAccepted: true };
    }

    const resetTokenId = randomUUID();
    const resetSecret = randomBytes(32).toString("hex");
    const tokenHash = await bcrypt.hash(resetSecret, this.passwordHashRounds);

    await this.prisma.passwordResetToken.create({
      data: {
        id: resetTokenId,
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + this.resetTokenTtlMs),
      },
    });

    await this.auditService.log({
      actorId: user.id,
      action: "AUTH_FORGOT_PASSWORD",
      entityType: "User",
      entityId: user.id,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return {
      requestAccepted: true,
      resetToken:
        process.env.NODE_ENV === "production" ? undefined : `${resetTokenId}.${resetSecret}`,
    };
  }

  async resetPassword(dto: ResetPasswordDto, context?: AuthContext) {
    const [tokenId, secret] = dto.token.split(".");

    if (!tokenId || !secret) {
      throw new BadRequestException("Malformed reset token");
    }

    const resetRecord = await this.prisma.passwordResetToken.findUnique({
      where: { id: tokenId },
      include: { user: true },
    });

    if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt <= new Date()) {
      throw new BadRequestException("Reset token is invalid or expired");
    }

    const isValidSecret = await bcrypt.compare(secret, resetRecord.tokenHash);

    if (!isValidSecret) {
      throw new BadRequestException("Reset token is invalid or expired");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetRecord.userId },
        data: {
          passwordHash: await bcrypt.hash(dto.password, this.passwordHashRounds),
        },
      });

      await tx.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      });

      await tx.refreshToken.updateMany({
        where: { userId: resetRecord.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.auditService.log(
        {
          actorId: resetRecord.userId,
          action: "AUTH_RESET_PASSWORD",
          entityType: "User",
          entityId: resetRecord.userId,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
        tx,
      );
    });

    return { passwordReset: true };
  }

  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.toPublicUser(user);
  }

  private async issueTokenPair(
    user: { id: string; email: string; role: Role },
    tx?: TxClient,
  ): Promise<IssuedAuthTokens> {
    const refreshTokenId = randomUUID();

    const accessTokenPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: "access",
      sid: refreshTokenId,
    };

    const refreshTokenPayload: RefreshTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: "refresh",
      rtid: refreshTokenId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessTokenPayload as unknown as Record<string, unknown>, {
        secret: this.accessSecret,
        expiresIn: this.accessTokenExpiresIn,
      } as never),
      this.jwtService.signAsync(refreshTokenPayload as unknown as Record<string, unknown>, {
        secret: this.refreshSecret,
        expiresIn: this.refreshTokenExpiresIn,
      } as never),
    ]);

    const accessTokenExpiresAt = this.decodeTokenExpiry(accessToken);
    const refreshTokenExpiresAt = this.decodeTokenExpiry(refreshToken);

    const client = tx ?? this.prisma;

    await client.refreshToken.create({
      data: {
        id: refreshTokenId,
        userId: user.id,
        tokenHash: await bcrypt.hash(refreshToken, this.passwordHashRounds),
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    };
  }

  private verifyRefreshToken(refreshToken: string): RefreshTokenPayload {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: this.refreshSecret,
      });

      if (payload.type !== "refresh" || !payload.rtid) {
        throw new UnauthorizedException("Invalid refresh token payload");
      }

      return payload;
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  private decodeTokenExpiry(token: string): Date {
    const decoded = this.jwtService.decode(token) as { exp?: number } | null;

    if (!decoded?.exp) {
      throw new InternalServerErrorException("Could not decode token expiration");
    }

    return new Date(decoded.exp * 1000);
  }

  private async revokeSingleRefreshToken(tokenId: string, userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        id: tokenId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  private async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  private async recordFailedLogin(
    email: string,
    reason: string,
    context?: AuthContext,
    actorId?: string,
  ) {
    const maskedEmail = this.maskEmail(email);
    this.logger.warn(`Failed login attempt for ${maskedEmail} (${reason})`);

    await this.auditService.log({
      actorId,
      action: "AUTH_LOGIN_FAILED",
      entityType: "Auth",
      entityId: actorId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      payload: {
        email: maskedEmail,
        reason,
      },
    });
  }

  private async comparePasswordAgainstStoredHash(
    inputPassword: string,
    storedPasswordHash: string,
    userId: string,
  ) {
    const normalizedStoredHash = storedPasswordHash.trim();
    if (!normalizedStoredHash) {
      return false;
    }

    let bcryptMatched = false;
    try {
      bcryptMatched = await bcrypt.compare(inputPassword, normalizedStoredHash);
    } catch (error) {
      this.logDevelopmentAuthState("bcrypt compare failed for stored credential", {
        userId,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }

    if (bcryptMatched) {
      return true;
    }

    // Backward-compatible recovery path for legacy plaintext credentials.
    if (normalizedStoredHash !== inputPassword) {
      return false;
    }

    const nextPasswordHash = await bcrypt.hash(inputPassword, this.passwordHashRounds);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: nextPasswordHash },
    });

    this.logDevelopmentAuthState("migrated legacy plaintext credential to bcrypt hash", {
      userId,
    });

    return true;
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private logDevelopmentAuthState(message: string, payload: Record<string, unknown>) {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    this.logger.debug(`${message}: ${JSON.stringify(payload)}`);
  }

  private maskEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    const [local = "", domain = ""] = normalized.split("@");
    if (!domain) return "***";
    const visibleLocal = local.slice(0, 2);
    return `${visibleLocal.padEnd(Math.max(local.length, 2), "*")}@${domain}`;
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    username: string;
    role: Role;
    isEmailVerified: boolean;
    createdAt: Date;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    };
  }

  private get accessSecret(): string {
    const value = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;
    if (!value) throw new InternalServerErrorException("JWT_ACCESS_SECRET is not configured");
    return value;
  }

  private get refreshSecret(): string {
    const value = process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET;
    if (!value) throw new InternalServerErrorException("JWT_REFRESH_SECRET is not configured");
    return value;
  }

  private get accessTokenExpiresIn(): string {
    return process.env.JWT_ACCESS_EXPIRES_IN ?? "15m";
  }

  private get refreshTokenExpiresIn(): string {
    return process.env.JWT_REFRESH_EXPIRES_IN ?? "7d";
  }

  private get resetTokenTtlMs(): number {
    const minutes = Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES ?? "15");
    return Math.max(1, minutes) * 60_000;
  }

  private get passwordHashRounds(): number {
    const rounds = Number(process.env.BCRYPT_ROUNDS ?? "12");
    return Number.isFinite(rounds) ? Math.max(8, rounds) : 12;
  }
}
