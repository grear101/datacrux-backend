import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAiSettings(clientId: string) {
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    return client.aiSettings ?? {};
  }

  async updateAiSettings(clientId: string, dto: UpdateAiSettingsDto) {
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const currentSettings = (client.aiSettings as Record<string, any>) ?? {};

    // Merge rather than replace, so updating just "tone" doesn't wipe out a
    // greeting the business set earlier.
    const updatedSettings = { ...currentSettings, ...dto };

    const updated = await this.prisma.client.update({
      where: { id: clientId },
      data: { aiSettings: updatedSettings },
    });

    return updated.aiSettings;
  }
}
