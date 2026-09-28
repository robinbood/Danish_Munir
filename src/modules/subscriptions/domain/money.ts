export type CurrencyCode = 'USD';

/**
 * A monetary amount held in minor units (cents). Money is never represented as a
 * float, so totals stay exact when a cycle is renewed repeatedly.
 */
export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: CurrencyCode,
  ) {}

  static of(amountMinor: number, currency: CurrencyCode = 'USD'): Money {
    if (!Number.isInteger(amountMinor)) {
      throw new RangeError(
        `Money amount must be an integer number of minor units, received ${amountMinor}.`,
      );
    }

    if (amountMinor < 0) {
      throw new RangeError(
        `Money amount cannot be negative, received ${amountMinor}.`,
      );
    }

    return new Money(amountMinor, currency);
  }

  static zero(currency: CurrencyCode = 'USD'): Money {
    return Money.of(0, currency);
  }

  multiply(factor: number): Money {
    return Money.of(Math.round(this.amountMinor * factor), this.currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amountMinor + other.amountMinor, this.currency);
  }

  toString(): string {
    return `${(this.amountMinor / 100).toFixed(2)} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new RangeError(
        `Cannot combine ${this.currency} with ${other.currency}.`,
      );
    }
  }
}
