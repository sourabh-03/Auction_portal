import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { DecrementType, TieBreakRule, Visibility } from '@prisma/client';

export class UpdateEnglishConfigDto {
  @IsOptional() @IsPositive() ceilingPrice?: number;
  @IsOptional() @IsEnum(DecrementType) decrementType?: DecrementType;
  @IsOptional() @IsPositive() decrementValue?: number;
  @IsOptional() @IsInt() @Min(30) durationSec?: number;
  @IsOptional() @IsBoolean() autoExtend?: boolean;
  @IsOptional() @IsInt() @Min(1) triggerWindowSec?: number;
  @IsOptional() @IsInt() @Min(1) extensionLengthSec?: number;
  @IsOptional() @IsInt() @Min(0) maxExtensions?: number;
  @IsOptional() @IsEnum(Visibility) visibility?: Visibility;
  @IsOptional() @IsNumber() @Min(0) reservePrice?: number;
  @IsOptional() @IsEnum(TieBreakRule) tieBreakRule?: TieBreakRule;
}

export class UpdateJapaneseConfigDto {
  @IsOptional() @IsPositive() startingPrice?: number;
  @IsOptional() @IsPositive() floorPrice?: number;
  @IsOptional() @IsPositive() tickDecrement?: number;
  @IsOptional() @IsInt() @Min(1) tickIntervalSec?: number;
  @IsOptional() @IsInt() @Min(1) responseWindowSec?: number;
  @IsOptional() @IsBoolean() autoDrop?: boolean;
  @IsOptional() @IsInt() @Min(0) minVendorsRemaining?: number;
}

export class UpdateAuctionConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEnglishConfigDto)
  english?: UpdateEnglishConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateJapaneseConfigDto)
  japanese?: UpdateJapaneseConfigDto;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  inviteeVendorIds?: string[];
}
