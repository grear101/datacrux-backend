import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
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

  async getApiKey(clientId: string) {
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    // Generate one on the fly if this client somehow doesn't have one yet,
    // rather than making the admin panel handle a "no key" empty state.
    if (!client.apiKey) {
      return this.regenerateApiKey(clientId);
    }
    return { apiKey: client.apiKey };
  }

  async regenerateApiKey(clientId: string) {
    // Rotating this deliberately invalidates the old key immediately - any
    // widget still embedded with the old key will start failing auth right
    // away, so the admin panel warns about this before calling it.
    const apiKey = 'dcx_' + crypto.randomBytes(24).toString('hex');
    await this.prisma.client.update({ where: { id: clientId }, data: { apiKey } });
    return { apiKey };
  }
}
