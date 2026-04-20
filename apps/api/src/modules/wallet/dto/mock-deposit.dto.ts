import { Transform } from "class-transformer";
import { IsString, Matches } from "class-validator";

export class MockDepositDto {
  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @Matches(/^\d+$/)
  amountMinor!: string;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  txRef!: string;
}
