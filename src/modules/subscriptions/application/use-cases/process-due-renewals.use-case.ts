import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/domain/clock.ts';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../ports/subscription-repository.port.ts';
import {
  SubscriptionRenewer,
  type RenewalResult,
} from './subscription-renewer.ts';

export type ProcessDueRenewalsInput = {
  limit?: number;
};

export type ProcessDueRenewalsResult = {
  processed: number;
  renewed: number;
  expired: number;
  skipped: number;
  results: RenewalResult[];
};

const DEFAULT_BATCH_SIZE = 50;

/** Batch entry point used by the renewal scheduler and the operator endpoint. */
@Injectable()
export class ProcessDueRenewalsUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    private readonly renewer: SubscriptionRenewer,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async execute(
    input: ProcessDueRenewalsInput = {},
  ): Promise<ProcessDueRenewalsResult> {
    const now = this.clock.now();
    const due = await this.subscriptions.findDueForRenewal(
      now,
      input.limit ?? DEFAULT_BATCH_SIZE,
    );
    const results: RenewalResult[] = [];

    for (const subscription of due) {
      results.push(await this.renewer.renew(subscription, now));
    }

    return {
      processed: results.length,
      renewed: results.filter((result) => result.status === 'renewed').length,
      expired: results.filter((result) => result.status === 'expired').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      results,
    };
  }
}
