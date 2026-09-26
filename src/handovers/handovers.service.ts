import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface CreateHandoverInput {
  clientId: string;
  conversationId?: string;
  summary: string;
  customerName?: string;
  customerPhone?: string;
}

@Injectable()
export class HandoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Called whenever AMARA hands a conversation off to a real person. Saves
   * a permanent record first - so nothing gets lost even if the WhatsApp
   * message is missed or the team's phone is off - then builds the same
   * WhatsApp deep-link the team taps to see it, and emails the business's
   * admins so they don't have to be staring at WhatsApp to notice.
   */
  async createHandover(input: CreateHandoverInput) {
    const handover = await this.prisma.handoverRequest.create({
      data: {
        clientId: input.clientId,
        conversationId: input.conversationId,
        summary: input.summary,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
      },
    });

    const client = await this.prisma.client.findUnique({ where: { id: input.clientId } });
    const whatsappLink = this.buildWhatsappLink(client?.whatsappNumber ?? null, input);

    // Same principle as order confirmation: this runs after the real
    // record is already safely saved, and NotificationsService swallows
    // its own failures - a broken email provider can never prevent a
    // handover from being recorded or the WhatsApp link from working.
    await this.notificationsService.notifyNewHandover(input.clientId, {
      handoverId: handover.id,
      summary: input.summary,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
    });

    return { handoverId: handover.id, whatsappLink };
  }

  /**
   * Lists handover requests for this business only, most recent first - for
   * the admin panel's Handovers page. Same tenant-isolation principle as
   * everything else: scoped to clientId at the query level.
   */
  async findAll(clientId: string) {
    return this.prisma.handoverRequest.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private buildWhatsappLink(
    whatsappNumber: string | null,
    details: { summary: string; customerName?: string; customerPhone?: string },
  ): string | null {
    if (!whatsappNumber) return null;
    const digitsOnly = whatsappNumber.replace(/\D/g, '');
    if (!digitsOnly) return null;

    const message =
      `Customer wants to speak to a human\n\n` +
      `Summary: ${details.summary}\n` +
      (details.customerName ? `Name: ${details.customerName}\n` : '') +
      (details.customerPhone ? `Phone: ${details.customerPhone}\n` : '');

    return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
  }
}
