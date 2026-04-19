import { IsInt, IsString, Min } from "class-validator";

export class CreateTradeDto {
  @IsString()
  offerId!: string;

  @IsInt()
  @Min(1)
  amountMinor!: number;
}
