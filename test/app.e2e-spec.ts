import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.ts';
import { DRIZZLE } from '../src/shared/infrastructure/persistence/tokens.ts';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

const databaseUrl = process.env.DATABASE_URL;
const enabled = Boolean(databaseUrl);

/**
 * These tests run the real application graph against the real database, so they
 * exercise routing, boundary validation, use cases, aggregates and the Drizzle
 * adapters together. Every row is keyed by a run-scoped user id and removed in
 * `afterAll`, so a run leaves no residue.
 */
describe.skipIf(!enabled)('Chat and Subscriptions API (e2e)', () => {
  let app: INestApplication;
  let database: PostgresJsDatabase;
  const createdUserIds: string[] = [];
  const previousFailureRate = process.env.PAYMENT_FAILURE_RATE;
  const previousLatency = process.env.AI_RESPONSE_LATENCY_MS;

  const userId = (label: string) => {
    const value = `e2e-${label}-${randomUUID()}`;
    createdUserIds.push(value);
    return value;
  };

  const post = (path: string, body?: unknown) =>
    request(app.getHttpServer()).post(path).send(body as object);

  const get = (path: string) => request(app.getHttpServer()).get(path);

  /**
   * Moves a subscription's paid window into the past so it becomes due for renewal.
   * `renewal_date` is constrained to equal `period_end`, so both are moved together.
   * Timestamps are bound as ISO strings because the raw driver cannot encode a
   * JavaScript `Date` for a `timestamptz` parameter.
   */
  const backdatePeriod = async (subscriptionId: string) => {
    const start = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
    await database.execute(
      sql`
        update subscriptions
        set period_start = ${start}, period_end = ${end}, renewal_date = ${end}
        where id = ${subscriptionId}
      `,
    );
  };

  const exhaustFreeQuota = async (id: string) => {
    for (let i = 0; i < 3; i++) {
      const response = await post('/chat/ask', { userId: id, question: `free ${i}` });
      expect(response.status).toBe(201);
    }
  };

  beforeAll(async () => {
    process.env.PAYMENT_FAILURE_RATE = '0';
    process.env.AI_RESPONSE_LATENCY_MS = '0';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    database = app.get<PostgresJsDatabase>(DRIZZLE);
  }, 60_000);

  afterAll(async () => {
    if (database && createdUserIds.length > 0) {
      for (const id of createdUserIds) {
        await database.execute(sql`
          delete from subscription_reservations
          where subscription_id in (select id from subscriptions where user_id = ${id})
        `);
        await database.execute(sql`delete from subscriptions where user_id = ${id}`);
        await database.execute(sql`delete from free_quota_usage where user_id = ${id}`);
        await database.execute(sql`delete from chat_messages where user_id = ${id}`);
      }
    }

    if (app) await app.close();

    if (previousFailureRate === undefined) delete process.env.PAYMENT_FAILURE_RATE;
    else process.env.PAYMENT_FAILURE_RATE = previousFailureRate;

    if (previousLatency === undefined) delete process.env.AI_RESPONSE_LATENCY_MS;
    else process.env.AI_RESPONSE_LATENCY_MS = previousLatency;
  }, 60_000);

  describe('Chat free monthly quota', () => {
    it('accepts three free questions and rejects the fourth without a bundle', async () => {
      const id = userId('free');

      for (let i = 0; i < 3; i++) {
        const response = await post('/chat/ask', { userId: id, question: `q${i}` });
        expect(response.status).toBe(201);
        expect(response.body.answer).toContain(`q${i}`);
        expect(response.body.message.quota.kind).toBe('free');
        expect(response.body.message.tokensUsed).toBeGreaterThan(0);
      }

      const rejected = await post('/chat/ask', { userId: id, question: 'q4' });
      expect(rejected.status).toBe(429);
    });

    it('persists the question, answer and token usage', async () => {
      const id = userId('history');
      await post('/chat/ask', { userId: id, question: 'stored question' });

      const rows = await database.execute(
        sql`select question, answer, tokens_used from chat_messages where user_id = ${id}`,
      );
      const stored = rows[0] as { question: string; answer: string; tokens_used: number };

      expect(stored.question).toBe('stored question');
      expect(stored.answer).toContain('stored question');
      expect(stored.tokens_used).toBeGreaterThan(0);
    });
  });

  describe('Paid bundle consumption', () => {
    it('falls back to an active bundle once the free allowance is spent', async () => {
      const id = userId('paid');
      await exhaustFreeQuota(id);

      const created = await post('/subscriptions', {
        userId: id,
        plan: 'basic',
        cycle: 'monthly',
      });
      expect(created.status).toBe(201);
      expect(created.body.maxMessages).toBe(10);

      const paid = await post('/chat/ask', { userId: id, question: 'paid question' });
      expect(paid.status).toBe(201);
      expect(paid.body.message.quota.kind).toBe('bundle');
      expect(paid.body.message.quota.subscriptionId).toBe(created.body.id);

      const reloaded = await get(`/subscriptions/${created.body.id}`);
      expect(reloaded.body.remainingMessages).toBe(9);
    });

    it('consumes from the bundle with the most remaining quota', async () => {
      const id = userId('multi');
      await exhaustFreeQuota(id);

      const basic = await post('/subscriptions', { userId: id, plan: 'basic', cycle: 'monthly' });
      const pro = await post('/subscriptions', { userId: id, plan: 'pro', cycle: 'monthly' });

      // Drain Pro below Basic, then confirm the next message switches to Basic.
      for (let i = 0; i < 91; i++) {
        const response = await post('/chat/ask', { userId: id, question: `drain ${i}` });
        expect(response.status).toBe(201);
      }

      const proState = await get(`/subscriptions/${pro.body.id}`);
      const basicState = await get(`/subscriptions/${basic.body.id}`);
      expect(proState.body.remainingMessages).toBeLessThan(
        basicState.body.remainingMessages,
      );

      const next = await post('/chat/ask', { userId: id, question: 'flip' });
      expect(next.status).toBe(201);
      expect(next.body.message.quota.subscriptionId).toBe(basic.body.id);

      const basicAfter = await get(`/subscriptions/${basic.body.id}`);
      expect(basicAfter.body.remainingMessages).toBe(
        basicState.body.remainingMessages - 1,
      );
    }, 120_000);

    it('serves an unlimited Enterprise bundle without decrementing', async () => {
      const id = userId('enterprise');
      await exhaustFreeQuota(id);

      const created = await post('/subscriptions', {
        userId: id,
        plan: 'enterprise',
        cycle: 'yearly',
      });
      expect(created.status).toBe(201);
      expect(created.body.unlimited).toBe(true);
      expect(created.body.remainingMessages).toBeNull();

      for (let i = 0; i < 12; i++) {
        const response = await post('/chat/ask', { userId: id, question: `e${i}` });
        expect(response.status).toBe(201);
      }

      const reloaded = await get(`/subscriptions/${created.body.id}`);
      expect(reloaded.body.remainingMessages).toBeNull();
      expect(reloaded.body.status).toBe('active');
    }, 60_000);

    it('rejects with 429 when every bundle is drained', async () => {
      const id = userId('drained');
      await exhaustFreeQuota(id);

      const created = await post('/subscriptions', { userId: id, plan: 'basic', cycle: 'monthly' });
      for (let i = 0; i < 10; i++) {
        const response = await post('/chat/ask', { userId: id, question: `use ${i}` });
        expect(response.status).toBe(201);
      }

      const drained = await get(`/subscriptions/${created.body.id}`);
      expect(drained.body.remainingMessages).toBe(0);

      const rejected = await post('/chat/ask', { userId: id, question: 'one more' });
      expect(rejected.status).toBe(429);
    }, 60_000);
  });

  describe('Subscription lifecycle', () => {
    it('creates monthly and yearly subscriptions with the expected window', async () => {
      const id = userId('create');

      const monthly = await post('/subscriptions', { userId: id, plan: 'pro', cycle: 'monthly' });
      expect(monthly.status).toBe(201);
      expect(monthly.body.maxMessages).toBe(100);
      expect(monthly.body.status).toBe('active');
      expect(monthly.body.autoRenew).toBe(true);
      expect(monthly.body.startDate).toBeTruthy();
      expect(monthly.body.endDate).toBeTruthy();
      expect(monthly.body.renewalDate).toBe(monthly.body.endDate);

      const yearly = await post('/subscriptions', { userId: id, plan: 'basic', cycle: 'yearly' });
      expect(yearly.status).toBe(201);
      const monthlySpan = new Date(monthly.body.endDate).getTime() - new Date(monthly.body.startDate).getTime();
      const yearlySpan = new Date(yearly.body.endDate).getTime() - new Date(yearly.body.startDate).getTime();
      expect(yearlySpan).toBeGreaterThan(monthlySpan);
    });

    it('lists subscriptions per user', async () => {
      const id = userId('list');
      await post('/subscriptions', { userId: id, plan: 'basic', cycle: 'monthly' });
      await post('/subscriptions', { userId: id, plan: 'pro', cycle: 'yearly' });

      const listed = await get(`/subscriptions?userId=${id}`);
      expect(listed.status).toBe(200);
      expect(listed.body).toHaveLength(2);
    });

    it('toggles auto-renew on an active subscription', async () => {
      const id = userId('toggle');
      const created = await post('/subscriptions', { userId: id, plan: 'basic', cycle: 'monthly' });

      const off = await post(`/subscriptions/${created.body.id}/auto-renew`, { autoRenew: false });
      expect(off.status).toBe(201);
      expect(off.body.autoRenew).toBe(false);

      const on = await post(`/subscriptions/${created.body.id}/auto-renew`, { autoRenew: true });
      expect(on.status).toBe(201);
      expect(on.body.autoRenew).toBe(true);
    });

    it('renews once, resets quota, and refuses to bill the same period twice', async () => {
      const id = userId('renew');
      const created = await post('/subscriptions', { userId: id, plan: 'basic', cycle: 'monthly' });
      await backdatePeriod(created.body.id);

      const renewed = await post(`/subscriptions/${created.body.id}/renew`);
      expect(renewed.status).toBe(201);
      expect(renewed.body.status).toBe('renewed');
      expect(renewed.body.receiptId).toBeTruthy();
      expect(new Date(renewed.body.subscription.endDate).getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(renewed.body.subscription.remainingMessages).toBe(10);

      // The window moved forward, so a repeat call is no longer due and must not
      // create a second billing period.
      const repeated = await post(`/subscriptions/${created.body.id}/renew`);
      expect(repeated.status).toBe(201);
      expect(repeated.body.status).toBe('skipped');

      const reloaded = await get(`/subscriptions/${created.body.id}`);
      expect(reloaded.body.endDate).toBe(renewed.body.subscription.endDate);
    });

    it('marks the subscription expired when the simulated payment fails', async () => {
      const id = userId('payfail');
      await exhaustFreeQuota(id);
      const created = await post('/subscriptions', { userId: id, plan: 'pro', cycle: 'monthly' });
      await backdatePeriod(created.body.id);

      process.env.PAYMENT_FAILURE_RATE = '1';
      try {
        const failed = await post(`/subscriptions/${created.body.id}/renew`);
        expect(failed.status).toBe(201);
        expect(failed.body.status).toBe('expired');
        expect(failed.body.subscription.status).toBe('expired');
        expect(failed.body.subscription.autoRenew).toBe(false);
      } finally {
        process.env.PAYMENT_FAILURE_RATE = '0';
      }

      const reloaded = await get(`/subscriptions/${created.body.id}`);
      expect(reloaded.body.status).toBe('expired');

      // An expired subscription no longer serves paid messages, so the user's
      // exhausted free allowance is not topped up by a dead bundle.
      const rejected = await post('/chat/ask', { userId: id, question: 'after expiry' });
      expect(rejected.status).toBe(429);
    });

    it('cancels without erasing the current cycle or the consumed usage', async () => {
      const id = userId('cancel');
      await exhaustFreeQuota(id);
      const created = await post('/subscriptions', { userId: id, plan: 'basic', cycle: 'monthly' });

      const used = await post('/chat/ask', { userId: id, question: 'before cancel' });
      expect(used.status).toBe(201);

      const cancelled = await post(`/subscriptions/${created.body.id}/cancel`);
      expect(cancelled.status).toBe(201);
      expect(cancelled.body.status).toBe('cancelled');
      expect(cancelled.body.autoRenew).toBe(false);
      expect(cancelled.body.cancelledAt).toBeTruthy();
      expect(cancelled.body.endDate).toBe(created.body.endDate);
      expect(cancelled.body.remainingMessages).toBe(9);

      const stillServing = await post('/chat/ask', { userId: id, question: 'after cancel' });
      expect(stillServing.status).toBe(201);

      // Renewal is prevented even once the cancelled window becomes due.
      await backdatePeriod(created.body.id);
      const cannotRenew = await post(`/subscriptions/${created.body.id}/renew`);
      expect(cannotRenew.status).toBe(201);
      expect(cannotRenew.body.status).toBe('skipped');

      const reloaded = await get(`/subscriptions/${created.body.id}`);
      expect(reloaded.body.status).toBe('cancelled');
      expect(reloaded.body.endDate).toBe(created.body.endDate);

      const messages = await database.execute(
        sql`select count(*)::int as count from chat_messages where user_id = ${id}`,
      );
      expect((messages[0] as { count: number }).count).toBe(5);
    });

    it('processes the due renewals batch', async () => {
      const response = await post('/subscriptions/renewals/process-due');
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('processed');
      expect(response.body).toHaveProperty('renewed');
    });
  });

  describe('Structured errors at the boundary', () => {
    it('rejects an empty question with 400', async () => {
      const response = await post('/chat/ask', { userId: userId('bad-q'), question: '   ' });
      expect(response.status).toBe(400);
    });

    it('rejects a missing userId with 400', async () => {
      const response = await post('/chat/ask', { userId: '', question: 'hi' });
      expect(response.status).toBe(400);
    });

    it('rejects an unknown plan with 400', async () => {
      const response = await post('/subscriptions', {
        userId: userId('bad-plan'),
        plan: 'gold',
        cycle: 'monthly',
      });
      expect(response.status).toBe(400);
    });

    it('rejects an unknown billing cycle with 400', async () => {
      const response = await post('/subscriptions', {
        userId: userId('bad-cycle'),
        plan: 'basic',
        cycle: 'weekly',
      });
      expect(response.status).toBe(400);
    });

    it('rejects a non-boolean autoRenew toggle with 400', async () => {
      const response = await post('/subscriptions/00000000-0000-0000-0000-000000000000/auto-renew', {
        autoRenew: 'yes',
      });
      expect(response.status).toBe(400);
    });

    it('returns 404 for an unknown subscription', async () => {
      const response = await get('/subscriptions/00000000-0000-0000-0000-000000000000');
      expect(response.status).toBe(404);
    });
  });
});
