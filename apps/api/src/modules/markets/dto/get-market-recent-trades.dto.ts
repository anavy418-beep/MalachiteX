import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class GetMarketRecentTradesDto {
  @Transform(({ value }) => String(value ?? "").trim().toUpperCase())
  @IsString()
  @Matches(/^[A-Z0-9]{6,20}$/)
  symbol!: string;

  @Transform(({ value }) => Number.parseInt(String(value ?? "40").trim(), 10))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 40;
}

