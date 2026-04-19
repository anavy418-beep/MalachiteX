import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
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
import { Request } from "express";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { Public } from "@/common/decorators/public.decorator";
import { okResponse } from "@/common/utils/api-response.util";
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
  async signup(@Body() dto: SignupDto, @Req() req: Request) {
    const data = await this.authService.signup(dto, this.getAuditContext(req));
    return okResponse("Signup successful", data);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: "Login and return auth tokens" })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: "Login successful" })
  @Post("login")
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const data = await this.authService.login(dto, this.getAuditContext(req));
    return okResponse("Login successful", data);
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
    @Req() req: Request,
    @Body() dto: LogoutDto = {},
  ) {
    const data = await this.authService.logout(
      user.userId,
      dto?.refreshToken,
      this.getAuditContext(req),
    );

    return okResponse("Logout successful", data);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Rotate refresh token and return a new access/refresh token pair" })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ description: "Refresh successful" })
  @Post("refresh")
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const data = await this.authService.refresh(dto.refreshToken, this.getAuditContext(req));
    return okResponse("Token refresh successful", data);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Request password reset token" })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({ description: "Password reset request accepted" })
  @Post("forgot-password")
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
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
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
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

  private getAuditContext(req: Request): { ipAddress?: string; userAgent?: string } {
    const forwarded = req.headers["x-forwarded-for"];
    const userAgentHeader = req.headers["user-agent"];
    const userAgent = Array.isArray(userAgentHeader)
      ? userAgentHeader.join("; ")
      : userAgentHeader;
    const ipFromForwarded = Array.isArray(forwarded)
      ? forwarded[0]
      : typeof forwarded === "string"
        ? forwarded.split(",")[0]?.trim()
        : undefined;

    return {
      ipAddress: ipFromForwarded ?? req.ip,
      userAgent,
    };
  }
}
