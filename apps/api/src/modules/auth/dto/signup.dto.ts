import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsString, Matches, MinLength } from "class-validator";

export class SignupDto {
  @ApiProperty({ example: "trader@example.com" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "trader_one" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9_]{3,30}$/)
  username!: string;

  @ApiProperty({ minLength: 8, example: "StrongPass123!" })
  @IsString()
  @MinLength(8)
  password!: string;
}
