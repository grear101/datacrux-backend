import { ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { NegotiationService } from '../negotiation/negotiation.service';
import { OrdersService } from '../orders/orders.service';
import { CustomersService } from '../customers/customers.service';
import { HandoversService } from '../handovers/handovers.service';
import { ProductsService } from '../products/products.service';
import { ClientsService } from '../clients/clients.service';
import { ChatMessage } from '../ai/ai.types';
import { startOfMonthLagos, unavailableBody } from '../common/subscription.util';

const MAX_TOOL_LOOPS = 4; // safety cap so a confused model can't loop forever
const MAX_MESSAGES_PER_CONVERSATION = 40; // caps a single runaway session
const STALE_CONVERSATION_HOURS = 24; // a session this old can't be resumed - start a new one instead

// Shown once, right when an order is confirmed - deliberately fixed text
// rather than letting the AI improvise the closing line, so every customer
// gets the same clean send-off.
const ORDER_CLOSING_MESSAGE =
  "Thanks for patronising us! Your order is confirmed - tap the button below to send your details via WhatsApp so the team can follow up.";

// Shown for any message sent to a chat that's already finished (either
// after an order, or because it hit the conversation's message cap).
const ALREADY_CLOSED_MESSAGE =
  'This chat has ended - thanks again! Please start a new chat for anything else.';

const MESSAGE_CAP_CLOSING_MESSAGE =
  "This conversation has reached its limit for one session. Please start a new chat to continue - we're happy to help!";

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly negotiationService: NegotiationService,
    private readonly ordersService: OrdersService,
    private readonly customersService: CustomersService,
    private readonly handoversService: HandoversService,
    private readonly productsService: ProductsService,
    private readonly clientsService: ClientsService,
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

    // A chat that already finished (order placed, or hit its message cap)
    // never reaches the AI again - this costs nothing and answers instantly.
    if (conversation.status !== 'active') {
      return { conversationId: conversation.id, reply: ALREADY_CLOSED_MESSAGE };
    }

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
    const newMessageCount = conversation.messageCount + 1;

    // Load this business's customizable AI persona (tone, greeting, custom
    // instructions) - this is layered on top of AiService's fixed safety
    // rules, never replacing them. Read on every single message, so this
    // goes through ClientsService's cached lookup rather than the database
    // directly.
    const aiSettings = await this.clientsService.getAiSettings(clientId);

    let totalTokens = conversation.tokenUsage;
    let loops = 0;
    let finalReplyText = '';
    let orderLink: string | null = null; // set only if confirm_order succeeds this turn
    let imageUrl: string | null = null; // set if get_product_info returns a photo
    let handoverLink: string | null = null; // set only if request_human_handover succeeds this turn
    let orderConfirmedThisTurn = false;

    // The tool-call loop: keep going as long as Claude wants to call a tool
    // (look up a product, propose a price, check a returning customer,
    // confirm an order, or request a human handover), execute it against
    // real backend logic, and feed the result back - until Claude produces
    // a plain text reply.
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
          orderConfirmedThisTurn = true;
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

    // An order just went through - override whatever AMARA was about to
    // say with the fixed closing message, and end the chat. Every message
    // sent to this conversation after this point gets ALREADY_CLOSED_MESSAGE
    // instead, with no further AI calls.
    let nextStatus: 'active' | 'completed' | 'closed' = 'active';
    if (orderConfirmedThisTurn) {
      finalReplyText = ORDER_CLOSING_MESSAGE;
      nextStatus = 'completed';
    } else if (newMessageCount >= MAX_MESSAGES_PER_CONVERSATION) {
      // Hit the per-session message cap - close it the same way, just with
      // a different reason and no order link.
      finalReplyText = MESSAGE_CAP_CLOSING_MESSAGE;
      nextStatus = 'closed';
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        transcript: transcript as any,
        tokenUsage: totalTokens,
        messageCount: newMessageCount,
        status: nextStatus,
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
      // Cached (60s) inside ProductsService - this tool gets called on
      // nearly every conversation turn, and a brief cache is safe here
      // since it's only used to describe what's available, never to
      // determine an actual price a customer pays.
      const products = await this.productsService.findAvailable(clientId);
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
      return this.handoversService.createHandover({
        clientId,
        conversationId,
        summary: block.input.summary,
        customerName: block.input.customerName,
        customerPhone: block.input.customerPhone,
      });
    }

    return { error: `Unknown tool: ${block.name}` };
  }

  private async getOrCreateConversation(clientId: string, customerId: string | undefined, conversationId?: string) {
    if (conversationId) {
      const existing = await this.prisma.conversation.findFirst({
        where: { id: conversationId, clientId },
      });
      if (!existing) {
        throw new NotFoundException('Conversation not found for this client.');
      }

      // A session that's gone quiet for too long can't just pick back up -
      // the widget is expected to catch this specific error and retry
      // without a conversationId, starting fresh.
      const hoursSinceUpdate = (Date.now() - existing.updatedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate > STALE_CONVERSATION_HOURS) {
        throw new GoneException({
          statusCode: 410,
          code: 'CONVERSATION_EXPIRED',
          message: 'This chat session has expired. Please start a new conversation.',
        });
      }

      return existing;
    }

    // Starting a brand-new conversation - this is the only place the
    // monthly limit applies. A business already mid-conversation is never
    // cut off partway through, only stopped from starting another one.
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { conversationLimit: true },
    });

    if (client?.conversationLimit != null) {
      const usedThisMonth = await this.prisma.conversation.count({
        where: { clientId, createdAt: { gte: startOfMonthLagos() } },
      });
      if (usedThisMonth >= client.conversationLimit) {
        throw new ForbiddenException(unavailableBody('limit_reached'));
      }
    }

    return this.prisma.conversation.create({
      data: { clientId, customerId, transcript: [] },
    });
  }
}
