import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NegotiationService } from '../negotiation/negotiation.service';

export interface ConfirmOrderInput {
  clientId: string;
  conversationId?: string;
  productId: string;
  quantity: number;
  agreedPrice: number; // whatever the AI/customer THINKS was agreed - never trusted directly
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly negotiationService: NegotiationService,
  ) {}

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

    const order = await this.prisma.order.create({
      data: {
        clientId: input.clientId,
        conversationId: input.conversationId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        deliveryAddress: input.deliveryAddress,
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

    const client = await this.prisma.client.findUnique({ where: { id: input.clientId } });
    const whatsappLink = this.buildWhatsappLink(client?.whatsappNumber ?? null, {
      orderId: order.id,
      productName: product.name,
      quantity: input.quantity,
      price: authoritativePrice,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      deliveryAddress: input.deliveryAddress,
    });

    return {
      orderId: order.id,
      finalPrice: authoritativePrice,
      priceWasAdjusted: authoritativePrice !== input.agreedPrice, // lets AMARA know to mention it if the "agreed" price got corrected
      whatsappLink, // null if the business hasn't set a WhatsApp number yet
    };
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
    },
  ): string | null {
    if (!whatsappNumber) return null;

    // wa.me requires digits only (country code + number, no +, spaces, or dashes)
    const digitsOnly = whatsappNumber.replace(/\D/g, '');
    if (!digitsOnly) return null;

    const total = details.price * details.quantity;
    const message =
      `New order via AMARA\n\n` +
      `Order ID: ${details.orderId}\n` +
      `Product: ${details.productName}\n` +
      `Quantity: ${details.quantity}\n` +
      `Agreed price: ₦${details.price.toLocaleString()} each\n` +
      `Total: ₦${total.toLocaleString()}\n\n` +
      `Customer: ${details.customerName}\n` +
      `Phone: ${details.customerPhone}\n` +
      `Delivery address: ${details.deliveryAddress}`;

    return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
  }
}
