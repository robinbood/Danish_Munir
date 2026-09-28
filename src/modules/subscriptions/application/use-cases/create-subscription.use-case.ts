import { Inject, Injectable } from '@nestjs/common';
import { DomainEventPublisher } from '../../../../shared/application/domain-event-publisher.port.ts';
import { Clock } from '../../../../shared/domain/clock.ts';
import { IdGenerator } from '../../../../shared/domain/id-generator.ts';
import {
  BillingCycle,
  type BillingCycleKind,
} from '../../domain/billing-cycle.ts';
import { Subscription } from '../../domain/subscription.ts';
import {
  SubscriptionPlan,
  type SubscriptionPlanName,
} from '../../domain/subscription-plan.ts';
import { InvalidSubscriptionRequestError } from '../../domain/subscription.errors.ts';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../ports/subscription-repository.port.ts';
import {
  toSubscriptionView,
  type SubscriptionView,
} from '../subscription.view.ts';

export type CreateSubscriptionInput = {
  userId: string;
  plan: SubscriptionPlanName;
  cycle: BillingCycleKind;
  autoRenew?: boolean;
};

@Injectable()
export class CreateSubscriptionUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(DomainEventPublisher) private readonly events: DomainEventPublisher,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async execute(input: CreateSubscriptionInput): Promise<SubscriptionView> {
    if (
      !input ||
      typeof input.userId !== 'string' ||
      input.userId.trim().length === 0
    ) {
      throw new InvalidSubscriptionRequestError('A userId is required.');
    }
    if (input.autoRenew !== undefined && typeof input.autoRenew !== 'boolean') {
      throw new InvalidSubscriptionRequestError('autoRenew must be a boolean.');
    }

    const subscription = Subscription.create({
      id: this.ids.next(),
      userId: input.userId,
      plan: SubscriptionPlan.from(input.plan),
      cycle: BillingCycle.from(input.cycle),
      startsAt: this.clock.now(),
      autoRenew: input.autoRenew ?? true,
    });

    await this.subscriptions.save(subscription);
    this.events.publish(subscription.pullDomainEvents());

    return toSubscriptionView(subscription);
  }
}
