import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class MarkTradePaidDto {
  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9._\-\/ ]+$/)
  paymentReference?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MaxLength(160)
  @Matches(/^[A-Za-z0-9._\- ()]+$/)
  proofFileName?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MaxLength(120)
  proofMimeType?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MaxLength(240)
  proofUrl?: string;
}
