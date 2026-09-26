import { ChatMessage } from '../ai.types';

export interface AiChatResult {
  // Deliberately untyped as any[] rather than (TextBlock | ToolUseBlock)[]:
  // ConversationService filters this array by block.type at runtime
  // without a type-narrowing guard, so a strict union type here causes
  // TypeScript build errors there without actually catching any real bug.
  content: any[];
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Every AI provider implements this one method, and normalizes its own
 * response into this same shape (text blocks + tool_use blocks) - Claude's
 * own native format. This is what makes the provider swappable via the
 * AI_PROVIDER environment variable without touching ConversationService's
 * tool-calling loop at all: it only ever sees this one shape, regardless
 * of which provider actually answered.
 */
export interface AiProvider {
  chat(messages: ChatMessage[], systemPrompt: string): Promise<AiChatResult>;
}
