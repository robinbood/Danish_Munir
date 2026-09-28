import { Injectable } from '@nestjs/common';
import { ChatMessage } from '../domain/chat-message.ts';
import { ChatMessageRepositoryPort } from '../application/ports/chat-message-repository.port.ts';

@Injectable()
export class InMemoryChatMessageRepository extends ChatMessageRepositoryPort {
  private readonly messages = new Map<string, ChatMessage[]>();

  async save(message: ChatMessage): Promise<void> {
    const userId = message.getUserId();
    const existing = this.messages.get(userId) ?? [];
    existing.push(message);
    this.messages.set(userId, existing);
  }

  async findByUser(userId: string): Promise<ChatMessage[]> {
    return this.messages.get(userId) ?? [];
  }
}
