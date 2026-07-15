import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  message: string;
}