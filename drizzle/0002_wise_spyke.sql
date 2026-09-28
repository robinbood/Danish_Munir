ALTER TABLE "chat_messages" ADD COLUMN "quota_subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "renewal_date" timestamp with time zone;--> statement-breakpoint
UPDATE "subscriptions" SET "renewal_date" = "period_end" WHERE "renewal_date" IS NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "renewal_date" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_messages_user_created_idx" ON "chat_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "subscription_reservations_subscription_status_idx" ON "subscription_reservations" USING btree ("subscription_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_user_status_period_idx" ON "subscriptions" USING btree ("user_id","status","period_end");--> statement-breakpoint
CREATE INDEX "subscriptions_due_renewals_idx" ON "subscriptions" USING btree ("period_end") WHERE "subscriptions"."status" = 'active' and "subscriptions"."auto_renew" = true;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_tokens_nonnegative" CHECK ("chat_messages"."tokens_used" >= 0);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_quota_kind_valid" CHECK ("chat_messages"."quota_kind" in ('free', 'bundle'));--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_quota_limit_nonnegative" CHECK ("chat_messages"."quota_limit" is null or "chat_messages"."quota_limit" >= 0);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_free_quota_valid" CHECK ("chat_messages"."quota_kind" <> 'free' or ("chat_messages"."quota_limit" = 3 and "chat_messages"."quota_subscription_id" is null));--> statement-breakpoint
ALTER TABLE "free_quota_usage" ADD CONSTRAINT "free_quota_usage_nonnegative" CHECK ("free_quota_usage"."used_count" >= 0);--> statement-breakpoint
ALTER TABLE "free_quota_usage" ADD CONSTRAINT "free_quota_usage_month_format" CHECK ("free_quota_usage"."month_key" ~ '^\d{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "subscription_reservations" ADD CONSTRAINT "subscription_reservations_status_valid" CHECK ("subscription_reservations"."status" in ('pending', 'confirmed', 'released'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_valid" CHECK ("subscriptions"."plan" in ('basic', 'pro', 'enterprise'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_cycle_valid" CHECK ("subscriptions"."cycle" in ('monthly', 'yearly'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_status_valid" CHECK ("subscriptions"."status" in ('active', 'cancelled', 'expired'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_period_valid" CHECK ("subscriptions"."period_end" > "subscriptions"."period_start");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_renewal_matches_period_end" CHECK ("subscriptions"."renewal_date" = "subscriptions"."period_end");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_price_nonnegative" CHECK ("subscriptions"."price_amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_quota_valid" CHECK ((
    ("subscriptions"."plan" = 'enterprise' and "subscriptions"."quota_limit" is null and "subscriptions"."quota_remaining" is null)
    or ("subscriptions"."plan" = 'basic' and "subscriptions"."quota_limit" = 10 and "subscriptions"."quota_remaining" between 0 and 10)
    or ("subscriptions"."plan" = 'pro' and "subscriptions"."quota_limit" = 100 and "subscriptions"."quota_remaining" between 0 and 100)
  ));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_terminal_no_renewal" CHECK ("subscriptions"."status" = 'active' or "subscriptions"."auto_renew" = false);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_cancelled_at_valid" CHECK (("subscriptions"."status" = 'cancelled') = ("subscriptions"."cancelled_at" is not null));