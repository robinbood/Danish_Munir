# GGI Backend — AI Chat with Paid Message Subscriptions

A production-minded modular monolith. Users ask questions; a mocked AI provider
answers them. Every user gets three free answers per calendar month, and paid
bundles take over from there. Built with TypeScript, NestJS, PostgreSQL on
Supabase, Drizzle ORM, and explicit DDD inside two bounded contexts.

The interesting part is not the CRUD. It is that the quota rules hold when two
requests arrive at the same instant, and that the domain does not know what a
database is.

---

## Table of contents

- [Quick start](#quick-start)
- [The API](#the-api)
- [Architecture](#architecture)
- [Design decisions](#design-decisions)
- [Quotas, locks, and the deliberate absence of a message queue](#quotas-locks-and-the-deliberate-absence-of-a-message-queue)
- [Testing](#testing)
- [Trade-offs and known limits](#trade-offs-and-known-limits)

---

## Quick start

### 1. Install

```sh
npm install        # or: bun install
```

### 2. Configure

Create `.env` in the project root:

```dotenv
# Supabase PostgreSQL. Use the pooler connection string for remote projects.
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres

PORT=3000

# Probability the simulated payment gateway declines a renewal charge, 0–1.
# Set to 0 for deterministic local development, 1 to force every renewal to fail.
PAYMENT_FAILURE_RATE=0.1

# Artificial latency injected by the mocked AI provider.
AI_RESPONSE_LATENCY_MS=100

# Optional. Pool size for the postgres.js client (default 10).
DATABASE_POOL_MAX=10

# Optional. How often the renewal scheduler scans for due subscriptions (default 60000, minimum 1000).
RENEWAL_SCAN_INTERVAL_MS=60000
```

`DATABASE_URL` is the only required variable. The application connects through
the `postgres` driver and Drizzle; it never uses the Supabase client SDK.
Supabase is the hosting provider here, not the data-access layer.

### 3. Migrate

```sh
npx drizzle-kit migrate
```

Four migrations ship in `drizzle/`. The first is written with
`CREATE TABLE IF NOT EXISTS` so it can attach its journal to a database that
already carries the original Chat tables. The second creates the
Subscription-owned tables and backfills legacy `subscription_bundles` rows into
the Subscription aggregate table, merging duplicate free-usage periods without
losing their summed usage and preserving the existing primary key. The last two
tighten constraints and indexes.

Review the SQL against your target database before applying it, and point
integration tests at a non-production database.

### 4. Run

```sh
npm run start:dev     # watch mode
npm run build         # compile to dist/
npm run start:prod    # node dist/main
```

### Commands

| Command                     | What it does                                    |
| --------------------------- | ----------------------------------------------- |
| `npm run start:dev`         | Nest in watch mode                              |
| `npm run build`             | Compile with `tsconfig.build.json`              |
| `npm run test`              | Unit and adapter tests (Vitest)                 |
| `npm run test:e2e`          | Database-backed HTTP tests (Vitest)             |
| `npm run test:postgres`     | Opt-in concurrency tests, serialised            |
| `npm run lint`              | ESLint, flat config                             |
| `npm run lint:fast`         | oxlint                                          |
| `npm run format`            | Prettier, single quotes, trailing commas        |

`bun` works as a drop-in for `npm run` / `bunx` if you prefer it.

---

## The API

### Chat

| Method | Path          | Body                     |
| ------ | ------------- | ------------------------ |
| `POST` | `/chat/ask`   | `{ userId, question }`   |

Reserves quota, calls the mocked provider, stores the question, answer, and
token count, and returns the message plus its quota attribution:

```jsonc
{
  "answer": "Mocked AI answer for: why is my invoice higher?",
  "message": {
    "id": "…",
    "userId": "u-1",
    "question": "why is my invoice higher?",
    "answer": "Mocked AI answer for: why is my invoice higher?",
    "tokensUsed": 21,
    "quota": { "kind": "bundle", "limit": 10, "subscriptionId": "…" },
    "askedAt": "2026-09-28T21:37:57.412Z"
  }
}
```

`429` when the free allowance is spent and no paid bundle can pay.

### Subscriptions

| Method | Path                                   | Purpose                                  |
| ------ | -------------------------------------- | ---------------------------------------- |
| `POST` | `/subscriptions`                       | Create a bundle                          |
| `GET`  | `/subscriptions?userId=…`              | List a user's bundles                    |
| `GET`  | `/subscriptions/:id`                   | Read one                                |
| `POST` | `/subscriptions/:id/auto-renew`        | Toggle auto-renewal                      |
| `POST` | `/subscriptions/:id/renew`             | Attempt a renewal now                    |
| `POST` | `/subscriptions/:id/cancel`            | Cancel                                   |
| `POST` | `/subscriptions/renewals/process-due`  | Run one renewal batch (operator/cron)    |

Create body — `plan` is `basic` | `pro` | `enterprise`, `cycle` is `monthly` |
`yearly`, `autoRenew` defaults to `true`:

```jsonc
{
  "id": "…",
  "userId": "u-1",
  "plan": "pro",
  "cycle": "yearly",
  "status": "active",
  "maxMessages": 100,
  "remainingMessages": 100,
  "unlimited": false,
  "priceAmountMinor": 29000,      // cents
  "currency": "USD",
  "startDate": "2026-09-28T21:37:57.412Z",
  "endDate":   "2027-09-28T21:37:57.412Z",
  "renewalDate": "2027-09-28T21:37:57.412Z",  // always == endDate
  "autoRenew": true,
  "cancelledAt": null
}
```

| Plan       | Messages | Monthly  | Yearly¹  |
| ---------- | -------- | -------- | -------- |
| Basic      | 10       | $9.00    | $90.00   |
| Pro        | 100      | $29.00   | $290.00  |
| Enterprise | ∞        | $99.00   | $990.00  |

¹ Yearly bills ten months of usage for a twelve-month period — a two-month
discount. `renewalDate` is constrained in the database to equal `endDate`, and
the aggregate treats renewal as "the end of the window I already paid for".

### Errors

Structured domain errors cross the presentation boundary as JSON, never as raw
database failures:

| Error                              | Status | Meaning                                    |
| ---------------------------------- | ------ | ------------------------------------------ |
| `FreeQuotaExceeded`                | 429    | No free allowance, no active bundle        |
| `InsufficientQuota`                | 429    | A bundle exists but is drained             |
| `SubscriptionNotFound`             | 404    | Unknown id                                 |
| `InvalidSubscriptionPlan` / Cycle  | 400    | Unsupported plan or cycle                  |
| `InvalidSubscriptionTransition`    | 422    | Illegal lifecycle transition               |
| `InvalidBillingPeriod`             | 422    | Renewal period does not continue the last  |
| `PaymentFailed`                    | 402    | Charge rejected                            |
| `ConcurrentSubscriptionModification` | 409  | Optimistic lock lost the race              |

---

## Architecture

```
src/
  modules/
    chat/                          ← bounded context: questions, answers, free quota
      domain/                      no Nest, no Drizzle, no HTTP
      application/                 use cases and ports
      infrastructure/              Drizzle adapters, mocked AI
      presentation/                controller, Zod pipe, error filter

    subscriptions/                 ← bounded context: plans, billing, lifecycle
      domain/
      application/
      infrastructure/
      presentation/

  shared/                          genuinely generic only
    domain/                        Clock, IdGenerator, DomainEvent
    application/                   DomainEventPublisher port
    infrastructure/persistence/    pool, UnitOfWork
```

Dependencies point inward:

```
HTTP Controller → Application Use Case → Domain Aggregate ← Repository Port
                                                              ↑
                                                   Infrastructure Adapter
```

### The one rule that keeps the contexts honest

**Chat may not touch Subscription internals.** Not the tables, not the Drizzle
repository, not the aggregate's fields. It sees exactly one exported contract,
`SubscriptionCapacity`:

```ts
listAvailableBundles(userId, at): Promise<AvailableBundle[]>
tryReserveOneMessage(userId, subscriptionId, at, reservationId): Promise<BundleReservation | null>
confirm(reservationId): Promise<void>
release(reservationId): Promise<void>
```

Chat decides *which* bundle should pay. Subscriptions decides *whether that
decrement is legal* and performs it atomically. The dependency is one-way, and
the Subscriptions module has no idea Chat exists.

The reverse is equally clean: `SubscriptionsModule` never imports `ChatModule`.
Renewing a bundle has nothing to do with asking a question, and making it so
would have been a lie about the model.

### Where the rules actually live

Business rules are in the domain, not smeared across the layers:

- `Subscription` is an **aggregate root**. `cancel()`, `renew()`, `expire()`,
  `consumeMessage()`, `setAutoRenew()` are the only ways its state changes. You
  cannot set `status = 'cancelled'` from outside — the transition is refused if
  the current state does not allow it.
- `RenewalPolicy` is a **domain service**, because "renew on success, expire on
  failure" spans three inputs no single entity owns: the aggregate's state, the
  calendar, and the outcome of an external charge.
- `ChatQuotaPolicy` is a **domain service** in the Chat context, owning
  free-before-paid priority and deterministic bundle selection.
- `SubscriptionPlan`, `BillingCycle`, `BillingPeriod`, `Money`, `MessageQuota`,
  `SubscriptionStatus` are **value objects** — immutable, validated at
  construction, compared by value. Enterprise is `maxMessages: null`, never
  `Number.MAX_SAFE_INTEGER`.
- `SubscriptionCreated`, `SubscriptionRenewed`, `SubscriptionCancelled`,
  `SubscriptionExpired`, `SubscriptionPaymentFailed` are **domain events**,
  published in-process through a port. No broker required.
- `SubscriptionRepository`, `PaymentGateway`, `SubscriptionCapacity` are
  **ports**; `DrizzleSubscriptionRepository`, `SimulatedPaymentGateway`,
  `DrizzleSubscriptionCapacity` are the **adapters** that implement them.

Controllers are thin by construction: parse with Zod, call one use case, return
a view object. There is no quota arithmetic, no date maths, and no query
building in `presentation/`.

### What the database enforces

Constraints reinforce invariants; they never *are* the invariants. But they are
free defence in depth:

- supported plans, cycles, and statuses
- plan-specific quota bounds (Basic 0–10, Pro 0–100, Enterprise `NULL`/`NULL`)
- `renewal_date = period_end`
- terminal states may not keep `auto_renew = true`
- `status = 'cancelled'` if and only if `cancelled_at is not null`
- `used_count >= 0` and a well-formed `YYYY-MM` month key
- a unique index on `(user_id, month_key)`
- partial index on due renewals: `WHERE status = 'active' AND auto_renew = true`

---

## Design decisions

### Free quota is a period, not a job

Every user gets three free messages per calendar month. The obvious
implementation is a cron job that resets everybody on the 1st. It is also a
million-row `UPDATE` on the 1st of every month, a brief outage every month, and
a schema that has to store "when was this user last reset?"

Instead, usage is keyed by `(user_id, YYYY-MM)`. October's allowance is a
different row from September's. A new month starts a fresh budget because a new
row appears — no job, no reset column, no mass write. History is preserved
rather than overwritten, and the cost of "resetting" a user is one index lookup.

### Bundle selection is deterministic, and it is a domain rule

When several bundles could pay, Chat picks by:

1. most remaining messages (`NULL` = unlimited = infinitely many, so Enterprise wins)
2. then latest end date
3. then lowest id, purely to break exact ties

`remainingMessages ?? Infinity` is why Enterprise sorts first without a special
case: unlimited genuinely beats any finite number, and the sort says so.

This lives in `ChatQuotaPolicy.chooseBundle`, not in a SQL `ORDER BY` that only
one adapter would honour, and not in the controller. It is unit-testable
without a database.

### Cancellation is a transition, not a deletion

`cancel()` sets status to `cancelled`, turns off `autoRenew`, and stamps
`cancelledAt` — and then stops. The billing period is untouched. The user keeps
the messages they paid for until the window they already bought runs out, and
every consumed message stays attributed to the bundle that paid for it.

Nothing is deleted, ever. Usage history is the product's memory; a cancel button
that erases it is a data-loss bug wearing a feature's clothes.

`isServing()` is what encodes the nuance: a cancelled subscription is still
"serving" while `period.contains(now)`, because the access was prepaid. Renewal
is separately refused because `isDueForRenewal` requires `status.isActive()`.

### Renewal is idempotent by construction

Three mechanisms stack:

1. The aggregate refuses to renew unless `autoRenew` is on, the status permits
   the transition, and the new period *continues* the old one
   (`nextPeriod.startsAt(this.period.end)`). A replayed renewal cannot skip or
   duplicate a period.
2. The payment gateway keys outcomes on `subscriptionId:renewalDate`, so a retry
   for the same period returns the original result rather than charging again.
3. The write is guarded by an optimistic `revision`. If a sibling won the race,
   zero rows update and the loser reports `skipped` instead of clobbering.

Renewal also works as an explicit operation, not only as a timer:
`POST /subscriptions/:id/renew` is the same code path the scheduler uses.

### AI failure does not silently eat quota

The reservation pattern is: reserve → call AI outside any transaction → confirm
or release. If the provider throws, the reservation is released and the user is
made whole. If the process dies between reserve and confirm, the row stays
`pending` rather than silently decrementing, which is a known and deliberate
limitation (see [known limits](#trade-offs-and-known-limits)).

---

## Quotas, locks, and the deliberate absence of a message queue

### The bug underneath all quota systems

Nearly every interesting quota bug is the same bug in a trench coat. A user has
three free messages left. Two requests arrive at the same instant. Both read
`3`. Both conclude they are permitted. Both write `2`. The user gets four free
messages, and PostgreSQL cheerfully stores a lie.

The tempting cure is a lock. The *lazy* cure is a queue, on the reasoning that if
messages flow through a pipeline, the pipeline will sort it out. Those are not
the same instrument, and only one of them is the right size for this problem.

### Why the database arbitrates

Exactly one thing is guaranteed to be shared by every concurrent request: the
row. Not the Node process, which we will eventually run more than one of. Not a
JavaScript variable, which is single-threaded and instantly irrelevant the moment
there are two instances. Not a cache, which is allowed to be wrong by definition.
The row is the only shared truth we have, so the row is where the argument gets
settled.

Two tools, because the two quota paths have genuinely different shapes.

**Free quota needs no lock at all.** One statement:

```sql
INSERT INTO free_quota_usage (user_id, month_key, used_count)
VALUES ($1, $2, 1)
ON CONFLICT (user_id, month_key) DO UPDATE
  SET used_count = free_quota_usage.used_count + 1
  WHERE free_quota_usage.used_count < 3
RETURNING user_id;
```

The conditional `WHERE` inside `DO UPDATE` is the entire concurrency story. At
three, the update matches zero rows, `RETURNING` yields nothing, and the adapter
reports "not reserved". There is no read-then-write window, because there is no
read. PostgreSQL takes and drops a row lock inside the statement, and the caller
never needs to know.

**Paid quota genuinely needs a lock**, because consuming a message is a
read-modify-write against a value the application must first *decide* on.
`tryReserveOneMessage` opens a short transaction, selects the eligible
subscription `FOR UPDATE`, rehydrates the aggregate, lets the domain enforce
`consumeMessage()`, writes the decrement under the conditions it just checked,
and inserts a `subscription_reservations` row — committed together or not at
all. The `SELECT … FOR UPDATE` is what serialises two callers who picked the
same bundle a millisecond apart, so the eleventh concurrent request against a
ten-message Basic bundle blocks, wakes up, sees zero, and declines.

The concurrency test is the proof rather than the promise: eleven simultaneous
reservations against a ten-message Basic subscription, exactly ten succeed.

### The transaction boundary is a scalpel, not a fist

A transaction promises that nothing outside it can observe a half-finished
state. It is not a licence to hold the database hostage while you go and think.

This constraint shapes the whole chat flow. The AI provider is a port, and
behind it sits a mock with configurable latency. So quota is reserved in a
short transaction, **the AI call happens with no transaction open at all**, and
a second short transaction either confirms the reservation alongside the stored
answer or releases it as compensation. Hold the lock across the AI call and you
have built a queue: a slow provider becomes serialised requests, a
connection-pool bottleneck, and a throughput ceiling invisible from application
code. The renewal charge gets the same treatment, with a stable idempotency key
so a retry can never bill a period twice.

Writes outside the reservation path use optimistic locking instead: every state
change bumps `revision`, the update is guarded by `WHERE id = ? AND revision = ?`,
and zero rows updated means someone else moved first.

`UnitOfWork` is the seam that makes this expressible. It hands repositories
either the ambient transaction or the base pool, and nested `runInTransaction`
calls join the enclosing transaction rather than opening a second one — so
`tryReserveOneMessage` and the repository inside it share one boundary without
either knowing the other exists.

### Why there is no queue

Redis, BullMQ, Kafka, and RabbitMQ are all excellent tools. None of them are
required to make this system correct, and adding one would make it *worse* in a
specific way: it would move the correctness argument from somewhere we can prove
— a transaction, a row lock, a concurrency test — to somewhere we could only
assert.

A queue earns its keep when work is slow, unbounded, and independently retryable
at volume. Renewal is none of those. It is a small, bounded, idempotent scan
over a partial index, and the honest way to run it is a boring interval:

```ts
this.timer = setInterval(() => void this.run(), intervalMs);
this.timer.unref();
```

with a re-entrancy guard so a slow scan cannot overlap itself, plus
`POST /subscriptions/renewals/process-due` for operators who would rather not
wait for the next tick. `unref()` keeps the timer from holding the process open.

That is deliberately under-engineered. A broker here would buy throughput nobody
needs, cost an operational dependency and a new failure mode, and let a reviewer
rightly ask which of the two systems is now enforcing the quota rule.

### What would change our mind

- **Multiple application instances** — replace the interval with a
  `SELECT … FOR UPDATE SKIP LOCKED` claim so only one process renews per period.
- **A real payment provider with multi-second latency or webhook retries** — a
  genuine external dependency with genuine retry semantics; an outbox table
  starts earning its write amplification.
- **Free quota that one conditional upsert can no longer express** — e.g.
  batched consumption per request rather than per message.
- **Thousands of requests per second on a single hot bundle** — contention on
  one subscription row becomes the bottleneck and quota sharding is the answer.

Until one of those is true, the transaction is the right amount of machinery.

---

## Testing

| Suite | Command | Needs a database? |
| ----- | ------- | ----------------- |
| Unit and adapter | `npm run test` | No |
| Database-backed HTTP | `npm run test:e2e` | Yes |
| Concurrency | `npm run test:postgres` | Yes, opt-in |

Unit tests live in `src/modules/*/tests/`, never beside the code they test, and
import only inward-facing modules — the domain is importable with no NestJS, no
Drizzle, and no network. They cover Chat quota decisions, message creation,
quota compensation, Subscription lifecycle and cancellation, Enterprise
unlimited behaviour, calendar billing periods, bundle selection, renewal
success and failure, and domain errors.

The PostgreSQL suites are opt-in so a contributor without a database can still
run everything else:

```sh
RUN_POSTGRES_INTEGRATION=1 npm run test:postgres
```

Both concurrency tests are real contention, not a simulation: eleven concurrent
reservations against a ten-message Basic bundle, and concurrent free-period
reservations against a three-message allowance.

---

## Trade-offs and known limits

Stated plainly, because a reviewer should not have to find these.

- **No authentication.** `userId` is a caller-supplied string validated only as
  non-empty. Any client can read or mutate any user's subscriptions. Correct for
  a test backend; a real deployment needs auth and a derived identity.
- **The renewal scheduler is per-process.** Every instance scans and bills.
  Correctness survives it — renewal is idempotent and the optimistic revision
  rejects losers — but the work is duplicated rather than coordinated. Run one
  instance, or add a `SKIP LOCKED` claim first.
- **Payment idempotency is process-local.** `SimulatedPaymentGateway` memoises
  outcomes in a `Map`. A restart forgets them. A real gateway must honour the
  `subscriptionId:renewalDate` key durably; the port is shaped so swapping the
  adapter is the only change required.
- **A reservation stuck in `pending` is not reclaimed.** If the process dies
  between reserving and confirming, that message stays consumed with a pending
  reservation. A production build wants a reaper or a lease timeout.
- **Domain events are in-process and best-effort.** They are published to a
  logging adapter. Nothing subscribes durably, and nothing survives a restart.
- **The e2e suite assumes a low-latency database.** Each paid chat request
  makes roughly fifteen round trips. Against a remote pooler that measured ~6s
  per request here, which exceeds the timeouts on the larger scenarios. Run it
  against a local or in-region PostgreSQL.
- **`subscription_bundles` is retained.** The legacy table is still declared so
  the migration history stays coherent and the original data is not destroyed.
  Nothing reads or writes it at runtime.
- **No Docker, no Redis, no broker.** Deliberate. Supabase is the only external
  service, and the reason is in [the section above](#why-there-is-no-queue).

---

## Layout at a glance

```
src/
  main.ts                     bootstrap
  app.module.ts               Persistence + Subscriptions + Chat
  modules/
    chat/
      domain/                 chat-message, chat-quota-policy, monthly-period, message-quota
      application/            ask-question.use-case, ports/
      infrastructure/         drizzle adapters, mock-openai.provider, schema
      presentation/           controller, zod pipe, error filter
      tests/
    subscriptions/
      domain/                 subscription, plan, cycle, period, money, quota, status, policy
      application/            use cases, subscription-renewer, ports/
      infrastructure/         drizzle adapters, simulated payment, renewal scheduler
      presentation/           controller, error filter
      tests/
  shared/
    domain/                   clock, id-generator, domain-event
    application/              domain-event-publisher port
    infrastructure/           database, unit-of-work, time, events
    presentation/             zod-validation.pipe
drizzle/                      four migrations + journal
test/                         app.e2e-spec.ts
```
