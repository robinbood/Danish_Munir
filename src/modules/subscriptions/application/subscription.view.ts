import type { BillingCycleKind } from '../domain/billing-cycle.ts';
import type { Subscription } from '../domain/subscription.ts';
import type { SubscriptionPlanName } from '../domain/subscription-plan.ts';
import type { SubscriptionStatusKind } from '../domain/subscription-status.ts';

/** Application-level result shape. Controllers serialise this, never the aggregate. */
export type SubscriptionView = {
  id: string;
  userId: string;
  plan: SubscriptionPlanName;
  cycle: BillingCycleKind;
  status: SubscriptionStatusKind;
  maxMessages: number | null;
  remainingMessages: number | null;
  unlimited: boolean;
  priceAmountMinor: number;
  currency: string;
  startDate: string;
  endDate: string;
  renewalDate: string;
  autoRenew: boolean;
  cancelledAt: string | null;
};

export function toSubscriptionView(
  subscription: Subscription,
): SubscriptionView {
  const quota = subscription.getQuota();

  return {
    id: subscription.getId(),
    userId: subscription.getUserId(),
    plan: subscription.getPlan().name,
    cycle: subscription.getCycle().kind,
    status: subscription.getStatus().kind,
    maxMessages: subscription.getPlan().maxMessages,
    remainingMessages: quota.remaining,
    unlimited: quota.isUnlimited(),
    priceAmountMinor: subscription.getPrice().amountMinor,
    currency: subscription.getPrice().currency,
    startDate: subscription.getPeriod().start.toISOString(),
    endDate: subscription.getPeriod().end.toISOString(),
    renewalDate: subscription.getRenewalDate().toISOString(),
    autoRenew: subscription.getAutoRenew(),
    cancelledAt: subscription.getCancelledAt()?.toISOString() ?? null,
  };
}
