import type { Subscription } from '../../domain/subscription.ts';

export const SUBSCRIPTION_REPOSITORY = Symbol('SubscriptionRepository');

/**
 * Points inward at the Subscription aggregate. Implementations translate to and from
 * persistence; nothing here leaks a query builder, a row shape or a table name.
 */
export interface SubscriptionRepository {
  /**
   * Persists the aggregate using optimistic locking on its revision. Implementations
   * reject the write when the stored revision has moved on, which is what makes a
   * repeated renewal attempt harmless rather than a second billing period.
   */
  save(subscription: Subscription): Promise<void>;

  findById(id: string): Promise<Subscription | null>;

  findByUser(userId: string): Promise<Subscription[]>;

  /** Subscriptions whose paid window has elapsed and that still want to renew. */
  findDueForRenewal(now: Date, limit: number): Promise<Subscription[]>;
}
