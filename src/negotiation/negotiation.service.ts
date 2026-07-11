import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NegotiationRequest, NegotiationResult } from './negotiation.types';

/**
 * NegotiationEngine
 *
 * Design rule #1: The AI conversation layer NEVER has authority over price.
 * It can suggest a discount, but this service is the only thing that can
 * approve one, and it always re-checks against the database - never against
 * anything passed in from the chat session or the browser.
 *
 * This exists specifically to prevent prompt-injection or social-engineering
 * attacks where a customer convinces AMARA in chat to "confirm" a price
 * the business never authorized.
 */
@Injectable()
export class NegotiationService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(request: NegotiationRequest): Promise<NegotiationResult> {
    const result = await this.evaluateInternal(request);
    await this.logDecision(request, result);
    return result;
  }

  private async logDecision(request: NegotiationRequest, result: NegotiationResult) {
    // Every negotiation decision is audited - approved or rejected - so pricing
    // disputes and abuse patterns can always be traced after the fact.
    await this.prisma.auditLog.create({
      data: {
        clientId: request.clientId,
        action: 'negotiation.evaluate',
        actorType: 'ai',
        result: result.approved ? 'success' : 'failure',
        metadata: {
          productId: request.productId,
          requestedPrice: request.requestedPrice,
          quantity: request.quantity,
          finalPrice: result.finalPrice,
          reason: result.reason,
        },
      },
    });
  }

  private async evaluateInternal(request: NegotiationRequest): Promise<NegotiationResult> {
    const { clientId, productId, requestedPrice, quantity } = request;

    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero.');
    }
    if (requestedPrice <= 0) {
      throw new BadRequestException('Requested price must be greater than zero.');
    }

    // Always fetch fresh - never trust a price passed in from the AI or client.
    const product = await this.prisma.product.findFirst({
      where: { id: productId, clientId }, // tenant isolation enforced in the query itself
    });

    if (!product) {
      // Either the product doesn't exist, or it belongs to a different client.
      // Same error either way - never leak cross-tenant existence.
      throw new NotFoundException('Product not found for this client.');
    }

    if (!product.available) {
      return this.buildResult({
        approved: false,
        finalPrice: Number(product.price),
        listPrice: Number(product.price),
        minPrice: Number(product.minPrice),
        reason: 'Product is currently unavailable for sale.',
      });
    }

    const listPrice = Number(product.price);
    const minPrice = Number(product.minPrice);

    // Hard floor. No negotiation logic, AI confidence, or "customer insists" can cross this.
    if (requestedPrice < minPrice) {
      return this.buildResult({
        approved: false,
        finalPrice: minPrice, // counter-offer: the floor itself
        listPrice,
        minPrice,
        reason: `Requested price is below the authorized minimum. Countering at floor price.`,
      });
    }

    if (requestedPrice > listPrice) {
      // Customer offered more than list price - cap at list, don't silently accept an inflated number either.
      return this.buildResult({
        approved: true,
        finalPrice: listPrice,
        listPrice,
        minPrice,
        reason: 'Requested price exceeded list price; capped at list price.',
      });
    }

    // Within [minPrice, listPrice] - approve as requested.
    return this.buildResult({
      approved: true,
      finalPrice: requestedPrice,
      listPrice,
      minPrice,
      reason: 'Requested price is within authorized negotiation range.',
    });
  }

  private buildResult(params: {
    approved: boolean;
    finalPrice: number;
    listPrice: number;
    minPrice: number;
    reason: string;
  }): NegotiationResult {
    const discountPercent =
      params.listPrice > 0
        ? Math.round(((params.listPrice - params.finalPrice) / params.listPrice) * 10000) / 100
        : 0;

    return {
      approved: params.approved,
      finalPrice: params.finalPrice,
      listPrice: params.listPrice,
      minPrice: params.minPrice,
      discountPercent,
      reason: params.reason,
    };
  }
}
