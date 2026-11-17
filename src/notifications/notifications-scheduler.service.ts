import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { startOfMonthLagos } from '../common/subscription.util';

const USAGE_THRESHOLDS = [100, 80] as const; // check 100 first - if it's hit, 80 is redundant for this run
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

@Injectable()
export class NotificationsSchedulerService {
  private readonly logger = new Logger(NotificationsSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Runs once a day at 8am Nigerian time. This is the only thing in the
  // whole app that runs on a timer rather than in response to a request -
  // everything else only ever happens because a customer or an admin did
  // something.
  @Cron('0 8 * * *', { name: 'daily-notifications-check', timeZone: 'Africa/Lagos' })
  async runDailyChecks() {
    this.logger.log('Running daily usage/trial/booking notification check...');
    const clients = await this.eligibleClients();

    for (const client of clients) {
      try {
        await this.checkUsage(client);
        await this.checkTrial(client);
      } catch (err) {
        this.logger.warn(`Notification check failed for client ${client.id}: ${(err as Error).message}`);
      }
    }

    try {
      await this.checkUpcomingBookings();
    } catch (err) {
      this.logger.warn(`Booking reminder check failed: ${(err as Error).message}`);
    }

    this.logger.log(`Daily notification check complete (${clients.length} businesses checked).`);
  }

  /** Every business that isn't suspended and isn't the Datacrux team's own internal account. */
  private eligibleClients() {
    return this.prisma.client.findMany({
      where: {
        subscription: { not: 'suspended' },
        OR: [{ plan: null }, { plan: { not: 'internal' } }],
      },
      select: { id: true, name: true, subscription: true, conversationLimit: true, trialEndsAt: true },
    });
  }

  private async checkUsage(client: { id: string; name: string; conversationLimit: number | null }) {
    if (client.conversationLimit == null) {
      return;
    }

    const usedThisMonth = await this.prisma.conversation.count({
      where: { clientId: client.id, createdAt: { gte: startOfMonthLagos() } },
    });
    const percentUsed = (usedThisMonth / client.conversationLimit) * 100;
    const periodKey = startOfMonthLagos().toISOString().slice(0, 7);

    for (const threshold of USAGE_THRESHOLDS) {
      if (percentUsed < threshold) {
        continue;
      }
      const type = threshold === 100 ? 'usage_100' : 'usage_80';
      const alreadySent = await this.alreadyLogged(client.id, type, periodKey);
      if (alreadySent) {
        continue;
      }

      await this.notificationsService.notifyUsageThreshold(client.id, client.name, {
        percent: threshold,
        used: usedThisMonth,
        limit: client.conversationLimit,
      });
      await this.logSent(client.id, type, periodKey);
      break;
    }
  }

  private async checkTrial(client: { id: string; name: string; subscription: string; trialEndsAt: Date | null }) {
    if (client.subscription !== 'trial' || !client.trialEndsAt) {
      return;
    }

    const periodKey = client.trialEndsAt.toISOString();
    const now = new Date();
    const daysLeft = Math.ceil((client.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (client.trialEndsAt.getTime() < now.getTime()) {
      if (await this.alreadyLogged(client.id, 'trial_expired', periodKey)) {
        return;
      }
      await this.notificationsService.notifyTrialExpired(client.id, client.name);
      await this.logSent(client.id, 'trial_expired', periodKey);
      return;
    }

    if (daysLeft <= 3) {
      if (await this.alreadyLogged(client.id, 'trial_ending', periodKey)) {
        return;
      }
      await this.notificationsService.notifyTrialEnding(client.id, client.name, daysLeft, client.trialEndsAt);
      await this.logSent(client.id, 'trial_ending', periodKey);
    }
  }

  /**
   * Finds confirmed service orders scheduled for "tomorrow" (calendar day,
   * Lagos time) and reminds the business once each, regardless of plan/
   * subscription status - a business that's paid for a real booking
   * should always get reminded about it, even if e.g. mid-trial-expiry.
   */
  private async checkUpcomingBookings() {
    const now = new Date();
    const lagosNow = new Date(now.getTime() + LAGOS_OFFSET_MS);
    const tomorrowLagos = new Date(Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate() + 1));
    const dayAfterLagos = new Date(Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate() + 2));
    // Convert that Lagos-midnight boundary back to the equivalent real UTC instant.
    const windowStart = new Date(tomorrowLagos.getTime() - LAGOS_OFFSET_MS);
    const windowEnd = new Date(dayAfterLagos.getTime() - LAGOS_OFFSET_MS);

    const bookings = await this.prisma.order.findMany({
      where: {
        status: 'confirmed',
        scheduledAt: { gte: windowStart, lt: windowEnd },
      },
      include: { items: { include: { product: true } } },
    });

    for (const order of bookings) {
      const alreadySent = await this.alreadyLogged(order.clientId, 'booking_reminder', order.id);
      if (alreadySent) {
        continue;
      }
      const productName = order.items[0]?.product?.name ?? 'Service';
      await this.notificationsService.notifyUpcomingBooking(order.clientId, {
        orderId: order.id,
        productName,
        customerName: order.customerName ?? 'Unknown customer',
        customerPhone: order.customerPhone ?? '',
        scheduledAt: order.scheduledAt as Date,
      });
      await this.logSent(order.clientId, 'booking_reminder', order.id);
    }
  }

  private async alreadyLogged(clientId: string, type: string, periodKey: string) {
    const existing = await this.prisma.notificationLog.findUnique({
      where: { clientId_type_periodKey: { clientId, type, periodKey } },
    });
    return !!existing;
  }

  private async logSent(clientId: string, type: string, periodKey: string) {
    try {
      await this.prisma.notificationLog.create({ data: { clientId, type, periodKey } });
    } catch {
      // Already logged by a near-simultaneous run - fine, the email
      // itself already went out at most once either way.
    }
  }
}
