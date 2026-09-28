import { AsyncLocalStorage } from 'node:async_hooks';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Every postgres query in the application goes through a handle obtained from this
 * unit of work rather than through a module-level singleton. That gives two things:
 * repositories can join a transaction opened further up the call stack, and the
 * aggregate consistency boundary can be aligned with a database transaction.
 */
export abstract class UnitOfWork {
  /**
   * Runs `work` inside a single database transaction. Nested calls join the
   * enclosing transaction instead of opening a second one.
   */
  abstract runInTransaction<T>(
    work: (db: PostgresJsDatabase) => Promise<T>,
  ): Promise<T>;

  /** The handle bound to the current call: the active transaction, or the base pool. */
  abstract current(): PostgresJsDatabase;
}

export class DrizzleUnitOfWork extends UnitOfWork {
  private readonly transactions = new AsyncLocalStorage<PostgresJsDatabase>();

  constructor(private readonly database: PostgresJsDatabase) {
    super();
  }

  async runInTransaction<T>(
    work: (db: PostgresJsDatabase) => Promise<T>,
  ): Promise<T> {
    const active = this.transactions.getStore();

    if (active) {
      return work(active);
    }

    return this.database.transaction((tx) =>
      this.transactions.run(tx as PostgresJsDatabase, () =>
        work(tx as PostgresJsDatabase),
      ),
    );
  }

  current(): PostgresJsDatabase {
    return this.transactions.getStore() ?? this.database;
  }
}
