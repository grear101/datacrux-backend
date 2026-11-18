import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpsertStorefrontDto {
  // Lowercase letters, numbers, and hyphens only - this becomes the public
  // URL path (store.amaraagent.com/<slug>), so it has to be URL-safe.
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'Use only lowercase letters, numbers, and hyphens (e.g. "kunles-kitchen").',
  })
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tagline?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  accentColor?: string; // a hex color, e.g. "#2F6FED"
}
