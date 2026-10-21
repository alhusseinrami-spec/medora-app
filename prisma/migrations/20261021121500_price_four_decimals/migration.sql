-- Unit prices keep 4 decimals (items sold by the piece, like 0.3375). Widening only: no value changes.
ALTER TABLE "products" ALTER COLUMN "price" SET DATA TYPE DECIMAL(14,4);
ALTER TABLE "sales_order_lines" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "requestedPrice" SET DATA TYPE DECIMAL(14,4);
