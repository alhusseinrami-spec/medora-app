-- A pro forma made on the order page keeps its number (PF-2026-0008).
ALTER TABLE "shop_order_documents" ADD COLUMN "number" TEXT NOT NULL DEFAULT '';
