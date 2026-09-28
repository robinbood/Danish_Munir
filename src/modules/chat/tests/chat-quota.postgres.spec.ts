import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { DrizzleUnitOfWork } from '../../../shared/infrastructure/persistence/unit-of-work.ts';
import { DrizzleChatQuotaRepository } from '../infrastructure/drizzle-chat-quota.repository.ts';
import { freeQuotaUsage } from '../infrastructure/chat-db.schema.ts';

const databaseUrl = process.env.DATABASE_URL;
const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === '1' && Boolean(databaseUrl);

describe.skipIf(!enabled)('Chat free quota PostgreSQL concurrency', () => {
  const client = databaseUrl
    ? postgres(databaseUrl, { max: 5, ssl: 'require' })
    : null;
  const database = client ? drizzle(client) : null;
  const unitOfWork = database ? new DrizzleUnitOfWork(database) : null;
  const quotaRepository = unitOfWork
    ? new DrizzleChatQuotaRepository(unitOfWork)
    : null;

  afterAll(async () => {
    if (client) await client.end();
  }, 30_000);

  it('never grants more than three free reservations for one user-month', async () => {
    if (!database || !quotaRepository)
      throw new Error('Integration setup was not initialized.');

    const userId = `free-quota-test-${randomUUID()}`;
    const monthKey = '2026-09';

    try {
      const reservations = await Promise.all(
        Array.from({ length: 10 }, () =>
          quotaRepository.tryReserveFreeMessage(userId, monthKey),
        ),
      );

      expect(reservations.filter(Boolean)).toHaveLength(3);
    } finally {
      await database
        .delete(freeQuotaUsage)
        .where(eq(freeQuotaUsage.userId, userId));
    }
  }, 30_000);
});
