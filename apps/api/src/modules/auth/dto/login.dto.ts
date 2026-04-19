import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "trader@example.com" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: "StrongPass123!" })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ required: false, example: "123456" })
  @IsOptional()
  @IsString()
  otpCode?: string;
}
