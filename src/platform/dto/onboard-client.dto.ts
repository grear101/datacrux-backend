import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class OnboardClientDto {
  @IsString()
  @MinLength(1)
  businessName: string;

  @IsEmail()
  ownerEmail: string;

  @IsString()
  @MinLength(8)
  ownerPassword: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsIn(['standard', 'premium', 'enterprise'])
  plan: string;

  // Omit entirely for unlimited conversations (suits Enterprise).
  @IsOptional()
  @IsInt()
  @Min(0)
  conversationLimit?: number;

  @IsIn(['trial', 'active'])
  subscription: string;

  // Only used when subscription is 'trial'. Defaults to 7 if omitted.
  @IsOptional()
  @IsInt()
  @Min(1)
  trialDays?: number;

  @IsOptional()
  @IsBoolean()
  setupFeePaid?: boolean;
}
