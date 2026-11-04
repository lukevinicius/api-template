-- Orders closed before the deferred settlement were always settled on closing
UPDATE "orders"
SET "paid_out_amount" = "payout_amount", "settled_at" = "closed_at"
WHERE "status" = 'CLOSED';
--> statement-breakpoint
-- Payouts made on closing become payout records
INSERT INTO "order_payouts" ("id", "order_id", "paid_by_id", "method", "amount", "pix_key", "created_at")
SELECT gen_random_uuid()::text, o."id", coalesce(o."closed_by_id", o."opened_by_id"),
  coalesce(o."payout_method", 'CASH'), o."payout_amount",
  CASE WHEN o."payout_method" = 'PIX' THEN c."pix_key" END,
  coalesce(o."closed_at", o."updated_at")
FROM "orders" o
INNER JOIN "clients" c ON c."id" = o."client_id"
WHERE o."status" = 'CLOSED' AND o."payout_amount" > 0;
--> statement-breakpoint
-- Ledger of the cashier with the history so far: it all goes to the first
-- cash closing. Canceled and deleted orders never moved money.
INSERT INTO "cash_movements" ("id", "type", "method", "amount", "order_id", "user_id", "created_at")
SELECT gen_random_uuid()::text, 'SALE'::"cash_movement_type", NULL::"payment_method", i."total", i."order_id", i."added_by_id", i."created_at"
FROM "order_items" i
INNER JOIN "orders" o ON o."id" = i."order_id"
WHERE o."status" <> 'CANCELED' AND o."deleted_at" IS NULL AND i."total" <> 0
UNION ALL
SELECT gen_random_uuid()::text, 'PAYMENT'::"cash_movement_type", p."method", p."amount", p."order_id", p."received_by_id", p."created_at"
FROM "order_payments" p
INNER JOIN "orders" o ON o."id" = p."order_id"
WHERE o."status" <> 'CANCELED' AND o."deleted_at" IS NULL AND p."amount" <> 0
UNION ALL
SELECT gen_random_uuid()::text, 'CHIP_RETURN'::"cash_movement_type", NULL::"payment_method", o."returned_amount", o."id", o."closed_by_id", coalesce(o."closed_at", o."updated_at")
FROM "orders" o
WHERE o."status" = 'CLOSED' AND o."deleted_at" IS NULL AND o."returned_amount" > 0
UNION ALL
SELECT gen_random_uuid()::text, 'FEE'::"cash_movement_type", NULL::"payment_method", o."fee_amount", o."id", o."closed_by_id", coalesce(o."closed_at", o."updated_at")
FROM "orders" o
WHERE o."status" = 'CLOSED' AND o."deleted_at" IS NULL AND o."fee_amount" > 0
UNION ALL
SELECT gen_random_uuid()::text, 'PAYOUT'::"cash_movement_type", p."method"::text::"payment_method", p."amount", p."order_id", p."paid_by_id", p."created_at"
FROM "order_payouts" p
INNER JOIN "orders" o ON o."id" = p."order_id"
WHERE o."deleted_at" IS NULL;
