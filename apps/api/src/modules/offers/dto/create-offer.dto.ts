import { IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";
import { OfferType } from "@prisma/client";

export class CreateOfferDto {
  @IsEnum(OfferType)
  type!: OfferType;

  @IsString()
  asset!: string;

  @IsString()
  fiatCurrency!: string;

  @IsInt()
  @Min(1)
  priceMinor!: number;

  @IsInt()
  @Min(1)
  minAmountMinor!: number;

  @IsInt()
  @Min(1)
  maxAmountMinor!: number;

  @IsString()
  paymentMethod!: string;

  @IsOptional()
  @IsString()
  terms?: string;
}
