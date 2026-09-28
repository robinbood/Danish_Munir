import { Inject, Injectable } from '@nestjs/common';
import { DomainEventPublisher } from '../../../../shared/application/domain-event-publisher.port.ts';
import {
  InvalidSubscriptionRequestError,
  SubscriptionNotFoundError,
} from '../../domain/subscription.errors.ts';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../ports/subscription-repository.port.ts';
import {
  toSubscriptionView,
  type SubscriptionView,
} from '../subscription.view.ts';

export type SetAutoRenewInput = {
  subscriptionId: string;
  autoRenew: boolean;
};

@Injectable()
export class SetAutoRenewUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(DomainEventPublisher) private readonly events: DomainEventPublisher,
  ) {}

  async execute(input: SetAutoRenewInput): Promise<SubscriptionView> {
    if (
      !input ||
      typeof input.subscriptionId !== 'string' ||
      input.subscriptionId.trim().length === 0 ||
      typeof input.autoRenew !== 'boolean'
    ) {
      throw new InvalidSubscriptionRequestError(
        'subscriptionId and boolean autoRenew are required.',
      );
    }

    const subscription = await this.subscriptions.findById(
      input.subscriptionId,
    );

    if (!subscription) {
      throw new SubscriptionNotFoundError();
    }

    subscription.setAutoRenew(input.autoRenew);
    await this.subscriptions.save(subscription);
    this.events.publish(subscription.pullDomainEvents());

    return toSubscriptionView(subscription);
  }
}
