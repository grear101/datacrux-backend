import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  adminUserId: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
