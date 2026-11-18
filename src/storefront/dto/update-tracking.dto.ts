import { IsIn, IsOptional, IsString } from 'class-validator';
import { TRACKING_PLATFORM_KEYS } from '../tracking-platforms';

export class UpdateTrackingDto {
  @IsIn(TRACKING_PLATFORM_KEYS)
  platform: string;

  // Omit or send an empty string to clear this platform's tracking ID.
  @IsOptional()
  @IsString()
  trackingId?: string;
}
