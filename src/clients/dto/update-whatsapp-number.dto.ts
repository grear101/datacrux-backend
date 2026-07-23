import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateWhatsappNumberDto {
  @IsString()
  @IsNotEmpty()
  whatsappNumber: string; // any format is fine - the backend strips it down to digits only
}
