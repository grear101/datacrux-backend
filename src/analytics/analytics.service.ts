import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything for one business's Analytics page, scoped strictly to their
   * own clientId - same tenant-isolation principle as Orders/Handovers.
   * Nothing here is cached: analytics is checked far less often than a
   * chat message or a product lookup, so there's no strong case for
   * trading freshness for speed the way there is elsewhere.
   */
  async getSummary(clientId: string, days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const [orders, conversationCount, negotiationLogs, handoverCount] = await Promise.all([
      this.prisma.order.findMany({
        where: { clientId, createdAt: { gte: since } },
        select: { finalAmount: true, createdAt: true },
      }),
      this.prisma.conversation.count({
        where: { clientId, createdAt: { gte: since } },
      }),
      this.prisma.auditLog.findMany({
        where: { clientId, action: 'negotiation.evaluate', createdAt: { gte: since } },
        select: { result: true, metadata: true },
      }),
      this.prisma.handoverRequest.count({
        where: { clientId, createdAt: { gte: since } },
      }),
    ]);

    // Revenue and order count, grouped by calendar day, for the chart.
    const byDay = new Map<string, { revenue: number; orderCount: number }>();
    let totalRevenue = 0;
    for (const order of orders) {
      const day = order.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
      const amount = Number(order.finalAmount);
      totalRevenue += amount;
      const existing = byDay.get(day) ?? { revenue: 0, orderCount: 0 };
      existing.revenue += amount;
      existing.orderCount += 1;
      byDay.set(day, existing);
    }
    const revenueByDay = Array.from(byDay.entries())
      .map(([date, v]) => ({ date, revenue: v.revenue, orderCount: v.orderCount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Negotiation stats, straight from the Negotiation Engine's own audit
    // trail - this is the same log that already exists for pricing
    // disputes and abuse tracing, just summarized here.
    const negotiationAttempts = negotiationLogs.length;
    const approvedCount = negotiationLogs.filter((l) => l.result === 'success').length;
    // Only count entries where a real discount was actually given (not a
    // full-price accept or a capped-up-to-list "discount" of 0%), so the
    // average reflects genuine negotiating, not every single price check.
    const discountPercents = negotiationLogs
      .map((l) => (l.metadata as any)?.discountPercent)
      .filter((d): d is number => typeof d === 'number' && d > 0);
    const avgDiscountPercent = discountPercents.length
      ? Math.round((discountPercents.reduce((a, b) => a + b, 0) / discountPercents.length) * 100) / 100
      : 0;

    const conversionRate =
      conversationCount > 0 ? Math.round((orders.length / conversationCount) * 10000) / 100 : 0;
    const handoverRate =
      conversationCount > 0 ? Math.round((handoverCount / conversationCount) * 10000) / 100 : 0;

    return {
      periodDays: days,
      revenue: {
        total: totalRevenue,
        byDay: revenueByDay,
      },
      orders: {
        total: orders.length,
      },
      conversations: {
        total: conversationCount,
      },
      conversionRate, // % of conversations that ended in a confirmed order
      negotiation: {
        totalAttempts: negotiationAttempts,
        approvedCount,
        approvalRate:
          negotiationAttempts > 0 ? Math.round((approvedCount / negotiationAttempts) * 10000) / 100 : 0,
        avgDiscountPercent,
      },
      handovers: {
        total: handoverCount,
        handoverRate, // % of conversations that asked for a human
      },
    };
  }
}
