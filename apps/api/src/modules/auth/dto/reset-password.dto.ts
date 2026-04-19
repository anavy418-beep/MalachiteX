import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ResetPasswordDto {
  @ApiProperty({ description: "Password reset token from forgot-password flow" })
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
