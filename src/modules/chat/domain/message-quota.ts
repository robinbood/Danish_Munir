import { MonthlyPeriod } from './monthly-period.ts';

export type QuotaKind = 'free' | 'bundle';

export const FREE_MESSAGES_PER_MONTH = 3;

/**
 * Records which allowance paid for a message. `limit === null` means the message was
 * covered by an unlimited bundle; it is never a stand-in for a very large number.
 */
export class MessageQuota {
  private constructor(
    readonly kind: QuotaKind,
    readonly limit: number | null,
    readonly period: MonthlyPeriod,
    readonly subscriptionId: string | null,
  ) {}

  static free(period: MonthlyPeriod): MessageQuota {
    return new MessageQuota('free', FREE_MESSAGES_PER_MONTH, period, null);
  }

  static bundle(
    limit: number | null,
    period: MonthlyPeriod,
    subscriptionId: string,
  ): MessageQuota {
    if (limit !== null && (!Number.isInteger(limit) || limit < 0)) {
      throw new RangeError(
        `A bundle limit must be a non-negative integer, received ${limit}.`,
      );
    }

    if (subscriptionId.trim().length === 0) {
      throw new RangeError('A subscription ID cannot be empty.');
    }

    return new MessageQuota('bundle', limit, period, subscriptionId);
  }

  isUnlimited(): boolean {
    return this.kind === 'bundle' && this.limit === null;
  }

  toString(): string {
    const allowance = this.isUnlimited() ? 'unlimited' : String(this.limit);
    return `${this.kind}:${allowance}@${this.period.key}`;
  }
}
