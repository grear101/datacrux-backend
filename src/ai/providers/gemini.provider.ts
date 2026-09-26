import { NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMessage } from '../ai.types';
import { AiChatResult, AiProvider } from './ai-provider.interface';

/**
 * Not built yet - this is a deliberate placeholder, so setting
 * AI_PROVIDER=gemini fails with a clear, obvious error instead of doing
 * something silently wrong.
 *
 * To actually implement this later: read GOOGLE_API_KEY from config, call
 * Gemini's generateContent endpoint with AI_TOOLS translated into
 * Gemini's function-calling declaration format, then translate its
 * response back into this same { content, usage } shape - a
 * "functionCall" part becomes a tool_use block, ordinary text becomes a
 * text block. Nothing else in the app needs to change to support this.
 */
export class GeminiProvider implements AiProvider {
  constructor(private readonly config: ConfigService) {}

  async chat(_messages: ChatMessage[], _systemPrompt: string): Promise<AiChatResult> {
    throw new NotImplementedException(
      'Gemini support is not built yet. Set AI_PROVIDER=claude (or remove it) to keep using Claude.',
    );
  }
}
