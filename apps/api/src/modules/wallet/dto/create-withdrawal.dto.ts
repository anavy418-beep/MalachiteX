import { IsInt, IsString, Min } from "class-validator";

export class CreateWithdrawalDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  destination!: string;
}
