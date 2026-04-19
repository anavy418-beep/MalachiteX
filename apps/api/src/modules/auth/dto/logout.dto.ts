import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class LogoutDto {
  @ApiProperty({ required: false, description: "Refresh token to revoke specific session" })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
