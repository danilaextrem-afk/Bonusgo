ALTER TABLE "payments" ADD COLUMN "checkout_key" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "checkout_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_company_checkout_key" ON "payments" USING btree ("company_id","checkout_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_platega_ref" ON "payments" USING btree ("provider_ref") WHERE "payments"."provider" = 'platega' AND "payments"."provider_ref" IS NOT NULL;