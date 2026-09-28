CREATE TABLE "subscription_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"plan" varchar(32) NOT NULL,
	"cycle" varchar(16) NOT NULL,
	"status" varchar(16) NOT NULL,
	"quota_limit" integer,
	"quota_remaining" integer,
	"price_amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"auto_renew" boolean NOT NULL,
	"cancelled_at" timestamp with time zone,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "quota_limit" integer;--> statement-breakpoint
ALTER TABLE "subscription_reservations" ADD CONSTRAINT "subscription_reservations_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "subscriptions" (
	"id", "user_id", "plan", "cycle", "status", "quota_limit", "quota_remaining",
	"price_amount_minor", "currency", "period_start", "period_end", "auto_renew",
	"cancelled_at", "revision", "created_at"
)
SELECT
	bundle."id",
	bundle."user_id",
	bundle."plan",
	'monthly',
	CASE
		WHEN bundle."status" = 'cancelled' THEN 'cancelled'
		WHEN bundle."status" = 'active' AND COALESCE(bundle."end_date", bundle."created_at" + interval '1 month') > now() THEN 'active'
		ELSE 'expired'
	END,
	CASE bundle."plan" WHEN 'enterprise' THEN NULL WHEN 'pro' THEN 100 ELSE 10 END,
	CASE bundle."plan"
		WHEN 'enterprise' THEN NULL
		WHEN 'pro' THEN LEAST(100, GREATEST(COALESCE(bundle."remaining_messages", 100), 0))
		ELSE LEAST(10, GREATEST(COALESCE(bundle."remaining_messages", 10), 0))
	END,
	CASE bundle."plan" WHEN 'enterprise' THEN 9900 WHEN 'pro' THEN 2900 ELSE 900 END,
	'USD',
	COALESCE(bundle."end_date" - interval '1 month', bundle."created_at"),
	COALESCE(bundle."end_date", bundle."created_at" + interval '1 month'),
	false,
	CASE WHEN bundle."status" = 'cancelled' THEN bundle."updated_at" ELSE NULL END,
	0,
	bundle."created_at"
FROM "subscription_bundles" AS bundle
WHERE bundle."plan" IN ('basic', 'pro', 'enterprise')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
WITH duplicate_usage AS (
	SELECT "user_id", "month_key", MIN("id"::text)::uuid AS "keep_id", SUM("used_count")::integer AS "used_count"
	FROM "free_quota_usage"
	GROUP BY "user_id", "month_key"
	HAVING COUNT(*) > 1
), merged_usage AS (
	UPDATE "free_quota_usage" AS usage
	SET "used_count" = duplicate_usage."used_count", "updated_at" = now()
	FROM duplicate_usage
	WHERE usage."id" = duplicate_usage."keep_id"
	RETURNING usage."user_id", usage."month_key"
)
DELETE FROM "free_quota_usage" AS duplicate
USING duplicate_usage, merged_usage
WHERE duplicate."user_id" = duplicate_usage."user_id"
	AND duplicate."month_key" = duplicate_usage."month_key"
	AND duplicate."id" <> duplicate_usage."keep_id";--> statement-breakpoint
CREATE UNIQUE INDEX "free_quota_usage_user_month_unique" ON "free_quota_usage" USING btree ("user_id","month_key");--> statement-breakpoint