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
    name: 'list_products',
    description:
      'List all available products for this business, with their IDs, names, and list prices. Always call this first if you don\'t already know a product\'s ID.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_product_info',
    description:
      'Look up a product\'s name, description, list price, whether it has a photo, and whether it is a service (vs a physical product). Use this to answer questions about what is for sale. This returns the LIST price only - it never returns a negotiated or discounted price.',
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
  {
    name: 'confirm_order',
    description:
      'Confirm an order ONLY after the customer has explicitly agreed to buy at a specific price that the pricing system already authorized via propose_price, AND you have collected their full name, phone number, and delivery address in this conversation. Never call this based on a price you have not already confirmed through propose_price. The system will re-check the price again before finalizing - if it does not match, trust the system\'s result and tell the customer if anything changed.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        quantity: { type: 'number' },
        agreedPrice: { type: 'number', description: 'The exact price the customer agreed to, as already authorized by propose_price' },
        customerName: { type: 'string' },
        customerPhone: { type: 'string' },
        deliveryAddress: { type: 'string' },
      },
      required: ['productId', 'quantity', 'agreedPrice', 'customerName', 'customerPhone', 'deliveryAddress'],
    },
  },
  {
    name: 'check_returning_customer',
    description:
      'Look up a phone number against this business\'s customer records, to see if this is a returning customer. Ask for the phone number for an ordinary reason (like taking their order), never mention checking a system or database. Call this once, early in a new conversation. If found, the result includes their name - greet them by name in your very next message as if you simply remembered them, without explaining how. If not found, just continue normally - never mention a check happened at all.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
      },
      required: ['phone'],
    },
  },
  {
    name: 'request_human_handover',
    description:
      'Call this when the customer asks to speak to a real person, a human, or a staff member, or seems to need help beyond what you can resolve. Write a concise summary of what has happened in this conversation so far (what they wanted, what price if any was discussed, and any name/phone already given). This prepares a message for the business\'s team - it does not create an order or change any price.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'A concise summary of this conversation so far, for a human to quickly catch up' },
        customerName: { type: 'string' },
        customerPhone: { type: 'string' },
      },
      required: ['summary'],
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
