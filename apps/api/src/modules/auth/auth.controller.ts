import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from "@nestjs/swagger";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { Public } from "@/common/decorators/public.decorator";
import { okResponse } from "@/common/utils/api-response.util";
import { clearAuthCookies, REFRESH_TOKEN_COOKIE, setAuthCookies } from "./auth-cookie.util";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto } from "./dto/logout.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { SignupDto } from "./dto/signup.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Create account and return auth tokens" })
  @ApiBody({ type: SignupDto })
  @ApiOkResponse({ description: "Signup successful" })
  @ApiTooManyRequestsResponse({ description: "Too many requests" })
  @Post("signup")
  async signup(
    @Body() dto: SignupDto,
    @Req() req: unknown,
    @Res({ passthrough: true }) res: unknown,
  ) {
    const data = await this.authService.signup(dto, this.getAuditContext(req));
    this.writeSessionCookies(res as { cookie: (...args: unknown[]) => void }, data.issuedTokens);
    return okResponse("Signup successful", {
      user: data.user,
      accessToken: data.issuedTokens.accessToken,
      token: data.issuedTokens.accessToken,
    });
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: "Login and return auth tokens" })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: "Login successful" })
  @Post("login")
  async login(@Body() dto: LoginDto, @Req() req: unknown, @Res({ passthrough: true }) res: unknown) {
    const data = await this.authService.login(dto, this.getAuditContext(req));
    this.writeSessionCookies(res as { cookie: (...args: unknown[]) => void }, data.issuedTokens);
    return okResponse("Login successful", {
      user: data.user,
      accessToken: data.issuedTokens.accessToken,
      token: data.issuedTokens.accessToken,
    });
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: "Logout current user; optionally revoke a specific refresh token" })
  @ApiBody({ type: LogoutDto, required: false })
  @ApiOkResponse({ description: "Logout successful" })
  @Post("logout")
  async logout(
    @CurrentUser() user: RequestUser,
    @Req() req: unknown,
    @Res({ passthrough: true }) res: unknown,
    @Body() dto: LogoutDto = {},
  ) {
    const data = await this.authService.logout(
      user.userId,
      this.extractRefreshToken(req, dto),
      this.getAuditContext(req),
    );

    clearAuthCookies(res as { cookie: (...args: unknown[]) => void });
    return okResponse("Logout successful", data);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Rotate refresh token and return a new access/refresh token pair" })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ description: "Refresh successful" })
  @Post("refresh")
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: unknown,
    @Res({ passthrough: true }) res: unknown,
  ) {
    const data = await this.authService.refresh(this.extractRefreshToken(req, dto), this.getAuditContext(req));
    this.writeSessionCookies(res as { cookie: (...args: unknown[]) => void }, data.issuedTokens);
    return okResponse("Token refresh successful", {
      refreshed: true,
      user: data.user,
      accessToken: data.issuedTokens.accessToken,
      token: data.issuedTokens.accessToken,
    });
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Request password reset token" })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ description: "Password reset request accepted" })
  @Post("forgot-password")
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: unknown) {
    const data = await this.authService.forgotPassword(dto.email, this.getAuditContext(req));
    return okResponse("Password reset request accepted", data);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Reset password using reset token" })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ description: "Password reset successful" })
  @Post("reset-password")
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: unknown) {
    const data = await this.authService.resetPassword(dto, this.getAuditContext(req));
    return okResponse("Password reset successful", data);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current authenticated user" })
  @ApiOkResponse({ description: "Current user profile" })
  @Get("me")
  async getCurrentUser(@CurrentUser() user: RequestUser) {
    const data = await this.authService.getCurrentUser(user.userId);
    return okResponse("Current user fetched", data);
  }

  private getAuditContext(req: unknown): { ipAddress?: string; userAgent?: string } {
    const request = req as {
      headers?: Record<string, string | string[] | undefined>;
      ip?: string;
    };
    const forwarded = request.headers?.["x-forwarded-for"];
    const userAgentHeader = request.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader)
      ? userAgentHeader.join("; ")
      : userAgentHeader;
    const ipFromForwarded = Array.isArray(forwarded)
      ? forwarded[0]
      : typeof forwarded === "string"
        ? forwarded.split(",")[0]?.trim()
        : undefined;

    return {
      ipAddress: ipFromForwarded ?? request.ip,
      userAgent,
    };
  }

  private extractRefreshToken(req: unknown, dto?: RefreshTokenDto | LogoutDto) {
    const request = req as { cookies?: Record<string, string | undefined> };
    return dto?.refreshToken ?? request.cookies?.[REFRESH_TOKEN_COOKIE];
  }

  private writeSessionCookies(
    response: unknown,
    issuedTokens: {
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresAt: Date;
      refreshTokenExpiresAt: Date;
    },
  ) {
    setAuthCookies(response as { cookie: (...args: unknown[]) => void }, {
      accessToken: issuedTokens.accessToken,
      refreshToken: issuedTokens.refreshToken,
      accessTokenMaxAgeMs: Math.max(0, issuedTokens.accessTokenExpiresAt.getTime() - Date.now()),
      refreshTokenMaxAgeMs: Math.max(0, issuedTokens.refreshTokenExpiresAt.getTime() - Date.now()),
    });
  }
}
