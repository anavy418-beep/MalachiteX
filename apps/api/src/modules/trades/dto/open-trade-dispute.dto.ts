import { IsOptional, IsString, MinLength } from "class-validator";

export class OpenTradeDisputeDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  reason?: string;
}
