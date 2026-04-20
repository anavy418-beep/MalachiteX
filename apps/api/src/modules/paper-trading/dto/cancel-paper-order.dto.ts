import { Transform } from "class-transformer";
import { IsString, Matches } from "class-validator";

export class CancelPaperOrderDto {
  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/)
  orderId!: string;
}

