import { Inject, Injectable } from '@nestjs/common';
import { DomainEventPublisher } from '../../../../shared/application/domain-event-publisher.port.ts';
import { ConcurrentSubscriptionModificationError } from '../../domain/subscription.errors.ts';
import { RenewalPolicy } from '../../domain/renewal-policy.ts';
import type { Subscription } from '../../domain/subscription.ts';
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
} from '../ports/payment-gateway.port.ts';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../ports/subscription-repository.port.ts';
import {
  toSubscriptionView,
  type SubscriptionView,
} from '../subscription.view.ts';

export type RenewalResult =
  | { status: 'renewed'; subscription: SubscriptionView; receiptId: string }
  | { status: 'expired'; subscription: SubscriptionView; reason: string }
  | { status: 'skipped'; subscription: SubscriptionView; reason: string };

/**
 * Runs one renewal attempt: charge first, then apply the outcome to the aggregate
 * and persist it. The charge happens outside the transaction so no database work is
 * held open while an external provider is called.
 */
@Injectable()
export class SubscriptionRenewer {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(PAYMENT_GATEWAY) private readonly payments: PaymentGateway,
    @Inject(DomainEventPublisher) private readonly events: DomainEventPublisher,
    private readonly policy: RenewalPolicy,
  ) {}

  async renew(subscription: Subscription, now: Date): Promise<RenewalResult> {
    if (!this.policy.shouldAttempt(subscription, now)) {
      return {
        status: 'skipped',
        subscription: toSubscriptionView(subscription),
        reason: 'The subscription is not due for renewal.',
      };
    }

    const outcome = await this.payments.charge({
      subscriptionId: subscription.getId(),
      userId: subscription.getUserId(),
      idempotencyKey: `${subscription.getId()}:${subscription.getRenewalDate().toISOString()}`,
      amount: subscription.getPrice(),
      description: `${subscription.getPlan().name} ${subscription.getCycle().kind} renewal`,
    });

    if (outcome.status === 'failed') {
      subscription.recordPaymentFailure(outcome.reason, now);
    }

    const resolution = this.policy.resolve(subscription, now, outcome);

    if (resolution.kind === 'skipped') {
      return {
        status: 'skipped',
        subscription: toSubscriptionView(subscription),
        reason: resolution.reason,
      };
    }

    try {
      await this.subscriptions.save(subscription);
    } catch (error) {
      if (error instanceof ConcurrentSubscriptionModificationError) {
        return {
          status: 'skipped',
          subscription: toSubscriptionView(subscription),
          reason: 'Another renewal already settled this billing period.',
        };
      }

      throw error;
    }

    this.events.publish(subscription.pullDomainEvents());

    return resolution.kind === 'renewed'
      ? {
          status: 'renewed',
          subscription: toSubscriptionView(subscription),
          receiptId: resolution.receiptId,
        }
      : {
          status: 'expired',
          subscription: toSubscriptionView(subscription),
          reason: resolution.reason,
        };
  }
}
