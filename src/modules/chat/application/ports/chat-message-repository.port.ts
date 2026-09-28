import type { ChatMessage } from '../../domain/chat-message.ts';

export abstract class ChatMessageRepositoryPort {
  abstract save(message: ChatMessage): Promise<void>;
  abstract findByUser(userId: string): Promise<ChatMessage[]>;
}
