import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ChatMessage } from '../domain/chat-message.ts';
import { MessageQuota } from '../domain/message-quota.ts';
import { MonthlyPeriod } from '../domain/monthly-period.ts';
import { ChatMessageRepositoryPort } from '../application/ports/chat-message-repository.port.ts';
import { UnitOfWork } from '../../../shared/infrastructure/persistence/unit-of-work.ts';
import { chatMessages } from './chat-db.schema.ts';

@Injectable()
export class DrizzleChatMessageRepository extends ChatMessageRepositoryPort {
  constructor(private readonly unitOfWork: UnitOfWork) {
    super();
  }

  async save(message: ChatMessage): Promise<void> {
    await this.unitOfWork.current().insert(chatMessages).values({
      id: message.getId(),
      userId: message.getUserId(),
      question: message.getQuestion(),
      answer: message.getAnswer(),
      tokensUsed: message.getTokensUsed(),
      quotaKind: message.getQuota().kind,
      quotaLimit: message.getQuota().limit,
      quotaSubscriptionId: message.getQuota().subscriptionId,
      quotaPeriod: message.getQuota().period.key,
      createdAt: message.getAskedAt(),
    });
  }

  async findByUser(userId: string): Promise<ChatMessage[]> {
    const rows = await this.unitOfWork
      .current()
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.userId, userId));

    return rows.map((row) =>
      ChatMessage.rehydrate({
        id: row.id,
        userId: row.userId,
        question: row.question,
        answer: row.answer,
        tokensUsed: row.tokensUsed,
        quota:
          row.quotaKind === 'free'
            ? MessageQuota.free(MonthlyPeriod.of(row.quotaPeriod))
            : MessageQuota.bundle(
                row.quotaLimit,
                MonthlyPeriod.of(row.quotaPeriod),
                row.quotaSubscriptionId ?? '',
              ),
        askedAt: row.createdAt,
      }),
    );
  }
}
