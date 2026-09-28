import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    plan: varchar('plan', { length: 32 }).notNull(),
    cycle: varchar('cycle', { length: 16 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    quotaLimit: integer('quota_limit'),
    quotaRemaining: integer('quota_remaining'),
    priceAmountMinor: integer('price_amount_minor').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    renewalDate: timestamp('renewal_date', { withTimezone: true }).notNull(),
    autoRenew: boolean('auto_renew').notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    revision: integer('revision').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'subscriptions_plan_valid',
      sql`${table.plan} in ('basic', 'pro', 'enterprise')`,
    ),
    check(
      'subscriptions_cycle_valid',
      sql`${table.cycle} in ('monthly', 'yearly')`,
    ),
    check(
      'subscriptions_status_valid',
      sql`${table.status} in ('active', 'cancelled', 'expired')`,
    ),
    check(
      'subscriptions_period_valid',
      sql`${table.periodEnd} > ${table.periodStart}`,
    ),
    check(
      'subscriptions_renewal_matches_period_end',
      sql`${table.renewalDate} = ${table.periodEnd}`,
    ),
    check(
      'subscriptions_price_nonnegative',
      sql`${table.priceAmountMinor} >= 0`,
    ),
    check(
      'subscriptions_quota_valid',
      sql`(
    (${table.plan} = 'enterprise' and ${table.quotaLimit} is null and ${table.quotaRemaining} is null)
    or (${table.plan} = 'basic' and ${table.quotaLimit} = 10 and ${table.quotaRemaining} between 0 and 10)
    or (${table.plan} = 'pro' and ${table.quotaLimit} = 100 and ${table.quotaRemaining} between 0 and 100)
  )`,
    ),
    check(
      'subscriptions_terminal_no_renewal',
      sql`${table.status} = 'active' or ${table.autoRenew} = false`,
    ),
    check(
      'subscriptions_cancelled_at_valid',
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} is not null)`,
    ),
    index('subscriptions_user_status_period_idx').on(
      table.userId,
      table.status,
      table.periodEnd,
    ),
    index('subscriptions_due_renewals_idx')
      .on(table.periodEnd)
      .where(sql`${table.status} = 'active' and ${table.autoRenew} = true`),
  ],
);

export const subscriptionReservations = pgTable(
  'subscription_reservations',
  {
    id: uuid('id').primaryKey(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'subscription_reservations_status_valid',
      sql`${table.status} in ('pending', 'confirmed', 'released')`,
    ),
    index('subscription_reservations_subscription_status_idx').on(
      table.subscriptionId,
      table.status,
    ),
  ],
);

export const legacySubscriptionBundles = pgTable('subscription_bundles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  plan: varchar('plan', { length: 32 }).notNull(),
  remainingMessages: integer('remaining_messages'),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  endDate: timestamp('end_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
