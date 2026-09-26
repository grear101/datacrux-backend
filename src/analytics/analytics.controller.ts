import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard) // viewing analytics is an admin action
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: { clientId: string }, @Query('days') days?: string) {
    const parsedDays = days ? parseInt(days, 10) : 30;
    const safeDays = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 30;
    return this.analyticsService.getSummary(user.clientId, safeDays);
  }
}
