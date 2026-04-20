import { Transform } from "class-transformer";
import { IsOptional, IsString, MinLength } from "class-validator";

export class SendTradeMessageDto {
  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsString()
  attachmentKey?: string;
}
