import { BillingCycle } from './billing-cycle.ts';
import { BillingPeriod } from './billing-period.ts';
import { MessageQuota } from './message-quota.ts';
import { Money } from './money.ts';
import {
  InvalidBillingPeriodError,
  InvalidSubscriptionTransitionError,
  InsufficientQuotaError,
  SubscriptionNotActiveError,
} from './subscription.errors.ts';
import {
  SubscriptionCancelled,
  SubscriptionCreated,
  SubscriptionDomainEvent,
  SubscriptionExpired,
  SubscriptionPaymentFailed,
  SubscriptionRenewed,
} from './subscription.events.ts';
import { SubscriptionPlan } from './subscription-plan.ts';
import { SubscriptionStatus } from './subscription-status.ts';

export type SubscriptionSnapshot = {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  quota: MessageQuota;
  period: BillingPeriod;
  price: Money;
  autoRenew: boolean;
  cancelledAt: Date | null;
  revision: number;
  createdAt: Date;
};

export type CreateSubscriptionParams = {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  cycle: BillingCycle;
  startsAt: Date;
  autoRenew?: boolean;
};

/**
 * Aggregate root for a paid message bundle. It owns the invariants that make a
 * subscription meaningful: which lifecycle state it is in, which billing window it
 * covers, and how much quota is left inside that window. Nothing outside this class
 * is allowed to assign those fields, which is what keeps cancellation, renewal and
 * expiration transitions in one place.
 */
export class Subscription {
  private readonly id: string;
  private readonly userId: string;
  private readonly plan: SubscriptionPlan;
  private readonly cycle: BillingCycle;
  private readonly price: Money;
  private readonly createdAt: Date;
  private status: SubscriptionStatus;
  private quota: MessageQuota;
  private period: BillingPeriod;
  private autoRenew: boolean;
  private cancelledAt: Date | null;
  private revision: number;
  private readonly snapshotRevision: number;
  private readonly domainEvents: SubscriptionDomainEvent[] = [];

  private constructor(snapshot: SubscriptionSnapshot) {
    this.id = snapshot.id;
    this.userId = snapshot.userId;
    this.plan = snapshot.plan;
    this.cycle = snapshot.cycle;
    this.status = snapshot.status;
    this.quota = snapshot.quota;
    this.period = snapshot.period;
    this.price = snapshot.price;
    this.autoRenew = snapshot.autoRenew;
    this.cancelledAt = snapshot.cancelledAt;
    this.revision = snapshot.revision;
    this.snapshotRevision = snapshot.revision;
    this.createdAt = snapshot.createdAt;
  }

  static create(params: CreateSubscriptionParams): Subscription {
    const now = params.startsAt;
    const subscription = new Subscription({
      id: params.id,
      userId: params.userId,
      plan: params.plan,
      cycle: params.cycle,
      status: SubscriptionStatus.active(),
      quota: params.plan.initialQuota(),
      period: params.cycle.periodStartingAt(params.startsAt),
      price: params.plan.priceFor(params.cycle),
      autoRenew: params.autoRenew ?? true,
      cancelledAt: null,
      revision: 0,
      createdAt: now,
    });

    subscription.record(
      new SubscriptionCreated(
        subscription.id,
        subscription.userId,
        now,
        subscription.plan.name,
        subscription.cycle.kind,
        subscription.price.amountMinor,
        subscription.price.currency,
      ),
    );

    return subscription;
  }

  /** Rebuilds an aggregate from persistence without replaying invariants or events. */
  static rehydrate(snapshot: SubscriptionSnapshot): Subscription {
    return new Subscription(snapshot);
  }

  getId(): string {
    return this.id;
  }

  getUserId(): string {
    return this.userId;
  }

  getPlan(): SubscriptionPlan {
    return this.plan;
  }

  getCycle(): BillingCycle {
    return this.cycle;
  }

  getStatus(): SubscriptionStatus {
    return this.status;
  }

  getQuota(): MessageQuota {
    return this.quota;
  }

  getPeriod(): BillingPeriod {
    return this.period;
  }

  getPrice(): Money {
    return this.price;
  }

  getAutoRenew(): boolean {
    return this.autoRenew;
  }

