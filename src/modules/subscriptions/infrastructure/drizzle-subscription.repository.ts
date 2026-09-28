import { Injectable } from '@nestjs/common';
import { and, asc, eq, lte } from 'drizzle-orm';
import { UnitOfWork } from '../../../shared/infrastructure/persistence/unit-of-work.ts';
import { BillingCycle } from '../domain/billing-cycle.ts';
import { BillingPeriod } from '../domain/billing-period.ts';
import { MessageQuota } from '../domain/message-quota.ts';
import { Money } from '../domain/money.ts';
import { ConcurrentSubscriptionModificationError } from '../domain/subscription.errors.ts';
import { Subscription } from '../domain/subscription.ts';
import { SubscriptionPlan } from '../domain/subscription-plan.ts';
import { SubscriptionStatus } from '../domain/subscription-status.ts';
import type { SubscriptionRepository } from '../application/ports/subscription-repository.port.ts';
import { subscriptions } from './subscription-db.schema.ts';

@Injectable()
export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async save(subscription: Subscription): Promise<void> {
    await this.unitOfWork.runInTransaction(async () => {
      const database = this.unitOfWork.current();
      const record = this.toRecord(subscription);

      if (subscription.getRevision() === 0) {
        await database.insert(subscriptions).values(record);
        return;
      }

      if (subscription.getRevision() === subscription.getExpectedRevision())
        return;

      const updated = await database
        .update(subscriptions)
        .set(record)
        .where(
          and(
            eq(subscriptions.id, subscription.getId()),
            eq(subscriptions.revision, subscription.getExpectedRevision()),
          ),
        )
        .returning({ id: subscriptions.id });

      if (updated.length === 0) {
        throw new ConcurrentSubscriptionModificationError();
      }
    });
  }

  async findById(id: string): Promise<Subscription | null> {
    const rows = await this.unitOfWork
      .current()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id));

    return rows[0] ? this.toAggregate(rows[0]) : null;
  }

  async findByUser(userId: string): Promise<Subscription[]> {
    const rows = await this.unitOfWork
      .current()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(asc(subscriptions.createdAt));

    return rows.map((row) => this.toAggregate(row));
  }

  async findDueForRenewal(now: Date, limit: number): Promise<Subscription[]> {
    const rows = await this.unitOfWork
      .current()
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, 'active'),
          eq(subscriptions.autoRenew, true),
          lte(subscriptions.periodEnd, now),
        ),
      )
      .orderBy(asc(subscriptions.periodEnd))
      .limit(limit);

    return rows.map((row) => this.toAggregate(row));
  }

  private toRecord(subscription: Subscription) {
    const snapshot = subscription.getSnapshot();

    return {
      id: snapshot.id,
      userId: snapshot.userId,
      plan: snapshot.plan.name,
      cycle: snapshot.cycle.kind,
      status: snapshot.status.kind,
      quotaLimit: snapshot.quota.limit,
      quotaRemaining: snapshot.quota.remaining,
      priceAmountMinor: snapshot.price.amountMinor,
      currency: snapshot.price.currency,
      periodStart: snapshot.period.start,
      periodEnd: snapshot.period.end,
      renewalDate: snapshot.period.end,
      autoRenew: snapshot.autoRenew,
      cancelledAt: snapshot.cancelledAt,
      revision: snapshot.revision,
      createdAt: snapshot.createdAt,
    };
  }

  private toAggregate(row: typeof subscriptions.$inferSelect): Subscription {
    const quota = MessageQuota.of(row.quotaLimit, row.quotaRemaining);

    return Subscription.rehydrate({
      id: row.id,
      userId: row.userId,
      plan: SubscriptionPlan.from(row.plan as 'basic' | 'pro' | 'enterprise'),
      cycle: BillingCycle.from(row.cycle as 'monthly' | 'yearly'),
      status: SubscriptionStatus.from(
        row.status as 'active' | 'cancelled' | 'expired',
      ),
      quota,
      period: new BillingPeriod(row.periodStart, row.periodEnd),
      price: Money.of(row.priceAmountMinor, row.currency as 'USD'),
      autoRenew: row.autoRenew,
      cancelledAt: row.cancelledAt,
      revision: row.revision,
      createdAt: row.createdAt,
    });
  }
}
