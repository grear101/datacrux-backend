import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateClientDto {
  @IsOptional()
  @IsIn(['standard', 'premium', 'enterprise'])
  plan?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  conversationLimit?: number;

  // Explicitly clears conversationLimit to null (unlimited). Kept separate
  // from conversationLimit itself so "don't touch this field" (omitted)
  // and "set it to unlimited" (this flag) can't be confused in a PATCH.
  @IsOptional()
  @IsBoolean()
  unlimited?: boolean;

  @IsOptional()
  @IsIn(['trial', 'active', 'suspended'])
  subscription?: string;

  // Adds this many days to trialEndsAt, counted from right now.
  @IsOptional()
  @IsInt()
  @Min(1)
  extendTrialDays?: number;

  @IsOptional()
  @IsBoolean()
  setupFeePaid?: boolean;
}
