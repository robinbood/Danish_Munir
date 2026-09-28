import { describe, expect, it } from 'vitest';
import { BillingCycle } from '../domain/billing-cycle.ts';
import { Subscription } from '../domain/subscription.ts';
import { SubscriptionPlan } from '../domain/subscription-plan.ts';
import { InvalidSubscriptionTransitionError } from '../domain/subscription.errors.ts';

describe('Subscription lifecycle', () => {
  it('cancels an active subscription and disables auto-renewal', () => {
    const startsAt = new Date('2026-09-01T00:00:00.000Z');
    const subscription = Subscription.create({
      id: 'sub-1',
      userId: 'user-1',
      plan: SubscriptionPlan.basic(),
      cycle: BillingCycle.monthly(),
      startsAt,
      autoRenew: true,
    });

    subscription.cancel(startsAt);

    expect(subscription.getStatus().kind).toBe('cancelled');
    expect(subscription.getAutoRenew()).toBe(false);
  });

  it('prevents cancellation of an expired subscription', () => {
    const startsAt = new Date('2026-01-01T00:00:00.000Z');
    const subscription = Subscription.create({
      id: 'sub-2',
      userId: 'user-2',
      plan: SubscriptionPlan.pro(),
      cycle: BillingCycle.yearly(),
      startsAt,
      autoRenew: false,
    });
    subscription.expire(new Date('2027-01-01T00:00:00.000Z'));

    expect(() => subscription.cancel(startsAt)).toThrow(
      InvalidSubscriptionTransitionError,
    );
  });
});
