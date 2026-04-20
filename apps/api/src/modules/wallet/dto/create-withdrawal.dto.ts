import { Transform } from "class-transformer";
import { IsString, Matches } from "class-validator";

export class CreateWithdrawalDto {
  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @Matches(/^\d+$/)
  amountMinor!: string;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  destination!: string;
}
