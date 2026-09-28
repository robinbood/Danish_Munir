import { BillingCycle } from './billing-cycle.ts';
import { MessageQuota } from './message-quota.ts';
import { Money } from './money.ts';
import { InvalidSubscriptionPlanError } from './subscription.errors.ts';

export type SubscriptionPlanName = 'basic' | 'pro' | 'enterprise';

const YEARLY_BILLING_MONTHS = 10;

export class SubscriptionPlan {
  private constructor(
    readonly name: SubscriptionPlanName,
    readonly maxMessages: number | null,
    readonly monthlyPrice: Money,
  ) {}

  static basic(): SubscriptionPlan {
    return new SubscriptionPlan('basic', 10, Money.of(900));
  }

  static pro(): SubscriptionPlan {
    return new SubscriptionPlan('pro', 100, Money.of(2900));
  }

  static enterprise(): SubscriptionPlan {
    return new SubscriptionPlan('enterprise', null, Money.of(9900));
  }

  static from(name: string): SubscriptionPlan {
    switch (name) {
      case 'basic':
        return SubscriptionPlan.basic();
      case 'pro':
        return SubscriptionPlan.pro();
      case 'enterprise':
        return SubscriptionPlan.enterprise();
      default:
        throw new InvalidSubscriptionPlanError();
    }
  }

  isUnlimited(): boolean {
    return this.maxMessages === null;
  }

  initialQuota(): MessageQuota {
    return MessageQuota.of(this.maxMessages);
  }

  /** A yearly cycle pays for ten months, so the annual rate is discounted. */
  priceFor(cycle: BillingCycle): Money {
    return cycle.kind === 'yearly'
      ? this.monthlyPrice.multiply(YEARLY_BILLING_MONTHS)
      : this.monthlyPrice;
  }
}
