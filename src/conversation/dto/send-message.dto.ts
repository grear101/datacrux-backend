import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  conversationId?: string; // omit to start a new conversation

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  productId?: string; // set this when the customer arrives from an ad for a specific product

  // Capped so nobody can flood the AI with enormous pasted text - every
  // character sent to Claude costs money.
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message: string;
}
