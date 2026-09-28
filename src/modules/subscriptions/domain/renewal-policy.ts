import { BillingPeriod } from './billing-period.ts';
import { Money } from './money.ts';
import { Subscription } from './subscription.ts';

export type PaymentOutcome =
  | { status: 'succeeded'; receiptId: string; amount: Money }
  | { status: 'failed'; reason: string };

export type RenewalResolution =
  | { kind: 'renewed'; subscription: Subscription; receiptId: string }
  | { kind: 'expired'; subscription: Subscription; reason: string }
  | { kind: 'skipped'; reason: string };

/**
 * Decides what a renewal attempt means for a subscription.
 *
 * This lives in the domain because the decision spans three inputs that no single
 * entity owns: the aggregate's current state, the calendar, and the outcome of an
 * external charge. Keeping it here means the use case never has to branch on
 * business rules, and the "renew on success, expire on failure" invariant is stated
 * exactly once.
 */
export class RenewalPolicy {
  shouldAttempt(subscription: Subscription, now: Date): boolean {
    return subscription.isDueForRenewal(now);
  }

  nextPeriodFor(subscription: Subscription): BillingPeriod {
    return subscription
      .getCycle()
      .periodStartingAt(subscription.getPeriod().end);
  }

  /**
   * Applies a charge outcome to the aggregate. A successful charge advances the
   * billing period and refills the quota; a failed one retires the subscription
   * instead, which also clears auto-renewal so a retry cannot produce a second
   * billing period.
   */
  resolve(
    subscription: Subscription,
    now: Date,
    outcome: PaymentOutcome,
  ): RenewalResolution {
    if (subscription.getStatus().isCancelled()) {
      return { kind: 'skipped', reason: 'The subscription was cancelled.' };
    }

    if (subscription.getStatus().isExpired()) {
      return { kind: 'skipped', reason: 'The subscription already expired.' };
    }

    if (outcome.status === 'failed') {
      subscription.expire(now);
      return { kind: 'expired', subscription, reason: outcome.reason };
    }

    subscription.renew(this.nextPeriodFor(subscription), now);

    return { kind: 'renewed', subscription, receiptId: outcome.receiptId };
  }
}
