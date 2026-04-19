import { IsArray, IsOptional, IsString, MinLength } from "class-validator";

export class CreateDisputeDto {
  @IsString()
  tradeId!: string;

  @IsString()
  @MinLength(5)
  reason!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceKeys?: string[];
}
