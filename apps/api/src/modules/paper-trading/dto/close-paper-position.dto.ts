import { Transform } from "class-transformer";
import { IsString, Matches } from "class-validator";

export class ClosePaperPositionDto {
  @Transform(({ value }) => String(value ?? "").trim().toUpperCase())
  @IsString()
  @Matches(/^[A-Z0-9]{6,20}$/)
  symbol!: string;
}
