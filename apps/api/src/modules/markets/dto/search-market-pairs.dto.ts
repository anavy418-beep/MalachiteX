import { Transform, Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class SearchMarketPairsDto {
  @IsOptional()
  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @Matches(/^[A-Za-z0-9/_ -]*$/)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  limit?: number = 20;
}
