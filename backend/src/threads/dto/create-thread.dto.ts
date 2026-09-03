import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateThreadDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  category: string;

  @IsString()
  @MinLength(1)
  purchaseCode: string;

  @IsString()
  @MinLength(1)
  department: string;

  @IsString()
  @MinLength(1)
  costCentre: string;

  @IsString()
  @MinLength(1)
  tcBuyerName: string;

  @IsString()
  @MinLength(1)
  qtyDescription: string;

  @IsOptional()
  @IsString()
  referralNote?: string;

  @IsOptional()
  @IsDateString()
  resultsNeededBy?: string;
}
