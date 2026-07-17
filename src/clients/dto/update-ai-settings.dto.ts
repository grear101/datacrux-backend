import { IsOptional, IsString, MaxLength } from 'class-validator';

// This is deliberately a narrow, structured set of fields - NOT a free-text
// "system prompt" override. It lets a business shape AMARA's personality
// without ever being able to touch the non-negotiable safety rules that live
// in AiService's fixed system prompt (like "never state a price yourself").
export class UpdateAiSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tone?: string; // e.g. "friendly and casual", "formal and professional"

  @IsOptional()
  @IsString()
  @MaxLength(300)
  greeting?: string; // a custom opening line AMARA can use

  @IsOptional()
  @IsString()
  @MaxLength(500)
  businessDescription?: string; // what this business sells / is about

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customInstructions?: string; // e.g. "always mention we offer free shipping over $50"
}
