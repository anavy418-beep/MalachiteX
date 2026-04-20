import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches } from "class-validator";

export class UpdatePaperPositionRiskDto {
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,8})?$/)
  stopLossPrice?: string;

  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,8})?$/)
  takeProfitPrice?: string;
}

