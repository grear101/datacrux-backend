export interface NegotiationRequest {
  clientId: string;
  productId: string;
  requestedPrice: number; // what the AI/customer is proposing
  quantity: number;
}

export interface NegotiationResult {
  approved: boolean;
  finalPrice: number;     // the price the server actually authorizes
  listPrice: number;
  minPrice: number;
  discountPercent: number;
  reason: string;         // always populated, even on approval - for audit trail
}

// Snapshot of product pricing pulled fresh from DB on every negotiation call.
// Never trust a cached or client-supplied price.
export interface ProductPricingSnapshot {
  id: string;
  price: number;
  minPrice: number;
  available: boolean;
}
