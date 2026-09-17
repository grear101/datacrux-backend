import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { NegotiationService } from '../negotiation/negotiation.service';
import { OrdersService } from '../orders/orders.service';
import { CustomersService } from '../customers/customers.service';
import { ChatMessage } from '../ai/ai.types';

const MAX_TOOL_LOOPS = 4; // safety cap so a confused model can't loop forever

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly negotiationService: NegotiationService,
    private readonly ordersService: OrdersService,
    private readonly customersService: CustomersService,
  ) {}

  async sendMessage(params: {
    clientId: string;
    conversationId?: string;
    customerId?: string;
    productId?: string;
    message: string;
  }) {
    const { clientId, customerId, message } = params;

    const conversation = await this.getOrCreateConversation(clientId, customerId, params.conversationId);

    // transcript is stored as Json in the DB - it's our source of truth for
    // conversation history, not anything held in memory between requests.
    const transcript: ChatMessage[] = Array.isArray(conversation.transcript)
      ? (conversation.transcript as any)
      : [];

    // If the customer arrived via an ad for a specific product, and this is
    // a brand-new conversation, prime AMARA with that product's details up
    // front - so she never needs to call list_products or ask "what are you
    // interested in?" first. This holds true regardless of whether the
    // returning-customer check (below) finds a match or not.
    let effectiveMessage = message;
    if (params.productId && transcript.length === 0) {
      const product = await this.prisma.product.findFirst({
        where: { id: params.productId, clientId },
      });
      if (product) {
        effectiveMessage = `[Context: this customer clicked an ad for "${product.name}" (productId: ${product.id}, list price ₦${Number(product.price)}). They are already interested in this specific product - do not ask what they're interested in or call list_products, just help them with it directly.]\n\nCustomer: ${message}`;
      }
    }

    transcript.push({ role: 'user', content: effectiveMessage });

    // Load this business's customizable AI persona (tone, greeting, custom
    // instructions) - this is layered on top of AiService's fixed safety
    // rules, never replacing them.
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    const aiSettings = (client?.aiSettings as any) ?? {};

    let totalTokens = conversation.tokenUsage;
    let loops = 0;
    let finalReplyText = '';
    let orderLink: string | null = null; // set only if confirm_order succeeds this turn
    let imageUrl: string | null = null; // set if get_product_info returns a photo
    let handoverLink: string | null = null; // set only if request_human_handover succeeds this turn

    // The tool-call loop: keep going as long as Claude wants to call a tool
    // (look up a product, propose a price, check a returning customer, or
    // confirm an order), execute it against real backend logic, and feed
    // the result back - until Claude produces a plain text reply.
    while (loops < MAX_TOOL_LOOPS) {
      loops++;
      const { content, usage } = await this.aiService.chat(transcript, aiSettings);
      if (usage) {
        totalTokens += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
      }

      const toolUseBlocks = content.filter((b: any) => b.type === 'tool_use');
      const textBlocks = content.filter((b: any) => b.type === 'text');

      if (toolUseBlocks.length === 0) {
        // No tool calls - this is the customer-facing reply.
        finalReplyText = textBlocks.map((b: any) => b.text).join('\n');
        transcript.push({ role: 'assistant', content: finalReplyText });
        break;
      }

      // Claude wants to call one or more tools. Record its request, execute
      // each tool for real, then hand the results back as the next message.
      transcript.push({ role: 'assistant', content: JSON.stringify(content) });

      const toolResults: { type: string; tool_use_id: string; content: string }[] = [];
      for (const block of toolUseBlocks) {
        const result = await this.executeTool(clientId, params.conversationId ?? conversation.id, block);
        if (block.name === 'confirm_order' && result && (result as any).whatsappLink) {
          orderLink = (result as any).whatsappLink;
        }
        if (block.name === 'get_product_info' && result && (result as any).imageUrl) {
          imageUrl = (result as any).imageUrl;
        }
        if (block.name === 'request_human_handover' && result && (result as any).whatsappLink) {
          handoverLink = (result as any).whatsappLink;
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      transcript.push({ role: 'user', content: JSON.stringify(toolResults) as any });
    }

    if (!finalReplyText) {
      finalReplyText =
        "Sorry, I'm having trouble finishing that thought - could you rephrase your question?";
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        transcript: transcript as any,
        tokenUsage: totalTokens,
      },
    });

    const response: {
      conversationId: string;
      reply: string;
      orderLink?: string;
      imageUrl?: string;
      handoverLink?: string;
    } = {
      conversationId: conversation.id,
      reply: finalReplyText,
    };
    if (orderLink) {
      response.orderLink = orderLink;
    }
    if (imageUrl) {
      response.imageUrl = imageUrl;
    }
    if (handoverLink) {
      response.handoverLink = handoverLink;
    }
    return response;
  }

  private async executeTool(clientId: string, conversationId: string, block: { name: string; input: any }) {
    // This is the enforcement point: no matter what the AI asked for, every
    // tool call is re-validated against the real database and, for pricing,
    // against the Negotiation Engine's hard rules - never against anything
    // the AI claims to already know.
    if (block.name === 'list_products') {
      const products = await this.prisma.product.findMany({
        where: { clientId, available: true },
      });
      return products.map((p) => ({
        id: p.id,
        name: p.name,
        listPrice: Number(p.price),
        isService: p.isService,
      }));
    }

    if (block.name === 'get_product_info') {
      const product = await this.prisma.product.findFirst({
        where: { id: block.input.productId, clientId },
      });
      if (!product) {
        return { error: 'Product not found.' };
      }
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        listPrice: Number(product.price),
        available: product.available,
        imageUrl: product.imageUrl,
        isService: product.isService,
      };
    }

    if (block.name === 'propose_price') {
      return this.negotiationService.evaluate({
        clientId,
        productId: block.input.productId,
        requestedPrice: block.input.requestedPrice,
        quantity: block.input.quantity,
      });
    }

    if (block.name === 'confirm_order') {
      return this.ordersService.confirmOrder({
        clientId,
        conversationId,
        productId: block.input.productId,
        quantity: block.input.quantity,
        agreedPrice: block.input.agreedPrice,
        customerName: block.input.customerName,
        customerPhone: block.input.customerPhone,
        deliveryAddress: block.input.deliveryAddress,
      });
    }

    if (block.name === 'check_returning_customer') {
      const result = await this.customersService.findByPhone(clientId, block.input.phone);
      return result ?? { found: false };
    }

    if (block.name === 'request_human_handover') {
      const client = await this.prisma.client.findUnique({ where: { id: clientId } });
      const whatsappLink = this.buildHandoverWhatsappLink(client?.whatsappNumber ?? null, {
        summary: block.input.summary,
        customerName: block.input.customerName,
        customerPhone: block.input.customerPhone,
      });
      return { whatsappLink };
    }

    return { error: `Unknown tool: ${block.name}` };
  }

  private buildHandoverWhatsappLink(
    whatsappNumber: string | null,
    details: { summary: string; customerName?: string; customerPhone?: string },
  ): string | null {
    if (!whatsappNumber) return null;
    const digitsOnly = whatsappNumber.replace(/\D/g, '');
    if (!digitsOnly) return null;

    const message =
      `Customer wants to speak to a human\n\n` +
      `Summary: ${details.summary}\n` +
      (details.customerName ? `Name: ${details.customerName}\n` : '') +
      (details.customerPhone ? `Phone: ${details.customerPhone}\n` : '');

    return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
  }

  private async getOrCreateConversation(clientId: string, customerId: string | undefined, conversationId?: string) {
    if (conversationId) {
      const existing = await this.prisma.conversation.findFirst({
        where: { id: conversationId, clientId },
      });
      if (!existing) {
        throw new NotFoundException('Conversation not found for this client.');
      }
      return existing;
    }

    return this.prisma.conversation.create({
      data: { clientId, customerId, transcript: [] },
    });
  }
}
