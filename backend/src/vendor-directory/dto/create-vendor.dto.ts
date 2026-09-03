import { ArrayMinSize, IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVendorDto {
  @IsString()
  @MinLength(1)
  companyName: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  registeredCategories: string[];
}
