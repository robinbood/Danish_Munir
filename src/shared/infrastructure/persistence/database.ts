import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL, DRIZZLE } from './tokens.ts';

/**
 * Owns the single postgres-js pool for the process. The connection string is read
 * here, at provider construction time, so that importing a module never requires
 * infrastructure to be configured. That keeps the domain and application layers
 * importable (and testable) without a reachable database.
 */
export function createDatabase(): PostgresJsDatabase {
  const databaseUrl = process.env[DATABASE_URL];

  if (!databaseUrl) {
    throw new Error(`${DATABASE_URL} environment variable is required.`);
  }

  const client = postgres(databaseUrl, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    connect_timeout: 10,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
  });

  return drizzle(client);
}

export const DRIZZLE_DATABASE = {
  provide: DRIZZLE,
  useFactory: createDatabase,
};