  getCancelledAt(): Date | null {
    return this.cancelledAt;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  /** Optimistic-lock version; every state change bumps it exactly once. */
  getRevision(): number {
    return this.revision;
  }

  getExpectedRevision(): number {
    return this.snapshotRevision;
  }

  getSnapshot(): SubscriptionSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      plan: this.plan,
      cycle: this.cycle,
      status: this.status,
      quota: this.quota,
      period: this.period,
      price: this.price,
      autoRenew: this.autoRenew,
      cancelledAt: this.cancelledAt,
      revision: this.revision,
      createdAt: this.createdAt,
    };
  }

  /** The moment the next renewal is attempted, which is the end of the paid window. */
  getRenewalDate(): Date {
    return this.period.end;
  }

  /**
   * A cancelled subscription keeps serving until the window it was paid for runs
   * out, so cancellation ends the billing cycle rather than truncating it.
   */
  isServing(at: Date): boolean {
    return (
      (this.status.isActive() || this.status.isCancelled()) &&
      this.period.contains(at)
    );
  }

  canConsumeMessage(at: Date): boolean {
    return this.isServing(at) && this.quota.hasRemaining();
  }

  /** @throws {SubscriptionNotActiveError} outside the paid window, {InsufficientQuotaError} when drained. */
  consumeMessage(at: Date): void {
    if (!this.isServing(at)) {
      throw new SubscriptionNotActiveError(
        'This subscription is not currently serving requests.',
      );
    }

    if (!this.quota.hasRemaining()) {
      throw new InsufficientQuotaError();
    }

    this.quota = this.quota.consume();
    this.revision += 1;
  }

  /** Compensates a message that was consumed but never delivered. */
  refundMessage(): void {
    this.quota = this.quota.refund();
    this.revision += 1;
  }

  setAutoRenew(enabled: boolean): void {
    if (!this.status.isActive()) {
      throw new InvalidSubscriptionTransitionError(
        'Auto-renewal can only be changed on an active subscription.',
      );
    }

    if (this.autoRenew !== enabled) {
      this.autoRenew = enabled;
      this.revision += 1;
    }
  }

  /**
   * Ends the subscription for future renewals while preserving the current billing
   * cycle and every message already consumed. Idempotent: cancelling twice is a
   * no-op rather than an error.
   */
  cancel(at: Date): void {
    if (this.status.isCancelled()) {
      return;
    }

    if (!this.status.canTransitionTo('cancelled')) {
      throw new InvalidSubscriptionTransitionError(
        'Only an active subscription can be cancelled.',
      );
    }

    this.status = SubscriptionStatus.cancelled();
    this.autoRenew = false;
    this.cancelledAt = at;
    this.revision += 1;

    this.record(
      new SubscriptionCancelled(this.id, this.userId, at, this.period.end),
    );
  }

  /**
   * Advances to the next billing period, called only after a successful charge. The
   * caller supplies the period so that the payment result and the state change stay
   * under the aggregate's control, and the period must continue the current one so a
   * replayed renewal cannot silently skip or duplicate a billing period.
   */
  renew(nextPeriod: BillingPeriod, at: Date): void {
    if (!this.status.canTransitionTo('active')) {
      throw new InvalidSubscriptionTransitionError(
        `A ${this.status.kind} subscription cannot be renewed.`,
      );
    }

    if (!this.autoRenew) {
      throw new InvalidSubscriptionTransitionError(
        'Auto-renewal is disabled for this subscription.',
      );
    }

    if (!nextPeriod.startsAt(this.period.end)) {
      throw new InvalidBillingPeriodError();
    }

    this.period = nextPeriod;
    this.quota = this.quota.reset();
    this.status = SubscriptionStatus.active();
    this.revision += 1;

    this.record(
      new SubscriptionRenewed(
        this.id,
        this.userId,
        at,
        nextPeriod.start,
        nextPeriod.end,
      ),
    );
  }

  /** Marks the subscription inactive, for example after a failed renewal charge. */
  expire(at: Date): boolean {
    if (!this.status.canTransitionTo('expired')) {
      return false;
    }

    this.status = SubscriptionStatus.expired();
    this.autoRenew = false;
    this.revision += 1;

    this.record(new SubscriptionExpired(this.id, this.userId, at));

    return true;
  }

  isDueForRenewal(at: Date): boolean {
    return (
      this.autoRenew &&
      this.status.isActive() &&
      at.getTime() >= this.period.end.getTime()
    );
  }

  /** Notes that a charge for the next period was attempted and rejected. */
  recordPaymentFailure(reason: string, at: Date): void {
    this.record(
      new SubscriptionPaymentFailed(this.id, this.userId, at, reason),
    );
  }

  hasLapsed(at: Date): boolean {
    return this.status.isActive() && at.getTime() >= this.period.end.getTime();
  }

  pullDomainEvents(): SubscriptionDomainEvent[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }

  private record(event: SubscriptionDomainEvent): void {
    this.domainEvents.push(event);
  }
}
