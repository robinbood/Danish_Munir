# GGI Backend

NestJS modular monolith for AI chat and paid message subscriptions. The application uses TypeScript, PostgreSQL/Supabase, and Drizzle ORM. Bun is used for the documented package commands; the current `start:prod` script launches the emitted application with Node.

## Setup

Install dependencies and configure `.env`:

```sh
bun install
```

```dotenv
DATABASE_URL=postgresql://...
PORT=3000
PAYMENT_FAILURE_RATE=0.1
AI_RESPONSE_LATENCY_MS=100
```

`DATABASE_URL` must point to the Supabase PostgreSQL connection string. The application connects through `postgres` and Drizzle; it does not use the Supabase client SDK. Use a connection string appropriate to the environment and pool mode. Payment failures default to a 10% simulated chance and can be set to `0` or `1` for deterministic local behavior.

The initial migration uses `CREATE TABLE IF NOT EXISTS` so Drizzle can establish its migration journal against an existing database that already has the original Chat tables. The follow-on migration creates Subscription-owned tables, backfills legacy bundle rows into the Subscription aggregate table while retaining the original table, merges duplicate free-usage periods without losing their summed usage, and preserves the free-usage primary key.

After reviewing the migration for your target database, apply it with:

```sh
bunx drizzle-kit migrate
```

## Commands

```sh
bun run start:dev
bun run build
bun run start:prod
bun run test
bun run test:e2e
bun run lint
bun run lint:fast
bun run format
```

The PostgreSQL concurrency test is opt-in and requires the migration to be applied to a dedicated test database:

```powershell
$env:RUN_POSTGRES_INTEGRATION = "1"
bun run test:postgres
```

Use a non-production database for integration tests. Test rows use generated IDs and are cleaned up after each test.

## Architecture

The application has two bounded contexts under `src/modules`:

- **Chat** owns question/answer orchestration, message history, token usage, the three-message calendar-month free allowance, quota errors, bundle selection, and the mock AI adapter.
- **Subscriptions** owns Basic/Pro/Enterprise plans, billing periods, prices, paid quota state, payment simulation, renewal, expiration, cancellation, and usage reservations.

Each context separates `presentation`, `application`, `domain`, and `infrastructure`. Controllers map HTTP requests to use cases. Use cases coordinate ports and aggregates. Domain models are framework- and persistence-independent. Drizzle repositories are infrastructure adapters.

Chat depends on the Subscriptions context only through its application-facing `SubscriptionCapacity` contract. Chat selects the eligible bundle with the most remaining quota, then latest end date and stable ID as tie-breakers. Subscriptions locks and updates only the selected aggregate inside a short PostgreSQL transaction. Chat never queries Subscription tables or repositories directly.

The Subscription aggregate protects lifecycle and quota transitions. Value objects represent billing cycle/period, money, status, and message quota. Domain events are in-process values published through a small outbound port; no broker or queue is required.

The persisted Subscription row includes tier, billing cycle, status, quota limit/remaining, price, currency, period start/end, explicit `renewal_date` (constrained to the period end), auto-renewal, cancellation time, and optimistic revision. Chat messages retain question/answer/tokens, free-or-paid quota metadata, month key, and the paid Subscription ID when a bundle was consumed. Database checks enforce supported tiers/cycles/statuses, plan-specific quota bounds, valid month keys, and nonnegative counters; indexes support message history and due-renewal scans.

## Quotas and transactions

Free usage is keyed by `(user_id, YYYY-MM)`, so a new month starts a fresh allowance without a reset job. A unique database index and conditional atomic upsert prevent simultaneous requests from exceeding the three free messages.

Paid reservations lock the chosen subscription row, mutate the aggregate, and record a reservation in one transaction. The AI call happens after reservation and outside every database transaction. If the AI or final persistence fails, the reservation is compensated; successful answer persistence and paid-reservation confirmation share a short transaction.

Subscription updates use optimistic revision checks. Renewal payment calls happen outside database transactions and receive a stable idempotency key derived from subscription ID and renewal date. The simulated gateway retains outcomes for process-local retries; a real gateway must honor the same idempotency key durably.

Cancellation disables future renewal but preserves service until the paid billing period ends and keeps quota/reservation history. Renewal advances the calendar billing period and resets its quota only after successful simulated payment; failed payment expires the subscription.

## Verification and trade-offs

Unit tests live in `src/modules/chat/tests` and `src/modules/subscriptions/tests`, never beside domain or infrastructure code. They cover Chat quota decisions, message creation, quota compensation, Subscription lifecycle, Enterprise unlimited quota, calendar billing, and renewal success/failure. Opt-in PostgreSQL integration tests exercise concurrent free and paid reservations; they are skipped unless explicitly enabled. The e2e suite exercises both module controllers with stubbed use cases and does not replace the PostgreSQL tests.

The e2e suite exercises both module controllers with stubbed use cases; it does not replace the opt-in PostgreSQL tests. Full database-backed HTTP tests for every lifecycle scenario remain a coverage gap. The renewal scheduler is a simple in-process interval, so multi-instance deployments should ensure only one process runs it or add a database-backed claim/lease before scaling horizontally.