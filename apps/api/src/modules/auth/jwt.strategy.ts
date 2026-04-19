import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Role } from "@prisma/client";
import { ExtractJwt, Strategy } from "passport-jwt";

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: "access";
  sid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const accessSecret = process.env.JWT_ACCESS_SECRET;

    if (!accessSecret) {
      throw new Error("JWT_ACCESS_SECRET is required");
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: accessSecret,
    });
  }

  validate(payload: AccessTokenPayload) {
    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type");
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      tokenType: payload.type,
      sessionId: payload.sid,
    };
  }
}
