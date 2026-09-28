import { Inject, Injectable } from '@nestjs/common';
import { DomainEventPublisher } from '../../../../shared/application/domain-event-publisher.port.ts';
import { Clock } from '../../../../shared/domain/clock.ts';
import { SubscriptionNotFoundError } from '../../domain/subscription.errors.ts';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../ports/subscription-repository.port.ts';
import {
  toSubscriptionView,
  type SubscriptionView,
} from '../subscription.view.ts';

export type CancelSubscriptionInput = {
  subscriptionId: string;
};

@Injectable()
export class CancelSubscriptionUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(DomainEventPublisher) private readonly events: DomainEventPublisher,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  /**
   * Ends the subscription for future renewals. The aggregate keeps serving the
   * period the user already paid for and keeps every consumed message, so
   * cancelling is a state transition rather than a delete.
   */
  async execute(input: CancelSubscriptionInput): Promise<SubscriptionView> {
    const subscription = await this.subscriptions.findById(
      input.subscriptionId,
    );

    if (!subscription) {
      throw new SubscriptionNotFoundError();
    }

    subscription.cancel(this.clock.now());
    await this.subscriptions.save(subscription);
    this.events.publish(subscription.pullDomainEvents());

    return toSubscriptionView(subscription);
  }
}
