export class InvalidSubscriptionTransitionError extends Error {
  constructor(message = 'Invalid subscription transition.') {
    super(message);
    this.name = 'InvalidSubscriptionTransitionError';
  }
}

export class SubscriptionNotActiveError extends Error {
  constructor(message = 'Subscription is not active.') {
    super(message);
    this.name = 'SubscriptionNotActiveError';
  }
}

export class SubscriptionNotFoundError extends Error {
  constructor(message = 'Subscription not found.') {
    super(message);
    this.name = 'SubscriptionNotFoundError';
  }
}

export class InvalidSubscriptionPlanError extends Error {
  constructor(
    message = 'Subscription plan must be basic, pro, or enterprise.',
  ) {
    super(message);
    this.name = 'InvalidSubscriptionPlanError';
  }
}

export class InvalidBillingCycleError extends Error {
  constructor(message = 'Billing cycle must be monthly or yearly.') {
    super(message);
    this.name = 'InvalidBillingCycleError';
  }
}

export class InvalidSubscriptionRequestError extends Error {
  constructor(message = 'Subscription request is invalid.') {
    super(message);
    this.name = 'InvalidSubscriptionRequestError';
  }
}

export class InsufficientQuotaError extends Error {
  constructor(
    message = 'This subscription has no messages left in its current billing period.',
  ) {
    super(message);
    this.name = 'InsufficientQuotaError';
  }
}

export class InvalidBillingPeriodError extends Error {
  constructor(message = 'A renewal must continue the current billing period.') {
    super(message);
    this.name = 'InvalidBillingPeriodError';
  }
}

export class PaymentFailedError extends Error {
  readonly subscriptionId: string;

  constructor(subscriptionId: string, message = 'Payment failed.') {
    super(message);
    this.name = 'PaymentFailedError';
    this.subscriptionId = subscriptionId;
  }
}

export class ConcurrentSubscriptionModificationError extends Error {
  constructor(
    message = 'The subscription was modified concurrently; the change was discarded.',
  ) {
    super(message);
    this.name = 'ConcurrentSubscriptionModificationError';
  }
}
