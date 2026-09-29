import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async notifyNewOrder(
    clientId: string,
    details: {
      orderId: string;
      customerName: string;
      productName: string;
      quantity: number;
      finalAmount: number;
    },
  ) {
    const subject = `New order from ${details.customerName}`;
    const html = `
      <p>AMARA just confirmed a new order.</p>
      <ul>
        <li><strong>Customer:</strong> ${details.customerName}</li>
        <li><strong>Product:</strong> ${details.productName} x${details.quantity}</li>
        <li><strong>Total:</strong> ₦${details.finalAmount.toLocaleString('en-NG')}</li>
      </ul>
      <p style="color:#888;font-size:12px">Order ID: ${details.orderId}</p>
    `;
    await this.sendToClientAdmins(clientId, subject, html);
  }

  async notifyNewHandover(
    clientId: string,
    details: {
      handoverId: string;
      summary: string;
      customerName?: string;
      customerPhone?: string;
    },
  ) {
    const subject = 'A customer wants to speak to a real person';
    const html = `
      <p>A customer asked to speak to a real person during a chat with AMARA.</p>
      <p><strong>Summary:</strong> ${details.summary}</p>
      ${details.customerName ? `<p><strong>Name:</strong> ${details.customerName}</p>` : ''}
      ${details.customerPhone ? `<p><strong>Phone:</strong> ${details.customerPhone}</p>` : ''}
      <p style="color:#888;font-size:12px">Handover ID: ${details.handoverId}</p>
    `;
    await this.sendToClientAdmins(clientId, subject, html);
  }

  async notifyAccountSuspended(clientId: string) {
    const subject = 'Your Datacrux account has been suspended';
    const html = `
      <p>Your AMARA chat assistant has been temporarily suspended.</p>
      <p>Your admin panel and order history are still available - only the
      customer-facing chat widget is paused. Please reach out to the
      Datacrux team if you have any questions.</p>
    `;
    await this.sendToClientAdmins(clientId, subject, html);
  }

  async notifyAccountReactivated(clientId: string) {
    const subject = 'Your Datacrux account is active again';
    const html = `
      <p>Good news - your AMARA chat assistant has been reactivated and is
      answering customers again.</p>
    `;
    await this.sendToClientAdmins(clientId, subject, html);
  }

  private async sendToClientAdmins(clientId: string, subject: string, html: string) {
    try {
      const admins = await this.prisma.adminUser.findMany({
        where: { clientId },
        select: { email: true },
      });
      const recipients = admins.map((a) => a.email).filter(Boolean);
      if (recipients.length === 0) {
        return;
      }
      await this.sendEmail(recipients, subject, html);
    } catch (err) {
      // Notifications are a convenience, never something that should be
      // allowed to break the real action (an order, a handover, a
      // suspension) that triggered them - so any failure here is logged,
      // not thrown, and never surfaced to the customer or admin.
      console.warn('Notification failed to send (continuing anyway):', (err as Error).message);
    }
  }

  private async sendEmail(to: string[], subject: string, html: string) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      console.warn('RESEND_API_KEY is not configured - skipping email notification.');
      return;
    }

    // Defaults to Resend's own test sender, which works immediately with
    // no domain setup - a business's own verified domain can be added
    // later via NOTIFICATIONS_FROM_EMAIL, with no code changes needed.
    const fromAddress = this.config.get<string>('NOTIFICATIONS_FROM_EMAIL') ?? 'Datacrux AMARA <onboarding@resend.dev>';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Resend API error: ${errText}`);
    }
  }
}
