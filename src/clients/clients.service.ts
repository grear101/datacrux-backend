import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

const AI_SETTINGS_TTL_SECONDS = 300;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private aiSettingsCacheKey(clientId: string) {
    return `client:aiSettings:${clientId}`;
  }

  /**
   * AMARA's persona settings (tone, greeting, custom instructions) are read
   * fresh from here on every single message in every conversation, but a
   * business only ever changes them occasionally from the AI Persona page.
   * Cached for 5 minutes rather than hitting the database on every chat
   * message.
   */
  async getAiSettings(clientId: string) {
    const cacheKey = this.aiSettingsCacheKey(clientId);
    const cached = await this.redis.getJson<Record<string, any>>(cacheKey);
    if (cached) {
      return cached;
    }

    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const settings = (client.aiSettings as Record<string, any>) ?? {};
    await this.redis.setJson(cacheKey, settings, AI_SETTINGS_TTL_SECONDS);
    return settings;
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

    // The very next chat message for this business should reflect the
    // change immediately, not up to 5 minutes late - so the cache is
    // cleared right away rather than waiting for the TTL to expire.
    await this.redis.del(this.aiSettingsCacheKey(clientId));

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

  async getWhatsappNumber(clientId: string) {
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    return { whatsappNumber: client.whatsappNumber };
  }

  async updateWhatsappNumber(clientId: string, whatsappNumber: string) {
    // Store digits only (with country code) - strips spaces, dashes, plus
    // signs, so it's always ready to use directly in a wa.me link later.
    const digitsOnly = whatsappNumber.replace(/\D/g, '');
    const updated = await this.prisma.client.update({
      where: { id: clientId },
      data: { whatsappNumber: digitsOnly },
    });
    return { whatsappNumber: updated.whatsappNumber };
  }
}
