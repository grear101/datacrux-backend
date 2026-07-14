import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { NegotiationService } from '../negotiation/negotiation.service';
import { ChatMessage } from '../ai/ai.types';

const MAX_TOOL_LOOPS = 4; // safety cap so a confused model can't loop forever

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly negotiationService: NegotiationService,
  ) {}

  async sendMessage(params: {
    clientId: string;
    conversationId?: string;
    customerId?: string;
    message: string;
  }) {
    const { clientId, customerId, message } = params;

    const conversation = await this.getOrCreateConversation(clientId, customerId, params.conversationId);

    // transcript is stored as Json in the DB - it's our source of truth for
    // conversation history, not anything held in memory between requests.
    const transcript: ChatMessage[] = Array.isArray(conversation.transcript)
      ? (conversation.transcript as any)
      : [];

    transcript.push({ role: 'user', content: message });

    let totalTokens = conversation.tokenUsage;
    let loops = 0;
    let finalReplyText = '';

    // The tool-call loop: keep going as long as Claude wants to call a tool
    // (look up a product, or propose a price), execute it against real
    // backend logic, and feed the result back - until Claude produces a
    // plain text reply for the customer.
    while (loops < MAX_TOOL_LOOPS) {
      loops++;
      const { content, usage } = await this.aiService.chat(transcript);
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
        const result = await this.executeTool(clientId, block);
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

    return {
      conversationId: conversation.id,
      reply: finalReplyText,
    };
  }

  private async executeTool(clientId: string, block: { name: string; input: any }) {
    // This is the enforcement point: no matter what the AI asked for, every
    // tool call is re-validated against the real database and, for pricing,
    // against the Negotiation Engine's hard rules - never against anything
    // the AI claims to already know.
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

    return { error: `Unknown tool: ${block.name}` };
  }

  private async getOrCreateConversation(clientId: string, customerId: string | undefined, conversationId?: string) {
    if (conversationId) {
      const existing = await this.prisma.conversation.findFirst({
        where: { id: conversationId, clientId }, // tenant isolation, same principle as the negotiation engine
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
