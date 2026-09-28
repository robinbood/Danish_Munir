import { DomainEvent } from '../../../shared/domain/domain-event.ts';

export type SubscriptionEventName =
  | 'SubscriptionCreated'
  | 'SubscriptionRenewed'
  | 'SubscriptionCancelled'
  | 'SubscriptionExpired'
  | 'SubscriptionPaymentFailed';

export abstract class SubscriptionDomainEvent extends DomainEvent {
  abstract readonly name: SubscriptionEventName;

  protected constructor(
    readonly subscriptionId: string,
    readonly userId: string,
    readonly occurredAt: Date,
  ) {
    super();
  }
}

export class SubscriptionCreated extends SubscriptionDomainEvent {
  readonly name = 'SubscriptionCreated';

  constructor(
    subscriptionId: string,
    userId: string,
    occurredAt: Date,
    readonly plan: string,
    readonly cycle: string,
    readonly priceAmountMinor: number,
    readonly currency: string,
  ) {
    super(subscriptionId, userId, occurredAt);
  }
}

export class SubscriptionRenewed extends SubscriptionDomainEvent {
  readonly name = 'SubscriptionRenewed';

  constructor(
    subscriptionId: string,
    userId: string,
    occurredAt: Date,
    readonly periodStart: Date,
    readonly periodEnd: Date,
  ) {
    super(subscriptionId, userId, occurredAt);
  }
}

export class SubscriptionCancelled extends SubscriptionDomainEvent {
  readonly name = 'SubscriptionCancelled';

  constructor(
    subscriptionId: string,
    userId: string,
    occurredAt: Date,
    readonly accessEndsAt: Date,
  ) {
    super(subscriptionId, userId, occurredAt);
  }
}

export class SubscriptionExpired extends SubscriptionDomainEvent {
  readonly name = 'SubscriptionExpired';

  constructor(subscriptionId: string, userId: string, occurredAt: Date) {
    super(subscriptionId, userId, occurredAt);
  }
}

export class SubscriptionPaymentFailed extends SubscriptionDomainEvent {
  readonly name = 'SubscriptionPaymentFailed';

  constructor(
    subscriptionId: string,
    userId: string,
    occurredAt: Date,
    readonly reason: string,
  ) {
    super(subscriptionId, userId, occurredAt);
  }
}
