import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

// clientId is intentionally NOT taken from the request body.
// It's attached server-side from the authenticated request context
// (API key / JWT), so a client can never negotiate on another tenant's behalf.
export class EvaluateNegotiationDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @IsPositive()
  requestedPrice: number;

  @IsNumber()
  @IsPositive()
  quantity: number;
}
