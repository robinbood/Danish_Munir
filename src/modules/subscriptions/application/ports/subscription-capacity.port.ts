import type { SubscriptionPlanName } from '../../domain/subscription-plan.ts';

export const SUBSCRIPTION_CAPACITY = Symbol('SubscriptionCapacity');

export type BundleReservation = {
  reservationId: string;
  subscriptionId: string;
  plan: SubscriptionPlanName;
  quotaLimit: number | null;
  /** `null` when the bundle is unlimited; unlimited is never a sentinel number. */
  remainingMessages: number | null;
};

export type AvailableBundle = {
  id: string;
  plan: SubscriptionPlanName;
  remainingMessages: number | null;
  endsAt: Date;
};

/**
 * The contract the Subscriptions context publishes for spending paid quota.
 *
 * Chat depends on this interface and nothing else. It cannot see the subscription
 * tables, the Drizzle adapters, or the selection rule, and every method here is safe
 * to call concurrently.
 */
export interface SubscriptionCapacity {
  /**
   * Returns a read-only set of eligible bundle summaries. Chat owns the selection
   * policy; this contract exposes no persistence details.
   */
  listAvailableBundles(userId: string, at: Date): Promise<AvailableBundle[]>;

  /** Atomically spends from the chosen bundle and records a reservation. */
  tryReserveOneMessage(
    userId: string,
    subscriptionId: string,
    at: Date,
    reservationId: string,
  ): Promise<BundleReservation | null>;

  /** Marks a reservation as delivered. Idempotent. */
  confirm(reservationId: string): Promise<void>;

  /**
   * Returns an unconfirmed message to its bundle. Idempotent: a repeated call, or a
   * call after the reservation was confirmed, changes nothing.
   */
  release(reservationId: string): Promise<void>;
}
