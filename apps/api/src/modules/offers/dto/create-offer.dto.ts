import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { OfferType } from "@prisma/client";

export class CreateOfferDto {
  @IsEnum(OfferType)
  type!: OfferType;

  @Transform(({ value }) => String(value ?? "").trim().toUpperCase())
  @IsString()
  @Matches(/^[A-Z0-9]{2,12}$/)
  asset!: string;

  @Transform(({ value }) => String(value ?? "").trim().toUpperCase())
  @IsString()
  @Matches(/^[A-Z]{3,6}$/)
  fiatCurrency!: string;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @Matches(/^\d+$/)
  priceMinor!: string;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @Matches(/^\d+$/)
  minAmountMinor!: string;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @Matches(/^\d+$/)
  maxAmountMinor!: string;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  paymentMethod!: string;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  paymentReceiverName?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/)
  paymentUpiId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MaxLength(80)
  paymentBankName?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @MaxLength(34)
  @Matches(/^[A-Z0-9\- ]{4,34}$/i)
  paymentAccountNumber?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim().toUpperCase();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
  paymentIfsc?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  terms?: string;
}
