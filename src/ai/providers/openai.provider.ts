import { NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMessage } from '../ai.types';
import { AiChatResult, AiProvider } from './ai-provider.interface';

/**
 * Not built yet - this is a deliberate placeholder, so setting
 * AI_PROVIDER=openai fails with a clear, obvious error instead of doing
 * something silently wrong.
 *
 * To actually implement this later: read OPENAI_API_KEY from config, call
 * https://api.openai.com/v1/chat/completions with AI_TOOLS translated into
 * OpenAI's function-calling "tools" format, then translate its response
 * back into this same { content, usage } shape - each "tool_calls" entry
 * becomes a tool_use block, ordinary message text becomes a text block.
 * Nothing else in the app (ConversationService, the tool-execution logic,
 * the Negotiation Engine) needs to change to support this.
 */
export class OpenAiProvider implements AiProvider {
  constructor(private readonly config: ConfigService) {}

  async chat(_messages: ChatMessage[], _systemPrompt: string): Promise<AiChatResult> {
    throw new NotImplementedException(
      'OpenAI (GPT) support is not built yet. Set AI_PROVIDER=claude (or remove it) to keep using Claude.',
    );
  }
}
