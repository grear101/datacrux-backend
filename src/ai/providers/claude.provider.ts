import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_TOOLS, ChatMessage } from '../ai.types';
import { AiChatResult, AiProvider } from './ai-provider.interface';

export class ClaudeProvider implements AiProvider {
  constructor(private readonly config: ConfigService) {}

  async chat(messages: ChatMessage[], systemPrompt: string): Promise<AiChatResult> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('ANTHROPIC_API_KEY is not configured.');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        tools: AI_TOOLS,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new InternalServerErrorException(`AI provider error: ${errText}`);
    }

    const data = await response.json();
    return {
      content: data.content,
      usage: data.usage,
    };
  }
}
