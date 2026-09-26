import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiSettings, buildSystemPrompt, ChatMessage } from './ai.types';
import { AiProvider } from './providers/ai-provider.interface';
import { ClaudeProvider } from './providers/claude.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';

@Injectable()
export class AiService {
  private readonly provider: AiProvider;

  constructor(private readonly config: ConfigService) {
    // Which AI actually answers customers is a config choice now, not
    // something hardcoded - set AI_PROVIDER on Railway to switch providers.
    // Defaults to Claude (the only one actually built out) if unset, so
    // this is a fully optional variable - nothing breaks without it.
    const providerName = (this.config.get<string>('AI_PROVIDER') ?? 'claude').toLowerCase();

    if (providerName === 'openai') {
      this.provider = new OpenAiProvider(this.config);
    } else if (providerName === 'gemini') {
      this.provider = new GeminiProvider(this.config);
    } else {
      this.provider = new ClaudeProvider(this.config);
    }
  }

  /**
   * Sends the conversation so far to whichever AI provider is configured,
   * along with the tool definitions and this specific business's
   * customized (but safety-bounded) persona. Whatever provider actually
   * answers, the result always comes back in the same shape - callers
   * (ConversationService) never need to know or care which one is active.
   */
  async chat(messages: ChatMessage[], aiSettings?: AiSettings) {
    const systemPrompt = buildSystemPrompt(aiSettings);
    return this.provider.chat(messages, systemPrompt);
  }
}
