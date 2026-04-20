import { Transform } from "class-transformer";
import { IsString, Matches } from "class-validator";

export class CreateTradeDto {
  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  offerId!: string;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @Matches(/^\d+$/)
  amountMinor!: string;
}
