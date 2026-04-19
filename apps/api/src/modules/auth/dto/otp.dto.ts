import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsString, Length } from "class-validator";

export enum OtpPurpose {
  LOGIN = "LOGIN",
  PASSWORD_RESET = "PASSWORD_RESET",
}

export enum OtpChannel {
  EMAIL = "EMAIL",
  PHONE = "PHONE",
}

export class RequestOtpDto {
  @ApiProperty({ enum: OtpPurpose })
  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;

  @ApiProperty({ enum: OtpChannel })
  @IsEnum(OtpChannel)
  channel!: OtpChannel;

  @ApiProperty({ description: "Email or phone number" })
  @IsString()
  target!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ enum: OtpPurpose })
  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;

  @ApiProperty({ enum: OtpChannel })
  @IsEnum(OtpChannel)
  channel!: OtpChannel;

  @ApiProperty({ description: "Email or phone number" })
  @IsString()
  target!: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(4, 8)
  code!: string;
}
