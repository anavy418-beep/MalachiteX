import { IsEnum, IsOptional, IsString } from "class-validator";

export enum DisputeResolutionAction {
  RELEASE_TO_BUYER = "RELEASE_TO_BUYER",
  REFUND_TO_SELLER = "REFUND_TO_SELLER",
}

export class ResolveDisputeDto {
  @IsEnum(DisputeResolutionAction)
  action!: DisputeResolutionAction;

  @IsOptional()
  @IsString()
  note?: string;
}
