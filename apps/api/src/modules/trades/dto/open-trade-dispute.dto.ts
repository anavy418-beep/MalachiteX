import { Transform } from "class-transformer";
import { IsArray, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class OpenTradeDisputeDto {
  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MinLength(5)
  reason?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceKeys?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MaxLength(80)
  paymentReference?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MaxLength(160)
  proofFileName?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MaxLength(240)
  proofUrl?: string;
}
