import { DomainEvent } from '../../../shared/domain/domain-event.ts';

export class MessageAnswered extends DomainEvent {
  readonly name = 'MessageAnswered';

  constructor(
    readonly messageId: string,
    readonly userId: string,
    readonly quotaKind: string,
    readonly quotaLimit: number | null,
    readonly tokensUsed: number,
    readonly occurredAt: Date,
  ) {
    super();
  }
}
