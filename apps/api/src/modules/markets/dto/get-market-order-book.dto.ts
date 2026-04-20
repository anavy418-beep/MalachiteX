import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, Matches } from "class-validator";

const ORDER_BOOK_DEPTHS = ["10", "20", "50", "100"] as const;

export class GetMarketOrderBookDto {
  @Transform(({ value }) => String(value ?? "").trim().toUpperCase())
  @IsString()
  @Matches(/^[A-Z0-9]{6,20}$/)
  symbol!: string;

  @Transform(({ value }) => String(value ?? "20").trim())
  @IsOptional()
  @IsIn(ORDER_BOOK_DEPTHS)
  limit: (typeof ORDER_BOOK_DEPTHS)[number] = "20";
}

