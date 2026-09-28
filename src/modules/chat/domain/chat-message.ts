import { InvalidChatQuestionError } from './chat.errors.ts';
import { MessageAnswered } from './chat.events.ts';
import { MessageQuota } from './message-quota.ts';

export type AnswerMessageParams = {
  id: string;
  userId: string;
  question: string;
  answer: string;
  tokensUsed: number;
  quota: MessageQuota;
  askedAt: Date;
};

export type ChatMessageSnapshot = AnswerMessageParams;

/**
 * Aggregate root for a single answered question. It owns the invariants of a stored
 * message, and because a message is only ever created once it exposes no mutators.
 */
export class ChatMessage {
  private readonly id: string;
  private readonly userId: string;
  private readonly question: string;
  private readonly answer: string;
  private readonly tokensUsed: number;
  private readonly quota: MessageQuota;
  private readonly askedAt: Date;
  private readonly domainEvents: MessageAnswered[] = [];

  private constructor(snapshot: ChatMessageSnapshot) {
    this.id = snapshot.id;
    this.userId = snapshot.userId;
    this.question = snapshot.question;
    this.answer = snapshot.answer;
    this.tokensUsed = snapshot.tokensUsed;
    this.quota = snapshot.quota;
    this.askedAt = snapshot.askedAt;
  }

  static answer(params: AnswerMessageParams): ChatMessage {
    if (!params.question.trim()) {
      throw new InvalidChatQuestionError('A question cannot be empty.');
    }

    if (!params.answer.trim()) {
      throw new InvalidChatQuestionError(
        'The AI provider returned an empty answer.',
      );
    }

    if (!Number.isInteger(params.tokensUsed) || params.tokensUsed < 1) {
      throw new RangeError(
        `A message must report at least one token, received ${params.tokensUsed}.`,
      );
    }

    const message = new ChatMessage(params);
    message.domainEvents.push(
      new MessageAnswered(
        message.id,
        message.userId,
        message.quota.kind,
        message.quota.limit,
        message.tokensUsed,
        message.askedAt,
      ),
    );

    return message;
  }

  static rehydrate(snapshot: ChatMessageSnapshot): ChatMessage {
    return new ChatMessage(snapshot);
  }

  getId(): string {
    return this.id;
  }

  getUserId(): string {
    return this.userId;
  }

  getQuestion(): string {
    return this.question;
  }

  getAnswer(): string {
    return this.answer;
  }

  getTokensUsed(): number {
    return this.tokensUsed;
  }

  getQuota(): MessageQuota {
    return this.quota;
  }

  getAskedAt(): Date {
    return this.askedAt;
  }

  pullDomainEvents(): MessageAnswered[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }
}
