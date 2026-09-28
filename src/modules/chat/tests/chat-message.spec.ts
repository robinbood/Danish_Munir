import { describe, expect, it } from 'vitest';
import { ChatMessage } from '../domain/chat-message.ts';
import { MessageQuota } from '../domain/message-quota.ts';
import { MonthlyPeriod } from '../domain/monthly-period.ts';

describe('ChatMessage', () => {
  it('stores the prompt, answer, and token usage', () => {
    const message = ChatMessage.answer({
      id: 'msg-1',
      userId: 'user-1',
      question: 'What is DDD?',
      answer: 'Domain-driven design is about modeling business complexity.',
      tokensUsed: 42,
      quota: MessageQuota.free(MonthlyPeriod.of('2026-09')),
      askedAt: new Date('2026-09-28T12:00:00.000Z'),
    });

    expect(message.getQuestion()).toBe('What is DDD?');
    expect(message.getAnswer()).toBe(
      'Domain-driven design is about modeling business complexity.',
    );
    expect(message.getTokensUsed()).toBe(42);
    expect(message.getQuota().kind).toBe('free');
  });
});
