import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsSchedulerService } from '../notifications/notifications-scheduler.service';
import { OnboardClientDto } from './dto/onboard-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { effectiveStatus, startOfMonthLagos } from '../common/subscription.util';

const DEFAULT_TRIAL_DAYS = 7;

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationsScheduler: NotificationsSchedulerService,
  ) {}

  async onboardClient(dto: OnboardClientDto, actorId: string) {
    const existingEmail = await this.prisma.adminUser.findUnique({ where: { email: dto.ownerEmail } });
    if (existingEmail) {
      throw new BadRequestException('An admin account with this email already exists.');
    }

    const trialEndsAt =
      dto.subscription === 'trial'
        ? this.daysFromNow(dto.trialDays ?? DEFAULT_TRIAL_DAYS)
        : null;

    const apiKey = 'dcx_' + crypto.randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(dto.ownerPassword, 10);

    const client = await this.prisma.client.create({
      data: {
        name: dto.businessName,
        apiKey,
        whatsappNumber: dto.whatsappNumber?.replace(/\D/g, '') || null,
        subscription: dto.subscription,
        plan: dto.plan,
        conversationLimit: dto.conversationLimit ?? null,
        trialEndsAt,
        setupFeePaid: dto.setupFeePaid ?? false,
        users: {
          create: {
            email: dto.ownerEmail,
            passwordHash,
            role: 'owner',
          },
        },
      },
      include: { users: true },
    });

    await this.audit(actorId, client.id, 'platform.onboardClient', {
      businessName: dto.businessName,
      plan: dto.plan,
      subscription: dto.subscription,
      conversationLimit: dto.conversationLimit ?? null,
      trialDays: dto.subscription === 'trial' ? dto.trialDays ?? DEFAULT_TRIAL_DAYS : null,
    });

    return {
      clientId: client.id,
      businessName: client.name,
      apiKey: client.apiKey,
      ownerEmail: dto.ownerEmail,
      plan: client.plan,
      subscription: client.subscription,
      trialEndsAt: client.trialEndsAt,
    };
  }

  async listClients() {
    const clients = await this.prisma.client.findMany({
      // Never list the Datacrux team's own internal account here. Written
      // as an explicit OR (rather than plan: { not: 'internal' }) because
      // a plain not-equal check on a nullable column also excludes rows
      // where plan is null/empty - which would have hidden every business
      // that predates this feature, including both pilot businesses.
      where: { OR: [{ plan: null }, { plan: { not: 'internal' } }] },
      include: { users: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const usageMap = await this.usageByClient();

    return clients.map((client) => {
      const usage = usageMap.get(client.id);
      return {
        id: client.id,
        name: client.name,
        plan: client.plan,
        status: effectiveStatus(client),
        subscription: client.subscription,
        conversationLimit: client.conversationLimit,
        conversationsThisMonth: usage?.thisMonth ?? 0,
        conversationsAllTime: usage?.allTime ?? 0,
        tokensAllTime: usage?.tokens ?? 0,
        trialEndsAt: client.trialEndsAt,
        setupFeePaid: client.setupFeePaid,
        ownerEmails: client.users.map((u) => u.email),
        createdAt: client.createdAt,
      };
    });
  }

  async getClientDetail(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { users: { select: { id: true, email: true, role: true, lastLoginAt: true } } },
    });
    if (!client) {
      throw new NotFoundException('Business not found.');
    }

    const usageMap = await this.usageByClient(clientId);
    const usage = usageMap.get(clientId);

    return {
      id: client.id,
      name: client.name,
      plan: client.plan,
      status: effectiveStatus(client),
      subscription: client.subscription,
      conversationLimit: client.conversationLimit,
      conversationsThisMonth: usage?.thisMonth ?? 0,
      conversationsAllTime: usage?.allTime ?? 0,
      tokensAllTime: usage?.tokens ?? 0,
      trialEndsAt: client.trialEndsAt,
      setupFeePaid: client.setupFeePaid,
      whatsappNumber: client.whatsappNumber,
      createdAt: client.createdAt,
      admins: client.users, // does NOT include the API key or any password data
    };
  }

  async updateClient(clientId: string, dto: UpdateClientDto, actorId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundException('Business not found.');
    }
    if (client.plan === 'internal') {
      throw new ForbiddenException("The Datacrux team's own account can't be edited here.");
    }

    const data: Record<string, unknown> = {};
    if (dto.plan !== undefined) data.plan = dto.plan;
    if (dto.unlimited) {
      data.conversationLimit = null;
    } else if (dto.conversationLimit !== undefined) {
      data.conversationLimit = dto.conversationLimit;
    }
    if (dto.setupFeePaid !== undefined) data.setupFeePaid = dto.setupFeePaid;
    if (dto.extendTrialDays) {
      const base = client.trialEndsAt && client.trialEndsAt.getTime() > Date.now() ? client.trialEndsAt : new Date();
      data.trialEndsAt = this.daysFromNow(dto.extendTrialDays, base);
    }

    const wasSuspended = client.subscription === 'suspended';
    if (dto.subscription !== undefined) {
      data.subscription = dto.subscription;
    }

    const updated = await this.prisma.client.update({ where: { id: clientId }, data });

    await this.audit(actorId, clientId, 'platform.updateClient', { changes: dto });

    // Suspend/reactivate are significant enough events to email the
    // business about immediately, rather than waiting for anything
    // time-based - those (usage warnings, trial reminders) are handled by
    // the separate daily scheduled job.
    if (dto.subscription === 'suspended' && !wasSuspended) {
      await this.notificationsService.notifyAccountSuspended(clientId);
    } else if (wasSuspended && dto.subscription && dto.subscription !== 'suspended') {
      await this.notificationsService.notifyAccountReactivated(clientId);
    }

    return { id: updated.id, ...data };
  }

  async resetPassword(adminUserId: string, newPassword: string, actorId: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminUserId } });
    if (!admin) {
      throw new NotFoundException('Admin account not found.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.adminUser.update({ where: { id: adminUserId }, data: { passwordHash } });

    // The password itself is never written anywhere, including here - only
    // the fact that a reset happened, by whom, and for which account.
    await this.audit(actorId, admin.clientId, 'platform.resetPassword', { adminUserId, adminEmail: admin.email });

    return { adminUserId, email: admin.email };
  }

  /**
   * Manually runs the same daily usage/trial check the 8am cron job runs
   * on its own - for testing, so you don't have to wait until tomorrow
   * morning to see if it works. Safe to call more than once: every email
   * it might send is still governed by the same once-per-threshold rule.
   */
  async runNotificationsCheck() {
    await this.notificationsScheduler.runDailyChecks();
    return { ok: true, message: 'Daily notification check ran. Check Resend/your test inbox and the notification_logs table.' };
  }

  /** Conversations this month, all-time, and total tokens - one clientId, or every client at once. */
  private async usageByClient(onlyClientId?: string) {
    const where = onlyClientId ? { clientId: onlyClientId } : {};

    const [thisMonthGroups, allTimeGroups] = await Promise.all([
      this.prisma.conversation.groupBy({
        by: ['clientId'],
        where: { ...where, createdAt: { gte: startOfMonthLagos() } },
        _count: { _all: true },
      }),
      this.prisma.conversation.groupBy({
        by: ['clientId'],
        where,
        _count: { _all: true },
        _sum: { tokenUsage: true },
      }),
    ]);

    const map = new Map<string, { thisMonth: number; allTime: number; tokens: number }>();
    for (const row of allTimeGroups) {
      map.set(row.clientId, { thisMonth: 0, allTime: row._count._all, tokens: row._sum.tokenUsage ?? 0 });
    }
    for (const row of thisMonthGroups) {
      const existing = map.get(row.clientId) ?? { thisMonth: 0, allTime: 0, tokens: 0 };
      existing.thisMonth = row._count._all;
      map.set(row.clientId, existing);
    }
    return map;
  }

  private daysFromNow(days: number, from: Date = new Date()) {
    const result = new Date(from);
    result.setDate(result.getDate() + days);
    return result;
  }

  private async audit(actorId: string, clientId: string | null, action: string, metadata: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: {
        clientId,
        action,
        actorType: 'superadmin',
        actorId,
        result: 'success',
        metadata: metadata as any,
      },
    });
  }
}
