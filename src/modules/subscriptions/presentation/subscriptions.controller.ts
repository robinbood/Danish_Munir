import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { z } from 'zod';
import { CancelSubscriptionUseCase } from '../application/use-cases/cancel-subscription.use-case.ts';
import { CreateSubscriptionUseCase } from '../application/use-cases/create-subscription.use-case.ts';
import {
  GetSubscriptionUseCase,
  ListSubscriptionsUseCase,
} from '../application/use-cases/query-subscriptions.use-case.ts';
import { ProcessDueRenewalsUseCase } from '../application/use-cases/process-due-renewals.use-case.ts';
import { RenewSubscriptionUseCase } from '../application/use-cases/renew-subscription.use-case.ts';
import { SetAutoRenewUseCase } from '../application/use-cases/set-auto-renew.use-case.ts';
import { ZodValidationPipe } from '../../../shared/presentation/zod-validation.pipe.ts';
import { SubscriptionHttpExceptionFilter } from './subscription-http-exception.filter.ts';

const createSubscriptionSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required.'),
  plan: z.enum(['basic', 'pro', 'enterprise']),
  cycle: z.enum(['monthly', 'yearly']),
  autoRenew: z.boolean().optional(),
});

const setAutoRenewSchema = z.object({
  autoRenew: z.boolean(),
});

export type CreateSubscriptionDto = z.infer<typeof createSubscriptionSchema>;

@Controller('subscriptions')
@UseFilters(SubscriptionHttpExceptionFilter)
export class SubscriptionsController {
  constructor(
    private readonly createSubscriptionUseCase: CreateSubscriptionUseCase,
    private readonly getSubscriptionUseCase: GetSubscriptionUseCase,
    private readonly listSubscriptionsUseCase: ListSubscriptionsUseCase,
    private readonly cancelSubscriptionUseCase: CancelSubscriptionUseCase,
    private readonly renewSubscriptionUseCase: RenewSubscriptionUseCase,
    private readonly setAutoRenewUseCase: SetAutoRenewUseCase,
    private readonly processDueRenewalsUseCase: ProcessDueRenewalsUseCase,
  ) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createSubscriptionSchema))
    dto: CreateSubscriptionDto,
  ) {
    return this.createSubscriptionUseCase.execute(dto);
  }

  @Get()
  list(@Query('userId') userId: string) {
    return this.listSubscriptionsUseCase.execute(userId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.getSubscriptionUseCase.execute(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') subscriptionId: string) {
    return this.cancelSubscriptionUseCase.execute({ subscriptionId });
  }

  @Post(':id/renew')
  renew(@Param('id') subscriptionId: string) {
    return this.renewSubscriptionUseCase.execute({ subscriptionId });
  }

  @Post(':id/auto-renew')
  setAutoRenew(
    @Param('id') subscriptionId: string,
    @Body(new ZodValidationPipe(setAutoRenewSchema)) body: { autoRenew: boolean },
  ) {
    return this.setAutoRenewUseCase.execute({ subscriptionId, ...body });
  }

  @Post('renewals/process-due')
  processDueRenewals() {
    return this.processDueRenewalsUseCase.execute();
  }
}
