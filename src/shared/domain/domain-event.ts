/**
 * Marker for anything an aggregate emits when it changes state. Events are plain
 * in-process values: they carry no transport and imply no message broker.
 */
export abstract class DomainEvent {
  abstract readonly name: string;
  abstract readonly occurredAt: Date;
}
