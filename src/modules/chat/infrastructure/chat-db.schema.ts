import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    tokensUsed: integer('tokens_used').notNull().default(0),
    quotaKind: varchar('quota_kind', { length: 32 }).notNull(),
    quotaLimit: integer('quota_limit'),
    quotaSubscriptionId: uuid('quota_subscription_id'),
    quotaPeriod: varchar('quota_period', { length: 16 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('chat_messages_tokens_nonnegative', sql`${table.tokensUsed} >= 0`),
    check(
      'chat_messages_quota_kind_valid',
      sql`${table.quotaKind} in ('free', 'bundle')`,
    ),
    check(
      'chat_messages_quota_limit_nonnegative',
      sql`${table.quotaLimit} is null or ${table.quotaLimit} >= 0`,
    ),
    check(
      'chat_messages_free_quota_valid',
      sql`${table.quotaKind} <> 'free' or (${table.quotaLimit} = 3 and ${table.quotaSubscriptionId} is null)`,
    ),
    check(
      'chat_messages_paid_bundle_attributed',
      sql`${table.quotaKind} <> 'bundle' or ${table.quotaSubscriptionId} is not null`,
    ),
    index('chat_messages_user_created_idx').on(table.userId, table.createdAt),
  ],
);

export const freeQuotaUsage = pgTable(
  'free_quota_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    monthKey: varchar('month_key', { length: 16 }).notNull(),
    usedCount: integer('used_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('free_quota_usage_user_month_unique').on(
      table.userId,
      table.monthKey,
    ),
    check('free_quota_usage_nonnegative', sql`${table.usedCount} >= 0`),
    check(
      'free_quota_usage_month_format',
      sql`${table.monthKey} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
);
