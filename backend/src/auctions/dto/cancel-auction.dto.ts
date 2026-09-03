import { IsOptional, IsString } from 'class-validator';

export class CancelAuctionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
