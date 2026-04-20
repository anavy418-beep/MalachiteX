import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString } from "class-validator";

export class RefreshTokenDto {
  @ApiProperty({ required: false })
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsOptional()
  @IsString()
  refreshToken!: string;
}
