import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { UnitOfWork } from '../../../shared/infrastructure/persistence/unit-of-work.ts';
import {
  InsufficientQuotaError,
  SubscriptionNotFoundError,
} from '../domain/subscription.errors.ts';
import type {
  AvailableBundle,
  BundleReservation,
  SubscriptionCapacity,
} from '../application/ports/subscription-capacity.port.ts';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../application/ports/subscription-repository.port.ts';
import {
  subscriptions,
  subscriptionReservations,
} from './subscription-db.schema.ts';

@Injectable()
export class DrizzleSubscriptionCapacity implements SubscriptionCapacity {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
  ) {}

  async listAvailableBundles(
    userId: string,
    at: Date,
  ): Promise<AvailableBundle[]> {
    const rows = await this.unitOfWork
      .current()
      .select({
        id: subscriptions.id,
        plan: subscriptions.plan,
        remainingMessages: subscriptions.quotaRemaining,
        periodEnd: subscriptions.periodEnd,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          or(
            eq(subscriptions.status, 'active'),
            eq(subscriptions.status, 'cancelled'),
          ),
          lte(subscriptions.periodStart, at),
          gt(subscriptions.periodEnd, at),
          or(
            isNull(subscriptions.quotaRemaining),
            gt(subscriptions.quotaRemaining, 0),
          ),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      plan: row.plan as 'basic' | 'pro' | 'enterprise',
      remainingMessages: row.remainingMessages,
      endsAt: row.periodEnd,
    }));
  }

  async tryReserveOneMessage(
    userId: string,
    subscriptionId: string,
    at: Date,
    reservationId: string,
  ): Promise<BundleReservation | null> {
    return this.unitOfWork.runInTransaction(async () => {
      const database = this.unitOfWork.current();
      const eligible = await database
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, userId),
            eq(subscriptions.id, subscriptionId),
            or(
              eq(subscriptions.status, 'active'),
              eq(subscriptions.status, 'cancelled'),
            ),
            lte(subscriptions.periodStart, at),
            gt(subscriptions.periodEnd, at),
            or(
              isNull(subscriptions.quotaRemaining),
              gt(subscriptions.quotaRemaining, 0),
            ),
          ),
        )
        .orderBy(
          sql`${subscriptions.quotaRemaining} desc nulls first`,
          desc(subscriptions.periodEnd),
          desc(subscriptions.createdAt),
        )
        .limit(1)
        .for('update');

      const selected = eligible[0];
      if (!selected) return null;

      const subscription = await this.subscriptions.findById(selected.id);
      if (!subscription) throw new SubscriptionNotFoundError();

      try {
        subscription.consumeMessage(at);
      } catch (error) {
        if (error instanceof InsufficientQuotaError) return null;
        throw error;
      }
      const updated = await database
        .update(subscriptions)
        .set({
          quotaRemaining: sql`CASE WHEN ${subscriptions.quotaRemaining} IS NULL THEN NULL ELSE ${subscriptions.quotaRemaining} - 1 END`,
          revision: sql`${subscriptions.revision} + 1`,
        })
        .where(
          and(
            eq(subscriptions.id, selected.id),
            eq(subscriptions.userId, userId),
            or(
              eq(subscriptions.status, 'active'),
              eq(subscriptions.status, 'cancelled'),
            ),
            lte(subscriptions.periodStart, at),
            gt(subscriptions.periodEnd, at),
            or(
              isNull(subscriptions.quotaRemaining),
              gt(subscriptions.quotaRemaining, 0),
            ),
          ),
        )
        .returning({ remainingMessages: subscriptions.quotaRemaining });

      if (updated.length !== 1) return null;

      const inserted = await database
        .insert(subscriptionReservations)
        .values({
          id: reservationId,
          subscriptionId: selected.id,
          status: 'pending',
        })
        .returning({ id: subscriptionReservations.id });

      if (inserted.length !== 1) throw new InsufficientQuotaError();

      return {
        id: selected.id,
        reservationId,
        subscriptionId: selected.id,
        plan: subscription.getPlan().name,
        quotaLimit: subscription.getQuota().limit,
        remainingMessages: subscription.getQuota().remaining,
      };
    });
  }

  async confirm(reservationId: string): Promise<void> {
    await this.unitOfWork
      .current()
      .update(subscriptionReservations)
      .set({ status: 'confirmed' })
      .where(
        and(
          eq(subscriptionReservations.id, reservationId),
          eq(subscriptionReservations.status, 'pending'),
        ),
      );
  }

  async release(reservationId: string): Promise<void> {
    await this.unitOfWork.runInTransaction(async () => {
      const database = this.unitOfWork.current();
      const rows = await database
        .select()
        .from(subscriptionReservations)
        .where(
          and(
            eq(subscriptionReservations.id, reservationId),
            eq(subscriptionReservations.status, 'pending'),
          ),
        )
        .limit(1)
        .for('update');
      const reservation = rows[0];
      if (!reservation) return;

      const subscription = await this.subscriptions.findById(
        reservation.subscriptionId,
      );
      if (!subscription) throw new SubscriptionNotFoundError();
      subscription.refundMessage();
      await database
        .update(subscriptions)
        .set({
          quotaRemaining: sql`
              CASE
                WHEN ${subscriptions.quotaLimit} IS NULL THEN NULL
                ELSE LEAST(${subscriptions.quotaLimit}, ${subscriptions.quotaRemaining} + 1)
              END
            `,
          revision: sql`${subscriptions.revision} + 1`,
        })
        .where(eq(subscriptions.id, reservation.subscriptionId));

      await database
        .update(subscriptionReservations)
        .set({ status: 'released' })
        .where(
          and(
            eq(subscriptionReservations.id, reservationId),
            eq(subscriptionReservations.status, 'pending'),
          ),
        );
    });
  }
}
