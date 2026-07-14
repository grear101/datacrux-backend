export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Tools the AI is allowed to call. Notice there is no "quote_price" or
// "set_price" tool - pricing is NEVER a text-generation decision. The AI can
// only ask the backend to evaluate a price, and must relay whatever the
// backend decides.
export const AI_TOOLS = [
  {
    name: 'get_product_info',
    description:
      'Look up a product\'s name, description, and list price. Use this to answer questions about what is for sale. This returns the LIST price only - it never returns a negotiated or discounted price.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'The product ID to look up' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'propose_price',
    description:
      'Submit a customer\'s requested price for a product to the pricing system for authorization. You must call this any time a customer proposes a specific price or asks for a discount - you are never allowed to accept, reject, or state a discounted price yourself. Always relay the exact result this tool returns.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        requestedPrice: { type: 'number' },
        quantity: { type: 'number' },
      },
      required: ['productId', 'requestedPrice', 'quantity'],
    },
  },
];

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface TextBlock {
  type: 'text';
  text: string;
}
