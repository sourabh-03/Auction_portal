import { ArrayMinSize, IsArray, IsEnum, IsString, IsUUID } from 'class-validator';
import { AuctionFormat } from '@prisma/client';

export class CreateAuctionDto {
  @IsUUID()
  prThreadId: string;

  @IsEnum(AuctionFormat)
  format: AuctionFormat;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  inviteeVendorIds: string[];
}
