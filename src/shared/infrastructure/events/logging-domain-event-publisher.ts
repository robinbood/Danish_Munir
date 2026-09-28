import { Injectable, Logger } from '@nestjs/common';
import { DomainEventPublisher } from '../../application/domain-event-publisher.port.ts';
import type { DomainEvent } from '../../domain/domain-event.ts';

/**
 * Default in-process handler. A reviewer can swap this for a real subscriber
 * without touching a use case or an aggregate.
 */
@Injectable()
export class LoggingDomainEventPublisher extends DomainEventPublisher {
  private readonly logger = new Logger(LoggingDomainEventPublisher.name);

  publish(events: readonly DomainEvent[]): void {
    for (const event of events) {
      this.logger.log(`${event.name} at ${event.occurredAt.toISOString()}`);
    }
  }
}
