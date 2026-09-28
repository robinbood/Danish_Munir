import { Inject, Injectable } from '@nestjs/common';
import { SubscriptionNotFoundError } from '../../domain/subscription.errors.ts';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../ports/subscription-repository.port.ts';
import {
  toSubscriptionView,
  type SubscriptionView,
} from '../subscription.view.ts';

@Injectable()
export class GetSubscriptionUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
  ) {}

  async execute(subscriptionId: string): Promise<SubscriptionView> {
    const subscription = await this.subscriptions.findById(subscriptionId);

    if (!subscription) {
      throw new SubscriptionNotFoundError();
    }

    return toSubscriptionView(subscription);
  }
}

@Injectable()
export class ListSubscriptionsUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
  ) {}

  async execute(userId: string): Promise<SubscriptionView[]> {
    const subscriptions = await this.subscriptions.findByUser(userId);
    return subscriptions.map(toSubscriptionView);
  }
}
