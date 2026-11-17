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

  async notifyUsageThreshold(
    clientId: string,
    businessName: string,
    details: { percent: 80 | 100; used: number; limit: number },
  ) {
    const subject =
      details.percent === 100
        ? `${businessName} has reached its monthly conversation limit`
        : `${businessName} is at 80% of its monthly conversation limit`;
    const html =
      details.percent === 100
        ? `
          <p><strong>${businessName}</strong> has used all ${details.limit} conversations included in its plan this month (${details.used} / ${details.limit}).</p>
          <p>New chats are paused for this business until the 1st of next month, or until the plan is upgraded.</p>
        `
        : `
          <p><strong>${businessName}</strong> has used ${details.used} of its ${details.limit} monthly conversations (80%).</p>
          <p>This is just a heads-up - nothing is blocked yet.</p>
        `;
    await this.sendToClientAdminsAndTeam(clientId, subject, html);
  }

  async notifyTrialEnding(clientId: string, businessName: string, daysLeft: number, trialEndsAt: Date) {
    const subject = `${businessName}'s trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
    const html = `
      <p><strong>${businessName}</strong>'s trial ends on ${trialEndsAt.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}.</p>
    `;
    await this.sendToClientAdminsAndTeam(clientId, subject, html);
  }

  async notifyTrialExpired(clientId: string, businessName: string) {
    const subject = `${businessName}'s trial has ended`;
    const html = `
      <p><strong>${businessName}</strong>'s trial has ended - their chat widget is now paused until the account is moved to a paid plan.</p>
    `;
    await this.sendToClientAdminsAndTeam(clientId, subject, html);
  }

  /**
   * A reminder TO THE BUSINESS (not the customer - AMARA never collects a
   * customer email, and there's no automated WhatsApp sending, only a
   * human-tapped link) that a service is scheduled for tomorrow, so
   * nothing gets forgotten.
   */
  async notifyUpcomingBooking(
    clientId: string,
    details: {
      orderId: string;
      productName: string;
      customerName: string;
      customerPhone: string;
      scheduledAt: Date;
    },
  ) {
    const when = details.scheduledAt.toLocaleString('en-NG', {
      timeZone: 'Africa/Lagos',
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
    const subject = `Reminder: ${details.productName} booking tomorrow - ${details.customerName}`;
    const html = `
      <p>A reminder about a booking coming up tomorrow.</p>
      <ul>
        <li><strong>Service:</strong> ${details.productName}</li>
        <li><strong>Customer:</strong> ${details.customerName}</li>
        <li><strong>Phone:</strong> ${details.customerPhone}</li>
        <li><strong>When:</strong> ${when}</li>
      </ul>
      <p style="color:#888;font-size:12px">Order ID: ${details.orderId}</p>
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
      console.warn('Notification failed to send (continuing anyway):', (err as Error).message);
    }
  }

  private async sendToClientAdminsAndTeam(clientId: string, subject: string, html: string) {
    try {
      const [clientAdmins, teamAdmins] = await Promise.all([
        this.prisma.adminUser.findMany({ where: { clientId }, select: { email: true } }),
        this.prisma.adminUser.findMany({ where: { role: 'superadmin' }, select: { email: true } }),
      ]);
      const recipients = [...clientAdmins, ...teamAdmins].map((a) => a.email).filter(Boolean);
      if (recipients.length === 0) {
        return;
      }
      await this.sendEmail([...new Set(recipients)], subject, html);
    } catch (err) {
      console.warn('Notification failed to send (continuing anyway):', (err as Error).message);
    }
  }

  private async sendEmail(to: string[], subject: string, html: string) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      console.warn('RESEND_API_KEY is not configured - skipping email notification.');
      return;
    }

    const fromAddress = this.config.get<string>('NOTIFICATIONS_FROM_EMAIL') ?? 'Datacrux AMARA <onboarding@resend.dev>';

    const testOverride = this.config.get<string>('NOTIFICATIONS_TEST_OVERRIDE_EMAIL');
    const actualTo = testOverride ? [testOverride] : to;
    const actualHtml = testOverride
      ? `<p style="color:#b45309;font-size:12px;background:#fef3c7;padding:8px;border-radius:6px">TEST MODE - this would normally have gone to: ${to.join(', ')}</p>${html}`
      : html;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: actualTo,
        subject,
        html: actualHtml,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[sendEmail] Resend responded with an error: ${response.status} ${errText}`);
      throw new Error(`Resend API error: ${errText}`);
    }
  }
}
