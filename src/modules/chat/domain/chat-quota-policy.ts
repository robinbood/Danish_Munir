import { MonthlyPeriod } from './monthly-period.ts';
import { FREE_MESSAGES_PER_MONTH } from './message-quota.ts';

/** Free messages are always spent before paid ones. */
export type QuotaDecision =
  | { kind: 'free'; period: MonthlyPeriod }
  | { kind: 'bundle'; bundle: PaidBundleOption }
  | { kind: 'rejected' };

export type PaidBundleOption = {
  id: string;
  plan: 'basic' | 'pro' | 'enterprise';
  remainingMessages: number | null;
  endsAt: Date;
};

/**
 * The single place in the Chat context that decides which allowance pays for a
 * message.
 *
 * It owns free-before-paid priority and deterministic paid-bundle selection. The
 * Subscriptions context only enforces an atomic reservation for the selected id.
 */
export class ChatQuotaPolicy {
  hasFreeAllowance(usedThisPeriod: number): boolean {
    return usedThisPeriod < FREE_MESSAGES_PER_MONTH;
  }

  remainingFreeMessages(usedThisPeriod: number): number {
    return Math.max(FREE_MESSAGES_PER_MONTH - usedThisPeriod, 0);
  }

  decide(
    usedThisPeriod: number,
    availableBundles: PaidBundleOption[],
    period: MonthlyPeriod,
  ): QuotaDecision {
    if (this.hasFreeAllowance(usedThisPeriod)) {
      return { kind: 'free', period };
    }

    const bundle = this.chooseBundle(availableBundles);
    return bundle ? { kind: 'bundle', bundle } : { kind: 'rejected' };
  }

  chooseBundle(bundles: PaidBundleOption[]): PaidBundleOption | null {
    return (
      [...bundles].sort((left, right) => {
        const leftRemaining =
          left.remainingMessages ?? Number.POSITIVE_INFINITY;
        const rightRemaining =
          right.remainingMessages ?? Number.POSITIVE_INFINITY;
        return (
          rightRemaining - leftRemaining ||
          right.endsAt.getTime() - left.endsAt.getTime() ||
          left.id.localeCompare(right.id)
        );
      })[0] ?? null
    );
  }
}
