import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { UpdateWhatsappNumberDto } from './dto/update-whatsapp-number.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('clients')
@UseGuards(JwtAuthGuard) // configuring AMARA's persona and integration is an admin action
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

  @Get('api-key')
  getApiKey(@CurrentUser() user: { clientId: string }) {
    return this.clientsService.getApiKey(user.clientId);
  }

  @Post('api-key/regenerate')
  regenerateApiKey(@CurrentUser() user: { clientId: string }) {
    return this.clientsService.regenerateApiKey(user.clientId);
  }

  @Get('whatsapp-number')
  getWhatsappNumber(@CurrentUser() user: { clientId: string }) {
    return this.clientsService.getWhatsappNumber(user.clientId);
  }

  @Patch('whatsapp-number')
  updateWhatsappNumber(@Body() dto: UpdateWhatsappNumberDto, @CurrentUser() user: { clientId: string }) {
    return this.clientsService.updateWhatsappNumber(user.clientId, dto.whatsappNumber);
  }
}
