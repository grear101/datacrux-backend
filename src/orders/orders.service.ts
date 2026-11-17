import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NegotiationService } from '../negotiation/negotiation.service';
import { CustomersService } from '../customers/customers.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface ConfirmOrderInput {
  clientId: string;
  conversationId?: string;
  productId: string;
  quantity: number;
  agreedPrice: number; // whatever the AI/customer THINKS was agreed - never trusted directly
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  // Only meaningful for a service product - "YYYY-MM-DD HH:mm" as AMARA
  // confirmed it with the customer. Parsed and stored as a real DateTime;
  // if it's missing or unparseable, the order still goes through (never
  // block a sale over this), it's just left blank.
  scheduledAt?: string;
}

export interface OrderDateFilter {
  startDate?: string; // YYYY-MM-DD, inclusive, interpreted as the start of that day
  endDate?: string;   // YYYY-MM-DD, inclusive, interpreted as the end of that day
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly negotiationService: NegotiationService,
    private readonly customersService: CustomersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Lists orders for this business only, most recent first, optionally
   * narrowed to a date range. Same tenant-isolation principle as
   * everything else: scoped to clientId at the query level, never trusting
   * anything other than the authenticated admin's own client.
   */
  async findAll(clientId: string, filter: OrderDateFilter = {}) {
    const where: any = { clientId };

    if (filter.startDate || filter.endDate) {
      where.createdAt = {};
      if (filter.startDate) {
        where.createdAt.gte = new Date(`${filter.startDate}T00:00:00.000Z`);
      }
      if (filter.endDate) {
        where.createdAt.lte = new Date(`${filter.endDate}T23:59:59.999Z`);
      }
    }

    return this.prisma.order.findMany({
      where,
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async confirmOrder(input: ConfirmOrderInput) {
    // The single most important line in this whole service: re-run the
    // agreed price through the real Negotiation Engine one more time,
    // right before creating anything. AMARA's (or the customer's) claim
    // that "we agreed on X" is never taken at face value - if someone
    // tried to talk the AI into confirming an order at a fake price, this
    // catches it here, using the authoritative result instead.
    const negotiationResult = await this.negotiationService.evaluate({
      clientId: input.clientId,
      productId: input.productId,
      requestedPrice: input.agreedPrice,
      quantity: input.quantity,
    });

    const authoritativePrice = negotiationResult.finalPrice;

    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, clientId: input.clientId },
    });
    if (!product) {
      return { error: 'Product not found for this client.' };
    }

    const listPrice = Number(product.price);
    const subtotal = listPrice * input.quantity;
    const finalAmount = authoritativePrice * input.quantity;
    const discountTotal = subtotal - finalAmount;

    // "YYYY-MM-DD HH:mm" from AMARA, parsed as Lagos local time (UTC+1).
    // Never blocks the order if it's missing or doesn't parse - a booking
    // with no clean scheduledAt just has nothing to remind about later.
    const scheduledAt = this.parseScheduledAt(input.scheduledAt);

    const order = await this.prisma.order.create({
      data: {
        clientId: input.clientId,
        conversationId: input.conversationId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        deliveryAddress: input.deliveryAddress,
        scheduledAt,
        subtotal,
        discountTotal,
        finalAmount,
        status: 'confirmed',
        items: {
          create: [
            {
              productId: product.id,
              quantity: input.quantity,
              listPrice,
              negotiatedPrice: authoritativePrice,
            },
          ],
        },
      },
    });

    // This is the ONLY place a Customer record gets created/updated - the
    // one moment we know for certain a real name and phone belong together,
    // tied to an actual completed transaction. The returning-customer check
    // earlier in the conversation only ever reads from what orders like
    // this one have already built up.
    await this.customersService.recordOrder(input.clientId, input.customerPhone, input.customerName);

    const client = await this.prisma.client.findUnique({ where: { id: input.clientId } });
    const whatsappLink = this.buildWhatsappLink(client?.whatsappNumber ?? null, {
      orderId: order.id,
      productName: product.name,
      quantity: input.quantity,
      price: authoritativePrice,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      deliveryAddress: input.deliveryAddress,
      scheduledAt,
    });

    await this.notificationsService.notifyNewOrder(input.clientId, {
      orderId: order.id,
      customerName: input.customerName,
      productName: product.name,
      quantity: input.quantity,
      finalAmount,
    });

    return {
      orderId: order.id,
      finalPrice: authoritativePrice,
      priceWasAdjusted: authoritativePrice !== input.agreedPrice,
      whatsappLink,
    };
  }

  private parseScheduledAt(value?: string): Date | null {
    if (!value) return null;
    // "YYYY-MM-DD HH:mm" -> treat as Lagos local time (UTC+1 fixed, no DST).
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value.trim());
    if (!match) return null;
    const [, year, month, day, hour, minute] = match;
    const utcMillis = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    const parsed = new Date(utcMillis - 60 * 60 * 1000); // subtract the UTC+1 offset to get true UTC
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private buildWhatsappLink(
    whatsappNumber: string | null,
    details: {
      orderId: string;
      productName: string;
      quantity: number;
      price: number;
      customerName: string;
      customerPhone: string;
      deliveryAddress: string;
      scheduledAt: Date | null;
    },
  ): string | null {
    if (!whatsappNumber) return null;

    const digitsOnly = whatsappNumber.replace(/\D/g, '');
    if (!digitsOnly) return null;

    const total = details.price * details.quantity;
    const scheduledLine = details.scheduledAt
      ? `Scheduled for: ${details.scheduledAt.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })}\n`
      : '';
    const message =
      `New order via AMARA\n\n` +
      `Order ID: ${details.orderId}\n` +
      `Product: ${details.productName}\n` +
      `Quantity: ${details.quantity}\n` +
      `Agreed price: ₦${details.price.toLocaleString()} each\n` +
      `Total: ₦${total.toLocaleString()}\n\n` +
      `Customer: ${details.customerName}\n` +
      `Phone: ${details.customerPhone}\n` +
      scheduledLine +
      `Delivery address: ${details.deliveryAddress}`;

    return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
  }
}
