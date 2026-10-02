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

  /** Same as above, but also copies every Datacrux team (superadmin) account. */
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
      // De-duplicated, in case a team account is somehow also a client admin.
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
    console.log(`[sendEmail] Attempting to send "${subject}" to: ${to.join(', ')}`);

    // Defaults to Resend's own test sender, which works immediately with
    // no domain setup - a business's own verified domain can be added
    // later via NOTIFICATIONS_FROM_EMAIL, with no code changes needed.
    const fromAddress = this.config.get<string>('NOTIFICATIONS_FROM_EMAIL') ?? 'Datacrux AMARA <onboarding@resend.dev>';

    // Test mode: while this is set, EVERY email this service sends goes
    // to this one address instead of its real recipients - so testing
    // never accidentally emails a real business, and fake .test seed
    // addresses never cause a silent failure. The real recipient list is
    // kept visible in the email itself. Removing this variable (not
    // changing any code) switches everything back to real delivery.
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
    const resendResult = await response.json().catch(() => null);
    console.log(`[sendEmail] Resend accepted it. Response: ${JSON.stringify(resendResult)}`);
  }
}
