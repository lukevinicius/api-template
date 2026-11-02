CREATE TYPE "public"."audit_action" AS ENUM('LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'PASSWORD_CHANGE', 'STOCK_ADD', 'STOCK_REMOVE', 'ITEM_ADD', 'ITEM_UPDATE', 'ITEM_REMOVE', 'PAYMENT', 'CHIP_RETURN', 'PAYOUT', 'CLOSE', 'CANCEL');--> statement-breakpoint
CREATE TYPE "public"."audit_entity" AS ENUM('AUTH', 'USER', 'CLIENT', 'CHIP', 'ORDER', 'EXCHANGE', 'SETTINGS');--> statement-breakpoint
CREATE TYPE "public"."exchange_direction" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."exchange_status" AS ENUM('DONE', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('OPEN', 'CLOSED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'PIX', 'CHIPS');--> statement-breakpoint
CREATE TYPE "public"."payout_method" AS ENUM('CASH', 'PIX');--> statement-breakpoint
CREATE TYPE "public"."pix_key_type" AS ENUM('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'SELLER');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" "audit_action" NOT NULL,
	"entity" "audit_entity" NOT NULL,
	"entity_id" text,
	"description" text NOT NULL,
	"metadata" jsonb,
	"ip" text,
	"created_at" timestamp DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chips" (
	"id" text PRIMARY KEY NOT NULL,
	"price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"image_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"document" text,
	"phone" text,
	"pix_key" text,
	"pix_key_type" "pix_key_type",
	"chip_limit" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "exchange_items" (
	"id" text PRIMARY KEY NOT NULL,
	"exchange_id" text NOT NULL,
	"chip_id" text NOT NULL,
	"direction" "exchange_direction" NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"total" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchanges" (
	"id" text PRIMARY KEY NOT NULL,
	"code" integer GENERATED ALWAYS AS IDENTITY (sequence name "exchanges_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_id" text,
	"created_by_id" text NOT NULL,
	"canceled_by_id" text,
	"status" "exchange_status" DEFAULT 'DONE' NOT NULL,
	"total" integer NOT NULL,
	"notes" text,
	"canceled_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "exchanges_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "order_chip_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"chip_id" text NOT NULL,
	"received_by_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"total" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"chip_id" text NOT NULL,
	"added_by_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"total" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "order_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"received_by_id" text NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" integer NOT NULL,
	"received_amount" integer NOT NULL,
	"change_amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"code" integer GENERATED ALWAYS AS IDENTITY (sequence name "orders_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_id" text NOT NULL,
	"opened_by_id" text NOT NULL,
	"closed_by_id" text,
	"status" "order_status" DEFAULT 'OPEN' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"returned_amount" integer DEFAULT 0 NOT NULL,
	"fee_rate" integer,
	"fee_amount" integer DEFAULT 0 NOT NULL,
	"payout_amount" integer DEFAULT 0 NOT NULL,
	"payout_method" "payout_method",
	"notes" text,
	"closed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"replaced_by_id" text,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"fee_rate" integer DEFAULT 1000 NOT NULL,
	"chip_limit" integer DEFAULT 5000000 NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" "user_role" DEFAULT 'SELLER' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_items" ADD CONSTRAINT "exchange_items_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_items" ADD CONSTRAINT "exchange_items_chip_id_chips_id_fk" FOREIGN KEY ("chip_id") REFERENCES "public"."chips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_canceled_by_id_users_id_fk" FOREIGN KEY ("canceled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_chip_returns" ADD CONSTRAINT "order_chip_returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_chip_returns" ADD CONSTRAINT "order_chip_returns_chip_id_chips_id_fk" FOREIGN KEY ("chip_id") REFERENCES "public"."chips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_chip_returns" ADD CONSTRAINT "order_chip_returns_received_by_id_users_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_chip_id_chips_id_fk" FOREIGN KEY ("chip_id") REFERENCES "public"."chips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_received_by_id_users_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_opened_by_id_users_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chips_price_unique" ON "chips" USING btree ("price") WHERE "chips"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "clients_name_idx" ON "clients" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_document_unique" ON "clients" USING btree ("document") WHERE "clients"."deleted_at" is null and "clients"."document" is not null;--> statement-breakpoint
CREATE INDEX "exchange_items_exchange_id_idx" ON "exchange_items" USING btree ("exchange_id");--> statement-breakpoint
CREATE INDEX "exchanges_client_id_idx" ON "exchanges" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "order_chip_returns_order_id_idx" ON "order_chip_returns" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_chip_returns_chip_id_idx" ON "order_chip_returns" USING btree ("chip_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_chip_id_idx" ON "order_items" USING btree ("chip_id");--> statement-breakpoint
CREATE INDEX "order_payments_order_id_idx" ON "order_payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_client_id_idx" ON "orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens" USING btree ("family_id");