ALTER TABLE "payments" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "grace_applied" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "prev_plan" "plan";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "prev_plan_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payer_inn" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payer_name" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "npd_receipt_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "npd_error" text;