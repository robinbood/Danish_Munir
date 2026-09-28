import { describe, expect, it } from 'vitest';
import { BillingCycle } from '../domain/billing-cycle.ts';
import { Money } from '../domain/money.ts';
import { RenewalPolicy } from '../domain/renewal-policy.ts';
import { Subscription } from '../domain/subscription.ts';
import { SubscriptionPlan } from '../domain/subscription-plan.ts';

describe('RenewalPolicy', () => {
  const policy = new RenewalPolicy();

  it('advances the period and resets quota after successful payment', () => {
    const startsAt = new Date('2026-01-01T00:00:00.000Z');
    const subscription = Subscription.create({
      id: 'renew-success',
      userId: 'user-1',
      plan: SubscriptionPlan.basic(),
      cycle: BillingCycle.monthly(),
      startsAt,
    });
    subscription.consumeMessage(new Date('2026-01-02T00:00:00.000Z'));
    const dueAt = subscription.getRenewalDate();

    const result = policy.resolve(subscription, dueAt, {
      status: 'succeeded',
      receiptId: 'receipt-1',
      amount: Money.of(900),
    });

    expect(result.kind).toBe('renewed');
    expect(subscription.getPeriod().start).toEqual(dueAt);
    expect(subscription.getQuota().remaining).toBe(10);
  });

  it('expires the subscription and disables renewal after failed payment', () => {
    const startsAt = new Date('2026-01-01T00:00:00.000Z');
    const subscription = Subscription.create({
      id: 'renew-failure',
      userId: 'user-2',
      plan: SubscriptionPlan.pro(),
      cycle: BillingCycle.monthly(),
      startsAt,
    });
    const dueAt = subscription.getRenewalDate();

    const result = policy.resolve(subscription, dueAt, {
      status: 'failed',
      reason: 'Card declined',
    });

    expect(result.kind).toBe('expired');
    expect(subscription.getStatus().kind).toBe('expired');
    expect(subscription.getAutoRenew()).toBe(false);
  });
});
