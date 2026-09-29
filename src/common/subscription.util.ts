// Nigeria (Africa/Lagos) is UTC+1 year-round, with no daylight saving.
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/**
 * The moment the current calendar month began in Nigerian time. A business's
 * monthly conversation allowance counts everything from this moment onward,
 * so it refills at midnight Lagos time on the 1st, not midnight UTC.
 */
export function startOfMonthLagos(now: Date = new Date()): Date {
  const lagosNow = new Date(now.getTime() + LAGOS_OFFSET_MS);
  return new Date(Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), 1) - LAGOS_OFFSET_MS);
}

export type UnavailableReason = 'suspended' | 'trial_expired' | 'limit_reached';

export type Availability = { available: true } | { available: false; reason: 'suspended' | 'trial_expired' };

/**
 * Whether a business's chat widget is allowed to answer at all right now.
 * A trial only expires if it actually has an end date - businesses that
 * were set up before trials existed have none, so they never expire.
 */
export function checkAvailability(
  client: { subscription: string; trialEndsAt: Date | null },
  now: Date = new Date(),
): Availability {
  if (client.subscription === 'suspended') {
    return { available: false, reason: 'suspended' };
  }
  if (client.subscription === 'trial' && client.trialEndsAt && client.trialEndsAt.getTime() < now.getTime()) {
    return { available: false, reason: 'trial_expired' };
  }
  return { available: true };
}

export type EffectiveStatus = 'active' | 'trial' | 'trial_expired' | 'suspended';

/** The single label shown to your team: what is this account really doing right now? */
export function effectiveStatus(
  client: { subscription: string; trialEndsAt: Date | null },
  now: Date = new Date(),
): EffectiveStatus {
  const availability = checkAvailability(client, now);
  if (!availability.available) {
    return availability.reason;
  }
  return client.subscription === 'active' ? 'active' : 'trial';
}

// What a customer sees when a business's chat is unavailable. Deliberately
// vague about the reason - a customer doesn't need to know a business's
// billing situation.
export const UNAVAILABLE_MESSAGE =
  'This assistant is temporarily unavailable. Please contact the business directly.';

export function unavailableBody(reason: UnavailableReason) {
  return {
    statusCode: 403,
    code: 'ACCOUNT_UNAVAILABLE',
    reason,
    message: UNAVAILABLE_MESSAGE,
  };
}
