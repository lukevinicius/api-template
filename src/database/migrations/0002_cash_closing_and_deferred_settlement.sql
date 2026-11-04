CREATE TYPE "public"."cash_movement_type" AS ENUM('SALE', 'PAYMENT', 'CHIP_RETURN', 'FEE', 'PAYOUT');--> statement-breakpoint
ALTER TYPE "public"."audit_entity" ADD VALUE 'CASH_CLOSING';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'AWAITING_SETTLEMENT';--> statement-breakpoint
CREATE TABLE "cash_closings" (
	"id" text PRIMARY KEY NOT NULL,
	"code" integer GENERATED ALWAYS AS IDENTITY (sequence name "cash_closings_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"closed_by_id" text NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp NOT NULL,
	"movements_count" integer NOT NULL,
	"sales_amount" integer NOT NULL,
	"sales_paid_amount" integer NOT NULL,
	"sales_on_credit_amount" integer NOT NULL,
	"previous_credit_received_amount" integer NOT NULL,
	"received_cash" integer NOT NULL,
	"received_pix" integer NOT NULL,
	"received_chips" integer NOT NULL,
	"chips_returned_amount" integer NOT NULL,
	"fee_amount" integer NOT NULL,
	"payout_cash" integer NOT NULL,
	"payout_pix" integer NOT NULL,
	"receivables_amount" integer NOT NULL,
	"receivables_count" integer NOT NULL,
	"pending_payouts_amount" integer NOT NULL,
	"pending_payouts_count" integer NOT NULL,
	"opening_cash" integer NOT NULL,
	"expected_cash" integer NOT NULL,
	"counted_cash" integer NOT NULL,
	"cash_difference" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cash_closings_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "cash_movement_type" NOT NULL,
	"method" "payment_method",
	"amount" integer NOT NULL,
	"order_id" text NOT NULL,
	"user_id" text,
	"cash_closing_id" text,
	"created_at" timestamp DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"paid_by_id" text NOT NULL,
	"method" "payout_method" NOT NULL,
	"amount" integer NOT NULL,
	"pix_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_out_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "settled_at" timestamp;--> statement-breakpoint
ALTER TABLE "cash_closings" ADD CONSTRAINT "cash_closings_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_closing_id_cash_closings_id_fk" FOREIGN KEY ("cash_closing_id") REFERENCES "public"."cash_closings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payouts" ADD CONSTRAINT "order_payouts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payouts" ADD CONSTRAINT "order_payouts_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_movements_cash_closing_id_idx" ON "cash_movements" USING btree ("cash_closing_id");--> statement-breakpoint
CREATE INDEX "cash_movements_order_id_idx" ON "cash_movements" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "cash_movements_open_idx" ON "cash_movements" USING btree ("created_at") WHERE "cash_movements"."cash_closing_id" is null;--> statement-breakpoint
CREATE INDEX "order_payouts_order_id_idx" ON "order_payouts" USING btree ("order_id");