import { Transform } from "class-transformer";
import { IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateDisputeDto {
  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  tradeId!: string;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @MinLength(5)
  reason!: string;

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
