import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const prisma: any = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    wallet: {
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const jwtService: any = {
    signAsync: jest.fn(),
    verify: jest.fn(),
    decode: jest.fn(),
  };

  const auditService: any = {
    log: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findFirst.mockReset();
    prisma.user.create.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.wallet.create.mockReset();
    prisma.refreshToken.create.mockReset();
    prisma.refreshToken.findUnique.mockReset();
    prisma.refreshToken.update.mockReset();
    prisma.refreshToken.updateMany.mockReset();
    prisma.passwordResetToken.create.mockReset();
    prisma.passwordResetToken.findUnique.mockReset();
    prisma.passwordResetToken.update.mockReset();
    prisma.$transaction.mockReset();
    jwtService.signAsync.mockReset();
    jwtService.verify.mockReset();
    jwtService.decode.mockReset();

    process.env.JWT_ACCESS_SECRET = "test-access-secret";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
    process.env.JWT_ACCESS_EXPIRES_IN = "15m";
    process.env.JWT_REFRESH_EXPIRES_IN = "7d";
    process.env.BCRYPT_ROUNDS = "8";

    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));

    jwtService.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

    service = new AuthService(prisma, jwtService, auditService);
  });

  it("creates user on signup and returns issued tokens", async () => {
    jwtService.signAsync
      .mockResolvedValueOnce("access-token")
      .mockResolvedValueOnce("refresh-token");

    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "user-1",
      email: "new@example.com",
      username: "new_user",
      role: Role.USER,
      isEmailVerified: false,
      createdAt: new Date(),
    });

    const result = await service.signup({
      email: "new@example.com",
      username: "new_user",
      password: "Password123!",
    });

    expect(result.issuedTokens.accessToken).toBe("access-token");
    expect(result.issuedTokens.refreshToken).toBe("refresh-token");
    expect(prisma.wallet.create).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "AUTH_SIGNUP" }),
      prisma,
    );
  });

  it("throws conflict when signup email/username already exists", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "existing" });

    await expect(
      service.signup({
        email: "existing@example.com",
        username: "existing",
        password: "Password123!",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("logs in with valid credentials", async () => {
    jwtService.signAsync
      .mockResolvedValueOnce("access-token")
      .mockResolvedValueOnce("refresh-token");

    const passwordHash = await bcrypt.hash("Password123!", 8);

    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      username: "user",
      passwordHash,
      role: Role.USER,
      isEmailVerified: true,
      createdAt: new Date(),
    });

    const result = await service.login({
      email: "user@example.com",
      password: "Password123!",
    });

    expect(result.user.email).toBe("user@example.com");
    expect(result.issuedTokens.accessToken).toBe("access-token");
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "AUTH_LOGIN" }),
    );
  });

  it("throws unauthorized on invalid login", async () => {
    const passwordHash = await bcrypt.hash("Password123!", 8);

    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      username: "user",
      passwordHash,
      role: Role.USER,
      isEmailVerified: true,
      createdAt: new Date(),
    });

    await expect(
      service.login({
        email: "user@example.com",
        password: "wrong-password",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rotates refresh token on refresh", async () => {
    const refreshTokenPlain = "refresh-token";
    const refreshHash = await bcrypt.hash(refreshTokenPlain, 8);

    jwtService.verify.mockReturnValue({
      sub: "user-1",
      email: "user@example.com",
      role: Role.USER,
      type: "refresh",
      rtid: "rt-1",
    });

    prisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      tokenHash: refreshHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: "user-1",
        email: "user@example.com",
        username: "user",
        role: Role.USER,
        isEmailVerified: true,
        createdAt: new Date(),
      },
    });

    jwtService.signAsync
      .mockResolvedValueOnce("new-access-token")
      .mockResolvedValueOnce("new-refresh-token");

    const result = await service.refresh(refreshTokenPlain);

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: "rt-1" },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.issuedTokens.accessToken).toBe("new-access-token");
    expect(result.issuedTokens.refreshToken).toBe("new-refresh-token");
  });
});
