/**
 * A half-open date range `[start, end)` describing the window a subscription is paid
 * for. It is half-open so that adjacent billing periods never overlap and `end` can
 * be reused verbatim as the next period's `start`.
 */
export class BillingPeriod {
  constructor(
    readonly start: Date,
    readonly end: Date,
  ) {
    if (end.getTime() <= start.getTime()) {
      throw new RangeError('A billing period must end after it starts.');
    }
  }

  contains(date: Date): boolean {
    const at = date.getTime();
    return at >= this.start.getTime() && at < this.end.getTime();
  }

  startsAt(date: Date): boolean {
    return this.start.getTime() === date.getTime();
  }

  toString(): string {
    return `${this.start.toISOString()} -> ${this.end.toISOString()}`;
  }
}
