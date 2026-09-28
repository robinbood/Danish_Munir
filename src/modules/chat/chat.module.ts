import { Module } from '@nestjs/common';
import { AskQuestionUseCase } from './application/ask-question.use-case.ts';
import { ChatAiProviderPort } from './application/ports/chat-ai-provider.port.ts';
import { ChatMessageRepositoryPort } from './application/ports/chat-message-repository.port.ts';
import { ChatQuotaRepositoryPort } from './application/ports/chat-quota-repository.port.ts';
import { DrizzleChatMessageRepository } from './infrastructure/drizzle-chat-message.repository.ts';
import { DrizzleChatQuotaRepository } from './infrastructure/drizzle-chat-quota.repository.ts';
import { MockOpenAiProvider } from './infrastructure/mock-openai.provider.ts';
import { ChatController } from './presentation/chat.controller.ts';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.ts';
import { ChatQuotaPolicy } from './domain/chat-quota-policy.ts';

@Module({
  imports: [SubscriptionsModule],
  controllers: [ChatController],
  providers: [
    AskQuestionUseCase,
    ChatQuotaPolicy,
    {
      provide: ChatAiProviderPort,
      useClass: MockOpenAiProvider,
    },
    {
      provide: ChatMessageRepositoryPort,
      useClass: DrizzleChatMessageRepository,
    },
    {
      provide: ChatQuotaRepositoryPort,
      useClass: DrizzleChatQuotaRepository,
    },
  ],
  exports: [AskQuestionUseCase],
})
export class ChatModule {}
