import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, Matches } from "class-validator";

export class CreatePaperOrderDto {
  @Transform(({ value }) => String(value ?? "").trim().toUpperCase())
  @IsString()
  @Matches(/^[A-Z0-9]{6,20}$/)
  symbol!: string;

  @IsIn(["LONG", "SHORT"])
  positionType!: "LONG" | "SHORT";

  @IsIn(["BUY", "SELL"])
  side!: "BUY" | "SELL";

  @IsIn(["MARKET", "LIMIT"])
  orderType!: "MARKET" | "LIMIT";

  @Transform(({ value }) => String(value ?? "1").trim())
  @IsIn(["1", "2", "5", "10"])
  leverage!: "1" | "2" | "5" | "10";

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @Matches(/^\d+(\.\d{1,8})?$/)
  quantity!: string;

  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,8})?$/)
  limitPrice?: string;

  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,8})?$/)
  stopLossPrice?: string;

  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,8})?$/)
  takeProfitPrice?: string;
}
