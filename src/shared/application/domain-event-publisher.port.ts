import type { DomainEvent } from '../domain/domain-event.ts';

export const DOMAIN_EVENT_PUBLISHER = Symbol('DomainEventPublisher');

/** Outbound port for in-process domain events. */
export abstract class DomainEventPublisher {
  abstract publish(events: readonly DomainEvent[]): void;
}
