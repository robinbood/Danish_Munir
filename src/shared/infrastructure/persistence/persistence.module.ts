import { Global, Module } from '@nestjs/common';
import {
  DOMAIN_EVENT_PUBLISHER,
  DomainEventPublisher,
} from '../../application/domain-event-publisher.port.ts';
import { Clock } from '../../domain/clock.ts';
import { IdGenerator } from '../../domain/id-generator.ts';
import { LoggingDomainEventPublisher } from '../events/logging-domain-event-publisher.ts';
import { SystemClock } from '../time/system-clock.ts';
import { UuidIdGenerator } from '../time/uuid-id-generator.ts';
import { DRIZZLE_DATABASE } from './database.ts';
import { DRIZZLE } from './tokens.ts';
import { DrizzleUnitOfWork, UnitOfWork } from './unit-of-work.ts';

/**
 * Generic infrastructure shared by both bounded contexts: the connection pool, the
 * transaction boundary, ambient time/identity, and in-process domain events. No
 * business rule lives here.
 */
@Global()
@Module({
  providers: [
    DRIZZLE_DATABASE,
    {
      provide: UnitOfWork,
      useFactory: (db) => new DrizzleUnitOfWork(db),
      inject: [DRIZZLE],
    },
    { provide: Clock, useClass: SystemClock },
    { provide: IdGenerator, useClass: UuidIdGenerator },
    { provide: DOMAIN_EVENT_PUBLISHER, useClass: LoggingDomainEventPublisher },
    { provide: DomainEventPublisher, useExisting: DOMAIN_EVENT_PUBLISHER },
  ],
  exports: [DRIZZLE, UnitOfWork, Clock, IdGenerator, DomainEventPublisher],
})
export class PersistenceModule {}
