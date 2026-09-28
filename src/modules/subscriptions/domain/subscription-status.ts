export type SubscriptionStatusKind = 'active' | 'cancelled' | 'expired';

const ALLOWED_TRANSITIONS: Readonly<
  Record<SubscriptionStatusKind, readonly SubscriptionStatusKind[]>
> = {
  active: ['active', 'cancelled', 'expired'],
  cancelled: [],
  expired: [],
};

export class SubscriptionStatus {
  private constructor(readonly kind: SubscriptionStatusKind) {}

  static active(): SubscriptionStatus {
    return new SubscriptionStatus('active');
  }

  static cancelled(): SubscriptionStatus {
    return new SubscriptionStatus('cancelled');
  }

  static expired(): SubscriptionStatus {
    return new SubscriptionStatus('expired');
  }

  static from(kind: SubscriptionStatusKind): SubscriptionStatus {
    switch (kind) {
      case 'active':
        return SubscriptionStatus.active();
      case 'cancelled':
        return SubscriptionStatus.cancelled();
      case 'expired':
        return SubscriptionStatus.expired();
    }
  }

  isActive(): boolean {
    return this.kind === 'active';
  }

  isCancelled(): boolean {
    return this.kind === 'cancelled';
  }

  isExpired(): boolean {
    return this.kind === 'expired';
  }

  /**
   * A successful renewal keeps an `active` subscription in `active`, which is why
   * `active -> active` is legal. `cancelled` and `expired` are terminal, which is
   * what makes a repeated renewal attempt a no-op instead of a second billing period.
   */
  canTransitionTo(next: SubscriptionStatusKind): boolean {
    return ALLOWED_TRANSITIONS[this.kind].includes(next);
  }
}
