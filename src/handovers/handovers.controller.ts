import { Controller, Get, UseGuards } from '@nestjs/common';
import { HandoversService } from './handovers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('handovers')
@UseGuards(JwtAuthGuard) // viewing handover requests is an admin action
export class HandoversController {
  constructor(private readonly handoversService: HandoversService) {}

  @Get()
  findAll(@CurrentUser() user: { clientId: string }) {
    return this.handoversService.findAll(user.clientId);
  }
}
