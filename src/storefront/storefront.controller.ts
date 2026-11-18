import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { UpsertStorefrontDto } from './dto/upsert-storefront.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMine(@CurrentUser() user: { clientId: string }) {
    return this.storefrontService.getMine(user.clientId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  upsert(@Body() dto: UpsertStorefrontDto, @CurrentUser() user: { clientId: string }) {
    return this.storefrontService.upsert(user.clientId, dto);
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  disable(@CurrentUser() user: { clientId: string }) {
    return this.storefrontService.disable(user.clientId);
  }

  @Get('tracking')
  @UseGuards(JwtAuthGuard)
  getTracking(@CurrentUser() user: { clientId: string }) {
    return this.storefrontService.getTracking(user.clientId);
  }

  @Patch('tracking')
  @UseGuards(JwtAuthGuard)
  updateTracking(@Body() dto: UpdateTrackingDto, @CurrentUser() user: { clientId: string }) {
    return this.storefrontService.updateTracking(user.clientId, dto.platform, dto.trackingId);
  }

  // Public - no login. This is what the storefront page itself calls.
  @Get('public/:slug')
  getPublic(@Param('slug') slug: string) {
    return this.storefrontService.getPublic(slug);
  }
}
