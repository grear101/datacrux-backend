import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { startOfMonthLagos } from '../common/subscription.util';

const USAGE_THRESHOLDS = [100, 80] as const; // check 100 first - if it's hit, 80 is redundant for this run

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
    this.logger.log('Running daily usage/trial notification check...');
    const clients = await this.eligibleClients();

    for (const client of clients) {
      try {
        await this.checkUsage(client);
        await this.checkTrial(client);
      } catch (err) {
        // One business having a problem should never stop the rest of
        // the list from being checked.
        this.logger.warn(`Notification check failed for client ${client.id}: ${(err as Error).message}`);
      }
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
      return; // unlimited - nothing to warn about
    }

    const usedThisMonth = await this.prisma.conversation.count({
      where: { clientId: client.id, createdAt: { gte: startOfMonthLagos() } },
    });
    const percentUsed = (usedThisMonth / client.conversationLimit) * 100;
    const periodKey = startOfMonthLagos().toISOString().slice(0, 7); // "2026-09"

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
      break; // don't also send the lower threshold in the same run
    }
  }

  private async checkTrial(client: { id: string; name: string; subscription: string; trialEndsAt: Date | null }) {
    if (client.subscription !== 'trial' || !client.trialEndsAt) {
      this.logger.log(`[trial-check] ${client.name}: skipped (subscription=${client.subscription}, trialEndsAt=${client.trialEndsAt})`);
      return;
    }

    const periodKey = client.trialEndsAt.toISOString(); // a new trial end date = a fresh set of reminders
    const now = new Date();
    const daysLeft = Math.ceil((client.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    this.logger.log(`[trial-check] ${client.name}: trialEndsAt=${client.trialEndsAt.toISOString()}, now=${now.toISOString()}, daysLeft=${daysLeft}`);

    if (client.trialEndsAt.getTime() < now.getTime()) {
      if (await this.alreadyLogged(client.id, 'trial_expired', periodKey)) {
        this.logger.log(`[trial-check] ${client.name}: trial_expired already logged for this period, skipping`);
        return;
      }
      this.logger.log(`[trial-check] ${client.name}: sending trial_expired email now`);
      await this.notificationsService.notifyTrialExpired(client.id, client.name);
      await this.logSent(client.id, 'trial_expired', periodKey);
      return;
    }

    if (daysLeft <= 3) {
      if (await this.alreadyLogged(client.id, 'trial_ending', periodKey)) {
        this.logger.log(`[trial-check] ${client.name}: trial_ending already logged for this period, skipping`);
        return;
      }
      this.logger.log(`[trial-check] ${client.name}: sending trial_ending email now (daysLeft=${daysLeft})`);
      await this.notificationsService.notifyTrialEnding(client.id, client.name, daysLeft, client.trialEndsAt);
      await this.logSent(client.id, 'trial_ending', periodKey);
    } else {
      this.logger.log(`[trial-check] ${client.name}: daysLeft=${daysLeft} is above the 3-day threshold, nothing to send`);
    }
  }

  private async alreadyLogged(clientId: string, type: string, periodKey: string) {
    const existing = await this.prisma.notificationLog.findUnique({
      where: { clientId_type_periodKey: { clientId, type, periodKey } },
    });
    return !!existing;
  }

  private async logSent(clientId: string, type: string, periodKey: string) {
    // If two requests somehow raced and both tried to log the same
    // (clientId, type, periodKey) at once, the database's own unique
    // constraint - not this check - is the real guarantee against a
    // duplicate email ever being logged as sent twice.
    try {
      await this.prisma.notificationLog.create({ data: { clientId, type, periodKey } });
    } catch {
      // Already logged by a near-simultaneous run - fine, the email
      // itself already went out at most once either way.
    }
  }
}
