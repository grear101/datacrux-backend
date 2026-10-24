import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Free text: sizes, colors, material, coverage/quantity details (e.g.
  // "1 roll covers 2 square meters") - separate from the marketing-style
  // description above, so AMARA has a clear place to look for detailed
  // questions and quantity calculations.
  @IsOptional()
  @IsString()
  specifications?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsNumber()
  @IsPositive()
  minPrice: number;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isService?: boolean;
}
