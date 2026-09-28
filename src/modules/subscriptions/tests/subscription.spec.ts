import { describe, expect, it } from 'vitest';
import { BillingCycle } from '../domain/billing-cycle.ts';
import { Subscription } from '../domain/subscription.ts';
import { SubscriptionPlan } from '../domain/subscription-plan.ts';

describe('Subscription aggregate', () => {
  it('cancels renewal but preserves service through the paid period', () => {
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
    expect(subscription.isServing(new Date('2026-09-15T00:00:00.000Z'))).toBe(
      true,
    );
  });
});
