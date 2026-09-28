const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * A calendar month in `YYYY-MM` form.
 *
 * The free allowance is modelled as usage keyed by this value rather than as a
 * counter that gets reset. A new month is simply a new key, so the allowance
 * refreshes on the first of the month with no reset job and no mass update.
 */
export class MonthlyPeriod {
  private constructor(readonly key: string) {}

  static from(date: Date): MonthlyPeriod {
    return new MonthlyPeriod(date.toISOString().slice(0, 7));
  }

  static of(key: string): MonthlyPeriod {
    if (!PERIOD_PATTERN.test(key)) {
      throw new RangeError(
        `A monthly period must look like YYYY-MM, received "${key}".`,
      );
    }

    return new MonthlyPeriod(key);
  }

  toString(): string {
    return this.key;
  }
}
