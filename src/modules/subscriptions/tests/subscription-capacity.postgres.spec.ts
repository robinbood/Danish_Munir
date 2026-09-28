import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleUnitOfWork } from '../../../shared/infrastructure/persistence/unit-of-work.ts';
import { BillingCycle } from '../domain/billing-cycle.ts';
import { Subscription } from '../domain/subscription.ts';
import { SubscriptionPlan } from '../domain/subscription-plan.ts';
import { DrizzleSubscriptionCapacity } from '../infrastructure/drizzle-subscription-capacity.ts';
import { DrizzleSubscriptionRepository } from '../infrastructure/drizzle-subscription.repository.ts';
import {
  subscriptions,
  subscriptionReservations,
} from '../infrastructure/subscription-db.schema.ts';

const databaseUrl = process.env.DATABASE_URL;
const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === '1' && Boolean(databaseUrl);

describe.skipIf(!enabled)(
  'Subscription capacity PostgreSQL concurrency',
  () => {
    const client = databaseUrl
      ? postgres(databaseUrl, { max: 5, ssl: 'require' })
      : null;
    const database = client ? drizzle(client) : null;
    const unitOfWork = database ? new DrizzleUnitOfWork(database) : null;
    const repository = unitOfWork
      ? new DrizzleSubscriptionRepository(unitOfWork)
      : null;
    const capacity =
      unitOfWork && repository
        ? new DrizzleSubscriptionCapacity(unitOfWork, repository)
        : null;

    afterAll(async () => {
      if (client) await client.end();
    }, 30_000);

    it('never consumes more messages than the aggregate quota under concurrent reservations', async () => {
      if (!database || !repository || !capacity || !client)
        throw new Error('Integration setup was not initialized.');

      const userId = `capacity-test-${randomUUID()}`;
      const subscriptionId = randomUUID();
      const startsAt = new Date(Date.now() - 60_000);
      const subscription = Subscription.create({
        id: subscriptionId,
        userId,
        plan: SubscriptionPlan.basic(),
        cycle: BillingCycle.monthly(),
        startsAt,
        autoRenew: false,
      });

      try {
        await repository.save(subscription);
        const [initial] = await database
          .select({
            limit: subscriptions.quotaLimit,
            remaining: subscriptions.quotaRemaining,
          })
          .from(subscriptions)
          .where(eq(subscriptions.id, subscriptionId));
        const attempts = await Promise.all(
          Array.from({ length: 11 }, () =>
            capacity.tryReserveOneMessage(
              userId,
              subscriptionId,
              new Date(),
              randomUUID(),
            ),
          ),
        );

        const reservations = attempts.filter((result) => result != null);
        const reloaded = await repository.findById(subscriptionId);
        const persistedReservations = await database
          .select({ id: subscriptionReservations.id })
          .from(subscriptionReservations)
          .where(eq(subscriptionReservations.subscriptionId, subscriptionId));

        expect(initial?.limit).toBe(10);
        expect(reservations.length).toBeLessThanOrEqual(10);
        expect(reservations).toHaveLength(10);
        expect(persistedReservations).toHaveLength(10);
        expect(reloaded?.getQuota().remaining).toBe(0);
      } finally {
        await client.begin(async (transaction) => {
          await transaction.unsafe(
            'delete from public.subscription_reservations where subscription_id = $1',
            [subscriptionId],
          );
          await transaction.unsafe(
            'delete from public.subscriptions where id = $1 and user_id = $2',
            [subscriptionId, userId],
          );
        });
      }
    }, 60_000);
  },
);
