import { IsOptional, IsString, MinLength } from "class-validator";

export class SendTradeMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  attachmentKey?: string;
}
