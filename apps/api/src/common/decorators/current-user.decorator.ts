import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Role } from "@prisma/client";

export interface RequestUser {
  userId: string;
  email: string;
  role: Role;
  tokenType: "access";
  sessionId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
