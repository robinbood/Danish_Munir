import { BillingPeriod } from './billing-period.ts';
import { InvalidBillingCycleError } from './subscription.errors.ts';

export type BillingCycleKind = 'monthly' | 'yearly';

const MONTHS_IN_YEAR = 12;

export class BillingCycle {
  private constructor(readonly kind: BillingCycleKind) {}

  static monthly(): BillingCycle {
    return new BillingCycle('monthly');
  }

  static yearly(): BillingCycle {
    return new BillingCycle('yearly');
  }

  static from(kind: string): BillingCycle {
    if (kind === 'monthly') return BillingCycle.monthly();
    if (kind === 'yearly') return BillingCycle.yearly();
    throw new InvalidBillingCycleError();
  }

  /** How many months this cycle covers; a yearly cycle bills twelve at once. */
  get months(): number {
    return this.kind === 'yearly' ? MONTHS_IN_YEAR : 1;
  }

  /** The calendar-correct period that begins on `start`. */
  periodStartingAt(start: Date): BillingPeriod {
    return new BillingPeriod(start, addCalendarMonths(start, this.months));
  }
}

function addCalendarMonths(start: Date, months: number): Date {
  const targetMonthStart = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1),
  );
  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  targetMonthStart.setUTCDate(
    Math.min(start.getUTCDate(), lastDayOfTargetMonth),
  );
  targetMonthStart.setUTCHours(
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  );

  return targetMonthStart;
}
