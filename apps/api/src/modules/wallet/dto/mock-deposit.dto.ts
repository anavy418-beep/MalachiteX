import { IsInt, IsString, Min } from "class-validator";

export class MockDepositDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  txRef!: string;
}
