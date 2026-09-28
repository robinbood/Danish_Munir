import { Inject, Injectable } from '@nestjs/common';
import { DomainEventPublisher } from '../../../shared/application/domain-event-publisher.port.ts';
import { Clock } from '../../../shared/domain/clock.ts';
import { IdGenerator } from '../../../shared/domain/id-generator.ts';
import { UnitOfWork } from '../../../shared/infrastructure/persistence/unit-of-work.ts';
import { ChatMessage } from '../domain/chat-message.ts';
import { MessageQuota } from '../domain/message-quota.ts';
import { MonthlyPeriod } from '../domain/monthly-period.ts';
import { ChatQuotaPolicy } from '../domain/chat-quota-policy.ts';
import {
  FreeQuotaExceededError,
  InsufficientPaidQuotaError,
  InvalidChatQuestionError,
  InvalidChatRequestError,
} from '../domain/chat.errors.ts';
import { ChatAiProviderPort } from './ports/chat-ai-provider.port.ts';
import { ChatMessageRepositoryPort } from './ports/chat-message-repository.port.ts';
import { ChatQuotaRepositoryPort } from './ports/chat-quota-repository.port.ts';
import {
  SUBSCRIPTION_CAPACITY,
  type SubscriptionCapacity,
  type BundleReservation,
} from '../../subscriptions/application/ports/subscription-capacity.port.ts';

export type AskQuestionInput = {
  userId: string;
  question: string;
};

export type AskQuestionOutput = {
  answer: string;
  message: ChatMessage;
};

@Injectable()
export class AskQuestionUseCase {
  constructor(
    @Inject(ChatAiProviderPort)
    private readonly aiProvider: ChatAiProviderPort,
    @Inject(ChatMessageRepositoryPort)
    private readonly messageRepository: ChatMessageRepositoryPort,
    @Inject(ChatQuotaRepositoryPort)
    private readonly quotaRepository: ChatQuotaRepositoryPort,
    @Inject(SUBSCRIPTION_CAPACITY)
    private readonly subscriptionCapacity: SubscriptionCapacity,
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(IdGenerator)
    private readonly ids: IdGenerator,
    @Inject(DomainEventPublisher)
    private readonly events: DomainEventPublisher,
    private readonly unitOfWork: UnitOfWork,
    private readonly quotaPolicy: ChatQuotaPolicy,
  ) {}

  async execute(input: AskQuestionInput): Promise<AskQuestionOutput> {
    if (
      !input ||
      typeof input.userId !== 'string' ||
      input.userId.trim().length === 0
    ) {
      throw new InvalidChatRequestError();
    }

    const normalizedQuestion =
      typeof input.question === 'string' ? input.question.trim() : '';
    if (!normalizedQuestion) {
      throw new InvalidChatQuestionError();
    }

    const askedAt = this.clock.now();
    const period = MonthlyPeriod.from(askedAt);
    const reservationId = this.ids.next();
    const freeReserved = await this.quotaRepository.tryReserveFreeMessage(
      input.userId,
      period.key,
    );
    let bundleReservation: BundleReservation | null = null;

    try {
      if (!freeReserved) {
        // The free allowance is already spent for this period, so the only remaining
        // question is which bundle pays. Selection is retried because a bundle can be
        // drained by a concurrent request between listing and reserving.
        const orderedBundles = await this.subscriptionCapacity.listAvailableBundles(
          input.userId,
          askedAt,
        );
        const candidateCount = orderedBundles.length;

        while (orderedBundles.length > 0) {
          const selectedBundle = this.quotaPolicy.chooseBundle(orderedBundles);
          if (!selectedBundle) break;
          orderedBundles.splice(
            orderedBundles.findIndex(
              (bundle) => bundle.id === selectedBundle.id,
            ),
            1,
          );
          bundleReservation =
            await this.subscriptionCapacity.tryReserveOneMessage(
              input.userId,
              selectedBundle.id,
              askedAt,
              reservationId,
            );
          if (bundleReservation) break;
        }

        if (!bundleReservation) {
          throw candidateCount > 0
            ? new InsufficientPaidQuotaError()
            : new FreeQuotaExceededError();
        }
      }

      const { answer, tokensUsed } =
        await this.aiProvider.generateAnswer(normalizedQuestion);
      const message = ChatMessage.answer({
        id: this.ids.next(),
        userId: input.userId,
        question: normalizedQuestion,
        answer,
        tokensUsed,
        quota: bundleReservation
          ? MessageQuota.bundle(
              bundleReservation.quotaLimit,
              period,
              bundleReservation.subscriptionId,
            )
          : MessageQuota.free(period),
        askedAt,
      });

      await this.unitOfWork.runInTransaction(async () => {
        await this.messageRepository.save(message);
        if (bundleReservation) {
          await this.subscriptionCapacity.confirm(reservationId);
        }
      });
      this.events.publish(message.pullDomainEvents());

      return {
        answer,
        message,
      };
    } catch (error) {
      if (freeReserved) {
        await this.quotaRepository
          .releaseFreeMessage(input.userId, period.key)
          .catch(() => undefined);
      } else if (bundleReservation) {
        await this.subscriptionCapacity
          .release(reservationId)
          .catch(() => undefined);
      }

      throw error;
    }
  }
}
