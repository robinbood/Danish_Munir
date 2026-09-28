import { InsufficientQuotaError } from './subscription.errors.ts';

/**
 * How many messages a subscription may still send.
 *
 * `limit === null` means unlimited. Enterprise is represented explicitly as
 * unlimited rather than as a very large number, so "is this unlimited?" is always a
 * real question with a real answer.
 */
export class MessageQuota {
  private constructor(
    readonly limit: number | null,
    readonly remaining: number | null,
  ) {}

  static of(
    limit: number | null,
    remaining: number | null = limit,
  ): MessageQuota {
    if (limit === null) {
      if (remaining !== null) {
        throw new RangeError(
          'An unlimited quota cannot have a remaining count.',
        );
      }

      return new MessageQuota(null, null);
    }

    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError(
        `A message limit must be a non-negative integer, received ${limit}.`,
      );
    }

    if (
      remaining === null ||
      !Number.isInteger(remaining) ||
      remaining < 0 ||
      remaining > limit
    ) {
      throw new RangeError(
        `A remaining count must be an integer between 0 and ${limit}, received ${remaining}.`,
      );
    }

    return new MessageQuota(limit, remaining);
  }

  static unlimited(): MessageQuota {
    return MessageQuota.of(null);
  }

  isUnlimited(): boolean {
    return this.limit === null;
  }

  hasRemaining(): boolean {
    return this.isUnlimited() || (this.remaining ?? 0) > 0;
  }

  /** @throws {InsufficientQuotaError} when the quota is already exhausted. */
  consume(): MessageQuota {
    if (this.isUnlimited()) {
      return this;
    }

    const current = this.remaining ?? 0;

    if (current <= 0) {
      throw new InsufficientQuotaError();
    }

    return MessageQuota.of(this.limit, current - 1);
  }

  /** Returns one message to the quota, used to compensate a failed AI call. */
  refund(): MessageQuota {
    if (this.isUnlimited()) {
      return this;
    }

    return MessageQuota.of(this.limit, (this.remaining ?? 0) + 1);
  }

  reset(): MessageQuota {
    return MessageQuota.of(this.limit);
  }
}
