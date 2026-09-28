import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/domain/clock.ts';
import { SubscriptionNotFoundError } from '../../domain/subscription.errors.ts';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../ports/subscription-repository.port.ts';
import {
  SubscriptionRenewer,
  type RenewalResult,
} from './subscription-renewer.ts';

export type RenewSubscriptionInput = {
  subscriptionId: string;
};

/**
 * Renews a single subscription. Calling it repeatedly, or concurrently, is safe: the
 * aggregate refuses to leave a terminal state, and the optimistic lock rejects a
 * second write for the same billing period.
 */
@Injectable()
export class RenewSubscriptionUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    private readonly renewer: SubscriptionRenewer,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async execute(input: RenewSubscriptionInput): Promise<RenewalResult> {
    const subscription = await this.subscriptions.findById(
      input.subscriptionId,
    );

    if (!subscription) {
      throw new SubscriptionNotFoundError();
    }

    return this.renewer.renew(subscription, this.clock.now());
  }
}
