import { IsOptional, IsString, Matches } from "class-validator";

export class GetMarketOverviewDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9,/_ -]*$/)
  symbols?: string;
}
