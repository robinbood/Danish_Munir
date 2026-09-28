import { describe, expect, it } from 'vitest';
import { AskQuestionUseCase } from '../application/ask-question.use-case.ts';
import { ChatAiProviderPort } from '../application/ports/chat-ai-provider.port.ts';
import type { ChatCompletion } from '../application/ports/chat-ai-provider.port.ts';
import { InMemoryChatMessageRepository } from '../infrastructure/in-memory-chat-message.repository.ts';
import { InMemoryChatQuotaRepository } from '../infrastructure/in-memory-chat-quota.repository.ts';
import { FreeQuotaExceededError } from '../domain/chat.errors.ts';
import { ChatQuotaPolicy } from '../domain/chat-quota-policy.ts';
import { Clock } from '../../../shared/domain/clock.ts';
import { IdGenerator } from '../../../shared/domain/id-generator.ts';
import { DomainEventPublisher } from '../../../shared/application/domain-event-publisher.port.ts';
import { UnitOfWork } from '../../../shared/infrastructure/persistence/unit-of-work.ts';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type {
  SubscriptionCapacity,
  BundleReservation,
} from '../../subscriptions/application/ports/subscription-capacity.port.ts';

class StubAiProvider extends ChatAiProviderPort {
  async generateAnswer(question: string): Promise<ChatCompletion> {
    return {
      answer: `Answer to: ${question}`,
      tokensUsed: Math.max(1, Math.ceil(question.length / 4)),
    };
  }
}

class FailingAiProvider extends ChatAiProviderPort {
  async generateAnswer(): Promise<ChatCompletion> {
    throw new Error('AI provider unavailable');
  }
}

class StubClock extends Clock {
  now(): Date {
    return new Date('2026-09-28T12:00:00.000Z');
  }
}

class StubIdGenerator extends IdGenerator {
  private sequence = 0;

  next(): string {
    return `id-${++this.sequence}`;
  }
}

class StubEventPublisher extends DomainEventPublisher {
  publish(): void {}
}

class StubUnitOfWork extends UnitOfWork {
  async runInTransaction<T>(
    work: (db: PostgresJsDatabase) => Promise<T>,
  ): Promise<T> {
    return work(undefined as unknown as PostgresJsDatabase);
  }

  current(): PostgresJsDatabase {
    return undefined as unknown as PostgresJsDatabase;
  }
}

function createCapacity(
  reservation: BundleReservation | null = null,
): SubscriptionCapacity {
  return {
    listAvailableBundles: async () =>
      reservation
        ? [
            {
              id: reservation.subscriptionId,
              plan: reservation.plan,
              remainingMessages: reservation.remainingMessages,
              endsAt: new Date('2026-10-28T12:00:00.000Z'),
            },
          ]
        : [],
    tryReserveOneMessage: async () => reservation,
    confirm: async () => undefined,
    release: async () => undefined,
  };
}

function createUseCase(
  messageRepository: InMemoryChatMessageRepository,
  quotaRepository: InMemoryChatQuotaRepository,
  capacity = createCapacity(),
  aiProvider: ChatAiProviderPort = new StubAiProvider(),
) {
  return new AskQuestionUseCase(
    aiProvider,
    messageRepository,
    quotaRepository,
    capacity,
    new StubClock(),
    new StubIdGenerator(),
    new StubEventPublisher(),
    new StubUnitOfWork(),
    new ChatQuotaPolicy(),
  );
}

describe('AskQuestionUseCase', () => {
  it('allows a question within the free monthly quota', async () => {
    const messageRepository = new InMemoryChatMessageRepository();
    const quotaRepository = new InMemoryChatQuotaRepository();
    const useCase = createUseCase(messageRepository, quotaRepository);

    const result = await useCase.execute({
      userId: 'u-1',
      question: 'What is DDD?',
    });

    expect(result.answer).toContain('Answer to: What is DDD?');
    expect(result.message.getQuestion()).toBe('What is DDD?');
  });

  it('uses a paid bundle when free quota is exhausted', async () => {
    const messageRepository = new InMemoryChatMessageRepository();
    const quotaRepository = new InMemoryChatQuotaRepository();
    const monthKey = '2026-09';
    await quotaRepository.tryReserveFreeMessage('u-2', monthKey);
    await quotaRepository.tryReserveFreeMessage('u-2', monthKey);
    await quotaRepository.tryReserveFreeMessage('u-2', monthKey);
    const useCase = createUseCase(
      messageRepository,
      quotaRepository,
      createCapacity({
        reservationId: 'reservation-1',
        subscriptionId: 'subscription-1',
        plan: 'pro',
        quotaLimit: 100,
        remainingMessages: 99,
      }),
    );

    const result = await useCase.execute({
      userId: 'u-2',
      question: 'Explain clean architecture',
    });

    expect(result.answer).toContain('Answer to: Explain clean architecture');
    expect((await messageRepository.findByUser('u-2')).length).toBe(1);
  });

  it('throws when free quota is exhausted and no valid bundle exists', async () => {
    const messageRepository = new InMemoryChatMessageRepository();
    const quotaRepository = new InMemoryChatQuotaRepository();
    const monthKey = '2026-09';
    await quotaRepository.tryReserveFreeMessage('u-3', monthKey);
    await quotaRepository.tryReserveFreeMessage('u-3', monthKey);
    await quotaRepository.tryReserveFreeMessage('u-3', monthKey);
    const useCase = createUseCase(messageRepository, quotaRepository);

    await expect(
      useCase.execute({ userId: 'u-3', question: 'No bundle here' }),
    ).rejects.toBeInstanceOf(FreeQuotaExceededError);
  });

  it('releases a free reservation when the AI provider fails', async () => {
    const quotaRepository = new InMemoryChatQuotaRepository();
    const useCase = createUseCase(
      new InMemoryChatMessageRepository(),
      quotaRepository,
      createCapacity(),
      new FailingAiProvider(),
    );

    await expect(
      useCase.execute({ userId: 'u-failure', question: 'Retry me' }),
    ).rejects.toThrow('AI provider unavailable');
    expect(
      await quotaRepository.tryReserveFreeMessage('u-failure', '2026-09'),
    ).toBe(true);
  });
});
