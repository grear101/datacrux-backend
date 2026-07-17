import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('clients')
@UseGuards(JwtAuthGuard) // configuring AMARA's persona is an admin action
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get('ai-settings')
  getAiSettings(@CurrentUser() user: { clientId: string }) {
    return this.clientsService.getAiSettings(user.clientId);
  }

  @Patch('ai-settings')
  updateAiSettings(@Body() dto: UpdateAiSettingsDto, @CurrentUser() user: { clientId: string }) {
    return this.clientsService.updateAiSettings(user.clientId, dto);
  }
}
