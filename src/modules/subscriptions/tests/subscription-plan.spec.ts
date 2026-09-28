import { describe, expect, it } from 'vitest';
import { BillingCycle } from '../domain/billing-cycle.ts';
import { SubscriptionPlan } from '../domain/subscription-plan.ts';
import {
  InvalidBillingCycleError,
  InvalidSubscriptionPlanError,
} from '../domain/subscription.errors.ts';

describe('Subscription plans', () => {
  it('gives Enterprise an explicitly unlimited quota', () => {
    const quota = SubscriptionPlan.enterprise().initialQuota();

    expect(quota.isUnlimited()).toBe(true);
    expect(quota.remaining).toBeNull();
  });

  it('uses calendar billing periods and yearly plan pricing', () => {
    const startsAt = new Date('2026-01-31T10:30:00.000Z');
    const period = BillingCycle.monthly().periodStartingAt(startsAt);
    const annualPrice = SubscriptionPlan.pro().priceFor(BillingCycle.yearly());

    expect(period.end.toISOString()).toBe('2026-02-28T10:30:00.000Z');
    expect(annualPrice.amountMinor).toBe(29_000);
  });

  it('rejects unknown plan and billing-cycle values', () => {
    expect(() => SubscriptionPlan.from('unknown')).toThrow(
      InvalidSubscriptionPlanError,
    );
    expect(() => BillingCycle.from('weekly')).toThrow(InvalidBillingCycleError);
  });
});
