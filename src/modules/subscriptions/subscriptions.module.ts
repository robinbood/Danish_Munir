import { Module } from '@nestjs/common';
import { SUBSCRIPTION_CAPACITY } from './application/ports/subscription-capacity.port.ts';
import { PAYMENT_GATEWAY } from './application/ports/payment-gateway.port.ts';
import { SUBSCRIPTION_REPOSITORY } from './application/ports/subscription-repository.port.ts';
import { CancelSubscriptionUseCase } from './application/use-cases/cancel-subscription.use-case.ts';
import { CreateSubscriptionUseCase } from './application/use-cases/create-subscription.use-case.ts';
import {
  GetSubscriptionUseCase,
  ListSubscriptionsUseCase,
} from './application/use-cases/query-subscriptions.use-case.ts';
import { ProcessDueRenewalsUseCase } from './application/use-cases/process-due-renewals.use-case.ts';
import { RenewSubscriptionUseCase } from './application/use-cases/renew-subscription.use-case.ts';
import { SetAutoRenewUseCase } from './application/use-cases/set-auto-renew.use-case.ts';
import { SubscriptionRenewer } from './application/use-cases/subscription-renewer.ts';
import { RenewalPolicy } from './domain/renewal-policy.ts';
import { DrizzleSubscriptionCapacity } from './infrastructure/drizzle-subscription-capacity.ts';
import { DrizzleSubscriptionRepository } from './infrastructure/drizzle-subscription.repository.ts';
import { SimulatedPaymentGateway } from './infrastructure/simulated-payment.gateway.ts';
import { RenewalScheduler } from './infrastructure/renewal.scheduler.ts';
import { SubscriptionsController } from './presentation/subscriptions.controller.ts';

@Module({
  controllers: [SubscriptionsController],
  providers: [
    CreateSubscriptionUseCase,
    CancelSubscriptionUseCase,
    GetSubscriptionUseCase,
    ListSubscriptionsUseCase,
    ProcessDueRenewalsUseCase,
    RenewSubscriptionUseCase,
    SetAutoRenewUseCase,
    SubscriptionRenewer,
    RenewalScheduler,
    RenewalPolicy,
    {
      provide: SUBSCRIPTION_REPOSITORY,
      useClass: DrizzleSubscriptionRepository,
    },
    { provide: PAYMENT_GATEWAY, useClass: SimulatedPaymentGateway },
    { provide: SUBSCRIPTION_CAPACITY, useClass: DrizzleSubscriptionCapacity },
  ],
  exports: [SUBSCRIPTION_CAPACITY],
})
export class SubscriptionsModule {}
