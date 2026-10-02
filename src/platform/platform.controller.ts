import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { OnboardClientDto } from './dto/onboard-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformAdminGuard) // Datacrux team only - order matters, JWT first
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Post('clients')
  onboardClient(@Body() dto: OnboardClientDto, @CurrentUser() user: { userId: string }) {
    return this.platformService.onboardClient(dto, user.userId);
  }

  @Get('clients')
  listClients() {
    return this.platformService.listClients();
  }

  @Get('clients/:id')
  getClientDetail(@Param('id') id: string) {
    return this.platformService.getClientDetail(id);
  }

  @Patch('clients/:id')
  updateClient(@Param('id') id: string, @Body() dto: UpdateClientDto, @CurrentUser() user: { userId: string }) {
    return this.platformService.updateClient(id, dto, user.userId);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto, @CurrentUser() user: { userId: string }) {
    return this.platformService.resetPassword(dto.adminUserId, dto.newPassword, user.userId);
  }

  // Testing aid: runs the same daily usage/trial check the 8am cron job
  // runs on its own, right now, instead of waiting until tomorrow morning.
  @Post('run-notifications-check')
  runNotificationsCheck() {
    return this.platformService.runNotificationsCheck();
  }
}
