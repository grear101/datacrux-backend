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

// Excludes only the Datacrux team's own internal account. Written as an
// explicit OR (rather than plan: { not: 'internal' }) because a plain
// not-equal check on a nullable column also excludes rows where plan is
// null/empty - which would hide every business that predates this
// feature, including both original pilot businesses.
const NON_INTERNAL_FILTER = { OR: [{ plan: null }, { plan: { not: 'internal' } }] };

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
      where: NON_INTERNAL_FILTER,
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

    await this.audit(actorId, admin.clientId, 'platform.resetPassword', { adminUserId, adminEmail: admin.email });

    return { adminUserId, email: admin.email };
  }

  async runNotificationsCheck() {
    await this.notificationsScheduler.runDailyChecks();
    return { ok: true, message: 'Daily notification check ran. Check Resend/your test inbox and the notification_logs table.' };
  }

  /**
   * The cross-business owner dashboard: totals across every real business
   * (never the Datacrux team's own internal account), plus a few
   * computed highlights. Nothing here is AI-generated - every number and
   * highlight is plain, deterministic math, so it's fast, free, and
   * always exactly right.
   */
  async getOverview(days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const previousSince = new Date(since);
    previousSince.setDate(previousSince.getDate() - days);

    const [clients, orders, previousPeriodRevenue, conversations, negotiationLogs, handoverCount] = await Promise.all([
      this.prisma.client.findMany({
        where: NON_INTERNAL_FILTER,
        select: { id: true, name: true, subscription: true, trialEndsAt: true, conversationLimit: true },
      }),
      this.prisma.order.findMany({
        where: { client: NON_INTERNAL_FILTER, createdAt: { gte: since } },
        select: { finalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: { client: NON_INTERNAL_FILTER, createdAt: { gte: previousSince, lt: since } },
        _sum: { finalAmount: true },
      }),
      this.prisma.conversation.findMany({
        where: { client: NON_INTERNAL_FILTER, createdAt: { gte: since } },
        select: { tokenUsage: true, customerId: true },
      }),
      this.prisma.auditLog.findMany({
        where: { client: NON_INTERNAL_FILTER, action: 'negotiation.evaluate', createdAt: { gte: since } },
        select: { result: true, metadata: true },
      }),
      this.prisma.handoverRequest.count({
        where: { client: NON_INTERNAL_FILTER, createdAt: { gte: since } },
      }),
    ]);

    // Businesses by status
    const businessCounts = { active: 0, trial: 0, trialExpired: 0, suspended: 0, total: clients.length };
    for (const c of clients) {
      const status = effectiveStatus(c);
      if (status === 'active') businessCounts.active++;
      else if (status === 'trial') businessCounts.trial++;
      else if (status === 'trial_expired') businessCounts.trialExpired++;
      else if (status === 'suspended') businessCounts.suspended++;
    }

    // Revenue, and its trend vs. the immediately preceding period of the
    // same length (e.g. this 30 days vs. the 30 days before that).
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.finalAmount), 0);
    const previousRevenue = Number(previousPeriodRevenue._sum.finalAmount ?? 0);
    const percentChange =
      previousRevenue > 0 ? Math.round(((totalRevenue - previousRevenue) / previousRevenue) * 1000) / 10 : null;

    const totalConversations = conversations.length;
    const totalTokens = conversations.reduce((sum, c) => sum + c.tokenUsage, 0);
    const uniqueCustomers = new Set(conversations.map((c) => c.customerId).filter(Boolean)).size;

    const negotiationAttempts = negotiationLogs.length;
    const approvedCount = negotiationLogs.filter((l) => l.result === 'success').length;
    const discountPercents = negotiationLogs
      .map((l) => (l.metadata as any)?.discountPercent)
      .filter((d): d is number => typeof d === 'number' && d > 0);
    const avgDiscountPercent = discountPercents.length
      ? Math.round((discountPercents.reduce((a, b) => a + b, 0) / discountPercents.length) * 100) / 100
      : 0;

    const conversionRate = totalConversations > 0 ? Math.round((orders.length / totalConversations) * 10000) / 100 : 0;
    const handoverRate = totalConversations > 0 ? Math.round((handoverCount / totalConversations) * 10000) / 100 : 0;

    // Highlight: businesses at 80%+ of their monthly limit. Always based
    // on the current calendar month, independent of the days selector
    // above - the limit itself is inherently monthly, so "near the
    // limit" wouldn't mean anything measured over a different window.
    const usageMap = await this.usageByClient();
    const businessesNearLimit = clients
      .filter((c) => c.conversationLimit != null)
      .map((c) => ({
        id: c.id,
        name: c.name,
        usedThisMonth: usageMap.get(c.id)?.thisMonth ?? 0,
        limit: c.conversationLimit as number,
      }))
      .filter((c) => c.usedThisMonth / c.limit >= 0.8)
      .sort((a, b) => b.usedThisMonth / b.limit - a.usedThisMonth / a.limit);

    // Highlight: trials ending within 3 days.
    const now = new Date();
    const trialsEndingSoon = clients
      .filter((c) => c.subscription === 'trial' && c.trialEndsAt && c.trialEndsAt.getTime() > now.getTime())
      .map((c) => ({
        id: c.id,
        name: c.name,
        trialEndsAt: c.trialEndsAt as Date,
        daysLeft: Math.ceil((c.trialEndsAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .filter((c) => c.daysLeft <= 3)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    return {
      periodDays: days,
      businesses: businessCounts,
      revenue: { total: totalRevenue, previousPeriodTotal: previousRevenue, percentChange },
      orders: { total: orders.length },
      conversations: { total: totalConversations },
      uniqueCustomers,
      tokensUsed: totalTokens,
      conversionRate,
      negotiation: {
        totalAttempts: negotiationAttempts,
        approvedCount,
        approvalRate: negotiationAttempts > 0 ? Math.round((approvedCount / negotiationAttempts) * 10000) / 100 : 0,
        avgDiscountPercent,
      },
      handovers: { total: handoverCount, handoverRate },
      highlights: { businessesNearLimit, trialsEndingSoon },
    };
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
