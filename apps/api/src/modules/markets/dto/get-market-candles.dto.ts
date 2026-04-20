import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min, Matches } from "class-validator";

export const MARKET_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

export class GetMarketCandlesDto {
  @Transform(({ value }) => String(value ?? "").trim().toUpperCase())
  @IsString()
  @Matches(/^[A-Z0-9]{6,20}$/)
  symbol!: string;

  @IsIn(MARKET_TIMEFRAMES)
  interval!: (typeof MARKET_TIMEFRAMES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(25)
  @Max(500)
  limit?: number = 160;
}
