import { Module } from '@nestjs/common';
import { ChatModule } from './modules/chat/chat.module.ts';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module.ts';
import { PersistenceModule } from './shared/infrastructure/persistence/persistence.module.ts';

@Module({
  imports: [PersistenceModule, SubscriptionsModule, ChatModule],
})
export class AppModule {}
